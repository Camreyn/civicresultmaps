import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
  buildTexasPrecinctExecutionContext,
  validateTexasPrecinctGisClient,
} from "./lib/tx-precinct-gis-db.mjs";
import { buildTexasPrecinctGisPlan } from "./lib/tx-precinct-gis-plan.mjs";
import { productionEndpointFingerprint } from "./lib/tx-precinct-production-preflight.mjs";
import {
  buildTexasPublicationAuthorizationTemplate,
  inspectTexasPublicationPlan,
  semanticallyEqual,
  serializeTexasPublicationDocument,
  sha256,
  validateTexasPublicationAuthorization,
} from "./lib/tx-precinct-publication.mjs";

function parseArguments(args) {
  const read = (name) => args.find((arg) => arg.startsWith(name + "="))
    ?.slice(name.length + 1);
  const parsed = {
    packagePath: read("--package"),
    packageSha256: read("--package-sha256"),
    hiddenReceiptPath: read("--hidden-receipt"),
    hiddenReceiptSha256: read("--hidden-receipt-sha256"),
    blobEvidencePath: read("--blob-evidence"),
    blobEvidenceSha256: read("--blob-evidence-sha256"),
    planSha256: read("--plan-sha256"),
    authorizationPath: read("--authorization"),
    authorizationSha256: read("--authorization-sha256"),
    outputPath: read("--output"),
    writePlan: args.includes("--write-plan"),
    writeAuthorizationTemplate: args.includes("--write-authorization-template"),
    apply: args.includes("--apply"),
    recoverReceipt: args.includes("--recover-receipt"),
  };
  const allowed = new Set([
    "--package",
    "--package-sha256",
    "--hidden-receipt",
    "--hidden-receipt-sha256",
    "--blob-evidence",
    "--blob-evidence-sha256",
    "--plan-sha256",
    "--authorization",
    "--authorization-sha256",
    "--output",
  ]);
  for (const arg of args) {
    if (
      ![
        "--write-plan",
        "--write-authorization-template",
        "--apply",
        "--recover-receipt",
      ].includes(arg)
      && ![...allowed].some((name) => arg.startsWith(name + "="))
    ) {
      throw new Error("Unknown Texas publication-status option: " + arg);
    }
  }
  const modes = [
    parsed.writePlan,
    parsed.writeAuthorizationTemplate,
    parsed.apply,
    parsed.recoverReceipt,
  ]
    .filter(Boolean).length;
  if (modes > 1) throw new Error("Texas publication-status modes are mutually exclusive");
  for (const field of [
    "packagePath",
    "packageSha256",
    "hiddenReceiptPath",
    "hiddenReceiptSha256",
    "blobEvidencePath",
    "blobEvidenceSha256",
  ]) {
    if (!parsed[field]) throw new Error("Texas publication-status requires " + field);
  }
  return parsed;
}

function safeJson(root, relativePath, expectedSha256, allowedRoot) {
  if (
    typeof relativePath !== "string"
    || !relativePath.startsWith(allowedRoot + "/")
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || path.isAbsolute(relativePath)
    || !relativePath.endsWith(".json")
    || !/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")
  ) {
    throw new Error("Texas publication-status JSON path is unsafe");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolute.startsWith(allowed + path.sep) || !existsSync(absolute)) {
    throw new Error("Texas publication-status JSON is missing");
  }
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("Texas publication-status JSON SHA-256 drifted");
  }
  return {
    path: relativePath,
    absolute,
    bytes,
    sha256: expectedSha256,
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function immutableJson(root, relativePath, value, allowedRoot) {
  if (
    typeof relativePath !== "string"
    || !relativePath.startsWith(allowedRoot + "/")
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || path.isAbsolute(relativePath)
    || !relativePath.endsWith(".json")
  ) {
    throw new Error("Texas publication-status output path is unsafe");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("Texas publication-status output escapes its fixed root");
  }
  const bytes = serializeTexasPublicationDocument(value);
  if (existsSync(absolute)) {
    if (!readFileSync(absolute).equals(bytes)) {
      throw new Error("Refusing to overwrite different Texas publication evidence");
    }
    return { path: relativePath, sha256: sha256(bytes), byteCount: bytes.length };
  }
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes, { flag: "wx", mode: 0o600 });
  return { path: relativePath, sha256: sha256(bytes), byteCount: bytes.length };
}

function productionUrl(environment = process.env) {
  const first = environment.POSTGRES_URL_NON_POOLING;
  const second = environment.POSTGRES_DATABASE_URL_UNPOOLED;
  if (first && second && first !== second) {
    throw new Error("Production unpooled URL variables disagree");
  }
  const value = first ?? second;
  if (!value) throw new Error("Production unpooled database URL is unavailable");
  return value;
}

function currentGitSha(root) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Texas publication checkout HEAD is invalid");
  }
  const trackedStatus = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  ).trim();
  if (trackedStatus) {
    throw new Error("Texas publication checkout has tracked changes");
  }
  return sha;
}

function expectedActivationMetadata(context, manifest, previousCaveat, revision) {
  return {
    activationId: context.authorization.activationId,
    activationCandidateSha256: context.planSha256,
    releasePackageSha256: context.plan.releaseCandidate.sha256,
    blobPublicationSha256: context.plan.blobPublication.sha256,
    deliveryOrigin: context.plan.blobPublication.deliveryOrigin,
    authorizationSha256: context.authorizationSha256,
    mode: "publish",
    year: manifest.year,
    manifestId: manifest.manifestId,
    publicManifestSha256: manifest.publicManifestSha256,
    delivery: manifest.delivery,
    previousCaveat,
    changedAtUtc: context.changedAtUtc,
    revision,
  };
}

async function verifyPostconditions(tx, context, revision) {
  const versions = await tx.unsafe([
    "select e.year,gv.status,gv.caveat,gv.metadata",
    "from geography_versions gv join elections e on e.id=gv.election_id",
    "where gv.state_code='TX' and gv.geography_type='precinct'",
    " and gv.metadata->'releaseCandidate'->>'sha256'=$1",
    "order by e.year",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (versions.length !== 4) {
    throw new Error("Texas publication postcondition has an incomplete version set");
  }
  for (const [index, row] of versions.entries()) {
    const manifest = context.plan.manifests[index];
    const previousCaveat = context.gisPlan.years[index].manifest.validation.errors
      .join(" ");
    const metadata = row.metadata ?? {};
    if (
      Number(row.year) !== manifest.year
      || row.status !== "published"
      || metadata.manifestId !== manifest.manifestId
      || metadata.publicDeliveryAuthorized !== true
      || metadata.releaseCandidate?.publicDeliveryAuthorized !== true
      || metadata.releaseCandidate?.sha256 !== context.plan.releaseCandidate.sha256
      || !semanticallyEqual(
        metadata.publicActivation,
        expectedActivationMetadata(
          context,
          manifest,
          previousCaveat,
          revision,
        ),
      )
    ) {
      throw new Error("Texas " + manifest.year + " geography publication drifted");
    }
  }
  const linked = await tx.unsafe([
    "select count(*)::int total,",
    " count(*) filter (where x.relationship_type='one_to_one'",
    "  and x.match_method='official_crosswalk' and x.review_status='reviewed'",
    "  and x.confidence='high' and x.metadata->>'publicDeliveryAuthorized'='true'",
    "  and x.metadata->'releaseCandidate'->>'publicDeliveryAuthorized'='true')::int exact",
    "from reporting_unit_geometry_crosswalks x",
    "join geography_versions gv on gv.id=x.geometry_version_id",
    "where gv.state_code='TX' and gv.metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (Number(linked[0]?.total) !== 36_762 || Number(linked[0]?.exact) !== 36_762) {
    throw new Error("Texas publication crosswalk postcondition failed");
  }
  const units = await tx.unsafe([
    "select count(*)::int total, count(*) filter (where",
    " metadata->>'publicDeliveryAuthorized'='true' and",
    " metadata->'releaseCandidate'->>'publicDeliveryAuthorized'='true')::int exact",
    "from reporting_units where state_code='TX' and reporting_grain='precinct'",
    " and metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (Number(units[0]?.total) !== 36_762 || Number(units[0]?.exact) !== 36_762) {
    throw new Error("Texas publication reporting-unit postcondition failed");
  }
  const sources = await tx.unsafe([
    "select count(*)::int total, count(*) filter (where",
    " metadata->>'publicDeliveryAuthorized'='true' and",
    " metadata->'releaseCandidate'->>'publicDeliveryAuthorized'='true')::int exact",
    "from source_documents where state_code='TX'",
    " and metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (Number(sources[0]?.total) !== 8 || Number(sources[0]?.exact) !== 8) {
    throw new Error("Texas publication source-document postcondition failed");
  }
  const runs = await tx.unsafe([
    "select count(*)::int total, count(*) filter (where",
    " summary->>'publicDeliveryAuthorized'='true' and",
    " summary->'releaseCandidate'->>'publicDeliveryAuthorized'='true')::int exact",
    "from import_runs where state_code='TX'",
    " and summary->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (Number(runs[0]?.total) !== 4 || Number(runs[0]?.exact) !== 4) {
    throw new Error("Texas publication import-run postcondition failed");
  }
  const results = await tx.unsafe([
    "select count(*)::int total from result_rows rr",
    "join reporting_units ru on ru.id=rr.reporting_unit_id",
    "where rr.state_code='TX' and rr.level='precinct'",
    " and ru.metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (Number(results[0]?.total) !== 110_286) {
    throw new Error("Texas publication result-row postcondition failed");
  }
  const invalid = await tx.unsafe(
    "select count(*)::int count from pg_constraint where connamespace='public'::regnamespace and not convalidated",
  );
  if (Number(invalid[0]?.count) !== 0) {
    throw new Error("Texas publication left invalid public constraints");
  }
  return {
    geographyVersions: 4,
    crosswalks: 36_762,
    reportingUnits: 36_762,
    sourceDocuments: 8,
    importRuns: 4,
    resultRows: 110_286,
    invalidConstraints: 0,
  };
}

export async function applyTexasGeographyPublicationTransaction(tx, context) {
  const identity = await tx.unsafe([
    "select current_database() database_name,",
    " current_setting('transaction_read_only') transaction_read_only",
  ].join("\n"));
  if (
    identity.length !== 1
    || String(identity[0].database_name) !== context.plan.hiddenLoad.databaseName
    || String(identity[0].transaction_read_only) !== "off"
  ) {
    throw new Error("Texas publication transaction database identity drifted");
  }
  await tx.unsafe("select set_config('lock_timeout','30s',true)");
  await tx.unsafe(
    "select pg_advisory_xact_lock(hashtextextended('crm-tx-precinct-gis-release-v1',0))",
  );
  const revisions = await tx.unsafe(
    "select revision::int revision from public_data_revisions where scope='public' for update",
  );
  if (revisions.length !== 1) throw new Error("Texas public revision is missing");
  const revision = Number(revisions[0].revision) + 1;
  const gisPlan = context.gisPlan;
  await validateTexasPrecinctGisClient(tx, gisPlan, {
    executionContext: context.executionContext,
    readOnlySession: false,
  });
  const versions = await tx.unsafe([
    "select gv.id,e.year,gv.status,gv.caveat,gv.metadata",
    "from geography_versions gv join elections e on e.id=gv.election_id",
    "where gv.state_code='TX' and gv.geography_type='precinct'",
    " and gv.metadata->'releaseCandidate'->>'sha256'=$1",
    "order by e.year for update of gv",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (versions.length !== 4) {
    throw new Error("Texas publication requires four blocked geography versions");
  }
  for (const [index, version] of versions.entries()) {
    const manifest = context.plan.manifests[index];
    const expectedBlockedCaveat = gisPlan.years[index].manifest.validation.errors
      .join(" ");
    if (
      Number(version.year) !== manifest.year
      || version.status !== "blocked"
      || version.metadata?.manifestId !== manifest.manifestId
      || version.metadata?.manifestSha256 !== manifest.blockedManifestSha256
      || version.metadata?.publicDeliveryAuthorized !== false
      || version.metadata?.releaseCandidate?.publicDeliveryAuthorized !== false
      || version.metadata?.releaseCandidate?.sha256 !== context.plan.releaseCandidate.sha256
      || String(version.caveat ?? "") !== expectedBlockedCaveat
      || Object.hasOwn(version.metadata ?? {}, "publicActivation")
    ) {
      throw new Error("Texas " + manifest.year + " publication precondition drifted");
    }
    const activation = expectedActivationMetadata(
      context,
      manifest,
      expectedBlockedCaveat,
      revision,
    );
    const updated = await tx.unsafe([
      "update geography_versions set status='published',",
      " caveat=$2,",
      " metadata=jsonb_set(jsonb_set(metadata,",
      "  '{publicDeliveryAuthorized}','true'::jsonb,true),",
      "  '{releaseCandidate,publicDeliveryAuthorized}','true'::jsonb,true)",
      "  || jsonb_build_object('publicActivation',$3::text::jsonb),",
      " updated_at=now() where id=$1::uuid and status='blocked' returning id",
    ].join("\n"), [
      version.id,
      "Reviewed Texas VTD / precinct-approximation geometry is publicly authorized under activation "
        + context.authorization.activationId + ".",
      JSON.stringify(activation),
    ]);
    if (updated.length !== 1) {
      throw new Error("Texas " + manifest.year + " publication update lost its lock");
    }
  }
  const crosswalks = await tx.unsafe([
    "update reporting_unit_geometry_crosswalks x set metadata=",
    " jsonb_set(jsonb_set(x.metadata,'{publicDeliveryAuthorized}','true'::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}','true'::jsonb,true)",
    "from geography_versions gv where gv.id=x.geometry_version_id",
    " and gv.state_code='TX' and gv.metadata->'releaseCandidate'->>'sha256'=$1",
    "returning x.id",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (crosswalks.length !== 36_762) {
    throw new Error("Texas publication crosswalk update count drifted");
  }
  const units = await tx.unsafe([
    "update reporting_units set metadata=",
    " jsonb_set(jsonb_set(metadata,'{publicDeliveryAuthorized}','true'::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}','true'::jsonb,true)",
    "where state_code='TX' and reporting_grain='precinct'",
    " and metadata->'releaseCandidate'->>'sha256'=$1 returning id",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (units.length !== 36_762) {
    throw new Error("Texas publication reporting-unit update count drifted");
  }
  const sources = await tx.unsafe([
    "update source_documents set metadata=",
    " jsonb_set(jsonb_set(metadata,'{publicDeliveryAuthorized}','true'::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}','true'::jsonb,true)",
    "where state_code='TX' and metadata->'releaseCandidate'->>'sha256'=$1 returning id",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (sources.length !== 8) {
    throw new Error("Texas publication source-document update count drifted");
  }
  const runs = await tx.unsafe([
    "update import_runs set summary=",
    " jsonb_set(jsonb_set(summary,'{publicDeliveryAuthorized}','true'::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}','true'::jsonb,true)",
    "where state_code='TX' and summary->'releaseCandidate'->>'sha256'=$1 returning id",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (runs.length !== 4) {
    throw new Error("Texas publication import-run update count drifted");
  }
  const revisionRows = await tx.unsafe([
    "update public_data_revisions set revision=revision+1,updated_at=now(),reason=$1",
    "where scope='public' returning revision::int revision,updated_at",
  ].join("\n"), [
    "Texas precinct geometry publish " + context.authorization.activationId,
  ]);
  if (Number(revisionRows[0]?.revision) !== revision) {
    throw new Error("Texas publication revision increment drifted");
  }
  const postconditions = await verifyPostconditions(tx, context, revision);
  return {
    result: "PUBLISHED",
    revision,
    changedAtUtc: context.changedAtUtc,
    postconditions,
  };
}

function defaultPlanPath(planSha256) {
  return ".etl/precinct-publication-plans/TX/tx-publication-plan-"
    + planSha256.slice(0, 12) + ".json";
}

function defaultAuthorizationPath(planSha256) {
  return ".etl/production-authorizations/TX/tx-publication-authorization-template-"
    + planSha256.slice(0, 12) + ".json";
}

function defaultReceiptPath(planSha256, activationId) {
  const safeId = activationId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return ".etl/production-publication-receipts/TX/tx-publication-"
    + planSha256.slice(0, 12) + "-" + safeId + ".json";
}

function reserveReceipt(
  root,
  relativePath,
  planSha256,
  authorizationSha256,
  options = {},
) {
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", "production-publication-receipts", "TX");
  if (!absolute.startsWith(allowed + path.sep) || !relativePath.endsWith(".json")) {
    throw new Error("Texas publication receipt path is unsafe");
  }
  if (existsSync(absolute)) throw new Error("Texas publication receipt already exists");
  mkdirSync(path.dirname(absolute), { recursive: true });
  const pending = absolute + ".pending";
  const pendingDocument = {
    schemaVersion: 1,
    state: "TX",
    purpose: "ambiguous-commit recovery marker",
    planSha256,
    authorizationSha256,
  };
  const pendingBytes = serializeTexasPublicationDocument(pendingDocument);
  if (existsSync(pending)) {
    if (
      options.allowExisting === true
      && readFileSync(pending).equals(pendingBytes)
    ) {
      return { absolute, pending, pendingBytes, disposition: "reused" };
    }
    throw new Error("A Texas publication recovery marker already exists; reconcile it before retrying");
  }
  writeFileSync(pending, pendingBytes, { flag: "wx", mode: 0o600 });
  return { absolute, pending, pendingBytes, disposition: "created" };
}

function finishPublicationReceipt(reservation, receipt) {
  const receiptBytes = serializeTexasPublicationDocument(receipt);
  const temporary = reservation.absolute + ".write-"
    + sha256(receiptBytes).slice(0, 12) + ".tmp";
  if (existsSync(temporary)) {
    if (!readFileSync(temporary).equals(receiptBytes)) {
      throw new Error("Texas publication receipt temporary file drifted");
    }
  } else {
    writeFileSync(temporary, receiptBytes, { flag: "wx", mode: 0o600 });
  }
  renameSync(temporary, reservation.absolute);
  if (readFileSync(reservation.pending).equals(reservation.pendingBytes)) {
    unlinkSync(reservation.pending);
  }
  return receiptBytes;
}

export async function runTexasGeographyPublication(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = options.packagePath ? options : parseArguments(process.argv.slice(2));
  const built = inspectTexasPublicationPlan({ ...parsed, root });
  if (parsed.planSha256 && parsed.planSha256 !== built.sha256) {
    throw new Error("Texas publication plan SHA-256 drifted");
  }
  if (parsed.writePlan) {
    const artifact = immutableJson(
      root,
      parsed.outputPath ?? defaultPlanPath(built.sha256),
      built.plan,
      ".etl/precinct-publication-plans/TX",
    );
    return {
      mode: "write_plan",
      decision: built.plan.decision,
      publicationPlan: artifact,
      productionMutationPerformed: false,
    };
  }
  if (parsed.writeAuthorizationTemplate) {
    const artifact = immutableJson(
      root,
      parsed.outputPath ?? defaultAuthorizationPath(built.sha256),
      buildTexasPublicationAuthorizationTemplate(built.plan, built.sha256),
      ".etl/production-authorizations/TX",
    );
    return {
      mode: "write_authorization_template",
      decision: "NO_GO_PUBLIC",
      publicationPlanSha256: built.sha256,
      authorizationTemplate: artifact,
      productionMutationPerformed: false,
    };
  }
  if (!parsed.apply && !parsed.recoverReceipt) {
    return {
      mode: "plan",
      decision: built.plan.decision,
      publicationPlanSha256: built.sha256,
      productionMutationPerformed: false,
      expectedTotals: built.plan.expectedTotals,
    };
  }
  const authorizationArtifact = safeJson(
    root,
    parsed.authorizationPath,
    parsed.authorizationSha256,
    ".etl/production-authorizations/TX",
  );
  const environment = options.environment ?? process.env;
  const clock = options.nowFactory ?? (() => options.now ?? new Date());
  const currentTime = () => {
    const value = clock();
    const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(result.getTime())) {
      throw new Error("Texas publication clock returned an invalid time");
    }
    return result;
  };
  const validateAuthorizationAt = (now) => validateTexasPublicationAuthorization(
    authorizationArtifact.value,
    { plan: built.plan, planSha256: built.sha256, now: now.getTime() },
  );
  const databaseUrl = productionUrl(environment);
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  if (endpointFingerprint !== built.plan.hiddenLoad.endpointFingerprint) {
    throw new Error("Texas publication database endpoint drifted from the hidden load");
  }
  const gisPlan = await buildTexasPrecinctGisPlan({ root });
  const executionContext = {
    mode: "production_release",
    releasePackageSha256: built.plan.releaseCandidate.sha256,
    releaseCandidateId: built.plan.releaseCandidate.id,
    databaseName: built.plan.hiddenLoad.databaseName,
    productionReleaseAudit: built.plan.hiddenLoad.productionReleaseAudit,
  };
  buildTexasPrecinctExecutionContext(executionContext);
  const rawActivationId = typeof authorizationArtifact.value?.activationId === "string"
    ? authorizationArtifact.value.activationId.trim()
    : "";
  const receiptPath = parsed.outputPath ?? defaultReceiptPath(
    built.sha256,
    rawActivationId || "invalid-activation",
  );

  const receiptDocument = (authorization, committed, recovery = null) => ({
    schemaVersion: 1,
    state: "TX",
    decision: "PUBLISHED",
    activationId: authorization.activationId,
    approvedBy: authorization.approvedBy,
    releaseCandidate: built.plan.releaseCandidate,
    publicationPlan: {
      id: built.plan.id,
      sha256: built.sha256,
    },
    authorization: {
      path: authorizationArtifact.path,
      sha256: authorizationArtifact.sha256,
    },
    hiddenLoad: {
      path: built.plan.hiddenLoad.path,
      sha256: built.plan.hiddenLoad.sha256,
    },
    blobPublication: {
      path: built.plan.blobPublication.path,
      sha256: built.plan.blobPublication.sha256,
      deliveryOrigin: built.plan.blobPublication.deliveryOrigin,
    },
    productionDeployment: authorization.productionDeployment,
    changedAtUtc: committed.changedAtUtc,
    revision: committed.revision,
    postconditions: committed.postconditions,
    ...(recovery ? { recovery } : {}),
    productionMutationPerformed: true,
    publicDeliveryAuthorized: true,
  });

  if (parsed.recoverReceipt) {
    if (
      environment.CRM_DATABASE_ENVIRONMENT !== "production-read-only"
      || environment.CRM_TX_PRECINCT_PUBLICATION_RECEIPT_RECOVERY !== built.sha256
      || environment.CRM_TX_PRECINCT_PUBLICATION_AUTHORIZATION_SHA256
        !== authorizationArtifact.sha256
    ) {
      throw new Error("Texas publication receipt recovery is not explicitly read-only and hash-authorized");
    }
    const reservation = reserveReceipt(
      root,
      receiptPath,
      built.sha256,
      authorizationArtifact.sha256,
      { allowExisting: true },
    );
    let sql;
    try {
      sql = (options.postgresFactory ?? postgres)(databaseUrl, {
        max: 1,
        connect_timeout: 10,
        idle_timeout: 20,
        connection: {
          application_name: "civicresultmaps-tx-precinct-publication-receipt-recovery",
          default_transaction_read_only: true,
        },
      });
    } catch (error) {
      if (reservation.disposition === "created" && existsSync(reservation.pending)) {
        unlinkSync(reservation.pending);
      }
      throw error;
    }
    let recovered;
    try {
      recovered = await sql.begin("read only", async (tx) => {
        const identity = await tx.unsafe([
          "select current_database() database_name,",
          " current_setting('transaction_read_only') transaction_read_only",
        ].join("\n"));
        if (
          identity.length !== 1
          || String(identity[0].database_name) !== built.plan.hiddenLoad.databaseName
          || String(identity[0].transaction_read_only) !== "on"
        ) {
          throw new Error("Texas publication receipt recovery database identity drifted");
        }
        const versions = await tx.unsafe([
          "select e.year,gv.metadata from geography_versions gv",
          "join elections e on e.id=gv.election_id",
          "where gv.state_code='TX' and gv.geography_type='precinct'",
          " and gv.metadata->'releaseCandidate'->>'sha256'=$1 order by e.year",
        ].join("\n"), [built.plan.releaseCandidate.sha256]);
        if (versions.length !== 4) {
          throw new Error("Texas publication receipt recovery found an incomplete version set");
        }
        const firstActivation = versions[0]?.metadata?.publicActivation;
        const changedAtUtc = firstActivation?.changedAtUtc;
        const revision = Number(firstActivation?.revision);
        const recoveryNow = currentTime();
        if (
          typeof changedAtUtc !== "string"
          || Number.isNaN(Date.parse(changedAtUtc))
          || Date.parse(changedAtUtc) > recoveryNow.getTime()
          || !Number.isInteger(revision)
          || revision < 1
        ) {
          throw new Error("Texas publication receipt recovery activation metadata is incomplete");
        }
        const authorization = validateAuthorizationAt(new Date(changedAtUtc));
        if (currentGitSha(root) !== authorization.productionDeployment.gitSha) {
          throw new Error("Texas publication recovery checkout does not match the verified deployment");
        }
        const context = {
          plan: built.plan,
          planSha256: built.sha256,
          authorization,
          authorizationSha256: authorizationArtifact.sha256,
          changedAtUtc,
          gisPlan,
          executionContext,
        };
        const postconditions = await verifyPostconditions(tx, context, revision);
        const revisionRows = await tx.unsafe([
          "select revision::int revision,reason from public_data_revisions",
          "where scope='public'",
        ].join("\n"));
        if (
          Number(revisionRows[0]?.revision) !== revision
          || String(revisionRows[0]?.reason)
            !== "Texas precinct geometry publish " + authorization.activationId
        ) {
          throw new Error("Texas publication receipt recovery public revision drifted");
        }
        return { authorization, changedAtUtc, revision, postconditions };
      });
    } catch (error) {
      if (reservation.disposition === "created" && existsSync(reservation.pending)) {
        unlinkSync(reservation.pending);
      }
      throw error;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const receipt = receiptDocument(recovered.authorization, recovered, {
      recoveredAtUtc: currentTime().toISOString(),
      productionMutationPerformed: false,
    });
    const receiptBytes = finishPublicationReceipt(reservation, receipt);
    return {
      mode: "recover_receipt",
      decision: "RECOVERED_PUBLICATION_RECEIPT",
      activationId: recovered.authorization.activationId,
      revision: recovered.revision,
      productionMutationPerformed: false,
      publicDeliveryAuthorized: true,
      receipt: {
        path: receiptPath,
        sha256: sha256(receiptBytes),
        byteCount: receiptBytes.length,
      },
    };
  }

  const initialNow = currentTime();
  const authorization = validateAuthorizationAt(initialNow);
  if (
    environment.CRM_DATABASE_ENVIRONMENT !== "production"
    || environment.CRM_TX_PRECINCT_PUBLICATION_WRITES
      !== "I_ACKNOWLEDGE_ATOMIC_TEXAS_PRECINCT_PUBLIC_CUTOVER"
    || environment.CRM_TX_PRECINCT_PUBLICATION_PACKAGE_SHA256
      !== built.plan.releaseCandidate.sha256
    || environment.CRM_TX_PRECINCT_PUBLICATION_PLAN_SHA256 !== built.sha256
    || environment.CRM_TX_PRECINCT_PUBLICATION_AUTHORIZATION_SHA256
      !== authorizationArtifact.sha256
    || environment.CRM_TX_PRECINCT_PUBLICATION_ACTIVATION_ID
      !== authorization.activationId
  ) {
    throw new Error("Texas public cutover is not explicitly hash-authorized");
  }
  if (currentGitSha(root) !== authorization.productionDeployment.gitSha) {
    throw new Error("Texas publication checkout does not match the verified deployment");
  }
  const reservation = reserveReceipt(
    root,
    receiptPath,
    built.sha256,
    authorizationArtifact.sha256,
  );
  let sql;
  try {
    sql = (options.postgresFactory ?? postgres)(databaseUrl, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 20,
      connection: { application_name: "civicresultmaps-tx-precinct-publication-status" },
    });
  } catch (error) {
    if (existsSync(reservation.pending)) unlinkSync(reservation.pending);
    throw error;
  }
  let transactionBodyCompleted = false;
  let committed;
  try {
    committed = await sql.begin(async (tx) => {
      const transactionNow = currentTime();
      const finalAuthorization = validateAuthorizationAt(transactionNow);
      if (
        finalAuthorization.activationId !== authorization.activationId
        || currentGitSha(root) !== finalAuthorization.productionDeployment.gitSha
      ) {
        throw new Error("Texas publication authorization or checkout drifted before the transaction");
      }
      const result = await applyTexasGeographyPublicationTransaction(tx, {
        plan: built.plan,
        planSha256: built.sha256,
        authorization: finalAuthorization,
        authorizationSha256: authorizationArtifact.sha256,
        changedAtUtc: transactionNow.toISOString(),
        gisPlan,
        executionContext,
      });
      transactionBodyCompleted = true;
      return result;
    });
  } catch (error) {
    if (!transactionBodyCompleted && existsSync(reservation.pending)) {
      unlinkSync(reservation.pending);
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
  const receipt = receiptDocument(authorization, committed);
  const receiptBytes = finishPublicationReceipt(reservation, receipt);
  return {
    mode: "apply",
    decision: "PUBLISHED",
    activationId: authorization.activationId,
    revision: committed.revision,
    productionMutationPerformed: true,
    publicDeliveryAuthorized: true,
    receipt: {
      path: receiptPath,
      sha256: sha256(receiptBytes),
      byteCount: receiptBytes.length,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTexasGeographyPublication().then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}

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
  buildMaineLocalExecutionContext,
  validateMaineLocalGisClient,
} from "./lib/me-local-gis-db.mjs";
import { buildMaineLocalGisPlan } from "./lib/me-local-gis-plan.mjs";
import { productionEndpointFingerprint } from "./lib/me-local-production-preflight.mjs";
import {
  MAINE_PUBLIC_ROLLBACK_SCOPES,
  buildMainePublicRollbackAuthorizationTemplate,
  buildMainePublicationAuthorizationTemplate,
  inspectMainePublicationPlan,
  semanticallyEqual,
  serializeMainePublicationDocument,
  sha256,
  validateMainePublicRollbackAuthorization,
  validateMainePublicationAuthorization,
} from "./lib/me-local-publication.mjs";

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
    publicationReceiptPath: read("--publication-receipt"),
    publicationReceiptSha256: read("--publication-receipt-sha256"),
    outputPath: read("--output"),
    writePlan: args.includes("--write-plan"),
    writeAuthorizationTemplate: args.includes("--write-authorization-template"),
    apply: args.includes("--apply"),
    recoverReceipt: args.includes("--recover-receipt"),
    rollback: args.includes("--rollback"),
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
    "--publication-receipt",
    "--publication-receipt-sha256",
    "--output",
  ]);
  for (const arg of args) {
    if (
      ![
        "--write-plan",
        "--write-authorization-template",
        "--apply",
        "--recover-receipt",
        "--rollback",
      ].includes(arg)
      && ![...allowed].some((name) => arg.startsWith(name + "="))
    ) {
      throw new Error("Unknown Maine publication-status option: " + arg);
    }
  }
  const modes = [
    parsed.writePlan,
    parsed.writeAuthorizationTemplate,
    parsed.apply,
    parsed.recoverReceipt,
  ]
    .filter(Boolean).length;
  if (modes > 1) throw new Error("Maine publication-status modes are mutually exclusive");
  for (const field of [
    "packagePath",
    "packageSha256",
    "hiddenReceiptPath",
    "hiddenReceiptSha256",
    "blobEvidencePath",
    "blobEvidenceSha256",
  ]) {
    if (!parsed[field]) throw new Error("Maine publication-status requires " + field);
  }
  if (
    parsed.rollback
    && (!parsed.publicationReceiptPath || !parsed.publicationReceiptSha256)
  ) {
    throw new Error("Maine rollback requires the exact publication receipt and SHA-256");
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
    throw new Error("Maine publication-status JSON path is unsafe");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolute.startsWith(allowed + path.sep) || !existsSync(absolute)) {
    throw new Error("Maine publication-status JSON is missing");
  }
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("Maine publication-status JSON SHA-256 drifted");
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
    throw new Error("Maine publication-status output path is unsafe");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolute.startsWith(allowed + path.sep)) {
    throw new Error("Maine publication-status output escapes its fixed root");
  }
  const bytes = serializeMainePublicationDocument(value);
  if (existsSync(absolute)) {
    if (!readFileSync(absolute).equals(bytes)) {
      throw new Error("Refusing to overwrite different Maine publication evidence");
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

function runGit(root, args, runner = execFileSync) {
  return runner("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

export function verifyMainePublicationGitCandidate(
  root,
  publicAuthorization,
  runner = execFileSync,
) {
  let head;
  let headTree;
  let productionTree;
  let rollbackTree;
  let trackedStatus;
  try {
    head = runGit(root, ["rev-parse", "HEAD"], runner);
    headTree = runGit(root, ["rev-parse", "HEAD^{tree}"], runner);
    productionTree = runGit(
      root,
      ["rev-parse", `${publicAuthorization.productionDeployment.gitSha}^{tree}`],
      runner,
    );
    rollbackTree = runGit(
      root,
      ["rev-parse", `${publicAuthorization.rollbackTarget.gitSha}^{tree}`],
      runner,
    );
    trackedStatus = runGit(
      root,
      ["status", "--porcelain", "--untracked-files=no"],
      runner,
    );
  } catch {
    throw new Error("Maine publication Git evidence could not be resolved locally");
  }
  if (
    head !== publicAuthorization.productionDeployment.gitSha
    || headTree !== publicAuthorization.productionDeployment.gitTreeSha
    || productionTree !== publicAuthorization.productionDeployment.gitTreeSha
    || rollbackTree !== publicAuthorization.rollbackTarget.gitTreeSha
    || trackedStatus
  ) {
    throw new Error("Maine publication checkout or deployment Git evidence drifted");
  }
  return {
    gitSha: head,
    gitTreeSha: headTree,
    rollbackTarget: {
      gitSha: publicAuthorization.rollbackTarget.gitSha,
      gitTreeSha: rollbackTree,
    },
    trackedWorktreeClean: true,
  };
}

function expectedActivationMetadata(
  context,
  manifest,
  previousCaveat,
  revision,
  changedAtUtc = context.changedAtUtc,
) {
  const publication = context.publicationReceipt ?? {
    activationId: context.authorization.activationId,
    authorizationSha256: context.authorizationSha256,
    rollbackTarget: context.authorization.rollbackTarget,
  };
  return {
    activationId: publication.activationId,
    activationCandidateSha256: context.planSha256,
    releasePackageSha256: context.plan.releaseCandidate.sha256,
    blobPublicationSha256: context.plan.blobPublication.sha256,
    deliveryOrigin: context.plan.blobPublication.deliveryOrigin,
    authorizationSha256: publication.authorizationSha256,
    rollbackTarget: publication.rollbackTarget,
    mode: "publish",
    year: manifest.year,
    manifestId: manifest.manifestId,
    publicManifestSha256: manifest.publicManifestSha256,
    delivery: manifest.delivery,
    previousCaveat,
    changedAtUtc,
    revision,
  };
}

function expectedRollbackMetadata(context, revision) {
  return {
    rollbackId: context.authorization.rollbackId,
    publicationActivationId: context.publicationReceipt.activationId,
    activationCandidateSha256: context.planSha256,
    releasePackageSha256: context.plan.releaseCandidate.sha256,
    blobPublicationSha256: context.plan.blobPublication.sha256,
    authorizationSha256: context.authorizationSha256,
    publicationReceiptSha256: context.publicationReceipt.sha256,
    rollbackTarget: context.authorization.applicationRollback.target,
    changedAtUtc: context.changedAtUtc,
    revision,
    mode: "rollback",
  };
}

async function verifyPostconditions(
  nv,
  context,
  revision,
  mode = context.mode ?? "publish",
) {
  const publicAuthorized = mode === "publish";
  const wantedStatus = publicAuthorized ? "published" : "blocked";
  const versions = await nv.unsafe([
    "select e.year,gv.status,gv.caveat,gv.metadata",
    "from geography_versions gv join elections e on e.id=gv.election_id",
    "where gv.state_code='ME' and gv.geography_type='local_reporting_unit'",
    " and gv.metadata->'releaseCandidate'->>'sha256'=$1",
    "order by e.year",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (versions.length !== 3) {
    throw new Error("Maine publication postcondition has an incomplete version set");
  }
  for (const [index, row] of versions.entries()) {
    const manifest = context.plan.manifests[index];
    const previousCaveat = context.gisPlan.years[index].manifest.validation.errors
      .join(" ");
    const metadata = row.metadata ?? {};
    const publicationRevision = context.publicationReceipt?.revision ?? revision;
    const publicationChangedAt = context.publicationReceipt?.changedAtUtc
      ?? context.changedAtUtc;
    const originalActivation = expectedActivationMetadata(
      context,
      manifest,
      previousCaveat,
      publicationRevision,
      publicationChangedAt,
    );
    const expectedActivation = publicAuthorized
      ? originalActivation
      : {
        ...originalActivation,
        rollback: expectedRollbackMetadata(context, revision),
      };
    const expectedCaveat = publicAuthorized
      ? "Reviewed Maine election-specific local reporting geometry is publicly authorized under activation "
        + originalActivation.activationId + "."
      : previousCaveat;
    if (
      Number(row.year) !== manifest.year
      || row.status !== wantedStatus
      || String(row.caveat ?? "") !== expectedCaveat
      || metadata.manifestId !== manifest.manifestId
      || metadata.publicDeliveryAuthorized !== publicAuthorized
      || metadata.releaseCandidate?.publicDeliveryAuthorized !== publicAuthorized
      || metadata.releaseCandidate?.sha256 !== context.plan.releaseCandidate.sha256
      || !semanticallyEqual(metadata.publicActivation, expectedActivation)
    ) {
      throw new Error("Maine " + manifest.year + " geography publication drifted");
    }
  }
  const linked = await nv.unsafe([
    "select count(*)::int total,",
    " count(*) filter (where x.relationship_type='one_to_one'",
    "  and x.match_method in ('exact_official_id','official_crosswalk')",
    "  and x.review_status='reviewed'",
    "  and x.confidence='high' and x.metadata->>'publicDeliveryAuthorized'=$2",
    "  and x.metadata->'releaseCandidate'->>'publicDeliveryAuthorized'=$2)::int exact",
    "from reporting_unit_geometry_crosswalks x",
    "join geography_versions gv on gv.id=x.geometry_version_id",
    "where gv.state_code='ME' and gv.metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256, String(publicAuthorized)]);
  if (Number(linked[0]?.total) !== 1_542 || Number(linked[0]?.exact) !== 1_542) {
    throw new Error("Maine publication crosswalk postcondition failed");
  }
  const units = await nv.unsafe([
    "select count(*)::int total, count(*) filter (where",
    " metadata->>'publicDeliveryAuthorized'=$2 and",
    " metadata->'releaseCandidate'->>'publicDeliveryAuthorized'=$2)::int exact",
    "from reporting_units where state_code='ME' and reporting_grain='local_reporting_unit'",
    " and metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256, String(publicAuthorized)]);
  if (Number(units[0]?.total) !== 1_542 || Number(units[0]?.exact) !== 1_542) {
    throw new Error("Maine publication reporting-unit postcondition failed");
  }
  const sources = await nv.unsafe([
    "select count(*)::int total, count(*) filter (where",
    " metadata->>'publicDeliveryAuthorized'=$2 and",
    " metadata->'releaseCandidate'->>'publicDeliveryAuthorized'=$2)::int exact",
    "from source_documents where state_code='ME'",
    " and metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256, String(publicAuthorized)]);
  if (Number(sources[0]?.total) !== 6 || Number(sources[0]?.exact) !== 6) {
    throw new Error("Maine publication source-document postcondition failed");
  }
  const runs = await nv.unsafe([
    "select count(*)::int total, count(*) filter (where",
    " summary->>'publicDeliveryAuthorized'=$2 and",
    " summary->'releaseCandidate'->>'publicDeliveryAuthorized'=$2)::int exact",
    "from import_runs where state_code='ME'",
    " and summary->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256, String(publicAuthorized)]);
  if (Number(runs[0]?.total) !== 3 || Number(runs[0]?.exact) !== 3) {
    throw new Error("Maine publication import-run postcondition failed");
  }
  const results = await nv.unsafe([
    "select count(*)::int total from result_rows rr",
    "join reporting_units ru on ru.id=rr.reporting_unit_id",
    "where rr.state_code='ME' and rr.level='local_reporting_unit'",
    " and ru.metadata->'releaseCandidate'->>'sha256'=$1",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (Number(results[0]?.total) !== 4_626) {
    throw new Error("Maine publication result-row postcondition failed");
  }
  const invalid = await nv.unsafe(
    "select count(*)::int count from pg_constraint where connamespace='public'::regnamespace and not convalidated",
  );
  if (Number(invalid[0]?.count) !== 0) {
    throw new Error("Maine publication left invalid public constraints");
  }
  const revisionRows = await nv.unsafe([
    "select revision::int revision,reason from public_data_revisions",
    "where scope='public'",
  ].join("\n"));
  const expectedReason = "Maine local reporting unit geometry " + mode + " "
    + (publicAuthorized
      ? context.authorization.activationId
      : context.authorization.rollbackId);
  if (
    Number(revisionRows[0]?.revision) !== revision
    || String(revisionRows[0]?.reason) !== expectedReason
  ) {
    throw new Error("Maine publication revision postcondition failed");
  }
  return {
    mode,
    status: wantedStatus,
    publicDeliveryAuthorized: publicAuthorized,
    geographyVersions: 3,
    crosswalks: 1_542,
    reportingUnits: 1_542,
    sourceDocuments: 6,
    importRuns: 3,
    resultRows: 4_626,
    invalidConstraints: 0,
  };
}

export async function applyMaineGeographyPublicationTransaction(nv, context) {
  const mode = context.mode ?? "publish";
  if (!new Set(["publish", "rollback"]).has(mode)) {
    throw new Error("Maine publication transaction mode is invalid");
  }
  const publicAuthorized = mode === "publish";
  if (mode === "rollback" && !context.publicationReceipt) {
    throw new Error("Maine rollback requires the exact publication receipt");
  }
  if (mode === "rollback" && (
    context.authorization.publicationActivationId
      !== context.publicationReceipt.activationId
    || !semanticallyEqual(
      context.authorization.applicationRollback?.target,
      context.publicationReceipt.rollbackTarget,
    )
  )) {
    throw new Error("Maine rollback authorization drifted from the publication receipt");
  }
  const identity = await nv.unsafe([
    "select current_database() database_name,",
    " current_setting('transaction_read_only') transaction_read_only",
  ].join("\n"));
  if (
    identity.length !== 1
    || String(identity[0].database_name) !== context.plan.hiddenLoad.databaseName
    || String(identity[0].transaction_read_only) !== "off"
  ) {
    throw new Error("Maine publication transaction database identity drifted");
  }
  await nv.unsafe("select set_config('lock_timeout','30s',true)");
  await nv.unsafe(
    "select pg_advisory_xact_lock(hashtextextended('crm-me-local-gis-release-v1',0))",
  );
  const revisions = await nv.unsafe(
    "select revision::int revision from public_data_revisions where scope='public' for update",
  );
  const currentRevision = Number(revisions[0]?.revision);
  if (
    revisions.length !== 1
    || !Number.isInteger(currentRevision)
    || currentRevision < 0
  ) {
    throw new Error("Maine public revision is missing or invalid");
  }
  const revision = currentRevision + 1;
  const gisPlan = context.gisPlan;
  if (mode === "publish") {
    await (context.validateCurrentDatabase ?? validateMaineLocalGisClient)(nv, gisPlan, {
      executionContext: context.executionContext,
      readOnlySession: false,
    });
  }
  const versions = await nv.unsafe([
    "select gv.id,e.year,gv.status,gv.caveat,gv.metadata",
    "from geography_versions gv join elections e on e.id=gv.election_id",
    "where gv.state_code='ME' and gv.geography_type='local_reporting_unit'",
    " and gv.metadata->'releaseCandidate'->>'sha256'=$1",
    "order by e.year for update of gv",
  ].join("\n"), [context.plan.releaseCandidate.sha256]);
  if (versions.length !== 3) {
    throw new Error("Maine publication requires three exact geography versions");
  }
  for (const [index, version] of versions.entries()) {
    const manifest = context.plan.manifests[index];
    const expectedBlockedCaveat = gisPlan.years[index].manifest.validation.errors
      .join(" ");
    const commonDrift = Number(version.year) !== manifest.year
      || version.metadata?.manifestId !== manifest.manifestId
      || version.metadata?.releaseCandidate?.sha256
        !== context.plan.releaseCandidate.sha256;
    const originalActivation = mode === "rollback"
      ? expectedActivationMetadata(
        context,
        manifest,
        expectedBlockedCaveat,
        context.publicationReceipt.revision,
        context.publicationReceipt.changedAtUtc,
      )
      : null;
    if (mode === "publish" && (
      commonDrift
      || version.status !== "blocked"
      || version.metadata?.manifestSha256 !== manifest.blockedManifestSha256
      || version.metadata?.publicDeliveryAuthorized !== false
      || version.metadata?.releaseCandidate?.publicDeliveryAuthorized !== false
      || String(version.caveat ?? "") !== expectedBlockedCaveat
      || Object.hasOwn(version.metadata ?? {}, "publicActivation")
    )) {
      throw new Error("Maine " + manifest.year + " publication precondition drifted");
    }
    if (mode === "rollback" && (
      commonDrift
      || version.status !== "published"
      || String(version.caveat ?? "")
        !== "Reviewed Maine election-specific local reporting geometry is publicly authorized under activation "
          + context.publicationReceipt.activationId + "."
      || version.metadata?.publicDeliveryAuthorized !== true
      || version.metadata?.releaseCandidate?.publicDeliveryAuthorized !== true
      || !semanticallyEqual(version.metadata?.publicActivation, originalActivation)
    )) {
      throw new Error(
        "Maine " + manifest.year
          + " rollback does not match the publication being reversed",
      );
    }
    const activation = mode === "publish"
      ? expectedActivationMetadata(
        context,
        manifest,
        expectedBlockedCaveat,
        revision,
      )
      : {
        ...originalActivation,
        rollback: expectedRollbackMetadata(context, revision),
      };
    const wantedStatus = publicAuthorized ? "published" : "blocked";
    const wantedCaveat = publicAuthorized
      ? "Reviewed Maine election-specific local reporting geometry is publicly authorized under activation "
        + context.authorization.activationId + "."
      : originalActivation.previousCaveat;
    const currentStatus = publicAuthorized ? "blocked" : "published";
    const updated = await nv.unsafe([
      "update geography_versions set status=$2,",
      " caveat=$3,",
      " metadata=jsonb_set(jsonb_set(jsonb_set(metadata,",
      "  '{publicDeliveryAuthorized}',$4::text::jsonb,true),",
      "  '{releaseCandidate,publicDeliveryAuthorized}',$4::text::jsonb,true),",
      "  '{publicActivation}',$5::text::jsonb,true),",
      " updated_at=now() where id=$1::uuid and status=$6 returning id",
    ].join("\n"), [
      version.id,
      wantedStatus,
      wantedCaveat,
      JSON.stringify(publicAuthorized),
      JSON.stringify(activation),
      currentStatus,
    ]);
    if (updated.length !== 1) {
      throw new Error("Maine " + manifest.year + " publication update lost its lock");
    }
  }
  const crosswalks = await nv.unsafe([
    "update reporting_unit_geometry_crosswalks x set metadata=",
    " jsonb_set(jsonb_set(x.metadata,'{publicDeliveryAuthorized}',$2::text::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}',$2::text::jsonb,true)",
    "from geography_versions gv where gv.id=x.geometry_version_id",
    " and gv.state_code='ME' and gv.metadata->'releaseCandidate'->>'sha256'=$1",
    "returning x.id",
  ].join("\n"), [context.plan.releaseCandidate.sha256, JSON.stringify(publicAuthorized)]);
  if (crosswalks.length !== 1_542) {
    throw new Error("Maine publication crosswalk update count drifted");
  }
  const units = await nv.unsafe([
    "update reporting_units set metadata=",
    " jsonb_set(jsonb_set(metadata,'{publicDeliveryAuthorized}',$2::text::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}',$2::text::jsonb,true)",
    "where state_code='ME' and reporting_grain='local_reporting_unit'",
    " and metadata->'releaseCandidate'->>'sha256'=$1 returning id",
  ].join("\n"), [context.plan.releaseCandidate.sha256, JSON.stringify(publicAuthorized)]);
  if (units.length !== 1_542) {
    throw new Error("Maine publication reporting-unit update count drifted");
  }
  const sources = await nv.unsafe([
    "update source_documents set metadata=",
    " jsonb_set(jsonb_set(metadata,'{publicDeliveryAuthorized}',$2::text::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}',$2::text::jsonb,true)",
    "where state_code='ME' and metadata->'releaseCandidate'->>'sha256'=$1 returning id",
  ].join("\n"), [context.plan.releaseCandidate.sha256, JSON.stringify(publicAuthorized)]);
  if (sources.length !== 6) {
    throw new Error("Maine publication source-document update count drifted");
  }
  const runs = await nv.unsafe([
    "update import_runs set summary=",
    " jsonb_set(jsonb_set(summary,'{publicDeliveryAuthorized}',$2::text::jsonb,true),",
    " '{releaseCandidate,publicDeliveryAuthorized}',$2::text::jsonb,true)",
    "where state_code='ME' and summary->'releaseCandidate'->>'sha256'=$1 returning id",
  ].join("\n"), [context.plan.releaseCandidate.sha256, JSON.stringify(publicAuthorized)]);
  if (runs.length !== 3) {
    throw new Error("Maine publication import-run update count drifted");
  }
  const revisionRows = await nv.unsafe([
    "update public_data_revisions set revision=revision+1,updated_at=now(),reason=$1",
    "where scope='public' returning revision::int revision,updated_at",
  ].join("\n"), [
    "Maine local reporting unit geometry " + mode + " "
      + (publicAuthorized
        ? context.authorization.activationId
        : context.authorization.rollbackId),
  ]);
  if (Number(revisionRows[0]?.revision) !== revision) {
    throw new Error("Maine publication revision increment drifted");
  }
  const postconditions = await verifyPostconditions(nv, context, revision, mode);
  return {
    result: publicAuthorized ? "PUBLISHED" : "ROLLED_BACK",
    mode,
    revision,
    changedAtUtc: context.changedAtUtc,
    postconditions,
    publicDeliveryAuthorized: publicAuthorized,
  };
}

function defaultPlanPath(planSha256) {
  return ".etl/precinct-publication-plans/ME/me-local-publication-plan-"
    + planSha256.slice(0, 12) + ".json";
}

function defaultAuthorizationPath(planSha256, mode = "publish") {
  return ".etl/production-authorizations/ME/me-local-" + mode + "-authorization-template-"
    + planSha256.slice(0, 12) + ".json";
}

export function inspectMainePublicationReceipt(root, options, built) {
  const artifact = safeJson(
    root,
    options.publicationReceiptPath,
    options.publicationReceiptSha256,
    ".etl/production-publication-receipts/ME",
  );
  const value = artifact.value;
  const publicAuthorizationArtifact = safeJson(
    root,
    value?.authorization?.path,
    value?.authorization?.sha256,
    ".etl/production-authorizations/ME",
  );
  const publicAuthorization = validateMainePublicationAuthorization(
    publicAuthorizationArtifact.value,
    {
      plan: built.plan,
      planSha256: built.sha256,
      now: options.now ?? Date.now(),
      recovery: true,
    },
  );
  const changedAt = Date.parse(value?.changedAtUtc);
  if (
    value?.schemaVersion !== 1
    || value?.state !== "ME"
    || value?.mode !== "publish"
    || value?.decision !== "PUBLISHED"
    || value?.activationId !== publicAuthorization.activationId
    || value?.approvedBy !== publicAuthorization.approvedBy
    || !semanticallyEqual(value?.releaseCandidate, built.plan.releaseCandidate)
    || value?.publicationPlan?.id !== built.plan.id
    || value?.publicationPlan?.sha256 !== built.sha256
    || value?.authorization?.path !== publicAuthorizationArtifact.path
    || value?.authorization?.sha256 !== publicAuthorizationArtifact.sha256
    || value?.hiddenLoad?.path !== built.plan.hiddenLoad.path
    || value?.hiddenLoad?.sha256 !== built.plan.hiddenLoad.sha256
    || value?.blobPublication?.path !== built.plan.blobPublication.path
    || value?.blobPublication?.sha256 !== built.plan.blobPublication.sha256
    || value?.blobPublication?.deliveryOrigin
      !== built.plan.blobPublication.deliveryOrigin
    || !semanticallyEqual(
      value?.productionDeployment,
      publicAuthorization.productionDeployment,
    )
    || !semanticallyEqual(value?.rollbackTarget, publicAuthorization.rollbackTarget)
    || Number.isNaN(changedAt)
    || changedAt > (options.now ?? Date.now())
    || Date.parse(publicAuthorization.rollbackTarget.verifiedAtUtc) > changedAt
    || !Number.isInteger(Number(value?.revision))
    || Number(value.revision) < 1
    || value?.postconditions?.mode !== "publish"
    || value?.postconditions?.status !== "published"
    || value?.postconditions?.publicDeliveryAuthorized !== true
    || value?.postconditions?.geographyVersions !== 3
    || value?.postconditions?.crosswalks !== 1_542
    || value?.postconditions?.reportingUnits !== 1_542
    || value?.postconditions?.sourceDocuments !== 6
    || value?.postconditions?.importRuns !== 3
    || value?.postconditions?.resultRows !== 4_626
    || value?.postconditions?.invalidConstraints !== 0
    || value?.productionMutationPerformed !== true
    || value?.publicDeliveryAuthorized !== true
  ) {
    throw new Error("Maine publication receipt is incomplete or incompatible");
  }
  return {
    artifact,
    publicAuthorization,
    summary: {
      path: artifact.path,
      sha256: artifact.sha256,
      activationId: value.activationId,
      authorizationSha256: publicAuthorizationArtifact.sha256,
      revision: Number(value.revision),
      changedAtUtc: value.changedAtUtc,
      rollbackTarget: value.rollbackTarget,
      productionDeployment: value.productionDeployment,
    },
  };
}

function defaultReceiptPath(planSha256, activationId, mode = "publish") {
  const safeId = activationId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return ".etl/production-publication-receipts/ME/me-local-" + mode + "-"
    + planSha256.slice(0, 12) + "-" + safeId + ".json";
}

function reserveReceipt(
  root,
  relativePath,
  planSha256,
  authorizationSha256,
  mode,
  publicationReceiptSha256 = null,
  options = {},
) {
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", "production-publication-receipts", "ME");
  if (!absolute.startsWith(allowed + path.sep) || !relativePath.endsWith(".json")) {
    throw new Error("Maine publication receipt path is unsafe");
  }
  if (existsSync(absolute)) throw new Error("Maine publication receipt already exists");
  mkdirSync(path.dirname(absolute), { recursive: true });
  const pending = absolute + ".pending";
  const pendingDocument = {
    schemaVersion: 1,
    state: "ME",
    purpose: "ambiguous-commit recovery marker",
    mode,
    planSha256,
    authorizationSha256,
    publicationReceiptSha256,
  };
  const pendingBytes = serializeMainePublicationDocument(pendingDocument);
  if (existsSync(pending)) {
    if (
      options.allowExisting === true
      && readFileSync(pending).equals(pendingBytes)
    ) {
      return { absolute, pending, pendingBytes, disposition: "reused" };
    }
    throw new Error("A Maine publication recovery marker already exists; reconcile it before retrying");
  }
  writeFileSync(pending, pendingBytes, { flag: "wx", mode: 0o600 });
  return { absolute, pending, pendingBytes, disposition: "created" };
}

function finishPublicationReceipt(reservation, receipt) {
  const receiptBytes = serializeMainePublicationDocument(receipt);
  const temporary = reservation.absolute + ".write-"
    + sha256(receiptBytes).slice(0, 12) + ".tmp";
  if (existsSync(temporary)) {
    if (!readFileSync(temporary).equals(receiptBytes)) {
      throw new Error("Maine publication receipt temporary file drifted");
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

export async function runMaineGeographyPublication(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const parsed = options.packagePath ? options : parseArguments(process.argv.slice(2));
  const mode = parsed.rollback ? "rollback" : "publish";
  const environment = options.environment ?? process.env;
  const clock = options.nowFactory ?? (() => options.now ?? new Date());
  const currentTime = () => {
    const value = clock();
    const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(result.getTime())) {
      throw new Error("Maine publication clock returned an invalid time");
    }
    return result;
  };
  const built = inspectMainePublicationPlan({ ...parsed, root });
  if (parsed.planSha256 && parsed.planSha256 !== built.sha256) {
    throw new Error("Maine publication plan SHA-256 drifted");
  }
  const publicationReceipt = mode === "rollback"
    ? inspectMainePublicationReceipt(root, {
      ...parsed,
      now: currentTime().getTime(),
    }, built)
    : null;
  if (parsed.writePlan) {
    if (mode === "rollback") {
      throw new Error("Maine rollback reuses the exact hash-pinned publication plan");
    }
    const artifact = immutableJson(
      root,
      parsed.outputPath ?? defaultPlanPath(built.sha256),
      built.plan,
      ".etl/precinct-publication-plans/ME",
    );
    return {
      mode: "write_plan",
      decision: built.plan.decision,
      publicationPlan: artifact,
      productionMutationPerformed: false,
    };
  }
  if (parsed.writeAuthorizationTemplate) {
    const template = mode === "rollback"
      ? buildMainePublicRollbackAuthorizationTemplate(
        built.plan,
        built.sha256,
        publicationReceipt.summary,
      )
      : buildMainePublicationAuthorizationTemplate(built.plan, built.sha256);
    const artifact = immutableJson(
      root,
      parsed.outputPath ?? defaultAuthorizationPath(built.sha256, mode),
      template,
      ".etl/production-authorizations/ME",
    );
    return {
      mode: "write_authorization_template",
      operation: mode,
      decision: mode === "rollback" ? "NO_GO_ROLLBACK" : "NO_GO_PUBLIC",
      publicationPlanSha256: built.sha256,
      authorizationTemplate: artifact,
      productionMutationPerformed: false,
    };
  }
  if (!parsed.apply && !parsed.recoverReceipt) {
    return {
      mode: "plan",
      operation: mode,
      decision: mode === "rollback"
        ? "GO_ROLLBACK_AUTHORIZATION_REQUIRED"
        : built.plan.decision,
      publicationPlanSha256: built.sha256,
      requiredScopes: mode === "rollback"
        ? [...MAINE_PUBLIC_ROLLBACK_SCOPES]
        : undefined,
      productionMutationPerformed: false,
      expectedTotals: built.plan.expectedTotals,
    };
  }
  const authorizationArtifact = safeJson(
    root,
    parsed.authorizationPath,
    parsed.authorizationSha256,
    ".etl/production-authorizations/ME",
  );
  const validateAuthorizationAt = (now, recovery = false) => mode === "rollback"
    ? validateMainePublicRollbackAuthorization(authorizationArtifact.value, {
      plan: built.plan,
      planSha256: built.sha256,
      publicationReceipt: publicationReceipt.summary,
      now: now.getTime(),
      recovery,
    })
    : validateMainePublicationAuthorization(authorizationArtifact.value, {
      plan: built.plan,
      planSha256: built.sha256,
      now: now.getTime(),
      recovery,
    });
  const databaseUrl = productionUrl(environment);
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  if (endpointFingerprint !== built.plan.hiddenLoad.endpointFingerprint) {
    throw new Error("Maine publication database endpoint drifted from the hidden load");
  }
  const gisPlan = await buildMaineLocalGisPlan({
    root,
    years: [2016, 2020, 2024],
  });
  const executionContext = {
    mode: "production_release",
    releasePackageSha256: built.plan.releaseCandidate.sha256,
    releaseCandidateId: built.plan.releaseCandidate.id,
    databaseName: built.plan.hiddenLoad.databaseName,
    productionReleaseAudit: built.plan.hiddenLoad.productionReleaseAudit,
  };
  buildMaineLocalExecutionContext(executionContext);
  const rawOperationId = mode === "rollback"
    ? authorizationArtifact.value?.rollbackId
    : authorizationArtifact.value?.activationId;
  const operationId = typeof rawOperationId === "string"
    ? rawOperationId.trim()
    : "";
  const receiptPath = parsed.outputPath ?? defaultReceiptPath(
    built.sha256,
    operationId || "invalid-authorization",
    mode,
  );
  const publicAuthorization = mode === "publish"
    ? null
    : publicationReceipt.publicAuthorization;

  const receiptDocument = (authorization, committed, recovery = null) => {
    const originalPublicAuthorization = mode === "publish"
      ? authorization
      : publicAuthorization;
    return {
      schemaVersion: 1,
      state: "ME",
      mode,
      decision: mode === "publish" ? "PUBLISHED" : "ROLLED_BACK",
      activationId: mode === "publish"
        ? authorization.activationId
        : publicationReceipt.summary.activationId,
      ...(mode === "rollback" ? { rollbackId: authorization.rollbackId } : {}),
      approvedBy: authorization.approvedBy,
      releaseCandidate: built.plan.releaseCandidate,
      publicationPlan: { id: built.plan.id, sha256: built.sha256 },
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
      productionDeployment: originalPublicAuthorization.productionDeployment,
      rollbackTarget: originalPublicAuthorization.rollbackTarget,
      ...(mode === "rollback"
        ? { publicationReceipt: publicationReceipt.summary }
        : {}),
      changedAtUtc: committed.changedAtUtc,
      revision: committed.revision,
      postconditions: committed.postconditions,
      ...(recovery ? { recovery } : {}),
      productionMutationPerformed: true,
      publicDeliveryAuthorized: mode === "publish",
    };
  };

  if (parsed.recoverReceipt) {
    if (
      environment.CRM_DATABASE_ENVIRONMENT !== "production-read-only"
      || environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_RECEIPT_RECOVERY !== built.sha256
      || environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256
        !== authorizationArtifact.sha256
      || (mode === "rollback"
        && environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_RECEIPT_SHA256
          !== publicationReceipt.summary.sha256)
    ) {
      throw new Error(
        "Maine publication receipt recovery is not explicitly read-only and hash-authorized",
      );
    }
    const reservation = reserveReceipt(
      root,
      receiptPath,
      built.sha256,
      authorizationArtifact.sha256,
      mode,
      publicationReceipt?.summary.sha256 ?? null,
      { allowExisting: true },
    );
    let sql;
    try {
      sql = (options.postgresFactory ?? postgres)(databaseUrl, {
        max: 1,
        connect_timeout: 10,
        idle_timeout: 20,
        connection: {
          application_name: "civicresultmaps-me-local-publication-receipt-recovery",
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
      recovered = await sql.begin("read only", async (nv) => {
        const identity = await nv.unsafe([
          "select current_database() database_name,",
          " current_setting('transaction_read_only') transaction_read_only",
        ].join("\n"));
        if (
          identity.length !== 1
          || String(identity[0].database_name) !== built.plan.hiddenLoad.databaseName
          || String(identity[0].transaction_read_only) !== "on"
        ) {
          throw new Error("Maine publication receipt recovery database identity drifted");
        }
        const versions = await nv.unsafe([
          "select e.year,gv.status,gv.caveat,gv.metadata from geography_versions gv",
          "join elections e on e.id=gv.election_id",
          "where gv.state_code='ME' and gv.geography_type='local_reporting_unit'",
          " and gv.metadata->'releaseCandidate'->>'sha256'=$1 order by e.year",
        ].join("\n"), [built.plan.releaseCandidate.sha256]);
        if (versions.length !== 3) {
          throw new Error("Maine publication receipt recovery found an incomplete version set");
        }
        const operationAudit = mode === "publish"
          ? versions[0]?.metadata?.publicActivation
          : versions[0]?.metadata?.publicActivation?.rollback;
        const changedAtUtc = operationAudit?.changedAtUtc;
        const revision = Number(operationAudit?.revision);
        const recoveryNow = currentTime();
        if (
          typeof changedAtUtc !== "string"
          || Number.isNaN(Date.parse(changedAtUtc))
          || Date.parse(changedAtUtc) > recoveryNow.getTime()
          || !Number.isInteger(revision)
          || revision < 1
        ) {
          throw new Error("Maine publication receipt recovery audit is incomplete");
        }
        const authorization = validateAuthorizationAt(
          new Date(changedAtUtc),
          true,
        );
        const context = {
          mode,
          plan: built.plan,
          planSha256: built.sha256,
          authorization,
          authorizationSha256: authorizationArtifact.sha256,
          publicationReceipt: publicationReceipt?.summary ?? null,
          changedAtUtc,
          gisPlan,
          executionContext,
        };
        const postconditions = await verifyPostconditions(
          nv,
          context,
          revision,
          mode,
        );
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
      operation: mode,
      decision: mode === "publish"
        ? "RECOVERED_PUBLICATION_RECEIPT"
        : "RECOVERED_ROLLBACK_RECEIPT",
      activationId: recovered.authorization.activationId,
      revision: recovered.revision,
      productionMutationPerformed: false,
      publicDeliveryAuthorized: mode === "publish",
      receipt: {
        path: receiptPath,
        sha256: sha256(receiptBytes),
        byteCount: receiptBytes.length,
      },
    };
  }

  const initialNow = currentTime();
  const authorization = validateAuthorizationAt(initialNow);
  const writeAuthorized = mode === "publish"
    ? environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_WRITES
        === "I_ACKNOWLEDGE_ATOMIC_MAINE_LOCAL_PUBLIC_CUTOVER"
      && environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_ACTIVATION_ID
        === authorization.activationId
    : environment.CRM_ME_LOCAL_GEOGRAPHY_ROLLBACK_WRITES
        === "I_ACKNOWLEDGE_DATABASE_FIRST_MAINE_LOCAL_PUBLIC_ROLLBACK"
      && environment.CRM_ME_LOCAL_GEOGRAPHY_ROLLBACK_ID === authorization.rollbackId
      && environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_RECEIPT_SHA256
        === publicationReceipt.summary.sha256;
  if (
    environment.CRM_DATABASE_ENVIRONMENT !== "production"
    || !writeAuthorized
    || environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_PACKAGE_SHA256
      !== built.plan.releaseCandidate.sha256
    || environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_PLAN_SHA256 !== built.sha256
    || environment.CRM_ME_LOCAL_GEOGRAPHY_PUBLICATION_AUTHORIZATION_SHA256
      !== authorizationArtifact.sha256
  ) {
    throw new Error("Maine public " + mode + " is not explicitly hash-authorized");
  }
  const activePublicAuthorization = mode === "publish"
    ? authorization
    : publicAuthorization;
  verifyMainePublicationGitCandidate(root, activePublicAuthorization, options.gitRunner);
  const reservation = reserveReceipt(
    root,
    receiptPath,
    built.sha256,
    authorizationArtifact.sha256,
    mode,
    publicationReceipt?.summary.sha256 ?? null,
  );
  let sql;
  try {
    sql = (options.postgresFactory ?? postgres)(databaseUrl, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 20,
      connection: { application_name: "civicresultmaps-me-local-publication-status" },
    });
  } catch (error) {
    if (existsSync(reservation.pending)) unlinkSync(reservation.pending);
    throw error;
  }
  let transactionBodyCompleted = false;
  let committed;
  try {
    committed = await sql.begin(async (nv) => {
      const transactionNow = currentTime();
      const finalAuthorization = validateAuthorizationAt(transactionNow);
      if (finalAuthorization.activationId !== authorization.activationId) {
        throw new Error("Maine publication authorization drifted before the transaction");
      }
      verifyMainePublicationGitCandidate(
        root,
        activePublicAuthorization,
        options.gitRunner,
      );
      const result = await applyMaineGeographyPublicationTransaction(nv, {
        mode,
        plan: built.plan,
        planSha256: built.sha256,
        authorization: finalAuthorization,
        authorizationSha256: authorizationArtifact.sha256,
        publicationReceipt: publicationReceipt?.summary ?? null,
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
    operation: mode,
    decision: mode === "publish" ? "PUBLISHED" : "ROLLED_BACK",
    activationId: authorization.activationId,
    revision: committed.revision,
    productionMutationPerformed: true,
    publicDeliveryAuthorized: mode === "publish",
    receipt: {
      path: receiptPath,
      sha256: sha256(receiptBytes),
      byteCount: receiptBytes.length,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMaineGeographyPublication().then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}

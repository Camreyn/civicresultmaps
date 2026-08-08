import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  productionEndpointFingerprint,
} from "./lib/mn-precinct-production-preflight.mjs";
import {
  buildMinnesotaPublicActivationAuthorizationTemplate,
  buildMinnesotaPublicRollbackAuthorizationTemplate,
  inspectMinnesotaPublicActivationPlan,
  MINNESOTA_PUBLIC_ACTIVATION_SCOPES,
  MINNESOTA_PUBLIC_ROLLBACK_SCOPES,
  MINNESOTA_PUBLIC_ACTIVATION_YEARS,
  serializeMinnesotaPublicActivationDocument,
  validateMinnesotaPublicActivationAuthorization,
  validateMinnesotaPublicRollbackAuthorization,
} from "./lib/mn-precinct-public-activation.mjs";
import {
  validateMinnesotaPrecinctGisClient,
} from "./lib/mn-precinct-gis-db.mjs";
import {
  buildMinnesotaPrecinctGisPlan,
} from "./lib/mn-precinct-gis-plan.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function semanticallyEqual(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function parseArguments(args) {
  const flags = new Set([
    "--apply",
    "--recover-receipt",
    "--rollback",
    "--write-authorization-template",
  ]);
  const names = new Set([
    "--activation",
    "--activation-sha256",
    "--authorization",
    "--authorization-template",
    "--publication-receipt",
    "--publication-receipt-sha256",
    "--receipt",
  ]);
  const values = new Map();
  for (const arg of args) {
    if (flags.has(arg)) continue;
    const separator = arg.indexOf("=");
    const name = separator < 0 ? arg : arg.slice(0, separator);
    if (!names.has(name) || separator < 0) {
      throw new Error("Unknown Minnesota publication-status option: " + arg);
    }
    values.set(name, arg.slice(separator + 1));
  }
  if (!values.get("--activation") || !values.get("--activation-sha256")) {
    throw new Error("--activation and --activation-sha256 are required");
  }
  if (
    args.includes("--apply")
    && (args.includes("--recover-receipt") || args.includes("--rollback"))
  ) {
    throw new Error("Minnesota publication status operations are mutually exclusive");
  }
  if (
    args.includes("--rollback")
    && (!values.get("--publication-receipt")
      || !values.get("--publication-receipt-sha256"))
  ) {
    throw new Error(
      "--publication-receipt and --publication-receipt-sha256 are required for rollback",
    );
  }
  return {
    activationPath: values.get("--activation"),
    activationSha256: values.get("--activation-sha256"),
    authorizationPath: values.get("--authorization"),
    authorizationTemplatePath: values.get("--authorization-template"),
    publicationReceiptPath: values.get("--publication-receipt"),
    publicationReceiptSha256: values.get("--publication-receipt-sha256"),
    receiptPath: values.get("--receipt"),
    apply: args.includes("--apply"),
    recoverReceipt: args.includes("--recover-receipt"),
    rollback: args.includes("--rollback"),
    writeAuthorizationTemplate: args.includes("--write-authorization-template"),
  };
}

function safeJson(root, relativePath, allowedRoot, expectedSha256) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(allowedRoot + "/")
    || !relativePath.endsWith(".json")
  ) {
    throw new Error("Minnesota publication-status JSON path is unsafe");
  }
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolutePath.startsWith(allowed + path.sep) || !existsSync(absolutePath)) {
    throw new Error("Minnesota publication-status JSON is missing");
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (expectedSha256 && digest !== expectedSha256) {
    throw new Error("Minnesota publication-status JSON SHA-256 drifted");
  }
  return {
    path: relativePath,
    absolutePath,
    bytes,
    sha256: digest,
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function safeOutput(root, requested, directory, defaultName) {
  const relativePath = requested ?? path.posix.join(
    ".etl",
    directory,
    "MN",
    defaultName,
  );
  const prefix = `.etl/${directory}/MN/`;
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(prefix)
    || !relativePath.endsWith(".json")
  ) {
    throw new Error("Minnesota publication-status output path is unsafe");
  }
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ".etl", directory, "MN");
  if (!absolutePath.startsWith(allowed + path.sep)) {
    throw new Error("Minnesota publication-status output escapes its fixed root");
  }
  return { relativePath, absolutePath };
}

function writeImmutable(target, value) {
  const bytes = serializeMinnesotaPublicActivationDocument(value);
  const digest = sha256(bytes);
  let disposition = "created";
  if (existsSync(target.absolutePath)) {
    if (!readFileSync(target.absolutePath).equals(bytes)) {
      throw new Error("Refusing to overwrite different Minnesota publication evidence");
    }
    disposition = "verified_existing";
  } else {
    mkdirSync(path.dirname(target.absolutePath), { recursive: true });
    writeFileSync(target.absolutePath, bytes, { mode: 0o600 });
  }
  return {
    path: target.relativePath,
    byteCount: bytes.length,
    sha256: digest,
    disposition,
  };
}

export function inspectMinnesotaActivationCandidate(root, options) {
  const artifact = safeJson(
    root,
    options.activationPath,
    ".etl/precinct-public-activations/MN",
    options.activationSha256,
  );
  const plan = artifact.value;
  if (
    plan?.schemaVersion !== 1
    || plan?.id !== "mn-precinct-public-activation-v1"
    || plan?.state !== "MN"
    || plan?.decision !== "PROTECTED_PREVIEW_REQUIRED"
    || !/^[a-f0-9]{64}$/.test(plan?.releaseCandidate?.sha256 ?? "")
    || !Array.isArray(plan?.manifests)
    || plan.manifests.length !== 4
    || !Array.isArray(plan?.trackedOutputs)
    || plan.trackedOutputs.length !== 5
    || plan?.safety?.productionMutationPerformed !== false
    || plan?.safety?.databasePublicationStatusChanged !== false
    || plan?.safety?.deploymentPromoted !== false
  ) {
    throw new Error("Minnesota activation candidate contract is incompatible");
  }
  safeJson(
    root,
    plan.releaseCandidate.path,
    ".etl/precinct-release-candidates/MN",
    plan.releaseCandidate.sha256,
  );
  safeJson(
    root,
    plan.productionHiddenLoad.path,
    ".etl/production-release-receipts/MN",
    plan.productionHiddenLoad.sha256,
  );
  safeJson(
    root,
    plan.blobPublication.path,
    ".etl/precinct-blob-publications/MN",
    plan.blobPublication.sha256,
  );
  const rebuilt = inspectMinnesotaPublicActivationPlan({
    root,
    packagePath: plan.releaseCandidate.path,
    packageSha256: plan.releaseCandidate.sha256,
    productionReceiptPath: plan.productionHiddenLoad.path,
    productionReceiptSha256: plan.productionHiddenLoad.sha256,
    blobEvidencePath: plan.blobPublication.path,
    blobEvidenceSha256: plan.blobPublication.sha256,
    now: options.now ?? Date.now(),
  });
  if (
    rebuilt.sha256 !== artifact.sha256
    || !rebuilt.bytes.equals(artifact.bytes)
  ) {
    throw new Error("Minnesota activation candidate does not match its pinned evidence");
  }
  if (
    JSON.stringify(plan.manifests.map((manifest) => manifest.year))
      !== JSON.stringify(MINNESOTA_PUBLIC_ACTIVATION_YEARS)
  ) {
    throw new Error("Minnesota activation candidate year set drifted");
  }
  for (const output of plan.trackedOutputs) {
    if (
      typeof output.path !== "string"
      || output.path.includes("\\")
      || output.path.split("/").includes("..")
      || !output.path.startsWith("data/")
      || !/^[a-f0-9]{64}$/.test(output.sha256 ?? "")
    ) {
      throw new Error("Minnesota activation candidate tracked output is unsafe");
    }
    const bytes = readFileSync(path.resolve(root, ...output.path.split("/")));
    if (bytes.length !== output.byteCount || sha256(bytes) !== output.sha256) {
      throw new Error("Minnesota activation candidate tracked output drifted: " + output.path);
    }
  }
  return { artifact, plan: rebuilt.plan };
}

export function inspectMinnesotaPublicationReceipt(root, options, activation) {
  if (!/^[a-f0-9]{64}$/.test(options.publicationReceiptSha256 ?? "")) {
    throw new Error("Minnesota rollback requires the exact publication-receipt SHA-256");
  }
  const artifact = safeJson(
    root,
    options.publicationReceiptPath,
    ".etl/production-publication-receipts/MN",
    options.publicationReceiptSha256,
  );
  const value = artifact.value;
  const expectedFeatures = activation.plan.manifests.reduce(
    (sum, manifest) => sum + manifest.draftManifest.delivery.featureCount,
    0,
  );
  if (
    value?.schemaVersion !== 1
    || value?.state !== "MN"
    || value?.mode !== "publish"
    || value?.releaseCandidate?.id !== activation.plan.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== activation.plan.releaseCandidate.sha256
    || value?.activationCandidate?.path !== activation.artifact.path
    || value?.activationCandidate?.sha256 !== activation.artifact.sha256
    || value?.databasePublicationStatusConfirmed !== true
    || value?.transaction?.mode !== "publish"
    || !["updated", "verified_existing"].includes(value?.transaction?.disposition)
    || value?.transaction?.geographyVersions !== 4
    || value?.transaction?.features !== expectedFeatures
    || value?.transaction?.crosswalks !== expectedFeatures
    || value?.transaction?.reportingUnits
      !== activation.plan.productionHiddenLoad.totals.reportingUnits
    || value?.transaction?.sourceDocuments !== 8
    || value?.transaction?.importRuns !== 4
    || !Number.isInteger(Number(value?.transaction?.revision))
    || typeof value?.authorization?.activationId !== "string"
    || !value.authorization.activationId.trim()
    || !/^[a-f0-9]{64}$/.test(value?.authorization?.sha256 ?? "")
    || value?.transaction?.committedAtUtc !== value?.changedAtUtc
    || Number.isNaN(Date.parse(value?.changedAtUtc))
    || Date.parse(value.changedAtUtc) > (options.now ?? Date.now())
  ) {
    throw new Error("Minnesota publication receipt is incomplete or incompatible");
  }
  return {
    artifact,
    summary: {
      path: artifact.path,
      sha256: artifact.sha256,
      activationId: value.authorization.activationId.trim(),
      authorizationSha256: value.authorization.sha256,
      revision: Number(value.transaction.revision),
      changedAtUtc: value.changedAtUtc,
    },
  };
}

function query(client, sql, parameters = []) {
  return client.unsafe(sql, parameters);
}

function expectedByYear(plan) {
  return new Map(plan.manifests.map((manifest) => [manifest.year, {
    manifestId: manifest.manifestId,
    featureCount: manifest.draftManifest.delivery.featureCount,
    canonicalPreimageSha256: manifest.canonicalPreimage.sha256,
    publicManifestSha256: manifest.draftManifest.sha256,
    delivery: manifest.draftManifest.delivery,
  }]));
}

function metadataValue(row) {
  return typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
}

function expectedReleaseCounts(gisPlan) {
  if (!Array.isArray(gisPlan?.years) || gisPlan.years.length !== 4) {
    throw new Error("Minnesota publication requires the four-year GIS plan");
  }
  return {
    reportingUnits: gisPlan.years.reduce(
      (sum, year) => sum + year.reportingUnits.length,
      0,
    ),
    sourceDocuments: gisPlan.years.length * 2,
    importRuns: gisPlan.years.length,
    features: gisPlan.years.reduce(
      (sum, year) => sum + year.geometry.features.length,
      0,
    ),
    crosswalks: gisPlan.years.reduce(
      (sum, year) => sum + year.geometry.crosswalks.length,
      0,
    ),
  };
}

function currentActivationMatches(metadata, context, mode, year, wanted) {
  const activation = metadata?.publicActivation;
  if (
    activation?.activationId !== context.publicationActivationId
    || activation?.activationCandidateSha256 !== context.activationSha256
    || activation?.releasePackageSha256 !== context.plan.releaseCandidate.sha256
    || activation?.blobPublicationSha256 !== context.plan.blobPublication.sha256
    || activation?.deliveryOrigin !== context.plan.blobPublication.deliveryOrigin
    || activation?.authorizationSha256 !== context.publicationAuthorizationSha256
    || activation?.mode !== "publish"
    || activation?.year !== year
    || activation?.manifestId !== wanted?.manifestId
    || activation?.publicManifestSha256 !== wanted?.publicManifestSha256
    || !semanticallyEqual(activation?.delivery, wanted?.delivery)
    || !Object.hasOwn(activation ?? {}, "previousCaveat")
    || !(
      activation.previousCaveat === null
      || typeof activation.previousCaveat === "string"
    )
    || Number.isNaN(Date.parse(activation?.changedAtUtc))
    || !Number.isInteger(Number(activation?.revision))
  ) {
    return false;
  }
  if (mode === "publish") return !activation.rollback;
  return Number(activation.revision) === context.publicationReceipt?.revision
    && activation.changedAtUtc === context.publicationReceipt?.changedAtUtc
    && activation?.rollback?.rollbackId === context.authorization.activationId
    && activation.rollback.activationCandidateSha256 === context.activationSha256
    && activation.rollback.blobPublicationSha256 === context.plan.blobPublication.sha256
    && activation.rollback.authorizationSha256 === context.authorizationSha256
    && activation.rollback.publicationReceiptSha256
      === context.publicationReceipt?.sha256
    && !Number.isNaN(Date.parse(activation.rollback.changedAtUtc))
    && Number.isInteger(Number(activation.rollback.revision));
}

async function verifyMinnesotaPublicationPostconditions(
  tx,
  context,
  wantedStatus,
  publicAuthorized,
  counts,
) {
  const versionParameters = [
    wantedStatus,
    String(publicAuthorized),
    context.publicationActivationId,
    context.activationSha256,
    context.plan.releaseCandidate.sha256,
    context.plan.blobPublication.sha256,
    context.plan.blobPublication.deliveryOrigin,
    context.publicationAuthorizationSha256,
  ];
  if (context.mode === "rollback") {
    versionParameters.push(
      context.authorization.activationId,
      context.authorizationSha256,
      context.publicationReceipt.sha256,
      context.publicationReceipt.revision,
      context.publicationReceipt.changedAtUtc,
    );
  }
  const versions = await query(tx, [
    "select count(*)::int versions,",
    " count(*) filter (where gv.status=$1)::int expected_status,",
    " count(*) filter (where gv.metadata->>'publicDeliveryAuthorized'=$2",
    "  and gv.metadata->'releaseCandidate'->>'publicDeliveryAuthorized'=$2)::int expected_flags,",
    " count(*) filter (where gv.metadata->'publicActivation'->>'activationId'=$3",
    "  and gv.metadata->'publicActivation'->>'activationCandidateSha256'=$4",
    "  and gv.metadata->'publicActivation'->>'releasePackageSha256'=$5",
    "  and gv.metadata->'publicActivation'->>'blobPublicationSha256'=$6",
    "  and gv.metadata->'publicActivation'->>'deliveryOrigin'=$7",
    "  and gv.metadata->'publicActivation'->>'authorizationSha256'=$8",
    "  and gv.metadata->'publicActivation'->>'mode'='publish')::int bound_activation,",
    context.mode === "publish"
      ? " count(*) filter (where not (gv.metadata->'publicActivation' ? 'rollback'))::int operation_bound,"
      : " count(*) filter (where gv.metadata->'publicActivation'->'rollback'->>'rollbackId'=$9 and gv.metadata->'publicActivation'->'rollback'->>'activationCandidateSha256'=$4 and gv.metadata->'publicActivation'->'rollback'->>'blobPublicationSha256'=$6 and gv.metadata->'publicActivation'->'rollback'->>'authorizationSha256'=$10 and gv.metadata->'publicActivation'->'rollback'->>'publicationReceiptSha256'=$11 and (gv.metadata->'publicActivation'->>'revision')::int=$12 and gv.metadata->'publicActivation'->>'changedAtUtc'=$13)::int operation_bound,",
    context.mode === "publish"
      ? " min((gv.metadata->'publicActivation'->>'revision')::int)::int revision_min, max((gv.metadata->'publicActivation'->>'revision')::int)::int revision_max"
      : " min((gv.metadata->'publicActivation'->'rollback'->>'revision')::int)::int revision_min, max((gv.metadata->'publicActivation'->'rollback'->>'revision')::int)::int revision_max",
    "from geography_versions gv join elections e on e.id=gv.election_id",
    "where gv.state_code='MN' and gv.geography_type='precinct'",
    " and e.office='president' and e.year in (2012,2016,2020,2024)",
  ].join("\n"), versionParameters);
  const versionCheck = versions[0];
  if (
    Number(versionCheck?.versions) !== 4
    || Number(versionCheck?.expected_status) !== 4
    || Number(versionCheck?.expected_flags) !== 4
    || Number(versionCheck?.bound_activation) !== 4
    || Number(versionCheck?.operation_bound) !== 4
    || !Number.isInteger(Number(versionCheck?.revision_min))
    || Number(versionCheck.revision_min) !== Number(versionCheck.revision_max)
  ) {
    throw new Error("Minnesota geography-version publication postcondition failed");
  }

  const crosswalks = await query(tx, [
    "select count(*)::int crosswalks,",
    " count(*) filter (where x.metadata->>'publicDeliveryAuthorized'=$1",
    "  and x.metadata->'releaseCandidate'->>'publicDeliveryAuthorized'=$1)::int expected_flags,",
    " count(*) filter (where x.relationship_type='one_to_one'",
    "  and x.match_method='exact_official_id' and x.review_status='reviewed'",
    "  and x.confidence='high' and ru.election_id=gv.election_id",
    "  and gf.geometry_version_id=gv.id)::int exact_crosswalks,",
    " count(distinct gf.id)::int linked_features",
    "from reporting_unit_geometry_crosswalks x",
    "join geography_versions gv on gv.id=x.geometry_version_id",
    "join elections e on e.id=gv.election_id",
    "join reporting_units ru on ru.id=x.reporting_unit_id",
    "join geography_features gf on gf.id=x.geography_feature_id",
    "where gv.state_code='MN' and gv.geography_type='precinct'",
    " and e.office='president' and e.year in (2012,2016,2020,2024)",
  ].join("\n"), [String(publicAuthorized)]);
  const crosswalkCheck = crosswalks[0];
  if (
    Number(crosswalkCheck?.crosswalks) !== counts.crosswalks
    || Number(crosswalkCheck?.expected_flags) !== counts.crosswalks
    || Number(crosswalkCheck?.exact_crosswalks) !== counts.crosswalks
    || Number(crosswalkCheck?.linked_features) !== counts.features
  ) {
    throw new Error("Minnesota crosswalk publication postcondition failed");
  }

  for (const table of [
    {
      name: "reporting_units",
      json: "metadata",
      expected: counts.reportingUnits,
      requireTopLevel: true,
    },
    {
      name: "source_documents",
      json: "metadata",
      expected: counts.sourceDocuments,
      requireTopLevel: true,
    },
    {
      name: "import_runs",
      json: "summary",
      expected: counts.importRuns,
      requireTopLevel: true,
    },
  ]) {
    const rows = await query(tx, [
      `select count(*)::int total, count(*) filter (where ${table.json}->'releaseCandidate'->>'publicDeliveryAuthorized'=$2`,
      table.requireTopLevel
        ? ` and ${table.json}->>'publicDeliveryAuthorized'=$2)::int expected_flags`
        : ")::int expected_flags",
      `from ${table.name} where state_code='MN'`,
      ` and ${table.json}->'releaseCandidate'->>'sha256'=$1`,
    ].join("\n"), [context.plan.releaseCandidate.sha256, String(publicAuthorized)]);
    if (
      Number(rows[0]?.total) !== table.expected
      || Number(rows[0]?.expected_flags) !== table.expected
    ) {
      throw new Error("Minnesota " + table.name + " publication postcondition failed");
    }
  }
  return {
    geographyVersions: 4,
    features: counts.features,
    crosswalks: counts.crosswalks,
    reportingUnits: counts.reportingUnits,
    sourceDocuments: counts.sourceDocuments,
    importRuns: counts.importRuns,
    revision: Number(versionCheck.revision_min),
  };
}

export async function applyMinnesotaGeographyPublicationTransaction(
  tx,
  context,
) {
  const identity = await query(tx, [
    "select current_database() database_name,",
    " current_setting('transaction_read_only') transaction_read_only",
  ].join("\n"));
  if (
    identity.length !== 1
    || String(identity[0].transaction_read_only)
      !== (context.recoveryOnly ? "on" : "off")
    || String(identity[0].database_name) !== context.databaseName
  ) {
    throw new Error("Minnesota publication transaction database identity drifted");
  }
  if (!context.recoveryOnly) {
    await query(tx, "select set_config('lock_timeout','30s',true)");
    await query(
      tx,
      "select pg_advisory_xact_lock(hashtextextended('crm-mn-precinct-gis-release-v1',0))",
    );
  }
  const versions = await query(tx, [
    "select gv.id,e.id election_id,e.year,gv.status,gv.caveat,gv.metadata,",
    " (select count(*)::int from geography_features gf",
    "  where gf.geometry_version_id=gv.id) features,",
    " (select count(*)::int from reporting_unit_geometry_crosswalks x",
    "  where x.geometry_version_id=gv.id) crosswalks",
    "from geography_versions gv",
    "join elections e on e.id=gv.election_id",
    "where gv.state_code='MN' and gv.geography_type='precinct'",
    " and e.office='president' and e.year in (2012,2016,2020,2024)",
    "order by e.year",
  ].join("\n"));
  const expected = expectedByYear(context.plan);
  const counts = expectedReleaseCounts(context.gisPlan);
  if (versions.length !== 4) {
    throw new Error("Minnesota publication transaction requires four geography versions");
  }
  const statuses = new Set();
  const seenYears = new Set();
  for (const row of versions) {
    const year = Number(row.year);
    const wanted = expected.get(year);
    const metadata = metadataValue(row);
    if (
      !wanted
      || seenYears.has(year)
      || metadata?.manifestId !== wanted.manifestId
      || metadata?.manifestSha256 !== wanted.canonicalPreimageSha256
      || metadata?.releaseCandidate?.id !== context.plan.releaseCandidate.id
      || metadata?.releaseCandidate?.sha256
        !== context.plan.releaseCandidate.sha256
      || Number(row.features) !== wanted.featureCount
      || Number(row.crosswalks) !== wanted.featureCount
      || !["blocked", "published"].includes(String(row.status))
    ) {
      throw new Error("Minnesota publication precondition drifted for " + year);
    }
    seenYears.add(year);
    const publicAuthorized = metadata?.publicDeliveryAuthorized === true;
    const nestedAuthorized = metadata?.releaseCandidate?.publicDeliveryAuthorized === true;
    if (
      publicAuthorized !== nestedAuthorized
      || (row.status === "blocked" && publicAuthorized)
      || (row.status === "published" && !publicAuthorized)
    ) {
      throw new Error("Minnesota publication status metadata is inconsistent");
    }
    statuses.add(String(row.status));
  }
  if (statuses.size !== 1 || seenYears.size !== 4) {
    throw new Error("Minnesota geography versions are partially published");
  }
  const currentStatus = [...statuses][0];
  const wantedStatus = context.mode === "rollback" ? "blocked" : "published";
  if (context.recoveryOnly && currentStatus !== wantedStatus) {
    throw new Error("Minnesota receipt recovery found no exact published database state");
  }
  if (currentStatus === wantedStatus) {
    const committedTimes = new Set();
    for (const row of versions) {
      const year = Number(row.year);
      if (!currentActivationMatches(
        metadataValue(row),
        context,
        context.mode,
        year,
        expected.get(year),
      )) {
        throw new Error("Minnesota existing publication belongs to different evidence");
      }
      const activation = metadataValue(row).publicActivation;
      committedTimes.add(context.mode === "publish"
        ? activation.changedAtUtc
        : activation.rollback.changedAtUtc);
    }
    if (committedTimes.size !== 1) {
      throw new Error("Minnesota existing publication audit time drifted");
    }
    const postconditions = await verifyMinnesotaPublicationPostconditions(
      tx,
      context,
      wantedStatus,
      context.mode === "publish",
      counts,
    );
    return {
      disposition: "verified_existing",
      mode: context.mode,
      ...postconditions,
      committedAtUtc: [...committedTimes][0],
      databaseValidation: null,
      productionMutationPerformed: false,
    };
  }
  if (
    (context.mode === "publish" && currentStatus !== "blocked")
    || (context.mode === "rollback" && currentStatus !== "published")
  ) {
    throw new Error("Minnesota publication status cannot make the requested transition");
  }
  if (context.mode === "publish") {
    if (versions.some((row) => metadataValue(row)?.publicActivation)) {
      throw new Error("Minnesota blocked geography retains prior activation history");
    }
  } else if (versions.some(
    (row) => {
      const year = Number(row.year);
      const metadata = metadataValue(row);
      return !currentActivationMatches(
        metadataValue(row),
        context,
        "publish",
        year,
        expected.get(year),
      )
        || Number(metadata?.publicActivation?.revision)
          !== context.publicationReceipt?.revision
        || metadata?.publicActivation?.changedAtUtc
          !== context.publicationReceipt?.changedAtUtc;
    },
  )) {
    throw new Error("Minnesota rollback does not match the publication being reversed");
  }
  let databaseValidation = null;
  if (context.mode === "publish") {
    if (!context.gisPlan) {
      throw new Error("Minnesota publication requires the exact local GIS plan");
    }
    databaseValidation = await (
      context.validateCurrentDatabase ?? validateMinnesotaPrecinctGisClient
    )(tx, context.gisPlan, {
      executionContext: {
        mode: "production_release",
        releaseCandidateId: context.plan.releaseCandidate.id,
        releasePackageSha256: context.plan.releaseCandidate.sha256,
        databaseName: context.databaseName,
      },
      readOnlySession: false,
    });
  }
  const publicAuthorized = context.mode === "publish";
  const publicationMetadata = {
    activationId: context.publicationActivationId,
    activationCandidateSha256: context.activationSha256,
    releasePackageSha256: context.plan.releaseCandidate.sha256,
    blobPublicationSha256: context.plan.blobPublication.sha256,
    deliveryOrigin: context.plan.blobPublication.deliveryOrigin,
    authorizationSha256: context.authorizationSha256,
    changedAtUtc: context.changedAtUtc,
    mode: "publish",
  };
  const rollbackMetadata = {
    rollbackId: context.authorization.activationId,
    activationCandidateSha256: context.activationSha256,
    blobPublicationSha256: context.plan.blobPublication.sha256,
    authorizationSha256: context.authorizationSha256,
    publicationReceiptSha256: context.publicationReceipt?.sha256,
    changedAtUtc: context.changedAtUtc,
    mode: "rollback",
  };
  for (const row of versions) {
    const year = Number(row.year);
    const wanted = expected.get(year);
    const caveat = context.mode === "publish"
      ? "Reviewed election-vintage Minnesota precinct geometry is publicly authorized under activation "
        + context.publicationActivationId + "."
      : metadataValue(row)?.publicActivation?.previousCaveat ?? null;
    const operationMetadata = context.mode === "publish"
      ? {
        ...publicationMetadata,
        year,
        manifestId: wanted.manifestId,
        publicManifestSha256: wanted.publicManifestSha256,
        delivery: wanted.delivery,
        previousCaveat: row.caveat ?? null,
      }
      : rollbackMetadata;
    const updated = context.mode === "publish"
      ? await query(tx, [
        "update geography_versions set status=$2,caveat=$3,",
        " metadata=jsonb_set(jsonb_set(jsonb_set(metadata,",
        "  '{publicDeliveryAuthorized}',$4::text::jsonb,true),",
        "  '{releaseCandidate,publicDeliveryAuthorized}',$4::text::jsonb,true),",
        "  '{publicActivation}',$5::text::jsonb,true),updated_at=now()",
        "where id=$1::uuid and status=$6",
        "returning id",
      ].join("\n"), [
        row.id,
        wantedStatus,
        caveat,
        JSON.stringify(publicAuthorized),
        JSON.stringify(operationMetadata),
        currentStatus,
      ])
      : await query(tx, [
        "update geography_versions set status=$2,caveat=$3,",
        " metadata=jsonb_set(jsonb_set(jsonb_set(metadata,",
        "  '{publicDeliveryAuthorized}',$4::text::jsonb,true),",
        "  '{releaseCandidate,publicDeliveryAuthorized}',$4::text::jsonb,true),",
        "  '{publicActivation,rollback}',$5::text::jsonb,true),updated_at=now()",
        "where id=$1::uuid and status=$6",
        "returning id",
      ].join("\n"), [
        row.id,
        wantedStatus,
        caveat,
        JSON.stringify(publicAuthorized),
        JSON.stringify(operationMetadata),
        currentStatus,
      ]);
    if (updated.length !== 1) {
      throw new Error("Minnesota geography-version publication update lost its precondition");
    }
    const crosswalks = await query(tx, [
      "with updated as (update reporting_unit_geometry_crosswalks set",
      " metadata=jsonb_set(jsonb_set(metadata,",
      "  '{publicDeliveryAuthorized}',$2::text::jsonb,true),",
      "  '{releaseCandidate,publicDeliveryAuthorized}',$2::text::jsonb,true)",
      "where geometry_version_id=$1::uuid",
      "returning 1) select count(*)::int count from updated",
    ].join("\n"), [row.id, JSON.stringify(publicAuthorized)]);
    if (Number(crosswalks[0]?.count) !== wanted.featureCount) {
      throw new Error("Minnesota crosswalk publication count drifted for " + year);
    }
  }
  for (const table of [
    ["reporting_units", "metadata", counts.reportingUnits],
    ["source_documents", "metadata", counts.sourceDocuments],
    ["import_runs", "summary", counts.importRuns],
  ]) {
    const updated = await query(tx, [
      `with updated as (update ${table[0]} set ${table[1]}=jsonb_set(jsonb_set(`,
      ` ${table[1]},'{publicDeliveryAuthorized}',$1::text::jsonb,true),`,
      ` '{releaseCandidate,publicDeliveryAuthorized}',$1::text::jsonb,true)`,
      `where state_code='MN' and ${table[1]}->'releaseCandidate'->>'sha256'=$2`,
      "returning 1) select count(*)::int count from updated",
    ].join("\n"), [
      JSON.stringify(publicAuthorized),
      context.plan.releaseCandidate.sha256,
    ]);
    if (Number(updated[0]?.count) !== table[2]) {
      throw new Error("Minnesota " + table[0] + " publication count drifted");
    }
  }
  const revisions = await query(tx, [
    "insert into public_data_revisions (scope,revision,updated_at,reason)",
    "values ('public',1,now(),$1)",
    "on conflict (scope) do update set",
    " revision=public_data_revisions.revision+1,updated_at=now(),reason=excluded.reason",
    "returning revision::int revision",
  ].join("\n"), [
    `Minnesota precinct geometry ${context.mode} ${context.activationSha256}`,
  ]);
  const revision = Number(revisions[0].revision);
  const revisionPath = context.mode === "publish"
    ? "{publicActivation,revision}"
    : "{publicActivation,rollback,revision}";
  const recorded = await query(tx, [
    "with updated as (update geography_versions set",
    ` metadata=jsonb_set(metadata,'${revisionPath}',$1::text::jsonb,true),updated_at=now()`,
    "where state_code='MN' and geography_type='precinct'",
    " and metadata->'releaseCandidate'->>'sha256'=$2",
    "returning 1) select count(*)::int count from updated",
  ].join("\n"), [JSON.stringify(revision), context.plan.releaseCandidate.sha256]);
  if (Number(recorded[0]?.count) !== 4) {
    throw new Error("Minnesota publication revision audit count drifted");
  }
  const postconditions = await verifyMinnesotaPublicationPostconditions(
    tx,
    context,
    wantedStatus,
    publicAuthorized,
    counts,
  );
  if (postconditions.revision !== revision) {
    throw new Error("Minnesota publication revision audit drifted");
  }
  return {
    disposition: "updated",
    mode: context.mode,
    ...postconditions,
    committedAtUtc: context.changedAtUtc,
    databaseValidation,
    productionMutationPerformed: true,
  };
}

function productionUrl(expectedFingerprint) {
  const first = process.env.POSTGRES_URL_NON_POOLING;
  const second = process.env.POSTGRES_DATABASE_URL_UNPOOLED;
  if (first && second && first !== second) {
    throw new Error("Production unpooled URL variables disagree");
  }
  const value = first ?? second;
  if (!value) throw new Error("Production unpooled database URL is unavailable");
  if (productionEndpointFingerprint(value) !== expectedFingerprint) {
    throw new Error("Production database endpoint differs from the hidden-load receipt");
  }
  return value;
}

function validateEnvironment(
  plan,
  activationSha256,
  authorization,
  authorizationSha256,
  mode,
  recoveryOnly = false,
) {
  const expectedWrite = mode === "rollback"
    ? "I_ACKNOWLEDGE_PUBLIC_PRECINCT_MAP_ROLLBACK"
    : "I_ACKNOWLEDGE_PUBLIC_PRECINCT_MAP_CUTOVER";
  if (
    process.env.CRM_DATABASE_ENVIRONMENT
      !== (recoveryOnly ? "production-read-only" : "production")
    || (recoveryOnly
      ? process.env.CRM_MN_PRECINCT_PUBLIC_RECEIPT_RECOVERY
        !== "I_ACKNOWLEDGE_READ_ONLY_PUBLICATION_RECEIPT_RECOVERY"
      : process.env.CRM_MN_PRECINCT_PUBLIC_ACTIVATION_WRITES !== expectedWrite)
    || process.env.CRM_MN_PRECINCT_PUBLIC_ACTIVATION_PACKAGE_SHA256
      !== plan.releaseCandidate.sha256
    || process.env.CRM_MN_PRECINCT_PUBLIC_ACTIVATION_CANDIDATE_SHA256
      !== activationSha256
    || process.env.CRM_MN_PRECINCT_PUBLIC_AUTHORIZATION_SHA256
      !== authorizationSha256
    || process.env.CRM_MN_PRECINCT_PUBLIC_ACTIVATION_ID
      !== authorization.activationId
  ) {
    throw new Error("Minnesota public publication-status write is not explicitly authorized");
  }
}

export function verifyMinnesotaActivationGitCandidate(
  root,
  authorization,
  runner = spawnSync,
) {
  const head = runner(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (
    head.status !== 0
    || head.error
    || head.stdout.trim() !== authorization.protectedPreview.gitSha
  ) {
    throw new Error("Minnesota activation checkout does not match the verified preview Git SHA");
  }
  const status = runner(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (status.status !== 0 || status.error || status.stdout.trim()) {
    throw new Error("Minnesota activation checkout has tracked changes after preview verification");
  }
  return { gitSha: head.stdout.trim(), trackedWorktreeClean: true };
}

export async function runMinnesotaGeographyPublication(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = inspectMinnesotaActivationCandidate(root, options);
  const gisPlan = buildMinnesotaPrecinctGisPlan({ root });
  const mode = options.rollback ? "rollback" : "publish";
  const recoveryOnly = options.recoverReceipt === true;
  const now = options.now ?? new Date();
  const publicationReceipt = mode === "rollback"
    ? inspectMinnesotaPublicationReceipt(root, {
      ...options,
      now: now.valueOf(),
    }, loaded)
    : null;
  const template = mode === "rollback"
    ? buildMinnesotaPublicRollbackAuthorizationTemplate(
      loaded.plan,
      loaded.artifact.sha256,
      publicationReceipt.summary,
    )
    : buildMinnesotaPublicActivationAuthorizationTemplate(
      loaded.plan,
      loaded.artifact.sha256,
    );
  let authorizationTemplate = null;
  if (options.writeAuthorizationTemplate) {
    const target = safeOutput(
      root,
      options.authorizationTemplatePath,
      "production-authorizations",
      `mn-precinct-public-${mode}-template-${loaded.artifact.sha256.slice(0, 12)}.json`,
    );
    authorizationTemplate = writeImmutable(target, template);
  }
  if (
    !options.apply
    && !recoveryOnly
    && !(options.rollback && options.authorizationPath)
  ) {
    return {
      mode: "plan",
      operation: mode,
      decision: mode === "rollback" ? "NO_GO_ROLLBACK" : "NO_GO_PUBLIC",
      releaseCandidate: loaded.plan.releaseCandidate,
      activationCandidate: {
        path: loaded.artifact.path,
        sha256: loaded.artifact.sha256,
      },
      requiredScopes: mode === "rollback"
        ? [...MINNESOTA_PUBLIC_ROLLBACK_SCOPES]
        : [...MINNESOTA_PUBLIC_ACTIVATION_SCOPES],
      authorizationTemplate,
      connectionOpened: false,
      productionMutationPerformed: false,
      databasePublicationStatusChanged: false,
      deploymentPromoted: false,
    };
  }
  if (!options.authorizationPath) {
    throw new Error("--authorization is required for a publication-status write");
  }
  const authorizationArtifact = safeJson(
    root,
    options.authorizationPath,
    ".etl/production-authorizations/MN",
  );
  const authorization = mode === "rollback"
    ? validateMinnesotaPublicRollbackAuthorization(
      authorizationArtifact.value,
      {
        now: now.valueOf(),
        plan: loaded.plan,
        activationSha256: loaded.artifact.sha256,
        publicationReceipt: publicationReceipt.summary,
        recovery: recoveryOnly,
      },
    )
    : validateMinnesotaPublicActivationAuthorization(
      authorizationArtifact.value,
      {
        now: now.valueOf(),
        plan: loaded.plan,
        activationSha256: loaded.artifact.sha256,
        recovery: recoveryOnly,
      },
    );
  const gitCandidate = mode === "publish" && !recoveryOnly
    ? verifyMinnesotaActivationGitCandidate(
      root,
      authorization,
      options.gitRunner,
    )
    : null;
  validateEnvironment(
    loaded.plan,
    loaded.artifact.sha256,
    authorization,
    authorizationArtifact.sha256,
    mode,
    recoveryOnly,
  );
  const databaseUrl = productionUrl(
    loaded.plan.productionHiddenLoad.endpointFingerprint,
  );
  const sql = (options.postgresFactory ?? postgres)(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: {
      application_name: "civicresultmaps-mn-precinct-publication-status",
    },
  });
  let transaction;
  try {
    const execute = (tx) => applyMinnesotaGeographyPublicationTransaction(tx, {
        mode,
        plan: loaded.plan,
        activationSha256: loaded.artifact.sha256,
        authorization,
        authorizationSha256: authorizationArtifact.sha256,
        publicationActivationId: mode === "rollback"
          ? publicationReceipt.summary.activationId
          : authorization.activationId,
        publicationAuthorizationSha256: mode === "rollback"
          ? publicationReceipt.summary.authorizationSha256
          : authorizationArtifact.sha256,
        publicationReceipt: publicationReceipt?.summary ?? null,
        databaseName: loaded.plan.productionHiddenLoad?.databaseName,
        changedAtUtc: now.toISOString(),
        gisPlan,
        recoveryOnly,
      });
    transaction = recoveryOnly
      ? await sql.begin("read only", execute)
      : await sql.begin(execute);
  } finally {
    await sql.end({ timeout: 5 });
  }
  const receipt = {
    schemaVersion: 1,
    state: "MN",
    mode,
    recoveryOnly,
    requestedAtUtc: now.toISOString(),
    changedAtUtc: transaction.committedAtUtc,
    releaseCandidate: loaded.plan.releaseCandidate,
    activationCandidate: {
      path: loaded.artifact.path,
      sha256: loaded.artifact.sha256,
    },
    authorization: {
      path: authorizationArtifact.path,
      sha256: authorizationArtifact.sha256,
      ...authorization,
    },
    gitCandidate,
    publicationReceipt: publicationReceipt?.summary ?? null,
    transaction,
    databasePublicationStatusChanged: transaction.productionMutationPerformed,
    databasePublicationStatusConfirmed: true,
    deploymentPromoted: false,
    gitPublicationPerformed: false,
  };
  const receiptBytes = serializeMinnesotaPublicActivationDocument(receipt);
  const target = safeOutput(
    root,
    options.receiptPath,
    "production-publication-receipts",
    `mn-precinct-${mode}-${loaded.artifact.sha256.slice(0, 12)}-${sha256(receiptBytes).slice(0, 12)}.json`,
  );
  return {
    mode,
    decision: mode === "publish"
      ? recoveryOnly
        ? "DATABASE_PUBLICATION_RECEIPT_RECOVERED"
        : "DATABASE_PUBLISHED_VERIFY_ALREADY_DEPLOYED_APPLICATION"
      : recoveryOnly
        ? "DATABASE_ROLLBACK_RECEIPT_RECOVERED"
        : "DATABASE_ROLLED_BACK_APPLICATION_ALREADY_RESTORED",
    receipt: writeImmutable(target, receipt),
    transaction,
    databasePublicationStatusChanged: transaction.productionMutationPerformed,
    databasePublicationStatusConfirmed: true,
    deploymentPromoted: false,
  };
}

async function main() {
  const result = await runMinnesotaGeographyPublication(
    parseArguments(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

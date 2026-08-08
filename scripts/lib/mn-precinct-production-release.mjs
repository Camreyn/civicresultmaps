import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyMinnesotaPrecinctGisTransaction,
  validateMinnesotaPrecinctGisClient,
} from "./mn-precinct-gis-db.mjs";
import {
  assertMinnesotaReleaseCandidateDocument,
  minnesotaPrecinctSchemaContract,
  sha256,
} from "./mn-precinct-production-preflight.mjs";

export const MINNESOTA_PRODUCTION_DATABASE_SCOPES = Object.freeze([
  "apply_migration_0008",
  "load_mn_precinct_results_and_geometry_hidden",
  "increment_public_data_revision",
]);

const MAX_EVIDENCE_AGE_MS = 4 * 60 * 60 * 1000;

export const MINNESOTA_OWNER_CONFIRMATION_TEXT =
  "I confirm the exact hash-pinned Minnesota release review and clean integration tree. This confirmation does not authorize a production write, public geometry publication, canonical activation, deployment, or Git publication.";

function query(client, lines, params = []) {
  return client.unsafe(Array.isArray(lines) ? lines.join("\n") : lines, params);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function semanticallyEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Minnesota production authorization requires " + label);
  }
  return value.trim();
}

export function normalizeMinnesotaReleaseIdentity(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

export function buildMinnesotaProductionAuthorizationTemplate(
  releaseCandidate,
) {
  return {
    schemaVersion: 1,
    state: "MN",
    decision: "NO_GO_PRODUCTION",
    authorizationId: null,
    releaseCandidate: {
      id: releaseCandidate.id,
      sha256: releaseCandidate.sha256,
    },
    authorizedAtUtc: null,
    expiresAtUtc: null,
    people: {
      authorizedBy: null,
      operator: null,
      verifier: null,
      rollbackOwner: null,
    },
    deploymentWindow: {
      startsAtUtc: null,
      endsAtUtc: null,
      rollbackDecisionAtUtc: null,
    },
    evidence: {
      preflight: { path: null, sha256: null },
      backupManifest: { path: null, sha256: null },
      releaseOverlay: { path: null, sha256: null },
      releaseReview: { path: null, sha256: null },
      releaseConfirmation: { path: null, sha256: null },
    },
    scopes: [...MINNESOTA_PRODUCTION_DATABASE_SCOPES],
    exclusions: [
      "public geometry file publication",
      "canonical manifest or registry activation",
      "public deployment alias promotion",
      "Git commit, push, or pull-request publication",
    ],
    acknowledgement:
      "This template is not authorization. Change decision only after all named evidence and people are recorded and independently reviewed.",
  };
}

export function validateMinnesotaProductionPreflightEvidence(
  report,
  context,
) {
  if (
    report?.schemaVersion !== 1
    || report?.state !== "MN"
    || report?.productionMutationPerformed !== false
    || report?.database?.transactionReadOnly !== true
    || report?.invalidConstraints !== 0
    || !["absent", "complete"].includes(report?.migration0008?.status)
    || report?.releaseCandidate?.id !== context.releaseCandidate.id
    || report?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || !/^[a-f0-9]{64}$/.test(report?.endpointFingerprint ?? "")
    || !/^[a-f0-9]{64}$/.test(context.endpointFingerprint ?? "")
    || report?.endpointFingerprint !== context.endpointFingerprint
    || !Number.isInteger(Number(report?.publicRevision))
    || Number(report.publicRevision) < 0
  ) {
    throw new Error("Minnesota production preflight evidence is incompatible");
  }
  if (!validIso(report.capturedAtUtc)) {
    throw new Error("Minnesota production preflight timestamp is invalid");
  }
  const age = context.now.getTime() - Date.parse(report.capturedAtUtc);
  if (age < 0 || age > MAX_EVIDENCE_AGE_MS) {
    throw new Error("Minnesota production preflight is outside the four-hour release window");
  }
  requireNonEmpty(report.database.name, "the preflight database name");
  return {
    databaseName: report.database.name,
    migrationStatus: report.migration0008.status,
    capturedAtUtc: report.capturedAtUtc,
    publicRevision: report.publicRevision,
  };
}

export function validateMinnesotaProductionBackupEvidence(
  manifest,
  context,
) {
  if (
    !Number.isInteger(manifest?.manifestVersion)
    || manifest.manifestVersion < 3
    || manifest?.backupPurpose !== "mn-precinct-production-release-rollback"
    || !/^[a-f0-9]{64}$/.test(manifest?.dumpSha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(manifest?.sourceEndpointFingerprint ?? "")
    || !/^[a-f0-9]{64}$/.test(context.endpointFingerprint ?? "")
    || manifest?.sourceEndpointFingerprint !== context.endpointFingerprint
    || manifest?.releaseCandidate?.id !== context.releaseCandidate.id
    || manifest?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || manifest?.remoteMutationPerformed !== false
    || manifest?.dumpFormat !== "custom"
    || Number(manifest?.pgClientMajor) !== 17
    || Math.trunc(Number(manifest?.sourceServerVersionNum) / 10_000) !== 17
    || JSON.stringify(manifest?.includedSchemas) !== JSON.stringify(["public"])
    || !Array.isArray(manifest?.excludedTableDataPatterns)
    || manifest.excludedTableDataPatterns.length !== 0
    || !Number.isInteger(Number(manifest?.sourcePublicTableCount))
    || Number(manifest.sourcePublicTableCount) < 1
    || !manifest?.sourcePublicTableRowCounts
    || typeof manifest.sourcePublicTableRowCounts !== "object"
    || Array.isArray(manifest.sourcePublicTableRowCounts)
    || Number(manifest?.sourceInvalidConstraints) !== 0
    || manifest?.restoreVerification?.verified !== true
    || !validIso(manifest?.restoreVerification?.verifiedAtUtc)
    || typeof manifest?.restoreVerification?.database !== "string"
    || !manifest.restoreVerification.database.trim()
    || manifest?.restoreVerification?.defaultTransactionReadOnly !== true
    || manifest?.restoreVerification?.exactSourceTableSet !== true
    || manifest?.restoreVerification?.exactSourceRowCounts !== true
    || Number(manifest?.restoreVerification?.invalidConstraints) !== 0
    || !Number.isInteger(Number(manifest?.restoreVerification?.publicTableCount))
    || !Number.isInteger(Number(manifest?.restoreVerification?.tableDataEntryCount))
    || !manifest?.restoreVerification?.publicTableRowCounts
    || typeof manifest.restoreVerification.publicTableRowCounts !== "object"
    || Array.isArray(manifest.restoreVerification.publicTableRowCounts)
    || !validIso(manifest?.createdAtUtc)
  ) {
    throw new Error("Minnesota production backup evidence is incomplete or incompatible");
  }
  const age = context.now.getTime() - Date.parse(manifest.createdAtUtc);
  if (age < 0 || age > MAX_EVIDENCE_AGE_MS) {
    throw new Error("Minnesota production backup is outside the four-hour release window");
  }
  const createdAt = Date.parse(manifest.createdAtUtc);
  const preflightCapturedAt = Date.parse(context.preflightCapturedAtUtc ?? "");
  const restoreVerifiedAt = Date.parse(
    manifest.restoreVerification.verifiedAtUtc,
  );
  const restoreAge = context.now.getTime() - restoreVerifiedAt;
  if (
    restoreVerifiedAt < createdAt
    || Number.isNaN(preflightCapturedAt)
    || createdAt <= preflightCapturedAt
    || restoreAge < 0
    || restoreAge > MAX_EVIDENCE_AGE_MS
  ) {
    throw new Error(
      "Minnesota production backup restore verification is outside the four-hour release window, predates the backup, or the backup predates preflight",
    );
  }
  const sourceTableCount = Number(manifest.sourcePublicTableCount);
  const restoredTableCount = Number(manifest.restoreVerification.publicTableCount);
  const tableDataEntryCount = Number(manifest.restoreVerification.tableDataEntryCount);
  const validCounts = (value) => Object.values(value).every(
    (count) => Number.isInteger(Number(count)) && Number(count) >= 0,
  );
  if (
    sourceTableCount !== restoredTableCount
    || sourceTableCount !== tableDataEntryCount
    || Object.keys(manifest.sourcePublicTableRowCounts).length !== sourceTableCount
    || Object.keys(manifest.restoreVerification.publicTableRowCounts).length
      !== restoredTableCount
    || !validCounts(manifest.sourcePublicTableRowCounts)
    || !validCounts(manifest.restoreVerification.publicTableRowCounts)
    || !semanticallyEqual(
      manifest.sourcePublicTableRowCounts,
      manifest.restoreVerification.publicTableRowCounts,
    )
  ) {
    throw new Error("Minnesota production backup exact table or row-count proof drifted");
  }
  return {
    dumpFile: requireNonEmpty(manifest.dumpFile, "the backup dump filename"),
    dumpSha256: manifest.dumpSha256,
    createdAtUtc: manifest.createdAtUtc,
    restoreVerifiedAtUtc: manifest.restoreVerification.verifiedAtUtc,
    sourcePublicTableCount: sourceTableCount,
    releaseCandidateSha256: manifest.releaseCandidate.sha256,
  };
}

export function buildMinnesotaOwnerConfirmationTemplate(context) {
  if (
    context?.overlayDocument?.schemaVersion !== 1
    || context.overlayDocument.state !== "MN"
    || context.overlayDocument.decision !== "REVIEW_REQUIRED"
    || context.overlayDocument.sourceReleaseCandidate?.path
      !== context.releaseCandidatePath
    || context.overlayDocument.sourceReleaseCandidate?.sha256
      !== context.releaseCandidate.sha256
    || context?.reviewDocument?.schemaVersion !== 1
    || context.reviewDocument.state !== "MN"
    || context.reviewDocument.decision !== "READY_FOR_HUMAN_CONFIRMATION"
    || context.reviewDocument.sourceReleaseCandidate?.path
      !== context.releaseCandidatePath
    || context.reviewDocument.sourceReleaseCandidate?.sha256
      !== context.releaseCandidate.sha256
    || context.reviewDocument.sourceOverlay?.path !== context.overlay.path
    || context.reviewDocument.sourceOverlay?.sha256 !== context.overlay.sha256
    || context.reviewDocument.isolatedDiffGate?.machineClassificationsComplete
      !== true
    || context.reviewDocument.isolatedDiffGate?.unclassifiedReviewFiles !== 0
    || context.reviewDocument.safety?.productionContacted !== false
    || context.reviewDocument.safety?.productionMutationPerformed !== false
    || context.reviewDocument.safety?.publicFileWritten !== false
    || context.reviewDocument.safety?.canonicalManifestChanged !== false
    || context.reviewDocument.safety?.gitMutationPerformed !== false
  ) {
    throw new Error("Minnesota owner-confirmation template requires the exact reviewed release chain");
  }
  if (
    !/^[a-f0-9]{40}$/.test(context?.cleanIntegration?.gitSha ?? "")
    || !/^[a-f0-9]{40}$/.test(context?.cleanIntegration?.gitTreeSha ?? "")
    || !validSha256(context?.cleanIntegration?.trackedStatusSha256)
    || context.cleanIntegration.trackedStatusClean !== true
  ) {
    throw new Error("Minnesota owner-confirmation template requires a clean tracked integration tree");
  }
  return {
    schemaVersion: 1,
    state: "MN",
    decision: "NO_GO_OWNER_CONFIRMATION",
    confirmedAtUtc: null,
    confirmedBy: null,
    confirmationText: MINNESOTA_OWNER_CONFIRMATION_TEXT,
    candidate: {
      path: context.releaseCandidatePath,
      sha256: context.releaseCandidate.sha256,
    },
    overlay: {
      path: context.overlay.path,
      sha256: context.overlay.sha256,
    },
    review: {
      path: context.review.path,
      sha256: context.review.sha256,
      decisionBeforeConfirmation: "READY_FOR_HUMAN_CONFIRMATION",
      confirmed: false,
    },
    cleanIntegration: {
      gitSha: context.cleanIntegration.gitSha,
      gitTreeSha: context.cleanIntegration.gitTreeSha,
      trackedStatusSha256: context.cleanIntegration.trackedStatusSha256,
      trackedStatusClean: true,
      diffCheckPassed: true,
      missingPaths: 0,
      unexpectedPaths: 0,
    },
    authorization: {
      productionMutation: false,
      publicGeometryPublication: false,
      canonicalEligibilityActivation: false,
      deployment: false,
      gitPublication: false,
    },
    acknowledgement:
      "This deterministic template is not confirmation. The project owner must review the exact artifacts and clean Git tree, then set decision, confirmedAtUtc, confirmedBy, and review.confirmed explicitly.",
  };
}

export function validateMinnesotaProductionReviewEvidence(
  evidence,
  context,
) {
  const { overlay, review, confirmation } = evidence;
  if (
    overlay?.schemaVersion !== 1
    || overlay?.state !== "MN"
    || overlay?.decision !== "REVIEW_REQUIRED"
    || overlay?.sourceReleaseCandidate?.path !== context.releaseCandidatePath
    || overlay?.sourceReleaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || overlay?.productionMutationPerformed !== false
    || overlay?.publicFileWritten !== false
    || overlay?.canonicalManifestChanged !== false
    || overlay?.gitMutationPerformed !== false
  ) {
    throw new Error("Minnesota release overlay evidence is incompatible");
  }
  if (
    review?.schemaVersion !== 1
    || review?.state !== "MN"
    || review?.decision !== "READY_FOR_HUMAN_CONFIRMATION"
    || review?.sourceReleaseCandidate?.path !== context.releaseCandidatePath
    || review?.sourceReleaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || review?.sourceOverlay?.path !== context.overlay.path
    || review?.sourceOverlay?.sha256 !== context.overlay.sha256
    || review?.isolatedDiffGate?.machineClassificationsComplete !== true
    || review?.isolatedDiffGate?.unclassifiedReviewFiles !== 0
    || review?.safety?.productionContacted !== false
    || review?.safety?.productionMutationPerformed !== false
    || review?.safety?.publicFileWritten !== false
    || review?.safety?.canonicalManifestChanged !== false
    || review?.safety?.gitMutationPerformed !== false
  ) {
    throw new Error("Minnesota release review evidence is incompatible");
  }
  if (
    confirmation?.schemaVersion !== 1
    || confirmation?.state !== "MN"
    || confirmation?.decision !== "GO_OWNER_CONFIRMATION"
    || !validIso(confirmation?.confirmedAtUtc)
    || confirmation?.confirmationText !== MINNESOTA_OWNER_CONFIRMATION_TEXT
    || !confirmation?.confirmedBy?.trim?.()
    || confirmation?.candidate?.path !== context.releaseCandidatePath
    || confirmation?.candidate?.sha256 !== context.releaseCandidate.sha256
    || confirmation?.overlay?.path !== context.overlay.path
    || confirmation?.overlay?.sha256 !== context.overlay.sha256
    || confirmation?.review?.path !== context.review.path
    || confirmation?.review?.sha256 !== context.review.sha256
    || confirmation?.review?.decisionBeforeConfirmation
      !== "READY_FOR_HUMAN_CONFIRMATION"
    || confirmation?.review?.confirmed !== true
    || confirmation?.cleanIntegration?.diffCheckPassed !== true
    || confirmation?.cleanIntegration?.trackedStatusClean !== true
    || !validSha256(confirmation?.cleanIntegration?.trackedStatusSha256)
    || !/^[a-f0-9]{40}$/.test(confirmation?.cleanIntegration?.gitSha ?? "")
    || !/^[a-f0-9]{40}$/.test(confirmation?.cleanIntegration?.gitTreeSha ?? "")
    || !semanticallyEqual(confirmation.cleanIntegration, context.cleanIntegration)
    || confirmation?.cleanIntegration?.missingPaths !== 0
    || confirmation?.cleanIntegration?.unexpectedPaths !== 0
    || confirmation?.authorization?.productionMutation !== false
    || confirmation?.authorization?.publicGeometryPublication !== false
    || confirmation?.authorization?.canonicalEligibilityActivation !== false
    || confirmation?.authorization?.deployment !== false
    || confirmation?.authorization?.gitPublication !== false
  ) {
    throw new Error("Minnesota release human-confirmation evidence is incompatible");
  }
  const confirmedAt = Date.parse(confirmation.confirmedAtUtc);
  if (
    confirmedAt > context.now.getTime()
    || (
      validIso(context.authorizedAtUtc)
      && confirmedAt > Date.parse(context.authorizedAtUtc)
    )
  ) {
    throw new Error("Minnesota release confirmation postdates its authorization");
  }
  if (
    typeof context.operator === "string"
    && context.operator.trim()
    && normalizeMinnesotaReleaseIdentity(confirmation.confirmedBy)
      === normalizeMinnesotaReleaseIdentity(context.operator)
  ) {
    throw new Error("Minnesota release owner confirmer and production operator must be different people");
  }
  return {
    overlay: {
      path: context.overlay.path,
      sha256: context.overlay.sha256,
    },
    review: {
      path: context.review.path,
      sha256: context.review.sha256,
      decision: review.decision,
    },
    confirmation: {
      path: context.confirmation.path,
      sha256: context.confirmation.sha256,
      confirmedAtUtc: confirmation.confirmedAtUtc,
      confirmedBy: confirmation.confirmedBy.trim(),
    },
  };
}

export function validateMinnesotaProductionAuthorization(
  authorization,
  context,
) {
  if (
    authorization?.schemaVersion !== 1
    || authorization?.state !== "MN"
    || authorization?.decision !== "GO_PRODUCTION"
    || authorization?.releaseCandidate?.id !== context.releaseCandidate.id
    || authorization?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
  ) {
    throw new Error("Minnesota production authorization is absent or does not match the package");
  }
  const scopes = new Set(authorization.scopes ?? []);
  if (
    scopes.size !== MINNESOTA_PRODUCTION_DATABASE_SCOPES.length
    || MINNESOTA_PRODUCTION_DATABASE_SCOPES.some((scope) => !scopes.has(scope))
  ) {
    throw new Error("Minnesota production authorization scopes are incomplete");
  }
  const times = [
    authorization.authorizedAtUtc,
    authorization.expiresAtUtc,
    authorization.deploymentWindow?.startsAtUtc,
    authorization.deploymentWindow?.endsAtUtc,
    authorization.deploymentWindow?.rollbackDecisionAtUtc,
  ];
  if (times.some((value) => !validIso(value))) {
    throw new Error("Minnesota production authorization timestamps are incomplete");
  }
  const now = context.now.getTime();
  const start = Date.parse(authorization.deploymentWindow.startsAtUtc);
  const end = Date.parse(authorization.deploymentWindow.endsAtUtc);
  const rollback = Date.parse(authorization.deploymentWindow.rollbackDecisionAtUtc);
  const expires = Date.parse(authorization.expiresAtUtc);
  const authorized = Date.parse(authorization.authorizedAtUtc);
  if (
    authorized > now
    || expires <= authorized
    || start > now
    || end < now
    || expires < now
    || rollback < start
    || rollback > end
    || rollback < now
  ) {
    throw new Error("Minnesota production authorization is outside its deployment window");
  }
  const people = {
    authorizedBy: requireNonEmpty(authorization.people?.authorizedBy, "authorizedBy"),
    operator: requireNonEmpty(authorization.people?.operator, "operator"),
    verifier: requireNonEmpty(authorization.people?.verifier, "verifier"),
    rollbackOwner: requireNonEmpty(authorization.people?.rollbackOwner, "rollbackOwner"),
  };
  const identityKeys = Object.values(people).map(normalizeMinnesotaReleaseIdentity);
  if (new Set(identityKeys).size < 2) {
    throw new Error("Minnesota production authorization requires independent named roles");
  }
  if (
    normalizeMinnesotaReleaseIdentity(people.operator)
      === normalizeMinnesotaReleaseIdentity(people.verifier)
  ) {
    throw new Error("Minnesota production operator and verifier must be different people");
  }
  if (
    authorization.evidence?.preflight?.path !== context.preflightPath
    || authorization.evidence?.preflight?.sha256 !== context.preflightSha256
    || authorization.evidence?.backupManifest?.path !== context.backupManifestPath
    || authorization.evidence?.backupManifest?.sha256 !== context.backupManifestSha256
    || authorization.evidence?.releaseOverlay?.path !== context.releaseOverlayPath
    || authorization.evidence?.releaseOverlay?.sha256 !== context.releaseOverlaySha256
    || authorization.evidence?.releaseReview?.path !== context.releaseReviewPath
    || authorization.evidence?.releaseReview?.sha256 !== context.releaseReviewSha256
    || authorization.evidence?.releaseConfirmation?.path
      !== context.releaseConfirmationPath
    || authorization.evidence?.releaseConfirmation?.sha256
      !== context.releaseConfirmationSha256
    || !validSha256(context.releaseOverlaySha256)
    || !validSha256(context.releaseReviewSha256)
    || !validSha256(context.releaseConfirmationSha256)
  ) {
    throw new Error("Minnesota production authorization evidence hashes do not match");
  }
  return {
    authorizationId: requireNonEmpty(
      authorization.authorizationId,
      "an authorization ID",
    ),
    people,
    deploymentWindow: authorization.deploymentWindow,
  };
}

async function inspectSchema(tx) {
  const tableRows = await query(tx, [
    "select table_name from information_schema.tables",
    "where table_schema='public' and table_name = any($1::text[])",
    "order by table_name",
  ], [[...minnesotaPrecinctSchemaContract.tables]]);
  const columnRows = await query(tx, [
    "select table_name,column_name from information_schema.columns",
    "where table_schema='public' and (table_name,column_name) in (",
    " ('result_rows','reporting_unit_id'),",
    " ('review_rows','reporting_unit_id'),",
    " ('turnout_rows','reporting_unit_id'))",
    "order by table_name,column_name",
  ]);
  const tables = new Set(tableRows.map((row) => String(row.table_name)));
  const columns = new Set(
    columnRows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const presentTables = minnesotaPrecinctSchemaContract.tables.filter(
    (name) => tables.has(name),
  );
  const presentColumns = minnesotaPrecinctSchemaContract.reportingUnitColumns.filter(
    ([table, column]) => columns.has(`${table}.${column}`),
  );
  if (!presentTables.length && !presentColumns.length) return "absent";
  if (
    presentTables.length === minnesotaPrecinctSchemaContract.tables.length
    && presentColumns.length
      === minnesotaPrecinctSchemaContract.reportingUnitColumns.length
  ) {
    return "complete";
  }
  return "partial_blocked";
}

export async function assertMinnesotaProductionPreconditions(
  tx,
  preflight,
) {
  await query(tx, "select set_config('lock_timeout','30s',true)");
  await query(
    tx,
    "select pg_advisory_xact_lock(hashtextextended('crm-mn-precinct-gis-release-v1',0))",
  );
  const identity = await query(tx, [
    "select current_database() database_name,",
    " current_setting('transaction_read_only') transaction_read_only",
  ]);
  if (
    identity.length !== 1
    || String(identity[0].database_name) !== preflight.database.name
    || String(identity[0].transaction_read_only) !== "off"
  ) {
    throw new Error("Minnesota production database identity changed after preflight");
  }
  const schema = await inspectSchema(tx);
  if (schema !== preflight.migration0008.status) {
    throw new Error("Minnesota production migration state changed after preflight");
  }
  const invalid = await query(tx, [
    "select count(*)::int count from pg_constraint",
    "where connamespace='public'::regnamespace and not convalidated",
  ]);
  if (Number(invalid[0]?.count) !== preflight.invalidConstraints) {
    throw new Error("Minnesota production constraint state changed after preflight");
  }
  const revisionRows = await query(tx, [
    "select revision::int revision from public_data_revisions where scope='public'",
  ]);
  const revision = revisionRows.length ? Number(revisionRows[0].revision) : null;
  if (revision !== preflight.publicRevision) {
    throw new Error("Minnesota production public revision changed after preflight");
  }
  const coreRows = await query(tx, [
    "select e.year,e.election_date,",
    " count(rr.id)::int result_rows,",
    " count(rr.id) filter (where rr.level='precinct')::int precinct_result_rows,",
    " count(rr.id) filter (where rr.level='county')::int county_result_rows",
    "from elections e",
    "left join contests c on c.election_id=e.id and c.state_code='MN'",
    "left join result_rows rr on rr.contest_id=c.id and rr.state_code='MN'",
    "where e.office='president' and (c.id is not null or e.year in (2012,2016,2020,2024))",
    "group by e.year,e.election_date order by e.year",
  ]);
  const coreYears = coreRows.map((row) => ({
    year: Number(row.year),
    electionDate: String(row.election_date),
    resultRows: Number(row.result_rows),
    precinctResultRows: Number(row.precinct_result_rows),
    countyResultRows: Number(row.county_result_rows),
  }));
  if (!semanticallyEqual(coreYears, preflight.minnesota.coreYearRows)) {
    throw new Error("Minnesota production result year set changed after preflight");
  }
  const sourceRows = await query(tx, [
    "select slug,election_year,status,local_artifact from source_documents",
    "where state_code='MN' order by election_year,slug",
  ]);
  const sourceDocuments = sourceRows.map((row) => ({
    slug: String(row.slug),
    electionYear: Number(row.election_year),
    status: String(row.status),
    localArtifact: String(row.local_artifact ?? ""),
  }));
  if (!semanticallyEqual(sourceDocuments, preflight.minnesota.sourceDocuments)) {
    throw new Error("Minnesota production source-document set changed after preflight");
  }
  let precinctYearRows = [];
  if (schema === "complete") {
    const rows = await query(tx, [
      "select e.year,",
      " (select count(*)::int from reporting_units ru",
      "  where ru.state_code='MN' and ru.election_id=e.id",
      "   and ru.reporting_grain='precinct') reporting_units,",
      " (select count(*)::int from result_rows rr",
      "  join contests c on c.id=rr.contest_id",
      "  where rr.state_code='MN' and c.election_id=e.id",
      "   and rr.level='precinct' and rr.reporting_unit_id is not null)",
      "  linked_precinct_result_rows,",
      " (select count(*)::int from geography_versions gv",
      "  where gv.state_code='MN' and gv.election_id=e.id",
      "   and gv.geography_type='precinct') geography_versions,",
      " (select count(*)::int from geography_features gf",
      "  join geography_versions gv on gv.id=gf.geometry_version_id",
      "  where gv.state_code='MN' and gv.election_id=e.id",
      "   and gv.geography_type='precinct') geometry_features,",
      " (select count(*)::int from reporting_unit_geometry_crosswalks x",
      "  join geography_versions gv on gv.id=x.geometry_version_id",
      "  join reporting_units ru on ru.id=x.reporting_unit_id",
      "  where gv.state_code='MN' and gv.election_id=e.id",
      "   and ru.election_id=e.id and x.relationship_type='one_to_one'",
      "   and x.match_method='exact_official_id'",
      "   and x.review_status='reviewed' and x.confidence='high')",
      "  reviewed_exact_crosswalks",
      "from elections e where e.office='president'",
      " and e.year in (2012,2016,2020,2024) order by e.year",
    ]);
    precinctYearRows = rows.map((row) => ({
      year: Number(row.year),
      reportingUnits: Number(row.reporting_units),
      linkedPrecinctResultRows: Number(row.linked_precinct_result_rows),
      geographyVersions: Number(row.geography_versions),
      geometryFeatures: Number(row.geometry_features),
      reviewedExactCrosswalks: Number(row.reviewed_exact_crosswalks),
    }));
  }
  if (!semanticallyEqual(
    precinctYearRows,
    preflight.minnesota.precinctYearRows,
  )) {
    throw new Error("Minnesota production precinct row set changed after preflight");
  }
  return {
    databaseName: preflight.database.name,
    migrationStatus: schema,
    publicRevision: revision,
    coreYearRows: coreYears,
    precinctYearRows,
    sourceDocuments,
  };
}

export async function ensureMinnesotaPrecinctSchema(
  tx,
  migrationBytes,
  expectedSha256,
) {
  if (sha256(migrationBytes) !== expectedSha256) {
    throw new Error("Minnesota production migration SHA-256 drifted");
  }
  const before = await inspectSchema(tx);
  if (before === "partial_blocked") {
    throw new Error("Minnesota production schema is partially migrated");
  }
  if (before === "absent") {
    const statements = migrationBytes.toString("utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    if (statements.length < 20) {
      throw new Error("Minnesota production migration statement set is incomplete");
    }
    for (const statement of statements) await query(tx, statement);
  }
  const after = await inspectSchema(tx);
  if (after !== "complete") {
    throw new Error("Minnesota production migration did not create the complete schema");
  }
  const invalid = await query(tx, [
    "select count(*)::int count from pg_constraint",
    "where connamespace='public'::regnamespace and not convalidated",
  ]);
  if (Number(invalid[0]?.count) !== 0) {
    throw new Error("Minnesota production migration left invalid constraints");
  }
  return { before, after, statementsApplied: before === "absent" };
}

export async function applyMinnesotaProductionReleaseTransaction(
  tx,
  options,
) {
  const packageSha256 = options.releaseCandidate.sha256;
  const packageContract = assertMinnesotaReleaseCandidateDocument(
    options.packageDocument,
    packageSha256,
  );
  if (options.packageDocument.decision !== "NO_GO_PRODUCTION") {
    throw new Error("Unexpected Minnesota candidate decision state");
  }
  if (!options.preflightReport) {
    throw new Error("Minnesota production transaction requires the approved preflight report");
  }
  const preconditions = await assertMinnesotaProductionPreconditions(
    tx,
    options.preflightReport,
  );
  if (
    !validIso(options.transactionAtUtc)
    || !Number.isInteger(Number(preconditions.publicRevision))
    || Number(preconditions.publicRevision) < 0
  ) {
    throw new Error("Minnesota production transaction requires a pinned execution time and revision");
  }
  const releaseAudit = {
    ...options.releaseAudit,
    transaction: {
      executedAtUtc: options.transactionAtUtc,
      publicRevision: Number(preconditions.publicRevision) + 1,
    },
  };
  const schema = await ensureMinnesotaPrecinctSchema(
    tx,
    options.migrationBytes,
    packageContract.migration.sha256,
  );
  const executionContext = {
    mode: "production_release",
    releaseCandidateId: packageContract.id,
    releasePackageSha256: packageSha256,
    databaseName: options.databaseName,
    productionReleaseAudit: releaseAudit,
  };
  const applied = await applyMinnesotaPrecinctGisTransaction(
    tx,
    options.plan,
    { executionContext },
  );
  const validation = await validateMinnesotaPrecinctGisClient(
    tx,
    options.plan,
    { executionContext, readOnlySession: false },
  );
  if (
    Number(applied.revision) !== releaseAudit.transaction.publicRevision
    || Number(validation.revision) !== releaseAudit.transaction.publicRevision
  ) {
    throw new Error("Minnesota production public revision did not match the durable release audit");
  }
  const totals = validation.years.reduce((result, year) => ({
    reportingUnits: result.reportingUnits + year.reportingUnits,
    candidateResultRows: result.candidateResultRows + year.resultRows,
    geometryFeatures: result.geometryFeatures + year.features,
    reviewedExactCrosswalks:
      result.reviewedExactCrosswalks + year.reviewedCrosswalks,
    zeroVoteUnits: result.zeroVoteUnits + year.zeroVoteUnits,
  }), {
    reportingUnits: 0,
    candidateResultRows: 0,
    geometryFeatures: 0,
    reviewedExactCrosswalks: 0,
    zeroVoteUnits: 0,
  });
  for (const [key, expected] of Object.entries(packageContract.totals)) {
    if (key === "elections") continue;
    if (totals[key] !== expected) {
      throw new Error("Minnesota production transaction total drifted: " + key);
    }
  }
  if (options.testOnlyFailBeforeCommit === true) {
    throw new Error("Intentional Minnesota production release rollback before commit");
  }
  return {
    preconditions,
    schema,
    applied,
    validation,
    totals,
    committedAtUtc: releaseAudit.transaction.executedAtUtc,
    releaseAudit,
    canonicalManifestChanged: false,
    publicFileWritten: false,
    publicDeliveryAuthorized: false,
  };
}

export function readAndVerifyEvidenceFile(root, relativePath, expectedSha256) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(".etl/")
  ) {
    throw new Error("Minnesota release evidence path must remain under .etl");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const etlRoot = path.resolve(root, ".etl");
  if (!absolute.startsWith(etlRoot + path.sep)) {
    throw new Error("Minnesota release evidence escapes .etl");
  }
  const bytes = readFileSync(absolute);
  const digest = sha256(bytes);
  if (expectedSha256 && digest !== expectedSha256) {
    throw new Error("Minnesota release evidence SHA-256 drifted: " + relativePath);
  }
  return { path: relativePath, absolute, bytes, sha256: digest };
}

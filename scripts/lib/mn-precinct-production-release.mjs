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

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Minnesota production authorization requires " + label);
  }
  return value.trim();
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
    Number(manifest?.manifestVersion) < 3
    || manifest?.backupPurpose !== "mn-precinct-production-release-rollback"
    || !/^[a-f0-9]{64}$/.test(manifest?.dumpSha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(manifest?.sourceEndpointFingerprint ?? "")
    || !/^[a-f0-9]{64}$/.test(context.endpointFingerprint ?? "")
    || manifest?.sourceEndpointFingerprint !== context.endpointFingerprint
    || manifest?.releaseCandidate?.id !== context.releaseCandidate.id
    || manifest?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || manifest?.remoteMutationPerformed !== false
    || JSON.stringify(manifest?.includedSchemas) !== JSON.stringify(["public"])
    || !Array.isArray(manifest?.excludedTableDataPatterns)
    || manifest.excludedTableDataPatterns.length !== 0
    || manifest?.restoreVerification?.verified !== true
    || !validIso(manifest?.restoreVerification?.verifiedAtUtc)
    || !validIso(manifest?.createdAtUtc)
  ) {
    throw new Error("Minnesota production backup evidence is incomplete or incompatible");
  }
  const age = context.now.getTime() - Date.parse(manifest.createdAtUtc);
  if (age < 0 || age > MAX_EVIDENCE_AGE_MS) {
    throw new Error("Minnesota production backup is outside the four-hour release window");
  }
  return {
    dumpFile: requireNonEmpty(manifest.dumpFile, "the backup dump filename"),
    dumpSha256: manifest.dumpSha256,
    createdAtUtc: manifest.createdAtUtc,
    restoreVerifiedAtUtc: manifest.restoreVerification.verifiedAtUtc,
    releaseCandidateSha256: manifest.releaseCandidate.sha256,
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
  ) {
    throw new Error("Minnesota production authorization is outside its deployment window");
  }
  const people = {
    authorizedBy: requireNonEmpty(authorization.people?.authorizedBy, "authorizedBy"),
    operator: requireNonEmpty(authorization.people?.operator, "operator"),
    verifier: requireNonEmpty(authorization.people?.verifier, "verifier"),
    rollbackOwner: requireNonEmpty(authorization.people?.rollbackOwner, "rollbackOwner"),
  };
  if (new Set(Object.values(people)).size < 2) {
    throw new Error("Minnesota production authorization requires independent named roles");
  }
  if (people.operator === people.verifier) {
    throw new Error("Minnesota production operator and verifier must be different people");
  }
  if (
    authorization.evidence?.preflight?.sha256 !== context.preflightSha256
    || authorization.evidence?.backupManifest?.sha256 !== context.backupManifestSha256
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

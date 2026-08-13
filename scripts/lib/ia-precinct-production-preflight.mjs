import { createHash } from "node:crypto";

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const PRECINCT_TABLES = Object.freeze([
  "geography_features",
  "geography_versions",
  "reporting_unit_geometry_crosswalks",
  "reporting_units",
]);

const REPORTING_UNIT_COLUMNS = Object.freeze([
  ["result_rows", "reporting_unit_id"],
  ["review_rows", "reporting_unit_id"],
  ["turnout_rows", "reporting_unit_id"],
]);

function query(client, lines, params = []) {
  return client.unsafe(Array.isArray(lines) ? lines.join("\n") : lines, params);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function productionEndpointFingerprint(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Iowa production preflight requires a valid PostgreSQL URL");
  }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    throw new Error("Iowa production preflight requires a PostgreSQL URL");
  }
  if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Iowa production preflight refuses a loopback database URL");
  }
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\//, "");
  if (!databaseName) {
    throw new Error("Iowa production preflight requires a database name");
  }
  return createHash("sha256")
    .update([
      parsed.hostname.toLowerCase(),
      parsed.port || "5432",
      databaseName,
    ].join("\n"))
    .digest("hex");
}

export function assertIowaReleaseCandidateDocument(
  document,
  packageSha256,
) {
  if (!/^[a-f0-9]{64}$/.test(packageSha256 ?? "")) {
    throw new Error("Iowa release package SHA-256 is invalid");
  }
  if (
    document?.schemaVersion !== 1
    || document?.id !== "ia-precinct-gis-three-election-v1"
    || document?.state !== "IA"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.explicitProductionAuthorizationRequired !== true
    || document?.safety?.productionMutationPerformed !== false
    || document?.safety?.publicFileWritten !== false
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.canonicalRegistryChanged !== false
  ) {
    throw new Error("Iowa release candidate does not match the guarded contract");
  }
  const expectedTotals = {
    elections: 3,
    reportingUnits: 4_994,
    candidateResultRows: 14_982,
    zeroVoteUnits: 0,
    geometryFeatures: 4_994,
    reviewedExactCrosswalks: 4_994,
  };
  for (const [key, value] of Object.entries(expectedTotals)) {
    if (Number(document?.totals?.[key]) !== value) {
      throw new Error("Iowa release candidate total drifted: " + key);
    }
  }
  const migrations = document?.databaseActivationContract?.migrations;
  const expectedMigrationPaths = [
    "drizzle/0008_typical_thunderbolts.sql",
    "drizzle/0009_public_wolfpack.sql",
  ];
  if (
    !Array.isArray(migrations)
    || migrations.length !== expectedMigrationPaths.length
    || migrations.some((migration, index) =>
      migration?.path !== expectedMigrationPaths[index]
      || !Number.isSafeInteger(migration?.byteCount)
      || migration.byteCount <= 0
      || !/^[a-f0-9]{64}$/.test(migration?.sha256 ?? ""))
  ) {
    throw new Error("Iowa release candidate migration pins are invalid");
  }
  const years = (document.years ?? []).map((year) => Number(year.year));
  if (JSON.stringify(years) !== JSON.stringify([2016, 2020, 2024])) {
    throw new Error("Iowa release candidate year set drifted");
  }
  return {
    id: document.id,
    sha256: packageSha256,
    migrations,
    totals: expectedTotals,
    canonicalManifestPreimages: document.years.map((year) => ({
      year: year.year,
      path: year.canonicalManifest.path,
      byteCount: year.canonicalManifest.byteCount,
      sha256: year.canonicalManifest.sha256,
      validationStatus: year.canonicalManifest.validationStatus,
      rowLevelRenderingSafe: year.canonicalManifest.rowLevelRenderingSafe,
      delivery: year.canonicalManifest.delivery,
    })),
  };
}

function migrationState(tableRows, columnRows) {
  const tables = new Set(tableRows.map((row) => String(row.table_name)));
  const columns = new Set(
    columnRows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const presentTables = PRECINCT_TABLES.filter((name) => tables.has(name));
  const presentColumns = REPORTING_UNIT_COLUMNS.filter(([table, column]) =>
    columns.has(`${table}.${column}`));
  const absent = presentTables.length === 0 && presentColumns.length === 0;
  const complete = presentTables.length === PRECINCT_TABLES.length
    && presentColumns.length === REPORTING_UNIT_COLUMNS.length;
  return {
    status: absent ? "absent" : complete ? "complete" : "partial_blocked",
    expectedTables: [...PRECINCT_TABLES],
    presentTables,
    expectedReportingUnitColumns: REPORTING_UNIT_COLUMNS.map(
      ([table, column]) => `${table}.${column}`,
    ),
    presentReportingUnitColumns: presentColumns.map(
      ([table, column]) => `${table}.${column}`,
    ),
  };
}

function derivationConstraintState(rows, schemaStatus) {
  if (schemaStatus === "absent") {
    return { status: "absent", definition: null };
  }
  if (rows.length !== 1) {
    return { status: "partial_blocked", definition: null };
  }
  const definition = String(rows[0].definition ?? "");
  return {
    status: definition.includes("secondary_reconstruction")
        && definition.includes("hybrid_reconstruction")
      ? "complete"
      : "absent",
    definition,
  };
}

export function buildIowaProductionPreflightReport(snapshot, context) {
  if (String(snapshot.identity?.transaction_read_only) !== "on") {
    throw new Error("Iowa production preflight did not use a read-only transaction");
  }
  const schema = migrationState(snapshot.precinctTables, snapshot.precinctColumns);
  if (schema.status === "partial_blocked") {
    throw new Error("Iowa production schema is partially migrated; release is blocked");
  }
  const invalidConstraints = Number(snapshot.invalidConstraints ?? NaN);
  if (!Number.isInteger(invalidConstraints)) {
    throw new Error("Iowa production preflight constraint count is invalid");
  }
  const migration0009 = derivationConstraintState(
    snapshot.derivationConstraint,
    schema.status,
  );
  if (migration0009.status === "partial_blocked") {
    throw new Error("Iowa production derivation-method constraint is ambiguous");
  }
  const report = {
    schemaVersion: 1,
    state: "IA",
    scope: "read-only Iowa precinct GIS production preflight",
    capturedAtUtc: context.capturedAtUtc,
    releaseCandidate: context.releaseCandidate,
    endpointFingerprint: context.endpointFingerprint,
    database: {
      name: String(snapshot.identity.database_name),
      serverVersionNum: String(snapshot.identity.server_version_num),
      databaseBytes: String(snapshot.identity.database_bytes),
      transactionReadOnly: true,
    },
    productionMutationPerformed: false,
    canonicalManifestChanged: false,
    publicFileWritten: false,
    publicTableCount: snapshot.publicTables.length,
    publicTables: snapshot.publicTables.map((row) => String(row.table_name)),
    migration0008: schema,
    migration0009,
    invalidConstraints,
    publicRevision: snapshot.revision.length
      ? Number(snapshot.revision[0].revision)
      : null,
    iowa: {
      coreYearRows: snapshot.coreYears.map((row) => ({
        year: Number(row.year),
        electionDate: String(row.election_date),
        resultRows: Number(row.result_rows),
        precinctResultRows: Number(row.precinct_result_rows),
        countyResultRows: Number(row.county_result_rows),
      })),
      precinctYearRows: snapshot.precinctYears.map((row) => ({
        year: Number(row.year),
        reportingUnits: Number(row.reporting_units),
        linkedPrecinctResultRows: Number(row.linked_precinct_result_rows),
        geographyVersions: Number(row.geography_versions),
        geometryFeatures: Number(row.geometry_features),
        reviewedExactCrosswalks: Number(row.reviewed_exact_crosswalks),
      })),
      sourceDocuments: snapshot.sourceDocuments.map((row) => ({
        slug: String(row.slug),
        electionYear: Number(row.election_year),
        status: String(row.status),
        localArtifact: String(row.local_artifact ?? ""),
      })),
    },
    canonicalManifestPreimages:
      context.releaseCandidate.canonicalManifestPreimages,
    stopConditions: [
      "migration0008.status is partial_blocked",
      "migration0009.status is partial_blocked",
      "any invalid public constraint exists",
      "the endpoint fingerprint or database name differs from authorization",
      "any Iowa year or row set differs before the write transaction",
      "any canonical manifest preimage differs from the release package",
    ],
  };
  return report;
}

export async function collectIowaProductionPreflight(sql, context) {
  const identityRows = await query(sql, [
    "select current_database() database_name,",
    " current_setting('server_version_num') server_version_num,",
    " current_setting('transaction_read_only') transaction_read_only,",
    " pg_database_size(current_database())::text database_bytes",
  ]);
  if (identityRows.length !== 1) {
    throw new Error("Iowa production preflight database identity is missing");
  }
  const publicTables = await query(sql, [
    "select tablename table_name from pg_catalog.pg_tables",
    "where schemaname='public' order by tablename",
  ]);
  const precinctTables = await query(sql, [
    "select table_name from information_schema.tables",
    "where table_schema='public' and table_name = any($1::text[])",
    "order by table_name",
  ], [[...PRECINCT_TABLES]]);
  const precinctColumns = await query(sql, [
    "select table_name,column_name from information_schema.columns",
    "where table_schema='public' and (table_name,column_name) in (",
    " ('result_rows','reporting_unit_id'),",
    " ('review_rows','reporting_unit_id'),",
    " ('turnout_rows','reporting_unit_id'))",
    "order by table_name,column_name",
  ]);
  const invalid = await query(sql, [
    "select count(*)::int count from pg_constraint",
    "where connamespace='public'::regnamespace and not convalidated",
  ]);
  const revision = await query(sql, [
    "select revision::int revision from public_data_revisions where scope='public'",
  ]);
  const derivationConstraint = await query(sql, [
    "select pg_get_constraintdef(oid) definition from pg_constraint",
    "where connamespace='public'::regnamespace",
    " and conname='geography_versions_derivation_method_check'",
  ]);
  const coreYears = await query(sql, [
    "select e.year,e.election_date,",
    " count(rr.id)::int result_rows,",
    " count(rr.id) filter (where rr.level='precinct')::int precinct_result_rows,",
    " count(rr.id) filter (where rr.level='county')::int county_result_rows",
    "from elections e",
    "left join contests c on c.election_id=e.id and c.state_code='IA'",
    "left join result_rows rr on rr.contest_id=c.id and rr.state_code='IA'",
    "where e.office='president' and (c.id is not null or e.year in (2016,2020,2024))",
    "group by e.year,e.election_date order by e.year",
  ]);
  const sourceDocuments = await query(sql, [
    "select slug,election_year,status,local_artifact from source_documents",
    "where state_code='IA' order by election_year,slug",
  ]);

  const state = migrationState(precinctTables, precinctColumns);
  let precinctYears = [];
  if (state.status === "complete") {
    precinctYears = await query(sql, [
      "select e.year,",
      " (select count(*)::int from reporting_units ru",
      "  where ru.state_code='IA' and ru.election_id=e.id",
      "   and ru.reporting_grain='precinct') reporting_units,",
      " (select count(*)::int from result_rows rr",
      "  join contests c on c.id=rr.contest_id",
      "  where rr.state_code='IA' and c.election_id=e.id",
      "   and rr.level='precinct' and rr.reporting_unit_id is not null)",
      "  linked_precinct_result_rows,",
      " (select count(*)::int from geography_versions gv",
      "  where gv.state_code='IA' and gv.election_id=e.id",
      "   and gv.geography_type='precinct') geography_versions,",
      " (select count(*)::int from geography_features gf",
      "  join geography_versions gv on gv.id=gf.geometry_version_id",
      "  where gv.state_code='IA' and gv.election_id=e.id",
      "   and gv.geography_type='precinct') geometry_features,",
      " (select count(*)::int from reporting_unit_geometry_crosswalks x",
      "  join geography_versions gv on gv.id=x.geometry_version_id",
      "  join reporting_units ru on ru.id=x.reporting_unit_id",
      "  where gv.state_code='IA' and gv.election_id=e.id",
      "   and ru.election_id=e.id and x.relationship_type='one_to_one'",
      "   and x.match_method in ('exact_official_id','official_crosswalk')",
      "   and x.review_status='reviewed' and x.confidence='high')",
      "  reviewed_exact_crosswalks",
      "from elections e where e.office='president'",
      " and e.year in (2016,2020,2024) order by e.year",
    ]);
  }

  return buildIowaProductionPreflightReport({
    identity: identityRows[0],
    publicTables,
    precinctTables,
    precinctColumns,
    derivationConstraint,
    invalidConstraints: invalid[0]?.count,
    revision,
    coreYears,
    precinctYears,
    sourceDocuments,
  }, context);
}

export const iowaPrecinctSchemaContract = Object.freeze({
  tables: PRECINCT_TABLES,
  reportingUnitColumns: REPORTING_UNIT_COLUMNS,
});

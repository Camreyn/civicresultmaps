import postgres from "postgres";
import {
  getDatabaseDriver,
  getLocalCloneDatabaseUrl,
} from "../../src/db/database-driver.ts";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";

const STATE = "PA";
const SETUP_PARSER = "pennsylvaniaPrecinctReportingGisSetup";
const APPLICATION_NAME = "civicresultmaps-local-pa-precinct-gis";

const LOCAL_EXECUTION_CONTEXT = Object.freeze({
  mode: "local",
  importParser: SETUP_PARSER,
  importScope: "local-only",
  resultParser: "scripts/setup-pa-precinct-gis-local.mjs",
  reviewedBy: "repository-reviewed",
  revisionReason: "Local-only Pennsylvania reviewed precinct GIS setup",
  database: {
    environment: "local",
    host: "loopback",
    port: 54329,
    name: "crm_clone_dev",
  },
  releaseCandidate: null,
  productionReleaseAudit: null,
});

const PRODUCTION_RELEASE_AUDIT_KEYS = Object.freeze([
  "releasePackage",
  "authorization",
  "preflight",
  "backupManifest",
  "authorizationId",
  "endpointFingerprint",
  "transaction",
]);

const PRODUCTION_RELEASE_AUDIT_ARTIFACT_KEYS = Object.freeze([
  "releasePackage",
  "authorization",
  "preflight",
]);

function validatedProductionReleaseAudit(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Production Pennsylvania execution requires durable release-audit metadata");
  }
  const output = {};
  for (const key of PRODUCTION_RELEASE_AUDIT_ARTIFACT_KEYS) {
    const item = value[key];
    if (
      typeof item?.path !== "string"
      || !item.path.startsWith(".etl/")
      || item.path.includes("\\")
      || item.path.split("/").includes("..")
      || !/^[a-f0-9]{64}$/.test(item?.sha256 ?? "")
    ) {
      throw new Error("Production Pennsylvania execution release-audit metadata is invalid: " + key);
    }
    output[key] = Object.freeze({
      path: item.path,
      sha256: item.sha256,
    });
  }
  if (
    !value.backupManifest
    || Object.keys(value.backupManifest).sort().join(",") !== "dumpSha256,sha256"
    || !/^[a-f0-9]{64}$/.test(value.backupManifest.sha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(value.backupManifest.dumpSha256 ?? "")
    || typeof value.authorizationId !== "string"
    || !value.authorizationId.trim()
    || !/^[a-f0-9]{64}$/.test(value.endpointFingerprint ?? "")
    || !value.transaction
    || Object.keys(value.transaction).sort().join(",")
      !== "executedAtUtc,publicRevision"
    || typeof value.transaction.executedAtUtc !== "string"
    || Number.isNaN(Date.parse(value.transaction.executedAtUtc))
    || !Number.isInteger(Number(value.transaction.publicRevision))
    || Number(value.transaction.publicRevision) < 1
  ) {
    throw new Error("Production Pennsylvania execution release-audit metadata is invalid");
  }
  output.backupManifest = Object.freeze({
    sha256: value.backupManifest.sha256,
    dumpSha256: value.backupManifest.dumpSha256,
  });
  output.authorizationId = value.authorizationId.trim();
  output.endpointFingerprint = value.endpointFingerprint;
  output.transaction = Object.freeze({
    executedAtUtc: value.transaction.executedAtUtc,
    publicRevision: Number(value.transaction.publicRevision),
  });
  if (Object.keys(value).length !== PRODUCTION_RELEASE_AUDIT_KEYS.length) {
    throw new Error("Production Pennsylvania execution release-audit metadata has extra fields");
  }
  return Object.freeze(output);
}

export function buildPennsylvaniaPrecinctExecutionContext(options = {}) {
  if (!options.mode || options.mode === "local") return LOCAL_EXECUTION_CONTEXT;
  if (options.mode !== "production_release") {
    throw new Error("Unknown Pennsylvania precinct unit execution mode");
  }
  if (!/^[a-f0-9]{64}$/.test(options.releasePackageSha256 ?? "")) {
    throw new Error("Production Pennsylvania execution requires a release-package SHA-256");
  }
  if (!/^pa-precinct-gis-two-election-v\d+$/.test(options.releaseCandidateId ?? "")) {
    throw new Error("Production Pennsylvania execution requires the reviewed release-candidate ID");
  }
  if (typeof options.databaseName !== "string" || !options.databaseName.trim()) {
    throw new Error("Production Pennsylvania execution requires the preflight database name");
  }
  return Object.freeze({
    mode: "production_release",
    importParser: "pennsylvaniaPrecinctGisProductionRelease",
    importScope: "production-release-hidden-load",
    resultParser: "scripts/apply-pa-precinct-release.mjs",
    reviewedBy: "repository-reviewed-release",
    revisionReason:
      "Pennsylvania two-election precinct GIS hidden load "
      + options.releasePackageSha256,
    database: {
      environment: "production",
      host: "remote",
      port: null,
      name: options.databaseName,
    },
    releaseCandidate: Object.freeze({
      id: options.releaseCandidateId,
      sha256: options.releasePackageSha256,
      publicDeliveryAuthorized: false,
    }),
    productionReleaseAudit: validatedProductionReleaseAudit(
      options.productionReleaseAudit,
    ),
  });
}

export function assertPennsylvaniaGeometryVersionPrecondition(versions, yearPlan) {
  if (
    !Array.isArray(versions)
    || versions.length > 1
    || versions.some((row) =>
      row.manifest_id !== yearPlan.manifest.id
      || row.boundary_vintage !== yearPlan.manifest.geography.boundaryVintage
      || Number(row.release_attributed ?? 0) !== 0
      || row.status !== "blocked"
    )
  ) {
    throw new Error(
      "Pennsylvania "
      + yearPlan.year
      + " has multiple, foreign, boundary-drifted, release-attributed, or non-blocked geography versions",
    );
  }
}

function executionMetadata(context) {
  return context.releaseCandidate
    ? {
      releaseCandidate: context.releaseCandidate,
      productionReleaseAudit: context.productionReleaseAudit,
    }
    : {};
}

const FORBIDDEN_ELECTION_PROPERTY =
  /^(?:USPRS|USSEN|VOTES?|TOTALVOTES?|TOTVOTING|REG7AM|EDR|CANDIDATE|PARTY)/i;

function assertNoElectionValueProperties(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoElectionValueProperties(item, context + "[" + index + "]"));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_ELECTION_PROPERTY.test(key)) {
      throw new Error(context + " contains election-value property " + key);
    }
    assertNoElectionValueProperties(child, context + "." + key);
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]),
  );
}

function query(client, lines, params = []) {
  return client.unsafe(Array.isArray(lines) ? lines.join("\n") : lines, params);
}

function chunks(rows, size = 400) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) {
    output.push(rows.slice(index, index + size));
  }
  return output;
}

async function sourceDocument(tx, document) {
  const rows = await query(tx, [
    "insert into source_documents (",
    " slug, state_code, election_year, category, title, source_url, authority,",
    " local_artifact, parser, timestamp_basis, confidence, status, metadata",
    ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text::jsonb)",
    "on conflict (slug) do update set",
    " election_year=excluded.election_year, category=excluded.category,",
    " title=excluded.title, source_url=excluded.source_url,",
    " authority=excluded.authority, local_artifact=excluded.local_artifact,",
    " parser=excluded.parser, timestamp_basis=excluded.timestamp_basis,",
    " confidence=excluded.confidence, status=excluded.status,",
    " metadata=excluded.metadata",
    "where source_documents.state_code=excluded.state_code",
    "returning id",
  ], [
    document.slug,
    STATE,
    document.year,
    document.category,
    document.title,
    document.sourceUrl,
    document.authority,
    document.localArtifact,
    document.parser,
    document.timestampBasis,
    document.confidence,
    document.status,
    JSON.stringify(document.metadata),
  ]);
  if (rows.length !== 1) {
    throw new Error("Source-document slug belongs to another state: " + document.slug);
  }
  return String(rows[0].id);
}

async function electionAndContest(tx, yearPlan) {
  const existing = await query(tx, [
    "select id,election_date from elections",
    "where year=$1 and office='president'",
  ], [yearPlan.year]);
  if (existing.length && String(existing[0].election_date) !== yearPlan.electionDate) {
    throw new Error(
      "Existing " + yearPlan.year + " presidential date is "
      + existing[0].election_date + ", expected " + yearPlan.electionDate,
    );
  }
  const elections = await query(tx, [
    "insert into elections (year,office,election_date,label)",
    "values ($1,'president',$2,$3)",
    "on conflict (year,office) do update set label=excluded.label",
    "returning id",
  ], [yearPlan.year, yearPlan.electionDate, yearPlan.year + " General Election"]);
  const electionId = String(elections[0].id);
  const contests = await query(tx, [
    "insert into contests (election_id,state_code,office,title)",
    "values ($1::uuid,$2,'president',$3)",
    "on conflict (election_id,state_code,office) do update set title=excluded.title",
    "returning id",
  ], [electionId, STATE, "Pennsylvania " + yearPlan.year + " President"]);
  return { electionId, contestId: String(contests[0].id) };
}

async function candidates(tx, contestId, yearPlan) {
  const records = [];
  const seen = new Set();
  for (const row of yearPlan.resultRows) {
    const key = row.candidateName + "|" + row.party;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      name: row.candidateName,
      party: row.party,
      order: records.length + 1,
    });
  }
  for (const record of records) {
    await query(tx, [
      "insert into candidates (contest_id,name,party,ballot_order)",
      "values ($1::uuid,$2,$3,$4)",
      "on conflict (contest_id,name,party) do update set ballot_order=excluded.ballot_order",
    ], [contestId, record.name, record.party, record.order]);
  }
}

async function importRun(tx, yearPlan, resultSourceDocumentId, context) {
  const found = await query(tx, [
    "select id from import_runs",
    "where state_code=$1 and election_year=$2 and parser=$3",
    " and source_document_id=$4::uuid",
    "order by started_at,id limit 1",
  ], [STATE, yearPlan.year, context.importParser, resultSourceDocumentId]);
  const summary = JSON.stringify({
    scope: context.importScope,
    electionId: yearPlan.electionId,
    reportingUnits: yearPlan.reportingUnits.length,
    resultRows: yearPlan.resultRows.length,
    geometryDisposition: yearPlan.geometry.disposition,
    geometryFeatures: yearPlan.geometry.features.length,
    crosswalks: yearPlan.geometry.crosswalks.length,
    publicDeliveryAuthorized: false,
    ...executionMetadata(context),
  });
  if (found.length) {
    await query(tx, [
      "update import_runs set status='promoted',finished_at=now(),",
      " summary=$2::text::jsonb where id=$1::uuid",
    ], [found[0].id, summary]);
    return String(found[0].id);
  }
  const inserted = await query(tx, [
    "insert into import_runs (state_code,election_year,parser,source_document_id,",
    " status,started_at,finished_at,summary)",
    "values ($1,$2,$3,$4::uuid,'promoted',now(),now(),$5::text::jsonb)",
    "returning id",
  ], [STATE, yearPlan.year, context.importParser, resultSourceDocumentId, summary]);
  return String(inserted[0].id);
}

async function reportingUnits(
  tx,
  yearPlan,
  electionId,
  resultSourceDocumentId,
  context,
) {
  for (const batch of chunks(yearPlan.reportingUnits)) {
    const records = batch.map((unit) => ({
      reporting_grain: unit.reportingGrain,
      parent_geoid: unit.parentGeoid,
      source_unit_id: unit.sourceUnitId,
      source_display_name: unit.sourceDisplayName,
      is_geographic: unit.isGeographic,
      metadata: {
        electionEventId: yearPlan.electionId,
        reportingUnitCode: unit.code,
        setupTool: context.resultParser,
        resultStatus: unit.resultStatus,
        ...(unit.resultStatus === "candidate_detail_suppressed"
          ? {
            reportedRegistration: unit.reportedRegistration,
            reportedTurnout: unit.reportedTurnout,
            reportedTotalVotes: unit.reportedTotalVotes,
          }
          : {}),
        ...executionMetadata(context),
      },
    }));
    await query(tx, [
      "insert into reporting_units (state_code,election_id,reporting_grain,",
      " parent_geoid,source_unit_id,source_display_name,is_geographic,",
      " source_document_id,metadata)",
      "select $1,$2::uuid,incoming.reporting_grain,incoming.parent_geoid,",
      " incoming.source_unit_id,incoming.source_display_name,incoming.is_geographic,",
      " $3::uuid,incoming.metadata",
      "from jsonb_to_recordset($4::text::jsonb) incoming (",
      " reporting_grain text,parent_geoid text,source_unit_id text,",
      " source_display_name text,is_geographic boolean,metadata jsonb)",
      "on conflict on constraint reporting_units_state_election_grain_parent_source_unique",
      "do update set source_display_name=excluded.source_display_name,",
      " is_geographic=excluded.is_geographic,",
      " source_document_id=excluded.source_document_id,metadata=excluded.metadata,",
      " updated_at=now()",
    ], [STATE, electionId, resultSourceDocumentId, JSON.stringify(records)]);
  }
  const stored = await query(tx, [
    "select id,reporting_grain,parent_geoid,source_unit_id",
    "from reporting_units",
    "where state_code=$1 and election_id=$2::uuid",
    " and reporting_grain='precinct'",
    " and source_document_id=$3::uuid",
  ], [STATE, electionId, resultSourceDocumentId]);
  if (stored.length !== yearPlan.reportingUnits.length) {
    throw new Error("Pennsylvania " + yearPlan.year + " reporting-unit count drifted");
  }
  const ids = new Map();
  for (const row of stored) {
    const code = reportingUnitCode({
      state: STATE,
      electionId: yearPlan.electionId,
      reportingGrain: String(row.reporting_grain),
      parentGeoid: row.parent_geoid ? String(row.parent_geoid) : null,
      sourceUnitId: String(row.source_unit_id),
    });
    ids.set(code, String(row.id));
  }
  for (const unit of yearPlan.reportingUnits) {
    if (!ids.has(unit.code)) throw new Error("Missing precinct " + unit.code);
  }
  return ids;
}

async function results(tx, yearPlan, contestId, importRunId, sourceDocumentId, unitIds) {
  for (const batch of chunks(yearPlan.resultRows)) {
    const records = batch.map((row) => ({
      jurisdiction_code: row.jurisdictionCode,
      jurisdiction_name: row.jurisdictionName,
      candidate_name: row.candidateName,
      party: row.party,
      votes: row.votes,
      reporting_unit_id: unitIds.get(row.jurisdictionCode),
    }));
    if (records.some((row) => !row.reporting_unit_id)) {
      throw new Error("Pennsylvania " + yearPlan.year + " result lacks reporting unit");
    }
    await query(tx, [
      "insert into result_rows (import_run_id,contest_id,state_code,",
      " jurisdiction_code,jurisdiction_name,jurisdiction_tag,level,",
      " candidate_name,party,votes,reporting_unit_id,source_document_id)",
      "select $1::uuid,$2::uuid,$3,incoming.jurisdiction_code,",
      " incoming.jurisdiction_name,null,'precinct',incoming.candidate_name,",
      " incoming.party,incoming.votes,incoming.reporting_unit_id,$4::uuid",
      "from jsonb_to_recordset($5::text::jsonb) incoming (",
      " jurisdiction_code text,jurisdiction_name text,candidate_name text,",
      " party text,votes integer,reporting_unit_id uuid)",
      "on conflict (contest_id,level,jurisdiction_code,candidate_name,party)",
      "do update set jurisdiction_name=excluded.jurisdiction_name,",
      " state_code=excluded.state_code,jurisdiction_tag=excluded.jurisdiction_tag,",
      " level=excluded.level,votes=excluded.votes,",
      " reporting_unit_id=excluded.reporting_unit_id,",
      " source_document_id=excluded.source_document_id,",
      " import_run_id=excluded.import_run_id",
    ], [importRunId, contestId, STATE, sourceDocumentId, JSON.stringify(records)]);
  }
  const stored = await query(tx, [
    "select jurisdiction_code,jurisdiction_name,candidate_name,party,votes,",
    " reporting_unit_id from result_rows",
    "where contest_id=$1::uuid and state_code=$2 and level='precinct'",
    " and jurisdiction_code like $3",
  ], [contestId, STATE, "reporting:" + STATE + ":" + yearPlan.electionId + ":%"]);
  if (stored.length !== yearPlan.resultRows.length) {
    throw new Error("Pennsylvania " + yearPlan.year + " local-result count drifted");
  }
  const expected = new Map(yearPlan.resultRows.map((row) => [
    [row.jurisdictionCode, row.candidateName, row.party].join("|"),
    row,
  ]));
  for (const row of stored) {
    const key = [row.jurisdiction_code, row.candidate_name, row.party].join("|");
    const wanted = expected.get(key);
    if (
      !wanted
      || Number(row.votes) !== wanted.votes
      || String(row.jurisdiction_name) !== wanted.jurisdictionName
      || String(row.reporting_unit_id) !== unitIds.get(wanted.jurisdictionCode)
    ) {
      throw new Error("Pennsylvania " + yearPlan.year + " result drift at " + key);
    }
  }
}

async function clearLocalReplayRows(tx, yearPlan, electionId, contestId, context) {
  if (context.mode !== "local") return;
  const versions = await query(tx, [
    "select id,boundary_vintage,status,metadata->>'manifestId' manifest_id,",
    " case when metadata->'releaseCandidate' is null then 0 else 1 end release_attributed",
    "from geography_versions",
    "where state_code=$1 and election_id=$2::uuid and geography_type='precinct'",
  ], [STATE, electionId]);
  assertPennsylvaniaGeometryVersionPrecondition(versions, yearPlan);
  await query(tx, [
    "delete from reporting_unit_geometry_crosswalks crosswalk",
    "using geography_versions version",
    "where crosswalk.geometry_version_id=version.id",
    " and version.state_code=$1 and version.election_id=$2::uuid",
    " and version.geography_type='precinct'",
  ], [STATE, electionId]);
  // A reviewed local replay may legitimately replace an earlier blocked
  // boundary snapshot. Never delete a release-attributed or published version;
  // the precondition above rejects release attribution before cleanup begins.
  await query(tx, [
    "delete from geography_versions",
    "where state_code=$1 and election_id=$2::uuid",
    " and geography_type='precinct' and status='blocked'",
    " and metadata->'releaseCandidate' is null",
  ], [STATE, electionId]);
  await query(tx, [
    "delete from result_rows",
    "where contest_id=$1::uuid and state_code=$2 and level='precinct'",
    " and jurisdiction_code like $3",
  ], [contestId, STATE, `reporting:${STATE}:${yearPlan.electionId}:%`]);
  await query(tx, [
    "delete from reporting_units",
    "where state_code=$1 and election_id=$2::uuid",
    " and reporting_grain='precinct'",
    " and metadata->>'setupTool'=$3",
  ], [STATE, electionId, context.resultParser]);
}

async function geometry(
  tx,
  yearPlan,
  electionId,
  sourceDocumentId,
  unitIds,
  context,
) {
  if (yearPlan.geometry.disposition === "blocked") {
    const existing = await query(tx, [
      "select count(*)::int count from geography_versions",
      "where state_code=$1 and election_id=$2::uuid and geography_type='precinct'",
    ], [STATE, electionId]);
    if (Number(existing[0].count) !== 0) {
      throw new Error("Blocked Pennsylvania " + yearPlan.year + " already has geometry");
    }
    return { geographyVersions: 0, features: 0, crosswalks: 0 };
  }

  const versions = await query(tx, [
    "select id,boundary_vintage,status,metadata->>'manifestId' manifest_id,",
    " case when metadata->'releaseCandidate' is null then 0 else 1 end release_attributed",
    "from geography_versions",
    "where state_code=$1 and election_id=$2::uuid and geography_type='precinct'",
  ], [STATE, electionId]);
  assertPennsylvaniaGeometryVersionPrecondition(versions, yearPlan);

  const upserted = await query(tx, [
    "insert into geography_versions (state_code,election_id,geography_type,",
    " boundary_vintage,vintage_status,source_document_id,source_layer,",
    " source_crs,served_crs,derivation_method,status,caveat,metadata,updated_at)",
    "values ($1,$2::uuid,'precinct',$3,$4,$5::uuid,$6,$7,$8,$9,",
    " 'blocked',$10,$11::text::jsonb,now())",
    "on conflict (state_code,election_id,geography_type,boundary_vintage)",
    "do update set vintage_status=excluded.vintage_status,",
    " source_document_id=excluded.source_document_id,source_layer=excluded.source_layer,",
    " source_crs=excluded.source_crs,served_crs=excluded.served_crs,",
    " derivation_method=excluded.derivation_method,status='blocked',",
    " caveat=excluded.caveat,metadata=excluded.metadata,updated_at=now()",
    "returning id",
  ], [
    STATE,
    electionId,
    yearPlan.manifest.geography.boundaryVintage,
    yearPlan.manifest.geography.vintageStatus,
    sourceDocumentId,
    yearPlan.manifest.id,
    yearPlan.manifest.normalization.sourceCrs,
    yearPlan.manifest.normalization.servedCrs,
    yearPlan.manifest.geography.derivationMethod,
    yearPlan.manifest.validation.errors.join(" "),
    JSON.stringify({
      manifestId: yearPlan.manifest.id,
      manifestPath: yearPlan.manifestPath,
      manifestSha256: yearPlan.manifestSha256,
      manifestByteCount: yearPlan.manifestByteCount,
      source: {
        artifact: yearPlan.manifest.source.artifact,
        sha256: yearPlan.manifest.source.sha256,
        byteCount: yearPlan.artifactByteCounts.source,
      },
      normalization: {
        artifact: yearPlan.manifest.normalization.artifact,
        sha256: yearPlan.manifest.normalization.sha256,
        byteCount: yearPlan.artifactByteCounts.normalization,
        featureCount: yearPlan.geometry.features.length,
      },
      crosswalk: {
        artifact: yearPlan.manifest.crosswalk.artifact,
        sha256: yearPlan.manifest.crosswalk.sha256,
        byteCount: yearPlan.artifactByteCounts.crosswalk,
        reviewedRelationships: yearPlan.geometry.crosswalks.length,
        reviewedNoDataFeatures:
          yearPlan.manifest.crosswalk.reviewedNoDataFeatures,
      },
      licenseOrTerms: yearPlan.manifest.source.licenseOrTerms,
      publicDeliveryAuthorized: false,
      ...executionMetadata(context),
    }),
  ]);
  const versionId = String(upserted[0].id);

  for (const batch of chunks(yearPlan.geometry.features, 250)) {
    const records = batch.map((feature) => ({
      source_feature_id: feature.sourceFeatureId,
      parent_geoid: feature.parentGeoid,
      name: feature.name,
      geometry_key: feature.geometryKey,
      is_geographic: feature.isGeographic,
      properties: feature.properties,
    }));
    await query(tx, [
      "insert into geography_features (geometry_version_id,source_feature_id,",
      " parent_geoid,name,geometry_key,is_geographic,properties)",
      "select $1::uuid,incoming.source_feature_id,incoming.parent_geoid,",
      " incoming.name,incoming.geometry_key,incoming.is_geographic,incoming.properties",
      "from jsonb_to_recordset($2::text::jsonb) incoming (",
      " source_feature_id text,parent_geoid text,name text,geometry_key text,",
      " is_geographic boolean,properties jsonb)",
      "on conflict (geometry_version_id,source_feature_id) do update set",
      " parent_geoid=excluded.parent_geoid,name=excluded.name,",
      " geometry_key=excluded.geometry_key,is_geographic=excluded.is_geographic,",
      " properties=excluded.properties",
    ], [versionId, JSON.stringify(records)]);
  }
  await query(tx, [
    "delete from geography_features feature",
    "where feature.geometry_version_id=$1::uuid and not exists (",
    " select 1 from jsonb_array_elements_text($2::text::jsonb) ids(value)",
    " where ids.value=feature.source_feature_id)",
  ], [
    versionId,
    JSON.stringify(yearPlan.geometry.features.map((row) => row.sourceFeatureId)),
  ]);
  const storedFeatures = await query(tx, [
    "select id,source_feature_id from geography_features",
    "where geometry_version_id=$1::uuid",
  ], [versionId]);
  if (storedFeatures.length !== yearPlan.geometry.features.length) {
    throw new Error("Pennsylvania " + yearPlan.year + " geography-feature count drifted");
  }
  const featureIds = new Map(
    storedFeatures.map((row) => [String(row.source_feature_id), String(row.id)]),
  );

  await query(tx, [
    "delete from reporting_unit_geometry_crosswalks",
    "where geometry_version_id=$1::uuid",
  ], [versionId]);
  for (const batch of chunks(yearPlan.geometry.crosswalks)) {
    const records = batch.map((row) => ({
      reporting_unit_id: unitIds.get(row.reportingUnitCode),
      geography_feature_id: row.sourceFeatureId === null
        ? null
        : featureIds.get(row.sourceFeatureId),
      relationship_type: row.relationshipType,
      match_method: row.matchMethod,
      review_status: row.reviewStatus,
      confidence: row.confidence,
      note: row.note,
      metadata: {
        manifestId: yearPlan.manifest.id,
        resultUnitCode: row.reportingUnitCode,
        sourceFeatureId: row.sourceFeatureId,
        publicDeliveryAuthorized: false,
        ...executionMetadata(context),
      },
    }));
    if (records.some((row) => (
      !row.reporting_unit_id
      || (
        ["one_to_one", "one_to_many", "many_to_one"].includes(
          row.relationship_type,
        )
        && !row.geography_feature_id
      )
      || (
        ["unmatched", "non_geographic", "source_alias"].includes(
          row.relationship_type,
        )
        && row.geography_feature_id !== null
      )
    ))) {
      throw new Error("Pennsylvania " + yearPlan.year + " cannot resolve crosswalk UUIDs");
    }
    await query(tx, [
      "insert into reporting_unit_geometry_crosswalks (reporting_unit_id,",
      " geometry_version_id,geography_feature_id,relationship_type,match_method,",
      " review_status,confidence,source_document_id,reviewed_by,note,metadata)",
      "select incoming.reporting_unit_id,$1::uuid,incoming.geography_feature_id,",
      " incoming.relationship_type,incoming.match_method,incoming.review_status,",
      " incoming.confidence,$2::uuid,$3,incoming.note,",
      " incoming.metadata",
      "from jsonb_to_recordset($4::text::jsonb) incoming (",
      " reporting_unit_id uuid,geography_feature_id uuid,relationship_type text,",
      " match_method text,review_status text,confidence text,note text,metadata jsonb)",
    ], [versionId, sourceDocumentId, context.reviewedBy, JSON.stringify(records)]);
  }
  const counts = await query(tx, [
    "select count(*)::int total,",
    " count(*) filter (where review_status='reviewed')::int reviewed",
    "from reporting_unit_geometry_crosswalks",
    "where geometry_version_id=$1::uuid",
  ], [versionId]);
  const expected = yearPlan.geometry.crosswalks.length;
  if (["total", "reviewed"]
    .some((key) => Number(counts[0][key]) !== expected)) {
    throw new Error("Pennsylvania " + yearPlan.year + " crosswalk count drifted");
  }
  return { geographyVersions: 1, features: storedFeatures.length, crosswalks: expected };
}

async function applyYear(tx, yearPlan, context) {
  const ids = await electionAndContest(tx, yearPlan);
  await clearLocalReplayRows(
    tx,
    yearPlan,
    ids.electionId,
    ids.contestId,
    context,
  );
  await candidates(tx, ids.contestId, yearPlan);

  const resultSourceId = await sourceDocument(tx, {
    slug: yearPlan.resultSource.slug,
    year: yearPlan.year,
    category: "Official presidential precinct results with reviewed geometry",
    title: "Pennsylvania " + yearPlan.year + " presidential precinct results",
    sourceUrl: yearPlan.resultSource.url,
    authority: yearPlan.resultSource.authority,
    localArtifact: yearPlan.resultSource.artifact,
    parser: context.resultParser,
    timestampBasis: yearPlan.resultSource.timestampBasis,
    confidence: "Official Pennsylvania Department of State rows with reviewed geometry. Source units without reviewed geometry remain reconciled in retained source evidence and are never spatially allocated.",
    status: "loaded",
    metadata: {
      sourceId: yearPlan.resultSource.id,
      sha256: yearPlan.resultSource.sha256,
      byteCount: yearPlan.resultSource.byteCount,
      electionEventId: yearPlan.electionId,
      reportingUnits: yearPlan.reportingUnits.length,
      zeroVoteUnits: yearPlan.zeroVoteUnits,
      totals: yearPlan.totals,
      officialTotals: yearPlan.officialTotals,
      supplementalArtifacts: yearPlan.resultSource.supplementalArtifacts ?? [],
      publicDeliveryAuthorized: false,
      ...executionMetadata(context),
    },
  });
  const geometrySourceId = await sourceDocument(tx, {
    slug: yearPlan.geometrySourceSlug,
    year: yearPlan.year,
    category: yearPlan.geometry.disposition === "blocked"
      ? "Precinct geometry availability evidence"
      : "Reviewed election-applicable statewide precinct boundaries",
    title: "Pennsylvania " + yearPlan.year + " precinct geometry package",
    sourceUrl: yearPlan.manifest.source.url,
    authority: yearPlan.manifest.source.authority,
    localArtifact: yearPlan.manifest.source.artifact,
    parser: yearPlan.manifest.normalization.script,
    timestampBasis: yearPlan.manifest.geography.boundaryVintage,
    confidence: yearPlan.geometry.disposition === "blocked"
      ? "Retained official evidence; geometry remains fail-closed."
      : "Reviewed election-specific precinct package with exact official IDs, explicit no-geometry source exclusions, and retained provenance caveats.",
    status: yearPlan.geometry.disposition === "blocked" ? "needs_data" : "loaded",
    metadata: {
      manifestId: yearPlan.manifest.id,
      manifestPath: yearPlan.manifestPath,
      manifestSha256: yearPlan.manifestSha256,
      manifestByteCount: yearPlan.manifestByteCount,
      source: {
        artifact: yearPlan.manifest.source.artifact,
        sha256: yearPlan.manifest.source.sha256,
        byteCount: yearPlan.artifactByteCounts.source,
      },
      normalization: {
        artifact: yearPlan.manifest.normalization.artifact,
        sha256: yearPlan.manifest.normalization.sha256,
        byteCount: yearPlan.artifactByteCounts.normalization,
      },
      crosswalk: {
        artifact: yearPlan.manifest.crosswalk.artifact,
        sha256: yearPlan.manifest.crosswalk.sha256,
        byteCount: yearPlan.artifactByteCounts.crosswalk,
      },
      geometryDisposition: yearPlan.geometry.disposition,
      blockCode: yearPlan.geometry.blockCode,
      licenseOrTerms: yearPlan.manifest.source.licenseOrTerms,
      publicDeliveryAuthorized: false,
      ...executionMetadata(context),
    },
  });

  const runId = await importRun(tx, yearPlan, resultSourceId, context);
  const unitIds = await reportingUnits(
    tx,
    yearPlan,
    ids.electionId,
    resultSourceId,
    context,
  );
  await results(tx, yearPlan, ids.contestId, runId, resultSourceId, unitIds);
  const geometryCounts = await geometry(
    tx,
    yearPlan,
    ids.electionId,
    geometrySourceId,
    unitIds,
    context,
  );
  return {
    year: yearPlan.year,
    electionId: yearPlan.electionId,
    reportingUnits: unitIds.size,
    resultRows: yearPlan.resultRows.length,
    zeroVoteUnits: yearPlan.zeroVoteUnits,
    totals: yearPlan.totals,
    geometryDisposition: yearPlan.geometry.disposition,
    ...geometryCounts,
  };
}

export async function applyPennsylvaniaPrecinctGisTransaction(
  tx,
  plan,
  options = {},
) {
  const context = buildPennsylvaniaPrecinctExecutionContext(
    options.executionContext,
  );
  const identity = await query(tx, [
    "select current_database() database_name,",
    " current_setting('transaction_read_only') transaction_read_only",
  ]);
  if (
    identity.length !== 1
    || String(identity[0].transaction_read_only) !== "off"
    || String(identity[0].database_name) !== context.database.name
  ) {
    throw new Error(
      "Pennsylvania precinct unit release transaction database identity or write mode drifted",
    );
  }

  await query(tx, "select set_config('lock_timeout','30s',true)");
  await query(
    tx,
    "select pg_advisory_xact_lock(hashtextextended('crm-pa-precinct-gis-release-v1',0))",
  );
  const tables = await query(tx, [
    "select count(*)::int count from unnest(array[",
    " 'elections','contests','candidates','source_documents','import_runs',",
    " 'result_rows','reporting_units','geography_versions','geography_features',",
    " 'reporting_unit_geometry_crosswalks']) required(name)",
    "where to_regclass('public.'||required.name) is not null",
  ]);
  if (Number(tables[0].count) !== 10) {
    throw new Error(
      context.database.name + " lacks the complete migration 0008 local geography schema",
    );
  }
  if (context.mode === "production_release") {
    const targetYears = plan.years.map((year) => year.year);
    const existing = await query(tx, [
      "select",
      " (select count(*)::int from reporting_units ru",
      "  join elections e on e.id=ru.election_id",
      "  where ru.state_code='PA'",
      "   and ru.reporting_grain='precinct'",
      "   and e.office='president' and e.year=any($1::int[])) reporting_units,",
      " (select count(*)::int from result_rows rr",
      "  join contests c on c.id=rr.contest_id",
      "  join elections e on e.id=c.election_id",
      "  where rr.state_code='PA' and rr.level='precinct'",
      "   and e.office='president' and e.year=any($1::int[])) result_rows,",
      " (select count(*)::int from geography_versions gv",
      "  join elections e on e.id=gv.election_id",
      "  where gv.state_code='PA' and gv.geography_type='precinct'",
      "   and e.office='president' and e.year=any($1::int[])) geography_versions",
    ], [targetYears]);
    const counts = existing[0] ?? {};
    if (
      Number(counts.reporting_units) !== 0
      || Number(counts.result_rows) !== 0
      || Number(counts.geography_versions) !== 0
    ) {
      throw new Error(
        "Pennsylvania production hidden load refuses existing precinct release rows; "
        + "use read-only receipt recovery or a separately reviewed rollback path",
      );
    }
  }
  await query(tx, [
    "insert into states (code,name,authority) values ($1,$2,$3)",
    "on conflict (code) do update set name=excluded.name,authority=excluded.authority",
  ], [STATE, plan.stateName, plan.authority]);

  const years = [];
  for (const yearPlan of plan.years) {
    years.push(await applyYear(tx, yearPlan, context));
    if (
      process.env.NODE_ENV === "test"
      && options.testOnlyFailAfterYear === yearPlan.year
    ) {
      throw new Error("Intentional Pennsylvania GIS rollback after " + yearPlan.year);
    }
  }
  const revisions = await query(tx, [
    "insert into public_data_revisions (scope,revision,updated_at,reason)",
    "values ('public',1,now(),$1)",
    "on conflict (scope) do update set",
    " revision=public_data_revisions.revision+1,updated_at=now(),reason=excluded.reason",
    "returning revision::int revision",
  ], [context.revisionReason]);
  return {
    database: context.database,
    executionMode: context.mode,
    productionMutationPerformed: context.mode === "production_release",
    publicDeliveryAuthorized: false,
    releaseCandidate: context.releaseCandidate,
    productionReleaseAudit: context.productionReleaseAudit,
    revision: Number(revisions[0].revision),
    years,
  };
}

export async function applyPennsylvaniaPrecinctGisPlan(plan, options = {}) {
  if (getDatabaseDriver() !== "postgres") {
    throw new Error("Pennsylvania precinct GIS setup requires CRM_DATABASE_DRIVER=postgres");
  }
  const databaseUrl = getLocalCloneDatabaseUrl({ requireWriteOptIn: true });
  const sql = (options.postgresFactory ?? postgres)(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: { application_name: APPLICATION_NAME },
  });
  try {
    return await sql.begin((tx) => applyPennsylvaniaPrecinctGisTransaction(
      tx,
      plan,
      {
        executionContext: { mode: "local" },
        testOnlyFailAfterYear: options.testOnlyFailAfterYear,
      },
    ));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function validateSourceDocumentRecords(sql, yearPlan, context) {
  const rows = await query(sql, [
    "select slug,election_year,category,title,source_url,authority,local_artifact,",
    " parser,timestamp_basis,status,metadata",
    "from source_documents where state_code=$1 and slug in ($2,$3)",
  ], [STATE, yearPlan.resultSource.slug, yearPlan.geometrySourceSlug]);
  if (rows.length !== 2) {
    throw new Error("Pennsylvania " + yearPlan.year + " source-document count drifted");
  }
  const bySlug = new Map(rows.map((row) => [String(row.slug), row]));
  const result = bySlug.get(yearPlan.resultSource.slug);
  const geometry = bySlug.get(yearPlan.geometrySourceSlug);
  const resultMetadata = result?.metadata ?? {};
  const geometryMetadata = geometry?.metadata ?? {};
  if (
    !result
    || Number(result.election_year) !== yearPlan.year
    || String(result.source_url) !== yearPlan.resultSource.url
    || String(result.authority) !== yearPlan.resultSource.authority
    || String(result.local_artifact) !== yearPlan.resultSource.artifact
    || String(result.parser) !== context.resultParser
    || String(result.timestamp_basis) !== yearPlan.resultSource.timestampBasis
    || String(result.status) !== "loaded"
    || resultMetadata.sha256 !== yearPlan.resultSource.sha256
    || Number(resultMetadata.byteCount) !== yearPlan.resultSource.byteCount
    || resultMetadata.electionEventId !== yearPlan.electionId
    || resultMetadata.publicDeliveryAuthorized !== false
    || JSON.stringify(canonicalJson(resultMetadata.supplementalArtifacts ?? []))
      !== JSON.stringify(canonicalJson(yearPlan.resultSource.supplementalArtifacts ?? []))
    || JSON.stringify(canonicalJson(resultMetadata.releaseCandidate ?? null))
      !== JSON.stringify(canonicalJson(context.releaseCandidate))
    || JSON.stringify(canonicalJson(resultMetadata.productionReleaseAudit ?? null))
      !== JSON.stringify(canonicalJson(context.productionReleaseAudit))
  ) {
    throw new Error("Pennsylvania " + yearPlan.year + " result provenance drifted");
  }
  const geometryStatus = yearPlan.geometry.disposition === "blocked" ? "needs_data" : "loaded";
  if (
    !geometry
    || Number(geometry.election_year) !== yearPlan.year
    || String(geometry.source_url) !== yearPlan.manifest.source.url
    || String(geometry.authority) !== yearPlan.manifest.source.authority
    || String(geometry.local_artifact) !== yearPlan.manifest.source.artifact
    || String(geometry.parser) !== yearPlan.manifest.normalization.script
    || String(geometry.timestamp_basis) !== yearPlan.manifest.geography.boundaryVintage
    || String(geometry.status) !== geometryStatus
    || geometryMetadata.manifestId !== yearPlan.manifest.id
    || geometryMetadata.manifestPath !== yearPlan.manifestPath
    || geometryMetadata.manifestSha256 !== yearPlan.manifestSha256
    || Number(geometryMetadata.manifestByteCount) !== yearPlan.manifestByteCount
    || geometryMetadata.source?.artifact !== yearPlan.manifest.source.artifact
    || geometryMetadata.source?.sha256 !== yearPlan.manifest.source.sha256
    || Number(geometryMetadata.source?.byteCount) !== yearPlan.artifactByteCounts.source
    || geometryMetadata.normalization?.artifact !== yearPlan.manifest.normalization.artifact
    || geometryMetadata.normalization?.sha256 !== yearPlan.manifest.normalization.sha256
    || Number(geometryMetadata.normalization?.byteCount)
      !== yearPlan.artifactByteCounts.normalization
    || geometryMetadata.crosswalk?.artifact !== yearPlan.manifest.crosswalk.artifact
    || geometryMetadata.crosswalk?.sha256 !== yearPlan.manifest.crosswalk.sha256
    || Number(geometryMetadata.crosswalk?.byteCount) !== yearPlan.artifactByteCounts.crosswalk
    || geometryMetadata.licenseOrTerms !== yearPlan.manifest.source.licenseOrTerms
    || geometryMetadata.blockCode !== yearPlan.geometry.blockCode
    || geometryMetadata.geometryDisposition !== yearPlan.geometry.disposition
    || geometryMetadata.publicDeliveryAuthorized !== false
    || JSON.stringify(canonicalJson(geometryMetadata.releaseCandidate ?? null))
      !== JSON.stringify(canonicalJson(context.releaseCandidate))
    || JSON.stringify(canonicalJson(geometryMetadata.productionReleaseAudit ?? null))
      !== JSON.stringify(canonicalJson(context.productionReleaseAudit))
  ) {
    throw new Error("Pennsylvania " + yearPlan.year + " geometry provenance drifted");
  }
  return {
    resultSourceSlug: yearPlan.resultSource.slug,
    geometrySourceSlug: yearPlan.geometrySourceSlug,
  };
}

async function validateStoredProductionAudit(
  sql,
  yearPlan,
  electionId,
  context,
) {
  if (!context.releaseCandidate) return;
  const audit = JSON.stringify(context.productionReleaseAudit);
  // `audit` is serialized JSON text. Preserve the intermediate text cast so
  // Postgres.js does not encode the parameter as a JSON string scalar.
  const units = await query(sql, [
    "select count(*)::int total,",
    " count(*) filter (where metadata->'productionReleaseAudit'=$3::text::jsonb)::int exact_audit",
    "from reporting_units where state_code=$1 and election_id=$2::uuid",
    " and reporting_grain='precinct'",
  ], [STATE, electionId, audit]);
  if (
    Number(units[0]?.total) !== yearPlan.reportingUnits.length
    || Number(units[0]?.exact_audit) !== yearPlan.reportingUnits.length
  ) {
    throw new Error("Pennsylvania " + yearPlan.year + " reporting-unit release audit drifted");
  }
  const imports = await query(sql, [
    "select count(distinct ir.id)::int import_runs,count(rr.id)::int result_rows,",
    " count(rr.id) filter (where ir.summary->'productionReleaseAudit'=$4::text::jsonb)::int exact_audit_rows",
    "from import_runs ir",
    "join result_rows rr on rr.import_run_id=ir.id and rr.state_code=$1",
    "join contests c on c.id=rr.contest_id and c.election_id=$2::uuid",
    "where ir.state_code=$1 and ir.election_year=$3 and ir.parser=$5",
    " and rr.level='precinct'",
  ], [STATE, electionId, yearPlan.year, audit, context.importParser]);
  if (
    Number(imports[0]?.import_runs) !== 1
    || Number(imports[0]?.result_rows) !== yearPlan.resultRows.length
    || Number(imports[0]?.exact_audit_rows) !== yearPlan.resultRows.length
  ) {
    throw new Error("Pennsylvania " + yearPlan.year + " import-run release audit drifted");
  }
}

async function validateStoredGeometryRecords(sql, yearPlan, electionId, context) {
  if (yearPlan.geometry.disposition === "blocked") {
    return { exactFeatures: 0, exactCrosswalks: 0 };
  }
  const versions = await query(sql, [
    "select metadata from geography_versions",
    "where state_code=$1 and election_id=$2::uuid and geography_type='precinct'",
  ], [STATE, electionId]);
  const expectedVersionMetadata = {
    manifestId: yearPlan.manifest.id,
    manifestPath: yearPlan.manifestPath,
    manifestSha256: yearPlan.manifestSha256,
    manifestByteCount: yearPlan.manifestByteCount,
    source: {
      artifact: yearPlan.manifest.source.artifact,
      sha256: yearPlan.manifest.source.sha256,
      byteCount: yearPlan.artifactByteCounts.source,
    },
    normalization: {
      artifact: yearPlan.manifest.normalization.artifact,
      sha256: yearPlan.manifest.normalization.sha256,
      byteCount: yearPlan.artifactByteCounts.normalization,
      featureCount: yearPlan.geometry.features.length,
    },
    crosswalk: {
      artifact: yearPlan.manifest.crosswalk.artifact,
      sha256: yearPlan.manifest.crosswalk.sha256,
      byteCount: yearPlan.artifactByteCounts.crosswalk,
      reviewedRelationships: yearPlan.geometry.crosswalks.length,
      reviewedNoDataFeatures:
        yearPlan.manifest.crosswalk.reviewedNoDataFeatures,
    },
    licenseOrTerms: yearPlan.manifest.source.licenseOrTerms,
    publicDeliveryAuthorized: false,
    ...executionMetadata(context),
  };
  if (
    versions.length !== 1
    || JSON.stringify(canonicalJson(versions[0].metadata))
      !== JSON.stringify(canonicalJson(expectedVersionMetadata))
  ) {
    throw new Error("Pennsylvania " + yearPlan.year + " geography-version provenance drifted");
  }
  const features = await query(sql, [
    "select gf.source_feature_id,gf.parent_geoid,gf.name,gf.geometry_key,",
    " gf.is_geographic,gf.properties",
    "from geography_features gf",
    "join geography_versions gv on gv.id=gf.geometry_version_id",
    "where gv.state_code=$1 and gv.election_id=$2::uuid",
    " and gv.geography_type='precinct' and gv.metadata->>'manifestId'=$3",
    "order by gf.source_feature_id",
  ], [STATE, electionId, yearPlan.manifest.id]);
  const expectedFeatures = new Map(
    yearPlan.geometry.features.map((feature) => [feature.sourceFeatureId, feature]),
  );
  if (features.length !== expectedFeatures.size) {
    throw new Error("Pennsylvania " + yearPlan.year + " exact feature count drifted");
  }
  const seenFeatures = new Set();
  for (const row of features) {
    const sourceFeatureId = String(row.source_feature_id);
    const expected = expectedFeatures.get(sourceFeatureId);
    assertNoElectionValueProperties(
      row.properties,
      "Pennsylvania " + yearPlan.year + " stored feature " + sourceFeatureId,
    );
    if (
      !expected
      || seenFeatures.has(sourceFeatureId)
      || String(row.parent_geoid) !== expected.parentGeoid
      || String(row.name) !== expected.name
      || String(row.geometry_key) !== expected.geometryKey
      || row.is_geographic !== expected.isGeographic
      || JSON.stringify(canonicalJson(row.properties))
        !== JSON.stringify(canonicalJson(expected.properties))
    ) {
      throw new Error("Pennsylvania " + yearPlan.year + " stored feature drifted at " + sourceFeatureId);
    }
    seenFeatures.add(sourceFeatureId);
  }

  const crosswalks = await query(sql, [
    "select ru.reporting_grain,ru.parent_geoid,ru.source_unit_id,",
    " gf.source_feature_id,x.relationship_type,x.match_method,x.review_status,",
    " x.confidence,x.reviewed_by,x.note,x.metadata",
    "from reporting_unit_geometry_crosswalks x",
    "join geography_versions gv on gv.id=x.geometry_version_id",
    "join reporting_units ru on ru.id=x.reporting_unit_id",
    "left join geography_features gf on gf.id=x.geography_feature_id",
    "join source_documents sd on sd.id=x.source_document_id",
    "where gv.state_code=$1 and gv.election_id=$2::uuid",
    " and ru.state_code=$1 and ru.election_id=$2::uuid",
    " and gv.metadata->>'manifestId'=$3 and sd.slug=$4",
    "order by ru.parent_geoid,ru.source_unit_id",
  ], [STATE, electionId, yearPlan.manifest.id, yearPlan.geometrySourceSlug]);
  const expectedCrosswalks = new Map(yearPlan.geometry.crosswalks.map((crosswalk) => [
    `${crosswalk.reportingUnitCode}|${crosswalk.sourceFeatureId}`,
    crosswalk,
  ]));
  if (crosswalks.length !== expectedCrosswalks.size) {
    throw new Error("Pennsylvania " + yearPlan.year + " exact crosswalk count drifted");
  }
  const seenCrosswalks = new Set();
  for (const row of crosswalks) {
    const reportingCode = reportingUnitCode({
      state: STATE,
      electionId: yearPlan.electionId,
      reportingGrain: String(row.reporting_grain),
      parentGeoid: row.parent_geoid ? String(row.parent_geoid) : null,
      sourceUnitId: String(row.source_unit_id),
    });
    const crosswalkKey = `${reportingCode}|${row.source_feature_id}`;
    const expected = expectedCrosswalks.get(crosswalkKey);
    const metadata = row.metadata ?? {};
    if (
      !expected
      || seenCrosswalks.has(crosswalkKey)
      || (row.source_feature_id === null
        ? expected.sourceFeatureId !== null
        : String(row.source_feature_id) !== expected.sourceFeatureId)
      || String(row.relationship_type) !== expected.relationshipType
      || String(row.match_method) !== expected.matchMethod
      || String(row.review_status) !== expected.reviewStatus
      || String(row.confidence) !== expected.confidence
      || String(row.reviewed_by) !== context.reviewedBy
      || String(row.note ?? "") !== expected.note
      || metadata.manifestId !== yearPlan.manifest.id
      || metadata.resultUnitCode !== reportingCode
      || metadata.sourceFeatureId !== expected.sourceFeatureId
      || metadata.publicDeliveryAuthorized !== false
      || JSON.stringify(canonicalJson(metadata.releaseCandidate ?? null))
        !== JSON.stringify(canonicalJson(context.releaseCandidate))
      || JSON.stringify(canonicalJson(metadata.productionReleaseAudit ?? null))
        !== JSON.stringify(canonicalJson(context.productionReleaseAudit))
    ) {
      throw new Error("Pennsylvania " + yearPlan.year + " stored crosswalk drifted at " + reportingCode);
    }
    seenCrosswalks.add(crosswalkKey);
  }
  return { exactFeatures: features.length, exactCrosswalks: crosswalks.length };
}

export async function readPennsylvaniaPersistedProductionReleaseAudit(
  sql,
  releaseCandidate,
) {
  if (
    typeof releaseCandidate?.id !== "string"
    || !/^[a-f0-9]{64}$/.test(releaseCandidate?.sha256 ?? "")
  ) {
    throw new Error("Pennsylvania hidden receipt recovery requires an exact release candidate");
  }
  const rows = await query(sql, [
    "select e.year,gv.status,gv.metadata",
    "from geography_versions gv",
    "join elections e on e.id=gv.election_id",
    "where gv.state_code='PA' and gv.geography_type='precinct'",
    " and gv.metadata->'releaseCandidate'->>'id'=$1",
    " and gv.metadata->'releaseCandidate'->>'sha256'=$2",
    "order by e.year",
  ], [releaseCandidate.id, releaseCandidate.sha256]);
  const expectedYears = [2016, 2020];
  if (
    rows.length !== expectedYears.length
    || rows.some((row, index) => Number(row.year) !== expectedYears[index])
  ) {
    throw new Error("Pennsylvania hidden receipt recovery found an incomplete year set");
  }
  const firstAudit = rows[0]?.metadata?.productionReleaseAudit;
  const audit = validatedProductionReleaseAudit(firstAudit);
  for (const row of rows) {
    if (
      String(row.status) !== "blocked"
      || row.metadata?.publicDeliveryAuthorized !== false
      || JSON.stringify(canonicalJson(row.metadata?.releaseCandidate ?? null))
        !== JSON.stringify(canonicalJson({
          id: releaseCandidate.id,
          sha256: releaseCandidate.sha256,
          publicDeliveryAuthorized: false,
        }))
      || JSON.stringify(canonicalJson(row.metadata?.productionReleaseAudit ?? null))
        !== JSON.stringify(canonicalJson(audit))
    ) {
      throw new Error("Pennsylvania hidden receipt recovery audit drifted across years");
    }
  }
  return audit;
}

export async function validatePennsylvaniaPrecinctGisClient(
  sql,
  plan,
  options = {},
) {
    const context = buildPennsylvaniaPrecinctExecutionContext(
      options.executionContext,
    );
    const output = [];
    for (const yearPlan of plan.years) {
      const rows = await query(sql, [
        "select e.id election_id,",
        " (select count(*)::int from reporting_units ru",
        "  where ru.state_code=$1 and ru.election_id=e.id",
        "   and ru.reporting_grain='precinct') reporting_units,",
        " (select count(*)::int from result_rows rr join contests c on c.id=rr.contest_id",
        "  where rr.state_code=$1 and c.election_id=e.id and c.office='president'",
        "   and rr.level='precinct' and rr.jurisdiction_code like $3) result_rows,",
        " (select count(*)::int from result_rows rr",
        "  join contests c on c.id=rr.contest_id",
        "  join reporting_units ru on ru.id=rr.reporting_unit_id",
        "  where rr.state_code=$1 and c.election_id=e.id and c.office='president'",
        "   and rr.level='precinct' and rr.jurisdiction_code like $3",
        "   and ru.state_code=$1 and ru.election_id=e.id and ru.reporting_grain='precinct')",
        "  same_year_result_rows,",
        " (select count(*)::int from geography_versions gv",
        "  where gv.state_code=$1 and gv.election_id=e.id",
        "   and gv.geography_type='precinct') geography_versions,",
        " (select count(*)::int from geography_versions gv",
        "  where gv.state_code=$1 and gv.election_id=e.id",
        "   and gv.geography_type='precinct' and gv.status='blocked'",
        "   and gv.metadata->>'manifestId'=$4::text and gv.metadata->>'manifestSha256'=$5::text",
        "   and gv.metadata->>'publicDeliveryAuthorized'='false')",
        "  safe_geography_versions,",
        " (select count(*)::int from geography_features gf",
        "  join geography_versions gv on gv.id=gf.geometry_version_id",
        "  where gv.state_code=$1 and gv.election_id=e.id",
        "   and gv.geography_type='precinct') features,",
        " (select count(*)::int from reporting_unit_geometry_crosswalks x",
        "  join geography_versions gv on gv.id=x.geometry_version_id",
        "  join reporting_units ru on ru.id=x.reporting_unit_id",
        "  where gv.state_code=$1 and gv.election_id=e.id and ru.election_id=e.id",
        "   and x.review_status='reviewed') crosswalks",
        "from elections e where e.year=$2 and e.office='president'",
      ], [
        STATE,
        yearPlan.year,
        "reporting:" + STATE + ":" + yearPlan.electionId + ":%",
        yearPlan.manifest.id,
        yearPlan.manifestSha256,
      ]);
      if (rows.length !== 1) throw new Error("Missing " + yearPlan.year + " election");
      const row = rows[0];
      const expectedGeometry = yearPlan.geometry.disposition === "blocked"
        ? { versions: 0, features: 0, crosswalks: 0 }
        : {
          versions: 1,
          features: yearPlan.geometry.features.length,
          crosswalks: yearPlan.geometry.crosswalks.length,
        };
      if (
        Number(row.reporting_units) !== yearPlan.reportingUnits.length
        || Number(row.result_rows) !== yearPlan.resultRows.length
        || Number(row.geography_versions) !== expectedGeometry.versions
        || Number(row.features) !== expectedGeometry.features
        || Number(row.same_year_result_rows) !== yearPlan.resultRows.length
        || Number(row.crosswalks) !== expectedGeometry.crosswalks
        || Number(row.safe_geography_versions) !== expectedGeometry.versions
      ) {
        throw new Error("Pennsylvania " + yearPlan.year + " database counts drifted: " + JSON.stringify({
          actual: row,
          expected: {
            reportingUnits: yearPlan.reportingUnits.length,
            resultRows: yearPlan.resultRows.length,
            sameYearResultRows: yearPlan.resultRows.length,
            geographyVersions: expectedGeometry.versions,
            features: expectedGeometry.features,
            crosswalks: expectedGeometry.crosswalks,
            safeGeographyVersions: expectedGeometry.versions,
          },
        }));
      }
      const provenance = await validateSourceDocumentRecords(
        sql,
        yearPlan,
        context,
      );
      await validateStoredProductionAudit(
        sql,
        yearPlan,
        row.election_id,
        context,
      );
      const exactGeometry = await validateStoredGeometryRecords(
        sql,
        yearPlan,
        row.election_id,
        context,
      );

      const totals = await query(sql, [
        "select candidate_name,sum(votes)::bigint votes from result_rows rr",
        "join contests c on c.id=rr.contest_id",
        "where rr.state_code=$1 and c.election_id=$2::uuid and rr.level='precinct'",
        " and rr.jurisdiction_code like $3",
        "group by candidate_name order by candidate_name",
      ], [
        STATE,
        row.election_id,
        "reporting:" + STATE + ":" + yearPlan.electionId + ":%",
      ]);
      const actualTotals = Object.fromEntries(
        totals.map((item) => [String(item.candidate_name), Number(item.votes)]),
      );
      const expectedTotals = {};
      for (const result of yearPlan.resultRows) {
        expectedTotals[result.candidateName] =
          (expectedTotals[result.candidateName] ?? 0) + result.votes;
      }
      for (const [name, votes] of Object.entries(expectedTotals)) {
        if (actualTotals[name] !== votes) {
          throw new Error("Pennsylvania " + yearPlan.year + " " + name + " total drifted");
        }
      }
      if (Object.keys(actualTotals).length !== Object.keys(expectedTotals).length) {
        throw new Error("Pennsylvania " + yearPlan.year + " candidate grouping drifted");
      }
      const zero = await query(sql, [
        "select count(*)::int count from (",
        " select rr.reporting_unit_id from result_rows rr",
        " join contests c on c.id=rr.contest_id",
        " where rr.state_code=$1 and c.election_id=$2::uuid and rr.level='precinct'",
        "  and rr.jurisdiction_code like $3",
        " group by rr.reporting_unit_id having sum(rr.votes)=0) units",
      ], [
        STATE,
        row.election_id,
        "reporting:" + STATE + ":" + yearPlan.electionId + ":%",
      ]);
      if (Number(zero[0].count) !== yearPlan.zeroVoteUnits) {
        throw new Error("Pennsylvania " + yearPlan.year + " zero-vote count drifted");
      }
      output.push({
        year: yearPlan.year,
        electionId: yearPlan.electionId,
        reportingUnits: Number(row.reporting_units),
        resultRows: Number(row.result_rows),
        sameYearResultRows: Number(row.same_year_result_rows),
        candidateTotals: actualTotals,
        totalVotes: Object.values(actualTotals).reduce((sum, value) => sum + value, 0),
        zeroVoteUnits: Number(zero[0].count),
        resultSourceSlug: provenance.resultSourceSlug,
        geometrySourceSlug: provenance.geometrySourceSlug,
        geometryDisposition: yearPlan.geometry.disposition,
        geographyVersions: Number(row.geography_versions),
        features: Number(row.features),
        safeBlockedGeographyVersions: Number(row.safe_geography_versions),
        reviewedCrosswalks: Number(row.crosswalks),
        exactFeatures: exactGeometry.exactFeatures,
        exactCrosswalks: exactGeometry.exactCrosswalks,
      });
    }
    const invalid = await query(sql, [
      "select count(*)::int count from pg_constraint",
      "where connamespace='public'::regnamespace and not convalidated",
    ]);
    if (Number(invalid[0].count) !== 0) {
      throw new Error("Pennsylvania precinct unit database has unvalidated public constraints");
    }
    const revision = await query(sql, [
      "select revision::int revision from public_data_revisions where scope='public'",
    ]);
    return {
      database: {
        ...context.database,
        readOnlySession: options.readOnlySession ?? context.mode === "local",
      },
      executionMode: context.mode,
      productionMutationPerformed: context.mode === "production_release",
      publicDeliveryAuthorized: false,
      releaseCandidate: context.releaseCandidate,
      productionReleaseAudit: context.productionReleaseAudit,
      invalidConstraints: 0,
      revision: revision.length ? Number(revision[0].revision) : null,
      years: output,
    };
}

export async function validatePennsylvaniaPrecinctGisDatabase(plan, options = {}) {
  if (getDatabaseDriver() !== "postgres") {
    throw new Error("Pennsylvania precinct GIS validation requires CRM_DATABASE_DRIVER=postgres");
  }
  const databaseUrl = getLocalCloneDatabaseUrl();
  const sql = (options.postgresFactory ?? postgres)(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
    connection: {
      application_name: APPLICATION_NAME + "-validator",
      default_transaction_read_only: true,
    },
  });
  try {
    return await validatePennsylvaniaPrecinctGisClient(sql, plan, {
      executionContext: { mode: "local" },
      readOnlySession: true,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

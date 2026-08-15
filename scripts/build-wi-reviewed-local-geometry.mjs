import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { inspectPrecinctCrosswalk } from "../src/lib/precinct-crosswalk.ts";
import { inspectPrecinctGeometryManifest } from "../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./lib/precinct-geometry-validation.mjs";
import {
  buildWisconsinReviewedModel,
  sha256,
  summarizeWisconsinModel,
  WISCONSIN_GEOGRAPHY_LEVEL,
  WISCONSIN_RAW_SOURCE_PINS,
  WISCONSIN_REVIEWED_AT,
  WISCONSIN_YEAR_SPECS,
} from "./lib/wi-reviewed-local-geometry.mjs";

const ROOT = process.cwd();
const YEARS = [2012, 2016, 2020, 2024];

const RAW_ARTIFACTS = Object.freeze({
  2012: [
    ["data/precinct-geometry/WI/2012-11-06-general/raw/wec-2012-general/2012-11-06-ward-by-ward.xls", "official GAB/WEC ward-by-ward XLS", "https://whs.access.preservica.com/download/file/IO_42c8a6e0-0621-4aa7-bb4e-9dd5c8669f70", "Wisconsin Government Accountability Board / Wisconsin Elections Commission records retained by the Wisconsin Historical Society", "Official 3,525-row presidential reporting-unit result universe; sole vote-value source."],
    ["data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/item-metadata.json", "official ArcGIS item metadata", "https://www.arcgis.com/sharing/rest/content/items/444f867b16e24bb2a085b17db40a0af2?f=pjson", "Wisconsin Legislature / LTSB", "Identifies the 2011 ward layer and population-disaggregated 2012 election context."],
    ["data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/item-data.json", "official ArcGIS item data", "https://www.arcgis.com/sharing/rest/content/items/444f867b16e24bb2a085b17db40a0af2/data?f=json", "Wisconsin Legislature / LTSB", "Retains the item-level service definition and source-layer binding."],
    ["data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/service-metadata.json", "official ArcGIS service metadata", "https://services1.arcgis.com/FDsAtKBk8Hy4cAH0/arcgis/rest/services/2012_to_2020_Election_Data_with_2020_Wards/FeatureServer?f=pjson", "Wisconsin Legislature / LTSB", "Retains the official service description and layer inventory."],
    ["data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/layer-metadata.json", "official ArcGIS layer metadata", "https://services1.arcgis.com/FDsAtKBk8Hy4cAH0/arcgis/rest/services/2012_to_2020_Election_Data_with_2020_Wards/FeatureServer/0?f=pjson", "Wisconsin Legislature / LTSB", "Retains the official field definitions and the documented population-disaggregation context."],
    ...[0, 2000, 4000, 6000].map((offset) => [`data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/2012-identity-and-context-values-${offset}.json`, "official ArcGIS attribute page", "https://services1.arcgis.com/FDsAtKBk8Hy4cAH0/arcgis/rest/services/2012_to_2020_Election_Data_with_2020_Wards/FeatureServer", "Wisconsin Legislature / LTSB", "Retained only to audit ward identities and the documented allocation context; every election-value field is excluded from derivatives."]),
  ],
  2016: [
    ["data/precinct-geometry/WI/2016-11-08-general/raw/wec-2016-general/president-recount-ward-by-ward-with-districts.xlsx", "official WEC recount XLSX", "https://elections.wi.gov/media/7123/download", "Wisconsin Elections Commission", "Official 3,636-row presidential recount reporting-unit universe; sole vote-value source."],
    ["data/precinct-geometry/WI/2016-11-08-general/raw/vest/wi_2016.zip", "VEST election-specific ESRI Shapefile ZIP", "https://dataverse.harvard.edu/file.xhtml?fileId=4468121&version=88.0", "Voting and Election Science Team; source boundaries attributed to Wisconsin LTSB and Wisconsin Department of Administration records", "Geometry only. Every VEST election field is discarded before normalized geometry is written."],
    ["data/precinct-geometry/WI/2016-11-08-general/raw/vest/documentation.txt", "VEST documentation", "https://election.lab.ufl.edu/data-downloads/resultsdata/2016/precinct/documentation.txt", "Voting and Election Science Team", "Documents boundary edits, reporting-unit disaggregation, and source provenance. Allocated values are never used."],
    ["data/precinct-geometry/WI/2016-11-08-general/raw/vest/dataverse-license-evidence.json", "version-pinned license evidence", "https://dataverse.harvard.edu/file.xhtml?fileId=4468121&version=88.0", "Harvard Dataverse", "Binds the retained state ZIP to dataset version 88.0 and CC BY 4.0 terms."],
  ],
  2020: [
    ["data/precinct-geometry/WI/2020-11-03-general/raw/wec-2020-general/wec-2020-president-after-recount-by-state-representative-district.xlsx", "official WEC recount XLSX", "https://elections.wi.gov/election-result/2020-fall-general-election-results", "Wisconsin Elections Commission", "Official 3,698-row presidential recount reporting-unit universe; sole vote-value source."],
    ["data/precinct-geometry/WI/2020-11-03-general/raw/vest/wi_2020.zip", "VEST election-specific ESRI Shapefile ZIP", "https://dataverse.harvard.edu/file.xhtml?fileId=4773528&version=21.0", "Voting and Election Science Team; source boundaries attributed to Wisconsin LTSB", "Geometry only. Every VEST election field is discarded before normalized geometry is written."],
    ["data/precinct-geometry/WI/2020-11-03-general/raw/vest/documentation.txt", "VEST documentation", "https://election.lab.ufl.edu/data-downloads/resultsdata/2020/precinct/documentation.txt", "Voting and Election Science Team", "Documents source geometry and reporting-unit disaggregation. Allocated values are never used."],
    ["data/precinct-geometry/WI/2020-11-03-general/raw/vest/dataverse-license-evidence.json", "version-pinned license evidence", "https://dataverse.harvard.edu/file.xhtml?fileId=4773528&version=21.0", "Harvard Dataverse", "Binds the retained state ZIP to dataset version 21.0 and CC BY 4.0 terms."],
  ],
  2024: [
    ["data/precinct-geometry/WI/2024-11-05-general/raw/wec-2024-general/ward-by-ward-federal-state.xlsx", "official WEC ward-by-ward XLSX", "https://elections.wi.gov/election-result/2024-fall-general-election-results", "Wisconsin Elections Commission", "Official 3,603-row presidential reporting-unit universe; sole vote-value source."],
    ["data/wi-2024-ward-geometry-item-metadata.json", "official LTSB 2025-ward diagnostic metadata", "https://www.arcgis.com/sharing/rest/content/items/878d8826218f42509e07437a82ef6b6e?f=json", "Wisconsin Legislature / LTSB", "Documents why the otherwise official 2025-ward layer is not used: election values were population-disaggregated and ward totals may differ from WEC totals."],
    ["data/precinct-geometry/WI/2024-11-05-general/raw/nyt/WI-precincts-with-results.geojson.gz", "NYT election-specific GeoJSON gzip", "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/WI-precincts-with-results.geojson.gz", "The New York Times", "All 3,503 retained features are marked official_boundary=true. Embedded votes are used only to verify the join, then discarded."],
    ["data/precinct-geometry/WI/2024-11-05-general/raw/nyt/WI-precincts-with-results.csv.gz", "NYT compact cross-check CSV gzip", "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/WI-precincts-with-results.csv.gz", "The New York Times", "Retained for reproducibility; never a displayed vote source."],
    ["data/precinct-geometry/WI/2024-11-05-general/raw/nyt/README.md", "NYT source README", "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/README.md", "The New York Times", "Defines official_boundary and Wisconsin coverage."],
    ["data/precinct-geometry/WI/2024-11-05-general/raw/nyt/LICENSE", "NYT Content API Use and Data Agreement", "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/LICENSE", "The New York Times", "Non-commercial attribution terms retained byte-for-byte."],
  ],
});

function absolute(relativePath) {
  return path.join(ROOT, ...relativePath.split("/"));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gzipJsonBytes(value) {
  return gzipSync(jsonBytes(value), { level: 9, mtime: 0 });
}

function artifact(bytes, localArtifactPath) {
  return { localArtifactPath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function assertPinnedInputs() {
  const failures = [];
  for (const [relativePath, [expectedBytes, expectedSha]] of Object.entries(WISCONSIN_RAW_SOURCE_PINS)) {
    try {
      const bytes = readFileSync(absolute(relativePath));
      const actualSha = sha256(bytes);
      if (bytes.length !== expectedBytes || actualSha !== expectedSha) failures.push(`${relativePath}: expected ${expectedBytes}/${expectedSha}, received ${bytes.length}/${actualSha}`);
    } catch (error) {
      failures.push(`${relativePath}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Wisconsin raw source pin validation failed before writes:\n${failures.join("\n")}`);
}

function rawEvidence([localArtifactPath, format, sourceUrl, authority, note]) {
  const bytes = readFileSync(absolute(localArtifactPath));
  const value = { localArtifactPath, byteCount: bytes.length, sha256: sha256(bytes), format, sourceUrl, authority, derivation: "Retained byte-for-byte from the cited source.", note };
  if (localArtifactPath.endsWith(".gz")) {
    const raw = gunzipSync(bytes);
    value.compression = "gzip";
    value.uncompressedByteCount = raw.length;
    value.uncompressedSha256 = sha256(raw);
  }
  return value;
}

function totals(rows) {
  return rows.reduce((sum, row) => ({ democraticVotes: sum.democraticVotes + row.democratic, republicanVotes: sum.republicanVotes + row.republican, otherVotes: sum.otherVotes + row.other, totalVotes: sum.totalVotes + row.total }), { democraticVotes: 0, republicanVotes: 0, otherVotes: 0, totalVotes: 0 });
}

function summarizeCrosswalkRows(rows) {
  const summary = { resultUnits: rows.length, colorableResultUnits: 0, matchedResultUnits: 0, unmatchedResultUnits: 0, nonGeographicResultUnits: 0, sourceAliasResultUnits: 0, relationships: { oneToOne: 0, oneToMany: 0, manyToOne: 0, unmatched: 0, nonGeographic: 0, sourceAlias: 0, pendingReview: 0 } };
  const keys = { one_to_one: "oneToOne", one_to_many: "oneToMany", many_to_one: "manyToOne", unmatched: "unmatched", non_geographic: "nonGeographic", source_alias: "sourceAlias" };
  for (const row of rows) {
    const relationship = row.relationships[0];
    if (row.isGeographic) summary.colorableResultUnits += 1;
    else summary.nonGeographicResultUnits += 1;
    if (relationship.relationshipType === "unmatched") summary.unmatchedResultUnits += 1;
    else if (!["non_geographic", "source_alias"].includes(relationship.relationshipType)) summary.matchedResultUnits += 1;
    if (relationship.reviewStatus !== "reviewed") summary.relationships.pendingReview += 1;
    else summary.relationships[keys[relationship.relationshipType]] += 1;
  }
  return summary;
}

function reconciliation(rows) {
  const byParent = new Map();
  for (const row of rows) {
    const values = byParent.get(row.parentGeoid) ?? [];
    values.push(row);
    byParent.set(row.parentGeoid, values);
  }
  const scope = (scopeType, scopeId, values) => {
    const resultTotals = totals(values);
    return { scopeType, scopeId, resultTotals, mappedTotals: { ...resultTotals }, deltas: Object.fromEntries(Object.keys(resultTotals).map((key) => [key, 0])) };
  };
  return [scope("state", "WI", rows), ...[...byParent].sort(([a], [b]) => a.localeCompare(b)).map(([parent, values]) => scope("parent", parent, values))];
}

function warnings(year, summary) {
  if (year === 2012) return [
    "The official 3,525-row result universe is retained, but the 2011 LTSB ward layer contains population-disaggregated election context rather than a vote-preserving result-to-boundary crosswalk.",
    "No 2012 geometry or allocated LTSB vote value is emitted into normalized delivery candidates.",
  ];
  const values = [
    "Every displayed candidate value, when separately authorized, comes only from the official WEC/GAB result workbook.",
    `${summary.excludedResultUnits} official zero-vote reporting units lack reviewed geometry and remain reconciliation-only.`,
    "No WEC result is divided, proportionally allocated, or copied to multiple polygons.",
  ];
  if (year === 2016) values.push("VEST reconstructed the November boundary edition from LTSB and Wisconsin Department of Administration records and disaggregated source votes; all 2016 VEST vote fields are discarded. The official WEC recount workbook remains the sole vote source.");
  if (year === 2020) values.push("VEST reconciled LTSB Fall 2020 and later ward information and disaggregated source votes; all 2020 VEST vote fields are discarded. The official WEC recount workbook remains the sole vote source.");
  if (year === 2024) values.push("The NYT geometry is marked official_boundary=true and matches WEC by county, complete reporting label, and exact Harris/Trump values. NYT non-commercial attribution terms must accompany delivery.");
  if (summary.noDataFeatures) values.push(`${summary.noDataFeatures} source boundary components have no official result relationship and are retained only as explicit no-data shapes.`);
  return values;
}

function sourceTerms(year) {
  if (year === 2012) return "Official Wisconsin public records are retained for audit; LTSB terms apply and public geometry delivery remains blocked.";
  if (year === 2024) return "NYT geometry is retained under the NYT Content API Use and Data Agreement non-commercial attribution terms; official WEC values are the sole vote source.";
  return "VEST geometry is retained under CC BY 4.0 with attribution; official WEC/GAB values are the sole vote source.";
}

function boundaryVintage(year) {
  if (year === 2012) return "Official 2011 LTSB wards with population-disaggregated 2012 context; November 6, 2012 result-unit equivalence is unproven";
  if (year === 2016) return "VEST 2016 election-specific reconstruction from Wisconsin LTSB boundaries and Wisconsin Department of Administration municipal change records";
  if (year === 2020) return "VEST 2020 election-specific reconstruction using Wisconsin LTSB Fall 2020 wards and reviewed later-ward corrections";
  return "NYT 2024 Wisconsin election-specific package; every retained feature is marked official_boundary=true";
}

async function buildYear(year) {
  const model = await buildWisconsinReviewedModel(year, { root: ROOT });
  const { spec } = model.official;
  const base = `data/precinct-geometry/WI/${spec.electionId}`;
  const geometryPath = `${base}/normalized/wi-${year}-reviewed-local-reporting-geometry.geojson.gz`;
  const resultsPath = `${base}/normalized/wi-${year}-official-president-results.json.gz`;
  const crosswalkPath = `${base}/crosswalk/wi-${year}-result-to-geometry-review.json`;
  const evidencePath = `${base}/source-evidence.json`;
  const reportPath = `${base}/reports/wi-${year}-local-reporting-geometry-review.json`;
  const manifestPath = `${base}/manifest.json`;

  const geometryBytes = gzipJsonBytes(model.geometry);
  const resultsDocument = {
    schemaVersion: 1,
    state: "WI",
    electionId: spec.electionId,
    reportingGrain: WISCONSIN_GEOGRAPHY_LEVEL,
    sourceAuthority: year === 2012 ? "Wisconsin Government Accountability Board" : "Wisconsin Elections Commission",
    sourceUnitCount: model.official.rows.length,
    colorableUnitCount: model.rows.resultRows.length,
    excludedUnitCount: model.rows.exclusions.length,
    officialTotals: totals(model.official.rows),
    mappedTotals: totals(model.rows.resultRows),
    candidates: model.official.candidates,
    rows: model.rows.resultRows,
    exclusions: model.rows.exclusions,
  };
  const resultsBytes = gzipJsonBytes(resultsDocument);
  const crosswalk = {
    schemaVersion: 1,
    manifestId: spec.manifestId,
    state: "WI",
    electionId: spec.electionId,
    geographyLevel: WISCONSIN_GEOGRAPHY_LEVEL,
    resultSourceId: spec.resultSourceId,
    generatedAt: WISCONSIN_REVIEWED_AT,
    rows: model.rows.crosswalkRows.sort((a, b) => a.resultUnitCode.localeCompare(b.resultUnitCode)),
    reconciliation: spec.reviewed ? { status: "passed", scopes: reconciliation(model.rows.resultRows) } : { status: "not_run", scopes: [] },
  };
  const crosswalkBytes = jsonBytes(crosswalk);
  const expectedCrosswalkSummary = summarizeCrosswalkRows(crosswalk.rows);
  const summary = summarizeWisconsinModel(model);
  const blockers = spec.reviewed ? ["Immutable parent-scoped delivery and the guarded production release have not been completed."] : [
    "No reviewed election-date-safe relationship links the 3,525 official result units to the 2011 LTSB ward layer.",
    "The LTSB election fields are population-disaggregated context and are prohibited as displayed results.",
    "Immutable parent-scoped delivery and the guarded production release have not been completed.",
  ];
  const caveats = warnings(year, summary);
  const evidence = {
    schemaVersion: 1,
    id: `wi-${year}-official-results-and-local-geometry-review`,
    state: "WI",
    election: { id: spec.electionId, date: spec.date, year, type: "general", office: "president" },
    authority: year === 2012 ? "Wisconsin Government Accountability Board / Wisconsin Historical Society and Wisconsin Legislature / LTSB" : year === 2024 ? "Wisconsin Elections Commission and The New York Times" : "Wisconsin Elections Commission and Voting and Election Science Team",
    retrievedAt: WISCONSIN_REVIEWED_AT,
    artifacts: RAW_ARTIFACTS[year].map(rawEvidence),
    resultIdentity: { sourceId: spec.resultSourceId, sourceUnitCount: model.official.rows.length, colorableSourceUnitCount: model.rows.resultRows.length, excludedZeroVoteUnits: model.rows.exclusions.filter((row) => row.total === 0).length, officialTotals: totals(model.official.rows), mappedTotals: totals(model.rows.resultRows) },
    joinReview: { reviewedForPublicRowRendering: spec.reviewed, mappedResultUnits: model.rows.resultRows.length, unlinkedGeometryFeatures: summary.noDataFeatures, resultAllocationPerformed: false, secondaryVoteFieldsUsedForDisplay: false, relationshipSummary: model.geometryModel.relationshipSummary ?? null },
    caveats,
    blockers,
  };
  const evidenceBytes = jsonBytes(evidence);
  const preliminaryManifest = {
    schemaVersion: 1,
    id: spec.manifestId,
    state: "WI",
    election: { id: spec.electionId, date: spec.date, year, type: "general", office: "president" },
    geography: { level: WISCONSIN_GEOGRAPHY_LEVEL, parentLevel: "county", boundaryVintage: boundaryVintage(year), vintageStatus: spec.reviewed ? "election_date_confirmed" : "unknown", derivationMethod: spec.reviewed ? "secondary_reconstruction" : "availability_diagnostic" },
    source: { authority: evidence.authority, url: RAW_ARTIFACTS[year][spec.reviewed ? 1 : 0][2], retrievedAt: WISCONSIN_REVIEWED_AT, artifact: evidencePath, sha256: sha256(evidenceBytes), byteCount: evidenceBytes.length, format: "precinct-source-evidence+json", licenseOrTerms: sourceTerms(year) },
    normalization: { script: "scripts/build-wi-reviewed-local-geometry.mjs", sourceCrs: year === 2024 ? "EPSG:4326 GeoJSON" : year === 2012 ? "not applicable; no approved geometry emitted" : "source-defined and normalized by shpjs", servedCrs: "EPSG:4326", artifact: geometryPath, sha256: sha256(geometryBytes), byteCount: geometryBytes.length, featureCount: model.geometry.features.length, sourceFeatureIdFields: ["CRM_FEATURE_ID"], parentIdFields: ["CRM_PARENT_GEOID"] },
    crosswalk: { status: spec.reviewed ? "reviewed" : "blocked", resultSourceId: spec.resultSourceId, artifact: crosswalkPath, sha256: sha256(crosswalkBytes), byteCount: crosswalkBytes.length, ...expectedCrosswalkSummary, ...(spec.reviewed ? { reviewedRelationshipRecords: model.rows.crosswalkRows.length, reviewedNoDataFeatures: summary.noDataFeatures } : {}), methods: spec.reviewed ? ["reviewed_name", "spatial_review"] : ["normalized_name_candidate"] },
    validation: { status: "blocked", geometryValid: spec.reviewed, rowLevelRenderingSafe: spec.reviewed, parentTotalsReconciled: spec.reviewed, resultTotalsReconciled: spec.reviewed, errors: blockers, warnings: caveats },
    delivery: null,
    caveats: ["No result value from VEST, NYT, or LTSB allocated election fields is used as a displayed election result.", ...caveats, ...blockers],
  };
  const knownFeatureIds = new Set(model.geometry.features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`));
  const knownFeatureParents = new Map(model.geometry.features.map((feature) => [`${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`, feature.properties.CRM_PARENT_GEOID]));
  const crosswalkInspection = inspectPrecinctCrosswalk(crosswalk, preliminaryManifest, knownFeatureIds, knownFeatureParents);
  if (crosswalkInspection.errors.length) throw new Error(`${year} Wisconsin crosswalk validation failed:\n${crosswalkInspection.errors.join("\n")}`);
  const manifest = { ...preliminaryManifest, crosswalk: { ...preliminaryManifest.crosswalk, ...crosswalkInspection.summary } };
  const manifestInspection = inspectPrecinctGeometryManifest(manifest);
  if (manifestInspection.errors.length) throw new Error(`${year} Wisconsin manifest validation failed:\n${manifestInspection.errors.join("\n")}`);
  const manifestBytes = jsonBytes(manifest);
  const report = { schemaVersion: 1, state: "WI", electionId: spec.electionId, generatedAt: WISCONSIN_REVIEWED_AT, disposition: spec.reviewed ? "reviewed_row_level_rendering_delivery_pending" : "blocked_election_date_crosswalk_unavailable", summary, officialTotals: totals(model.official.rows), mappedTotals: totals(model.rows.resultRows), crosswalk: crosswalkInspection.summary, exclusions: model.rows.exclusions, diagnostics: { unresolvedResultRows: model.geometryModel.diagnostics?.unresolvedResultRows?.map((row) => ({ countyName: row.countyName, reportingUnitLabel: row.reportingUnitLabel, total: row.total })) ?? [], partialGroups: model.geometryModel.diagnostics?.partialGroups ?? [] }, blockers, artifacts: { geometry: { ...artifact(geometryBytes, geometryPath), uncompressedByteCount: gunzipSync(geometryBytes).length, uncompressedSha256: sha256(gunzipSync(geometryBytes)) }, results: { ...artifact(resultsBytes, resultsPath), uncompressedByteCount: gunzipSync(resultsBytes).length, uncompressedSha256: sha256(gunzipSync(resultsBytes)) }, crosswalk: artifact(crosswalkBytes, crosswalkPath), sourceEvidence: artifact(evidenceBytes, evidencePath), manifest: artifact(manifestBytes, manifestPath) } };
  return { manifest, paths: { [geometryPath]: geometryBytes, [resultsPath]: resultsBytes, [crosswalkPath]: crosswalkBytes, [evidencePath]: evidenceBytes, [manifestPath]: manifestBytes, [reportPath]: jsonBytes(report) }, summary };
}

assertPinnedInputs();
const packages = [];
for (const year of YEARS) packages.push(await buildYear(year));
for (const releasePackage of packages) {
  for (const [relativePath, bytes] of Object.entries(releasePackage.paths)) {
    mkdirSync(path.dirname(absolute(relativePath)), { recursive: true });
    writeFileSync(absolute(relativePath), bytes);
  }
  if (releasePackage.summary.year !== 2012) {
    const inspection = validateManifestArtifacts(releasePackage.manifest, { root: ROOT, skipDelivery: true });
    if (inspection.errors.length) throw new Error(`${releasePackage.summary.year} Wisconsin artifact validation failed:\n${inspection.errors.join("\n")}`);
  }
}

process.stdout.write(`${JSON.stringify({ ok: true, state: "WI", reviewedAt: WISCONSIN_REVIEWED_AT, years: packages.map((item) => item.summary) }, null, 2)}\n`);

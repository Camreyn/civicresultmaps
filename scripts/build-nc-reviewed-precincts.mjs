import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { inspectPrecinctCrosswalk } from "../src/lib/precinct-crosswalk.ts";
import { inspectPrecinctGeometryManifest } from "../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./lib/precinct-geometry-validation.mjs";
import {
  buildNorthCarolinaPrecinctReviewModel,
  buildNorthCarolinaReconciliation,
  NORTH_CAROLINA_PRECINCT_YEAR_SPECS,
  NORTH_CAROLINA_RAW_SOURCE_PINS,
  NORTH_CAROLINA_REVIEWED_AT,
  sha256,
  summarizeNorthCarolinaModel,
} from "./lib/nc-precinct-geometry.mjs";

const ROOT = process.cwd();
const YEARS = [2012, 2016, 2020, 2024];

const RAW_ARTIFACTS = Object.freeze({
  2012: [
    {
      path: "data/precinct-geometry/NC/2012-11-06-general/raw/ncsbe/results_sort_20121106.zip",
      format: "official NCSBE precinct-sorted results ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2012_11_06/results_sort_20121106.zip",
      authority: "North Carolina State Board of Elections",
      note: "Official VTD-sorted presidential rows. NCSBE documents residence-based reassignment of accepted absentee/provisional ballots and statutory statistical noise; these are official VTD rows, not the certified canvass presentation.",
    },
    {
      path: "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/NC_VTD.zip",
      format: "MGGG/NC General Assembly VTD Shapefile ZIP",
      sourceUrl: "https://github.com/mggg-states/NC-shapefiles",
      authority: "Metric Geometry and Gerrymandering Group; source geometry and election data attributed to the North Carolina General Assembly",
      note: "Geometry only. Embedded election fields are used solely to prove a unique, fully reconciled relationship to the official NCSBE VTD rows and are removed from normalized geometry.",
    },
    {
      path: "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/README.md",
      format: "MGGG source and field documentation",
      sourceUrl: "https://github.com/mggg-states/NC-shapefiles/blob/master/README.md",
      authority: "Metric Geometry and Gerrymandering Group",
      note: "Identifies the NC General Assembly 2016 Redistricting Reference Data source and documents the 2012 presidential fields.",
    },
    {
      path: "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/LICENSE.md",
      format: "MGGG license statement",
      sourceUrl: "https://github.com/mggg-states/NC-shapefiles",
      authority: "Metric Geometry and Gerrymandering Group",
      note: "Retains ODbL 1.0 database and DBCL 1.0 contents terms.",
    },
    {
      path: "data/precinct-geometry/NC/2012-11-06-general/raw/review/nc-mggg-validation-report.pdf",
      format: "Redistricting Data Hub independent validation report PDF",
      sourceUrl: "https://redistrictingdatahub.org/wp-content/uploads/2020/12/NC_mggg_validation_report.pdf",
      authority: "Redistricting Data Hub",
      note: "Independently documents the complete 2012 NCSBE precinct-sorted result join and exclusion of countywide/no-geometry categories.",
    },
  ],
  2016: [
    {
      path: "data/nc-2016-results-precinct.zip",
      format: "official NCSBE precinct results ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2016_11_08/results_pct_20161108.zip",
      authority: "North Carolina State Board of Elections",
      note: "Official presidential result rows; sole displayed vote source.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20161004.zip",
      format: "official NCSBE statewide precinct Shapefile ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ShapeFiles/Precinct/SBE_PRECINCTS_20161004.zip",
      authority: "North Carolina State Board of Elections",
      note: "Final retained statewide snapshot before the November 8, 2016 election; all 2,704 feature IDs exactly match official result identities.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/ncsbe-precinct-archive-index.xml",
      format: "official NCSBE S3 precinct archive index XML",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov?list-type=2&prefix=ShapeFiles%2FPrecinct%2F",
      authority: "North Carolina State Board of Elections",
      note: "Retains the official chronology, object key, timestamp, size, and ETag for the dated statewide snapshot.",
    },
  ],
  2020: [
    {
      path: "data/nc-2020-results-precinct.zip",
      format: "official NCSBE precinct results ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2020_11_03/results_pct_20201103.zip",
      authority: "North Carolina State Board of Elections",
      note: "Official presidential rows with Real Precinct classification; sole displayed vote source.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20201018.zip",
      format: "official NCSBE statewide precinct Shapefile ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ShapeFiles/Precinct/SBE_PRECINCTS_20201018.zip",
      authority: "North Carolina State Board of Elections",
      note: "Final retained statewide snapshot before the November 3, 2020 election.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20190827.zip",
      format: "official NCSBE supplemental precinct Shapefile ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/PrecinctMaps/SBE_PRECINCTS_20190827.zip",
      authority: "North Carolina State Board of Elections",
      note: "Supplies the four official result identities absent from the October 2020 snapshot; each supplement is clipped into the current county coverage without overlap or vote allocation.",
    },
    {
      path: "data/precinct-geometry/NC/2020-11-03-general/raw/review/nc-vest-2020-validation-report.pdf",
      format: "Redistricting Data Hub/VEST validation report PDF",
      sourceUrl: "https://redistrictingdatahub.org/wp-content/uploads/2021/06/nc_vest_20_validation_report.pdf",
      authority: "Redistricting Data Hub and Voting and Election Science Team",
      note: "Independently identifies the same four missing result units and the official August 2019 supplemental geometry source.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/ncsbe-precinct-archive-index.xml",
      format: "official NCSBE S3 precinct archive index XML",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov?list-type=2&prefix=ShapeFiles%2FPrecinct%2F",
      authority: "North Carolina State Board of Elections",
      note: "Retains the official chronology and exact October 2020 object metadata.",
    },
  ],
  2024: [
    {
      path: "data/nc-2024-results-precinct.zip",
      format: "official NCSBE precinct results ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_11_05/results_pct_20241105.zip",
      authority: "North Carolina State Board of Elections",
      note: "Official presidential rows with Real Precinct classification; sole displayed vote source.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20240723.zip",
      format: "official NCSBE statewide precinct Shapefile ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ShapeFiles/Precinct/SBE_PRECINCTS_20240723.zip",
      authority: "North Carolina State Board of Elections",
      note: "Official pre-election statewide snapshot with 2,656 feature identities.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20190827.zip",
      format: "official NCSBE supplemental precinct Shapefile ZIP",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/PrecinctMaps/SBE_PRECINCTS_20190827.zip",
      authority: "North Carolina State Board of Elections",
      note: "Supplies three missing official result identities as a complete topology-preserving candidate; their November 5, 2024 applicability remains unconfirmed.",
    },
    {
      path: "data/precinct-geometry/NC/raw-shared/ncsbe/ncsbe-precinct-archive-index.xml",
      format: "official NCSBE S3 precinct archive index XML",
      sourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov?list-type=2&prefix=ShapeFiles%2FPrecinct%2F",
      authority: "North Carolina State Board of Elections",
      note: "Retains the official chronology and exact July 2024 object metadata.",
    },
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
  for (const [relativePath, [expectedBytes, expectedSha]] of Object.entries(NORTH_CAROLINA_RAW_SOURCE_PINS)) {
    let bytes;
    try {
      bytes = readFileSync(absolute(relativePath));
    } catch (error) {
      failures.push(`${relativePath}: ${error.message}`);
      continue;
    }
    const actualSha = sha256(bytes);
    if (bytes.length !== expectedBytes || actualSha !== expectedSha) {
      failures.push(`${relativePath}: expected ${expectedBytes}/${expectedSha}, received ${bytes.length}/${actualSha}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`North Carolina raw source pin validation failed before writes:\n${failures.join("\n")}`);
  }
}

function rawEvidenceArtifact(entry) {
  const bytes = readFileSync(absolute(entry.path));
  return {
    localArtifactPath: entry.path,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    format: entry.format,
    sourceUrl: entry.sourceUrl,
    authority: entry.authority,
    derivation: "Retained byte-for-byte from the cited source.",
    note: entry.note,
  };
}

function totals(rows) {
  return rows.reduce((sum, row) => ({
    democraticVotes: sum.democraticVotes + row.democratic,
    republicanVotes: sum.republicanVotes + row.republican,
    otherVotes: sum.otherVotes + row.other,
    totalVotes: sum.totalVotes + row.total,
  }), { democraticVotes: 0, republicanVotes: 0, otherVotes: 0, totalVotes: 0 });
}

function blockers(model) {
  const values = [];
  if (model.spec.year === 2024) {
    values.push("The November 5, 2024 applicability of Henderson CV and Wake 01-07A / 07-07A restored from the official August 2019 snapshot is not yet confirmed by an election-effective source or custodian statement.");
  }
  values.push("Immutable parent-scoped delivery and the guarded production release have not been completed.");
  return values;
}

function warnings(model) {
  const { spec } = model;
  const administrative = model.official.rows.length - model.mappedOfficialRows.length;
  const values = [
    `${administrative} official result-only or Real Precinct=N units remain no-geometry reconciliation rows and are never allocated to polygons.`,
    "Every eventual displayed vote comes only from the retained North Carolina State Board of Elections result export.",
    "Every election retains its own boundary vintage; these features are not treated as a stable cross-election comparison geography.",
  ];
  if (spec.year === 2012) {
    values.push("The NCSBE precinct-sorted export reassigns accepted absentee/provisional ballots to residential VTDs and adds statutory statistical noise; it is official VTD analysis data, not the certified canvass presentation.");
    values.push("MGGG/NCGA election fields are used only to prove the crosswalk and are excluded from geometry and displayed results.");
    values.push("ODbL 1.0 attribution and share-alike obligations must accompany eventual public delivery.");
  } else if (spec.year === 2020) {
    values.push("Four missing official result units are restored from the NCSBE August 2019 snapshot using the independently documented RDH/VEST source method and topology-preserving clipping; no result is split or allocated.");
  } else if (spec.year === 2024) {
    values.push("The complete candidate includes three restored official subprecinct polygons and one Durham no-data feature; no result value is invented for the no-data feature.");
    values.push("The 2024 package remains blocked despite an exact crosswalk because the restored boundaries lack election-date confirmation.");
  }
  return values;
}

function summarizeCrosswalkRows(rows) {
  const summary = {
    resultUnits: rows.length,
    colorableResultUnits: 0,
    matchedResultUnits: 0,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: {
      oneToOne: 0,
      oneToMany: 0,
      manyToOne: 0,
      unmatched: 0,
      nonGeographic: 0,
      sourceAlias: 0,
      pendingReview: 0,
    },
  };
  const keyByType = {
    one_to_one: "oneToOne",
    one_to_many: "oneToMany",
    many_to_one: "manyToOne",
    unmatched: "unmatched",
    non_geographic: "nonGeographic",
    source_alias: "sourceAlias",
  };
  for (const row of rows) {
    const relationship = row.relationships[0];
    if (row.isGeographic) summary.colorableResultUnits += 1;
    else if (relationship.relationshipType === "source_alias") summary.sourceAliasResultUnits += 1;
    else summary.nonGeographicResultUnits += 1;
    if (relationship.relationshipType === "unmatched") summary.unmatchedResultUnits += 1;
    else if (!["non_geographic", "source_alias"].includes(relationship.relationshipType)) summary.matchedResultUnits += 1;
    if (relationship.reviewStatus !== "reviewed") summary.relationships.pendingReview += 1;
    else summary.relationships[keyByType[relationship.relationshipType]] += 1;
  }
  return summary;
}

function sourceAuthority(spec) {
  return spec.year === 2012
    ? "North Carolina State Board of Elections results with MGGG/NC General Assembly VTD geometry"
    : "North Carolina State Board of Elections";
}

async function buildYear(year) {
  const model = await buildNorthCarolinaPrecinctReviewModel(year, { root: ROOT });
  const { spec } = model;
  const geometryPath = `${spec.base}/normalized/nc-${year}-reviewed-${spec.geographyLevel}-geometry.geojson.gz`;
  const resultsPath = `${spec.base}/normalized/nc-${year}-official-president-${spec.geographyLevel}-results.json.gz`;
  const crosswalkPath = `${spec.base}/crosswalk/nc-${year}-result-to-geometry-review.json`;
  const sourceEvidencePath = `${spec.base}/source-evidence.json`;
  const manifestPath = `${spec.base}/manifest.json`;
  const reportPath = `${spec.base}/reports/nc-${year}-${spec.geographyLevel}-geometry-review.json`;

  const geometryBytes = gzipJsonBytes(model.geometry);
  const mappedTotals = totals(model.mappedOfficialRows);
  const administrativeRows = model.official.rows.filter((row) => !model.mappedRowKeys.has(row.key));
  const administrativeTotals = totals(administrativeRows);
  const resultDocument = {
    schemaVersion: 1,
    state: "NC",
    electionId: spec.electionId,
    reportingGrain: spec.geographyLevel,
    sourceAuthority: "North Carolina State Board of Elections",
    sourceUnitCount: model.official.rows.length,
    geographicSourceUnitCount: model.mappedOfficialRows.length,
    colorableUnitCount: model.resultRows.length,
    excludedUnitCount: model.exclusions.length,
    candidates: model.official.candidates,
    officialTotals: model.official.officialTotals,
    geographicTotals: mappedTotals,
    administrativeTotals,
    mappedTotals,
    rows: model.resultRows,
    exclusions: model.exclusions,
  };
  const resultsBytes = gzipJsonBytes(resultDocument);
  const crosswalk = {
    schemaVersion: 1,
    manifestId: spec.manifestId,
    state: "NC",
    electionId: spec.electionId,
    geographyLevel: spec.geographyLevel,
    resultSourceId: spec.resultSourceId,
    generatedAt: NORTH_CAROLINA_REVIEWED_AT,
    rows: model.crosswalkRows,
    reconciliation: buildNorthCarolinaReconciliation(model),
  };
  const crosswalkBytes = jsonBytes(crosswalk);
  const sourceEvidence = {
    schemaVersion: 1,
    id: `nc-${year}-${spec.geographyLevel}-geometry-and-official-results-review`,
    state: "NC",
    election: { id: spec.electionId, date: spec.date, year, type: "general", office: "president" },
    authority: sourceAuthority(spec),
    retrievedAt: NORTH_CAROLINA_REVIEWED_AT,
    reviewedAt: NORTH_CAROLINA_REVIEWED_AT,
    sourceUrls: [spec.resultSourceUrl, spec.geometrySourceUrl],
    boundaryContext: {
      boundaryVintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      derivationMethod: spec.derivationMethod,
      sourceFeatureCount: model.rawFeatureCount,
      normalizedFeatureCount: model.geometry.features.length,
      reviewedNoDataFeatureCount: model.noDataFeatureIds.length,
      licenseOrTerms: spec.licenseOrTerms,
    },
    resultIdentity: {
      sourceUnitCount: model.official.rows.length,
      geographicSourceUnitCount: model.mappedOfficialRows.length,
      administrativeSourceUnitCount: administrativeRows.length,
      colorableSourceUnitCount: model.resultRows.length,
      excludedSourceUnitCount: model.exclusions.length,
      officialTotals: model.official.officialTotals,
      geographicTotals: mappedTotals,
      administrativeTotals,
      mappedTotals,
    },
    joinReview: {
      reviewedForPublicRowRendering: spec.rowLevelSafe,
      methods: [...new Set(model.mappingMethods.values())].sort(),
      mappedResultUnits: model.mappedOfficialRows.length,
      administrativeNoGeometryUnits: administrativeRows.length,
      unlinkedGeometryUnits: model.noDataFeatureIds.length,
      unlinkedGeometryFeatureIds: model.noDataFeatureIds,
      directIdMatches: model.matchSummary.directIdMatches,
      voteSignatureMatches: model.matchSummary.voteSignatureMatches,
      resultAllocationPerformed: false,
      secondaryVoteFieldsUsedForDisplay: false,
    },
    topologyReview: {
      supplementalRepairCount: model.repairDetails.length,
      repairs: model.repairDetails,
      overlapCreationPermitted: false,
      method: model.repairDetails.length > 0
        ? "Each old official feature is clipped to current county coverage; its exact overlap is subtracted from every containing current feature before the supplemental feature is inserted."
        : "No supplemental overlay was required.",
    },
    artifacts: [
      ...RAW_ARTIFACTS[year].map(rawEvidenceArtifact),
      rawEvidenceArtifact({
        path: "data/nc-counties.geojson",
        format: "official Census TIGERweb county GeoJSON",
        sourceUrl: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query",
        authority: "U.S. Census Bureau",
        note: "Used only to resolve the 100 county parent GEOIDs; never used as local election geometry.",
      }),
    ],
    caveats: warnings(model),
    blockers: blockers(model),
  };
  const sourceEvidenceBytes = jsonBytes(sourceEvidence);
  const expectedCrosswalkSummary = summarizeCrosswalkRows(model.crosswalkRows);
  const preliminaryManifest = {
    schemaVersion: 1,
    id: spec.manifestId,
    state: "NC",
    election: { id: spec.electionId, date: spec.date, year, type: "general", office: "president" },
    geography: {
      level: spec.geographyLevel,
      parentLevel: "county",
      boundaryVintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      derivationMethod: spec.derivationMethod,
    },
    source: {
      authority: sourceAuthority(spec),
      url: spec.geometrySourceUrl,
      retrievedAt: NORTH_CAROLINA_REVIEWED_AT,
      artifact: sourceEvidencePath,
      sha256: sha256(sourceEvidenceBytes),
      byteCount: sourceEvidenceBytes.length,
      format: "precinct-source-evidence+json",
      licenseOrTerms: spec.licenseOrTerms,
    },
    normalization: {
      script: "scripts/build-nc-reviewed-precincts.mjs",
      sourceCrs: spec.sourceCrs,
      servedCrs: "EPSG:4326",
      artifact: geometryPath,
      sha256: sha256(geometryBytes),
      byteCount: geometryBytes.length,
      featureCount: model.geometry.features.length,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: "reviewed",
      resultSourceId: spec.resultSourceId,
      artifact: crosswalkPath,
      sha256: sha256(crosswalkBytes),
      byteCount: crosswalkBytes.length,
      ...expectedCrosswalkSummary,
      reviewedRelationshipRecords: model.crosswalkRows.length,
      reviewedNoDataFeatures: model.noDataFeatureIds.length,
      methods: [...new Set(model.mappingMethods.values())].sort(),
    },
    validation: {
      status: "blocked",
      geometryValid: true,
      rowLevelRenderingSafe: spec.rowLevelSafe,
      parentTotalsReconciled: true,
      resultTotalsReconciled: true,
      errors: blockers(model),
      warnings: warnings(model),
    },
    delivery: null,
    caveats: [
      "No result value from MGGG, VEST, Census, or any geometry source is used as a displayed election result.",
      ...warnings(model),
      ...blockers(model),
    ],
  };
  const crosswalkInspection = inspectPrecinctCrosswalk(
    crosswalk,
    preliminaryManifest,
    model.knownFeatureIds,
    model.knownFeatureParents,
  );
  if (crosswalkInspection.errors.length > 0) {
    throw new Error(`${year} North Carolina crosswalk validation failed:\n${crosswalkInspection.errors.join("\n")}`);
  }
  const manifest = {
    ...preliminaryManifest,
    crosswalk: { ...preliminaryManifest.crosswalk, ...crosswalkInspection.summary },
  };
  const manifestInspection = inspectPrecinctGeometryManifest(manifest);
  if (manifestInspection.errors.length > 0) {
    throw new Error(`${year} North Carolina manifest validation failed:\n${manifestInspection.errors.join("\n")}`);
  }
  const manifestBytes = jsonBytes(manifest);
  const report = {
    schemaVersion: 1,
    state: "NC",
    electionId: spec.electionId,
    generatedAt: NORTH_CAROLINA_REVIEWED_AT,
    disposition: spec.rowLevelSafe
      ? "reviewed_row_level_rendering_delivery_pending"
      : "blocked_supplemental_boundary_vintage_confirmation_required",
    summary: summarizeNorthCarolinaModel(model),
    officialTotals: model.official.officialTotals,
    geographicTotals: mappedTotals,
    administrativeTotals,
    mappedTotals,
    crosswalk: crosswalkInspection.summary,
    noDataFeatureIds: model.noDataFeatureIds,
    topologyRepairs: model.repairDetails,
    blockers: blockers(model),
    artifacts: {
      geometry: {
        ...artifact(geometryBytes, geometryPath),
        uncompressedByteCount: gunzipSync(geometryBytes).length,
        uncompressedSha256: sha256(gunzipSync(geometryBytes)),
      },
      results: {
        ...artifact(resultsBytes, resultsPath),
        uncompressedByteCount: gunzipSync(resultsBytes).length,
        uncompressedSha256: sha256(gunzipSync(resultsBytes)),
      },
      crosswalk: artifact(crosswalkBytes, crosswalkPath),
      sourceEvidence: artifact(sourceEvidenceBytes, sourceEvidencePath),
      manifest: artifact(manifestBytes, manifestPath),
    },
  };
  return {
    year,
    manifest,
    paths: {
      [geometryPath]: geometryBytes,
      [resultsPath]: resultsBytes,
      [crosswalkPath]: crosswalkBytes,
      [sourceEvidencePath]: sourceEvidenceBytes,
      [manifestPath]: manifestBytes,
      [reportPath]: jsonBytes(report),
    },
    summary: summarizeNorthCarolinaModel(model),
  };
}

assertPinnedInputs();
const packages = [];
for (const year of YEARS) packages.push(await buildYear(year));
for (const releasePackage of packages) {
  for (const [relativePath, bytes] of Object.entries(releasePackage.paths)) {
    mkdirSync(path.dirname(absolute(relativePath)), { recursive: true });
    writeFileSync(absolute(relativePath), bytes);
  }
  const artifactInspection = validateManifestArtifacts(releasePackage.manifest, {
    root: ROOT,
    skipDelivery: true,
  });
  if (artifactInspection.errors.length > 0) {
    throw new Error(`${releasePackage.year} North Carolina artifact validation failed:\n${artifactInspection.errors.join("\n")}`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  state: "NC",
  reviewedAt: NORTH_CAROLINA_REVIEWED_AT,
  years: packages.map((releasePackage) => releasePackage.summary),
}, null, 2)}\n`);

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { inspectPrecinctCrosswalk } from "../src/lib/precinct-crosswalk.ts";
import { inspectPrecinctGeometryManifest } from "../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "./lib/precinct-geometry-validation.mjs";
import {
  buildSouthCarolinaPrecinctReviewModel,
  buildSouthCarolinaReconciliation,
  sha256,
  SOUTH_CAROLINA_PRECINCT_YEAR_SPECS,
  SOUTH_CAROLINA_RAW_SOURCE_PINS,
  SOUTH_CAROLINA_REVIEWED_AT,
  summarizeSouthCarolinaModel,
} from "./lib/sc-precinct-geometry.mjs";

const ROOT = process.cwd();
const YEARS = [2012, 2016, 2020, 2024];

const RAW_ARTIFACTS = Object.freeze({
  2012: [
    {
      path: "data/precinct-geometry/SC/2012-11-06-general/raw/sc-election-commission/president-9112.csv",
      format: "official South Carolina Election Commission CSV",
      sourceUrl: "https://sc.elstats.civera.com/api/download_contest/9112_table.csv?split_party=false",
      authority: "South Carolina Election Commission",
      note: "Official 2012 presidential result rows at state, county, and precinct/reporting-category grain.",
    },
    {
      path: "data/precinct-geometry/SC/2012-11-06-general/raw/rfa-archive/sc-2013-precincts.zip",
      format: "third-party archived ESRI Shapefile ZIP",
      sourceUrl: "https://github.com/aaron-strauss/precinct-shapefiles",
      authority: "Archive attributes the file to the South Carolina Office of Research and Statistics",
      note: "Statewide RFA-origin geometry created July 29, 2013; retained only as an unapproved 2012 candidate.",
    },
    {
      path: "data/precinct-geometry/SC/2012-11-06-general/raw/rfa-archive/README.md",
      format: "archive provenance README",
      sourceUrl: "https://github.com/aaron-strauss/precinct-shapefiles",
      authority: "Aaron Strauss precinct-shapefiles archive",
      note: "Retained archive description and source attribution; it does not provide election-date or license proof.",
    },
  ],
  2016: [
    {
      path: "data/precinct-geometry/SC/2016-11-08-general/raw/sc-election-commission/president-5292.csv",
      format: "official South Carolina Election Commission CSV",
      sourceUrl: "https://sc.elstats.civera.com/api/download_contest/5292_table.csv?split_party=false",
      authority: "South Carolina Election Commission",
      note: "Official 2016 presidential result rows; sole vote-value source.",
    },
    {
      path: "data/precinct-geometry/SC/2016-11-08-general/raw/vest/sc_2016.zip",
      format: "VEST election-specific ESRI Shapefile ZIP",
      sourceUrl: "https://dataverse.harvard.edu/file.xhtml?persistentId=doi:10.7910/DVN/NH5S2I/Y3OFQZ&version=78.0",
      authority: "Voting and Election Science Team; geometry attributed to South Carolina Revenue and Fiscal Affairs Office",
      note: "Geometry only. Every embedded VEST result field is discarded before normalized geometry is written.",
    },
    {
      path: "data/precinct-geometry/SC/2016-11-08-general/raw/vest/documentation.txt",
      format: "VEST documentation text",
      sourceUrl: "https://election.lab.ufl.edu/data-downloads/resultsdata/2016/precinct/documentation.txt",
      authority: "Voting and Election Science Team",
      note: "Documents RFA geometry provenance and VEST allocation of countywide vote categories; those allocated values are not used.",
    },
    {
      path: "data/precinct-geometry/SC/2016-11-08-general/raw/vest/dataverse-license-evidence.json",
      format: "version-pinned license review JSON",
      sourceUrl: "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/NH5S2I&version=78.0&selectTab=termsTab",
      authority: "Harvard Dataverse",
      note: "Binds the retained ZIP to version 78.0 and Creative Commons Attribution 4.0 terms.",
    },
  ],
  2020: [
    {
      path: "data/precinct-geometry/SC/2020-11-03-general/raw/sc-election-commission/president-1974.csv",
      format: "official South Carolina Election Commission CSV",
      sourceUrl: "https://sc.elstats.civera.com/api/download_contest/1974_table.csv?split_party=false",
      authority: "South Carolina Election Commission",
      note: "Official 2020 presidential result rows; sole vote-value source.",
    },
    {
      path: "data/precinct-geometry/SC/2020-11-03-general/raw/vest/sc_2020.zip",
      format: "VEST election-specific ESRI Shapefile ZIP",
      sourceUrl: "https://dataverse.harvard.edu/file.xhtml?fileId=4789402&version=27.0",
      authority: "Voting and Election Science Team; geometry attributed to South Carolina Revenue and Fiscal Affairs Office",
      note: "Geometry only. Every embedded VEST result field is discarded before normalized geometry is written.",
    },
    {
      path: "data/precinct-geometry/SC/2020-11-03-general/raw/vest/documentation.txt",
      format: "VEST documentation text",
      sourceUrl: "https://election.lab.ufl.edu/data-downloads/resultsdata/2020/precinct/documentation.txt",
      authority: "Voting and Election Science Team",
      note: "Documents RFA geometry provenance, local boundary adjustments, and VEST allocation; allocated values are not used.",
    },
    {
      path: "data/precinct-geometry/SC/2020-11-03-general/raw/vest/dataverse-license-evidence.json",
      format: "version-pinned license review JSON",
      sourceUrl: "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/K7760H&version=27.0&selectTab=termsTab",
      authority: "Harvard Dataverse",
      note: "Binds the retained ZIP to version 27.0 and Creative Commons Attribution 4.0 terms.",
    },
  ],
  2024: [
    {
      path: "data/precinct-geometry/SC/2024-11-05-general/raw/sc-election-commission/president-7131.csv",
      format: "official South Carolina Election Commission CSV",
      sourceUrl: "https://sc.elstats.civera.com/api/download_contest/7131_table.csv?split_party=false",
      authority: "South Carolina Election Commission",
      note: "Official 2024 presidential result rows; sole vote-value source.",
    },
    {
      path: "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/SC-precincts-with-results.geojson.gz",
      format: "NYT election-specific GeoJSON gzip",
      sourceUrl: "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/SC-precincts-with-results.geojson.gz",
      authority: "The New York Times",
      note: "All 2,308 retained South Carolina features are marked official_boundary=true. Embedded vote fields are used only to prove a unique join and are stripped from normalized geometry.",
    },
    {
      path: "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/SC-precincts-with-results.csv.gz",
      format: "NYT election-specific CSV gzip",
      sourceUrl: "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/SC-precincts-with-results.csv.gz",
      authority: "The New York Times",
      note: "Retained as a compact cross-check of the exact 2,308 geographic rows; it is never the displayed vote source.",
    },
    {
      path: "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/README.md",
      format: "NYT source README",
      sourceUrl: "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/README.md",
      authority: "The New York Times",
      note: "Defines official_boundary and identifies South Carolina coverage.",
    },
    {
      path: "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/LICENSE",
      format: "NYT Content API Use and Data Agreement",
      sourceUrl: "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/LICENSE",
      authority: "The New York Times",
      note: "Non-commercial attribution terms retained byte-for-byte.",
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
  return {
    localArtifactPath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function assertPinnedInputs() {
  const failures = [];
  for (const [relativePath, [expectedBytes, expectedSha]] of Object.entries(SOUTH_CAROLINA_RAW_SOURCE_PINS)) {
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
    throw new Error(`South Carolina raw source pin validation failed before writes:\n${failures.join("\n")}`);
  }
}

function rawEvidenceArtifact(entry) {
  const bytes = readFileSync(absolute(entry.path));
  const result = {
    localArtifactPath: entry.path,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    format: entry.format,
    sourceUrl: entry.sourceUrl,
    authority: entry.authority,
    derivation: "Retained byte-for-byte from the cited source.",
    note: entry.note,
  };
  if (entry.path.endsWith(".gz")) {
    const uncompressed = gunzipSync(bytes);
    result.compression = "gzip";
    result.uncompressedByteCount = uncompressed.length;
    result.uncompressedSha256 = sha256(uncompressed);
  }
  return result;
}

function authority(spec) {
  if (spec.year === 2012) {
    return "South Carolina Election Commission results; RFA-origin geometry retained through the Aaron Strauss precinct-shapefiles archive";
  }
  if (spec.year === 2024) {
    return "South Carolina Election Commission results with attributed New York Times election-specific official-boundary geometry";
  }
  return "South Carolina Election Commission results with VEST election-specific geometry attributed to the South Carolina Revenue and Fiscal Affairs Office";
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
  if (model.spec.year === 2012) {
    return [
      "The retained statewide geometry was created July 29, 2013 and does not prove the November 6, 2012 precinct configuration.",
      "No official or reviewed result-to-feature crosswalk links the 2,140 geographic result rows to the 2,155 archived features.",
      "The retained archive does not provide affirmative derivative-redistribution terms for the RFA-origin geometry.",
      "Immutable parent-scoped delivery and the guarded production release have not been completed.",
    ];
  }
  return ["Immutable parent-scoped delivery and the guarded production release have not been completed."];
}

function warnings(model) {
  const { spec } = model;
  const values = [
    `${spec.expected.administrativeUnits}${spec.year === 2016 ? " plus one zero-vote no-geometry" : ""} official no-geometry result units remain reconciliation-only and are never allocated to polygons.`,
    "Every displayed candidate value, when authorized, comes only from the retained South Carolina Election Commission CSV.",
  ];
  if (spec.year === 2016 || spec.year === 2020) {
    values.push("VEST vote fields include allocated countywide categories and are deliberately removed before normalized geometry is written.");
    values.push(`${spec.expected.noDataFeatures} reviewed geometry features have no official geographic result row and are retained as explicit no-data shapes.`);
  } else if (spec.year === 2024) {
    values.push("The 2,308 geographic rows reconcile exactly by county and unique complete presidential vote signature; the 6,263 administrative votes remain outside geometry.");
    values.push("NYT non-commercial attribution terms must accompany any eventual delivery.");
  } else {
    values.push("The archived 2013 geometry is retained only as a diagnostic candidate and no row-level rendering is approved.");
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

async function buildYear(year) {
  const model = await buildSouthCarolinaPrecinctReviewModel(year, { root: ROOT });
  const { spec } = model;
  const geometryPath = `${spec.base}/normalized/sc-${year}-reviewed-precinct-geometry.geojson.gz`;
  const resultsPath = `${spec.base}/normalized/sc-${year}-official-president-results.json.gz`;
  const crosswalkPath = `${spec.base}/crosswalk/sc-${year}-result-to-geometry-review.json`;
  const sourceEvidencePath = `${spec.base}/source-evidence.json`;
  const manifestPath = `${spec.base}/manifest.json`;
  const reportPath = `${spec.base}/reports/sc-${year}-precinct-geometry-review.json`;

  const geometryBytes = gzipJsonBytes(model.geometry);
  const mappedTotals = totals(model.mappedRows);
  const resultDocument = {
    schemaVersion: 1,
    state: "SC",
    electionId: spec.electionId,
    reportingGrain: "precinct",
    sourceAuthority: "South Carolina Election Commission",
    sourceUnitCount: model.official.rows.length,
    geographicSourceUnitCount: model.official.geographicRows.length,
    colorableUnitCount: model.resultRows.length,
    excludedUnitCount: model.exclusions.length,
    candidates: model.official.candidates,
    officialTotals: model.official.officialTotals,
    geographicTotals: model.official.geographicTotals,
    administrativeTotals: model.official.administrativeTotals,
    mappedTotals,
    rows: model.resultRows,
    exclusions: model.exclusions,
  };
  const resultsBytes = gzipJsonBytes(resultDocument);
  const crosswalk = {
    schemaVersion: 1,
    manifestId: spec.manifestId,
    state: "SC",
    electionId: spec.electionId,
    geographyLevel: "precinct",
    resultSourceId: spec.resultSourceId,
    generatedAt: SOUTH_CAROLINA_REVIEWED_AT,
    rows: model.crosswalkRows,
    reconciliation: buildSouthCarolinaReconciliation(model),
  };
  const crosswalkBytes = jsonBytes(crosswalk);
  const sourceEvidence = {
    schemaVersion: 1,
    id: `sc-${year}-precinct-geometry-and-official-results-review`,
    state: "SC",
    election: {
      id: spec.electionId,
      date: spec.date,
      year,
      type: "general",
      office: "president",
    },
    authority: authority(spec),
    retrievedAt: SOUTH_CAROLINA_REVIEWED_AT,
    reviewedAt: SOUTH_CAROLINA_REVIEWED_AT,
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
      geographicSourceUnitCount: model.official.geographicRows.length,
      administrativeSourceUnitCount: model.official.administrativeRows.length,
      colorableSourceUnitCount: model.resultRows.length,
      excludedSourceUnitCount: model.exclusions.length,
      officialTotals: model.official.officialTotals,
      geographicTotals: model.official.geographicTotals,
      administrativeTotals: model.official.administrativeTotals,
      mappedTotals,
    },
    joinReview: {
      reviewedForPublicRowRendering: spec.reviewed,
      method: model.mappingMethod,
      mappedResultUnits: model.mappedRows.length,
      zeroVoteNoGeometryUnits: year === 2016 ? 1 : 0,
      administrativeNoGeometryUnits: model.official.administrativeRows.length,
      unlinkedGeometryUnits: model.noDataFeatureIds.length,
      unlinkedGeometryFeatureIds: model.noDataFeatureIds,
      resultAllocationPerformed: false,
      secondaryVoteFieldsUsedForDisplay: false,
    },
    artifacts: [
      ...RAW_ARTIFACTS[year].map(rawEvidenceArtifact),
      rawEvidenceArtifact({
        path: "data/sc-counties.geojson",
        format: "official Census TIGERweb county GeoJSON",
        sourceUrl: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query",
        authority: "U.S. Census Bureau",
        note: "Used only to resolve the 46 county parent GEOIDs; never used as precinct geometry.",
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
    state: "SC",
    election: {
      id: spec.electionId,
      date: spec.date,
      year,
      type: "general",
      office: "president",
    },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      derivationMethod: spec.derivationMethod,
    },
    source: {
      authority: authority(spec),
      url: spec.geometrySourceUrl,
      retrievedAt: SOUTH_CAROLINA_REVIEWED_AT,
      artifact: sourceEvidencePath,
      sha256: sha256(sourceEvidenceBytes),
      byteCount: sourceEvidenceBytes.length,
      format: "precinct-source-evidence+json",
      licenseOrTerms: spec.licenseOrTerms,
    },
    normalization: {
      script: "scripts/build-sc-reviewed-precincts.mjs",
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
      status: spec.reviewed ? "reviewed" : "blocked",
      resultSourceId: spec.resultSourceId,
      artifact: crosswalkPath,
      sha256: sha256(crosswalkBytes),
      byteCount: crosswalkBytes.length,
      ...expectedCrosswalkSummary,
      ...(spec.reviewed ? {
        reviewedRelationshipRecords: model.crosswalkRows.length,
        reviewedNoDataFeatures: model.noDataFeatureIds.length,
      } : {}),
      methods: spec.reviewed ? ["reviewed_name"] : ["normalized_name_candidate", "exact_official_id"],
    },
    validation: {
      status: "blocked",
      geometryValid: true,
      rowLevelRenderingSafe: spec.reviewed,
      parentTotalsReconciled: spec.reviewed,
      resultTotalsReconciled: spec.reviewed,
      errors: blockers(model),
      warnings: warnings(model),
    },
    delivery: null,
    caveats: [
      "No result value from VEST, NYT, Census, or any geometry source is used as a displayed election result.",
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
    throw new Error(`${year} South Carolina crosswalk validation failed:\n${crosswalkInspection.errors.join("\n")}`);
  }
  const manifest = {
    ...preliminaryManifest,
    crosswalk: {
      ...preliminaryManifest.crosswalk,
      ...crosswalkInspection.summary,
    },
  };
  const manifestInspection = inspectPrecinctGeometryManifest(manifest);
  if (manifestInspection.errors.length > 0) {
    throw new Error(`${year} South Carolina manifest validation failed:\n${manifestInspection.errors.join("\n")}`);
  }
  const manifestBytes = jsonBytes(manifest);
  const report = {
    schemaVersion: 1,
    state: "SC",
    electionId: spec.electionId,
    generatedAt: SOUTH_CAROLINA_REVIEWED_AT,
    disposition: spec.reviewed
      ? "reviewed_row_level_rendering_delivery_pending"
      : "blocked_source_and_crosswalk_review_required",
    summary: summarizeSouthCarolinaModel(model),
    officialTotals: model.official.officialTotals,
    geographicTotals: model.official.geographicTotals,
    administrativeTotals: model.official.administrativeTotals,
    mappedTotals,
    crosswalk: crosswalkInspection.summary,
    noDataFeatureIds: model.noDataFeatureIds,
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
    summary: summarizeSouthCarolinaModel(model),
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
    throw new Error(`${releasePackage.year} South Carolina artifact validation failed:\n${artifactInspection.errors.join("\n")}`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  state: "SC",
  reviewedAt: SOUTH_CAROLINA_REVIEWED_AT,
  years: packages.map((releasePackage) => releasePackage.summary),
}, null, 2)}\n`);

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  buildFloridaCanonicalDocuments,
  FLORIDA_PRECINCT_YEAR_SPECS,
  FLORIDA_RAW_SOURCE_PINS,
  FLORIDA_REVIEWED_AT,
  sha256,
  verifyFloridaRawSources,
} from "./lib/fl-precinct-geometry.mjs";

const yearArgument = process.argv.find((value) => value.startsWith("--year="))?.slice(7);
const rootArgument = process.argv.find((value) => value.startsWith("--root="))?.slice(7);
const retrievedAt = process.argv.find((value) => value.startsWith("--retrieved-at="))?.slice(15);
const shouldDownload = process.argv.includes("--download");
const year = Number(yearArgument);
if (![2012, 2016, 2020, 2024].includes(year)) throw new Error("Use --year=2012, --year=2016, --year=2020, or --year=2024.");
if (retrievedAt !== FLORIDA_REVIEWED_AT) throw new Error("Use --retrieved-at=" + FLORIDA_REVIEWED_AT + " for deterministic replay.");

const root = path.resolve(rootArgument || process.cwd());
const spec = FLORIDA_PRECINCT_YEAR_SPECS[year];
const absolute = (relativePath) => path.join(root, ...relativePath.split("/"));
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");

const DOWNLOADS = Object.freeze({
  "data/precinct-geometry/FL/2012-11-06-general/raw/florida-dos/fl-2012-general-precinct-results.zip": "https://dos.fl.gov/media/697204/precinctlevelelectionresults2012gen.zip",
  "data/precinct-geometry/FL/2012-11-06-general/raw/us-census/tl_2012_12_vtd10.zip": "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_12_vtd10.zip",
  "data/precinct-geometry/FL/2016-11-08-general/raw/florida-dos/fl-2016-general-precinct-results.zip": "https://dos.fl.gov/media/697454/precinctlevelelectionresults2016gen.zip",
  "data/precinct-geometry/FL/2016-11-08-general/raw/vest/fl_2016.zip": "https://raw.githubusercontent.com/PlanScore/National-Input-Data/c99a1b0ad91f3a5d610f4730db242726343bd24f/VEST/fl_2016.zip",
  "data/precinct-geometry/FL/2016-11-08-general/raw/review/fl_vest_16_validation_report.pdf": "https://redistrictingdatahub.org/wp-content/uploads/2020/12/fl_vest_16_validation_report.pdf",
  "data/precinct-geometry/FL/2020-11-03-general/raw/florida-dos/fl-2020-general-precinct-results.zip": "https://fldoswebumbracoprod.blob.core.windows.net/media/703763/2020-general-election-rev.zip",
  "data/precinct-geometry/FL/2020-11-03-general/raw/vest/fl_2020.zip": "https://raw.githubusercontent.com/PlanScore/National-Input-Data/b8d27cbdc2e752fbadf8e3432d8eb3c96ba579b7/VEST/fl_2020.zip",
  "data/precinct-geometry/FL/2020-11-03-general/raw/review/fl_vest_20_validation_report.pdf": "https://redistrictingdatahub.org/wp-content/uploads/2021/08/fl_vest_20_validation_report.pdf",
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/FL-precincts-with-results.geojson.gz": "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/FL-precincts-with-results.geojson.gz",
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/FL-precincts-with-results.csv.gz": "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/FL-precincts-with-results.csv.gz",
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/README.md": "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/README.md",
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/LICENSE": "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/LICENSE",
});

function write(relativePath, bytes) {
  const target = absolute(relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { localArtifactPath: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function writeJson(relativePath, value) {
  return write(relativePath, jsonBytes(value));
}

function writeGzipJson(relativePath, value) {
  const source = Buffer.from(JSON.stringify(value) + "\n", "utf8");
  return write(relativePath, gzipSync(source, { level: 9, mtime: 0 }));
}

async function download(relativePath, url) {
  const response = await fetch(url, { headers: { "user-agent": "CivicResultMaps-source-collector/1.0" } });
  if (!response.ok) throw new Error("Florida source download failed with HTTP " + response.status + ": " + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pin = FLORIDA_RAW_SOURCE_PINS[relativePath];
  if (!pin || bytes.length !== pin[0] || sha256(bytes) !== pin[1]) {
    throw new Error("Florida downloaded source differs from the reviewed byte pin: " + relativePath);
  }
  write(relativePath, bytes);
}

async function acquire() {
  if (!shouldDownload) return;
  for (const [relativePath, url] of Object.entries(DOWNLOADS)) {
    if (year === 2012 && !relativePath.includes("/2012-11-06-general/")) continue;
    if (year === 2016 && !relativePath.includes("/2016-11-08-general/")) continue;
    if (year === 2020 && !relativePath.includes("/2020-11-03-general/")) continue;
    if (year === 2024 && !relativePath.includes("/2024-11-05-general/")) continue;
    await download(relativePath, url);
  }
}

function artifactRecord(relativePath, authority, sourceUrl, format, reportingGrain, note) {
  const bytes = readFileSync(absolute(relativePath));
  const artifact = {
    authority,
    sourceUrl,
    derivation: "Downloaded byte-for-byte from the stated HTTPS source or retained as a deterministic evidence record derived from that source; the local byte count and SHA-256 are pinned.",
    localArtifactPath: relativePath,
    format,
    reportingGrain,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    note,
  };
  if (relativePath.endsWith(".gz")) {
    const uncompressed = gunzipSync(bytes);
    artifact.uncompressedByteCount = uncompressed.length;
    artifact.uncompressedSha256 = sha256(uncompressed);
  }
  return artifact;
}

function sourceAuthority() {
  if (year === 2012) return "Florida Department of State results; U.S. Census Bureau VTD availability diagnostic";
  if (year === 2024) return "Florida Department of State results with attributed New York Times election-specific geometry";
  return "Florida Department of State results with attributed VEST election-specific geometry";
}

function licenseEvidence(targetYear) {
  if (targetYear === 2016) {
    return {
      schemaVersion: 1,
      state: "FL",
      electionYear: 2016,
      geometryArtifact: {
        filename: "fl_2016.zip",
        sha256: FLORIDA_RAW_SOURCE_PINS[spec.geometryPath][1],
        byteCount: FLORIDA_RAW_SOURCE_PINS[spec.geometryPath][0],
        md5: "117d2e07b5eb4a5b072fa5c8a54dbeb8",
        vestFileDoi: "10.7910/DVN/NH5S2I/IAELIN",
        reviewedDataverseVersion: "54.0",
      },
      custodyMirror: {
        repository: "https://github.com/PlanScore/National-Input-Data",
        path: "VEST/fl_2016.zip",
        commit: "c99a1b0ad91f3a5d610f4730db242726343bd24f",
        gitBlobSha1: "f93c511efb09b279b0b07abbddc9ce0e12e6d9bd",
        note: "The public PlanScore repository is byte custody only; VEST and the reviewed RDH report establish the dataset identity and methodology.",
      },
      rights: {
        license: "Creative Commons Attribution 4.0 International",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        evidenceUrl: "https://www.nature.com/articles/s41597-024-04024-2",
        note: "The VEST data descriptor states that the precinct-level election-result databases are released under CC BY 4.0. The article's own publication license is separate and is not asserted for the database bytes.",
      },
    };
  }
  if (targetYear === 2020) {
    return {
      schemaVersion: 1,
      state: "FL",
      electionYear: 2020,
      geometryArtifact: {
        filename: "fl_2020.zip",
        sha256: FLORIDA_RAW_SOURCE_PINS[spec.geometryPath][1],
        byteCount: FLORIDA_RAW_SOURCE_PINS[spec.geometryPath][0],
        md5: "d14975ec566ab3a6ebb6060c2256d593",
        dataverseFileId: 4938250,
        reviewedDataverseVersion: "24.0",
        datasetDoi: "10.7910/DVN/K7760H",
      },
      custodyMirror: {
        repository: "https://github.com/PlanScore/National-Input-Data",
        path: "VEST/fl_2020.zip",
        commit: "b8d27cbdc2e752fbadf8e3432d8eb3c96ba579b7",
        gitBlobSha1: "753b0f55296de3921f5b44bbd19ebe7e5396792c",
        note: "The public PlanScore repository is byte custody only; VEST and the reviewed RDH report establish the dataset identity and methodology.",
      },
      rights: {
        license: "Creative Commons Attribution 4.0 International",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        evidenceUrl: "https://www.nature.com/articles/s41597-024-04024-2",
        note: "The VEST data descriptor states that the precinct-level election-result databases are released under CC BY 4.0. The article's own publication license is separate and is not asserted for the database bytes.",
      },
    };
  }
  return null;
}

function pathsForYear() {
  return {
    results: spec.base + "/normalized/fl-" + year + "-president-results.json.gz",
    geometry: spec.base + "/normalized/fl-" + year + (year === 2012 ? "-no-approved-precinct-geometry.json" : "-reviewed-precinct-geometry.geojson.gz"),
    crosswalk: spec.base + "/crosswalk/fl-" + year + "-result-to-geometry-review.json",
    report: spec.base + "/reports/fl-" + year + "-precinct-geometry-report.json",
    evidence: spec.base + "/source-evidence.json",
    manifest: spec.base + "/manifest.json",
    license: spec.base + "/raw/vest/dataverse-license-evidence.json",
  };
}

function sourceArtifacts(paths, licenseArtifact) {
  const commonResults = artifactRecord(
    spec.resultPath,
    "Florida Department of State, Division of Elections",
    spec.resultSourceUrl,
    "official statewide county-submitted precinct-result ZIP",
    "county-scoped precinct candidate rows",
    "Sole authority for every displayed vote value; OverVotes and UnderVotes are not candidate votes.",
  );
  if (year === 2012) {
    return [
      commonResults,
      artifactRecord(spec.geometryPath, "U.S. Census Bureau", spec.geometrySourceUrl, "TIGER/Line 2012 ZIP containing 2010 Census VTD polygons", "statistical VTD diagnostic", "Contains 9,435 statistical VTD features and is not asserted to represent Florida's November 6, 2012 election precinct configuration."),
    ];
  }
  if (year === 2016 || year === 2020) {
    const validationPath = spec.base + "/raw/review/fl_vest_" + String(year).slice(2) + "_validation_report.pdf";
    const reportUrl = year === 2016
      ? "https://redistrictingdatahub.org/wp-content/uploads/2020/12/fl_vest_16_validation_report.pdf"
      : "https://redistrictingdatahub.org/wp-content/uploads/2021/08/fl_vest_20_validation_report.pdf";
    return [
      commonResults,
      artifactRecord(spec.geometryPath, "Voting and Election Science Team (VEST), public PlanScore custody mirror", spec.geometrySourceUrl, "version-pinned statewide VEST Shapefile ZIP", "election-specific precinct geometry", "Election-value attributes are used only for reviewed identity diagnostics and are stripped from normalized geometry; displayed votes remain Florida DOS values."),
      artifactRecord(validationPath, "Redistricting Data Hub", reportUrl, "VEST Florida validation report PDF", "statewide methodology and reconciliation evidence", year === 2020 ? "The report documents VEST's distribution of nongeographic votes; CivicResultMaps never consumes those VEST values and instead preserves official Florida exclusions." : "The report documents source joins, county corrections, and unassigned administrative/UOCAVA returns."),
      licenseArtifact,
    ];
  }
  return [
    commonResults,
    artifactRecord(spec.geometryPath, "New York Times", spec.geometrySourceUrl, "election-specific GeoJSON gzip", "statewide 2024 precinct geometry", "Contains 4,319 official-boundary and 1,264 generated-boundary features. All NYT vote fields are stripped and never displayed."),
    artifactRecord(spec.base + "/raw/nyt/FL-precincts-with-results.csv.gz", "New York Times", "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/FL-precincts-with-results.csv.gz", "companion CSV gzip", "geometry identity and diagnostic vote signatures", "Used only as retained companion evidence; not a displayed result source."),
    artifactRecord(spec.base + "/raw/nyt/README.md", "New York Times", "https://github.com/nytimes/presidential-precinct-map-2024", "source README", "methodology and state coverage", "Retains the source project's official/generated boundary disclosure."),
    artifactRecord(spec.base + "/raw/nyt/LICENSE", "New York Times", "https://github.com/nytimes/presidential-precinct-map-2024/blob/main/LICENSE", "NYT Content API Use and Data Agreement", "reuse terms", "Non-commercial attribution and downstream-use obligations accompany any delivery."),
  ];
}

function manifestDocument(documents, artifacts, paths) {
  const geometryArtifact = artifacts.geometry;
  const resultsArtifact = artifacts.results;
  const crosswalkArtifact = artifacts.crosswalk;
  const evidenceArtifact = artifacts.evidence;
  const rowLevelSafe = spec.rowLevelSafe;
  const excludedVotes = documents.results.excludedTotals.total;
  const boundaryVintage = year === 2012
    ? "2010 Census VTD statistical geography retained only as a diagnostic; November 6, 2012 election precinct geometry remains unavailable"
    : year === 2024
      ? "NYT 2024 election-specific Florida precinct package: 4,319 official and 1,264 generated boundary features"
      : "VEST " + year + " election-specific Florida precinct reconstruction independently reviewed by Redistricting Data Hub";
  const licenseOrTerms = year === 2012
    ? "Official Florida public election records and U.S. Census public-domain statistical geography; no 2012 geometry is delivered."
    : year === 2024
      ? "NYT geometry is retained under C-UDA non-commercial attribution terms; Florida DOS remains the sole displayed vote authority."
      : "VEST database geometry is retained under CC BY 4.0 with version and custody evidence; Florida DOS remains the sole displayed vote authority.";
  const sourceWarnings = [
    "Every displayed vote value comes only from the retained Florida Department of State precinct result export.",
    documents.results.excludedUnitCount + " official source units totaling " + excludedVotes.toLocaleString("en-US") + " candidate votes lack reviewed geometry and are never allocated to polygons.",
  ];
  if (year === 2016) sourceWarnings.push("Twenty-one Palm Beach source identities contain exact duplicate candidate rows under two polling locations; exact duplicate rows are counted once as documented by the retained validation report.");
  if (year === 2020) sourceWarnings.push("VEST distributed nongeographic source votes in its own fields; every such field is stripped and none is used by CivicResultMaps.");
  if (year === 2024) sourceWarnings.push("1,264 NYT features use generated boundaries and remain explicitly disclosed; no NYT result value is displayed.");

  return {
    schemaVersion: 1,
    id: spec.manifestId,
    state: "FL",
    election: { id: spec.electionId, date: spec.date, year, type: "general", office: "president" },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage,
      vintageStatus: rowLevelSafe ? "election_date_confirmed" : "unknown",
      derivationMethod: rowLevelSafe ? "secondary_reconstruction" : "availability_diagnostic",
    },
    source: {
      authority: sourceAuthority(),
      url: spec.geometrySourceUrl,
      retrievedAt: FLORIDA_REVIEWED_AT,
      artifact: paths.evidence,
      sha256: evidenceArtifact.sha256,
      byteCount: evidenceArtifact.byteCount,
      format: "precinct-source-evidence+json",
      licenseOrTerms,
    },
    normalization: {
      script: "scripts/collect-fl-precinct-geometry.mjs",
      sourceCrs: year === 2024 ? "EPSG:4326 GeoJSON" : "source-defined Shapefile CRS normalized to EPSG:4326 by shpjs",
      servedCrs: "EPSG:4326",
      artifact: paths.geometry,
      sha256: geometryArtifact.sha256,
      byteCount: geometryArtifact.byteCount,
      featureCount: documents.geometryModel.features.length,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: rowLevelSafe ? "reviewed" : "blocked",
      resultSourceId: spec.resultSourceId,
      artifact: paths.crosswalk,
      sha256: crosswalkArtifact.sha256,
      byteCount: crosswalkArtifact.byteCount,
      resultUnits: rowLevelSafe ? documents.results.rows.length : documents.official.sourceUnitCount,
      colorableResultUnits: rowLevelSafe ? documents.results.rows.length : documents.official.sourceUnitCount,
      matchedResultUnits: documents.results.rows.length,
      unmatchedResultUnits: rowLevelSafe ? 0 : documents.official.sourceUnitCount,
      nonGeographicResultUnits: 0,
      sourceAliasResultUnits: 0,
      relationships: {
        oneToOne: documents.results.rows.length,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: 0,
        nonGeographic: 0,
        sourceAlias: 0,
        pendingReview: rowLevelSafe ? 0 : documents.official.sourceUnitCount,
      },
      reviewedRelationshipRecords: documents.results.rows.length,
      reviewedNoDataFeatures: documents.geometryModel.noDataFeatureIds.length,
      methods: [...new Set(documents.geometryModel.mappedRows.map((entry) => entry.method))].sort(),
    },
    validation: {
      status: "blocked",
      geometryValid: rowLevelSafe,
      rowLevelRenderingSafe: rowLevelSafe,
      parentTotalsReconciled: rowLevelSafe,
      resultTotalsReconciled: true,
      errors: rowLevelSafe
        ? ["Immutable parent-scoped delivery and the guarded production release have not been completed."]
        : ["Complete election-effective November 6, 2012 Florida precinct geometry and a reviewed result crosswalk are unavailable."],
      warnings: sourceWarnings,
    },
    delivery: null,
    caveats: [
      "No vote is estimated, spatially allocated, or copied from a geometry source.",
      ...sourceWarnings,
      ...(rowLevelSafe ? ["Immutable delivery and guarded production activation remain separate decisions."] : ["The 2010 Census VTD diagnostic is not public precinct delivery."]),
    ],
  };
}

await acquire();

if ((year === 2016 || year === 2020) && !existsSync(absolute(pathsForYear().license))) {
  writeJson(pathsForYear().license, licenseEvidence(year));
}
verifyFloridaRawSources(root, year);

const paths = pathsForYear();
let licenseArtifact = null;
if (year === 2016 || year === 2020) {
  const licenseBytes = readFileSync(absolute(paths.license));
  const expectedLicenseBytes = jsonBytes(licenseEvidence(year));
  if (!licenseBytes.equals(expectedLicenseBytes)) throw new Error("Florida " + year + " VEST version/license evidence drifted");
  licenseArtifact = {
    authority: "Voting and Election Science Team publication and version-pinned custody evidence",
    sourceUrl: "https://www.nature.com/articles/s41597-024-04024-2",
    derivation: "Deterministically generated from the version-pinned VEST checksum, Dataverse/file DOI evidence, PlanScore custody commit/blob, and the VEST data descriptor's database-license statement.",
    localArtifactPath: paths.license,
    format: "version and license evidence JSON",
    reportingGrain: "source provenance and reuse terms",
    byteCount: licenseBytes.length,
    sha256: sha256(licenseBytes),
    note: "Pins the reviewed VEST file version, checksum, public custody mirror commit/blob, and CC BY 4.0 database terms evidence.",
  };
}

const documents = await buildFloridaCanonicalDocuments(root, spec);
const resultArtifact = writeGzipJson(paths.results, documents.results);
const geometryArtifact = year === 2012 ? writeJson(paths.geometry, documents.geometry) : writeGzipJson(paths.geometry, documents.geometry);
const crosswalkArtifact = writeJson(paths.crosswalk, documents.crosswalk);
const rawArtifacts = sourceArtifacts(paths, licenseArtifact);
const evidence = {
  schemaVersion: 1,
  id: "fl-" + year + "-precinct-geometry-source-evidence-v1",
  state: "FL",
  election: { id: spec.electionId, date: spec.date, year, type: "general", office: "president" },
  retrievedAt: FLORIDA_REVIEWED_AT,
  authority: sourceAuthority(),
  artifacts: rawArtifacts,
  resultUniverse: {
    sourceUnits: documents.official.sourceUnitCount,
    colorableUnits: documents.results.colorableUnitCount,
    excludedUnits: documents.results.excludedUnitCount,
    zeroVoteSourceUnits: documents.official.zeroVoteUnitCount,
    totals: documents.results.totals,
    mappedTotals: documents.results.mappedTotals,
    excludedTotals: documents.results.excludedTotals,
    duplicateCandidateRowsDiscarded: documents.official.duplicateCandidateRows,
  },
  geometryReview: {
    rawFeatures: documents.geometryModel.rawFeatureCount,
    normalizedFeatures: documents.geometryModel.features.length,
    reviewedRelationships: documents.geometryModel.mappedRows.length,
    reviewedNoDataFeatures: documents.geometryModel.noDataFeatureIds.length,
    methods: documents.geometryModel.methods,
    officialBoundaryFeatures: documents.geometryModel.officialBoundaryFeatures ?? null,
    generatedBoundaryFeatures: documents.geometryModel.generatedBoundaryFeatures ?? null,
  },
  policies: [
    "Florida Department of State values are the sole displayed election results.",
    "Geometry-source vote fields are stripped and never copied to normalized geometry or public result rows.",
    "Only reviewed whole-source-component sums are allowed; no vote is estimated or distributed.",
    year === 2012 ? "2010 Census VTDs remain an unjoined diagnostic and are never labeled as 2012 election precincts." : "Unmatched official result units remain exclusions and are never forced onto polygons.",
  ],
};
const evidenceArtifact = writeJson(paths.evidence, evidence);
const report = {
  schemaVersion: 1,
  state: "FL",
  electionId: spec.electionId,
  status: spec.rowLevelSafe ? "reviewed_candidate" : "blocked",
  resultArtifact,
  geometryArtifact,
  crosswalkArtifact,
  evidenceArtifact,
  resultUniverse: evidence.resultUniverse,
  geometryReview: evidence.geometryReview,
  sourceTotalsReconciled: documents.crosswalk.reconciliation.sourceTotalsReconciled,
  publicDeliveryAuthorized: false,
};
const reportArtifact = writeJson(paths.report, report);
const manifest = manifestDocument(documents, { results: resultArtifact, geometry: geometryArtifact, crosswalk: crosswalkArtifact, evidence: evidenceArtifact }, paths);
const manifestArtifact = writeJson(paths.manifest, manifest);

console.log(JSON.stringify({
  status: "passed",
  year,
  manifestArtifact,
  reportArtifact,
  resultUniverse: evidence.resultUniverse,
  geometryReview: evidence.geometryReview,
}, null, 2));

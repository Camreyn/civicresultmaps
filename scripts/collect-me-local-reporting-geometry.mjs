import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import shp from "shpjs";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";
import {
  buildMaine2012LocalGeometry,
  buildMaine2024LocalGeometry,
  buildMaineVestLocalGeometry,
} from "./lib/me-local-geometry.mjs";
import {
  extractPythonStringDictionary,
  MAINE_ELECTIONS,
  parseMainePresidentialWorkbook,
} from "./lib/me-local-reporting-units.mjs";

const STATE = "ME";
const REPORTING_GRAIN = "local_reporting_unit";
const RESULTS = Object.freeze({
  2012: {
    path: "data/me-official-sources/me-2012-president-municipal.xls",
    url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/content/assets/2012presmuni.xls",
  },
  2016: {
    path: "data/me-official-sources/me-2016-president.xlsx",
    url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/content/assets/president.xlsx",
  },
  2020: {
    path: "data/me-official-sources/me-2020-president-county-town.xlsx",
    url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/content/assets/presandvisecnty1120.xlsx",
  },
  2024: {
    path: "data/me-official-sources/me-2024-president-county-town-final-corrected-20241205.xlsx",
    url: "https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/President%20and%20Vice%20President%20FINAL-Corrected%2020241205.xlsx",
  },
});

function argument(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const year = Number(argument("year"));
const retrievedAt = argument("retrieved-at");
if (!MAINE_ELECTIONS[year]) throw new Error("--year must be 2012, 2016, 2020, or 2024");
if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) {
  throw new Error("--retrieved-at must be an ISO timestamp");
}
if (Date.parse(retrievedAt) > Date.now()) throw new Error("--retrieved-at must not be in the future");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n");
}

function write(relativePath, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  const absolute = path.resolve(relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return { localArtifactPath: relativePath.replaceAll("\\", "/"), sha256: sha256(bytes), byteCount: bytes.length };
}

function retained(relativePath, url, authority, format, note) {
  const bytes = readFileSync(relativePath);
  const artifact = {
    localArtifactPath: relativePath,
    url,
    authority,
    format,
    sha256: sha256(bytes),
    byteCount: bytes.length,
    note,
  };
  if (relativePath.endsWith(".gz")) {
    const uncompressed = gunzipSync(bytes);
    artifact.uncompressedSha256 = sha256(uncompressed);
    artifact.uncompressedByteCount = uncompressed.length;
  }
  return artifact;
}

function resultUnit(unit, electionId) {
  return reportingUnitCode({
    state: STATE,
    electionId,
    reportingGrain: REPORTING_GRAIN,
    parentGeoid: `23${unit.countyFips}`,
    sourceUnitId: unit.id,
  });
}

function resultRow(unit, electionId) {
  return {
    resultUnitCode: resultUnit(unit, electionId),
    sourceUnitId: unit.id,
    sourceDisplayName: unit.label,
    parentGeoid: `23${unit.countyFips}`,
    democratic: unit.demVotes,
    republican: unit.repVotes,
    other: unit.otherVotes,
    total: unit.totalVotes,
    ballotsCast: unit.ballotsCast,
    ...(unit.memberUnitIds ? { constituentSourceUnitIds: unit.memberUnitIds } : {}),
  };
}

function crosswalkRow(unit, electionId, method, note) {
  return {
    resultUnitCode: resultUnit(unit, electionId),
    sourceUnitId: unit.id,
    sourceDisplayName: unit.label,
    parentGeoid: `23${unit.countyFips}`,
    reportingGrain: REPORTING_GRAIN,
    isGeographic: true,
    relationships: [{
      sourceFeatureId: `23${unit.countyFips}|${unit.id}`,
      relationshipType: "one_to_one",
      matchMethod: method,
      reviewStatus: "reviewed",
      confidence: "high",
      note,
    }],
  };
}

function summarizeCrosswalk(rows) {
  const oneToOne = rows.filter(
    (row) => row.relationships[0]?.relationshipType === "one_to_one",
  ).length;
  return {
    resultUnits: rows.length,
    colorableResultUnits: rows.length,
    matchedResultUnits: rows.length,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: {
      oneToOne,
      oneToMany: 0,
      manyToOne: 0,
      unmatched: 0,
      nonGeographic: 0,
      sourceAlias: 0,
      pendingReview: 0,
    },
  };
}

function totals(rows) {
  return rows.reduce((sum, row) => ({
    democratic: sum.democratic + row.demVotes,
    republican: sum.republican + row.repVotes,
    other: sum.other + row.otherVotes,
    total: sum.total + row.totalVotes,
  }), { democratic: 0, republican: 0, other: 0, total: 0 });
}

function reconciliation(sourceUnits, mappedUnits) {
  const scope = (scopeType, scopeId, sourceRows, mappedRows) => {
    const resultTotals = totals(sourceRows);
    const mappedTotals = totals(mappedRows);
    return {
      scopeType,
      scopeId,
      resultTotals,
      mappedTotals,
      deltas: Object.fromEntries(Object.keys(resultTotals).map((key) => [key, mappedTotals[key] - resultTotals[key]])),
    };
  };
  const scopes = [scope("state", STATE, sourceUnits, mappedUnits)];
  for (const countyFips of [...new Set(sourceUnits.map((unit) => unit.countyFips))].sort()) {
    scopes.push(scope(
      "parent",
      `23${countyFips}`,
      sourceUnits.filter((unit) => unit.countyFips === countyFips),
      mappedUnits.filter((unit) => unit.countyFips === countyFips),
    ));
  }
  const passed = scopes.every((entry) => Object.values(entry.deltas).every((delta) => delta === 0));
  return { status: passed ? "passed" : "failed", scopes };
}

function sourcePaths(targetYear, electionId) {
  const raw = `data/precinct-geometry/ME/${electionId}/raw`;
  if (targetYear === 2012) return {
    geometry: `${raw}/mggg/Maine.zip`,
    supporting: [
      `${raw}/mggg/README.md`,
      `${raw}/maine-geolibrary/metwp24s-2015-archive.zip`,
      `${raw}/maine-geolibrary/reuse-statute.html`,
    ],
  };
  if (targetYear === 2016 || targetYear === 2020) return {
    geometry: `${raw}/vest/me_${targetYear}.zip`,
    supporting: [
      `${raw}/vest/me_vest_${targetYear}.ipynb`,
      `${raw}/vest/dataverse-license-evidence.json`,
    ],
  };
  return {
    geometry: `${raw}/nytimes/ME-precincts-with-results.geojson.gz`,
    supporting: [
      `${raw}/nytimes/LICENSE`,
      `${raw}/nytimes/README.md`,
      `${raw}/maine-geolibrary/t22-md-current.geojson`,
      `${raw}/maine-geolibrary/item-metadata.json`,
      `${raw}/maine-geolibrary/layer-metadata.json`,
      "data/precinct-geometry/ME/2012-11-06-general/raw/maine-geolibrary/metwp24s-2015-archive.zip",
      "data/precinct-geometry/ME/2012-11-06-general/raw/maine-geolibrary/reuse-statute.html",
    ],
  };
}

async function build(units, electionId) {
  const sources = sourcePaths(year, electionId);
  if (year === 2012) {
    const parsed = await shp(readFileSync(sources.geometry));
    const source = Array.isArray(parsed) ? parsed[0] : parsed;
    const built = buildMaine2012LocalGeometry(units, source);
    return {
      features: built.mappedUnits.map((entry) => entry.feature),
      mappedUnits: built.mappedUnits.map((entry) => entry.unit),
      excludedUnits: built.excludedUnits,
      rows: built.mappedUnits.map((entry) => crosswalkRow(
        entry.unit,
        electionId,
        "reviewed_name",
        "The retained MGGG secondary reconstruction supplies a reviewed local-boundary identity only. The exact Maine SOS row or exact sum of named constituent rows supplies every displayed vote, and public delivery remains blocked pending derivative reuse permission or an official replacement.",
      )),
      sourceFeatureCount: source.features.length,
      assignedSourceFeatures: built.assignedSourceFeatures,
      unassignedSourceFeatures: built.unassignedSourceFeatures,
    };
  }
  if (year === 2016 || year === 2020) {
    const parsed = await shp(readFileSync(sources.geometry));
    const source = Array.isArray(parsed) ? parsed[0] : parsed;
    const notebook = JSON.parse(readFileSync(sources.supporting[0], "utf8"));
    const built = buildMaineVestLocalGeometry(
      year,
      units,
      source,
      extractPythonStringDictionary(notebook, "source_vest_names_dict"),
    );
    return {
      features: built.features,
      mappedUnits: units.map((unit) => ({ ...unit, memberUnitIds: [unit.id] })),
      excludedUnits: [],
      rows: units.map((unit) => crosswalkRow(
        unit,
        electionId,
        "official_crosswalk",
        "The retained VEST validation crosswalk identifies the geometry; any ward components are dissolved to the exact Maine SOS local reporting unit. All displayed votes come from the Maine SOS workbook.",
      )),
      sourceFeatureCount: source.features.length,
      assignedSourceFeatures: built.assignedSourceFeatures,
      unassignedSourceFeatures: built.unassignedSourceFeatures,
    };
  }
  const nyt = JSON.parse(gunzipSync(readFileSync(sources.geometry)));
  const gap = JSON.parse(readFileSync(sources.supporting[2], "utf8"));
  const historicalParsed = await shp(readFileSync(sources.supporting[5]));
  const historical = Array.isArray(historicalParsed) ? historicalParsed[0] : historicalParsed;
  const built = buildMaine2024LocalGeometry(units, nyt, gap, historical);
  return {
    features: built.mappedUnits.map((entry) => entry.feature),
    mappedUnits: built.mappedUnits.map((entry) => entry.unit),
    excludedUnits: [],
    rows: built.mappedUnits.map((entry) => crosswalkRow(
      entry.unit,
      electionId,
      entry.method.includes("exact_official_vote_signature") ? "exact_official_id" : "official_crosswalk",
      "The source geometry is marked as an official boundary. Its displayed result is the exact retained Maine SOS local row or exact sum of named constituent rows; NYT/AP vote values are never displayed.",
    )),
    sourceFeatureCount: nyt.features.length + gap.features.length,
    assignedSourceFeatures: built.assignedNytFeatures + gap.features.length,
    unassignedSourceFeatures: built.unassignedNytFeatures,
    gapBoundaryComparison: built.gapBoundaryComparison,
  };
}

const election = MAINE_ELECTIONS[year];
const resultBytes = readFileSync(RESULTS[year].path);
const parsedResults = parseMainePresidentialWorkbook(year, resultBytes);
const built = await build(parsedResults.localUnits, election.id);
const normalized = { type: "FeatureCollection", features: built.features };
const normalizedPlain = Buffer.from(JSON.stringify(normalized));
const normalizedBytes = gzipSync(normalizedPlain, { level: 9 });
const resultRows = built.mappedUnits.map((unit) => resultRow(unit, election.id));
const resultsDocument = {
  schemaVersion: 1,
  state: STATE,
  electionId: election.id,
  reportingGrain: REPORTING_GRAIN,
  sourceUnitCount: parsedResults.localUnits.length,
  colorableUnitCount: resultRows.length,
  excludedUnitCount: built.excludedUnits.length,
  rows: resultRows,
  exclusions: built.excludedUnits.map((unit) => ({
    sourceUnitId: unit.id,
    sourceDisplayName: unit.label,
    parentGeoid: `23${unit.countyFips}`,
    reason: unit.exclusionReason,
    democratic: unit.demVotes,
    republican: unit.repVotes,
    other: unit.otherVotes,
    total: unit.totalVotes,
  })),
};
const resultsPlain = jsonBytes(resultsDocument);
const resultsBytes = gzipSync(resultsPlain, { level: 9 });
const manifestId = `me-${election.id}-local-reporting-geometry-candidate-v1`;
const renderingReconciliation = reconciliation(parsedResults.localUnits, built.mappedUnits);
const crosswalk = {
  schemaVersion: 1,
  manifestId,
  state: STATE,
  electionId: election.id,
  geographyLevel: REPORTING_GRAIN,
  resultSourceId: `me-${year}-president-local-results`,
  generatedAt: retrievedAt,
  rows: built.rows,
  exclusions: resultsDocument.exclusions,
  reconciliation: reconciliation(
    parsedResults.localUnits,
    built.mappedUnits.concat(built.excludedUnits),
  ),
  renderingReconciliation,
};
const crosswalkSummary = summarizeCrosswalk(built.rows);
const base = `data/precinct-geometry/ME/${election.id}`;
const normalizedArtifact = write(`${base}/normalized/me-${year}-local-reporting-units.geojson.gz`, normalizedBytes);
const resultsArtifact = write(`${base}/normalized/me-${year}-president-local-results.json.gz`, resultsBytes);
const crosswalkArtifact = write(`${base}/crosswalk/me-${year}-local-result-crosswalk.json`, crosswalk);
const sources = sourcePaths(year, election.id);
const evidenceArtifacts = [
  retained(RESULTS[year].path, RESULTS[year].url, "Maine Secretary of State", year === 2012 ? "XLS" : "XLSX", "Certified presidential results by published local reporting unit. This is the sole source of displayed vote values."),
  retained(sources.geometry, year === 2012
    ? "https://raw.githubusercontent.com/mggg-states/ME-shapefiles/master/Maine.zip"
    : year === 2016
      ? "https://dataverse.harvard.edu/file.xhtml?persistentId=doi%3A10.7910%2FDVN%2FNH5S2I%2FCHOCIN&version=62.0"
      : year === 2020
        ? "https://dataverse.harvard.edu/file.xhtml?fileId=4863161&version=16.0"
        : "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/ME-precincts-with-results.geojson.gz",
    year === 2012 ? "Metric Geometry and Gerrymandering Group" : year < 2024 ? "Voting and Election Science Team" : "New York Times",
    year === 2024 ? "GeoJSON gzip" : "ESRI Shapefile ZIP",
    year === 2012
      ? "Secondary 2012 election reconstruction derived from Maine GeoLibrary and other public boundary sources. Embedded election values are removed; exact official boundary vintage and derivative redistribution permission remain unresolved."
      : "Secondary geometry only. Embedded election-result fields are removed and never used for displayed values."),
  ...sources.supporting.map((supportingPath) => retained(
    supportingPath,
    supportingPath.includes("/mggg/README.md")
      ? "https://raw.githubusercontent.com/mggg-states/ME-shapefiles/master/README.md"
      : supportingPath.includes("ipynb")
      ? `https://raw.githubusercontent.com/nonpartisan-redistricting-datahub/pdv-me/main/vest-me-${year}/me_vest_${year}.ipynb`
      : supportingPath.includes("dataverse-license")
        ? year === 2016
          ? "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/NH5S2I&version=62.0&selectTab=termsTab"
          : "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/K7760H&version=16.0&selectTab=termsTab"
        : supportingPath.includes("metwp24s")
          ? "https://web.archive.org/web/20160709000000id_/http://www.maine.gov/megis/catalog/shps/state/metwp24s.zip"
          : supportingPath.includes("reuse-statute")
            ? "https://legislature.maine.gov/statutes/5/title5sec2005.html"
            : supportingPath.includes("t22-md")
              ? "https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Town_and_Townships_Boundary_Polygons/FeatureServer/0/query"
            : supportingPath.includes("item-metadata")
              ? "https://www.arcgis.com/sharing/rest/content/items/289a91e826fd4f518debdd824d5dd16d?f=json"
              : supportingPath.includes("layer-metadata")
                ? "https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Town_and_Townships_Boundary_Polygons/FeatureServer/0?f=pjson"
                : supportingPath.endsWith("LICENSE")
                  ? "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/LICENSE"
                  : "https://raw.githubusercontent.com/nytimes/presidential-precinct-map-2024/main/README.md",
    supportingPath.includes("/mggg/") ? "Metric Geometry and Gerrymandering Group" : supportingPath.includes("maine-geolibrary") ? "Maine GeoLibrary / Maine Legislature" : supportingPath.includes("nytimes") ? "New York Times" : "Redistricting Data Hub / Harvard Dataverse",
    path.extname(supportingPath).slice(1).toUpperCase() || "binary",
    "Retained source lineage, validation, or license evidence.",
  )),
];
const caveats = [
  "Maine publishes statewide presidential results at town, plantation, township, voting-district, and combined-local-unit grain—not a uniform statewide ward/precinct grain. This layer is labeled local reporting unit.",
  "No town total is duplicated across ward polygons and no official vote is proportionally allocated. Where a retained source splits a municipality into wards, the ward polygons are dissolved before the one local total is attached.",
  "All displayed vote values come from the retained Maine Secretary of State workbook; secondary-source vote attributes are stripped and never imported.",
  ...(year === 2012 ? [
    "The 2012 layer maps 507 reviewed secondary local shapes covering 540 of 545 official local source rows. Five tiny reporting rows totaling eight presidential votes have no uniquely attributable source polygon and remain excluded rather than guessed.",
    "The retained MGGG reconstruction is supplemental geometry only. Its exact official election-date boundary edition and derivative redistribution permission have not been established, so 2012 cannot enter public delivery even if the five exclusions are later resolved.",
  ] : []),
  ...(year === 2024 ? [
    "The NYT source marks every retained Maine shape official_boundary=true but combines 34 small official source rows into 16 boundary units; those rows are summed exactly and their identities are retained. T22 MD uses a Maine GeoLibrary gap geometry whose area and bounds are unchanged between the retained 2015 archive and current official service.",
    "NYT C-UDA terms limit redistribution to non-commercial use with attribution. CivicResultMaps must preserve the terms and attribution with any public delivery.",
  ] : []),
];
const evidence = {
  schemaVersion: 1,
  id: `me-${year}-local-reporting-geometry-source-evidence`,
  state: STATE,
  election: { id: election.id, date: election.date, year, type: "general", office: "president" },
  authority: year === 2012
    ? "Maine Secretary of State results with reviewed MGGG secondary local geometry"
    : "Maine Secretary of State results with reviewed official-source-derived local geometry",
  retrievedAt,
  sourceCrs: "source-defined and normalized by shpjs or retained EPSG:4326 GeoJSON",
  servedCrs: "EPSG:4326",
  artifacts: evidenceArtifacts,
  resultIdentity: {
    sourceId: crosswalk.resultSourceId,
    sourceResultUnits: parsedResults.localUnits.length,
    colorableResultUnits: built.mappedUnits.length,
    excludedResultUnits: built.excludedUnits.length,
    normalizedResultArtifact: resultsArtifact,
    sourceTotals: parsedResults.totals,
    mappedTotals: totals(built.mappedUnits),
  },
  geometryContext: {
    sourceFeatureCount: built.sourceFeatureCount,
    assignedSourceFeatures: built.assignedSourceFeatures,
    unassignedSourceFeatures: built.unassignedSourceFeatures,
    outputFeatureCount: built.features.length,
    ...(built.gapBoundaryComparison ? { gapBoundaryComparison: built.gapBoundaryComparison } : {}),
  },
  caveats,
};
const evidenceArtifact = write(`${base}/source-evidence.json`, evidence);
const report = {
  schemaVersion: 1,
  state: STATE,
  electionId: election.id,
  generatedAt: retrievedAt,
  disposition: year === 2012
    ? "reviewed_partial_local_reporting_delivery_candidate"
    : "source_and_crosswalk_gates_passed_delivery_pending",
  source: {
    sourceResultUnits: parsedResults.localUnits.length,
    colorableResultUnits: built.mappedUnits.length,
    excludedResultUnits: built.excludedUnits.length,
    sourceFeatureCount: built.sourceFeatureCount,
    assignedSourceFeatures: built.assignedSourceFeatures,
    unassignedSourceFeatures: built.unassignedSourceFeatures,
  },
  crosswalk: crosswalkSummary,
  reconciliation: renderingReconciliation,
  sourceAccountingReconciliation: crosswalk.reconciliation,
  artifacts: {
    normalizedGeometry: normalizedArtifact,
    normalizedGeometryUncompressed: { sha256: sha256(normalizedPlain), byteCount: normalizedPlain.length },
    normalizedResults: resultsArtifact,
    normalizedResultsUncompressed: { sha256: sha256(resultsPlain), byteCount: resultsPlain.length },
    crosswalk: crosswalkArtifact,
  },
  exclusions: resultsDocument.exclusions,
  caveats,
};
const reportArtifact = write(`${base}/reports/me-${year}-local-reporting-geometry-report.json`, report);
const blockingErrors = ["An immutable parent-scoped public delivery package and production release review have not been completed."];
if (year === 2012) blockingErrors.push(
  "Five separately published local reporting rows lack uniquely attributable election geometry and remain excluded from row-level rendering.",
  "The MGGG secondary boundary derivative has no retained explicit redistribution permission and no confirmed exact November 2012 official boundary edition; use an official replacement or obtain permission before public delivery.",
);
const manifest = {
  schemaVersion: 1,
  id: manifestId,
  state: STATE,
  election: evidence.election,
  geography: {
    level: REPORTING_GRAIN,
    parentLevel: "county",
    boundaryVintage: year === 2012
      ? "MGGG 2012 election reconstruction derived from Maine GeoLibrary and other public boundaries; exact official November 2012 edition unconfirmed"
      : year === 2016 || year === 2020
        ? `${year} election-specific VEST local boundary reconstruction`
        : "2024 NYT official-boundary township geometry with one Maine GeoLibrary gap verified unchanged across 2015 and current snapshots",
    vintageStatus: year === 2012 ? "unknown" : "election_date_confirmed",
    derivationMethod: year === 2012 ? "secondary_reconstruction" : "hybrid_reconstruction",
  },
  source: {
    authority: evidence.authority,
    url: RESULTS[year].url,
    retrievedAt,
    artifact: evidenceArtifact.localArtifactPath,
    sha256: evidenceArtifact.sha256,
    byteCount: evidenceArtifact.byteCount,
    format: "precinct-source-evidence+json",
    licenseOrTerms: year === 2012
      ? "Official Maine results. The MGGG derivative is retained from a public repository, but no explicit derivative redistribution license was located; public delivery remains blocked pending permission or an official replacement. Maine's GeoLibrary reuse statute is retained for the original state source."
      : year === 2016 || year === 2020
        ? "Official Maine results; VEST geometry under retained CC BY 4.0 terms and attribution."
        : "Official Maine results; NYT official-boundary geometry under NYT C-UDA non-commercial attribution terms, plus Maine GeoLibrary public gap geometry verified unchanged across historical and current snapshots.",
  },
  normalization: {
    script: "scripts/collect-me-local-reporting-geometry.mjs",
    sourceCrs: evidence.sourceCrs,
    servedCrs: "EPSG:4326",
    artifact: normalizedArtifact.localArtifactPath,
    sha256: normalizedArtifact.sha256,
    byteCount: normalizedArtifact.byteCount,
    featureCount: built.features.length,
    sourceFeatureIdFields: ["CRM_FEATURE_ID"],
    parentIdFields: ["CRM_PARENT_GEOID"],
  },
  crosswalk: {
    status: "reviewed",
    resultSourceId: crosswalk.resultSourceId,
    artifact: crosswalkArtifact.localArtifactPath,
    sha256: crosswalkArtifact.sha256,
    byteCount: crosswalkArtifact.byteCount,
    ...crosswalkSummary,
    reviewedRelationshipRecords: built.rows.length,
    reviewedNoDataFeatures: 0,
    methods: [...new Set(built.rows.flatMap((row) => row.relationships.map((relationship) => relationship.matchMethod)))].sort(),
  },
  validation: {
    status: "blocked",
    geometryValid: true,
    rowLevelRenderingSafe: year !== 2012,
    parentTotalsReconciled: renderingReconciliation.status === "passed",
    errors: blockingErrors,
    warnings: caveats,
  },
  delivery: null,
  caveats,
};
const manifestArtifact = write(`${base}/manifest.json`, manifest);
console.log(JSON.stringify({
  year,
  manifest: manifestArtifact,
  report: reportArtifact,
  sourceResultUnits: parsedResults.localUnits.length,
  geometryFeatures: built.features.length,
  excludedResultUnits: built.excludedUnits.length,
  sourcePresidentialVotes: parsedResults.totals.totalVotes,
  mappedPresidentialVotes: totals(built.mappedUnits).total,
  delivery: null,
}, null, 2));

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";
import shp from "shpjs";
import XLSX from "xlsx";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";

const ROOT = process.cwd();
const STATE = "MN";
const ELECTION_ID = "2024-11-05-general";
const MANIFEST_ID = "mn-2024-11-05-lcc-vtd2024general-v1";
const BASE = `data/precinct-geometry/${STATE}/${ELECTION_ID}`;
const RAW_ZIP = `${BASE}/raw/lcc-gis/vtd2024general.zip`;
const SOURCE_PACKAGE = `${BASE}/source-package-manifest.json`;
const NORMALIZED = `${BASE}/normalized/mn-2024-11-05-precincts.geojson.gz`;
const CROSSWALK = `${BASE}/crosswalk/mn-2024-11-05-vtdid-to-geometry.json`;
const REPORT = `${BASE}/reports/mn-2024-11-05-precinct-geometry-report.json`;
const MANIFEST = `${BASE}/manifest.json`;
const RESULTS = "data/mn-2024-general-federal-state-results-by-precinct-official.xlsx";
const INDEX_URL = "https://gis.lcc.mn.gov/html/download.html";
const SOURCE_URL = "https://gis.lcc.mn.gov/data/shape/vtd2024general.zip";
const RESULTS_URL = "https://www.sos.mn.gov/media/yt3llxwd/2024-general-federal-state-results-by-precinct-official.xlsx";
const AUTHORITY = "Minnesota Legislative Coordinating Commission Geographic Information Services; Office of the Minnesota Secretary of State Elections Division";
const LCC_DISCLAIMER = "LCC-GIS makes no representation or warranties, express or implied, with respect to the reuse of data provided herewith, regardless of its format or the means of its transmission. There is no guarantee or representation to the user as to the accuracy, currency, suitability, or reliability of this data for any purpose. The user accepts the data 'as is', and assumes all risks associated with its use. By accepting this data, the user agrees not to transmit this data or provide access to it or any part of it to another party unless the user shall include with the data a copy of this disclaimer.";
const EXPECTED_FEATURES = 4103;

const args = process.argv.slice(2);
const retrievedAt = args
  .find((argument) => argument.startsWith("--retrieved-at="))
  ?.slice("--retrieved-at=".length);
const offline = args.includes("--offline");
if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) {
  throw new Error("Use --retrieved-at=<ISO timestamp>.");
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function jsonBuffer(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeBuffer(relativePath, buffer) {
  const target = absolute(relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  return { byteCount: buffer.length, sha256: sha256(buffer) };
}

function writeJson(relativePath, value) {
  return writeBuffer(relativePath, jsonBuffer(value));
}

function immutableWrite(relativePath, buffer) {
  const target = absolute(relativePath);
  if (existsSync(target)) {
    const existing = readFileSync(target);
    if (!existing.equals(buffer)) {
      throw new Error(`Refusing to overwrite changed immutable artifact ${relativePath}`);
    }
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buffer);
}

function number(row, field) {
  const value = Number(row[field] ?? 0);
  if (!Number.isFinite(value)) {
    throw new Error(`Result row ${row.VTDID} has nonnumeric ${field}`);
  }
  return value;
}

function resultTotals(rows) {
  return rows.reduce((totals, row) => {
    const totalVotes = number(row, "USPRSTOTAL");
    const trump = number(row, "USPRSR");
    const harris = number(row, "USPRSDFL");
    const comparisonDemVotes = number(row, "USSENDFL");
    const comparisonRepVotes = number(row, "USSENR");
    const comparisonTotalVotes = number(row, "USSENTOTAL");
    totals.totalVotes += totalVotes;
    totals.trump += trump;
    totals.harris += harris;
    totals.other += totalVotes - trump - harris;
    totals.comparisonDemVotes += comparisonDemVotes;
    totals.comparisonRepVotes += comparisonRepVotes;
    totals.comparisonOtherVotes += comparisonTotalVotes
      - comparisonDemVotes
      - comparisonRepVotes;
    return totals;
  }, {
    totalVotes: 0,
    trump: 0,
    harris: 0,
    other: 0,
    comparisonDemVotes: 0,
    comparisonRepVotes: 0,
    comparisonOtherVotes: 0,
  });
}

function zeroDeltas(totals) {
  return Object.fromEntries(Object.keys(totals).map((key) => [key, 0]));
}

async function obtainSourceArchive() {
  if (offline) {
    if (!existsSync(absolute(RAW_ZIP))) {
      throw new Error(`Offline mode requires ${RAW_ZIP}`);
    }
    if (!existsSync(absolute(SOURCE_PACKAGE))) {
      throw new Error(`Offline mode requires prior ${SOURCE_PACKAGE} HTTP metadata`);
    }
    const previous = JSON.parse(readFileSync(absolute(SOURCE_PACKAGE), "utf8"));
    const previousPackage = previous.packages?.[0];
    const buffer = readFileSync(absolute(RAW_ZIP));
    if (!previousPackage?.httpMetadata) {
      throw new Error(`Offline mode requires prior ${SOURCE_PACKAGE} HTTP metadata`);
    }
    if (
      previousPackage.byteCount !== buffer.length
      || previousPackage.sha256 !== sha256(buffer)
    ) {
      throw new Error(
        `Offline source archive ${RAW_ZIP} no longer matches prior package provenance`,
      );
    }
    return {
      buffer,
      httpMetadata: previousPackage.httpMetadata,
    };
  }

  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "CivicResultMaps precinct geometry collector" },
  });
  if (!response.ok) {
    throw new Error(`Official Minnesota geometry download failed: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isInteger(contentLength) && contentLength !== buffer.length) {
    throw new Error(`Downloaded byte count ${buffer.length} != Content-Length ${contentLength}`);
  }
  immutableWrite(RAW_ZIP, buffer);
  return {
    buffer,
    httpMetadata: {
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: Number.isInteger(contentLength) ? contentLength : null,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    },
  };
}

if (!existsSync(absolute(RESULTS))) {
  throw new Error(`Missing official Minnesota result workbook ${RESULTS}`);
}

const { buffer: sourceBuffer, httpMetadata } = await obtainSourceArchive();
if (!httpMetadata?.lastModified) {
  throw new Error("Official source response did not preserve Last-Modified evidence");
}

const sourceZip = await JSZip.loadAsync(sourceBuffer);
const members = Object.keys(sourceZip.files)
  .filter((member) => !sourceZip.files[member].dir)
  .sort();
const selectedLayer = "vtd2024general";
for (const extension of [".shp", ".shx", ".dbf", ".prj"]) {
  if (!members.includes(selectedLayer + extension)) {
    throw new Error(`Official archive is missing ${selectedLayer + extension}`);
  }
}
const sourceCrs = (
  await sourceZip.file(selectedLayer + ".prj").async("string")
).trim();
const dbf = await sourceZip.file(selectedLayer + ".dbf").async("nodebuffer");
const dbfHeaderLength = dbf.readUInt16LE(8);
const nativeFieldNames = [];
for (let offset = 32; offset < dbfHeaderLength - 1; offset += 32) {
  const field = dbf
    .subarray(offset, offset + 11)
    .toString("ascii")
    .replace(/\0.*/, "")
    .trim();
  if (field) nativeFieldNames.push(field);
}

const source = await shp(sourceBuffer);
if (Array.isArray(source) || source?.type !== "FeatureCollection") {
  throw new Error("Expected one Minnesota voting-district FeatureCollection");
}
if (source.features.length !== EXPECTED_FEATURES) {
  throw new Error(`Expected ${EXPECTED_FEATURES} geometry features, found ${source.features.length}`);
}

const geometryKinds = {};
const featureByVtdid = new Map();
for (const [index, feature] of source.features.entries()) {
  const properties = feature.properties ?? {};
  const vtdid = String(properties.VTDID ?? "").trim();
  const countyFips = String(properties.COUNTYFIPS ?? "").trim().padStart(3, "0");
  const precinctCode = String(properties.PCTCODE ?? "").trim().padStart(4, "0");
  if (!/^27\d{7}$/.test(vtdid)) {
    throw new Error(`Geometry feature ${index} lacks a valid VTDID`);
  }
  if (vtdid !== `27${countyFips}${precinctCode}`) {
    throw new Error(`Geometry VTDID components disagree for ${vtdid}`);
  }
  if (featureByVtdid.has(vtdid)) {
    throw new Error(`Duplicate geometry VTDID ${vtdid}`);
  }
  if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
    throw new Error(`Geometry ${vtdid} has unsupported type ${feature.geometry?.type}`);
  }
  geometryKinds[feature.geometry.type] = (geometryKinds[feature.geometry.type] ?? 0) + 1;
  featureByVtdid.set(vtdid, feature);
}

const resultsBuffer = readFileSync(absolute(RESULTS));
const workbook = XLSX.read(resultsBuffer, { type: "buffer" });
const sheet = workbook.Sheets["Precinct-Results"];
if (!sheet) throw new Error("Minnesota workbook lacks Precinct-Results sheet");
const resultRows = XLSX.utils.sheet_to_json(sheet, {
  defval: null,
  raw: false,
}).filter((row) => /^27\d{7}$/.test(String(row.VTDID ?? "")));
if (resultRows.length !== EXPECTED_FEATURES) {
  throw new Error(`Expected ${EXPECTED_FEATURES} official result VTDIDs, found ${resultRows.length}`);
}
const resultByVtdid = new Map();
for (const row of resultRows) {
  const vtdid = String(row.VTDID);
  if (resultByVtdid.has(vtdid)) throw new Error(`Duplicate result VTDID ${vtdid}`);
  resultByVtdid.set(vtdid, row);
}

const missingResultIds = [...featureByVtdid.keys()].filter((id) => !resultByVtdid.has(id));
const missingGeometryIds = [...resultByVtdid.keys()].filter((id) => !featureByVtdid.has(id));
if (missingResultIds.length || missingGeometryIds.length) {
  throw new Error(
    `Official VTDID sets differ: ${missingResultIds.length} geometry-only, `
      + `${missingGeometryIds.length} result-only`,
  );
}

const identityFields = ["PCTNAME", "PCTCODE", "MCDNAME", "COUNTYNAME", "COUNTYCODE"];
const districtFields = [
  "CONGDIST",
  "MNSENDIST",
  "MNLEGDIST",
  "CTYCOMDIST",
  "JUDDIST",
  "SWCDIST",
  "WARD",
  "HOSPDIST",
  "PARKDIST",
];
const fieldMismatches = Object.fromEntries(
  identityFields.concat(districtFields).map((field) => [field, []]),
);
for (const row of resultRows) {
  const properties = featureByVtdid.get(String(row.VTDID)).properties;
  for (const field of identityFields.concat(districtFields)) {
    const resultValue = String(row[field] ?? "").replace(/^no data$/i, "");
    const geometryValue = String(properties[field] ?? "");
    if (resultValue !== geometryValue) {
      fieldMismatches[field].push({
        vtdid: String(row.VTDID),
        resultValue,
        geometryValue,
      });
    }
  }
}
for (const field of identityFields) {
  if (fieldMismatches[field].length) {
    throw new Error(`Official identity field ${field} differs for ${fieldMismatches[field].length} VTDIDs`);
  }
}

const sortedVtdids = [...featureByVtdid.keys()].sort();
const normalizedFeatures = sortedVtdids.map((vtdid) => {
  const feature = featureByVtdid.get(vtdid);
  const properties = feature.properties;
  const parentGeoid = `27${String(properties.COUNTYFIPS).padStart(3, "0")}`;
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: vtdid,
      CRM_PARENT_GEOID: parentGeoid,
      CRM_NATIVE_ID: vtdid,
      CRM_PRECINCT_CODE: String(properties.PCTCODE).padStart(4, "0"),
      CRM_DISPLAY_NAME: String(properties.PCTNAME),
      CRM_SOURCE_PROPERTIES: properties,
    },
    geometry: feature.geometry,
  };
});

const coveredParents = [...new Map(normalizedFeatures.map((feature) => {
  const properties = feature.properties.CRM_SOURCE_PROPERTIES;
  return [
    feature.properties.CRM_PARENT_GEOID,
    {
      name: `${String(properties.COUNTYNAME)} County`,
      geoid: feature.properties.CRM_PARENT_GEOID,
    },
  ];
})).values()].sort((left, right) => left.geoid.localeCompare(right.geoid));
if (coveredParents.length !== 87) {
  throw new Error(`Expected 87 county parents, found ${coveredParents.length}`);
}

const crosswalkRows = sortedVtdids.map((vtdid) => {
  const row = resultByVtdid.get(vtdid);
  const feature = featureByVtdid.get(vtdid);
  const parentGeoid = `27${String(feature.properties.COUNTYFIPS).padStart(3, "0")}`;
  return {
    resultUnitCode: reportingUnitCode({
      state: STATE,
      electionId: ELECTION_ID,
      reportingGrain: "precinct",
      parentGeoid,
      sourceUnitId: vtdid,
    }),
    sourceUnitId: vtdid,
    sourceDisplayName: `${row.MCDNAME} - ${row.PCTNAME} (${row.PCTCODE})`,
    parentGeoid,
    reportingGrain: "precinct",
    isGeographic: true,
    relationships: [{
      sourceFeatureId: `${parentGeoid}|${vtdid}`,
      relationshipType: "one_to_one",
      matchMethod: "exact_official_id",
      reviewStatus: "reviewed",
      confidence: "high",
      note: "Exact VTDID, PCTCODE, precinct name, municipality, county name, and county code agree between the official election-specific LCC-GIS boundary archive and certified SOS result workbook.",
    }],
  };
});

const rowsByParent = new Map();
for (const row of resultRows) {
  const parentGeoid = String(row.VTDID).slice(0, 5);
  const rows = rowsByParent.get(parentGeoid) ?? [];
  rows.push(row);
  rowsByParent.set(parentGeoid, rows);
}
const reconciliationScopes = [...rowsByParent.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([scopeId, rows]) => {
    const totals = resultTotals(rows);
    return {
      scopeType: "parent",
      scopeId,
      resultTotals: totals,
      mappedTotals: { ...totals },
      deltas: zeroDeltas(totals),
    };
  });
const statewideTotals = resultTotals(resultRows);
reconciliationScopes.push({
  scopeType: "state",
  scopeId: STATE,
  resultTotals: statewideTotals,
  mappedTotals: { ...statewideTotals },
  deltas: zeroDeltas(statewideTotals),
});

const sourcePackage = {
  schemaVersion: 1,
  id: "mn-lcc-gis-vtd2024general-package",
  state: STATE,
  election: { id: ELECTION_ID, date: "2024-11-05", type: "general" },
  geographyLevel: "precinct",
  authority: AUTHORITY,
  licenseOrTerms: LCC_DISCLAIMER,
  indexes: [{
    id: "mn-lcc-gis-download-center",
    kind: "statewide",
    url: INDEX_URL,
    retrievedAt,
    retrievalMethod: "http",
    boundaryBasis: `The official LCC-GIS catalog labels the archive Voting Districts (Precincts & Wards), 2024; the filename is vtd2024general.zip and the server Last-Modified value is ${httpMetadata.lastModified}.`,
    effectiveDate: "2024-11-05",
    caveats: [
      "The catalog's generic metadata hyperlink currently resolves to an older voting-district metadata page. Election applicability is supported instead by the official 2024-general archive identity, election-day server timestamp, and complete exact VTDID agreement with the certified 2024 SOS workbook.",
    ],
  }],
  packages: [{
    id: "mn-statewide-vtd2024general",
    indexId: "mn-lcc-gis-download-center",
    label: "Minnesota 2024 General Voting Districts",
    url: SOURCE_URL,
    artifact: RAW_ZIP,
    sha256: sha256(sourceBuffer),
    byteCount: sourceBuffer.length,
    parent: null,
    coveredParents,
    parentAssignmentStatus: "confirmed",
    packageRole: "primary",
    archive: {
      format: "shapefile_zip",
      members,
      selectedLayer,
      sourceCrs,
      sourceFeatureCount: normalizedFeatures.length,
      nativeFieldNames,
    },
    httpMetadata,
  }],
  coverage: {
    expectedParentCount: coveredParents.length,
    parentsWithPackages: coveredParents.length,
    missingParents: [],
  },
  summary: {
    packageCount: 1,
    byteCount: sourceBuffer.length,
    sourceFeatureCount: normalizedFeatures.length,
  },
  caveats: [
    "All 87 county parents and all 4,103 certified-workbook VTDIDs are present in the single official statewide archive.",
    "One zero-vote VTD (271490086) has a County Commissioner District attribute difference between the boundary archive and result workbook; its precinct identity fields and VTDID agree, so no votes or geometry are reassigned.",
  ],
};
const sourcePackageOutput = writeJson(SOURCE_PACKAGE, sourcePackage);

const normalizedBuffer = gzipSync(
  Buffer.from(JSON.stringify({ type: "FeatureCollection", features: normalizedFeatures }) + "\n"),
  { level: 9, mtime: 0 },
);
const normalizedOutput = writeBuffer(NORMALIZED, normalizedBuffer);

const crosswalk = {
  schemaVersion: 1,
  manifestId: MANIFEST_ID,
  state: STATE,
  electionId: ELECTION_ID,
  geographyLevel: "precinct",
  resultSourceId: "mn-2024-precinct-results",
  resultSource: {
    authority: "Minnesota Secretary of State",
    url: RESULTS_URL,
    artifact: RESULTS,
    sha256: sha256(resultsBuffer),
    byteCount: resultsBuffer.length,
    sheetName: "Precinct-Results",
  },
  generatedAt: retrievedAt,
  rows: crosswalkRows,
  reconciliation: { status: "passed", scopes: reconciliationScopes },
};
const crosswalkOutput = writeJson(CROSSWALK, crosswalk);

const publicBlocker = "The independently reviewed local Minnesota importer retains 87 county aggregates and emits 4,103 precinct ResultRows keyed to the reviewed VTDIDs; zero-vote outcomes and source-disclaimer delivery are covered by regression tests. Public geometry delivery remains null until an explicitly authorized production promotion and geometry release are coordinated, because deploying geometry before those result rows exist would render uncolored precincts.";
const manifest = {
  schemaVersion: 1,
  id: MANIFEST_ID,
  state: STATE,
  election: {
    id: ELECTION_ID,
    date: "2024-11-05",
    year: 2024,
    type: "general",
    office: "president",
  },
  geography: {
    level: "precinct",
    parentLevel: "county",
    boundaryVintage: "LCC-GIS vtd2024general archive, server-modified November 5, 2024",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "official_export",
    nativeCrs: sourceCrs,
    servedCrs: "EPSG:4326",
  },
  source: {
    authority: AUTHORITY,
    url: INDEX_URL,
    retrievedAt,
    artifact: SOURCE_PACKAGE,
    sha256: sourcePackageOutput.sha256,
    byteCount: sourcePackageOutput.byteCount,
    format: "precinct-source-package-manifest+json",
    licenseOrTerms: sourcePackage.licenseOrTerms,
  },
  normalization: {
    script: "scripts/collect-mn-2024-precinct-geometry.mjs",
    sourceCrs,
    servedCrs: "EPSG:4326",
    artifact: NORMALIZED,
    sha256: normalizedOutput.sha256,
    featureCount: normalizedFeatures.length,
    sourceFeatureIdFields: ["CRM_FEATURE_ID"],
    parentIdFields: ["CRM_PARENT_GEOID"],
  },
  crosswalk: {
    status: "reviewed",
    resultSourceId: "mn-2024-precinct-results",
    artifact: CROSSWALK,
    sha256: crosswalkOutput.sha256,
    resultUnits: resultRows.length,
    colorableResultUnits: resultRows.length,
    matchedResultUnits: resultRows.length,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: {
      oneToOne: resultRows.length,
      oneToMany: 0,
      manyToOne: 0,
      unmatched: 0,
      nonGeographic: 0,
      sourceAlias: 0,
      pendingReview: 0,
    },
    methods: ["exact_official_id"],
  },
  validation: {
    status: "blocked",
    geometryValid: true,
    rowLevelRenderingSafe: false,
    parentTotalsReconciled: true,
    errors: [publicBlocker],
    warnings: [
      "All 4,103 official VTDID relationships are reviewed one-to-one and reconcile across all 87 counties and statewide; the remaining blocker is independent importer review and public-data activation, not geometry or vote reconciliation.",
      "The 28 official zero-presidential-vote precincts remain geographic reporting units and are retained in the crosswalk.",
    ],
  },
  delivery: null,
  caveats: [
    publicBlocker,
    "One zero-vote VTD has a County Commissioner District attribute difference; exact precinct identity fields still agree and no result assignment depends on that district attribute.",
    "The LCC-GIS source disclaimer and attribution requirements must accompany any future public delivery.",
  ],
};
const manifestOutput = writeJson(MANIFEST, manifest);

const mismatchCounts = Object.fromEntries(
  Object.entries(fieldMismatches).map(([field, rows]) => [field, rows.length]),
);
const report = {
  schemaVersion: 1,
  state: STATE,
  electionId: ELECTION_ID,
  generatedAt: retrievedAt,
  disposition: "blocked_public_result_activation",
  source: {
    authority: AUTHORITY,
    indexUrl: INDEX_URL,
    archiveUrl: SOURCE_URL,
    archiveArtifact: RAW_ZIP,
    archiveSha256: sha256(sourceBuffer),
    archiveByteCount: sourceBuffer.length,
    httpMetadata,
    archiveMembers: members,
    sourceCrs,
    featureCount: normalizedFeatures.length,
    geometryKinds,
    coveredParentCount: coveredParents.length,
  },
  results: {
    authority: "Minnesota Secretary of State",
    url: RESULTS_URL,
    artifact: RESULTS,
    sha256: sha256(resultsBuffer),
    byteCount: resultsBuffer.length,
    precinctRows: resultRows.length,
    zeroPresidentialVoteRows: resultRows.filter((row) => number(row, "USPRSTOTAL") === 0).length,
    totals: statewideTotals,
  },
  identityReview: {
    exactVtdidMatches: crosswalkRows.length,
    geometryOnlyVtdids: missingResultIds,
    resultOnlyVtdids: missingGeometryIds,
    fieldMismatchCounts: mismatchCounts,
    mismatchDetails: Object.fromEntries(
      Object.entries(fieldMismatches)
        .filter(([, rows]) => rows.length)
        .map(([field, rows]) => [field, rows]),
    ),
  },
  crosswalk: {
    status: "reviewed",
    oneToOne: crosswalkRows.length,
    pending: 0,
    unmatched: 0,
    reconciliationStatus: "passed",
    parentScopes: coveredParents.length,
    statewideDeltas: zeroDeltas(statewideTotals),
  },
  blockers: [publicBlocker],
  artifacts: {
    sourcePackage: { path: SOURCE_PACKAGE, ...sourcePackageOutput },
    normalized: { path: NORMALIZED, ...normalizedOutput },
    crosswalk: { path: CROSSWALK, ...crosswalkOutput },
    manifest: { path: MANIFEST, ...manifestOutput },
  },
};
writeJson(REPORT, report);
console.log(JSON.stringify(report, null, 2));

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import shp from "shpjs";
import XLSX from "xlsx";
import { reportingUnitCode } from "../src/lib/precinct-geography.ts";

const ROOT = process.cwd();
const STATE = "MN";
const ELECTION_ID = "2016-11-08-general";
const MANIFEST_ID = "mn-2016-11-08-lcc-vtd2016general-v1";
const BASE = `data/precinct-geometry/${STATE}/${ELECTION_ID}`;
const FIXED_RETRIEVED_AT = "2026-08-03T06:00:00.000Z";
const NORMALIZED = `${BASE}/normalized/mn-2016-11-08-precincts.geojson.gz`;
const CROSSWALK = `${BASE}/crosswalk/mn-2016-11-08-vtdid-to-geometry.json`;
const REPORT = `${BASE}/reports/mn-2016-11-08-precinct-geometry-report.json`;
const EVIDENCE = `${BASE}/source-evidence.json`;
const MANIFEST = `${BASE}/manifest.json`;
const EXPECTED_FEATURES = 4_120;
const EXPECTED_PARENTS = 87;
const SOURCE_CRS = 'PROJCS["NAD_1983_UTM_Zone_15N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-93.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const AUTHORITY = "Minnesota Legislative Coordinating Commission Geographic Information Services; Minnesota Secretary of State Elections Division";
const LCC_DISCLAIMER = "LCC-GIS makes no representation or warranties, express or implied, with respect to the reuse of data provided herewith, regardless of its format or the means of its transmission. There is no guarantee or representation to the user as to the accuracy, currency, suitability, or reliability of this data for any purpose. The user accepts the data 'as is', and assumes all risks associated with its use. By accepting this data, the user agrees not to transmit this data or provide access to it or any part of it to another party unless the user shall include with the data a copy of this disclaimer.";
const DISTRIBUTION_LIABILITY = "The Geographic Information System (GIS) Data to which this notice is attached are made available pursuant to the Minnesota Government Data Practices Act (Minnesota Statutes Chapter 13). THE GIS DATA ARE PROVIDED TO YOU AS IS AND WITHOUT ANY WARRANTY AS TO THEIR PERFORMANCE, MERCHANTABILITY, OR FITNESS FOR ANY PARTICULAR PURPOSE. The GIS Data were developed by the LCC - GIS Office for its own internal business purposes. The LCC - GIS Office does not represent or warrant that the GIS Data or the data documentation are error-free, complete, current, or accurate. You are responsible for any consequences resulting from your use of the GIS Data or your reliance on the GIS Data. You should consult the data documentation for this particular GIS Data to determine the limitations of the GIS Data and the precision with which the GIS Data may depict distance, direction, location, or other geographic features. If you transmit or provide the GIS Data (or any portion of it) to another user, the GIS Data must include a copy of this disclaimer.";

const SOURCES = [
  {
    id: "lcc-catalog",
    localArtifactPath: `${BASE}/raw/lcc-gis/download-catalog.html`,
    url: "https://gis.lcc.mn.gov/html/download.html",
    format: "LCC-GIS official download catalog HTML",
    reportingGrain: "official source catalog",
    byteCount: 122_382,
    sha256: "305f22b9180567e1d077d0cf4c8dbe6ec0cba94f5effa17cab583909058dce23",
  },
  {
    id: "lcc-boundary-metadata",
    localArtifactPath: `${BASE}/raw/lcc-gis/vtd2016-metadata.html`,
    url: "https://gis.lcc.mn.gov/metadata/vtd2016.htm",
    format: "LCC-GIS official voting-district metadata HTML",
    reportingGrain: "2016 statewide voting-district boundary metadata",
    byteCount: 77_232,
    sha256: "7ec29fffe974bb186bba21bc6d064ba6bc0cfbb1cba9d0326d8a273eb59fae7b",
  },
  {
    id: "lcc-boundary-archive",
    localArtifactPath: `${BASE}/raw/lcc-gis/vtd2016general.zip`,
    url: "https://gis.lcc.mn.gov/data/shape/vtd2016general.zip",
    format: "LCC-GIS official statewide shapefile ZIP",
    reportingGrain: "2016 general-election voting districts",
    byteCount: 6_853_080,
    sha256: "99c2a68a2987f24896117a53245002d0d452f5be69b6df967d85659bb94fa16e",
  },
  {
    id: "lcc-result-metadata",
    localArtifactPath: `${BASE}/raw/lcc-gis/elec16-metadata.html`,
    url: "https://gis.lcc.mn.gov/metadata/elec16.html",
    format: "LCC-GIS official election-result layer metadata HTML",
    reportingGrain: "2016 statewide precinct result-layer metadata",
    byteCount: 80_331,
    sha256: "e9ecfb35dabb68a7c0bb559bf53f399c538310a19bd90084407212289a6e38c3",
  },
  {
    id: "lcc-preliminary-result-archive",
    localArtifactPath: `${BASE}/raw/lcc-gis/elec2016.zip`,
    url: "https://gis.lcc.mn.gov/data/elections/elec2016.zip",
    format: "LCC-GIS official statewide election-result shapefile ZIP",
    reportingGrain: "pre-canvass 2016 precinct result context",
    byteCount: 2_280_154,
    sha256: "1340380fd26268ab0dc7a5871a1b98c3e288ff8eefc32b84acc725383035a497",
  },
  {
    id: "lcc-election-map",
    localArtifactPath: `${BASE}/raw/lcc-gis/2016-election-map.html`,
    url: "https://gis.lcc.mn.gov/iMaps/elections/2016/all/",
    format: "LCC-GIS official interactive election-map HTML",
    reportingGrain: "statewide preliminary presidential summary",
    byteCount: 13_153,
    sha256: "74e3cf52dcc9301b2ea01b1f8d174179e6922e585f2b824ad2d859bf3f55d2c9",
  },
  {
    id: "lcc-president-map-pdf",
    localArtifactPath: `${BASE}/raw/lcc-gis/USpres16_vtd.pdf`,
    url: "https://gis.lcc.mn.gov/pdf/elec2016/USpres/USpres16_vtd.pdf",
    format: "LCC-GIS official presidential precinct-map PDF",
    reportingGrain: "pre-canvass 2016 presidential precinct map",
    byteCount: 6_230_769,
    sha256: "cff1c18feeac2bc210090969019407c9a42c530e21430b3da83471e6752eb874",
  },
  {
    id: "sos-workbook-page",
    localArtifactPath: `${BASE}/raw/mn-sos/2016-precinct-results-page.html`,
    url: "https://www.sos.mn.gov/elections-voting/election-results/2016/2016-general-election-results/2016-precinct-results-spreadsheet/",
    format: "Minnesota SOS official results landing-page HTML",
    reportingGrain: "certified precinct-results workbook description",
    byteCount: 43_250,
    sha256: "8e0d25d2d8a5e2f8a0e7af748a410e468e18d4c5e04d4e279dc95df06785bcb7",
  },
  {
    id: "sos-certified-workbook",
    localArtifactPath: `${BASE}/raw/mn-sos/2016-general-federal-state-results-by-precinct-official.xlsx`,
    url: "https://www.sos.mn.gov/media/2806/2016-general-federal-state-results-by-precinct-official.xlsx",
    format: "Minnesota SOS official Excel workbook",
    reportingGrain: "certified and recount-inclusive VTDID-keyed precinct results",
    byteCount: 1_195_229,
    sha256: "1f2c36c544304de67ea9a0fcf5797a734f54a9ed69ecb15346ddd33be5b9e00a",
  },
];

const PRESIDENT_FIELDS = [
  "USPRSR",
  "USPRSDFL",
  "USPRSCP",
  "USPRSLMN",
  "USPRSSWP",
  "USPRSGP",
  "USPRSADP",
  "USPRSIP",
  "USPRSLIB",
  "USPRSWI",
];
const PRESIDENT_TOTAL_FIELD = "USPRSTOTAL";
const CERTIFIED_TOTALS = {
  USPRSR: 1_322_951,
  USPRSDFL: 1_367_716,
  USPRSCP: 9_456,
  USPRSLMN: 11_291,
  USPRSSWP: 1_672,
  USPRSGP: 36_985,
  USPRSADP: 1_431,
  USPRSIP: 53_076,
  USPRSLIB: 112_972,
  USPRSWI: 27_263,
  USPRSTOTAL: 2_944_813,
  TOTVOTING: 2_968_281,
};
const LCC_PRELIMINARY_TOTALS = {
  USPRSR: 1_321_017,
  USPRSDFL: 1_363_745,
  USPRSCP: 9_453,
  USPRSLMN: 11_276,
  USPRSSWP: 1_668,
  USPRSGP: 36_919,
  USPRSADP: 1_428,
  USPRSIP: 53_026,
  USPRSLIB: 112_770,
  USPRSWI: 27_103,
  USPRSTOTAL: 2_938_405,
  TOTVOTING: 0,
};
const EXPECTED_ZERO_VTDIDS = [
  "270050052", "270070172", "270090113", "270210247", "270230032", "270230100",
  "270390007", "270530485", "270530490", "270531817", "270531827", "270610100",
  "270610271", "270650015", "270670202", "270690092", "270690110", "270710175",
  "270790087", "270890166", "271030050", "271090013", "271090211", "271210022",
  "271230050", "271290152", "271370942", "271370976", "271430082", "271450042",
  "271610020",
];

const args = process.argv.slice(2);
const retrievedAt = args.find((value) => value.startsWith("--retrieved-at="))?.slice("--retrieved-at=".length);
const offline = args.includes("--offline");
if (retrievedAt !== FIXED_RETRIEVED_AT) {
  throw new Error(`Use --retrieved-at=${FIXED_RETRIEVED_AT}.`);
}

const absolute = (relativePath) => path.join(ROOT, relativePath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function immutableWrite(relativePath, bytes) {
  const target = absolute(relativePath);
  if (existsSync(target)) {
    if (!readFileSync(target).equals(bytes)) {
      throw new Error(`Refusing to replace immutable official artifact ${relativePath}`);
    }
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function writeBuffer(relativePath, bytes) {
  const target = absolute(relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { localArtifactPath: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function writeJson(relativePath, value) {
  return writeBuffer(relativePath, jsonBytes(value));
}

function assertPinned(source, bytes) {
  const actual = { byteCount: bytes.length, sha256: sha256(bytes) };
  if (actual.byteCount !== source.byteCount || actual.sha256 !== source.sha256) {
    throw new Error(`Pinned source mismatch for ${source.localArtifactPath}: ${JSON.stringify(actual)}`);
  }
}

async function retain(source) {
  const target = absolute(source.localArtifactPath);
  if (!existsSync(target)) {
    if (offline) throw new Error(`Offline replay requires ${source.localArtifactPath}`);
    const response = await fetch(source.url, {
      redirect: "follow",
      headers: { "User-Agent": "CivicResultMaps Minnesota 2016 precinct geometry collector" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} retrieving ${source.url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assertPinned(source, bytes);
    immutableWrite(source.localArtifactPath, bytes);
  }
  const bytes = readFileSync(target);
  assertPinned(source, bytes);
  return { ...source, bytes };
}

function textWithoutMarkup(bytes) {
  return bytes.toString("utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function requireText(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`Retained ${label} no longer supports ${pattern}`);
}

function numeric(row, field, idField = "VTDID") {
  const value = Number(String(row[field] ?? "0").replace(/,/g, "").trim());
  if (!Number.isFinite(value)) throw new Error(`Nonnumeric ${field} for ${row[idField] ?? "unknown row"}`);
  return value;
}

function columnTotals(rows, fields) {
  return Object.fromEntries(fields.map((field) => [field, rows.reduce((sum, row) => sum + numeric(row, field, row.VTD === undefined ? "VTDID" : "VTD"), 0)]));
}

function assertObjectEquals(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
}

function dbfFieldNames(dbf) {
  const headerLength = dbf.readUInt16LE(8);
  const fields = [];
  for (let offset = 32; offset < headerLength - 1; offset += 32) {
    const field = dbf.subarray(offset, offset + 11).toString("ascii").replace(/\0.*/, "").trim();
    if (field) fields.push(field);
  }
  return fields;
}

async function parseShapefileArchive(source, selectedLayer) {
  const zip = await JSZip.loadAsync(source.bytes);
  const members = Object.keys(zip.files).filter((member) => !zip.files[member].dir).sort();
  for (const extension of [".shp", ".shx", ".dbf", ".prj"]) {
    if (!members.includes(`${selectedLayer}${extension}`)) {
      throw new Error(`${source.localArtifactPath} lacks ${selectedLayer}${extension}`);
    }
  }
  const sourceCrs = (await zip.file(`${selectedLayer}.prj`).async("string")).trim();
  if (sourceCrs !== SOURCE_CRS) throw new Error(`Unexpected ${selectedLayer} source CRS`);
  const dbf = await zip.file(`${selectedLayer}.dbf`).async("nodebuffer");
  const featureCollection = await shp(source.bytes);
  if (Array.isArray(featureCollection) || featureCollection?.type !== "FeatureCollection") {
    throw new Error(`Expected one FeatureCollection in ${source.localArtifactPath}`);
  }
  if (featureCollection.features.length !== EXPECTED_FEATURES) {
    throw new Error(`Expected ${EXPECTED_FEATURES} ${selectedLayer} features, found ${featureCollection.features.length}`);
  }
  return { members, sourceCrs, nativeFieldNames: dbfFieldNames(dbf), featureCollection };
}

async function extractPdfText(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    const value = await parser.getText();
    return { text: value.text, pageCount: value.total };
  } finally {
    await parser.destroy();
  }
}

function sortedSetDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function geometryIndex(featureCollection, idField, label) {
  const byId = new Map();
  const geometryKinds = {};
  for (const [index, feature] of featureCollection.features.entries()) {
    const properties = feature.properties ?? {};
    const vtdid = String(properties[idField] ?? "").trim();
    const countyFips = String(properties.COUNTYFIPS ?? "").trim().padStart(3, "0");
    const precinctCode = String(properties.PCTCODE ?? "").trim().padStart(4, "0");
    if (!/^27\d{7}$/.test(vtdid)) throw new Error(`${label} feature ${index} lacks a valid ${idField}`);
    if (vtdid !== `27${countyFips}${precinctCode}`) {
      throw new Error(`${label} ${vtdid} disagrees with COUNTYFIPS/PCTCODE`);
    }
    if (byId.has(vtdid)) throw new Error(`Duplicate ${label} key ${vtdid}`);
    if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
      throw new Error(`${label} ${vtdid} has unsupported geometry ${feature.geometry?.type}`);
    }
    if (!Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length === 0) {
      throw new Error(`${label} ${vtdid} has empty geometry`);
    }
    geometryKinds[feature.geometry.type] = (geometryKinds[feature.geometry.type] ?? 0) + 1;
    byId.set(vtdid, feature);
  }
  return { byId, geometryKinds };
}

function reconciliationTotals(rows) {
  const president = columnTotals(rows, [...PRESIDENT_FIELDS, PRESIDENT_TOTAL_FIELD]);
  return {
    totalPeopleVoting: rows.reduce((sum, row) => sum + numeric(row, "TOTVOTING"), 0),
    totalVotes: president.USPRSTOTAL,
    trump: president.USPRSR,
    clinton: president.USPRSDFL,
    other: president.USPRSTOTAL - president.USPRSR - president.USPRSDFL,
  };
}

function zeroDeltas(totals) {
  return Object.fromEntries(Object.keys(totals).map((key) => [key, 0]));
}

const retained = Object.fromEntries((await Promise.all(SOURCES.map(async (source) => [source.id, await retain(source)]))));

const catalogHtml = retained["lcc-catalog"].bytes.toString("utf8");
const catalogText = textWithoutMarkup(retained["lcc-catalog"].bytes);
const boundaryMetadataText = textWithoutMarkup(retained["lcc-boundary-metadata"].bytes);
const resultMetadataText = textWithoutMarkup(retained["lcc-result-metadata"].bytes);
const electionMapText = textWithoutMarkup(retained["lcc-election-map"].bytes);
const sosPageText = textWithoutMarkup(retained["sos-workbook-page"].bytes);
requireText(catalogHtml, /<!--\s*Voting Districts 2016\s*-->[\s\S]{0,2500}vtd2016general\.zip/i, "LCC catalog boundary row");
requireText(catalogHtml, /<!--\s*Election results 2016\s*-->[\s\S]{0,2500}elec2016\.zip/i, "LCC catalog election-result row");
requireText(catalogHtml, /USpres16_vtd\.pdf/i, "LCC catalog presidential map link");
requireText(boundaryMetadataText, /Developed by Minnesota Secretary of State Elections Division for the 2016 election/i, "boundary metadata purpose");
requireText(boundaryMetadataText, /current boundaries as of October 2016/i, "boundary metadata currentness");
requireText(boundaryMetadataText, /Complete statewide as of October 2016/i, "boundary metadata completeness");
requireText(boundaryMetadataText, /VTDID:\s*Precinct ID/i, "boundary VTDID definition");
requireText(boundaryMetadataText, /PCTCODE:\s*Precinct Code/i, "boundary PCTCODE definition");
requireText(boundaryMetadataText, /COUNTYFIPS:\s*County FIPS Code/i, "boundary parent definition");
requireText(resultMetadataText, /Complete statewide for the 2016 election/i, "result-layer completeness");
requireText(resultMetadataText, /PCTCODE\s+Precinct Number \(unique within county\)/i, "result-layer PCTCODE definition");
requireText(resultMetadataText, /USPRSTOTAL\s+US President total votes/i, "result-layer presidential-total definition");
requireText(electionMapText, /Hillary Clinton \(DFL\)[\s\S]*1,363,745/i, "LCC map Clinton total");
requireText(electionMapText, /Donald Trump \(R\)[\s\S]*1,321,017/i, "LCC map Trump total");
requireText(electionMapText, /Total Votes[\s\S]*2,938,405/i, "LCC map statewide total");
requireText(sosPageText, /Federal and State Results by Precinct \(\.xlsx\)/i, "SOS workbook link");
requireText(sosPageText, /totals for all filed candidates for U\.S\. President/i, "SOS candidate scope");
requireText(sosPageText, /Results as of December 19, 2016, incorporating all recounts/i, "SOS result vintage");

if (!retained["lcc-president-map-pdf"].bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) {
  throw new Error("Retained LCC map is not a PDF");
}
const pdf = await extractPdfText(retained["lcc-president-map-pdf"].bytes);
if (pdf.pageCount !== 1 || !/2016 PRESIDENTIAL ELECTION/.test(pdf.text) || !/UNOFFICIAL AS OF NOVEMBER 9, 2016\./.test(pdf.text)) {
  throw new Error("LCC presidential PDF no longer establishes its November 9 unofficial status");
}

const boundaryArchive = await parseShapefileArchive(retained["lcc-boundary-archive"], "vtd2016general");
const preliminaryArchive = await parseShapefileArchive(retained["lcc-preliminary-result-archive"], "elec2016");
const boundary = geometryIndex(boundaryArchive.featureCollection, "VTDID", "boundary");
const preliminary = geometryIndex(preliminaryArchive.featureCollection, "VTD", "preliminary result layer");
assertObjectEquals(boundary.geometryKinds, { Polygon: 3682, MultiPolygon: 438 }, "Boundary geometry types");
assertObjectEquals(preliminary.geometryKinds, { Polygon: 3689, MultiPolygon: 431 }, "Preliminary-layer geometry types");

const workbook = XLSX.read(retained["sos-certified-workbook"].bytes, { type: "buffer" });
assertObjectEquals(workbook.SheetNames, ["Results", "Fields", "Counties", "Districts", "Notes"], "SOS workbook sheets");
const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets.Results, { defval: null, raw: false });
const certifiedRows = sourceRows.filter((row) => /^27\d{7}$/.test(String(row.VTDID ?? "").trim()));
const totalRows = sourceRows.filter((row) => row.COUNTYNAME === "TOTAL");
if (certifiedRows.length !== EXPECTED_FEATURES || totalRows.length !== 1 || sourceRows.length !== EXPECTED_FEATURES + 1) {
  throw new Error(`Unexpected SOS result universe: ${certifiedRows.length} precinct rows and ${totalRows.length} totals`);
}
const fieldRows = XLSX.utils.sheet_to_json(workbook.Sheets.Fields, { defval: null, raw: false });
const fieldDefinitions = new Map(fieldRows.map((row) => [String(row.FIELDNAME ?? "").trim(), String(row.DEFINITION ?? "").trim()]));
if (fieldDefinitions.get("VTDID") !== "Vote Tabulation District ID") throw new Error("Workbook VTDID definition drifted");
if (fieldDefinitions.get("PCTCODE") !== "Precinct Number (unique within county)") throw new Error("Workbook PCTCODE definition drifted");
if (fieldDefinitions.get("COUNTYCODE") !== "County Number") throw new Error("Workbook COUNTYCODE definition drifted");
if (fieldDefinitions.get("USPRSTOTAL") !== "US President total votes") throw new Error("Workbook USPRSTOTAL definition drifted");
const noteCells = XLSX.utils.sheet_to_json(workbook.Sheets.Notes, { header: 1, defval: null, raw: false }).flat().filter(Boolean).join(" ");
if (!/certified by the State Canvassing Board on Nov\. 29, 2016, and Dec\. 19, 2016 for the Senate District 14 recount\./.test(noteCells)) {
  throw new Error("Workbook canvass/recount note drifted");
}

const countyRows = XLSX.utils.sheet_to_json(workbook.Sheets.Counties, { defval: null, raw: false });
if (countyRows.length !== EXPECTED_PARENTS) throw new Error(`Expected ${EXPECTED_PARENTS} county lookup rows`);
const countyFipsByCode = new Map();
for (const row of countyRows) {
  const code = String(row.CountyID ?? "").trim().padStart(2, "0");
  const geoid = String(row.FIPS ?? "").trim();
  if (!/^27\d{3}$/.test(geoid) || countyFipsByCode.has(code)) throw new Error(`Invalid county lookup ${code}/${geoid}`);
  countyFipsByCode.set(code, geoid);
}

const certifiedById = new Map();
for (const row of certifiedRows) {
  const vtdid = String(row.VTDID).trim();
  const precinctCode = String(row.PCTCODE ?? "").trim().padStart(4, "0");
  const countyCode = String(row.COUNTYCODE ?? "").trim().padStart(2, "0");
  const parentGeoid = countyFipsByCode.get(countyCode);
  if (!parentGeoid || vtdid !== `${parentGeoid}${precinctCode}`) {
    throw new Error(`Certified result key ${vtdid} disagrees with the Counties sheet/PCTCODE`);
  }
  if (certifiedById.has(vtdid)) throw new Error(`Duplicate certified VTDID ${vtdid}`);
  const candidateSum = PRESIDENT_FIELDS.reduce((sum, field) => sum + numeric(row, field), 0);
  if (candidateSum !== numeric(row, PRESIDENT_TOTAL_FIELD)) throw new Error(`Candidate sum mismatch for ${vtdid}`);
  certifiedById.set(vtdid, row);
}
for (const [vtdid, feature] of preliminary.byId) {
  const candidateSum = PRESIDENT_FIELDS.reduce((sum, field) => sum + numeric(feature.properties, field, "VTD"), 0);
  if (candidateSum !== numeric(feature.properties, PRESIDENT_TOTAL_FIELD, "VTD")) {
    throw new Error(`Preliminary candidate sum mismatch for ${vtdid}`);
  }
}

const boundaryIds = new Set(boundary.byId.keys());
const preliminaryIds = new Set(preliminary.byId.keys());
const certifiedIds = new Set(certifiedById.keys());
const threeWayDifferences = {
  boundaryOnlyVsCertified: sortedSetDifference(boundaryIds, certifiedIds),
  certifiedOnlyVsBoundary: sortedSetDifference(certifiedIds, boundaryIds),
  preliminaryOnlyVsCertified: sortedSetDifference(preliminaryIds, certifiedIds),
  certifiedOnlyVsPreliminary: sortedSetDifference(certifiedIds, preliminaryIds),
};
if (Object.values(threeWayDifferences).some((values) => values.length)) {
  throw new Error(`Official three-way VTDID universes disagree: ${JSON.stringify(threeWayDifferences)}`);
}

const identityMismatchDetails = { PCTNAME: [], MCDNAME: [] };
for (const vtdid of [...certifiedIds].sort()) {
  const result = certifiedById.get(vtdid);
  const geometry = boundary.byId.get(vtdid).properties;
  const preliminaryResult = preliminary.byId.get(vtdid).properties;
  const expectedParent = vtdid.slice(0, 5);
  const expectedPrecinctCode = vtdid.slice(5);
  for (const [label, properties, idField] of [
    ["boundary", geometry, "VTDID"],
    ["preliminary", preliminaryResult, "VTD"],
  ]) {
    if (String(properties[idField]) !== vtdid
      || `27${String(properties.COUNTYFIPS).padStart(3, "0")}` !== expectedParent
      || String(properties.PCTCODE).padStart(4, "0") !== expectedPrecinctCode) {
      throw new Error(`${label} identity components disagree for ${vtdid}`);
    }
  }
  if (String(result.PCTCODE).padStart(4, "0") !== expectedPrecinctCode
    || countyFipsByCode.get(String(result.COUNTYCODE).padStart(2, "0")) !== expectedParent
    || String(geometry.COUNTYNAME) !== String(result.COUNTYNAME)
    || String(geometry.COUNTYCODE).padStart(2, "0") !== String(result.COUNTYCODE).padStart(2, "0")) {
    throw new Error(`Binding parent/precinct identity fields disagree for ${vtdid}`);
  }
  for (const field of Object.keys(identityMismatchDetails)) {
    if (String(geometry[field] ?? "") !== String(result[field] ?? "")) {
      identityMismatchDetails[field].push({
        vtdid,
        boundaryValue: String(geometry[field] ?? ""),
        certifiedWorkbookValue: String(result[field] ?? ""),
      });
    }
  }
}
if (identityMismatchDetails.PCTNAME.length !== 1_809 || identityMismatchDetails.MCDNAME.length !== 109) {
  throw new Error("Expected documented nonbinding display-name differences");
}

const certifiedTotals = {
  ...columnTotals(certifiedRows, [...PRESIDENT_FIELDS, PRESIDENT_TOTAL_FIELD]),
  TOTVOTING: certifiedRows.reduce((sum, row) => sum + numeric(row, "TOTVOTING"), 0),
};
const preliminaryRows = [...preliminary.byId.values()].map((feature) => feature.properties);
const preliminaryTotals = {
  ...columnTotals(preliminaryRows, [...PRESIDENT_FIELDS, PRESIDENT_TOTAL_FIELD]),
  TOTVOTING: preliminaryRows.reduce((sum, row) => sum + numeric(row, "TOTVOTING", "VTD"), 0),
};
assertObjectEquals(certifiedTotals, CERTIFIED_TOTALS, "Certified presidential totals");
assertObjectEquals(preliminaryTotals, LCC_PRELIMINARY_TOTALS, "LCC preliminary presidential totals");
for (const field of [...PRESIDENT_FIELDS, PRESIDENT_TOTAL_FIELD, "TOTVOTING"]) {
  if (numeric(totalRows[0], field) !== CERTIFIED_TOTALS[field]) throw new Error(`Workbook TOTAL row ${field} drifted`);
}
const preliminaryDeltas = Object.fromEntries(
  Object.keys(LCC_PRELIMINARY_TOTALS).map((field) => [field, preliminaryTotals[field] - certifiedTotals[field]]),
);
if (preliminaryDeltas.USPRSTOTAL !== -6_408) throw new Error("Expected the LCC preliminary total to trail certified results by 6,408");
const differingVtdids = [...certifiedIds].filter((vtdid) =>
  [...PRESIDENT_FIELDS, PRESIDENT_TOTAL_FIELD].some((field) =>
    numeric(preliminary.byId.get(vtdid).properties, field, "VTD") !== numeric(certifiedById.get(vtdid), field)),
).sort();
const absoluteTotalVoteDelta = [...certifiedIds].reduce((sum, vtdid) => sum + Math.abs(
  numeric(preliminary.byId.get(vtdid).properties, PRESIDENT_TOTAL_FIELD, "VTD")
    - numeric(certifiedById.get(vtdid), PRESIDENT_TOTAL_FIELD),
), 0);
if (differingVtdids.length !== 261 || absoluteTotalVoteDelta !== 9_756) {
  throw new Error(`Expected 261 differing VTDs and 9,756 absolute row-total delta, found ${differingVtdids.length}/${absoluteTotalVoteDelta}`);
}
const certifiedZeroVtdids = [...certifiedIds].filter((vtdid) => numeric(certifiedById.get(vtdid), PRESIDENT_TOTAL_FIELD) === 0).sort();
const preliminaryZeroVtdids = [...preliminaryIds].filter((vtdid) => numeric(preliminary.byId.get(vtdid).properties, PRESIDENT_TOTAL_FIELD, "VTD") === 0).sort();
assertObjectEquals(certifiedZeroVtdids, EXPECTED_ZERO_VTDIDS, "Certified zero-president VTDIDs");
assertObjectEquals(preliminaryZeroVtdids, EXPECTED_ZERO_VTDIDS, "Preliminary zero-president VTDIDs");

const sortedVtdids = [...boundaryIds].sort();
const normalizedFeatures = sortedVtdids.map((vtdid) => {
  const source = boundary.byId.get(vtdid);
  const properties = source.properties;
  const countyFips = String(properties.COUNTYFIPS).padStart(3, "0");
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: vtdid,
      CRM_PARENT_GEOID: `27${countyFips}`,
      CRM_NATIVE_ID: vtdid,
      CRM_PRECINCT_CODE: String(properties.PCTCODE).padStart(4, "0"),
      CRM_DISPLAY_NAME: String(properties.PCTNAME),
      CRM_MUNICIPALITY: String(properties.MCDNAME),
      CRM_COUNTY_NAME: String(properties.COUNTYNAME),
      CRM_COUNTY_CODE: String(properties.COUNTYCODE),
      CRM_COUNTY_FIPS: countyFips,
    },
    geometry: source.geometry,
  };
});
const normalizedOutput = writeBuffer(NORMALIZED, gzipSync(
  Buffer.from(`${JSON.stringify({ type: "FeatureCollection", features: normalizedFeatures })}\n`, "utf8"),
  { level: 9, mtime: 0 },
));

const coveredParents = [...new Map(normalizedFeatures.map((feature) => [
  feature.properties.CRM_PARENT_GEOID,
  { geoid: feature.properties.CRM_PARENT_GEOID, name: `${feature.properties.CRM_COUNTY_NAME} County` },
])).values()].sort((left, right) => left.geoid.localeCompare(right.geoid));
if (coveredParents.length !== EXPECTED_PARENTS) throw new Error(`Expected ${EXPECTED_PARENTS} normalized parents`);

const crosswalkRows = sortedVtdids.map((vtdid) => {
  const row = certifiedById.get(vtdid);
  const parentGeoid = vtdid.slice(0, 5);
  return {
    resultUnitCode: reportingUnitCode({
      state: STATE,
      electionId: ELECTION_ID,
      reportingGrain: "precinct",
      parentGeoid,
      sourceUnitId: vtdid,
    }),
    sourceUnitId: vtdid,
    sourceDisplayName: `${row.COUNTYNAME} / ${row.MCDNAME} / ${row.PCTNAME} (${String(row.PCTCODE).padStart(4, "0")})`,
    parentGeoid,
    reportingGrain: "precinct",
    isGeographic: true,
    relationships: [{
      sourceFeatureId: `${parentGeoid}|${vtdid}`,
      relationshipType: "one_to_one",
      matchMethod: "exact_official_id",
      reviewStatus: "reviewed",
      confidence: "high",
      note: "Reviewed exact VTDID relationship: LCC defines boundary VTDID as Precinct ID and PCTCODE as Precinct Code; SOS defines VTDID as Vote Tabulation District ID and PCTCODE as county-unique. For this row, boundary VTDID, preliminary-layer VTD, certified-workbook VTDID, PCTCODE, and county parent construction agree exactly. Display-name differences are nonbinding.",
    }],
  };
});

const certifiedRowsByParent = new Map();
for (const row of certifiedRows) {
  const parentGeoid = String(row.VTDID).slice(0, 5);
  const rows = certifiedRowsByParent.get(parentGeoid) ?? [];
  rows.push(row);
  certifiedRowsByParent.set(parentGeoid, rows);
}
const reconciliationScopes = [...certifiedRowsByParent.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([scopeId, rows]) => {
    const totals = reconciliationTotals(rows);
    return { scopeType: "parent", scopeId, resultTotals: totals, mappedTotals: { ...totals }, deltas: zeroDeltas(totals) };
  });
const statewideReconciliationTotals = reconciliationTotals(certifiedRows);
reconciliationScopes.push({
  scopeType: "state",
  scopeId: STATE,
  resultTotals: statewideReconciliationTotals,
  mappedTotals: { ...statewideReconciliationTotals },
  deltas: zeroDeltas(statewideReconciliationTotals),
});

const evidence = {
  schemaVersion: 1,
  id: "mn-2016-official-precinct-geometry-and-result-scope-evidence",
  state: STATE,
  election: { id: ELECTION_ID, date: "2016-11-08", year: 2016, type: "general", office: "president" },
  authority: AUTHORITY,
  retrievedAt,
  artifacts: SOURCES.map(({ id, localArtifactPath, url, format, reportingGrain, byteCount, sha256: digest }) => ({
    id, localArtifactPath, url, format, reportingGrain, byteCount, sha256: digest,
  })),
  boundaryVintageEvidence: {
    catalogLabel: "Voting Districts (Precincts & Wards), 2016",
    archiveFilename: "vtd2016general.zip",
    selectedLayer: "vtd2016general",
    developedFor: "Minnesota Secretary of State Elections Division for the 2016 election",
    currentnessReference: "current boundaries as of October 2016",
    completeness: "Complete statewide as of October 2016",
    publicationDate: "2016-10-25",
    sourceCrs: SOURCE_CRS,
    archiveMembers: boundaryArchive.members,
    nativeFieldNames: boundaryArchive.nativeFieldNames,
    sourceFeatureCount: EXPECTED_FEATURES,
    geometryKinds: boundary.geometryKinds,
    fieldDefinitions: {
      VTDID: "Precinct ID",
      PCTCODE: "Precinct Code",
      COUNTYFIPS: "County FIPS Code",
    },
  },
  resultIdentityEvidence: {
    certifiedSourceId: "mn-sos-2016-general-certified-precinct-results",
    certifiedWorkbookSheet: "Results",
    workbookSourceRows: sourceRows.length,
    certifiedPrecinctRows: certifiedRows.length,
    workbookStateTotalRows: totalRows.length,
    countyLookupRows: countyRows.length,
    fieldDefinitions: Object.fromEntries(["VTDID", "PCTCODE", "COUNTYCODE", "USPRSTOTAL"].map((field) => [field, fieldDefinitions.get(field)])),
    canvassNote: "This file contains election results certified by the State Canvassing Board on Nov. 29, 2016, and Dec. 19, 2016 for the Senate District 14 recount.",
    landingPageVintage: "Results as of December 19, 2016, incorporating all recounts.",
    exactThreeWayVtdidMatches: EXPECTED_FEATURES,
    exactThreeWaySetDifferences: threeWayDifferences,
    keyConstruction: "Each of the 4,120 keys independently equals the five-digit county GEOID from the SOS Counties sheet plus four-digit county-unique PCTCODE; both LCC layers independently equal 27 + three-digit COUNTYFIPS + four-digit PCTCODE.",
    bindingIdentityMismatches: 0,
    nonbindingDisplayNameMismatchCounts: {
      PCTNAME: identityMismatchDetails.PCTNAME.length,
      MCDNAME: identityMismatchDetails.MCDNAME.length,
    },
    nonbindingDisplayNameMismatchSamples: {
      PCTNAME: identityMismatchDetails.PCTNAME.slice(0, 25),
      MCDNAME: identityMismatchDetails.MCDNAME.slice(0, 25),
    },
    relationshipCardinality: { oneToOne: EXPECTED_FEATURES, oneToMany: 0, manyToOne: 0, unmatched: 0 },
    relationshipStatus: "reviewed",
  },
  certifiedResultUniverse: {
    precinctRows: certifiedRows.length,
    countyParents: EXPECTED_PARENTS,
    stateTotalRows: totalRows.length,
    candidateColumns: PRESIDENT_FIELDS,
    candidateAndTotalColumnTotals: certifiedTotals,
    candidateColumnSumEqualsPresidentTotal: true,
    zeroPresidentVtdids: certifiedZeroVtdids,
    voterStatisticColumns: ["REG7AM", "EDR", "SIGNATURES", "AB_MB", "FEDONLYAB", "PRESONLYAB", "TOTVOTING"],
  },
  lccPreliminaryResultContext: {
    catalogLabel: "2016 Election Results",
    archiveFilename: "elec2016.zip",
    selectedLayer: "elec2016",
    metadataCompleteness: "Complete statewide for the 2016 election",
    publicationDate: "2016-12-22",
    archiveMembers: preliminaryArchive.members,
    nativeFieldNames: preliminaryArchive.nativeFieldNames,
    sourceCrs: SOURCE_CRS,
    precinctRows: preliminaryRows.length,
    geometryKinds: preliminary.geometryKinds,
    candidateAndTotalColumnTotals: preliminaryTotals,
    certifiedMinusPreliminary: Object.fromEntries(Object.keys(preliminaryDeltas).map((field) => [field, -preliminaryDeltas[field]])),
    preliminaryMinusCertified: preliminaryDeltas,
    statewidePresidentVoteShortfall: 6_408,
    vtdidsWithCandidateOrPresidentTotalDifference: differingVtdids.length,
    absoluteSumOfVtdPresidentTotalDeltas: absoluteTotalVoteDelta,
    zeroPresidentVtdids: preliminaryZeroVtdids,
    votingStatisticsScope: {
      TOTVOTINGColumnPresent: true,
      TOTVOTINGStatewideValue: 0,
      certifiedTOTVOTINGStatewideValue: certifiedTotals.TOTVOTING,
      certifiedVoterStatisticColumnsAbsentFromLccLayer: ["REG7AM", "EDR", "SIGNATURES", "AB_MB", "FEDONLYAB", "PRESONLYAB"],
    },
    statusEvidence: {
      pdfLabel: "2016 PRESIDENTIAL ELECTION — UNOFFICIAL AS OF NOVEMBER 9, 2016.",
      pdfPageCount: pdf.pageCount,
      interactiveMapTotals: { USPRSDFL: 1_363_745, USPRSR: 1_321_017, USPRSTOTAL: 2_938_405 },
      archiveTotalsMatchInteractiveMap: true,
      interpretation: "The exact archive totals match the retained LCC map and the retained LCC PDF labels the election unofficial as of November 9. The separate SOS workbook is certified and dated through December 19, incorporating recounts. Therefore elec2016.zip is retained only as preliminary identity and reconciliation context, never as the certified vote source.",
    },
  },
  terms: {
    catalogDisclaimer: LCC_DISCLAIMER,
    metadataDistributionLiability: DISTRIBUTION_LIABILITY,
    redistributionRequirement: "Any transmitted GIS data must include a copy of the applicable disclaimer.",
  },
  caveats: [
    "The reviewed one-to-one relationship proves identity and cardinality only. It does not make the preliminary LCC vote fields certified and does not authorize public delivery without an explicitly reviewed certified-result importer/display path.",
    "All election values are confined to retained source evidence and reconciliation summaries. Normalized geometry and crosswalk relationship rows contain no election values.",
    "PCTNAME and MCDNAME display strings differ in some boundary/workbook rows; exact official IDs, county parents, and PCTCODE—not names—govern every relationship.",
    "The retained SOS landing-page HTML is one byte-pinned official response captured during this task. The upstream page is dynamically regenerated, so retrievedAt records this retained response's collection context and does not assert that later upstream HTML bytes will remain identical.",
  ],
};
const evidenceOutput = writeJson(EVIDENCE, evidence);

const crosswalk = {
  schemaVersion: 1,
  manifestId: MANIFEST_ID,
  state: STATE,
  electionId: ELECTION_ID,
  geographyLevel: "precinct",
  resultSourceId: evidence.resultIdentityEvidence.certifiedSourceId,
  resultSource: {
    authority: "Minnesota Secretary of State Elections Division",
    url: retained["sos-certified-workbook"].url,
    artifact: retained["sos-certified-workbook"].localArtifactPath,
    sha256: retained["sos-certified-workbook"].sha256,
    byteCount: retained["sos-certified-workbook"].byteCount,
    sheetName: "Results",
    vintage: "Certified through December 19, 2016, incorporating recounts",
  },
  generatedAt: retrievedAt,
  rows: crosswalkRows,
  reconciliation: { status: "passed", scopes: reconciliationScopes },
};
const crosswalkOutput = writeJson(CROSSWALK, crosswalk);

const deliveryBlocker = "The 4,120 one-to-one VTDID relationships are reviewed and the certified SOS workbook reconciles across all 87 county parents and statewide, but relationship review establishes identity—not a public certified-result activation path. The retained LCC elec2016 layer is an unofficial November 9 snapshot with 2,938,405 presidential votes, 6,408 fewer than the certified/recount-inclusive SOS workbook, and differs in 261 VTDs. Delivery remains null until a separately reviewed importer/display path explicitly uses the certified SOS workbook, excludes LCC vote fields, preserves zero-vote units, and is authorized for public activation.";
const manifest = {
  schemaVersion: 1,
  id: MANIFEST_ID,
  state: STATE,
  election: evidence.election,
  geography: {
    level: "precinct",
    parentLevel: "county",
    boundaryVintage: "LCC-GIS vtd2016general; current boundaries as of October 2016; developed for the 2016 election",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "official_export",
    nativeCrs: SOURCE_CRS,
    servedCrs: "EPSG:4326",
  },
  source: {
    authority: AUTHORITY,
    url: retained["lcc-catalog"].url,
    retrievedAt,
    artifact: EVIDENCE,
    sha256: evidenceOutput.sha256,
    byteCount: evidenceOutput.byteCount,
    format: "precinct-source-evidence+json",
    licenseOrTerms: `${LCC_DISCLAIMER} ${DISTRIBUTION_LIABILITY}`,
  },
  normalization: {
    script: "scripts/collect-mn-2016-precinct-geometry-diagnostic.mjs",
    sourceCrs: SOURCE_CRS,
    servedCrs: "EPSG:4326",
    artifact: NORMALIZED,
    sha256: normalizedOutput.sha256,
    byteCount: normalizedOutput.byteCount,
    featureCount: normalizedFeatures.length,
    sourceFeatureIdFields: ["CRM_FEATURE_ID"],
    parentIdFields: ["CRM_PARENT_GEOID"],
  },
  crosswalk: {
    status: "reviewed",
    resultSourceId: crosswalk.resultSourceId,
    artifact: CROSSWALK,
    sha256: crosswalkOutput.sha256,
    byteCount: crosswalkOutput.byteCount,
    resultUnits: crosswalkRows.length,
    colorableResultUnits: crosswalkRows.length,
    matchedResultUnits: crosswalkRows.length,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: {
      oneToOne: crosswalkRows.length,
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
    errors: [deliveryBlocker],
    warnings: [
      "The LCC preliminary election layer is retained only to prove the exact three-way VTDID relationship and document its pre-canvass difference; none of its election values enter normalized geometry, crosswalk relationships, or certified reconciliation.",
      `The ${certifiedZeroVtdids.length} official zero-presidential-vote VTDIDs remain geographic one-to-one result units.`,
      "LCC attribution, disclaimer, and redistribution terms must accompany any future public geometry delivery.",
    ],
  },
  delivery: null,
  caveats: [deliveryBlocker, ...evidence.caveats],
};
const manifestOutput = writeJson(MANIFEST, manifest);

const report = {
  schemaVersion: 1,
  state: STATE,
  electionId: ELECTION_ID,
  generatedAt: retrievedAt,
  disposition: "blocked_preliminary_result_scope_and_no_public_certified_result_activation",
  source: {
    authority: AUTHORITY,
    boundaryArchiveUrl: retained["lcc-boundary-archive"].url,
    boundaryArchiveArtifact: retained["lcc-boundary-archive"].localArtifactPath,
    boundaryArchiveSha256: retained["lcc-boundary-archive"].sha256,
    boundaryArchiveByteCount: retained["lcc-boundary-archive"].byteCount,
    archiveMembers: boundaryArchive.members,
    sourceCrs: SOURCE_CRS,
    featureCount: normalizedFeatures.length,
    geometryKinds: boundary.geometryKinds,
    coveredParentCount: coveredParents.length,
  },
  identityReview: {
    relationshipStatus: "reviewed",
    exactThreeWayVtdidMatches: crosswalkRows.length,
    exactThreeWaySetDifferences: threeWayDifferences,
    bindingIdentityMismatches: 0,
    displayNameMismatchCounts: evidence.resultIdentityEvidence.nonbindingDisplayNameMismatchCounts,
    oneToOne: crosswalkRows.length,
    pending: 0,
    unmatched: 0,
  },
  certifiedResults: {
    authority: "Minnesota Secretary of State Elections Division",
    url: retained["sos-certified-workbook"].url,
    artifact: retained["sos-certified-workbook"].localArtifactPath,
    sha256: retained["sos-certified-workbook"].sha256,
    byteCount: retained["sos-certified-workbook"].byteCount,
    precinctRows: certifiedRows.length,
    zeroPresidentVoteRows: certifiedZeroVtdids.length,
    candidateAndTotalColumnTotals: certifiedTotals,
    vintage: "Results as of December 19, 2016, incorporating all recounts; workbook canvass note retained",
  },
  preliminaryLccComparison: {
    status: "diagnostic_context_only",
    precinctRows: preliminaryRows.length,
    candidateAndTotalColumnTotals: preliminaryTotals,
    preliminaryMinusCertified: preliminaryDeltas,
    statewidePresidentVoteShortfall: 6_408,
    vtdidsWithCandidateOrPresidentTotalDifference: differingVtdids.length,
    absoluteSumOfVtdPresidentTotalDeltas: absoluteTotalVoteDelta,
    zeroVtdidSetMatchesCertified: true,
    preliminaryTOTVOTING: preliminaryTotals.TOTVOTING,
    certifiedTOTVOTING: certifiedTotals.TOTVOTING,
    statusEvidence: evidence.lccPreliminaryResultContext.statusEvidence,
  },
  crosswalk: {
    status: "reviewed",
    oneToOne: crosswalkRows.length,
    pending: 0,
    unmatched: 0,
    reconciliationStatus: "passed",
    parentScopes: coveredParents.length,
    stateScope: 1,
    statewideDeltas: zeroDeltas(statewideReconciliationTotals),
  },
  blockers: [deliveryBlocker],
  artifacts: {
    sourceEvidence: evidenceOutput,
    normalized: normalizedOutput,
    crosswalk: crosswalkOutput,
    manifest: manifestOutput,
  },
};
const reportOutput = writeJson(REPORT, report);

console.log(JSON.stringify({
  manifest: manifestOutput.localArtifactPath,
  report: reportOutput.localArtifactPath,
  featureCount: normalizedFeatures.length,
  reviewedOneToOne: crosswalkRows.length,
  certifiedPresidentVotes: certifiedTotals.USPRSTOTAL,
  preliminaryPresidentVotes: preliminaryTotals.USPRSTOTAL,
  preliminaryShortfall: 6_408,
  differingVtdids: differingVtdids.length,
  delivery: null,
}, null, 2));

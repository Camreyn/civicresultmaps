import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import shp from "shpjs";
import XLSX from "xlsx";

const ROOT = process.cwd();
const BASE = "data/precinct-geometry/MN/2016-11-08-general";
const RETRIEVED_AT = "2026-08-03T06:00:00.000Z";
const SOURCE_CRS = 'PROJCS["NAD_1983_UTM_Zone_15N",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-93.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const NORMALIZED = `${BASE}/normalized/mn-2016-11-08-precincts.geojson.gz`;
const CROSSWALK = `${BASE}/crosswalk/mn-2016-11-08-vtdid-to-geometry.json`;
const REPORT = `${BASE}/reports/mn-2016-11-08-precinct-geometry-report.json`;
const MANIFEST = `${BASE}/manifest.json`;
const EVIDENCE = `${BASE}/source-evidence.json`;

const RAW_SOURCES = [
  ["lcc-catalog", `${BASE}/raw/lcc-gis/download-catalog.html`, 122382, "305f22b9180567e1d077d0cf4c8dbe6ec0cba94f5effa17cab583909058dce23", "https://gis.lcc.mn.gov/html/download.html"],
  ["lcc-boundary-metadata", `${BASE}/raw/lcc-gis/vtd2016-metadata.html`, 77232, "7ec29fffe974bb186bba21bc6d064ba6bc0cfbb1cba9d0326d8a273eb59fae7b", "https://gis.lcc.mn.gov/metadata/vtd2016.htm"],
  ["lcc-boundary-archive", `${BASE}/raw/lcc-gis/vtd2016general.zip`, 6853080, "99c2a68a2987f24896117a53245002d0d452f5be69b6df967d85659bb94fa16e", "https://gis.lcc.mn.gov/data/shape/vtd2016general.zip"],
  ["lcc-result-metadata", `${BASE}/raw/lcc-gis/elec16-metadata.html`, 80331, "e9ecfb35dabb68a7c0bb559bf53f399c538310a19bd90084407212289a6e38c3", "https://gis.lcc.mn.gov/metadata/elec16.html"],
  ["lcc-preliminary-result-archive", `${BASE}/raw/lcc-gis/elec2016.zip`, 2280154, "1340380fd26268ab0dc7a5871a1b98c3e288ff8eefc32b84acc725383035a497", "https://gis.lcc.mn.gov/data/elections/elec2016.zip"],
  ["lcc-election-map", `${BASE}/raw/lcc-gis/2016-election-map.html`, 13153, "74e3cf52dcc9301b2ea01b1f8d174179e6922e585f2b824ad2d859bf3f55d2c9", "https://gis.lcc.mn.gov/iMaps/elections/2016/all/"],
  ["lcc-president-map-pdf", `${BASE}/raw/lcc-gis/USpres16_vtd.pdf`, 6230769, "cff1c18feeac2bc210090969019407c9a42c530e21430b3da83471e6752eb874", "https://gis.lcc.mn.gov/pdf/elec2016/USpres/USpres16_vtd.pdf"],
  ["sos-workbook-page", `${BASE}/raw/mn-sos/2016-precinct-results-page.html`, 43250, "8e0d25d2d8a5e2f8a0e7af748a410e468e18d4c5e04d4e279dc95df06785bcb7", "https://www.sos.mn.gov/elections-voting/election-results/2016/2016-general-election-results/2016-precinct-results-spreadsheet/"],
  ["sos-certified-workbook", `${BASE}/raw/mn-sos/2016-general-federal-state-results-by-precinct-official.xlsx`, 1195229, "1f2c36c544304de67ea9a0fcf5797a734f54a9ed69ecb15346ddd33be5b9e00a", "https://www.sos.mn.gov/media/2806/2016-general-federal-state-results-by-precinct-official.xlsx"],
];
const PRESIDENT_FIELDS = ["USPRSR", "USPRSDFL", "USPRSCP", "USPRSLMN", "USPRSSWP", "USPRSGP", "USPRSADP", "USPRSIP", "USPRSLIB", "USPRSWI"];
const CERTIFIED_TOTALS = {
  USPRSR: 1322951, USPRSDFL: 1367716, USPRSCP: 9456, USPRSLMN: 11291,
  USPRSSWP: 1672, USPRSGP: 36985, USPRSADP: 1431, USPRSIP: 53076,
  USPRSLIB: 112972, USPRSWI: 27263, USPRSTOTAL: 2944813, TOTVOTING: 2968281,
};
const PRELIMINARY_TOTALS = {
  USPRSR: 1321017, USPRSDFL: 1363745, USPRSCP: 9453, USPRSLMN: 11276,
  USPRSSWP: 1668, USPRSGP: 36919, USPRSADP: 1428, USPRSIP: 53026,
  USPRSLIB: 112770, USPRSWI: 27103, USPRSTOTAL: 2938405, TOTVOTING: 0,
};
const PRELIMINARY_MINUS_CERTIFIED = {
  USPRSR: -1934, USPRSDFL: -3971, USPRSCP: -3, USPRSLMN: -15,
  USPRSSWP: -4, USPRSGP: -66, USPRSADP: -3, USPRSIP: -50,
  USPRSLIB: -202, USPRSWI: -160, USPRSTOTAL: -6408, TOTVOTING: -2968281,
};
const ZERO_VTDIDS = [
  "270050052", "270070172", "270090113", "270210247", "270230032", "270230100",
  "270390007", "270530485", "270530490", "270531817", "270531827", "270610100",
  "270610271", "270650015", "270670202", "270690092", "270690110", "270710175",
  "270790087", "270890166", "271030050", "271090013", "271090211", "271210022",
  "271230050", "271290152", "271370942", "271370976", "271430082", "271450042",
  "271610020",
];
const EXPECTED_PACKAGE_FILES = [
  CROSSWALK,
  MANIFEST,
  NORMALIZED,
  `${BASE}/raw/lcc-gis/2016-election-map.html`,
  `${BASE}/raw/lcc-gis/USpres16_vtd.pdf`,
  `${BASE}/raw/lcc-gis/download-catalog.html`,
  `${BASE}/raw/lcc-gis/elec16-metadata.html`,
  `${BASE}/raw/lcc-gis/elec2016.zip`,
  `${BASE}/raw/lcc-gis/vtd2016-metadata.html`,
  `${BASE}/raw/lcc-gis/vtd2016general.zip`,
  `${BASE}/raw/mn-sos/2016-general-federal-state-results-by-precinct-official.xlsx`,
  `${BASE}/raw/mn-sos/2016-precinct-results-page.html`,
  REPORT,
  EVIDENCE,
].sort();

const absolute = (relative) => path.join(ROOT, relative);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (relative) => JSON.parse(readFileSync(absolute(relative), "utf8"));
const numeric = (row, field) => Number(String(row[field] ?? 0).replace(/,/g, ""));
const columnTotals = (rows, fields) => Object.fromEntries(fields.map((field) => [field, rows.reduce((sum, row) => sum + numeric(row, field), 0)]));
const sortedDifference = (left, right) => [...left].filter((value) => !right.has(value)).sort();

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

async function parseArchive(relative, layer) {
  const bytes = readFileSync(absolute(relative));
  const zip = await JSZip.loadAsync(bytes);
  const members = Object.keys(zip.files).filter((member) => !zip.files[member].dir).sort();
  const sourceCrs = (await zip.file(`${layer}.prj`).async("string")).trim();
  const featureCollection = await shp(bytes);
  return { members, sourceCrs, featureCollection };
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const target = path.join(directory, entry);
    if (statSync(target).isDirectory()) files.push(...listFiles(target));
    else files.push(path.relative(ROOT, target).replaceAll("\\", "/"));
  }
  return files;
}

function coordinateBounds(value, bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    bounds.minX = Math.min(bounds.minX, value[0]);
    bounds.maxX = Math.max(bounds.maxX, value[0]);
    bounds.minY = Math.min(bounds.minY, value[1]);
    bounds.maxY = Math.max(bounds.maxY, value[1]);
    return bounds;
  }
  if (Array.isArray(value)) for (const child of value) coordinateBounds(child, bounds);
  return bounds;
}

test("Minnesota 2016 package pins official source bytes and exact source-scope evidence", async () => {
  for (const [, relative, byteCount, sha] of RAW_SOURCES) {
    const bytes = readFileSync(absolute(relative));
    assert.equal(bytes.length, byteCount, `${relative} byte count`);
    assert.equal(digest(bytes), sha, `${relative} digest`);
  }

  const catalogHtml = readFileSync(absolute(RAW_SOURCES[0][1]), "utf8");
  assert.match(catalogHtml, /<!--\s*Voting Districts 2016\s*-->[\s\S]{0,2500}vtd2016general\.zip/i);
  assert.match(catalogHtml, /<!--\s*Election results 2016\s*-->[\s\S]{0,2500}elec2016\.zip/i);
  assert.match(catalogHtml, /pdf\/elec2016\/USpres\/USpres16_vtd\.pdf/i);
  const catalogText = textWithoutMarkup(Buffer.from(catalogHtml));
  assert.match(catalogText, /LCC-GIS makes no representation or warranties, express or implied/);
  assert.match(catalogText, /unless the user shall include with the data a copy of this disclaimer\./);

  const boundaryMetadata = textWithoutMarkup(readFileSync(absolute(RAW_SOURCES[1][1])));
  assert.match(boundaryMetadata, /Developed by Minnesota Secretary of State Elections Division for the 2016 election/);
  assert.match(boundaryMetadata, /current boundaries as of October 2016/);
  assert.match(boundaryMetadata, /Complete statewide as of October 2016/);
  assert.match(boundaryMetadata, /VTDID:\s*Precinct ID/);
  assert.match(boundaryMetadata, /PCTCODE:\s*Precinct Code/);
  assert.match(boundaryMetadata, /COUNTYFIPS:\s*County FIPS Code/);
  assert.match(boundaryMetadata, /Minnesota Government Data Practices Act \(Minnesota Statutes Chapter 13\)/);
  assert.match(boundaryMetadata, /GIS Data must include a copy of this disclaimer\./);

  const resultMetadata = textWithoutMarkup(readFileSync(absolute(RAW_SOURCES[3][1])));
  assert.match(resultMetadata, /Complete statewide for the 2016 election/);
  assert.match(resultMetadata, /PCTCODE Precinct Number \(unique within county\)/);
  assert.match(resultMetadata, /USPRSTOTAL US President total votes/);

  const sosPageHtml = readFileSync(absolute(RAW_SOURCES[7][1]), "utf8");
  const sosPage = textWithoutMarkup(Buffer.from(sosPageHtml));
  assert.match(sosPage, /totals for all filed candidates for U\.S\. President/);
  assert.match(sosPage, /Results as of December 19, 2016, incorporating all recounts\./);
  assert.match(sosPageHtml, /2016-general-federal-state-results-by-precinct-official\.xlsx/i);

  const mapHtml = readFileSync(absolute(RAW_SOURCES[5][1]), "utf8");
  assert.match(mapHtml, /id="candidate1votes">1,363,745</);
  assert.match(mapHtml, /id="candidate2votes">1,321,017</);
  assert.match(mapHtml, /id="totalvotes">2,938,405</);
  const parser = new PDFParse({ data: readFileSync(absolute(RAW_SOURCES[6][1])) });
  try {
    const pdf = await parser.getText();
    assert.equal(pdf.total, 1);
    assert.match(pdf.text, /2016 PRESIDENTIAL ELECTION/);
    assert.match(pdf.text, /UNOFFICIAL AS OF NOVEMBER 9, 2016\./);
  } finally {
    await parser.destroy();
  }

  const evidence = json(EVIDENCE);
  assert.equal(evidence.retrievedAt, RETRIEVED_AT);
  assert.deepEqual(evidence.artifacts.map((artifact) => [artifact.id, artifact.localArtifactPath, artifact.byteCount, artifact.sha256, artifact.url]), RAW_SOURCES);
  assert.equal(evidence.boundaryVintageEvidence.currentnessReference, "current boundaries as of October 2016");
  assert.equal(evidence.resultIdentityEvidence.exactThreeWayVtdidMatches, 4120);
  assert.deepEqual(evidence.resultIdentityEvidence.exactThreeWaySetDifferences, {
    boundaryOnlyVsCertified: [], certifiedOnlyVsBoundary: [], preliminaryOnlyVsCertified: [], certifiedOnlyVsPreliminary: [],
  });
  assert.equal(evidence.terms.redistributionRequirement, "Any transmitted GIS data must include a copy of the applicable disclaimer.");
  assert.match(evidence.terms.catalogDisclaimer, /^LCC-GIS makes no representation or warranties/);
  assert.match(evidence.terms.metadataDistributionLiability, /GIS Data must include a copy of this disclaimer\.$/);
  assert.ok(evidence.caveats.some((caveat) => /upstream page is dynamically regenerated/.test(caveat)));
});

test("Minnesota 2016 official archives prove exact three-way VTDID and certified vote universes", async () => {
  const boundary = await parseArchive(RAW_SOURCES[2][1], "vtd2016general");
  const preliminary = await parseArchive(RAW_SOURCES[4][1], "elec2016");
  assert.deepEqual(boundary.members, [
    "vtd2016general.cpg", "vtd2016general.dbf", "vtd2016general.prj",
    "vtd2016general.shp", "vtd2016general.shp.xml", "vtd2016general.shx",
  ]);
  assert.deepEqual(preliminary.members, ["elec2016.dbf", "elec2016.prj", "elec2016.shp", "elec2016.shx"]);
  assert.equal(boundary.sourceCrs, SOURCE_CRS);
  assert.equal(preliminary.sourceCrs, SOURCE_CRS);
  assert.equal(boundary.featureCollection.features.length, 4120);
  assert.equal(preliminary.featureCollection.features.length, 4120);

  const boundaryKinds = {}, preliminaryKinds = {};
  const boundaryById = new Map(), preliminaryById = new Map();
  for (const feature of boundary.featureCollection.features) {
    const properties = feature.properties;
    const id = String(properties.VTDID);
    assert.match(id, /^27\d{7}$/);
    assert.equal(id, `27${String(properties.COUNTYFIPS).padStart(3, "0")}${String(properties.PCTCODE).padStart(4, "0")}`);
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
    assert.ok(feature.geometry.coordinates.length > 0);
    assert.equal(boundaryById.has(id), false);
    boundaryById.set(id, feature);
    boundaryKinds[feature.geometry.type] = (boundaryKinds[feature.geometry.type] ?? 0) + 1;
  }
  for (const feature of preliminary.featureCollection.features) {
    const properties = feature.properties;
    const id = String(properties.VTD);
    assert.equal(id, `27${String(properties.COUNTYFIPS).padStart(3, "0")}${String(properties.PCTCODE).padStart(4, "0")}`);
    assert.equal(preliminaryById.has(id), false);
    preliminaryById.set(id, feature);
    preliminaryKinds[feature.geometry.type] = (preliminaryKinds[feature.geometry.type] ?? 0) + 1;
  }
  assert.deepEqual(boundaryKinds, { Polygon: 3682, MultiPolygon: 438 });
  assert.deepEqual(preliminaryKinds, { Polygon: 3689, MultiPolygon: 431 });

  const workbook = XLSX.read(readFileSync(absolute(RAW_SOURCES[8][1])), { type: "buffer" });
  assert.deepEqual(workbook.SheetNames, ["Results", "Fields", "Counties", "Districts", "Notes"]);
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets.Results, { defval: null, raw: false });
  const certifiedRows = sourceRows.filter((row) => /^27\d{7}$/.test(String(row.VTDID ?? "")));
  const totalRows = sourceRows.filter((row) => row.COUNTYNAME === "TOTAL");
  assert.equal(sourceRows.length, 4121);
  assert.equal(certifiedRows.length, 4120);
  assert.equal(totalRows.length, 1);
  const counties = XLSX.utils.sheet_to_json(workbook.Sheets.Counties, { defval: null, raw: false });
  assert.equal(counties.length, 87);
  const fipsByCountyCode = new Map(counties.map((row) => [String(row.CountyID).padStart(2, "0"), String(row.FIPS)]));
  const certifiedById = new Map();
  for (const row of certifiedRows) {
    const id = String(row.VTDID);
    assert.equal(id, `${fipsByCountyCode.get(String(row.COUNTYCODE).padStart(2, "0"))}${String(row.PCTCODE).padStart(4, "0")}`);
    assert.equal(certifiedById.has(id), false);
    assert.equal(PRESIDENT_FIELDS.reduce((sum, field) => sum + numeric(row, field), 0), numeric(row, "USPRSTOTAL"));
    certifiedById.set(id, row);
  }
  assert.deepEqual([...boundaryById.keys()].sort(), [...certifiedById.keys()].sort());
  assert.deepEqual([...preliminaryById.keys()].sort(), [...certifiedById.keys()].sort());
  assert.equal(sortedDifference(new Set(boundaryById.keys()), new Set(certifiedById.keys())).length, 0);

  const bindingMismatches = [], displayMismatches = { PCTNAME: 0, MCDNAME: 0 };
  for (const [id, row] of certifiedById) {
    const geometry = boundaryById.get(id).properties;
    assert.equal(String(geometry.PCTCODE).padStart(4, "0"), String(row.PCTCODE).padStart(4, "0"));
    assert.equal(`27${String(geometry.COUNTYFIPS).padStart(3, "0")}`, id.slice(0, 5));
    if (String(geometry.COUNTYNAME) !== String(row.COUNTYNAME)
      || String(geometry.COUNTYCODE).padStart(2, "0") !== String(row.COUNTYCODE).padStart(2, "0")) bindingMismatches.push(id);
    for (const field of Object.keys(displayMismatches)) {
      if (String(geometry[field] ?? "") !== String(row[field] ?? "")) displayMismatches[field] += 1;
    }
  }
  assert.deepEqual(bindingMismatches, []);
  assert.deepEqual(displayMismatches, { PCTNAME: 1809, MCDNAME: 109 });

  const fields = XLSX.utils.sheet_to_json(workbook.Sheets.Fields, { defval: null, raw: false });
  const definitions = new Map(fields.map((row) => [String(row.FIELDNAME).trim(), String(row.DEFINITION).trim()]));
  assert.equal(definitions.get("VTDID"), "Vote Tabulation District ID");
  assert.equal(definitions.get("PCTCODE"), "Precinct Number (unique within county)");
  assert.equal(definitions.get("COUNTYCODE"), "County Number");
  assert.equal(definitions.get("USPRSTOTAL"), "US President total votes");
  const notes = XLSX.utils.sheet_to_json(workbook.Sheets.Notes, { header: 1, defval: null, raw: false }).flat().filter(Boolean).join(" ");
  assert.match(notes, /certified by the State Canvassing Board on Nov\. 29, 2016, and Dec\. 19, 2016 for the Senate District 14 recount\./);

  const certifiedTotals = {
    ...columnTotals(certifiedRows, [...PRESIDENT_FIELDS, "USPRSTOTAL"]),
    TOTVOTING: columnTotals(certifiedRows, ["TOTVOTING"]).TOTVOTING,
  };
  assert.deepEqual(certifiedTotals, CERTIFIED_TOTALS);
  for (const [field, total] of Object.entries(CERTIFIED_TOTALS)) assert.equal(numeric(totalRows[0], field), total);
  assert.equal(PRESIDENT_FIELDS.reduce((sum, field) => sum + certifiedTotals[field], 0), certifiedTotals.USPRSTOTAL);
  const certifiedZeroIds = certifiedRows.filter((row) => numeric(row, "USPRSTOTAL") === 0).map((row) => String(row.VTDID)).sort();
  assert.deepEqual(certifiedZeroIds, ZERO_VTDIDS);

  const preliminaryRows = [...preliminaryById.values()].map((feature) => feature.properties);
  const preliminaryTotals = {
    ...columnTotals(preliminaryRows, [...PRESIDENT_FIELDS, "USPRSTOTAL"]),
    TOTVOTING: columnTotals(preliminaryRows, ["TOTVOTING"]).TOTVOTING,
  };
  assert.deepEqual(preliminaryTotals, PRELIMINARY_TOTALS);
  assert.ok(preliminaryRows.every((row) => numeric(row, "TOTVOTING") === 0));
  for (const field of ["REG7AM", "EDR", "SIGNATURES", "AB_MB", "FEDONLYAB", "PRESONLYAB"]) {
    assert.equal(Object.hasOwn(preliminaryRows[0], field), false, `${field} must be absent from preliminary layer`);
  }
  const deltas = Object.fromEntries(Object.keys(PRELIMINARY_TOTALS).map((field) => [field, preliminaryTotals[field] - certifiedTotals[field]]));
  assert.deepEqual(deltas, PRELIMINARY_MINUS_CERTIFIED);
  const differingIds = [...certifiedById.keys()].filter((id) => [...PRESIDENT_FIELDS, "USPRSTOTAL"].some((field) => numeric(preliminaryById.get(id).properties, field) !== numeric(certifiedById.get(id), field)));
  const absoluteTotalDelta = [...certifiedById.keys()].reduce((sum, id) => sum + Math.abs(numeric(preliminaryById.get(id).properties, "USPRSTOTAL") - numeric(certifiedById.get(id), "USPRSTOTAL")), 0);
  assert.equal(differingIds.length, 261);
  assert.equal(absoluteTotalDelta, 9756);
  assert.deepEqual(preliminaryRows.filter((row) => numeric(row, "USPRSTOTAL") === 0).map((row) => String(row.VTD)).sort(), ZERO_VTDIDS);
});

test("Minnesota 2016 normalized geometry and reviewed crosswalk exclude election values and fail closed", () => {
  assert.deepEqual(listFiles(absolute(BASE)).sort(), EXPECTED_PACKAGE_FILES);
  const normalizedBytes = readFileSync(absolute(NORMALIZED));
  const normalized = JSON.parse(gunzipSync(normalizedBytes).toString("utf8"));
  assert.equal(normalized.type, "FeatureCollection");
  assert.equal(normalized.features.length, 4120);
  const propertyKeys = [
    "CRM_COUNTY_CODE", "CRM_COUNTY_FIPS", "CRM_COUNTY_NAME", "CRM_DISPLAY_NAME", "CRM_FEATURE_ID",
    "CRM_MUNICIPALITY", "CRM_NATIVE_ID", "CRM_PARENT_GEOID", "CRM_PRECINCT_CODE",
  ];
  const featureIds = new Set();
  const parentIds = new Set();
  const kinds = {};
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const feature of normalized.features) {
    assert.deepEqual(Object.keys(feature.properties).sort(), propertyKeys);
    const p = feature.properties;
    assert.equal(p.CRM_FEATURE_ID, `27${p.CRM_COUNTY_FIPS}${p.CRM_PRECINCT_CODE}`);
    assert.equal(p.CRM_NATIVE_ID, p.CRM_FEATURE_ID);
    assert.equal(p.CRM_PARENT_GEOID, `27${p.CRM_COUNTY_FIPS}`);
    assert.equal(featureIds.has(p.CRM_FEATURE_ID), false);
    featureIds.add(p.CRM_FEATURE_ID);
    parentIds.add(p.CRM_PARENT_GEOID);
    kinds[feature.geometry.type] = (kinds[feature.geometry.type] ?? 0) + 1;
    coordinateBounds(feature.geometry.coordinates, bounds);
  }
  assert.equal(featureIds.size, 4120);
  assert.equal(parentIds.size, 87);
  assert.deepEqual(kinds, { Polygon: 3682, MultiPolygon: 438 });
  assert.ok(bounds.minX > -98 && bounds.maxX < -89 && bounds.minY > 43 && bounds.maxY < 50, JSON.stringify(bounds));
  assert.doesNotMatch(JSON.stringify(normalized.features.map((feature) => feature.properties)), /USPRS|TOTVOTING|REG7AM|EDR|SIGNATURES|AB_MB|FEDONLYAB|PRESONLYAB/);

  const crosswalkBytes = readFileSync(absolute(CROSSWALK));
  const crosswalk = JSON.parse(crosswalkBytes);
  assert.equal(crosswalk.resultSourceId, "mn-sos-2016-general-certified-precinct-results");
  assert.equal(crosswalk.generatedAt, RETRIEVED_AT);
  assert.equal(crosswalk.rows.length, 4120);
  assert.equal(new Set(crosswalk.rows.map((row) => row.resultUnitCode)).size, 4120);
  assert.doesNotMatch(JSON.stringify(crosswalk.rows), /USPRS|TOTVOTING|REG7AM|EDR|SIGNATURES|AB_MB|FEDONLYAB|PRESONLYAB/);
  for (const row of crosswalk.rows) {
    assert.equal(featureIds.has(row.sourceUnitId), true);
    assert.equal(row.parentGeoid, row.sourceUnitId.slice(0, 5));
    assert.equal(row.relationships.length, 1);
    assert.deepEqual({
      sourceFeatureId: row.relationships[0].sourceFeatureId,
      relationshipType: row.relationships[0].relationshipType,
      matchMethod: row.relationships[0].matchMethod,
      reviewStatus: row.relationships[0].reviewStatus,
      confidence: row.relationships[0].confidence,
    }, {
      sourceFeatureId: `${row.parentGeoid}|${row.sourceUnitId}`,
      relationshipType: "one_to_one",
      matchMethod: "exact_official_id",
      reviewStatus: "reviewed",
      confidence: "high",
    });
  }
  assert.equal(crosswalk.reconciliation.status, "passed");
  assert.equal(crosswalk.reconciliation.scopes.length, 88);
  assert.equal(crosswalk.reconciliation.scopes.filter((scope) => scope.scopeType === "parent").length, 87);
  for (const scope of crosswalk.reconciliation.scopes) {
    assert.deepEqual(scope.resultTotals, scope.mappedTotals);
    assert.ok(Object.values(scope.deltas).every((delta) => delta === 0));
  }
  const stateScope = crosswalk.reconciliation.scopes.find((scope) => scope.scopeType === "state");
  assert.deepEqual(stateScope.resultTotals, {
    totalPeopleVoting: 2968281, totalVotes: 2944813, trump: 1322951, clinton: 1367716, other: 254146,
  });

  const evidenceBytes = readFileSync(absolute(EVIDENCE));
  const manifest = json(MANIFEST);
  assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
  assert.match(manifest.geography.boundaryVintage, /current boundaries as of October 2016; developed for the 2016 election/);
  assert.equal(manifest.normalization.featureCount, 4120);
  assert.equal(manifest.normalization.byteCount, normalizedBytes.length);
  assert.equal(manifest.normalization.sha256, digest(normalizedBytes));
  assert.equal(manifest.source.byteCount, evidenceBytes.length);
  assert.equal(manifest.source.sha256, digest(evidenceBytes));
  assert.equal(manifest.crosswalk.status, "reviewed");
  assert.equal(manifest.crosswalk.byteCount, crosswalkBytes.length);
  assert.equal(manifest.crosswalk.sha256, digest(crosswalkBytes));
  assert.deepEqual(manifest.crosswalk.relationships, {
    oneToOne: 4120, oneToMany: 0, manyToOne: 0, unmatched: 0,
    nonGeographic: 0, sourceAlias: 0, pendingReview: 0,
  });
  assert.equal(manifest.validation.status, "blocked");
  assert.equal(manifest.validation.geometryValid, true);
  assert.equal(manifest.validation.parentTotalsReconciled, true);
  assert.equal(manifest.validation.rowLevelRenderingSafe, false);
  assert.match(manifest.validation.errors[0], /identity—not a public certified-result activation path/);
  assert.match(manifest.validation.errors[0], /6,408 fewer/);
  assert.match(manifest.validation.errors[0], /differs in 261 VTDs/);
  assert.equal(manifest.delivery, null);

  const report = json(REPORT);
  assert.equal(report.disposition, "blocked_preliminary_result_scope_and_no_public_certified_result_activation");
  assert.equal(report.identityReview.exactThreeWayVtdidMatches, 4120);
  assert.deepEqual(report.certifiedResults.candidateAndTotalColumnTotals, CERTIFIED_TOTALS);
  assert.deepEqual(report.preliminaryLccComparison.candidateAndTotalColumnTotals, PRELIMINARY_TOTALS);
  assert.deepEqual(report.preliminaryLccComparison.preliminaryMinusCertified, PRELIMINARY_MINUS_CERTIFIED);
  assert.equal(report.preliminaryLccComparison.statewidePresidentVoteShortfall, 6408);
  assert.equal(report.preliminaryLccComparison.vtdidsWithCandidateOrPresidentTotalDifference, 261);
  assert.equal(report.preliminaryLccComparison.absoluteSumOfVtdPresidentTotalDeltas, 9756);
  assert.equal(report.crosswalk.reconciliationStatus, "passed");
});

test("Minnesota 2016 package replays byte-identically without network", () => {
  const before = Object.fromEntries(EXPECTED_PACKAGE_FILES.map((relative) => [relative, digest(readFileSync(absolute(relative)))]));
  execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/collect-mn-2016-precinct-geometry-diagnostic.mjs",
    "--offline",
    `--retrieved-at=${RETRIEVED_AT}`,
  ], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    stdio: "pipe",
    timeout: 120000,
  });
  const after = Object.fromEntries(EXPECTED_PACKAGE_FILES.map((relative) => [relative, digest(readFileSync(absolute(relative)))]));
  assert.deepEqual(after, before);
});

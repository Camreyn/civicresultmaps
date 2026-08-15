import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import shp from "shpjs";
import XLSX from "xlsx";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";
import {
  normalizeWisconsinLabel,
  resolveWisconsinWardRelationships,
  unionWisconsinWardGeometries,
} from "./wi-ward-reporting-units.mjs";

export const WISCONSIN_REVIEWED_AT = "2026-08-15T18:00:00.000Z";
export const WISCONSIN_GEOGRAPHY_LEVEL = "local_reporting_unit";

export const WISCONSIN_YEAR_SPECS = Object.freeze({
  2012: {
    year: 2012,
    date: "2012-11-06",
    electionId: "2012-11-06-general",
    manifestId: "wi-2012-11-06-local-reporting-geometry-blocked-v2",
    resultSourceId: "wi-gab-2012-president-ward-by-ward",
    resultPath: "data/precinct-geometry/WI/2012-11-06-general/raw/wec-2012-general/2012-11-06-ward-by-ward.xls",
    reviewed: false,
    expected: { sourceUnits: 3525, mappedUnits: 0, totalVotes: 3047999 },
  },
  2016: {
    year: 2016,
    date: "2016-11-08",
    electionId: "2016-11-08-general",
    manifestId: "wi-2016-11-08-reviewed-local-reporting-geometry-v1",
    resultSourceId: "wi-wec-2016-president-recount-ward-by-ward",
    resultPath: "data/precinct-geometry/WI/2016-11-08-general/raw/wec-2016-general/president-recount-ward-by-ward-with-districts.xlsx",
    geometryPath: "data/precinct-geometry/WI/2016-11-08-general/raw/vest/wi_2016.zip",
    reviewed: true,
    expected: { sourceUnits: 3636, sourceFeatures: 6872, mappedUnits: 3626, excludedZeroUnits: 10, noDataFeatures: 22, normalizedFeatures: 3648, totalVotes: 2976150 },
  },
  2020: {
    year: 2020,
    date: "2020-11-03",
    electionId: "2020-11-03-general",
    manifestId: "wi-2020-11-03-reviewed-local-reporting-geometry-v1",
    resultSourceId: "wi-wec-2020-president-after-recount-ward-by-ward",
    resultPath: "data/precinct-geometry/WI/2020-11-03-general/raw/wec-2020-general/wec-2020-president-after-recount-by-state-representative-district.xlsx",
    geometryPath: "data/precinct-geometry/WI/2020-11-03-general/raw/vest/wi_2020.zip",
    reviewed: true,
    expected: { sourceUnits: 3698, sourceFeatures: 7090, mappedUnits: 3696, excludedZeroUnits: 2, noDataFeatures: 9, normalizedFeatures: 3705, totalVotes: 3298041 },
  },
  2024: {
    year: 2024,
    date: "2024-11-05",
    electionId: "2024-11-05-general",
    manifestId: "wi-2024-11-05-reviewed-local-reporting-geometry-v1",
    resultSourceId: "wi-wec-2024-ward-by-ward-federal-state-xlsx",
    resultPath: "data/precinct-geometry/WI/2024-11-05-general/raw/wec-2024-general/ward-by-ward-federal-state.xlsx",
    geometryPath: "data/precinct-geometry/WI/2024-11-05-general/raw/nyt/WI-precincts-with-results.geojson.gz",
    reviewed: true,
    expected: { sourceUnits: 3603, sourceFeatures: 3503, mappedUnits: 3503, excludedZeroUnits: 100, noDataFeatures: 0, normalizedFeatures: 3503, totalVotes: 3422918 },
  },
});

export const WISCONSIN_RAW_SOURCE_PINS = Object.freeze({
  "data/wi-counties.geojson": [4341944, "f778a7e1eeb50eb61d64b0fa4a1738501b29a40f788af73ec033afb0be54ca88"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/wec-2012-general/2012-11-06-ward-by-ward.xls": [5535744, "67f81be6f8b574d2c08e712ea4b4994e2d7e25e3155ea7dbfe61cf0d70314789"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/item-metadata.json": [14448, "37a06dfa290faa87123a6ba298e9b6cba1a01f87f3a906eddf9e84125ece500a"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/item-data.json": [28863, "d822dbc449dba3af6283ccf8b39315415d297357d619def41543db740a16db08"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/service-metadata.json": [4334, "9b60ad16b93471fd8f8aeaafa3370291c94f094dbf665f9bd9929731dad67662"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/layer-metadata.json": [87338, "956eef06f8c708653b110326b4c4f8f7a48e4e41067c26b370c2aa80e6682ee1"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/2012-identity-and-context-values-0.json": [563603, "e89e81e46c5418e31909838e617ff7f66034778c2905ff88f57a31db38a5583e"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/2012-identity-and-context-values-2000.json": [569509, "332d89a5c30964f9b68d543d8eae1776aa04f6f7ceaf4bf0652dc968195e11bf"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/2012-identity-and-context-values-4000.json": [566860, "fe7b3538ad99e4302423e6420d432437d3b276ebf78c93ef9635eacb23aa8bc9"],
  "data/precinct-geometry/WI/2012-11-06-general/raw/ltsb-2011-wards/2012-identity-and-context-values-6000.json": [181537, "0303d1a074801bf50d17e880bef7098af75c8aa872661106d6acdf5ff18e5d2a"],
  "data/precinct-geometry/WI/2016-11-08-general/raw/wec-2016-general/president-recount-ward-by-ward-with-districts.xlsx": [402320, "fe0dd28c260b0ce99b08af0497695b9908a88c09ab5d8436787a32c2c8e5c3de"],
  "data/precinct-geometry/WI/2016-11-08-general/raw/vest/wi_2016.zip": [21941198, "744f8dd31af1bcc2e3ed20796b3b63b0646df444e9b4aed23d966c3078e33b4f"],
  "data/precinct-geometry/WI/2016-11-08-general/raw/vest/documentation.txt": [156582, "1feba4a879741eec2d3138da1e71e0d5da735ec8c9b5ba5718ef0a3b4251ae0d"],
  "data/precinct-geometry/WI/2016-11-08-general/raw/vest/dataverse-license-evidence.json": [866, "c666ed6c73cb7ba8500d8140fa69d5c3ce76f968b7576ac28e4bd54ca9c80bbc"],
  "data/precinct-geometry/WI/2020-11-03-general/raw/wec-2020-general/wec-2020-president-after-recount-by-state-representative-district.xlsx": [334263, "c47ec7ae49bb9f14d190e136fd3ff7c7622178a28a701950391e6fc058535431"],
  "data/precinct-geometry/WI/2020-11-03-general/raw/vest/wi_2020.zip": [21751416, "7a8b887402598355087e39ce289b4384de5d4c5a5e2079231ed1992dbb2edb91"],
  "data/precinct-geometry/WI/2020-11-03-general/raw/vest/documentation.txt": [146959, "fb784900056495c3dbf846dffb3410a71f72d2f8e06350ff66b5962aa3c1d1cc"],
  "data/precinct-geometry/WI/2020-11-03-general/raw/vest/dataverse-license-evidence.json": [836, "0c1ed4e37407c64610e68a9168f5e57416a36ad54b7d3594d219f02d5e90761e"],
  "data/wi-2024-ward-geometry-item-metadata.json": [17582, "f9a973d3bd52a0baccc66df66b5242c5a8cdb2a070da4c3bbefff16c3c8839ee"],
  "data/precinct-geometry/WI/2024-11-05-general/raw/wec-2024-general/ward-by-ward-federal-state.xlsx": [1411774, "d23ebca4e718274c3890bfc4db9454573ecb6e2048a58b18b70a57d4c6094c67"],
  "data/precinct-geometry/WI/2024-11-05-general/raw/nyt/WI-precincts-with-results.geojson.gz": [24335312, "75d3a16ce02cd15134b13acb5211d46140ce9437474b84df3ab39d0d1062fac3"],
  "data/precinct-geometry/WI/2024-11-05-general/raw/nyt/WI-precincts-with-results.csv.gz": [55144, "14f05661d25f09bfcf0dedba2a411a90caa96ab66a4720a1e92e09e4bc649385"],
  "data/precinct-geometry/WI/2024-11-05-general/raw/nyt/README.md": [49879, "987ea44ab04c77182d335670207dac88f7114f3ae02675ea5d7076e581ffccdf"],
  "data/precinct-geometry/WI/2024-11-05-general/raw/nyt/LICENSE": [4106, "77e8635500262b129a50772647773c2c66d812902aba6ac13bdb2bab14fd59c2"],
});

const BASE_ALIASES = Object.freeze({
  "Bayfield|T|Grand View": "Grandview",
  "Crawford|V|Mt. Sterling": "Mount Sterling",
  "Sauk|V|LaValle": "La Valle",
  "Walworth|V|Fontana": "Fontana-on-Geneva Lake",
});

const REVIEW_OVERRIDES_2016 = Object.freeze({
  "Buffalo|CITY OF ALMA Wards 1-2": { wardIds: ["2"], note: "The election-specific reconstruction represents this reporting area as ward 2; the complete official result row is attached without splitting votes." },
  "Buffalo|CITY OF FOUNTAIN CITY Ward 1-2": { wardIds: ["1"], note: "The election-specific reconstruction represents this reporting area as ward 1; the complete official result row is attached without splitting votes." },
  "Calumet|CITY OF KIEL Ward 7": { wardIds: ["1"], note: "Reviewed source renumbering from WEC ward 7 to reconstructed ward 1; the complete official row is attached without splitting votes." },
  "Clark|VILLAGE OF UNITY Ward 2": { wardIds: ["1"], note: "Reviewed source renumbering from WEC ward 2 to reconstructed ward 1; the complete official row is attached without splitting votes." },
  "Grant|VILLAGE OF TENNYSON Ward 1": { wardIds: ["2"], note: "Reviewed source renumbering from WEC ward 1 to reconstructed ward 2; the complete official row is attached without splitting votes." },
  "La Crosse|TOWN OF HOLLAND Wards 1-6": { wardIds: ["2", "3", "4", "5", "6"], note: "Ward 1 is absent from the election-specific reconstruction; the retained components are dissolved and the complete official row is attached without allocation." },
  "Marquette|TOWN OF MONTELLO Ward 1-4": { wardIds: ["1", "2", "3"], note: "Ward 4 is absent from the election-specific reconstruction; the retained components are dissolved and the complete official row is attached without allocation." },
  "Ozaukee|CITY OF CEDARBURG Ward 2,9": { wardIds: ["2"], note: "Ward 9 is absent from the election-specific reconstruction; the complete official row is attached to the retained reporting-area component without allocation." },
  "Pepin|VILLAGE OF PEPIN Wards 1-2": { wardIds: ["2"], note: "The election-specific reconstruction represents this reporting area as ward 2; the complete official result row is attached without splitting votes." },
});

const REVIEW_OVERRIDES_2020 = Object.freeze({
  "Eau Claire|CITY OF ALTOONA Wards 12-16": { wardIds: ["12", "13", "14", "15"], note: "Ward 16 is absent from the election-specific reconstruction; the retained components are dissolved and the complete official row is attached without allocation." },
  "Trempealeau|TOWN OF LINCOLN Wards 1-2": { wardIds: ["1"], note: "Ward 2 is absent from the election-specific reconstruction; the complete official row is attached to the retained reporting-area component without allocation." },
  "Walworth|CITY OF DELAVAN Wards 1-14,16": { wardIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"], note: "Ward 16 is absent from the election-specific reconstruction; wards 1-14 are dissolved and the complete official row is attached without allocation." },
  "Walworth|CITY OF WHITEWATER Wards 8,13": { wardIds: ["8"], note: "City ward 13 is absent from the election-specific reconstruction; the complete official row is attached to city ward 8 without allocation." },
  "Wood|CITY OF MARSHFIELD Wards 7,16,27": { wardIds: ["7", "16"], note: "Ward 27 is absent from the election-specific reconstruction; wards 7 and 16 are dissolved and the complete official row is attached without allocation." },
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function absolute(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function integer(value, context) {
  const parsed = Number(clean(value).replace(/[$,]/g, "") || 0);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${context} is not a nonnegative integer`);
  return parsed;
}

function countyMaps(root) {
  const collection = JSON.parse(readFileSync(absolute(root, "data/wi-counties.geojson"), "utf8"));
  const byName = new Map();
  for (const feature of collection.features) {
    const geoid = clean(feature.properties?.GEOID);
    const name = normalizeWisconsinLabel(clean(feature.properties?.NAME).replace(/\s+COUNTY$/i, ""));
    if (!/^55\d{3}$/.test(geoid) || !name || byName.has(name)) throw new Error("Wisconsin county artifact has an invalid or duplicate identity");
    byName.set(name, geoid);
  }
  if (byName.size !== 72) throw new Error(`Wisconsin county artifact expected 72 counties, received ${byName.size}`);
  return byName;
}

function candidatesFromHeaders(headers, parties, indexes) {
  return indexes.map((index) => ({ name: clean(headers[index]), party: clean(parties[index]) || "Other", index }));
}

function resultRow({ spec, countyName, reportingUnitLabel, candidates, values, total }) {
  const parentGeoid = spec.counties.get(normalizeWisconsinLabel(countyName));
  if (!parentGeoid) throw new Error(`${spec.year} result row has unknown county ${countyName}`);
  const candidateVotes = candidates.map((candidate) => ({ name: candidate.name, party: candidate.party, votes: integer(values[candidate.index], `${spec.year} ${reportingUnitLabel} ${candidate.name}`) }));
  const democratic = candidateVotes.filter((candidate) => /^(DEM|DEMOCRATIC)$/i.test(candidate.party)).reduce((sum, candidate) => sum + candidate.votes, 0);
  const republican = candidateVotes.filter((candidate) => /^(REP|REPUBLICAN)$/i.test(candidate.party)).reduce((sum, candidate) => sum + candidate.votes, 0);
  const candidateTotal = candidateVotes.reduce((sum, candidate) => sum + candidate.votes, 0);
  const officialTotal = total == null ? candidateTotal : integer(total, `${spec.year} ${reportingUnitLabel} total`);
  if (candidateTotal !== officialTotal) throw new Error(`${spec.year} ${countyName} ${reportingUnitLabel} candidate total ${candidateTotal} does not equal ${officialTotal}`);
  const sourceUnitId = normalizeWisconsinLabel(reportingUnitLabel).toLowerCase().replace(/\s+/g, "-");
  return { parentGeoid, countyName: clean(countyName), reportingUnitLabel: clean(reportingUnitLabel), sourceUnitId, candidateVotes, democratic, republican, other: officialTotal - democratic - republican, total: officialTotal };
}

function assertUniqueResults(rows, year) {
  const identities = new Set();
  for (const row of rows) {
    const key = `${row.parentGeoid}|${row.sourceUnitId}`;
    if (identities.has(key)) throw new Error(`${year} duplicate result identity ${key}`);
    identities.add(key);
  }
}

function parseModernWorkbook(bytes, spec) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, { header: 1, raw: false, defval: "", blankrows: false });
  const headers = matrix[0].map(clean);
  const candidates = candidatesFromHeaders(headers, headers.map((_, index) => index === 6 + (spec.year === 2016 ? 1 : 0) ? "DEM" : index === 6 + (spec.year === 2016 ? 0 : 1) ? "REP" : "OTHER"), headers.map((_, index) => index).slice(6));
  const rows = matrix.slice(1).filter((row) => clean(row[0]) && clean(row[2])).map((row) => resultRow({ spec, countyName: row[0], reportingUnitLabel: row[2], candidates, values: row }));
  assertUniqueResults(rows, spec.year);
  return { rows, candidates: candidates.map(({ name, party }) => ({ name, party })) };
}

function parse2012Workbook(bytes, spec) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, { header: 1, raw: false, defval: "", blankrows: false });
  const headerIndex = matrix.findIndex((row) => row.some((value) => /MITT ROMNEY/i.test(clean(value))));
  if (headerIndex < 1) throw new Error("2012 presidential candidate header was not found");
  const parties = matrix[headerIndex - 1].map(clean);
  const headers = matrix[headerIndex].map(clean);
  const indexes = headers.map((header, index) => header && index >= 3 ? index : -1).filter((index) => index >= 0);
  const candidates = candidatesFromHeaders(headers, parties, indexes);
  let countyName = "";
  const rows = [];
  for (const row of matrix.slice(headerIndex + 1)) {
    if (clean(row[0])) countyName = clean(row[0]);
    const label = clean(row[1]);
    if (!/^(TOWN|VILLAGE|CITY) OF /i.test(label) || !/\bWARDS?\b/i.test(label) || /\b(?:SUB)?TOTALS?\b/i.test(label)) continue;
    rows.push(resultRow({ spec, countyName, reportingUnitLabel: label, candidates, values: row, total: row[2] }));
  }
  assertUniqueResults(rows, spec.year);
  return { rows, candidates: candidates.map(({ name, party }) => ({ name, party })) };
}

function parse2024Workbook(bytes, spec) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet2, { header: 1, raw: false, defval: "", blankrows: false });
  const headerIndex = matrix.findIndex((row) => row.some((value) => /KAMALA D[.] HARRIS/i.test(clean(value))));
  if (headerIndex < 1) throw new Error("2024 presidential candidate header was not found");
  const parties = matrix[headerIndex - 1].map(clean);
  const headers = matrix[headerIndex].map(clean);
  const indexes = headers.map((header, index) => header && index >= 4 ? index : -1).filter((index) => index >= 0);
  const candidates = candidatesFromHeaders(headers, parties, indexes);
  let countyName = "";
  const rows = [];
  for (const row of matrix.slice(headerIndex + 1)) {
    if (clean(row[1])) countyName = clean(row[1]);
    const label = clean(row[2]);
    if (!/^(TOWN|VILLAGE|CITY) OF /i.test(label)) continue;
    rows.push(resultRow({ spec, countyName, reportingUnitLabel: label, candidates, values: row, total: row[3] }));
  }
  assertUniqueResults(rows, spec.year);
  return { rows, candidates: candidates.map(({ name, party }) => ({ name, party })) };
}

export function parseWisconsinOfficialResults(year, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const base = WISCONSIN_YEAR_SPECS[Number(year)];
  if (!base) throw new Error(`unsupported Wisconsin year ${year}`);
  const spec = { ...base, counties: countyMaps(root) };
  const bytes = readFileSync(absolute(root, spec.resultPath));
  const parsed = spec.year === 2012 ? parse2012Workbook(bytes, spec) : spec.year === 2024 ? parse2024Workbook(bytes, spec) : parseModernWorkbook(bytes, spec);
  const totalVotes = parsed.rows.reduce((sum, row) => sum + row.total, 0);
  if (parsed.rows.length !== spec.expected.sourceUnits || totalVotes !== spec.expected.totalVotes) {
    throw new Error(`${spec.year} official result universe changed: ${parsed.rows.length}/${totalVotes}`);
  }
  return { ...parsed, totalVotes, spec };
}

function featureId(year, parentGeoid, identity, prefix = "result") {
  return `wi:${year}:${parentGeoid}:${prefix}-${sha256(Buffer.from(identity)).slice(0, 18)}`;
}

function geometryFeature({ year, parentGeoid, identity, displayName, sourceIds, geometry, noData = false }) {
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: featureId(year, parentGeoid, identity, noData ? "no-data" : "result"),
      CRM_PARENT_GEOID: parentGeoid,
      CRM_SOURCE_UNIT_ID: identity,
      SOURCE_NAME: displayName,
      SOURCE_GEOMETRY_IDS: sourceIds,
      CRM_NO_DATA: noData,
    },
    geometry,
  };
}

function vest2016Features(collection) {
  const mcdLabels = new Map(collection.features.flatMap((feature) => {
    const p = feature.properties ?? {};
    return p.MCD_FIPS && p.NAME && p.LSAD ? [[String(p.MCD_FIPS), { name: p.NAME, lsad: String(p.LSAD) }]] : [];
  }));
  return collection.features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      CRM_NAME: feature.properties?.NAME || mcdLabels.get(String(feature.properties?.MCD_FIPS))?.name || "",
      CRM_CTV: ({ "25": "C", "43": "T", "47": "V" })[String(feature.properties?.LSAD || mcdLabels.get(String(feature.properties?.MCD_FIPS))?.lsad)] ?? "",
    },
  }));
}

async function buildVestModel(official, root) {
  const { spec } = official;
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection") throw new Error(`${spec.year} VEST source is not a FeatureCollection`);
  const sourceFeatures = spec.year === 2016 ? vest2016Features(collection) : collection.features;
  const relationships = resolveWisconsinWardRelationships({
    resultRows: official.rows.map((row) => ({ ...row, municipalityName: row.reportingUnitLabel.replace(/\s+WARDS?.*$/i, "") })),
    sourceFeatures,
    fields: spec.year === 2016 ? {
      countyName: "CNTY_NAME", countyFips: "CNTY_FIPS", ctv: "CRM_CTV", municipalityName: "CRM_NAME", wardId: "STR_WARDS", featureId: "GEOID",
    } : {
      countyName: "CNTY_NAME", countyFips: "CNTY_FIPS", ctv: "CTV", municipalityName: "MCD_NAME", wardId: (properties) => String(properties.GEOID).slice(-4), featureId: "GEOID",
    },
    aliases: spec.year === 2016 ? { ...BASE_ALIASES, "Winnebago|T|Menasha": "V|Menasha" } : { ...BASE_ALIASES, "Waukesha|V|Vernon": "T|Vernon", "Waukesha|V|Waukesha": "T|Waukesha" },
    resultWardOverrides: spec.year === 2016 ? REVIEW_OVERRIDES_2016 : REVIEW_OVERRIDES_2020,
    sourceWardOverrides: spec.year === 2020 ? { "5505939225001": "16" } : {},
    requireComplete: false,
    requireAllSourceFeatures: false,
  });
  if (relationships.summary.missingSourceGroups || relationships.summary.noExactCoverGroups || relationships.summary.ambiguousGroups) {
    throw new Error(`${spec.year} Wisconsin review has unresolved group ambiguity`);
  }
  const mappedByResultIndex = new Map();
  const features = [];
  for (const relationship of relationships.resolved) {
    const row = official.rows[relationship.row.index];
    const normalized = geometryFeature({
      year: spec.year,
      parentGeoid: row.parentGeoid,
      identity: row.sourceUnitId,
      displayName: row.reportingUnitLabel,
      sourceIds: relationship.components.map((component) => component.featureId).sort(),
      geometry: unionWisconsinWardGeometries(relationship.components.map((component) => component.feature.geometry)),
    });
    features.push(normalized);
    mappedByResultIndex.set(relationship.row.index, { feature: normalized, relationship });
  }
  for (const source of relationships.diagnostics.unassignedSourceFeatures) {
    features.push(geometryFeature({
      year: spec.year,
      parentGeoid: source.countyFips,
      identity: `source-${source.featureId}`,
      displayName: `${source.municipalityName} ward ${source.wardId}`,
      sourceIds: [source.featureId],
      geometry: source.feature.geometry,
      noData: true,
    }));
  }
  return { rawFeatureCount: collection.features.length, features, mappedByResultIndex, diagnostics: relationships.diagnostics, relationshipSummary: relationships.summary };
}

function build2024Model(official, root) {
  const { spec } = official;
  const collection = JSON.parse(gunzipSync(readFileSync(absolute(root, spec.geometryPath))));
  if (collection?.type !== "FeatureCollection") throw new Error("2024 NYT source is not a FeatureCollection");
  const resultsByKey = new Map(official.rows.map((row, index) => [`${row.parentGeoid}|${normalizeWisconsinLabel(row.reportingUnitLabel)}`, { row, index }]));
  const mappedByResultIndex = new Map();
  const features = [];
  for (const feature of collection.features) {
    const properties = feature.properties ?? {};
    if (properties.official_boundary !== true) throw new Error("2024 NYT source contains a non-official-boundary feature");
    const sourceGeoid = clean(properties.GEOID);
    const match = sourceGeoid.match(/^(55\d{3})-(.+)$/);
    const result = match ? resultsByKey.get(`${match[1]}|${normalizeWisconsinLabel(match[2])}`) : null;
    if (!result || mappedByResultIndex.has(result.index)) throw new Error(`2024 NYT geometry lacks a unique official result match for ${sourceGeoid}`);
    if (integer(properties.votes_dem, sourceGeoid) !== result.row.democratic || integer(properties.votes_rep, sourceGeoid) !== result.row.republican) {
      throw new Error(`2024 NYT major-party join signature differs from official WEC values for ${sourceGeoid}`);
    }
    const normalized = geometryFeature({ year: 2024, parentGeoid: result.row.parentGeoid, identity: result.row.sourceUnitId, displayName: result.row.reportingUnitLabel, sourceIds: [sourceGeoid], geometry: feature.geometry });
    features.push(normalized);
    mappedByResultIndex.set(result.index, { feature: normalized, relationship: { method: "reviewed_exact_parent_label_and_vote_signature", reviewNote: "NYT official-boundary feature matches the official WEC row by county, complete reporting label, and exact Harris/Trump signature; only WEC candidate and total values are retained." } });
  }
  return { rawFeatureCount: collection.features.length, features, mappedByResultIndex, diagnostics: { unresolvedResultRows: official.rows.filter((_, index) => !mappedByResultIndex.has(index)) }, relationshipSummary: null };
}

function canonicalRows(official, geometryModel) {
  const crosswalkRows = [];
  const resultRows = [];
  const exclusions = [];
  for (const [index, row] of official.rows.entries()) {
    const mapping = geometryModel.mappedByResultIndex.get(index);
    const zeroWithoutGeometry = !mapping && row.total === 0;
    const isGeographic = Boolean(mapping) || !official.spec.reviewed;
    const reportingGrain = isGeographic ? WISCONSIN_GEOGRAPHY_LEVEL : "administrative_reporting_unit";
    const resultUnitCode = reportingUnitCode({ state: "WI", electionId: official.spec.electionId, reportingGrain, parentGeoid: row.parentGeoid, sourceUnitId: row.sourceUnitId });
    const relationships = mapping ? [{
      sourceFeatureId: `${row.parentGeoid}|${mapping.feature.properties.CRM_FEATURE_ID}`,
      relationshipType: "one_to_one",
      matchMethod: mapping.relationship.method === "reviewed_explicit_ward_override" ? "spatial_review" : "reviewed_name",
      reviewStatus: "reviewed",
      confidence: "high",
      note: mapping.relationship.reviewNote ?? "Reviewed county/municipality ward partition; complete official WEC row attached without vote allocation.",
    }] : [{
      sourceFeatureId: null,
      relationshipType: official.spec.reviewed ? "non_geographic" : "unmatched",
      matchMethod: official.spec.reviewed ? "exact_official_id" : "normalized_name_candidate",
      reviewStatus: official.spec.reviewed ? "reviewed" : "pending",
      confidence: official.spec.reviewed ? "high" : "low",
      note: zeroWithoutGeometry ? "Official zero-vote reporting unit has no corresponding reviewed geometry and remains a no-geometry reconciliation row." : "No election-date-safe result-to-geometry relationship is approved.",
    }];
    const crosswalkRow = { resultUnitCode, sourceUnitId: row.sourceUnitId, sourceDisplayName: row.reportingUnitLabel, parentGeoid: row.parentGeoid, reportingGrain, isGeographic, relationships };
    const result = { resultUnitCode, sourceUnitId: row.sourceUnitId, sourceDisplayName: row.reportingUnitLabel, parentGeoid: row.parentGeoid, democratic: row.democratic, republican: row.republican, other: row.other, total: row.total, candidateVotes: row.candidateVotes };
    crosswalkRows.push(crosswalkRow);
    if (mapping) resultRows.push(result);
    else exclusions.push({ ...result, reason: zeroWithoutGeometry ? "official zero-vote unit without reviewed geometry" : "2012 election-date-safe geometry unavailable" });
  }
  return { crosswalkRows, resultRows, exclusions };
}

function assertExpected(model) {
  const { spec } = model.official;
  const actual = {
    sourceUnits: model.official.rows.length,
    sourceFeatures: model.geometryModel.rawFeatureCount,
    mappedUnits: model.rows.resultRows.length,
    excludedZeroUnits: model.rows.exclusions.filter((row) => row.total === 0).length,
    noDataFeatures: model.geometry.features.filter((feature) => feature.properties.CRM_NO_DATA).length,
    normalizedFeatures: model.geometry.features.length,
    totalVotes: model.official.totalVotes,
  };
  for (const [key, expected] of Object.entries(spec.expected)) if (actual[key] !== expected) throw new Error(`${spec.year} ${key} expected ${expected}, received ${actual[key]}`);
  if (spec.reviewed && model.rows.resultRows.reduce((sum, row) => sum + row.total, 0) !== spec.expected.totalVotes) throw new Error(`${spec.year} mapped official totals do not reconcile`);
}

export async function buildWisconsinReviewedModel(year, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const official = parseWisconsinOfficialResults(year, { root });
  if (!official.spec.reviewed) {
    const model = {
      official,
      geometryModel: { rawFeatureCount: 0, mappedByResultIndex: new Map(), features: [], diagnostics: {} },
      geometry: { type: "FeatureCollection", properties: { state: "WI", electionId: official.spec.electionId, geographyLevel: WISCONSIN_GEOGRAPHY_LEVEL }, features: [] },
      rows: canonicalRows(official, { mappedByResultIndex: new Map() }),
    };
    assertExpected(model);
    return model;
  }
  const geometryModel = official.spec.year === 2024 ? build2024Model(official, root) : await buildVestModel(official, root);
  const geometry = {
    type: "FeatureCollection",
    properties: {
      state: "WI",
      electionId: official.spec.electionId,
      geographyLevel: WISCONSIN_GEOGRAPHY_LEVEL,
      sourceVoteFieldsRetained: false,
      resultAllocationPerformed: false,
    },
    features: geometryModel.features.sort((left, right) => left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID)),
  };
  const model = { official, geometryModel, geometry, rows: canonicalRows(official, geometryModel) };
  assertExpected(model);
  return model;
}

export function summarizeWisconsinModel(model) {
  return {
    year: model.official.spec.year,
    sourceResultUnits: model.official.rows.length,
    sourceGeometryFeatures: model.geometryModel.rawFeatureCount,
    normalizedFeatures: model.geometry.features.length,
    mappedResultUnits: model.rows.resultRows.length,
    excludedResultUnits: model.rows.exclusions.length,
    noDataFeatures: model.geometry.features.filter((feature) => feature.properties.CRM_NO_DATA).length,
    officialVotes: model.official.totalVotes,
    mappedVotes: model.rows.resultRows.reduce((sum, row) => sum + row.total, 0),
  };
}

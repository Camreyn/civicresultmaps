import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";
import shp from "shpjs";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";

export const FLORIDA_REVIEWED_AT = "2026-08-16T12:00:00.000Z";

export const FLORIDA_PRECINCT_YEAR_SPECS = Object.freeze({
  2012: {
    year: 2012,
    date: "2012-11-06",
    electionId: "2012-11-06-general",
    manifestId: "fl-2012-11-06-precinct-geometry-unavailable-v1",
    base: "data/precinct-geometry/FL/2012-11-06-general",
    resultSourceId: "fl-dos-2012-general-precinct-results",
    resultPath: "data/precinct-geometry/FL/2012-11-06-general/raw/florida-dos/fl-2012-general-precinct-results.zip",
    geometryPath: "data/precinct-geometry/FL/2012-11-06-general/raw/us-census/tl_2012_12_vtd10.zip",
    geometryKind: "blocked_census_diagnostic",
    resultSourceUrl: "https://dos.fl.gov/media/697204/precinctlevelelectionresults2012gen.zip",
    geometrySourceUrl: "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_12_vtd10.zip",
    rowLevelSafe: false,
  },
  2016: {
    year: 2016,
    date: "2016-11-08",
    electionId: "2016-11-08-general",
    manifestId: "fl-2016-11-08-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/FL/2016-11-08-general",
    resultSourceId: "fl-dos-2016-general-precinct-results",
    resultPath: "data/precinct-geometry/FL/2016-11-08-general/raw/florida-dos/fl-2016-general-precinct-results.zip",
    geometryPath: "data/precinct-geometry/FL/2016-11-08-general/raw/vest/fl_2016.zip",
    geometryKind: "vest_2016",
    resultSourceUrl: "https://dos.fl.gov/media/697454/precinctlevelelectionresults2016gen.zip",
    geometrySourceUrl: "https://doi.org/10.7910/DVN/NH5S2I/IAELIN",
    rowLevelSafe: true,
  },
  2020: {
    year: 2020,
    date: "2020-11-03",
    electionId: "2020-11-03-general",
    manifestId: "fl-2020-11-03-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/FL/2020-11-03-general",
    resultSourceId: "fl-dos-2020-general-precinct-results",
    resultPath: "data/precinct-geometry/FL/2020-11-03-general/raw/florida-dos/fl-2020-general-precinct-results.zip",
    geometryPath: "data/precinct-geometry/FL/2020-11-03-general/raw/vest/fl_2020.zip",
    geometryKind: "vest_2020",
    resultSourceUrl: "https://fldoswebumbracoprod.blob.core.windows.net/media/703763/2020-general-election-rev.zip",
    geometrySourceUrl: "https://dataverse.harvard.edu/file.xhtml?fileId=4938250&version=24.0",
    rowLevelSafe: true,
  },
  2024: {
    year: 2024,
    date: "2024-11-05",
    electionId: "2024-11-05-general",
    manifestId: "fl-2024-11-05-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/FL/2024-11-05-general",
    resultSourceId: "fl-dos-2024-general-precinct-results",
    resultPath: "data/fl-2024-general-precinct-results.zip",
    geometryPath: "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/FL-precincts-with-results.geojson.gz",
    geometryKind: "nyt_2024",
    resultSourceUrl: "https://dos.fl.gov/media/708761/2024-gen-outputofficial1.zip",
    geometrySourceUrl: "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/FL-precincts-with-results.geojson.gz",
    rowLevelSafe: true,
  },
});

export const FLORIDA_RAW_SOURCE_PINS = Object.freeze({
  "data/fl-2024-general-precinct-results.zip": [4_915_683, "1a954b8bf9e261e2eb11443b016f55c87a52f69a1778ba1d5e7d229cddd79856"],
  "data/fl-counties.geojson": [8_535_683, "34865353a489a7bd608dda382073e71918079674f8b9ed1c06ff337e64bf0217"],
  "data/precinct-geometry/FL/2012-11-06-general/raw/florida-dos/fl-2012-general-precinct-results.zip": [5_085_954, "97a7c28ef2b5cbfed449b32c43f0abd29b4914728ac32daf2a73ae8597456ca0"],
  "data/precinct-geometry/FL/2012-11-06-general/raw/us-census/tl_2012_12_vtd10.zip": [17_577_732, "836cbef456142af8af160ede65ad0716044a88f305832f0c20de26453a7d305b"],
  "data/precinct-geometry/FL/2016-11-08-general/raw/florida-dos/fl-2016-general-precinct-results.zip": [4_952_971, "0d9b6ee46f9c5b4399b8909a3df91d8cc270c0b8daaf0589e515c69160d35657"],
  "data/precinct-geometry/FL/2016-11-08-general/raw/vest/fl_2016.zip": [23_080_142, "bec5cbc12cc4294f2ccd1c7767a5a99dce15046b5f04c778b890317959ee052e"],
  "data/precinct-geometry/FL/2016-11-08-general/raw/review/fl_vest_16_validation_report.pdf": [133_824, "f02a6639c310b9de2c94147154e6a6e5bc8a43fca343684e10facc3474266b1f"],
  "data/precinct-geometry/FL/2020-11-03-general/raw/florida-dos/fl-2020-general-precinct-results.zip": [4_531_765, "6bc043f551c4100ebcf8537f7fd7d547a1ba992c7cd6f11d2ccc0e9aedab7034"],
  "data/precinct-geometry/FL/2020-11-03-general/raw/vest/fl_2020.zip": [21_074_653, "a2e1a068cdbda507bdc38087de311a143feef0f79fa4992aed875cd8477d8bdb"],
  "data/precinct-geometry/FL/2020-11-03-general/raw/review/fl_vest_20_validation_report.pdf": [92_044, "0bbb2cbc2a7a15dcbf7ff2db0a70fd375fe7b1fc7c365b66d3cb671e4ede5ff6"],
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/FL-precincts-with-results.geojson.gz": [39_181_599, "b1a4cbd68c0f3137e37c5504ffcae9210b691f3b108950b246e8f37a605c145d"],
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/FL-precincts-with-results.csv.gz": [71_286, "587c909d8311542dce061f70495a815c3c3491fddf08bd3498bd3d4118d9d413"],
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/README.md": [49_879, "987ea44ab04c77182d335670207dac88f7114f3ae02675ea5d7076e581ffccdf"],
  "data/precinct-geometry/FL/2024-11-05-general/raw/nyt/LICENSE": [4_106, "77e8635500262b129a50772647773c2c66d812902aba6ac13bdb2bab14fd59c2"],
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function absolute(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

export function verifyFloridaRawSources(root, targetYear = null) {
  for (const [relativePath, [expectedBytes, expectedSha256]] of Object.entries(FLORIDA_RAW_SOURCE_PINS)) {
    if (
      targetYear !== null
      && relativePath !== "data/fl-counties.geojson"
      && !(targetYear === 2024 && relativePath === "data/fl-2024-general-precinct-results.zip")
      && !relativePath.includes("/" + FLORIDA_PRECINCT_YEAR_SPECS[targetYear].electionId + "/")
    ) continue;
    const bytes = readFileSync(absolute(root, relativePath));
    if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) {
      throw new Error("Florida raw source drifted before derived writes: " + relativePath);
    }
  }
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/^\uFEFF/, "").trim();
}

function canonicalCountyName(value) {
  return clean(value).replace(/\bCounty\b/gi, "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

export function canonicalFloridaPrecinctId(value) {
  let normalized = clean(value).toUpperCase().replace(/\s+/g, " ");
  normalized = normalized.replace(/\s*(?:\+|&)\s*/g, "&");
  normalized = normalized.replace(/^0+(?=\d)/, "");
  normalized = normalized.replace(/\.0+$/, "");
  return normalized;
}

function finiteInteger(value, context) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(context + " is not a nonnegative integer: " + JSON.stringify(value));
  return parsed;
}

function buildCountyMaps(root) {
  const collection = JSON.parse(readFileSync(absolute(root, "data/fl-counties.geojson"), "utf8"));
  if (collection?.type !== "FeatureCollection" || collection.features?.length !== 67) {
    throw new Error("Florida county geometry must contain exactly 67 counties");
  }
  const byName = new Map();
  const byGeoid = new Map();
  for (const feature of collection.features) {
    const name = clean(feature.properties?.BASENAME ?? feature.properties?.NAME).replace(/ County$/i, "");
    const geoid = clean(feature.properties?.GEOID);
    if (!name || !/^12\d{3}$/.test(geoid)) throw new Error("Florida county parent identity is invalid");
    const county = { name, geoid };
    byName.set(canonicalCountyName(name), county);
    byGeoid.set(geoid, county);
  }
  return { byName, byGeoid };
}

function presidentialContest(value) {
  return /^(?:President of the United States|President and Vice President)$/i.test(clean(value));
}

function candidateCategory(candidate, party) {
  const normalizedCandidate = clean(candidate);
  const normalizedParty = clean(party).toUpperCase();
  if (/^(?:OverVotes|UnderVotes)$/i.test(normalizedCandidate)) return "administrative";
  if (normalizedParty === "DEM") return "democratic";
  if (normalizedParty === "REP") return "republican";
  return "other";
}

const REVIEWED_2016_PAL_DUPLICATE_IDS = new Set([
  "1173", "1189", "1247", "2081", "2083", "2097", "2116", "2126", "4129", "5003", "5007",
  "5018", "5055", "5112", "5113", "5115", "5117", "5119", "6029", "6207", "7149",
]);

function rawResultKey(countyCode, sourceUnitId) {
  return clean(countyCode).toUpperCase() + "|" + canonicalFloridaPrecinctId(sourceUnitId);
}

function resultUnitCodeFor(spec, row, reportingGrain = "precinct") {
  return reportingUnitCode({
    state: "FL",
    electionId: spec.electionId,
    reportingGrain,
    parentGeoid: row.parentGeoid,
    sourceUnitId: row.sourceUnitId,
  });
}

function summarizeVotes(rows) {
  return rows.reduce((sum, row) => ({
    democratic: sum.democratic + row.democratic,
    republican: sum.republican + row.republican,
    other: sum.other + row.other,
    total: sum.total + row.total,
  }), { democratic: 0, republican: 0, other: 0, total: 0 });
}

export async function parseFloridaOfficialResults(root, spec) {
  const countyMaps = buildCountyMaps(root);
  const archive = await JSZip.loadAsync(readFileSync(absolute(root, spec.resultPath)));
  const members = Object.values(archive.files).filter((entry) => !entry.dir && /_PctResults.*\.txt$/i.test(entry.name));
  if (members.length < 67) throw new Error("Florida " + spec.year + " archive does not retain the expected county files");
  const rawUnits = new Map();
  const countyCodes = new Map();
  let presidentSourceRows = 0;
  let duplicateCandidateRows = 0;

  for (const member of members.sort((left, right) => left.name.localeCompare(right.name))) {
    const text = (await member.async("string")).replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const columns = line.split("\t");
      if (columns.length < 19 || !presidentialContest(columns[11])) continue;
      presidentSourceRows += 1;
      const countyCode = clean(columns[0]).toUpperCase();
      const countySourceName = clean(columns[1]);
      const county = countyMaps.byName.get(canonicalCountyName(countySourceName));
      if (!/^[A-Z]{3}$/.test(countyCode) || !county) {
        throw new Error("Florida " + spec.year + " result has invalid county identity " + countyCode + " / " + countySourceName);
      }
      const knownCounty = countyCodes.get(countyCode);
      if (knownCounty && knownCounty.geoid !== county.geoid) throw new Error("Florida county abbreviation collision: " + countyCode);
      countyCodes.set(countyCode, county);
      const sourceUnitId = clean(columns[5]);
      if (!sourceUnitId) throw new Error("Florida " + spec.year + " result has a blank precinct identity");
      const key = rawResultKey(countyCode, sourceUnitId);
      const unit = rawUnits.get(key) ?? {
        rawKey: key,
        countyCode,
        countyName: county.name,
        parentGeoid: county.geoid,
        sourceUnitId,
        canonicalId: canonicalFloridaPrecinctId(sourceUnitId),
        sourceLocations: new Set(),
        registeredVoters: new Set(),
        candidateRows: new Map(),
        administrativeVotes: { over: 0, under: 0 },
      };
      unit.sourceLocations.add(clean(columns[6]));
      unit.registeredVoters.add(finiteInteger(columns[7], "Florida registered voters"));
      const candidate = clean(columns[14]);
      const party = clean(columns[15]).toUpperCase();
      const votes = finiteInteger(columns[18], "Florida candidate votes");
      const category = candidateCategory(candidate, party);
      const reviewedPalmBeachDuplicate = spec.year === 2016
        && countyCode === "PAL"
        && REVIEWED_2016_PAL_DUPLICATE_IDS.has(canonicalFloridaPrecinctId(sourceUnitId));
      if (category === "administrative") {
        const field = /^OverVotes$/i.test(candidate) ? "over" : "under";
        const previous = unit.administrativeVotes[field];
        if (reviewedPalmBeachDuplicate && previous === votes) duplicateCandidateRows += 1;
        else unit.administrativeVotes[field] += votes;
      } else {
        const candidateKey = party + "|" + candidate.normalize("NFKC").toUpperCase();
        const previous = unit.candidateRows.get(candidateKey);
        if (previous) {
          if (previous.category !== category) throw new Error("Florida duplicate candidate category drift: " + key + " / " + candidateKey);
          if (reviewedPalmBeachDuplicate && previous.votes === votes) duplicateCandidateRows += 1;
          else previous.votes += votes;
        } else {
          unit.candidateRows.set(candidateKey, { candidate, party, votes, category });
        }
      }
      rawUnits.set(key, unit);
    }
  }

  if (countyCodes.size !== 67) throw new Error("Florida " + spec.year + " official result archive did not resolve all 67 counties");
  const rows = [...rawUnits.values()].map((unit) => {
    const candidates = [...unit.candidateRows.values()].sort((left, right) => (left.party + "|" + left.candidate).localeCompare(right.party + "|" + right.candidate));
    const democratic = candidates.filter((row) => row.category === "democratic").reduce((sum, row) => sum + row.votes, 0);
    const republican = candidates.filter((row) => row.category === "republican").reduce((sum, row) => sum + row.votes, 0);
    const other = candidates.filter((row) => row.category === "other").reduce((sum, row) => sum + row.votes, 0);
    return {
      rawKey: unit.rawKey,
      countyCode: unit.countyCode,
      countyName: unit.countyName,
      parentGeoid: unit.parentGeoid,
      sourceUnitId: unit.sourceUnitId,
      canonicalId: unit.canonicalId,
      sourceDisplayName: [...unit.sourceLocations].filter(Boolean).sort().join(" / ") || unit.sourceUnitId,
      registeredVoters: [...unit.registeredVoters].sort((left, right) => left - right),
      candidates,
      democratic,
      republican,
      other,
      total: democratic + republican + other,
      administrativeVotes: unit.administrativeVotes,
      sourceComponentUnitIds: [unit.sourceUnitId],
    };
  }).sort((left, right) => left.rawKey.localeCompare(right.rawKey));
  const rawKeys = new Set(rows.map((row) => row.rawKey));
  if (rawKeys.size !== rows.length) throw new Error("Florida official result identities are not unique");
  return {
    year: spec.year,
    rows,
    totals: summarizeVotes(rows),
    sourceUnitCount: rows.length,
    zeroVoteUnitCount: rows.filter((row) => row.total === 0).length,
    presidentSourceRows,
    duplicateCandidateRows,
    countyCodes,
  };
}

function multiPolygonCoordinates(geometry, context) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(context + " is not polygonal");
}

function geometryFromMultiPolygon(coordinates, context) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error(context + " produced empty geometry");
  return coordinates.length === 1
    ? { type: "Polygon", coordinates: coordinates[0] }
    : { type: "MultiPolygon", coordinates };
}

function unionGeometries(features, context) {
  if (features.length === 1) return features[0].geometry;
  const coordinates = features.flatMap((feature) => multiPolygonCoordinates(feature.geometry, context));
  return geometryFromMultiPolygon(coordinates, context);
}

function aggregateOfficialRows(rows, options) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Cannot aggregate an empty Florida result component set");
  const parentGeoid = rows[0].parentGeoid;
  const countyCode = rows[0].countyCode;
  if (rows.some((row) => row.parentGeoid !== parentGeoid || row.countyCode !== countyCode)) {
    throw new Error("Florida result aggregation cannot cross county boundaries");
  }
  const sourceUnitId = clean(options.sourceUnitId);
  const democratic = rows.reduce((sum, row) => sum + row.democratic, 0);
  const republican = rows.reduce((sum, row) => sum + row.republican, 0);
  const other = rows.reduce((sum, row) => sum + row.other, 0);
  return {
    rawKey: rawResultKey(countyCode, sourceUnitId),
    countyCode,
    countyName: rows[0].countyName,
    parentGeoid,
    sourceUnitId,
    canonicalId: canonicalFloridaPrecinctId(sourceUnitId),
    sourceDisplayName: clean(options.sourceDisplayName) || rows.map((row) => row.sourceDisplayName).filter(Boolean).join(" / ") || sourceUnitId,
    registeredVoters: [...new Set(rows.flatMap((row) => row.registeredVoters))].sort((left, right) => left - right),
    candidates: [],
    democratic,
    republican,
    other,
    total: democratic + republican + other,
    administrativeVotes: {
      over: rows.reduce((sum, row) => sum + row.administrativeVotes.over, 0),
      under: rows.reduce((sum, row) => sum + row.administrativeVotes.under, 0),
    },
    sourceComponentUnitIds: rows.map((row) => row.sourceUnitId).sort(),
  };
}

function floridaFeatureId(year, parentGeoid, sourceUnitId) {
  return "fl:" + year + ":" + parentGeoid + ":" + encodeURIComponent(canonicalFloridaPrecinctId(sourceUnitId).toLowerCase());
}

function normalizedFeature(spec, source, result, geometry, method, extra = {}) {
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: floridaFeatureId(spec.year, result.parentGeoid, result.sourceUnitId),
      CRM_PARENT_GEOID: result.parentGeoid,
      SOURCE_NAME: result.sourceDisplayName,
      SOURCE_COMPONENT_COUNT: source.componentIds.length,
      SOURCE_COMPONENT_IDS: source.componentIds.join("|"),
      SOURCE_GEOMETRY_AUTHORITY: source.authority,
      SOURCE_GEOMETRY_METHOD: method,
      ...extra,
    },
    geometry,
  };
}

function forbiddenElectionProperties(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => forbiddenElectionProperties(child, context + "[" + index + "]"));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:G\d{2}|VOTES?|TOTALVOTES?|CANDIDATE|PARTY|PCT_DEM|PCT_REP)/i.test(key)) {
      throw new Error(context + " retained election-value property " + key);
    }
    forbiddenElectionProperties(child, context + "." + key);
  }
}

function officialIndex(official) {
  const index = new Map();
  for (const row of official.rows) {
    const key = rawResultKey(row.countyCode, row.sourceUnitId);
    if (index.has(key)) throw new Error("Florida official normalized identity is duplicated: " + key);
    index.set(key, row);
  }
  return index;
}

function sourceRecord(spec, countyCode, sourceUnitId, features, componentIds, authority, sourceName = null) {
  const canonicalId = canonicalFloridaPrecinctId(sourceUnitId);
  if (!canonicalId || !Array.isArray(features) || features.length === 0) throw new Error("Invalid Florida source geometry identity");
  return {
    spec,
    countyCode,
    sourceUnitId: clean(sourceUnitId),
    canonicalId,
    features,
    componentIds: componentIds.map((value) => clean(value)),
    authority,
    sourceName: clean(sourceName) || clean(sourceUnitId),
  };
}

function officialVoteSignature(row) {
  return [row.democratic, row.republican, row.other, row.total].join("|");
}

function vest2016VoteSignature(feature) {
  const properties = feature.properties ?? {};
  const democratic = finiteInteger(properties.G16PREDCLI, "Florida 2016 VEST Democratic votes");
  const republican = finiteInteger(properties.G16PRERTRU, "Florida 2016 VEST Republican votes");
  const other = ["G16PRELJOH", "G16PRECCAS", "G16PREGSTE", "G16PREIDEL", "G16PREOWRI"]
    .reduce((sum, field) => sum + finiteInteger(properties[field], "Florida 2016 VEST " + field), 0);
  return [democratic, republican, other, democratic + republican + other].join("|");
}

function vest2016CombinedSignature(features) {
  const values = features.map((feature) => vest2016VoteSignature(feature).split("|").map(Number));
  return values.reduce((sum, current) => sum.map((value, index) => value + current[index]), [0, 0, 0, 0]).join("|");
}

function mappedFeature(spec, source, row, method, extra = {}) {
  const geometry = unionGeometries(source.features, "Florida " + spec.year + " " + source.countyCode + " " + source.sourceUnitId);
  const feature = normalizedFeature(spec, source, row, geometry, method, extra);
  forbiddenElectionProperties(feature.properties, "Florida " + spec.year + " normalized feature properties");
  return feature;
}

function noDataFeature(spec, source, county, reason, extra = {}) {
  const placeholder = {
    parentGeoid: county.geoid,
    sourceUnitId: source.sourceUnitId,
    sourceDisplayName: source.sourceName,
  };
  return mappedFeature(spec, source, placeholder, "reviewed_no_data", {
    SOURCE_NO_DATA_REASON: reason,
    ...extra,
  });
}

const FLORIDA_2016_ALIASES = Object.freeze({
  "PUT|35": "31",
  "HAR|10": "18",
  "HAR|7": "15",
  "HAR|9": "17",
  "WAS|17": "14",
  "WAS|19": "16",
});

const FLORIDA_2016_UNION_GROUPS = Object.freeze({
  "1A&1B": ["1A", "1B"],
  "2A&2B": ["2A", "2B"],
  "3A&3B": ["3A", "3B"],
  "4A&4C": ["4A", "4C"],
  "5A&5C": ["5A", "5C"],
});

async function build2016Geometry(root, spec, official) {
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection" || collection.features?.length !== 5_967) {
    throw new Error("Florida 2016 VEST geometry must contain exactly 5,967 features");
  }
  const bySourceKey = new Map();
  for (const [index, feature] of collection.features.entries()) {
    const countyCode = clean(feature.properties?.county).toUpperCase();
    const sourceUnitId = clean(feature.properties?.pct);
    const key = rawResultKey(countyCode, sourceUnitId);
    if (!official.countyCodes.has(countyCode) || !sourceUnitId || bySourceKey.has(key)) {
      throw new Error("Florida 2016 VEST source identity is invalid or duplicated at feature " + index + ": " + key);
    }
    bySourceKey.set(key, sourceRecord(spec, countyCode, sourceUnitId, [feature], [sourceUnitId], "Voting and Election Science Team (VEST) V1.2 geometry reconstruction"));
  }

  const sources = [];
  const consumedUnionComponents = new Set();
  for (const [combinedId, componentIds] of Object.entries(FLORIDA_2016_UNION_GROUPS)) {
    const components = componentIds.map((componentId) => {
      const key = rawResultKey("UNI", componentId);
      const source = bySourceKey.get(key);
      if (!source) throw new Error("Florida 2016 Union reviewed component is missing: " + componentId);
      consumedUnionComponents.add(key);
      return source;
    });
    sources.push(sourceRecord(
      spec,
      "UNI",
      combinedId.replace(/&/g, " & "),
      components.flatMap((source) => source.features),
      componentIds,
      "Voting and Election Science Team (VEST) V1.2 geometry reconstruction",
      combinedId.replace(/&/g, " & "),
    ));
  }
  for (const [key, source] of bySourceKey) {
    if (!consumedUnionComponents.has(key)) sources.push(source);
  }

  const officialByKey = officialIndex(official);
  const usedOfficial = new Set();
  const mappedRows = [];
  const features = [];
  const noDataFeatures = [];
  const methods = { exactOfficialId: 0, reviewedVoteAlias: 0, reviewedSourceUnion: 0 };

  for (const source of sources.sort((left, right) => (left.countyCode + "|" + left.canonicalId).localeCompare(right.countyCode + "|" + right.canonicalId))) {
    const county = official.countyCodes.get(source.countyCode);
    const sourceKey = source.countyCode + "|" + source.canonicalId;
    const aliasId = FLORIDA_2016_ALIASES[sourceKey] ?? null;
    const targetKey = rawResultKey(source.countyCode, aliasId ?? source.sourceUnitId);
    const row = officialByKey.get(targetKey) ?? null;
    if (!row || usedOfficial.has(row.rawKey)) {
      const feature = noDataFeature(spec, source, county, row ? "official_result_already_consumed" : "no_reviewed_official_result_relationship");
      features.push(feature);
      noDataFeatures.push(feature.properties.CRM_FEATURE_ID);
      continue;
    }
    let method = "exact_official_id";
    if (source.countyCode === "UNI" && source.componentIds.length === 2) {
      if (vest2016CombinedSignature(source.features) !== officialVoteSignature(row)) {
        throw new Error("Florida 2016 Union source-component sum does not equal the official result: " + source.sourceUnitId);
      }
      method = "reviewed_source_union";
      methods.reviewedSourceUnion += 1;
    } else if (aliasId) {
      if (vest2016VoteSignature(source.features[0]) !== officialVoteSignature(row)) {
        throw new Error("Florida 2016 reviewed source alias vote vector drifted: " + sourceKey + " -> " + aliasId);
      }
      method = "reviewed_vote_signature_alias";
      methods.reviewedVoteAlias += 1;
    } else {
      methods.exactOfficialId += 1;
    }
    usedOfficial.add(row.rawKey);
    const feature = mappedFeature(spec, source, row, method);
    features.push(feature);
    mappedRows.push({ row, feature, method, sourceComponentIds: source.componentIds });
  }

  const exclusions = official.rows.filter((row) => !usedOfficial.has(row.rawKey));
  features.sort((left, right) => left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID));
  mappedRows.sort((left, right) => left.row.rawKey.localeCompare(right.row.rawKey));
  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    exclusions,
    noDataFeatureIds: noDataFeatures.sort(),
    methods,
    sourceAuthority: "Voting and Election Science Team (VEST) V1.2 geometry reconstruction",
  };
}

function numericMiamiDadeComponentBase(value) {
  const normalized = canonicalFloridaPrecinctId(value);
  if (!/^\d+$/.test(normalized)) return null;
  return String(Math.floor(Number(normalized) / 10));
}

async function build2020Geometry(root, spec, official) {
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection" || collection.features?.length !== 6_010) {
    throw new Error("Florida 2020 VEST geometry must contain exactly 6,010 features");
  }
  const officialByKey = officialIndex(official);
  const officialMiamiDadeByBase = new Map();
  for (const row of official.rows.filter((candidate) => candidate.countyCode === "DAD")) {
    const base = numericMiamiDadeComponentBase(row.sourceUnitId);
    if (base === null) continue;
    const values = officialMiamiDadeByBase.get(base) ?? [];
    values.push(row);
    officialMiamiDadeByBase.set(base, values);
  }
  const usedOfficial = new Set();
  const mappedRows = [];
  const features = [];
  const noDataFeatures = [];
  const seenSourceKeys = new Set();
  const methods = { exactOfficialId: 0, officialComponentAggregation: 0 };

  for (const [index, sourceFeature] of collection.features.entries()) {
    const countyCode = clean(sourceFeature.properties?.county).toUpperCase();
    const sourceUnitId = clean(sourceFeature.properties?.precinct);
    const key = rawResultKey(countyCode, sourceUnitId);
    if (!official.countyCodes.has(countyCode) || !sourceUnitId || seenSourceKeys.has(key)) {
      throw new Error("Florida 2020 VEST source identity is invalid or duplicated at feature " + index + ": " + key);
    }
    seenSourceKeys.add(key);
    const source = sourceRecord(spec, countyCode, sourceUnitId, [sourceFeature], [sourceUnitId], "Voting and Election Science Team (VEST) V1.1 geometry reconstruction");
    const county = official.countyCodes.get(countyCode);
    let componentRows = [];
    let method = "exact_official_id";
    if (countyCode === "DAD") {
      componentRows = officialMiamiDadeByBase.get(canonicalFloridaPrecinctId(sourceUnitId)) ?? [];
      method = "official_source_component_aggregation";
    } else {
      const direct = officialByKey.get(key);
      componentRows = direct ? [direct] : [];
    }
    componentRows = componentRows.filter((row) => !usedOfficial.has(row.rawKey));
    if (componentRows.length === 0) {
      const feature = noDataFeature(spec, source, county, "no_reviewed_official_result_relationship");
      features.push(feature);
      noDataFeatures.push(feature.properties.CRM_FEATURE_ID);
      continue;
    }
    componentRows.forEach((row) => usedOfficial.add(row.rawKey));
    const row = componentRows.length === 1 && method === "exact_official_id"
      ? componentRows[0]
      : aggregateOfficialRows(componentRows, { sourceUnitId, sourceDisplayName: source.sourceName });
    if (method === "exact_official_id") methods.exactOfficialId += 1;
    else methods.officialComponentAggregation += 1;
    const feature = mappedFeature(spec, source, row, method);
    features.push(feature);
    mappedRows.push({ row, feature, method, sourceComponentIds: componentRows.map((entry) => entry.sourceUnitId) });
  }

  const exclusions = official.rows.filter((row) => !usedOfficial.has(row.rawKey));
  features.sort((left, right) => left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID));
  mappedRows.sort((left, right) => left.row.rawKey.localeCompare(right.row.rawKey));
  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    exclusions,
    noDataFeatureIds: noDataFeatures.sort(),
    methods,
    sourceAuthority: "Voting and Election Science Team (VEST) V1.1 geometry reconstruction",
  };
}

function nytSignature(row) {
  return [row.parentGeoid, row.democratic, row.republican, row.total].join("|");
}

function nytMajorSignature(row) {
  return [row.parentGeoid, row.democratic, row.republican].join("|");
}

function uniqueIndex(rows, signature) {
  const index = new Map();
  const ambiguous = new Set();
  for (const row of rows) {
    const key = signature(row);
    if (index.has(key)) ambiguous.add(key);
    else index.set(key, row);
  }
  for (const key of ambiguous) index.delete(key);
  return index;
}

async function build2024Geometry(root, spec, official) {
  const collection = JSON.parse(gunzipSync(readFileSync(absolute(root, spec.geometryPath))).toString("utf8"));
  if (collection?.type !== "FeatureCollection" || collection.features?.length !== 5_583) {
    throw new Error("Florida 2024 NYT geometry must contain exactly 5,583 features");
  }
  const officialByKey = officialIndex(official);
  const usedOfficial = new Set();
  const mappedRows = [];
  const features = [];
  const seenGeoids = new Set();
  const pending = [];
  const methods = { exactOfficialId: 0, officialComponentAggregation: 0, uniqueFullSignature: 0, uniqueMajorSignature: 0 };

  for (const [index, sourceFeature] of collection.features.entries()) {
    const properties = sourceFeature.properties ?? {};
    const geoid = clean(properties.GEOID);
    if (!/^12\d{3}-.+/.test(geoid) || seenGeoids.has(geoid)) throw new Error("Florida 2024 NYT GEOID is invalid or duplicated at feature " + index + ": " + geoid);
    seenGeoids.add(geoid);
    const parentGeoid = geoid.slice(0, 5);
    const countyCodeEntry = [...official.countyCodes.entries()].find(([, county]) => county.geoid === parentGeoid);
    if (!countyCodeEntry) throw new Error("Florida 2024 NYT feature has unknown county GEOID: " + geoid);
    const [countyCode, county] = countyCodeEntry;
    const sourceUnitId = geoid.slice(6).replace(new RegExp("^" + countyCode + "[-_]", "i"), "");
    const source = sourceRecord(spec, countyCode, sourceUnitId, [sourceFeature], [geoid], "New York Times 2024 election-specific precinct geometry", geoid);
    const sourceVotes = {
      parentGeoid,
      democratic: finiteInteger(properties.votes_dem, "Florida 2024 NYT Democratic votes"),
      republican: finiteInteger(properties.votes_rep, "Florida 2024 NYT Republican votes"),
      total: finiteInteger(properties.votes_total, "Florida 2024 NYT total votes"),
    };
    let componentRows = [];
    let method = "exact_official_id";
    if (countyCode === "CHA" && ["3", "6", "9"].includes(canonicalFloridaPrecinctId(sourceUnitId))) {
      const base = canonicalFloridaPrecinctId(sourceUnitId);
      componentRows = official.rows.filter((row) => row.countyCode === "CHA" && [base, base + ".1"].includes(row.canonicalId));
      method = "official_source_component_aggregation";
    } else {
      const direct = officialByKey.get(rawResultKey(countyCode, sourceUnitId));
      if (direct) componentRows = [direct];
    }
    componentRows = componentRows.filter((row) => !usedOfficial.has(row.rawKey));
    if (componentRows.length > 0) {
      componentRows.forEach((row) => usedOfficial.add(row.rawKey));
      const row = componentRows.length === 1 && method === "exact_official_id"
        ? componentRows[0]
        : aggregateOfficialRows(componentRows, { sourceUnitId, sourceDisplayName: source.sourceName });
      if (method === "exact_official_id") methods.exactOfficialId += 1;
      else methods.officialComponentAggregation += 1;
      const feature = mappedFeature(spec, source, row, method, { SOURCE_OFFICIAL_BOUNDARY: properties.official_boundary === true });
      features.push(feature);
      mappedRows.push({ row, feature, method, sourceComponentIds: componentRows.map((entry) => entry.sourceUnitId) });
    } else {
      pending.push({ source, sourceVotes, officialBoundary: properties.official_boundary === true, county });
    }
  }

  const remaining = () => official.rows.filter((row) => !usedOfficial.has(row.rawKey));
  for (const signatureKind of ["full", "major"]) {
    const index = uniqueIndex(remaining(), signatureKind === "full" ? nytSignature : nytMajorSignature);
    for (let pendingIndex = pending.length - 1; pendingIndex >= 0; pendingIndex -= 1) {
      const item = pending[pendingIndex];
      const key = signatureKind === "full"
        ? [item.sourceVotes.parentGeoid, item.sourceVotes.democratic, item.sourceVotes.republican, item.sourceVotes.total].join("|")
        : [item.sourceVotes.parentGeoid, item.sourceVotes.democratic, item.sourceVotes.republican].join("|");
      const row = index.get(key);
      if (!row || usedOfficial.has(row.rawKey)) continue;
      usedOfficial.add(row.rawKey);
      const method = signatureKind === "full" ? "unique_complete_official_vote_signature" : "unique_major_candidate_official_vote_signature";
      if (signatureKind === "full") methods.uniqueFullSignature += 1;
      else methods.uniqueMajorSignature += 1;
      const feature = mappedFeature(spec, item.source, row, method, { SOURCE_OFFICIAL_BOUNDARY: item.officialBoundary });
      features.push(feature);
      mappedRows.push({ row, feature, method, sourceComponentIds: [row.sourceUnitId] });
      pending.splice(pendingIndex, 1);
    }
  }
  if (pending.length > 0) {
    throw new Error("Florida 2024 has " + pending.length + " NYT features without a unique official result relationship; first: " + pending[0].source.componentIds[0]);
  }
  const exclusions = official.rows.filter((row) => !usedOfficial.has(row.rawKey));
  features.sort((left, right) => left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID));
  mappedRows.sort((left, right) => left.row.rawKey.localeCompare(right.row.rawKey));
  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    exclusions,
    noDataFeatureIds: [],
    methods,
    officialBoundaryFeatures: features.filter((feature) => feature.properties.SOURCE_OFFICIAL_BOUNDARY === true).length,
    generatedBoundaryFeatures: features.filter((feature) => feature.properties.SOURCE_OFFICIAL_BOUNDARY !== true).length,
    sourceAuthority: "New York Times 2024 election-specific precinct geometry",
  };
}

export async function buildFloridaGeometryModel(root, spec, official) {
  if (spec.year === 2016) return build2016Geometry(root, spec, official);
  if (spec.year === 2020) return build2020Geometry(root, spec, official);
  if (spec.year === 2024) return build2024Geometry(root, spec, official);
  if (spec.year !== 2012) throw new Error("Unsupported Florida geometry year: " + spec.year);
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection" || collection.features?.length !== 9_435) {
    throw new Error("Florida 2012 Census VTD diagnostic must contain exactly 9,435 features");
  }
  return {
    rawFeatureCount: collection.features.length,
    features: [],
    mappedRows: [],
    exclusions: official.rows,
    noDataFeatureIds: [],
    methods: {},
    sourceAuthority: "U.S. Census Bureau 2010 VTD statistical geography (diagnostic only)",
  };
}

function publicResultRow(spec, mapped) {
  const row = mapped.row;
  const resultUnitCode = resultUnitCodeFor(spec, row);
  return {
    resultUnitCode,
    sourceUnitId: row.sourceUnitId,
    sourceDisplayName: row.sourceDisplayName,
    parentGeoid: row.parentGeoid,
    parentSourceName: row.countyName,
    democratic: row.democratic,
    republican: row.republican,
    other: row.other,
    total: row.total,
    sourceComponentUnitIds: mapped.sourceComponentIds.slice().sort(),
  };
}

function publicExclusion(spec, row, reason) {
  return {
    resultUnitCode: resultUnitCodeFor(spec, row),
    sourceUnitId: row.sourceUnitId,
    sourceDisplayName: row.sourceDisplayName,
    parentGeoid: row.parentGeoid,
    parentSourceName: row.countyName,
    democratic: row.democratic,
    republican: row.republican,
    other: row.other,
    total: row.total,
    sourceComponentUnitIds: row.sourceComponentUnitIds.slice().sort(),
    exclusionReason: reason,
  };
}

export async function buildFloridaCanonicalDocuments(root, spec) {
  const official = await parseFloridaOfficialResults(root, spec);
  const geometryModel = await buildFloridaGeometryModel(root, spec, official);
  const mappedRows = geometryModel.mappedRows.map((mapped) => publicResultRow(spec, mapped));
  const exclusions = geometryModel.exclusions.map((row) => publicExclusion(
    spec,
    row,
    spec.year === 2012 ? "complete_election_effective_geometry_unavailable" : "no_reviewed_result_to_geometry_relationship",
  ));
  const mappedTotals = summarizeVotes(mappedRows);
  const excludedTotals = summarizeVotes(exclusions);
  const results = {
    schemaVersion: 1,
    state: "FL",
    electionId: spec.electionId,
    reportingGrain: "precinct",
    sourceUnitCount: official.sourceUnitCount,
    colorableUnitCount: mappedRows.length,
    excludedUnitCount: exclusions.length,
    zeroVoteUnitCount: mappedRows.filter((row) => row.total === 0).length,
    totals: official.totals,
    mappedTotals,
    excludedTotals,
    collection: {
      authority: "Florida Department of State, Division of Elections",
      sourceUrl: spec.resultSourceUrl,
      localArtifactPath: spec.resultPath,
      candidateVotePolicy: "Candidate totals include every named presidential candidate and WriteinVotes; OverVotes and UnderVotes are retained only in source diagnostics and are not candidate votes.",
      aggregationPolicy: "Only documented source components that belong to one reviewed polygon are summed. No vote is estimated, distributed, or copied from geometry.",
      duplicatePolicy: spec.year === 2016
        ? "Twenty-one reviewed Palm Beach precinct identities repeat exact candidate rows under two polling-location labels; exact duplicate candidate rows are counted once."
        : "No duplicate candidate row exception is applied.",
    },
    rows: mappedRows,
    exclusions,
  };

  const crosswalkRows = geometryModel.mappedRows.map((mapped) => {
    const row = mapped.row;
    return {
      resultUnitCode: resultUnitCodeFor(spec, row),
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain: "precinct",
      isGeographic: true,
      relationships: [{
        sourceFeatureId: row.parentGeoid + "|" + mapped.feature.properties.CRM_FEATURE_ID,
        relationshipType: "one_to_one",
        matchMethod: mapped.method === "exact_official_id" ? "exact_official_id" : "official_crosswalk",
        reviewStatus: "reviewed",
        confidence: "high",
        note: "Reviewed Florida geometry relationship using " + mapped.method.replace(/_/g, " ") + ". Displayed votes come only from the Florida Department of State source components: " + mapped.sourceComponentIds.join(", ") + ".",
      }],
    };
  }).sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));

  if (spec.year === 2012) {
    for (const row of official.rows) {
      crosswalkRows.push({
        resultUnitCode: resultUnitCodeFor(spec, row),
        sourceUnitId: row.sourceUnitId,
        sourceDisplayName: row.sourceDisplayName,
        parentGeoid: row.parentGeoid,
        reportingGrain: "precinct",
        isGeographic: true,
        relationships: [{
          sourceFeatureId: null,
          relationshipType: "unmatched",
          matchMethod: "official_crosswalk",
          reviewStatus: "pending",
          confidence: "high",
          note: "Official Florida result retained without geometry. Census 2010 VTDs and later precinct layers are not backcast to the November 6, 2012 election.",
        }],
      });
    }
    crosswalkRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  }

  const geometry = spec.year === 2012
    ? {
      schemaVersion: 1,
      state: "FL",
      electionId: spec.electionId,
      disposition: "blocked",
      normalizedFeatureCount: 0,
      diagnosticCandidateFeatureCount: geometryModel.rawFeatureCount,
      reason: "The 2010 Census VTD layer is statistical geography and does not establish Florida's November 6, 2012 election precinct boundaries or a result crosswalk.",
    }
    : {
      type: "FeatureCollection",
      metadata: {
        schemaVersion: 1,
        state: "FL",
        electionId: spec.electionId,
        sourceAuthority: geometryModel.sourceAuthority,
        sourceUrl: spec.geometrySourceUrl,
        sourceFeatureCount: geometryModel.rawFeatureCount,
        normalizedFeatureCount: geometryModel.features.length,
        reviewedNoDataFeatureCount: geometryModel.noDataFeatureIds.length,
        voteFieldsIncluded: false,
        reviewMethods: geometryModel.methods,
      },
      features: geometryModel.features,
    };
  if (spec.year !== 2012) {
    geometry.features.forEach((feature, index) => forbiddenElectionProperties(feature.properties, "Florida " + spec.year + " normalized feature " + index));
  }

  const crosswalk = {
    schemaVersion: 1,
    manifestId: spec.manifestId,
    state: "FL",
    electionId: spec.electionId,
    geographyLevel: "precinct",
    resultSourceId: spec.resultSourceId,
    generatedAt: FLORIDA_REVIEWED_AT,
    rows: crosswalkRows,
    reconciliation: {
      status: spec.rowLevelSafe ? "passed" : "not_run",
      scopes: spec.rowLevelSafe ? [{
        scopeType: "state",
        scopeId: "FL",
        resultTotals: mappedTotals,
        mappedTotals,
        deltas: Object.fromEntries(Object.keys(mappedTotals).map((key) => [key, 0])),
      }] : [],
      sourceResultUnitCount: official.sourceUnitCount,
      normalizedResultUnitCount: mappedRows.length,
      geometryFeatureCount: geometryModel.features.length,
      reviewedRelationshipRecordCount: mappedRows.length,
      reviewedNoDataFeatureCount: geometryModel.noDataFeatureIds.length,
      excludedSourceUnitCount: exclusions.length,
      sourceTotals: official.totals,
      mappedTotals,
      excludedTotals,
      sourceTotalsReconciled: Object.keys(official.totals).every((key) => official.totals[key] === mappedTotals[key] + excludedTotals[key]),
      methods: geometryModel.methods,
      duplicateCandidateRowsDiscarded: official.duplicateCandidateRows,
      officialBoundaryFeatures: geometryModel.officialBoundaryFeatures ?? null,
      generatedBoundaryFeatures: geometryModel.generatedBoundaryFeatures ?? null,
    },
  };

  return { official, geometryModel, results, geometry, crosswalk };
}

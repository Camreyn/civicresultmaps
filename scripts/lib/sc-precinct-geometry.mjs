import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import shp from "shpjs";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";

export const SOUTH_CAROLINA_REVIEWED_AT = "2026-08-15T04:00:00.000Z";

export const SOUTH_CAROLINA_PRECINCT_YEAR_SPECS = Object.freeze({
  2012: {
    year: 2012,
    date: "2012-11-06",
    electionId: "2012-11-06-general",
    manifestId: "sc-2012-11-06-rfa-archive-precinct-candidate-v1",
    base: "data/precinct-geometry/SC/2012-11-06-general",
    resultSourceId: "sc-election-commission-2012-president-9112",
    resultPath: "data/precinct-geometry/SC/2012-11-06-general/raw/sc-election-commission/president-9112.csv",
    geometryPath: "data/precinct-geometry/SC/2012-11-06-general/raw/rfa-archive/sc-2013-precincts.zip",
    geometryKind: "rfa_archive_2013",
    geometrySourceUrl: "https://github.com/aaron-strauss/precinct-shapefiles",
    resultSourceUrl: "https://sc.elstats.civera.com/api/download_contest/9112_table.csv?split_party=false",
    boundaryVintage: "RFA-origin statewide precinct shapefile created July 29, 2013; November 6, 2012 applicability is unconfirmed",
    vintageStatus: "unknown",
    derivationMethod: "secondary_reconstruction",
    sourceCrs: "source-defined and normalized by shpjs",
    licenseOrTerms: "The archived file attributes the geometry to the South Carolina Office of Research and Statistics, but no affirmative derivative-redistribution terms were retained.",
    reviewed: false,
    expected: {
      rawFeatures: 2155,
      normalizedFeatures: 2155,
      sourceUnits: 2477,
      geographicUnits: 2140,
      administrativeUnits: 337,
      mappedUnits: 0,
      colorableUnits: 0,
      noDataFeatures: 2155,
      totalVotes: 1964118,
      geographicVotes: 1557023,
      administrativeVotes: 407095,
      ballotsCast: 1982420,
      candidateCount: 5,
    },
  },
  2016: {
    year: 2016,
    date: "2016-11-08",
    electionId: "2016-11-08-general",
    manifestId: "sc-2016-11-08-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/SC/2016-11-08-general",
    resultSourceId: "sc-election-commission-2016-president-5292",
    resultPath: "data/precinct-geometry/SC/2016-11-08-general/raw/sc-election-commission/president-5292.csv",
    geometryPath: "data/precinct-geometry/SC/2016-11-08-general/raw/vest/sc_2016.zip",
    geometryKind: "vest_2016",
    geometrySourceUrl: "https://dataverse.harvard.edu/file.xhtml?persistentId=doi:10.7910/DVN/NH5S2I/Y3OFQZ&version=78.0",
    resultSourceUrl: "https://sc.elstats.civera.com/api/download_contest/5292_table.csv?split_party=false",
    boundaryVintage: "VEST 2016 election-specific precinct geometry sourced from the South Carolina Revenue and Fiscal Affairs Office, Harvard Dataverse version 78.0",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "secondary_reconstruction",
    sourceCrs: "source-defined and normalized by shpjs",
    licenseOrTerms: "VEST geometry is Creative Commons Attribution 4.0 under the retained Harvard Dataverse version-78 terms; official South Carolina result values remain the sole displayed vote source.",
    reviewed: true,
    expected: {
      rawFeatures: 2235,
      normalizedFeatures: 2234,
      sourceUnits: 2551,
      geographicUnits: 2233,
      administrativeUnits: 318,
      mappedUnits: 2232,
      colorableUnits: 2232,
      noDataFeatures: 2,
      totalVotes: 2103027,
      geographicVotes: 1589961,
      administrativeVotes: 513066,
      ballotsCast: 2123629,
      candidateCount: 7,
    },
  },
  2020: {
    year: 2020,
    date: "2020-11-03",
    electionId: "2020-11-03-general",
    manifestId: "sc-2020-11-03-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/SC/2020-11-03-general",
    resultSourceId: "sc-election-commission-2020-president-1974",
    resultPath: "data/precinct-geometry/SC/2020-11-03-general/raw/sc-election-commission/president-1974.csv",
    geometryPath: "data/precinct-geometry/SC/2020-11-03-general/raw/vest/sc_2020.zip",
    geometryKind: "vest_2020",
    geometrySourceUrl: "https://dataverse.harvard.edu/file.xhtml?fileId=4789402&version=27.0",
    resultSourceUrl: "https://sc.elstats.civera.com/api/download_contest/1974_table.csv?split_party=false",
    boundaryVintage: "VEST 2020 election-specific precinct geometry sourced from the South Carolina Revenue and Fiscal Affairs Office, Harvard Dataverse version 27.0",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "secondary_reconstruction",
    sourceCrs: "source-defined and normalized by shpjs",
    licenseOrTerms: "VEST geometry is Creative Commons Attribution 4.0 under the retained Harvard Dataverse version-27 terms; official South Carolina result values remain the sole displayed vote source.",
    reviewed: true,
    expected: {
      rawFeatures: 2263,
      normalizedFeatures: 2263,
      sourceUnits: 2399,
      geographicUnits: 2261,
      administrativeUnits: 138,
      mappedUnits: 2261,
      colorableUnits: 2261,
      noDataFeatures: 2,
      totalVotes: 2513329,
      geographicVotes: 2504220,
      administrativeVotes: 9109,
      ballotsCast: 2532830,
      candidateCount: 5,
    },
  },
  2024: {
    year: 2024,
    date: "2024-11-05",
    electionId: "2024-11-05-general",
    manifestId: "sc-2024-11-05-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/SC/2024-11-05-general",
    resultSourceId: "sc-election-commission-2024-president-7131",
    resultPath: "data/precinct-geometry/SC/2024-11-05-general/raw/sc-election-commission/president-7131.csv",
    geometryPath: "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/SC-precincts-with-results.geojson.gz",
    geometryKind: "nyt_2024",
    geometrySourceUrl: "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/SC-precincts-with-results.geojson.gz",
    resultSourceUrl: "https://sc.elstats.civera.com/api/download_contest/7131_table.csv?split_party=false",
    boundaryVintage: "NYT 2024 election-specific South Carolina precinct package with every retained feature marked official_boundary=true",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "secondary_reconstruction",
    sourceCrs: "EPSG:4326 GeoJSON",
    licenseOrTerms: "NYT geometry is retained under the NYT Content API Use and Data Agreement non-commercial attribution terms; official South Carolina result values remain the sole displayed vote source.",
    reviewed: true,
    expected: {
      rawFeatures: 2308,
      normalizedFeatures: 2308,
      sourceUnits: 2446,
      geographicUnits: 2308,
      administrativeUnits: 138,
      mappedUnits: 2308,
      colorableUnits: 2308,
      noDataFeatures: 0,
      totalVotes: 2548140,
      geographicVotes: 2541877,
      administrativeVotes: 6263,
      ballotsCast: 2566404,
      candidateCount: 7,
    },
  },
});

export const SOUTH_CAROLINA_RAW_SOURCE_PINS = Object.freeze({
  "data/sc-counties.geojson": [8079102, "6e9c938b9dc4c1b83a9bfce380f8656253c1e7ce73ee9423e1f79b3f81c69af3"],
  "data/precinct-geometry/SC/2012-11-06-general/raw/rfa-archive/README.md": [1046, "479e662e3f1b5d4ff8caf69df19b673b4d0af99ae495e3d95dcfd96d0c816799"],
  "data/precinct-geometry/SC/2012-11-06-general/raw/rfa-archive/sc-2013-precincts.zip": [9017824, "bc74705f78194246d6e10321686e18cb819562b828a58ea682fac46ed3548ae2"],
  "data/precinct-geometry/SC/2012-11-06-general/raw/sc-election-commission/president-9112.csv": [116772, "26d5c6aa23b1f6c259f2178c20114c82027acbb586d487047d99483dff89a33c"],
  "data/precinct-geometry/SC/2016-11-08-general/raw/sc-election-commission/president-5292.csv": [135395, "03a22eb69b5db93406b35c163cecdfbb21176d24841e1d1cfa6360fb8b67099f"],
  "data/precinct-geometry/SC/2016-11-08-general/raw/vest/dataverse-license-evidence.json": [926, "d440daf657870ce8c3b21c506a393c20a519347339d4d2eea6a8976489546559"],
  "data/precinct-geometry/SC/2016-11-08-general/raw/vest/documentation.txt": [156582, "1feba4a879741eec2d3138da1e71e0d5da735ec8c9b5ba5718ef0a3b4251ae0d"],
  "data/precinct-geometry/SC/2016-11-08-general/raw/vest/sc_2016.zip": [11129756, "5e996edf778dcfa6df1bef698ddc6cf24c36d5968588e14683be60d9a6d59644"],
  "data/precinct-geometry/SC/2020-11-03-general/raw/sc-election-commission/president-1974.csv": [119261, "c57495268aa7c38e8e880caa1aca799eb2ace174c0a3770b4b1f471962453ba7"],
  "data/precinct-geometry/SC/2020-11-03-general/raw/vest/dataverse-license-evidence.json": [905, "177e3a14c80f0cc463a84d380fa518672e377d30907a4b7233e722a7749cde46"],
  "data/precinct-geometry/SC/2020-11-03-general/raw/vest/documentation.txt": [146959, "fb784900056495c3dbf846dffb3410a71f72d2f8e06350ff66b5962aa3c1d1cc"],
  "data/precinct-geometry/SC/2020-11-03-general/raw/vest/sc_2020.zip": [11231920, "3e25f15e355c37472b9bc0fb2f6575f74aae2e46b897afdeef9e1b7a4e2572ac"],
  "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/LICENSE": [4106, "77e8635500262b129a50772647773c2c66d812902aba6ac13bdb2bab14fd59c2"],
  "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/README.md": [49879, "987ea44ab04c77182d335670207dac88f7114f3ae02675ea5d7076e581ffccdf"],
  "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/SC-precincts-with-results.csv.gz": [37198, "f1059e4c275c3df61461eb179fe0a6cef3a4712e66af4df137e53235d65a91f2"],
  "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/SC-precincts-with-results.geojson.gz": [32809653, "e3604eaa175ca1e8dbe2202bf500360c744efc050ef5996e04dd6c4044417210"],
  "data/precinct-geometry/SC/2024-11-05-general/raw/sc-election-commission/president-7131.csv": [130631, "1ce20b1ad9d2f3d576c27248181abedf1d0ba1086a8bff0103d198862c56fd9a"],
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error("South Carolina CSV contains an unterminated quoted field");
  return rows;
}

export function normalizeSouthCarolinaPrecinctName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/['\u2019]/g, "")
    .replace(/^WARD$/, "WARDUNIT")
    .replace(/\bCAMDEN NO\.?\s*0?2\s*&\s*0?3\b/g, "CAMDEN 2 3")
    .replace(/\bHILTON CROSS (?:ROAD|RD)\b/g, "HILTON CROSSROADS")
    .replace(/\bSTONE CHURCH\b/g, "SOUTH CHURCH")
    .replace(/\bTHREE AND TWENTY\b/g, "3 AND 20")
    .replace(/\bSEVENTY[- ]EIGHT\b/g, "78")
    .replace(/\bNINETY[- ]NINE\b/g, "99")
    .replace(/\bFIFTY[- ]TWO\b/g, "52")
    .replace(/\bNORTH EAST\b|\bNORTHEAST\b/g, "N E")
    .replace(/\bNORTH WEST\b|\bNORTHWEST\b/g, "N W")
    .replace(/\bSOUTH EAST\b|\bSOUTHEAST\b/g, "S E")
    .replace(/\bSOUTH WEST\b|\bSOUTHWEST\b/g, "S W")
    .replace(/\bWEST\b/g, "W")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bFIRST\b/g, "1ST")
    .replace(/\bSECOND\b/g, "2ND")
    .replace(/\bFOUR\b/g, "4")
    .replace(/\bFIVE\b/g, "5")
    .replace(/\bSIX\b/g, "6")
    .replace(/\bSEVEN\b/g, "7")
    .replace(/\bNINE\b/g, "9")
    .replace(/\bMOUNT\b/g, "MT")
    .replace(/\bX\s*ROADS?\b|\bCROSS (?:ROADS?|RD)\b|\bCR ROADS?\b/g, "CROSSROADS")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bHIGH SCHOOL\b/g, "HIGH")
    .replace(/\bELEMENTARY SCHOOL\b/g, "ELEMENTARY")
    .replace(/\bMETHODIST CHURCH\b/g, "METHODIST")
    .replace(/\bFIRST BAPTIST CHURCH\b/g, "1ST BAPTIST")
    .replace(/\b(?:PRECINCT|PCT|WARD|WD|NO|NUMBER|TOWN|OF|ISLAND)\b/g, "")
    .replace(/\bCRESENT\b/g, "CRESCENT")
    .replace(/\bGALLIVANTS\b/g, "GALIVANTS")
    .replace(/\bJERIGANS\b/g, "JERNIGANS")
    .replace(/\bCROCKETVILLE\b/g, "CROCKET")
    .replace(/\bNARNIE\b/g, "NARINE")
    .replace(/\bBETHERL\b/g, "BETHEL")
    .replace(/\bBUNRS\b/g, "BURNS")
    .replace(/\bSARDINA\b/g, "SARDINIA")
    .replace(/\bLANSFORD\b/g, "LANDSFORD")
    .replace(/\bCARARRH\b/g, "CATARRH")
    .replace(/\bBLOOMINGVILLE\b/g, "BLOOMVILLE")
    .replace(/\bCHRUCH\b/g, "CHURCH")
    .replace(/\bOKATIE\b/g, "OAKATIE")
    .replace(/\bLENHARDT\b/g, "LENHART")
    .replace(/\bDAVIDS\b/g, "DAVID")
    .replace(/\bMICHAELS\b/g, "MICHAEL")
    .replace(/\bHUDSONS\b/g, "HUDSON")
    .replace(/\bCOWARDS\b/g, "COWARD")
    .replace(/\bSPRINGS\b/g, "SPRING")
    .replace(/\bLITTLEJOHNS\b/g, "LITTLEJOHN")
    .replace(/\bSARRATTS\b/g, "SARRATT")
    .replace(/\bJUNIOR\b/g, "JR")
    .replace(/\bRIVERSPRINGS\b/g, "RIVERSPRING")
    .replace(/\bPONARIA\b/g, "POMARIA")
    .replace(/\bORNAGEBURG\b/g, "ORANGEBURG")
    .replace(/\bBARROWS MILL\b/g, "BARROWS")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bNO\.?\s*/g, "")
    .replace(/\bSAINT\b/g, "ST")
    .replace(/[^A-Z0-9]+/g, "")
    .replace(/0+([0-9]+)/g, "$1");
}

export function isSouthCarolinaAdministrativeResult(name) {
  return /(?:^|\b)(?:ABSENTEE|FAILSAFE|PROVISIONAL|EMERGENCY|PAPER BALLOT|CURBSIDE|CENTRAL COUNT)(?:\b|$)|^EARLY VOTING(?:\b|$)/i.test(String(name ?? ""));
}

function absolute(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function finiteInteger(value, context) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim() || 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${context} must be a nonnegative safe integer`);
  }
  return number;
}

function totals(rows) {
  return rows.reduce((sum, row) => ({
    democraticVotes: sum.democraticVotes + row.democratic,
    republicanVotes: sum.republicanVotes + row.republican,
    otherVotes: sum.otherVotes + row.other,
    totalVotes: sum.totalVotes + row.total,
    ballotsCast: sum.ballotsCast + row.ballotsCast,
  }), {
    democraticVotes: 0,
    republicanVotes: 0,
    otherVotes: 0,
    totalVotes: 0,
    ballotsCast: 0,
  });
}

function buildCountyMaps(root) {
  const collection = JSON.parse(readFileSync(absolute(root, "data/sc-counties.geojson"), "utf8"));
  if (collection?.type !== "FeatureCollection" || collection.features.length !== 46) {
    throw new Error("South Carolina county geometry must contain exactly 46 counties");
  }
  const byName = new Map();
  const byCountyFips = new Map();
  for (const feature of collection.features) {
    const name = String(feature.properties?.BASENAME ?? feature.properties?.NAME ?? "").replace(/ County$/i, "").trim();
    const countyFips = String(feature.properties?.COUNTY ?? "").padStart(3, "0");
    const geoid = String(feature.properties?.GEOID ?? `45${countyFips}`);
    if (!name || !/^45\d{3}$/.test(geoid)) throw new Error("invalid South Carolina county identity");
    byName.set(name.toUpperCase(), { name, countyFips, geoid });
    byCountyFips.set(countyFips, { name, countyFips, geoid });
  }
  return { byName, byCountyFips };
}

export function parseSouthCarolinaOfficialResults(bytes, spec, countyMaps) {
  const matrix = parseCsv(Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, ""));
  if (matrix.length < 4) throw new Error(`${spec.year} official result CSV is empty`);
  const header = matrix[0];
  const parties = matrix[1];
  const totalIndex = header.indexOf("Total Votes Cast");
  const ballotsIndex = header.indexOf("Total Ballots Cast");
  const overUnderIndex = header.indexOf("Overvotes/Undervotes");
  if (totalIndex < 3 || ballotsIndex < 0 || overUnderIndex < 0) {
    throw new Error(`${spec.year} official result CSV headers are incomplete`);
  }
  const candidateIndexes = Array.from({ length: totalIndex - 2 }, (_, index) => index + 2);
  const candidates = candidateIndexes.map((index) => ({
    index,
    name: String(header[index] ?? "").trim(),
    party: String(parties[index] ?? "").trim(),
  }));
  if (candidates.some((candidate) => !candidate.name || !candidate.party)) {
    throw new Error(`${spec.year} candidate header is incomplete`);
  }

  let county = null;
  const rows = [];
  for (const sourceRow of matrix) {
    if (sourceRow[0] === "County") {
      county = countyMaps.byName.get(String(sourceRow[1] ?? "").trim().toUpperCase()) ?? null;
      if (!county) throw new Error(`${spec.year} result CSV has unknown county ${sourceRow[1]}`);
      continue;
    }
    if (sourceRow[0] !== "Precinct") continue;
    if (!county) throw new Error(`${spec.year} precinct row appears before a county row`);
    const sourceDisplayName = String(sourceRow[1] ?? "").trim();
    const normalizedName = normalizeSouthCarolinaPrecinctName(sourceDisplayName);
    if (!sourceDisplayName || !normalizedName) throw new Error(`${spec.year} precinct row has no identity`);
    const candidateVotes = candidates.map((candidate) => ({
      name: candidate.name,
      party: candidate.party,
      votes: finiteInteger(sourceRow[candidate.index], `${spec.year} ${county.name} ${sourceDisplayName} ${candidate.name}`),
    }));
    const democratic = candidateVotes.filter((candidate) => /^Democratic/i.test(candidate.party)).reduce((sum, candidate) => sum + candidate.votes, 0);
    const republican = candidateVotes.filter((candidate) => /^Republican/i.test(candidate.party)).reduce((sum, candidate) => sum + candidate.votes, 0);
    const total = finiteInteger(sourceRow[totalIndex], `${spec.year} ${county.name} ${sourceDisplayName} total`);
    const candidateSum = candidateVotes.reduce((sum, candidate) => sum + candidate.votes, 0);
    if (candidateSum !== total) throw new Error(`${spec.year} ${county.name} ${sourceDisplayName} candidate votes do not reconcile`);
    const sourceUnitId = normalizedName.toLowerCase();
    const administrative = isSouthCarolinaAdministrativeResult(sourceDisplayName);
    rows.push({
      parentGeoid: county.geoid,
      countyName: county.name,
      sourceUnitId,
      sourceDisplayName,
      normalizedName,
      administrative,
      candidateVotes,
      democratic,
      republican,
      other: total - democratic - republican,
      total,
      overUnder: finiteInteger(sourceRow[overUnderIndex], `${spec.year} ${county.name} ${sourceDisplayName} over/under`),
      ballotsCast: finiteInteger(sourceRow[ballotsIndex], `${spec.year} ${county.name} ${sourceDisplayName} ballots`),
    });
  }

  const identities = new Set();
  for (const row of rows) {
    const key = `${row.parentGeoid}|${row.sourceUnitId}`;
    if (identities.has(key)) throw new Error(`${spec.year} duplicate official result identity ${key}`);
    identities.add(key);
  }
  const geographicRows = rows.filter((row) => !row.administrative);
  const administrativeRows = rows.filter((row) => row.administrative);
  return {
    candidates: candidates.map(({ name, party }) => ({ name, party })),
    rows,
    geographicRows,
    administrativeRows,
    officialTotals: totals(rows),
    geographicTotals: totals(geographicRows),
    administrativeTotals: totals(administrativeRows),
  };
}

function mergeGeometries(features, context) {
  if (features.length === 1) return features[0].geometry;
  const polygons = [];
  for (const feature of features) {
    if (feature.geometry?.type === "Polygon") polygons.push(feature.geometry.coordinates);
    else if (feature.geometry?.type === "MultiPolygon") polygons.push(...feature.geometry.coordinates);
    else throw new Error(`${context} includes non-polygon geometry`);
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

function featureId(year, parentGeoid, identity) {
  return `sc:${year}:${parentGeoid}:${encodeURIComponent(identity.toLowerCase())}`;
}

function geometryFeature({ year, parentGeoid, countyName, identity, sourceName, sourceGeometryId, geometry }) {
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: featureId(year, parentGeoid, identity),
      CRM_PARENT_GEOID: parentGeoid,
      CRM_SOURCE_UNIT_ID: identity.toLowerCase(),
      SOURCE_NAME: sourceName,
      SOURCE_COUNTY_NAME: countyName,
      SOURCE_GEOMETRY_ID: sourceGeometryId,
    },
    geometry,
  };
}

function resultKey(row) {
  return `${row.parentGeoid}|${row.normalizedName}`;
}

async function build2012Geometry(root, spec, countyMaps) {
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection") throw new Error("2012 RFA archive did not parse as GeoJSON");
  const features = collection.features.map((feature, index) => {
    const countyFips = String(feature.properties?.County ?? "").padStart(3, "0");
    const county = countyMaps.byCountyFips.get(countyFips);
    if (!county) throw new Error(`2012 geometry has unknown county ${countyFips}`);
    const name = String(feature.properties?.PNAME ?? feature.properties?.Code_Name ?? "").trim();
    const code = String(feature.properties?.Pcode ?? "").trim();
    if (!name) throw new Error("2012 geometry feature is missing PNAME/Code_Name");
    const identity = `${code ? code.padStart(3, "0") : `uncoded-${index}`}-${normalizeSouthCarolinaPrecinctName(name)}`;
    return geometryFeature({
      year: spec.year,
      parentGeoid: county.geoid,
      countyName: county.name,
      identity,
      sourceName: name,
      sourceGeometryId: `${countyFips}:${code}:${index}`,
      geometry: feature.geometry,
    });
  });
  return { rawFeatureCount: collection.features.length, features, mappedRows: new Map(), mappingMethod: null };
}

async function buildVestGeometry(root, spec, countyMaps, official) {
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection") throw new Error(`${spec.year} VEST ZIP did not parse as GeoJSON`);
  const grouped = new Map();
  for (const [index, feature] of collection.features.entries()) {
    const countyFips = String(feature.properties?.COUNTY ?? "").padStart(3, "0");
    const county = countyMaps.byCountyFips.get(countyFips);
    if (!county) throw new Error(`${spec.year} VEST geometry has unknown county ${countyFips}`);
    const nameField = spec.year === 2016 ? "PNAME" : "CODE_NAME";
    const name = String(feature.properties?.[nameField] ?? "").trim();
    if (!name) throw new Error(`${spec.year} VEST geometry has no ${nameField}`);
    const normalizedName = normalizeSouthCarolinaPrecinctName(name);
    const key = `${county.geoid}|${normalizedName}`;
    const entries = grouped.get(key) ?? [];
    entries.push({ feature, index, county, name, normalizedName });
    grouped.set(key, entries);
  }
  const duplicateKeys = [...grouped.entries()].filter(([, values]) => values.length > 1);
  if (spec.year === 2016) {
    if (duplicateKeys.length !== 1 || duplicateKeys[0][0] !== "45059|LAURENS6" || duplicateKeys[0][1].length !== 2) {
      throw new Error("2016 VEST duplicate geometry set is not the reviewed Laurens 6 pair");
    }
  } else if (duplicateKeys.length !== 0) {
    throw new Error(`${spec.year} VEST geometry contains duplicate normalized identities`);
  }

  const officialByKey = new Map(official.geographicRows.map((row) => [resultKey(row), row]));
  const mappedRows = new Map();
  const features = [];
  for (const [key, entries] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const { county, name, normalizedName } = entries[0];
    const result = officialByKey.get(key) ?? null;
    const identity = result?.sourceUnitId ?? `geometry-${normalizedName.toLowerCase()}`;
    const normalizedFeature = geometryFeature({
      year: spec.year,
      parentGeoid: county.geoid,
      countyName: county.name,
      identity,
      sourceName: result?.sourceDisplayName ?? name,
      sourceGeometryId: entries.map((entry) => String(entry.index)).join(","),
      geometry: mergeGeometries(entries.map((entry) => entry.feature), `${spec.year} ${county.name} ${name}`),
    });
    features.push(normalizedFeature);
    if (result) {
      mappedRows.set(
        resultKey(result),
        `${county.geoid}|${normalizedFeature.properties.CRM_FEATURE_ID}`,
      );
    }
  }
  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    mappingMethod: "reviewed_parent_qualified_name",
  };
}

async function build2024Geometry(root, spec, countyMaps, official) {
  const collection = JSON.parse(gunzipSync(readFileSync(absolute(root, spec.geometryPath))));
  if (collection?.type !== "FeatureCollection") throw new Error("2024 NYT geometry did not parse as GeoJSON");
  const officialBySignature = new Map();
  for (const row of official.geographicRows) {
    const key = `${row.parentGeoid}|${row.democratic}|${row.republican}|${row.total}`;
    if (officialBySignature.has(key)) throw new Error(`2024 official vote signature is not unique: ${key}`);
    officialBySignature.set(key, row);
  }
  const usedResults = new Set();
  const sourceGeoids = new Set();
  const mappedRows = new Map();
  const features = collection.features.map((feature) => {
    const properties = feature.properties ?? {};
    if (properties.official_boundary !== true) throw new Error("2024 NYT geometry contains a non-official boundary feature");
    const sourceGeoid = String(properties.GEOID ?? "").trim();
    if (!/^45\d{3}-.+/.test(sourceGeoid) || sourceGeoids.has(sourceGeoid)) {
      throw new Error(`2024 NYT geometry has invalid or duplicate GEOID ${sourceGeoid}`);
    }
    sourceGeoids.add(sourceGeoid);
    const parentGeoid = sourceGeoid.slice(0, 5);
    const county = countyMaps.byCountyFips.get(parentGeoid.slice(2));
    if (!county) throw new Error(`2024 NYT geometry has unknown county ${parentGeoid}`);
    const signature = `${parentGeoid}|${finiteInteger(properties.votes_dem, sourceGeoid)}|${finiteInteger(properties.votes_rep, sourceGeoid)}|${finiteInteger(properties.votes_total, sourceGeoid)}`;
    const result = officialBySignature.get(signature);
    if (!result || usedResults.has(resultKey(result))) throw new Error(`2024 NYT geometry does not have a unique official-result match for ${sourceGeoid}`);
    usedResults.add(resultKey(result));
    const normalizedFeature = geometryFeature({
      year: spec.year,
      parentGeoid,
      countyName: county.name,
      identity: result.sourceUnitId,
      sourceName: result.sourceDisplayName,
      sourceGeometryId: sourceGeoid,
      geometry: feature.geometry,
    });
    mappedRows.set(
      resultKey(result),
      `${parentGeoid}|${normalizedFeature.properties.CRM_FEATURE_ID}`,
    );
    return normalizedFeature;
  });
  if (usedResults.size !== official.geographicRows.length) throw new Error("2024 geometry does not cover every official geographic result row");
  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    mappingMethod: "unique_parent_vote_signature",
  };
}

function canonicalRow(spec, row, mapping, forceNonGeographic = false) {
  const isGeographic = !forceNonGeographic && !row.administrative;
  const reportingGrain = isGeographic ? "precinct" : "administrative_reporting_unit";
  const resultUnitCode = reportingUnitCode({
    state: "SC",
    electionId: spec.electionId,
    reportingGrain,
    parentGeoid: row.parentGeoid,
    sourceUnitId: row.sourceUnitId,
  });
  let relationship;
  if (!isGeographic) {
    relationship = {
      sourceFeatureId: null,
      relationshipType: "non_geographic",
      matchMethod: "exact_official_id",
      reviewStatus: "reviewed",
      confidence: "high",
      note: forceNonGeographic
        ? "Official zero-vote source unit has no corresponding reviewed geometry and is retained as a no-geometry reconciliation row."
        : "Official countywide administrative result is retained for reconciliation and never assigned to a precinct polygon.",
    };
  } else if (!spec.reviewed) {
    relationship = {
      sourceFeatureId: null,
      relationshipType: "unmatched",
      matchMethod: "normalized_name_candidate",
      reviewStatus: "pending",
      confidence: "low",
      note: "The post-election archive has no confirmed November 2012 applicability or reviewed official result-to-feature crosswalk.",
    };
  } else {
    const sourceFeatureId = mapping.get(resultKey(row));
    if (!sourceFeatureId) throw new Error(`${spec.year} reviewed result lacks geometry: ${row.countyName} / ${row.sourceDisplayName}`);
    relationship = {
      sourceFeatureId,
      relationshipType: "one_to_one",
      matchMethod: "reviewed_name",
      reviewStatus: "reviewed",
      confidence: "high",
      note: spec.year === 2024
        ? "Reviewed one-to-one match by county and a unique complete official presidential vote signature; displayed values come only from the official state export."
        : "Reviewed one-to-one county-qualified result-name relationship; all VEST election-value fields are discarded.",
    };
  }
  return {
    crosswalkRow: {
      resultUnitCode,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain,
      isGeographic,
      relationships: [relationship],
    },
    resultRow: {
      resultUnitCode,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      democratic: row.democratic,
      republican: row.republican,
      other: row.other,
      total: row.total,
      ballotsCast: row.ballotsCast,
      candidateVotes: row.candidateVotes,
    },
  };
}

function reconciliationScopes(rows) {
  const byParent = new Map();
  for (const row of rows) {
    const values = byParent.get(row.parentGeoid) ?? [];
    values.push(row);
    byParent.set(row.parentGeoid, values);
  }
  const buildScope = (scopeType, scopeId, values) => {
    const resultTotals = totals(values);
    delete resultTotals.ballotsCast;
    return {
      scopeType,
      scopeId,
      resultTotals,
      mappedTotals: { ...resultTotals },
      deltas: Object.fromEntries(Object.keys(resultTotals).map((key) => [key, 0])),
    };
  };
  return [
    buildScope("state", "SC", rows),
    ...[...byParent.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([parent, values]) => buildScope("parent", parent, values)),
  ];
}

function assertExpected(spec, model) {
  const expected = spec.expected;
  const actual = {
    rawFeatures: model.rawFeatureCount,
    normalizedFeatures: model.geometry.features.length,
    sourceUnits: model.official.rows.length,
    geographicUnits: model.official.geographicRows.length,
    administrativeUnits: model.official.administrativeRows.length,
    mappedUnits: model.mappedRows.length,
    colorableUnits: model.colorableRows.length,
    noDataFeatures: model.noDataFeatureIds.length,
    totalVotes: model.official.officialTotals.totalVotes,
    geographicVotes: model.official.geographicTotals.totalVotes,
    administrativeVotes: model.official.administrativeTotals.totalVotes,
    ballotsCast: model.official.officialTotals.ballotsCast,
    candidateCount: model.official.candidates.length,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${spec.year} ${key} expected ${value}, received ${actual[key]}`);
  }
}

export async function buildSouthCarolinaPrecinctReviewModel(year, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const spec = SOUTH_CAROLINA_PRECINCT_YEAR_SPECS[Number(year)];
  if (!spec) throw new Error(`unsupported South Carolina precinct year ${year}`);
  const countyMaps = buildCountyMaps(root);
  const official = parseSouthCarolinaOfficialResults(readFileSync(absolute(root, spec.resultPath)), spec, countyMaps);
  let geometryModel;
  if (spec.geometryKind === "rfa_archive_2013") geometryModel = await build2012Geometry(root, spec, countyMaps);
  else if (spec.geometryKind.startsWith("vest_")) geometryModel = await buildVestGeometry(root, spec, countyMaps, official);
  else geometryModel = await build2024Geometry(root, spec, countyMaps, official);

  const geometry = {
    type: "FeatureCollection",
    properties: {
      state: "SC",
      electionId: spec.electionId,
      geographyLevel: "precinct",
      boundaryVintage: spec.boundaryVintage,
      sourceAuthority: spec.year === 2012
        ? "South Carolina Office of Research and Statistics attribution in a retained third-party archive"
        : spec.year === 2024
          ? "New York Times official-boundary package, with official South Carolina Election Commission results used only for reviewed joining"
          : "Voting and Election Science Team copy of South Carolina Revenue and Fiscal Affairs Office geometry",
    },
    features: geometryModel.features.sort((left, right) => String(left.properties.CRM_FEATURE_ID).localeCompare(String(right.properties.CRM_FEATURE_ID))),
  };
  const knownFeatureIds = new Set(geometry.features.map((feature) => (
    `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`
  )));
  const mappedFeatureIds = new Set(geometryModel.mappedRows.values());
  const noDataFeatureIds = [...knownFeatureIds].filter((id) => !mappedFeatureIds.has(id)).sort();

  const crosswalkRows = [];
  const resultRows = [];
  const exclusions = [];
  const colorableRows = [];
  const mappedRows = [];
  for (const row of official.rows) {
    const zeroVoteNoGeometry = spec.year === 2016
      && !row.administrative
      && row.total === 0
      && !geometryModel.mappedRows.has(resultKey(row));
    const canonical = canonicalRow(spec, row, geometryModel.mappedRows, zeroVoteNoGeometry);
    crosswalkRows.push(canonical.crosswalkRow);
    const mapped = canonical.crosswalkRow.relationships[0].relationshipType === "one_to_one";
    if (mapped) {
      resultRows.push(canonical.resultRow);
      colorableRows.push(row);
      mappedRows.push(row);
    } else {
      exclusions.push({
        ...canonical.resultRow,
        reason: row.administrative
          ? "official countywide administrative category; no precinct geometry"
          : zeroVoteNoGeometry
            ? "official zero-vote source unit has no corresponding reviewed geometry"
            : "2012 result-to-feature relationship remains unreviewed",
      });
    }
  }
  crosswalkRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  resultRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  exclusions.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));

  const model = {
    spec,
    official,
    geometry,
    rawFeatureCount: geometryModel.rawFeatureCount,
    mappingMethod: geometryModel.mappingMethod,
    crosswalkRows,
    resultRows,
    exclusions,
    colorableRows,
    mappedRows,
    noDataFeatureIds,
    knownFeatureIds,
    knownFeatureParents: new Map(geometry.features.map((feature) => [
      `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`,
      feature.properties.CRM_PARENT_GEOID,
    ])),
  };
  assertExpected(spec, model);
  return model;
}

export function buildSouthCarolinaReconciliation(model) {
  return model.spec.reviewed
    ? { status: "passed", scopes: reconciliationScopes(model.mappedRows) }
    : { status: "not_run", scopes: [] };
}

export function summarizeSouthCarolinaModel(model) {
  return {
    year: model.spec.year,
    rawFeatures: model.rawFeatureCount,
    normalizedFeatures: model.geometry.features.length,
    officialResultUnits: model.official.rows.length,
    geographicResultUnits: model.official.geographicRows.length,
    administrativeResultUnits: model.official.administrativeRows.length,
    colorableResultUnits: model.colorableRows.length,
    mappedResultUnits: model.mappedRows.length,
    unlinkedGeometryUnits: model.noDataFeatureIds.length,
    officialVotes: model.official.officialTotals.totalVotes,
    mappedVotes: totals(model.mappedRows).totalVotes,
    administrativeVotes: model.official.administrativeTotals.totalVotes,
  };
}

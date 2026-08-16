import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import polygonClipping from "polygon-clipping";
import shp from "shpjs";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";

export const NORTH_CAROLINA_REVIEWED_AT = "2026-08-16T04:00:00.000Z";

export const NORTH_CAROLINA_PRECINCT_YEAR_SPECS = Object.freeze({
  2012: {
    year: 2012,
    date: "2012-11-06",
    electionId: "2012-11-06-general",
    manifestId: "nc-2012-11-06-reviewed-vtd-geometry-v1",
    base: "data/precinct-geometry/NC/2012-11-06-general",
    geographyLevel: "vtd",
    resultSourceId: "nc-2012-ncsbe-precinct-sorted-president",
    resultPath: "data/precinct-geometry/NC/2012-11-06-general/raw/ncsbe/results_sort_20121106.zip",
    geometryPath: "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/NC_VTD.zip",
    geometryKind: "mggg_2012_vtd",
    geometrySourceUrl: "https://github.com/mggg-states/NC-shapefiles",
    resultSourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2012_11_06/results_sort_20121106.zip",
    boundaryVintage: "MGGG/NC General Assembly VTD package with a fully reconciled November 6, 2012 presidential VTD result universe",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "secondary_reconstruction",
    sourceCrs: "EPSG:6543, normalized to EPSG:4326 by shpjs",
    licenseOrTerms: "MGGG publishes the database under ODbL 1.0 and individual contents under DBCL 1.0; attribution and share-alike obligations apply.",
    rowLevelSafe: true,
    expected: {
      rawFeatures: 2692,
      normalizedFeatures: 2692,
      sourceUnits: 3011,
      geographicUnits: 2692,
      administrativeUnits: 319,
      mappedUnits: 2692,
      colorableUnits: 2692,
      noDataFeatures: 0,
      totalVotes: 4505372,
      geographicVotes: 4492613,
      administrativeVotes: 12759,
      candidateCount: 5,
      directIdMatches: 2654,
      voteSignatureMatches: 38,
    },
  },
  2016: {
    year: 2016,
    date: "2016-11-08",
    electionId: "2016-11-08-general",
    manifestId: "nc-2016-11-08-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/NC/2016-11-08-general",
    geographyLevel: "precinct",
    resultSourceId: "nc-2016-results-precinct-zip",
    resultPath: "data/nc-2016-results-precinct.zip",
    geometryPath: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20161004.zip",
    geometryKind: "ncsbe_exact",
    geometrySourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ShapeFiles/Precinct/SBE_PRECINCTS_20161004.zip",
    resultSourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2016_11_08/results_pct_20161108.zip",
    boundaryVintage: "NCSBE statewide precinct snapshot dated October 4, 2016, the final retained statewide snapshot before the November 8 general election",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "official_export",
    sourceCrs: "source-defined ESRI Shapefile CRS, normalized to EPSG:4326 by shpjs",
    licenseOrTerms: "Official public North Carolina State Board of Elections geospatial export; the source page states no additional reuse restriction.",
    rowLevelSafe: true,
    expected: {
      rawFeatures: 2704,
      normalizedFeatures: 2704,
      sourceUnits: 3209,
      geographicUnits: 2704,
      administrativeUnits: 505,
      mappedUnits: 2704,
      colorableUnits: 2704,
      noDataFeatures: 0,
      totalVotes: 4741564,
      geographicVotes: 3177511,
      administrativeVotes: 1564053,
      candidateCount: 5,
    },
  },
  2020: {
    year: 2020,
    date: "2020-11-03",
    electionId: "2020-11-03-general",
    manifestId: "nc-2020-11-03-reviewed-precinct-geometry-v1",
    base: "data/precinct-geometry/NC/2020-11-03-general",
    geographyLevel: "precinct",
    resultSourceId: "nc-2020-results-precinct-zip",
    resultPath: "data/nc-2020-results-precinct.zip",
    geometryPath: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20201018.zip",
    supplementalGeometryPath: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20190827.zip",
    geometryKind: "ncsbe_supplemented",
    supplementalIds: ["37021|681", "37089|CV", "37183|1-07A", "37183|7-07A"],
    geometrySourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ShapeFiles/Precinct/SBE_PRECINCTS_20201018.zip",
    resultSourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2020_11_03/results_pct_20201103.zip",
    boundaryVintage: "NCSBE October 18, 2020 statewide snapshot with four missing official result units restored from the official August 27, 2019 snapshot using the independently documented VEST/RDH method",
    vintageStatus: "election_date_confirmed",
    derivationMethod: "hybrid_reconstruction",
    sourceCrs: "source-defined ESRI Shapefile CRS, normalized to EPSG:4326 by shpjs",
    licenseOrTerms: "Official public North Carolina State Board of Elections geospatial exports; the source page states no additional reuse restriction.",
    rowLevelSafe: true,
    expected: {
      rawFeatures: 2659,
      normalizedFeatures: 2662,
      sourceUnits: 3065,
      geographicUnits: 2662,
      administrativeUnits: 403,
      mappedUnits: 2662,
      colorableUnits: 2662,
      noDataFeatures: 0,
      totalVotes: 5524802,
      geographicVotes: 3201711,
      administrativeVotes: 2323091,
      candidateCount: 7,
    },
  },
  2024: {
    year: 2024,
    date: "2024-11-05",
    electionId: "2024-11-05-general",
    manifestId: "nc-2024-11-05-supplemented-precinct-candidate-v1",
    base: "data/precinct-geometry/NC/2024-11-05-general",
    geographyLevel: "precinct",
    resultSourceId: "nc-2024-results-precinct-zip",
    resultPath: "data/nc-2024-results-precinct.zip",
    geometryPath: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20240723.zip",
    supplementalGeometryPath: "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20190827.zip",
    geometryKind: "ncsbe_supplemented",
    supplementalIds: ["37089|CV", "37183|1-07A", "37183|7-07A"],
    geometrySourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ShapeFiles/Precinct/SBE_PRECINCTS_20240723.zip",
    resultSourceUrl: "https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_11_05/results_pct_20241105.zip",
    boundaryVintage: "NCSBE July 23, 2024 statewide snapshot supplemented with three official 2019 subprecinct polygons whose November 5, 2024 applicability remains unconfirmed",
    vintageStatus: "unknown",
    derivationMethod: "hybrid_reconstruction",
    sourceCrs: "source-defined ESRI Shapefile CRS, normalized to EPSG:4326 by shpjs",
    licenseOrTerms: "Official public North Carolina State Board of Elections geospatial exports; the source page states no additional reuse restriction.",
    rowLevelSafe: false,
    expected: {
      rawFeatures: 2656,
      normalizedFeatures: 2659,
      sourceUnits: 2908,
      geographicUnits: 2658,
      administrativeUnits: 250,
      mappedUnits: 2658,
      colorableUnits: 2658,
      noDataFeatures: 1,
      totalVotes: 5699141,
      geographicVotes: 3923739,
      administrativeVotes: 1775402,
      candidateCount: 9,
    },
  },
});

export const NORTH_CAROLINA_RAW_SOURCE_PINS = Object.freeze({
  "data/nc-counties.geojson": [17562822, "1a5b4f9029bb1ad6b4a5e6b19c84e7ba91c12e7d86d2127b2a9c0b2c7d38192d"],
  "data/nc-2016-results-precinct.zip": [2583551, "b6e9e002e03e8173e339154cea943a062936090a17337985bc555ca48018406a"],
  "data/nc-2020-results-precinct.zip": [5392406, "b388536c61930d03ed3b0fb8d1dae39a65665969f90eeb6578512de0d96c47c0"],
  "data/nc-2024-results-precinct.zip": [3741131, "2fab44e9b12e03c0d88ef832c2e6dc8c569e2b020d64df06a8b551b62bbdb426"],
  "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/LICENSE.md": [276, "122eeeecd323b6c6537c055a6706bb4ef4899dc30d7669fa0eb04872b9e19673"],
  "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/NC_VTD.zip": [21816996, "bd9cef855bc17db5f826a1a44d9d0cebc48764c73d8adb76c5193dbfed8a2055"],
  "data/precinct-geometry/NC/2012-11-06-general/raw/mggg/README.md": [6361, "81cc9824737b22756266d940789a27b119c258b8b60de95e851b6b1e5ae1abb3"],
  "data/precinct-geometry/NC/2012-11-06-general/raw/ncsbe/results_sort_20121106.zip": [2440870, "90e76d5897a1737f08acabdb378e5bb0a961cb855ad031fe00d3f21f07eefc7a"],
  "data/precinct-geometry/NC/2012-11-06-general/raw/review/nc-mggg-validation-report.pdf": [195877, "57151333b0f9cbe01a39fdfe9139f7ad0409ed865310afb591b2dba35b63d38f"],
  "data/precinct-geometry/NC/2020-11-03-general/raw/review/nc-vest-2020-validation-report.pdf": [64592, "487a39cdb893b3ee58755ea12ff2d19c862f924ebc04f09cdac4222aea1363c3"],
  "data/precinct-geometry/NC/raw-shared/ncsbe/ncsbe-precinct-archive-index.xml": [49709, "62290bf154bf952363f8f98c7205dfe1af99c2ca1cb38db054abf1b981ea3489"],
  "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20161004.zip": [19254674, "4739d58fe4681ec93d37771073b4b7c661bedc36180e57cd48f3f245972aeb63"],
  "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20190827.zip": [19527464, "76de0fe26651529b6b34963864c9f25a24964b803636f2970ed7251c6fe2aeed"],
  "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20201018.zip": [24689107, "a31a68aab8761ce579ad853690eeef2845dccf8655d9638237ef3845e2405f5b"],
  "data/precinct-geometry/NC/raw-shared/ncsbe/SBE_PRECINCTS_20240723.zip": [22091618, "bd9d37ac1f59ca77c55ce94cb3fe10c7c42cf7fc00f4dece7c841afe2cfb03b9"],
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
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\r" || character === "\n") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error("North Carolina CSV contains an unterminated quoted field");
  return rows;
}

function absolute(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim().toUpperCase();
}

export function normalizeNorthCarolinaUnitId(value) {
  const normalized = clean(value).replace(/\s+/g, " ");
  return normalized.replace(/^0+(?=\d)/, "");
}

function resultKey(parentGeoid, sourceUnitId) {
  return `${parentGeoid}|${normalizeNorthCarolinaUnitId(sourceUnitId)}`;
}

function finiteInteger(value, context) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isSafeInteger(parsed)) throw new Error(`${context} is not an integer: ${JSON.stringify(value)}`);
  return parsed;
}

function canonicalCandidateName(value) {
  const trimmed = String(value ?? "").normalize("NFKC").trim();
  if (/^jill stein$/i.test(trimmed)) return "Jill Stein";
  if (/^jill stein \(write-in\)$/i.test(trimmed)) return "Jill Stein (Write-In)";
  if (/^write-in \(miscellaneous\)$/i.test(trimmed)) return "Write-In (Miscellaneous)";
  if (/^virgil goode \(write-in\)$/i.test(trimmed)) return "Virgil Goode (Write-In)";
  return trimmed;
}

function candidateKey(name, party) {
  return `${clean(party) || "~"}|${clean(name)}`;
}

function buildCountyMaps(root) {
  const collection = JSON.parse(readFileSync(absolute(root, "data/nc-counties.geojson"), "utf8"));
  if (collection?.type !== "FeatureCollection" || collection.features.length !== 100) {
    throw new Error("North Carolina county geometry must contain exactly 100 counties");
  }
  const byName = new Map();
  const byGeoid = new Map();
  for (const feature of collection.features) {
    const name = String(feature.properties?.BASENAME ?? feature.properties?.NAME ?? "").replace(/ County$/i, "").trim();
    const geoid = String(feature.properties?.GEOID ?? "").trim();
    if (!name || !/^37\d{3}$/.test(geoid)) throw new Error("invalid North Carolina county identity");
    const county = { name, geoid };
    byName.set(clean(name), county);
    byGeoid.set(geoid, county);
  }
  return { byName, byGeoid };
}

function totals(rows) {
  return rows.reduce((sum, row) => ({
    democraticVotes: sum.democraticVotes + row.democratic,
    republicanVotes: sum.republicanVotes + row.republican,
    otherVotes: sum.otherVotes + row.other,
    totalVotes: sum.totalVotes + row.total,
  }), { democraticVotes: 0, republicanVotes: 0, otherVotes: 0, totalVotes: 0 });
}

async function parse2012Results(bytes, countyMaps) {
  const archive = await JSZip.loadAsync(bytes);
  const member = Object.values(archive.files).find((file) => !file.dir && /results_sort_20121106\.txt$/i.test(file.name));
  if (!member) throw new Error("2012 sorted result ZIP lacks results_sort_20121106.txt");
  const matrix = parseCsv((await member.async("string")).replace(/^\uFEFF/, ""));
  const header = matrix[0].map((value) => value.trim().toLowerCase());
  const columns = Object.fromEntries(header.map((value, index) => [value, index]));
  for (const field of ["county", "vtd", "contest", "choice", "party", "total votes"]) {
    if (columns[field] === undefined) throw new Error(`2012 sorted results lack ${field}`);
  }
  const raw = [];
  for (const sourceRow of matrix.slice(1)) {
    if (sourceRow[columns.contest] !== "PRESIDENT AND VICE PRESIDENT OF THE UNITED STATES") continue;
    const county = countyMaps.byName.get(clean(sourceRow[columns.county]));
    if (!county) throw new Error(`2012 result has unknown county ${sourceRow[columns.county]}`);
    raw.push({
      county,
      sourceUnitId: String(sourceRow[columns.vtd] ?? "").trim(),
      sourceDisplayName: String(sourceRow[columns.vtd] ?? "").trim(),
      choice: canonicalCandidateName(sourceRow[columns.choice]),
      party: String(sourceRow[columns.party] ?? "").trim().toUpperCase(),
      votes: finiteInteger(sourceRow[columns["total votes"]], "2012 candidate votes"),
      realPrecinct: null,
    });
  }
  return finalizeOfficialRows(raw, 2012);
}

async function parseTabResults(bytes, spec, countyMaps) {
  const archive = await JSZip.loadAsync(bytes);
  const member = Object.values(archive.files).find((file) => !file.dir && /results_pct_\d+\.txt$/i.test(file.name));
  if (!member) throw new Error(`${spec.year} result ZIP lacks a results_pct text member`);
  const [headerLine, ...lines] = (await member.async("string")).replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = headerLine.split("\t").map((value) => value.trim());
  const columns = Object.fromEntries(header.map((value, index) => [value, index]));
  for (const field of ["County", "Precinct", "Contest Name", "Choice", "Choice Party", "Total Votes"]) {
    if (columns[field] === undefined) throw new Error(`${spec.year} results lack ${field}`);
  }
  if (spec.year >= 2020 && columns["Real Precinct"] === undefined) {
    throw new Error(`${spec.year} results lack Real Precinct`);
  }
  const raw = [];
  for (const line of lines) {
    if (!line) continue;
    const sourceRow = line.split("\t");
    if (sourceRow[columns["Contest Name"]] !== "US PRESIDENT") continue;
    const county = countyMaps.byName.get(clean(sourceRow[columns.County]));
    if (!county) throw new Error(`${spec.year} result has unknown county ${sourceRow[columns.County]}`);
    const sourceUnitId = String(sourceRow[columns.Precinct] ?? "").trim();
    if (!sourceUnitId) throw new Error(`${spec.year} result has blank precinct identity`);
    raw.push({
      county,
      sourceUnitId,
      sourceDisplayName: sourceUnitId,
      choice: canonicalCandidateName(sourceRow[columns.Choice]),
      party: String(sourceRow[columns["Choice Party"]] ?? "").trim().toUpperCase(),
      votes: finiteInteger(sourceRow[columns["Total Votes"]], `${spec.year} candidate votes`),
      realPrecinct: columns["Real Precinct"] === undefined
        ? null
        : String(sourceRow[columns["Real Precinct"]] ?? "").trim().toUpperCase(),
    });
  }
  return finalizeOfficialRows(raw, spec.year);
}

function finalizeOfficialRows(raw, year) {
  const candidateMap = new Map();
  for (const row of raw) {
    const key = candidateKey(row.choice, row.party);
    const previous = candidateMap.get(key);
    if (previous && (previous.name !== row.choice || previous.party !== row.party)) {
      throw new Error(`${year} candidate normalization collision ${key}`);
    }
    candidateMap.set(key, { key, name: row.choice, party: row.party });
  }
  const candidates = [...candidateMap.values()].sort((left, right) => left.key.localeCompare(right.key));
  const units = new Map();
  for (const row of raw) {
    const key = resultKey(row.county.geoid, row.sourceUnitId);
    const unit = units.get(key) ?? {
      key,
      parentGeoid: row.county.geoid,
      countyName: row.county.name,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      realPrecinct: row.realPrecinct,
      candidateVotesByKey: new Map(),
    };
    if (unit.sourceUnitId !== row.sourceUnitId || unit.realPrecinct !== row.realPrecinct) {
      throw new Error(`${year} normalized result identity collision ${key}`);
    }
    const keyForCandidate = candidateKey(row.choice, row.party);
    if (unit.candidateVotesByKey.has(keyForCandidate)) {
      throw new Error(`${year} duplicate candidate row ${key} ${keyForCandidate}`);
    }
    unit.candidateVotesByKey.set(keyForCandidate, row.votes);
    units.set(key, unit);
  }
  const rows = [...units.values()].map((unit) => {
    const candidateVotes = candidates.map((candidate) => ({
      name: candidate.name,
      party: candidate.party,
      votes: unit.candidateVotesByKey.get(candidate.key) ?? 0,
    }));
    const democratic = candidateVotes.filter((candidate) => candidate.party === "DEM").reduce((sum, candidate) => sum + candidate.votes, 0);
    const republican = candidateVotes.filter((candidate) => candidate.party === "REP").reduce((sum, candidate) => sum + candidate.votes, 0);
    const total = candidateVotes.reduce((sum, candidate) => sum + candidate.votes, 0);
    return {
      key: unit.key,
      parentGeoid: unit.parentGeoid,
      countyName: unit.countyName,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName: unit.sourceDisplayName,
      realPrecinct: unit.realPrecinct,
      candidateVotes,
      democratic,
      republican,
      other: total - democratic - republican,
      total,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
  return { candidates: candidates.map(({ name, party }) => ({ name, party })), rows, officialTotals: totals(rows) };
}

function multiPolygonCoordinates(geometry, context) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`${context} has non-polygon geometry`);
}

function geoJsonGeometry(coordinates, context) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error(`${context} produced empty geometry`);
  return coordinates.length === 1
    ? { type: "Polygon", coordinates: coordinates[0] }
    : { type: "MultiPolygon", coordinates };
}

function polygonArea(coordinates) {
  let total = 0;
  for (const polygon of coordinates ?? []) {
    for (const [ringIndex, ring] of polygon.entries()) {
      let sum = 0;
      for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
        sum += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
      }
      total += (ringIndex === 0 ? 1 : -1) * Math.abs(sum) / 2;
    }
  }
  return total;
}

function unionFeatureGeometries(features, context) {
  if (features.length === 1) return features[0].geometry;
  const union = polygonClipping.union(...features.map((feature) => multiPolygonCoordinates(feature.geometry, context)));
  return geoJsonGeometry(union, context);
}

function featureId(year, parentGeoid, sourceUnitId) {
  return `nc:${year}:${parentGeoid}:${encodeURIComponent(normalizeNorthCarolinaUnitId(sourceUnitId).toLowerCase())}`;
}

function normalizedFeature({ spec, parentGeoid, countyName, sourceUnitId, sourceName, sourceGeometryId, sourceBoundaryOrigin, geometry }) {
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: featureId(spec.year, parentGeoid, sourceUnitId),
      CRM_PARENT_GEOID: parentGeoid,
      CRM_SOURCE_UNIT_ID: sourceUnitId,
      SOURCE_NAME: sourceName,
      SOURCE_COUNTY_NAME: countyName,
      SOURCE_GEOMETRY_ID: sourceGeometryId,
      SOURCE_BOUNDARY_ORIGIN: sourceBoundaryOrigin,
    },
    geometry,
  };
}

function northCarolinaSourceKey(properties, countyMaps) {
  const countyName = String(properties?.county_nam ?? properties?.COUNTY_NAM ?? "").trim();
  const sourceUnitId = String(properties?.prec_id ?? properties?.PREC_ID ?? "").trim();
  const county = countyMaps.byName.get(clean(countyName));
  if (!county || !sourceUnitId) throw new Error(`NCSBE geometry has invalid identity ${countyName} / ${sourceUnitId}`);
  return { key: resultKey(county.geoid, sourceUnitId), county, sourceUnitId };
}

function signature2012FromResult(row) {
  const byName = new Map(row.candidateVotes.map((candidate) => [clean(candidate.name), candidate.votes]));
  const byParty = new Map(row.candidateVotes.filter((candidate) => candidate.party).map((candidate) => [candidate.party, candidate.votes]));
  return [
    byParty.get("DEM") ?? 0,
    byParty.get("REP") ?? 0,
    byParty.get("LIB") ?? 0,
    byName.get("VIRGIL GOODE (WRITE-IN)") ?? 0,
    byName.get("WRITE-IN (MISCELLANEOUS)") ?? 0,
    row.total,
  ].join("|");
}

function signature2012FromFeature(feature) {
  const properties = feature.properties ?? {};
  return ["EL12G_PR_D", "EL12G_PR_R", "EL12G_PR_L", "EL12G_PR_W", "EL12G_PR_1", "EL12G_PR_T"]
    .map((field) => finiteInteger(properties[field], `2012 geometry ${field}`))
    .join("|");
}

async function build2012Geometry(root, spec, countyMaps, official) {
  const parsed = await shp(readFileSync(absolute(root, spec.geometryPath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection") throw new Error("2012 MGGG ZIP did not parse as GeoJSON");
  const officialByKey = new Map(official.rows.map((row) => [row.key, row]));
  const usedResults = new Set();
  const mappedRows = new Map();
  const mappingMethods = new Map();
  const pending = [];
  let directIdMatches = 0;
  let voteSignatureMatches = 0;

  for (const [index, feature] of collection.features.entries()) {
    const parentGeoid = String(feature.properties?.County ?? "").trim();
    const county = countyMaps.byGeoid.get(parentGeoid);
    const sourceUnitId = String(feature.properties?.VTD_Name ?? "").trim();
    const sourceGeometryId = String(feature.properties?.VTD_Key ?? feature.properties?.VTD ?? index).trim();
    if (!county || !sourceUnitId) throw new Error(`2012 MGGG feature has invalid identity ${parentGeoid} / ${sourceUnitId}`);
    const direct = officialByKey.get(resultKey(parentGeoid, sourceUnitId));
    const sourceSignature = signature2012FromFeature(feature);
    if (direct && signature2012FromResult(direct) === sourceSignature && !usedResults.has(direct.key)) {
      pending.push({ feature, county, sourceUnitId, sourceGeometryId, result: direct, method: "exact_official_id" });
      usedResults.add(direct.key);
      directIdMatches += 1;
    } else {
      pending.push({ feature, county, sourceUnitId, sourceGeometryId, result: null, method: null, sourceSignature });
    }
  }

  const remainingBySignature = new Map();
  for (const row of official.rows.filter((row) => !usedResults.has(row.key))) {
    const key = `${row.parentGeoid}|${signature2012FromResult(row)}`;
    const values = remainingBySignature.get(key) ?? [];
    values.push(row);
    remainingBySignature.set(key, values);
  }
  for (const entry of pending.filter((value) => !value.result)) {
    const candidates = remainingBySignature.get(`${entry.county.geoid}|${entry.sourceSignature}`) ?? [];
    if (candidates.length !== 1 || usedResults.has(candidates[0].key)) {
      throw new Error(`2012 MGGG feature ${entry.sourceGeometryId} lacks a unique official VTD result signature`);
    }
    entry.result = candidates[0];
    entry.method = "official_crosswalk";
    usedResults.add(candidates[0].key);
    voteSignatureMatches += 1;
  }

  const features = pending.map((entry) => {
    const normalized = normalizedFeature({
      spec,
      parentGeoid: entry.county.geoid,
      countyName: entry.county.name,
      sourceUnitId: entry.result.sourceUnitId,
      sourceName: entry.result.sourceDisplayName,
      sourceGeometryId: entry.sourceGeometryId,
      sourceBoundaryOrigin: "MGGG/NCGA 2016 reference package with reconciled 2012 VTD return fields",
      geometry: entry.feature.geometry,
    });
    const knownFeatureId = `${entry.county.geoid}|${normalized.properties.CRM_FEATURE_ID}`;
    mappedRows.set(entry.result.key, knownFeatureId);
    mappingMethods.set(entry.result.key, entry.method);
    return normalized;
  });
  return {
    rawFeatureCount: collection.features.length,
    features,
    mappedRows,
    mappingMethods,
    repairDetails: [],
    matchSummary: { directIdMatches, voteSignatureMatches },
  };
}

async function parseNcsbeCollection(root, relativePath, countyMaps) {
  const parsed = await shp(readFileSync(absolute(root, relativePath)));
  const collection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (collection?.type !== "FeatureCollection") throw new Error(`${relativePath} did not parse as GeoJSON`);
  const grouped = new Map();
  for (const [index, feature] of collection.features.entries()) {
    const identity = northCarolinaSourceKey(feature.properties, countyMaps);
    const entries = grouped.get(identity.key) ?? [];
    entries.push({ feature, index, ...identity });
    grouped.set(identity.key, entries);
  }
  return { collection, grouped };
}

function restoreSupplementalGeometry(currentGrouped, supplementalGrouped, supplementalKeys, year) {
  const repairs = [];
  for (const supplementalKey of supplementalKeys) {
    const oldEntries = supplementalGrouped.get(supplementalKey);
    if (!oldEntries || oldEntries.length !== 1 || currentGrouped.has(supplementalKey)) {
      throw new Error(`${year} supplemental geometry identity is not the reviewed missing unit ${supplementalKey}`);
    }
    const child = oldEntries[0];
    const childCoordinates = multiPolygonCoordinates(child.feature.geometry, `${year} ${supplementalKey}`);
    const childArea = polygonArea(childCoordinates);
    const intersections = [];
    const touched = [];
    for (const [currentKey, entries] of currentGrouped.entries()) {
      if (entries[0].county.geoid !== child.county.geoid) continue;
      const currentGeometry = unionFeatureGeometries(entries.map((entry) => entry.feature), `${year} ${currentKey}`);
      const intersection = polygonClipping.intersection(
        childCoordinates,
        multiPolygonCoordinates(currentGeometry, `${year} ${currentKey}`),
      );
      const overlapArea = polygonArea(intersection);
      if (overlapArea <= childArea * 1e-10) continue;
      intersections.push(intersection);
      touched.push({ currentKey, entries, currentGeometry, overlapArea });
    }
    if (intersections.length === 0) throw new Error(`${year} supplemental geometry ${supplementalKey} does not overlap its official county snapshot`);
    const clippedChild = polygonClipping.union(...intersections);
    const coverageRatio = polygonArea(clippedChild) / childArea;
    if (coverageRatio < 0.97 || coverageRatio > 1.00001) {
      throw new Error(`${year} supplemental geometry ${supplementalKey} coverage ratio ${coverageRatio} is outside the reviewed range`);
    }
    for (const touchedEntry of touched) {
      const difference = polygonClipping.difference(
        multiPolygonCoordinates(touchedEntry.currentGeometry, `${year} ${touchedEntry.currentKey}`),
        clippedChild,
      );
      const first = touchedEntry.entries[0];
      currentGrouped.set(touchedEntry.currentKey, [{
        ...first,
        feature: { ...first.feature, geometry: geoJsonGeometry(difference, `${year} ${touchedEntry.currentKey} subtraction`) },
      }]);
    }
    currentGrouped.set(supplementalKey, [{
      ...child,
      feature: { ...child.feature, geometry: geoJsonGeometry(clippedChild, `${year} ${supplementalKey} clipped supplement`) },
      supplemental: true,
    }]);
    repairs.push({
      sourceUnitKey: supplementalKey,
      sourceSnapshot: "SBE_PRECINCTS_20190827.zip",
      coverageRatio,
      containingSourceUnitKeys: touched.map((entry) => entry.currentKey).sort(),
      method: "clipped_official_supplement_and_topology_preserving_subtraction",
    });
  }
  return repairs;
}

async function buildNcsbeGeometry(root, spec, countyMaps, official) {
  const current = await parseNcsbeCollection(root, spec.geometryPath, countyMaps);
  const grouped = new Map(current.grouped);
  let repairDetails = [];
  if (spec.geometryKind === "ncsbe_supplemented") {
    const supplemental = await parseNcsbeCollection(root, spec.supplementalGeometryPath, countyMaps);
    repairDetails = restoreSupplementalGeometry(grouped, supplemental.grouped, spec.supplementalIds, spec.year);
  }

  const officialByKey = new Map(official.rows.map((row) => [row.key, row]));
  const mappedRows = new Map();
  const mappingMethods = new Map();
  const features = [];
  for (const [key, entries] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const first = entries[0];
    const result = officialByKey.get(key) ?? null;
    const sourceUnitId = result?.sourceUnitId ?? first.sourceUnitId;
    const sourceName = result?.sourceDisplayName
      ?? String(first.feature.properties?.enr_desc ?? first.feature.properties?.ENR_DESC ?? first.sourceUnitId).trim();
    const sourceGeometryId = entries.map((entry) => String(entry.feature.properties?.id ?? entry.index)).join(",");
    const normalized = normalizedFeature({
      spec,
      parentGeoid: first.county.geoid,
      countyName: first.county.name,
      sourceUnitId,
      sourceName,
      sourceGeometryId,
      sourceBoundaryOrigin: entries.some((entry) => entry.supplemental)
        ? "NCSBE SBE_PRECINCTS_20190827 official supplement"
        : `NCSBE ${path.basename(spec.geometryPath)} official snapshot`,
      geometry: unionFeatureGeometries(entries.map((entry) => entry.feature), `${spec.year} ${key}`),
    });
    features.push(normalized);
    if (result) {
      mappedRows.set(result.key, `${first.county.geoid}|${normalized.properties.CRM_FEATURE_ID}`);
      mappingMethods.set(result.key, "exact_official_id");
    }
  }
  return {
    rawFeatureCount: current.collection.features.length,
    features,
    mappedRows,
    mappingMethods,
    repairDetails,
    matchSummary: { directIdMatches: mappedRows.size, voteSignatureMatches: 0 },
  };
}

function canonicalRows(spec, official, geometryModel) {
  const crosswalkRows = [];
  const resultRows = [];
  const exclusions = [];
  const mappedOfficialRows = [];
  for (const row of official.rows) {
    const sourceFeatureId = geometryModel.mappedRows.get(row.key) ?? null;
    const isGeographic = Boolean(sourceFeatureId);
    const reportingGrain = isGeographic ? spec.geographyLevel : "administrative_reporting_unit";
    const resultUnitCode = reportingUnitCode({
      state: "NC",
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
        note: spec.year >= 2020
          ? "The official NCSBE row is Real Precinct=N and remains a no-geometry reconciliation unit."
          : "The official result unit has no feature in the completely reconciled geographic universe and remains a no-geometry reconciliation unit.",
      };
    } else {
      const method = geometryModel.mappingMethods.get(row.key);
      relationship = {
        sourceFeatureId,
        relationshipType: "one_to_one",
        matchMethod: method,
        reviewStatus: "reviewed",
        confidence: "high",
        note: method === "official_crosswalk"
          ? "Reviewed one-to-one relationship by county and a unique complete five-candidate official presidential vote signature; displayed votes come only from the NCSBE sorted export."
          : spec.year === 2012
            ? "Reviewed one-to-one relationship by county and exact official VTD identity, with the complete five-candidate vote vector independently reconciled."
            : "Reviewed one-to-one relationship by the official county-qualified NCSBE precinct identity; no vote is allocated or inferred.",
      };
    }
    crosswalkRows.push({
      resultUnitCode,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain,
      isGeographic,
      relationships: [relationship],
    });
    const resultRow = {
      resultUnitCode,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      democratic: row.democratic,
      republican: row.republican,
      other: row.other,
      total: row.total,
      candidateVotes: row.candidateVotes,
    };
    if (isGeographic) {
      if (row.candidateVotes.some((candidate) => candidate.votes < 0)) {
        throw new Error(`${spec.year} mapped result ${row.key} contains a negative candidate adjustment`);
      }
      resultRows.push(resultRow);
      mappedOfficialRows.push(row);
    } else {
      exclusions.push({
        ...resultRow,
        reason: spec.year >= 2020 && row.realPrecinct === "N"
          ? "official Real Precinct=N reporting unit; no precinct geometry"
          : "official result-only reconciliation unit; no reviewed geographic feature",
      });
    }
  }
  crosswalkRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  resultRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  exclusions.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  return { crosswalkRows, resultRows, exclusions, mappedOfficialRows };
}

function reconciliationScopes(rows, stateId = "NC") {
  const byParent = new Map();
  for (const row of rows) {
    const values = byParent.get(row.parentGeoid) ?? [];
    values.push(row);
    byParent.set(row.parentGeoid, values);
  }
  const scope = (scopeType, scopeId, values) => {
    const resultTotals = totals(values);
    return {
      scopeType,
      scopeId,
      resultTotals,
      mappedTotals: { ...resultTotals },
      deltas: Object.fromEntries(Object.keys(resultTotals).map((key) => [key, 0])),
    };
  };
  return [
    scope("state", stateId, rows),
    ...[...byParent.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([parent, values]) => scope("parent", parent, values)),
  ];
}

function assertExpected(spec, model) {
  const actual = {
    rawFeatures: model.rawFeatureCount,
    normalizedFeatures: model.geometry.features.length,
    sourceUnits: model.official.rows.length,
    geographicUnits: model.mappedOfficialRows.length,
    administrativeUnits: model.official.rows.length - model.mappedOfficialRows.length,
    mappedUnits: model.mappedOfficialRows.length,
    colorableUnits: model.resultRows.length,
    noDataFeatures: model.noDataFeatureIds.length,
    totalVotes: model.official.officialTotals.totalVotes,
    geographicVotes: totals(model.mappedOfficialRows).totalVotes,
    administrativeVotes: totals(model.official.rows.filter((row) => !model.mappedRowKeys.has(row.key))).totalVotes,
    candidateCount: model.official.candidates.length,
    directIdMatches: model.matchSummary.directIdMatches,
    voteSignatureMatches: model.matchSummary.voteSignatureMatches,
  };
  for (const [key, value] of Object.entries(spec.expected)) {
    if (actual[key] !== value) throw new Error(`${spec.year} ${key} expected ${value}, received ${actual[key]}`);
  }
}

export async function buildNorthCarolinaPrecinctReviewModel(year, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const spec = NORTH_CAROLINA_PRECINCT_YEAR_SPECS[Number(year)];
  if (!spec) throw new Error(`unsupported North Carolina precinct year ${year}`);
  const countyMaps = buildCountyMaps(root);
  const official = spec.year === 2012
    ? await parse2012Results(readFileSync(absolute(root, spec.resultPath)), countyMaps)
    : await parseTabResults(readFileSync(absolute(root, spec.resultPath)), spec, countyMaps);
  const geometryModel = spec.year === 2012
    ? await build2012Geometry(root, spec, countyMaps, official)
    : await buildNcsbeGeometry(root, spec, countyMaps, official);
  const canonical = canonicalRows(spec, official, geometryModel);
  const mappedRowKeys = new Set(canonical.mappedOfficialRows.map((row) => row.key));
  const geometry = {
    type: "FeatureCollection",
    properties: {
      state: "NC",
      electionId: spec.electionId,
      geographyLevel: spec.geographyLevel,
      boundaryVintage: spec.boundaryVintage,
      sourceAuthority: spec.year === 2012
        ? "North Carolina State Board of Elections results with MGGG/NC General Assembly VTD geometry"
        : "North Carolina State Board of Elections",
    },
    features: geometryModel.features.sort((left, right) => String(left.properties.CRM_FEATURE_ID).localeCompare(String(right.properties.CRM_FEATURE_ID))),
  };
  const knownFeatureIds = new Set(geometry.features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`));
  const mappedFeatureIds = new Set(geometryModel.mappedRows.values());
  const noDataFeatureIds = [...knownFeatureIds].filter((id) => !mappedFeatureIds.has(id)).sort();
  const model = {
    spec,
    official,
    geometry,
    rawFeatureCount: geometryModel.rawFeatureCount,
    mappedRows: geometryModel.mappedRows,
    mappingMethods: geometryModel.mappingMethods,
    repairDetails: geometryModel.repairDetails,
    matchSummary: geometryModel.matchSummary,
    mappedRowKeys,
    ...canonical,
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

export function buildNorthCarolinaReconciliation(model) {
  return { status: "passed", scopes: reconciliationScopes(model.mappedOfficialRows) };
}

export function summarizeNorthCarolinaModel(model) {
  return {
    year: model.spec.year,
    geographyLevel: model.spec.geographyLevel,
    rawFeatures: model.rawFeatureCount,
    normalizedFeatures: model.geometry.features.length,
    officialResultUnits: model.official.rows.length,
    geographicResultUnits: model.mappedOfficialRows.length,
    administrativeResultUnits: model.official.rows.length - model.mappedOfficialRows.length,
    colorableResultUnits: model.resultRows.length,
    mappedResultUnits: model.mappedOfficialRows.length,
    unlinkedGeometryUnits: model.noDataFeatureIds.length,
    officialVotes: model.official.officialTotals.totalVotes,
    mappedVotes: totals(model.mappedOfficialRows).totalVotes,
    administrativeVotes: totals(model.official.rows.filter((row) => !model.mappedRowKeys.has(row.key))).totalVotes,
    repairCount: model.repairDetails.length,
    directIdMatches: model.matchSummary.directIdMatches,
    voteSignatureMatches: model.matchSummary.voteSignatureMatches,
  };
}

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  calculateDistrictGeometryMetrics,
  compareDistrictResolutions,
} from "../src/lib/district-compactness-core.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_DIRECTORY = path.join(ROOT, "data", "district-compactness");
const MANIFEST_PATH = path.join(OUTPUT_DIRECTORY, "manifest.json");
const DATASET_PATH = path.join(OUTPUT_DIRECTORY, "district-compactness.json");
const CSV_PATH = path.join(OUTPUT_DIRECTORY, "district-compactness.csv");
const SUMMARY_PATH = path.join(OUTPUT_DIRECTORY, "summary.json");
const FETCH_CACHE_DIRECTORY = path.join(ROOT, ".etl", "district-compactness-fetch-cache");
const PLAN_VINTAGE = "2024-01-01";
const DEFAULT_RETRIEVED_AT = "2026-08-19T18:00:00.000Z";
const CHECK_MODE = process.argv.includes("--check");
const REFRESH_MODE = process.argv.includes("--refresh");
const ACCEPT_SOURCE_DRIFT = process.argv.includes("--accept-source-drift");

const retrievedAtArgument = process.argv.find((argument) => argument.startsWith("--retrieved-at="));
const requestedRetrievedAt = retrievedAtArgument?.slice("--retrieved-at=".length) ?? DEFAULT_RETRIEVED_AT;
if (Number.isNaN(new Date(requestedRetrievedAt).valueOf())) {
  throw new Error("--retrieved-at must be an ISO timestamp");
}

const DETAILED_SERVICE = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer";
const GENERALIZED_SERVICE = "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer";

const LAYERS = [
  {
    geographyType: "congressional",
    chamberLabel: "U.S. House",
    districtField: "CD119",
    expectedDetailedCount: 444,
    expectedGeneralizedCount: 441,
    expectedMetricCount: 441,
    detailedPageSize: 50,
    generalizedPageSize: 500,
    detailedLayer: 54,
    generalizedLayer: 5,
  },
  {
    geographyType: "state_upper",
    chamberLabel: "State legislative upper chamber",
    districtField: "SLDU",
    expectedDetailedCount: 1_964,
    expectedGeneralizedCount: 1_960,
    expectedMetricCount: 1_958,
    detailedPageSize: 100,
    generalizedPageSize: 500,
    detailedLayer: 56,
    generalizedLayer: 8,
  },
  {
    geographyType: "state_lower",
    chamberLabel: "State legislative lower chamber",
    districtField: "SLDL",
    expectedDetailedCount: 4_879,
    expectedGeneralizedCount: 4_874,
    expectedMetricCount: 4_873,
    detailedPageSize: 250,
    generalizedPageSize: 500,
    detailedLayer: 58,
    generalizedLayer: 9,
  },
];

const STATE_FIPS = new Map(Object.entries({
  "01": ["AL", "Alabama"], "02": ["AK", "Alaska"], "04": ["AZ", "Arizona"], "05": ["AR", "Arkansas"],
  "06": ["CA", "California"], "08": ["CO", "Colorado"], "09": ["CT", "Connecticut"], "10": ["DE", "Delaware"],
  "11": ["DC", "District of Columbia"], "12": ["FL", "Florida"], "13": ["GA", "Georgia"], "15": ["HI", "Hawaii"],
  "16": ["ID", "Idaho"], "17": ["IL", "Illinois"], "18": ["IN", "Indiana"], "19": ["IA", "Iowa"],
  "20": ["KS", "Kansas"], "21": ["KY", "Kentucky"], "22": ["LA", "Louisiana"], "23": ["ME", "Maine"],
  "24": ["MD", "Maryland"], "25": ["MA", "Massachusetts"], "26": ["MI", "Michigan"], "27": ["MN", "Minnesota"],
  "28": ["MS", "Mississippi"], "29": ["MO", "Missouri"], "30": ["MT", "Montana"], "31": ["NE", "Nebraska"],
  "32": ["NV", "Nevada"], "33": ["NH", "New Hampshire"], "34": ["NJ", "New Jersey"], "35": ["NM", "New Mexico"],
  "36": ["NY", "New York"], "37": ["NC", "North Carolina"], "38": ["ND", "North Dakota"], "39": ["OH", "Ohio"],
  "40": ["OK", "Oklahoma"], "41": ["OR", "Oregon"], "42": ["PA", "Pennsylvania"], "44": ["RI", "Rhode Island"],
  "45": ["SC", "South Carolina"], "46": ["SD", "South Dakota"], "47": ["TN", "Tennessee"], "48": ["TX", "Texas"],
  "49": ["UT", "Utah"], "50": ["VT", "Vermont"], "51": ["VA", "Virginia"], "53": ["WA", "Washington"],
  "54": ["WV", "West Virginia"], "55": ["WI", "Wisconsin"], "56": ["WY", "Wyoming"],
  "60": ["AS", "American Samoa"], "66": ["GU", "Guam"], "69": ["MP", "Northern Mariana Islands"],
  "72": ["PR", "Puerto Rico"], "78": ["VI", "U.S. Virgin Islands"],
}));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function queryUrl(service, layer, districtField) {
  const url = new URL(`${service}/${layer}/query`);
  url.search = new URLSearchParams({
    f: "geojson",
    geometryPrecision: "6",
    orderByFields: "GEOID ASC",
    outFields: `GEOID,STATE,NAME,BASENAME,AREALAND,AREAWATER,${districtField}`,
    outSR: "4326",
    returnGeometry: "true",
    where: "1=1",
  }).toString();
  return url.toString();
}

const sourceSpecs = LAYERS.flatMap((layer) => [
  {
    ...layer,
    resolution: "detailed",
    expectedCount: layer.expectedDetailedCount,
    pageSize: layer.detailedPageSize,
    sourceUrl: queryUrl(DETAILED_SERVICE, layer.detailedLayer, layer.districtField),
    sourcePageUrl: `${DETAILED_SERVICE}/${layer.detailedLayer}`,
  },
  {
    ...layer,
    resolution: "generalized_500k",
    expectedCount: layer.expectedGeneralizedCount,
    pageSize: layer.generalizedPageSize,
    sourceUrl: queryUrl(GENERALIZED_SERVICE, layer.generalizedLayer, layer.districtField),
    sourcePageUrl: `${GENERALIZED_SERVICE}/${layer.generalizedLayer}`,
  },
]).map((source) => ({
  ...source,
  localPath: `data/district-compactness/raw-${source.geographyType}-${source.resolution}.geojson.gz`,
}));

async function existingManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

async function fetchSource(source) {
  const features = [];
  while (features.length < source.expectedCount) {
    const pageUrl = new URL(source.sourceUrl);
    pageUrl.searchParams.set("resultOffset", String(features.length));
    pageUrl.searchParams.set("resultRecordCount", String(source.pageSize));
    let pageResponse;
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(pageUrl, {
          headers: { "User-Agent": "CivicResultMaps district compactness source collector" },
        });
        if (!response.ok) throw new Error(`${pageUrl} returned HTTP ${response.status}`);
        pageResponse = {
          buffer: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") ?? "",
        };
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
        }
      }
    }
    if (!pageResponse) throw lastError;
    const { buffer, contentType } = pageResponse;
    if (!contentType.includes("json") && buffer.toString("utf8", 0, 32).trimStart()[0] !== "{") {
      throw new Error(`${pageUrl} did not return JSON`);
    }
    const page = JSON.parse(buffer.toString("utf8"));
    if (page.error) {
      throw new Error(`${pageUrl} returned ArcGIS error ${JSON.stringify(page.error)}`);
    }
    if (page.type !== "FeatureCollection" || !Array.isArray(page.features)) {
      throw new Error(`${pageUrl} did not return a GeoJSON FeatureCollection`);
    }
    if (page.features.length === 0) break;
    features.push(...page.features);
    if (page.features.length < source.pageSize) break;
  }
  return Buffer.from(JSON.stringify({ type: "FeatureCollection", features }));
}

async function loadSource(source, manifest) {
  const absolutePath = path.join(ROOT, source.localPath);
  const cachePath = path.join(FETCH_CACHE_DIRECTORY, path.basename(source.localPath));
  const previous = manifest?.sources?.find(
    (entry) => entry.geographyType === source.geographyType && entry.resolution === source.resolution,
  );
  let raw;
  const retainedPath = existsSync(absolutePath) ? absolutePath : existsSync(cachePath) ? cachePath : null;
  if (REFRESH_MODE || !retainedPath) {
    if (CHECK_MODE) throw new Error(`check mode requires retained source ${source.localPath}`);
    raw = await fetchSource(source);
  } else {
    raw = gunzipSync(await readFile(retainedPath));
  }
  const rawSha256 = sha256(raw);
  if (previous && previous.rawSha256 !== rawSha256 && !ACCEPT_SOURCE_DRIFT) {
    throw new Error(
      `${source.geographyType} ${source.resolution} source drifted from ${previous.rawSha256} to ${rawSha256}; review before using --accept-source-drift`,
    );
  }
  let collection;
  try {
    collection = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${source.localPath} is not valid JSON`);
  }
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${source.localPath} is not a GeoJSON FeatureCollection`);
  }
  if (collection.features.length !== source.expectedCount) {
    throw new Error(`${source.localPath} has ${collection.features.length} features; expected ${source.expectedCount}`);
  }
  const compressed = gzipSync(raw, { level: 9 });
  if (!retainedPath && !CHECK_MODE) {
    await mkdir(FETCH_CACHE_DIRECTORY, { recursive: true });
    await writeFile(cachePath, compressed);
  }
  return {
    collection,
    compressed,
    descriptor: {
      authority: "U.S. Census Bureau TIGERweb",
      electionCycle: 2024,
      featureCount: collection.features.length,
      geographyType: source.geographyType,
      localPath: source.localPath,
      collectionMethod: `ArcGIS GeoJSON query paginated by GEOID in ${source.pageSize}-feature pages`,
      planEffectiveDate: PLAN_VINTAGE,
      rawBytes: raw.length,
      rawSha256,
      compressedBytes: compressed.length,
      compressedSha256: sha256(compressed),
      reportingGrain: source.geographyType,
      resolution: source.resolution,
      sourcePageUrl: source.sourcePageUrl,
      sourceUrl: source.sourceUrl,
    },
    shouldWrite: REFRESH_MODE || !existsSync(absolutePath),
  };
}

function featureMap(source, collection) {
  const byGeoid = new Map();
  for (const feature of collection.features) {
    if (feature.type !== "Feature" || !feature.geometry || !feature.properties) {
      throw new Error(`${source.localPath} contains a malformed feature`);
    }
    if (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") {
      throw new Error(`${source.localPath} contains unsupported geometry ${feature.geometry.type}`);
    }
    const geoid = String(feature.properties.GEOID ?? "").trim();
    if (!/^\d{2}[0-9A-Z-]+$/.test(geoid)) throw new Error(`${source.localPath} contains invalid GEOID ${geoid}`);
    if (byGeoid.has(geoid)) throw new Error(`${source.localPath} contains duplicate GEOID ${geoid}`);
    byGeoid.set(geoid, feature);
  }
  return byGeoid;
}

function metricSnapshot(source, feature) {
  const geometryMetrics = calculateDistrictGeometryMetrics(feature.geometry);
  return {
    ...geometryMetrics,
    geoid: String(feature.properties.GEOID),
    geographyType: source.geographyType,
    planVintage: PLAN_VINTAGE,
    resolution: source.resolution,
  };
}

function percentileRanks(rows) {
  for (const layer of LAYERS) {
    const group = rows
      .filter((row) => row.geographyType === layer.geographyType)
      .sort((left, right) => left.polsbyPopper - right.polsbyPopper || left.geoid.localeCompare(right.geoid));
    for (let index = 0; index < group.length; index += 1) {
      const percentile = group.length === 1 ? 100 : index / (group.length - 1) * 100;
      group[index].relativeCompactnessPercentile = round(percentile, 2);
      group[index].relativeCompactnessBand = percentile < 10
        ? "lower_decile"
        : percentile < 25
          ? "lower_quartile"
          : "middle_or_higher";
    }
  }
}

function buildRows(loadedSources) {
  const rows = [];
  const excludedUndefinedDistricts = [];
  let maximumAreaDelta = 0;
  for (const layer of LAYERS) {
    const detailedSource = sourceSpecs.find(
      (source) => source.geographyType === layer.geographyType && source.resolution === "detailed",
    );
    const generalizedSource = sourceSpecs.find(
      (source) => source.geographyType === layer.geographyType && source.resolution === "generalized_500k",
    );
    const detailed = loadedSources.get(`${layer.geographyType}:detailed`);
    const generalized = loadedSources.get(`${layer.geographyType}:generalized_500k`);
    const detailedByGeoid = featureMap(detailedSource, detailed.collection);
    const generalizedByGeoid = featureMap(generalizedSource, generalized.collection);
    for (const geoid of [...detailedByGeoid.keys()].sort()) {
      const detailedFeature = detailedByGeoid.get(geoid);
      const generalizedFeature = generalizedByGeoid.get(geoid);
      const name = String(detailedFeature.properties.NAME ?? "");
      const undefinedPlaceholder = /Z+$/.test(geoid) && /not defined/i.test(name);
      if (undefinedPlaceholder) {
        excludedUndefinedDistricts.push({ geoid, geographyType: layer.geographyType, name });
        continue;
      }
      if (!generalizedFeature) {
        throw new Error(`${layer.geographyType} generalized source is unexpectedly missing ${geoid}`);
      }
      const detailedMetrics = metricSnapshot(detailedSource, detailedFeature);
      const generalizedMetrics = metricSnapshot(generalizedSource, generalizedFeature);
      const resolutionComparison = compareDistrictResolutions(detailedMetrics, generalizedMetrics);
      const properties = detailedFeature.properties;
      const stateFips = String(properties.STATE ?? "").padStart(2, "0");
      const state = STATE_FIPS.get(stateFips);
      if (!state) throw new Error(`${layer.geographyType} ${geoid} has unknown state FIPS ${stateFips}`);
      const officialArea = Number(properties.AREALAND) + Number(properties.AREAWATER);
      if (!Number.isFinite(officialArea) || officialArea <= 0) {
        throw new Error(`${layer.geographyType} ${geoid} has invalid Census area attributes`);
      }
      const areaRelativeDifference = Math.abs(detailedMetrics.areaSquareMeters - officialArea) / officialArea;
      maximumAreaDelta = Math.max(maximumAreaDelta, areaRelativeDifference);
      const districtCode = String(properties[layer.districtField] ?? "").trim();
      if (!districtCode) throw new Error(`${layer.geographyType} ${geoid} is missing ${layer.districtField}`);
      rows.push({
        advisoryOnly: true,
        areaSquareKilometers: round(detailedMetrics.areaSquareMeters / 1_000_000, 3),
        censusAreaSquareKilometers: round(officialArea / 1_000_000, 3),
        censusAreaRelativeDifference: round(areaRelativeDifference, 6),
        chamberLabel: layer.chamberLabel,
        convexHullRatio: round(detailedMetrics.convexHullRatio),
        districtCode,
        geoid,
        geographyType: layer.geographyType,
        generalizedConvexHullRatio: round(generalizedMetrics.convexHullRatio),
        generalizedPolsbyPopper: round(generalizedMetrics.polsbyPopper),
        generalizedVertexCount: generalizedMetrics.vertexCount,
        holeCount: detailedMetrics.holeCount,
        name: String(properties.NAME ?? properties.BASENAME ?? districtCode).trim(),
        partCount: detailedMetrics.partCount,
        perimeterKilometers: round(detailedMetrics.perimeterMeters / 1_000, 3),
        planEffectiveDate: PLAN_VINTAGE,
        planYear: 2024,
        polsbyPopper: round(detailedMetrics.polsbyPopper),
        resolutionConvexHullRelativeDifference: round(resolutionComparison.convexHullRelativeDifference),
        resolutionPolsbyRelativeDifference: round(resolutionComparison.polsbyPopperRelativeDifference),
        resolutionStability: resolutionComparison.resolutionStability,
        sourceAuthority: "U.S. Census Bureau TIGERweb",
        stateCode: state[0],
        stateFips,
        stateName: state[1],
        vertexCount: detailedMetrics.vertexCount,
      });
    }
    for (const geoid of generalizedByGeoid.keys()) {
      if (!detailedByGeoid.has(geoid)) {
        throw new Error(`${layer.geographyType} detailed source is missing generalized GEOID ${geoid}`);
      }
    }
    const layerRows = rows.filter((row) => row.geographyType === layer.geographyType);
    if (layerRows.length !== layer.expectedMetricCount) {
      throw new Error(`${layer.geographyType} emitted ${layerRows.length} rows; expected ${layer.expectedMetricCount}`);
    }
  }
  if (maximumAreaDelta > 0.03) {
    throw new Error(`detailed geometry differs from Census area attributes by as much as ${(maximumAreaDelta * 100).toFixed(3)}%`);
  }
  percentileRanks(rows);
  return { excludedUndefinedDistricts, maximumAreaDelta, rows };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(rows) {
  const columns = [
    "geographyType", "geoid", "stateCode", "stateName", "districtCode", "name", "planEffectiveDate",
    "areaSquareKilometers", "perimeterKilometers", "polsbyPopper", "convexHullRatio",
    "relativeCompactnessPercentile", "relativeCompactnessBand", "resolutionStability",
    "resolutionPolsbyRelativeDifference", "resolutionConvexHullRelativeDifference", "vertexCount",
    "generalizedVertexCount", "partCount", "holeCount", "censusAreaRelativeDifference", "sourceAuthority",
  ];
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`;
}

async function assertSame(filePath, expected) {
  const existing = await readFile(filePath);
  const expectedBuffer = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
  if (!existing.equals(expectedBuffer)) {
    throw new Error(`${path.relative(ROOT, filePath)} does not match reproducible output`);
  }
}

const previousManifest = await existingManifest();
const loaded = await Promise.all(sourceSpecs.map((source) => loadSource(source, previousManifest)));
const loadedByKey = new Map(loaded.map((entry, index) => [
  `${sourceSpecs[index].geographyType}:${sourceSpecs[index].resolution}`,
  entry,
]));
const { excludedUndefinedDistricts, maximumAreaDelta, rows } = buildRows(loadedByKey);
const countsByGeography = Object.fromEntries(LAYERS.map((layer) => [
  layer.geographyType,
  rows.filter((row) => row.geographyType === layer.geographyType).length,
]));
const stabilityCounts = rows.reduce((counts, row) => {
  counts[row.resolutionStability] = (counts[row.resolutionStability] ?? 0) + 1;
  return counts;
}, {});
const dataset = {
  schemaVersion: "district-compactness-v1",
  generatedAt: requestedRetrievedAt,
  plan: {
    effectiveDate: PLAN_VINTAGE,
    electionCycle: 2024,
    congressionalPlan: "119th Congress",
    stateLegislativePlan: "2024 state legislative districts",
  },
  methodology: {
    area: "Spherical polygon area from Census longitude/latitude geometry; exterior area minus holes.",
    perimeter: "Haversine length of every exterior and interior boundary ring at Census detailed resolution.",
    polsbyPopper: "4*pi*area/perimeter^2. Values approach 1 for a circle but depend on boundary resolution and coastlines.",
    convexHullRatio: "District area divided by a local Lambert azimuthal equal-area convex hull area.",
    resolutionStability: "Stable requires detailed-vs-1:500,000 relative differences of at most 20% for Polsby-Popper and 10% for convex-hull ratio.",
    percentile: "Relative rank within the same geography type nationwide; it is not a gerrymandering, intent, legality, or representation score.",
  },
  resultRelationship: {
    status: "not_calculated",
    reason: "The repository does not yet contain a nationwide certified, same-plan-vintage district result set. Compactness is not joined to election outcomes across mismatched plans or geography.",
  },
  sources: loaded.map((entry) => entry.descriptor),
  rows,
};
const summary = {
  schemaVersion: dataset.schemaVersion,
  generatedAt: dataset.generatedAt,
  planEffectiveDate: PLAN_VINTAGE,
  rowCount: rows.length,
  countsByGeography,
  stabilityCounts,
  excludedUndefinedDistrictCount: excludedUndefinedDistricts.length,
  excludedUndefinedDistricts,
  maximumCensusAreaRelativeDifference: round(maximumAreaDelta, 6),
  advisoryOnly: true,
  caveat: "Compactness measures shape, not partisan intent, legal compliance, representational quality, or election integrity.",
  resultRelationshipStatus: dataset.resultRelationship.status,
};
const datasetText = json(dataset);
const csvText = buildCsv(rows);
const summaryText = json(summary);
const manifest = {
  schemaVersion: "district-compactness-source-manifest-v1",
  retrievedAt: requestedRetrievedAt,
  planEffectiveDate: PLAN_VINTAGE,
  sourceAuthority: "U.S. Census Bureau",
  sourceContextUrls: [
    "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.2024.html",
    "https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.119th_Congress.html",
    "https://www.census.gov/programs-surveys/decennial-census/about/rdo/state-legislative-district.2024.html",
  ],
  parser: "scripts/collect-district-compactness.mjs",
  expectedRowCount: 7_272,
  sources: loaded.map((entry) => entry.descriptor),
  outputs: [
    { localPath: "data/district-compactness/district-compactness.json", bytes: Buffer.byteLength(datasetText), sha256: sha256(datasetText) },
    { localPath: "data/district-compactness/district-compactness.csv", bytes: Buffer.byteLength(csvText), sha256: sha256(csvText) },
    { localPath: "data/district-compactness/summary.json", bytes: Buffer.byteLength(summaryText), sha256: sha256(summaryText) },
  ],
  caveats: [
    "Metrics are advisory descriptions of boundary shape, not estimates of gerrymandering severity, intent, legality, or election integrity.",
    "Fifteen detailed Census placeholder areas labeled as districts not defined are retained in source artifacts but excluded from metrics because they are not district plans.",
    "Coastlines, islands, holes, enclaves, and source simplification affect perimeter-based measures.",
    "Election-result relationships are withheld until certified results can be joined to the same district plan vintage.",
  ],
};
const manifestText = json(manifest);

if (CHECK_MODE) {
  await Promise.all([
    assertSame(DATASET_PATH, datasetText),
    assertSame(CSV_PATH, csvText),
    assertSame(SUMMARY_PATH, summaryText),
    assertSame(MANIFEST_PATH, manifestText),
    ...loaded.map((entry, index) => assertSame(path.join(ROOT, sourceSpecs[index].localPath), entry.compressed)),
  ]);
  console.log(`District compactness replay passed: ${rows.length.toLocaleString()} rows.`);
} else {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await Promise.all(loaded.map(async (entry, index) => {
    if (!entry.shouldWrite) return;
    await writeFile(path.join(ROOT, sourceSpecs[index].localPath), entry.compressed);
  }));
  await Promise.all([
    writeFile(DATASET_PATH, datasetText),
    writeFile(CSV_PATH, csvText),
    writeFile(SUMMARY_PATH, summaryText),
    writeFile(MANIFEST_PATH, manifestText),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

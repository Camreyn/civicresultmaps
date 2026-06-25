import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const defaults = {
  serviceUrl: 'https://services1.arcgis.com/FDsAtKBk8Hy4cAH0/arcgis/rest/services/2024_Election_Data_with_2025_Wards/FeatureServer/0',
  out: 'data/wi-2024-ward-geometry.geojson.gz',
  summary: 'data/wi-2024-ward-geometry-summary.json',
  tracker: 'data/wi-2024-remaining-data-collection-tracker.json',
  inventory: 'data/wi-2024-public-source-inventory.json',
  pageSize: 2000,
};

const outFields = [
  'OBJECTID',
  'GEOID',
  'CNTY_FIPS',
  'CNTY_NAME',
  'MCD_FIPS',
  'MCD_NAME',
  'CTV',
  'WARD_FIPS',
  'WARDID',
  'LABEL',
  'PRETOT24',
  'PREDEM24',
  'PREREP24',
];

function parseArgs(argv) {
  const options = { ...defaults, rawOut: '', updateTracker: false, updateInventory: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--service-url') options.serviceUrl = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--raw-out') options.rawOut = argv[++index];
    else if (arg === '--summary') options.summary = argv[++index];
    else if (arg === '--tracker') options.tracker = argv[++index];
    else if (arg === '--inventory') options.inventory = argv[++index];
    else if (arg === '--page-size') options.pageSize = Number(argv[++index]);
    else if (arg === '--update-tracker') options.updateTracker = true;
    else if (arg === '--update-inventory') options.updateInventory = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/collect-wi-ward-geometry.mjs [--update-tracker] [--update-inventory] [--out <geojson.gz>] [--raw-out <geojson>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'CivicResultMaps Wisconsin ward geometry collector' } });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

function queryUrl(base, params) {
  const url = new URL(`${base.replace(/\/$/, '')}/query`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function readJsonIfExists(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function updateTracker(trackerPath, summary) {
  const tracker = readJsonIfExists(trackerPath);
  if (!tracker) return false;
  const target = tracker.targets.find((row) => row.id === 'WI-WEC');
  const family = target?.families?.municipalWardGeometry;
  if (family) {
    family.collectionStatus = 'public_candidate_collected_needs_join_validation';
    family.requested = false;
    family.received = true;
    family.parserStatus = 'collected_geojson_not_promoted';
    family.normalizedArtifact = summary.localGeojsonGzip || summary.localGeojson || summary.localRawGeojson;
    family.notes = `${summary.sourceTitle}; ${summary.featureCount} features collected from official WI Legislature ArcGIS FeatureServer. Service uses January 2025 wards with November 2024 election data, so join validation is required before map promotion.`;
  }
  tracker.lastWardGeometryCollection = {
    generatedAt: summary.generatedAt,
    artifact: summary.localGeojsonGzip || summary.localGeojson || summary.localRawGeojson,
    summaryArtifact: summary.localSummary,
    sourceUrl: summary.sourceUrl,
    featureCount: summary.featureCount,
    countyCount: summary.countyCount,
    status: 'public_candidate_collected_needs_join_validation',
  };
  writeJson(trackerPath, tracker);
  return true;
}

function updateInventory(inventoryPath, summary) {
  const inventory = readJsonIfExists(inventoryPath);
  if (!inventory) return false;
  const id = 'wi-legislature-2024-election-data-jan2025-wards';
  const source = {
    id,
    families: ['municipalWardGeometry'],
    authority: 'Wisconsin Legislature / LTSB ArcGIS',
    sourceUrl: summary.sourceUrl,
    status: 'public_candidate_collected_needs_join_validation',
    notes: `${summary.sourceTitle}; ${summary.featureCount} polygon features collected. Validate against WEC ward review rows before production map use.`,
    probe: {
      checked: true,
      ok: true,
      status: 200,
      finalUrl: summary.sourceUrl,
      contentType: 'application/json; GeoJSON query endpoint',
      contentLength: '',
    },
    recommendation: 'Use as the municipal/ward geometry candidate and run join validation before enabling ward-level map rendering.',
  };
  inventory.sources = [...(inventory.sources ?? []).filter((row) => row.id !== id), source];
  inventory.summary.sourceCandidateCount = inventory.sources.length;
  inventory.summary.loadedContextCount = inventory.sources.filter((row) => row.status.startsWith('loaded_')).length;
  inventory.summary.requestPathCount = inventory.sources.filter((row) => row.status === 'request_path').length;
  inventory.summary.familyStatuses ??= {};
  if (inventory.summary.familyStatuses.municipalWardGeometry?.statusCounts) {
    inventory.summary.familyStatuses.municipalWardGeometry.statusCounts.public_candidate_collected_needs_join_validation = 1;
  }
  writeJson(inventoryPath, inventory);
  return true;
}

const options = parseArgs(process.argv);
const service = await fetchJson(`${options.serviceUrl}?f=json`);
const countResult = await fetchJson(queryUrl(options.serviceUrl, { f: 'json', where: '1=1', returnCountOnly: 'true' }));
const featureCount = Number(countResult.count ?? 0);
const features = [];

for (let offset = 0; offset < featureCount; offset += options.pageSize) {
  const page = await fetchJson(queryUrl(options.serviceUrl, {
    f: 'geojson',
    where: '1=1',
    outFields: outFields.join(','),
    returnGeometry: 'true',
    outSR: '4326',
    orderByFields: 'OBJECTID',
    resultOffset: offset,
    resultRecordCount: options.pageSize,
  }));
  features.push(...(page.features ?? []));
}

if (features.length !== featureCount) {
  throw new Error(`Expected ${featureCount} features but collected ${features.length}.`);
}

const counties = new Set(features.map((feature) => feature.properties?.CNTY_NAME).filter(Boolean));
const municipalities = new Set(features.map((feature) => `${feature.properties?.CNTY_NAME}|${feature.properties?.MCD_NAME}`).filter(Boolean));
const totalPresidentialVotes = features.reduce((sum, feature) => sum + Number(feature.properties?.PRETOT24 ?? 0), 0);

const geojson = {
  type: 'FeatureCollection',
  name: 'Wisconsin 2024 November Election Data with January 2025 Wards',
  crs: { type: 'name', properties: { name: 'EPSG:4326' } },
  metadata: {
    sourceTitle: service.name ?? 'November_2024_Election_Data_with_Jan2025_Wards',
    sourceDescription: service.description ?? service.serviceDescription ?? '',
    sourceUrl: options.serviceUrl,
    authority: 'Wisconsin Legislature / LTSB ArcGIS',
    collectedAt: new Date().toISOString(),
    status: 'public_candidate_collected_needs_join_validation',
    caveat: 'Source describes November 2024 election data with January 2025 wards. Validate ward joins against WEC review rows before production map use.',
  },
  features,
};

const geojsonText = `${JSON.stringify(geojson)}\n`;
fs.mkdirSync(path.dirname(options.out), { recursive: true });
if (options.out.endsWith('.gz')) {
  fs.writeFileSync(options.out, zlib.gzipSync(Buffer.from(geojsonText), { level: 9 }));
} else {
  fs.writeFileSync(options.out, geojsonText);
}
if (options.rawOut) {
  fs.mkdirSync(path.dirname(options.rawOut), { recursive: true });
  fs.writeFileSync(options.rawOut, geojsonText);
}
const summary = {
  state: 'WI',
  electionYear: 2024,
  generatedAt: new Date().toISOString().slice(0, 10),
  sourceTitle: service.name ?? 'November_2024_Election_Data_with_Jan2025_Wards',
  sourceDescription: service.description ?? service.serviceDescription ?? '',
  sourceUrl: options.serviceUrl,
  serviceItemId: '878d8826218f42509e07437a82ef6b6e',
  authority: 'Wisconsin Legislature / LTSB ArcGIS',
  status: 'public_candidate_collected_needs_join_validation',
  localGeojson: options.out.endsWith('.gz') ? '' : options.out,
  localGeojsonGzip: options.out.endsWith('.gz') ? options.out : '',
  localRawGeojson: options.rawOut,
  localSummary: options.summary,
  featureCount: features.length,
  countyCount: counties.size,
  municipalityCount: municipalities.size,
  totalPresidentialVotes,
  fields: outFields,
  caveats: [
    'FeatureServer description is November 2024 election data with January 2025 wards.',
    'This is a collected municipal/ward geometry candidate; it is not promoted to production ward-map rendering until join validation passes.',
    'The layer includes presidential vote fields but not registered-voter denominators, audit outcomes, or ballot-mode/CVR fields.',
  ],
};
writeJson(options.summary, summary);

const trackerUpdated = options.updateTracker ? updateTracker(options.tracker, summary) : false;
const inventoryUpdated = options.updateInventory ? updateInventory(options.inventory, summary) : false;

console.log(JSON.stringify({
  output: options.out,
  summary: options.summary,
  featureCount: features.length,
  countyCount: counties.size,
  municipalityCount: municipalities.size,
  totalPresidentialVotes,
  trackerUpdated,
  inventoryUpdated,
}, null, 2));

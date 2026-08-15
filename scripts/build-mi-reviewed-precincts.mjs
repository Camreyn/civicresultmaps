import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  inspectPrecinctGeometryManifest,
  reportingUnitCode,
} from "../src/lib/precinct-geography.ts";
import { inspectPrecinctCrosswalk } from "../src/lib/precinct-crosswalk.ts";
import {
  buildMichiganPrecinctJoinModel,
  MICHIGAN_PRECINCT_YEAR_SPECS,
} from "./audit-mi-official-precinct-joins.mjs";
import { validateManifestArtifacts } from "./lib/precinct-geometry-validation.mjs";

const ROOT = process.cwd();
const STATE = "MI";
const GENERATED_AT = "2026-08-15T02:22:39.949Z";
const AUTHORITY =
  "Michigan Department of State, Bureau of Elections; Michigan Department of Technology, Management and Budget, Center for Shared Solutions";
const GIS_TERMS =
  "The official ArcGIS item describes the dataset as a public record with no restrictions on use, reproduction, or distribution and provides it as-is.";
const COUNTY_NAME_ALIASES = new Map([
  ["GD TRAVERSE", "GRAND TRAVERSE"],
  ["ST CLAIR", "SAINT CLAIR"],
  ["ST JOSEPH", "SAINT JOSEPH"],
]);

const OUTPUT_SPECS = Object.freeze({
  2012: {
    date: "2012-11-06",
    base: "data/precinct-geometry/MI/2012-11-06-general",
    manifestId: "mi-2012-11-06-official-cycle-precinct-review-v2",
    retrievedAt: "2026-08-04T12:21:30.000Z",
    layerUrl:
      "https://gisp.mcgi.state.mi.us/maps/rest/services/BOE/precinctmapping/MapServer/0",
    resultUrl: "https://miboecfr.nictusa.com/cfr/presults/2012GEN.zip",
    biennialReportUrl:
      "https://www.michigan.gov/sos/-/media/Project/Websites/sos/Election-Results-and-Statistics/Biennial-Precinct-Report/2012-Biennial-Precinct-Report.pdf?rev=d7ad302b0ccc41ebaf75dd7848b8a8b3&hash=2EFD4A5CC1EF1AEACB0447F4D293C5F4",
    boundaryVintage:
      "Official legacy Michigan precinctmapping cohort labeled ElectionYear=2012; exact November 6 snapshot unconfirmed",
    vintageStatus: "unknown",
    sourceCrs: "EPSG:3785 (legacy ArcGIS WKID 102113)",
    terms:
      "Official source artifacts are retained for review. Public delivery is not approved because exact election-date custody and affirmative derivative redistribution terms remain unresolved.",
    rawArtifacts: [
      ["raw/mi-dtmb-boe-2012-precinct-candidate/2012-precinct-candidate-wgs84.geojson.gz", "official ArcGIS GeoJSON gzip", "Complete official service cohort where ElectionYear=2012."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/layer-metadata.json", "official ArcGIS layer metadata JSON", "Official legacy layer field and capability metadata."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/service-metadata.json", "official ArcGIS service metadata JSON", "Official mixed-year service inventory."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/service-fgdc-metadata.xml", "official ArcGIS FGDC metadata XML", "Official service lineage metadata."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/query-count-2012.json", "official ArcGIS count JSON", "Official count for the ElectionYear=2012 cohort."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/query-year-counts.json", "official ArcGIS grouped count JSON", "Official mixed-year cohort counts."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/source-ledger.json", "collection provenance JSON", "Hash-pinned official request and source ledger."],
      ["raw/mi-dtmb-boe-2012-precinct-candidate/2012-biennial-precinct-report.pdf", "official Michigan SOS PDF", "Official 2012 Biennial Precinct Report."],
      ["raw/mi-sos-mvic/2012GEN.zip", "official Michigan SOS tab-delimited ZIP", "Official 2012 General precinct result export."],
      ["raw/mi-sos-mvic/archived-official-download-page.html", "archived official Michigan result-page HTML", "Retained official page exposing the 2012GEN.zip download."],
    ],
  },
  2016: {
    date: "2016-11-08",
    base: "data/precinct-geometry/MI/2016-11-08-general",
    manifestId: "mi-2016-11-08-official-cycle-precinct-review-v2",
    retrievedAt: "2026-08-03T07:00:00.000Z",
    layerUrl:
      "https://gisagocss.state.mi.us/arcgis/rest/services/OpenData/boundaries/MapServer/1",
    resultUrl: "https://miboecfr.nictusa.com/cfr/presults/2016GEN.zip",
    biennialReportUrl:
      "https://www.michigan.gov/sos/-/media/Project/Websites/sos/Election-Results-and-Statistics/Biennial-Precinct-Report/2016-Biennial-Precinct-Report.pdf?rev=e3ed6d2584724c5c8e245c403cc7a394&hash=D49781BF074C6D84506C7B9223663A6D",
    boundaryVintage:
      "State of Michigan 2016 Voting Precincts election-cycle layer; exact November 8 snapshot unconfirmed",
    vintageStatus: "unknown",
    sourceCrs: "EPSG:3857 (service WKID 102100; latest WKID 3857)",
    terms: GIS_TERMS,
    rawArtifacts: [
      ["raw/mi-dtmb-boe-2016-voting-precincts/2016-voting-precincts-wgs84.geojson.gz", "official ArcGIS GeoJSON gzip", "Complete official 2016 election-cycle geometry."],
      ["raw/mi-dtmb-boe-2016-voting-precincts/layer-metadata.json", "official ArcGIS layer metadata JSON", "Official layer description and fields."],
      ["raw/mi-dtmb-boe-2016-voting-precincts/item-metadata.json", "official ArcGIS item metadata JSON", "Official item description, authority, and terms."],
      ["raw/mi-dtmb-boe-2016-voting-precincts/service-metadata.json", "official ArcGIS service metadata JSON", "Official service inventory."],
      ["raw/mi-dtmb-boe-2016-voting-precincts/query-count.json", "official ArcGIS count JSON", "Official 4,810-feature count."],
      ["raw/mi-dtmb-boe-2016-voting-precincts/collection-provenance.json", "collection provenance JSON", "Hash-pinned official request ledger."],
      ["raw/mi-dtmb-boe-2016-voting-precincts/2016-biennial-precinct-report.pdf", "official Michigan SOS PDF", "Official 2016 precinct count and cross-county context."],
      ["raw/mi-sos-mvic/2016GEN.zip", "official Michigan SOS tab-delimited ZIP", "Official 2016 General precinct result export."],
      ["raw/mi-sos-mvic/archived-official-download-page.html", "archived official Michigan result-page HTML", "Retained official page exposing the 2016GEN.zip download."],
    ],
  },
  2020: {
    date: "2020-11-03",
    base: "data/precinct-geometry/MI/2020-11-03-general",
    manifestId: "mi-2020-11-03-official-cycle-precinct-review-v2",
    retrievedAt: "2026-08-02T16:00:00.000Z",
    layerUrl:
      "https://gisagocss.state.mi.us/arcgis/rest/services/OpenData/boundaries/MapServer/6",
    resultUrl:
      "https://mvic.sos.state.mi.us/VoteHistory/GetPrecinctResultsFile?electionId=683",
    biennialReportUrl:
      "https://www.michigan.gov/sos/-/media/Project/Websites/sos/Election-Results-and-Statistics/Biennial-Precinct-Report/2020-Biennial-Precinct-Report.pdf?rev=fe750f0ab2894de28382f97ff49e8cbe&hash=A37A77B3FD849B79C118852DC7B06C78",
    boundaryVintage:
      "State of Michigan 2020 Voting Precincts election-cycle layer; exact November 3 snapshot unconfirmed",
    vintageStatus: "unknown",
    sourceCrs: "EPSG:3857 (service WKID 102100; latest WKID 3857)",
    terms: GIS_TERMS,
    rawArtifacts: [
      ["raw/mi-dtmb-boe-2020-voting-precincts/2020-voting-precincts-wgs84.geojson.gz", "official ArcGIS GeoJSON gzip", "Complete official 2020 election-cycle geometry."],
      ["raw/mi-dtmb-boe-2020-voting-precincts/layer-metadata.json", "official ArcGIS layer metadata JSON", "Official layer description and fields."],
      ["raw/mi-dtmb-boe-2020-voting-precincts/item-metadata.json", "official ArcGIS item metadata JSON", "Official item description, authority, and terms."],
      ["raw/mi-dtmb-boe-2020-voting-precincts/collection-provenance.json", "collection provenance JSON", "Hash-pinned official request ledger."],
      ["raw/mi-dtmb-boe-2020-voting-precincts/2020-biennial-precinct-report.pdf", "official Michigan SOS PDF", "Official 2020 precinct-count context."],
      ["raw/mi-sos-mvic/2020GEN.zip", "official Michigan SOS tab-delimited ZIP", "Official 2020 General precinct result export."],
    ],
  },
  2024: {
    date: "2024-11-05",
    base: "data/precinct-geometry/MI/2024-11-05-general",
    manifestId: "mi-2024-11-05-official-precinct-review-v2",
    retrievedAt: "2026-08-02T03:57:27.475Z",
    layerUrl:
      "https://gisagocss.state.mi.us/arcgis/rest/services/OpenData/boundaries/MapServer/9",
    resultUrl:
      "https://mvic.sos.state.mi.us/VoteHistory/GetPrecinctResultsFile?electionId=699",
    biennialReportUrl:
      "https://www.michigan.gov/sos/-/media/Project/Websites/sos/Election-Results-and-Statistics/Biennial-Precinct-Report/2024-Biennial-Precinct-Report.pdf?rev=5c2c85d5dabe4a01a02f3afe88c51f91&hash=4F687DE7952F4DDC351AFD1DF8012AFB",
    boundaryVintage:
      "State of Michigan 2024 Voting Precincts election-cycle layer (archived service copy VotingPrecincts2024_100824)",
    vintageStatus: "election_date_confirmed",
    sourceCrs: "EPSG:3078 (service WKID 102123)",
    terms: GIS_TERMS,
    rawArtifacts: [
      ["raw/mi-dtmb-boe-2024-voting-precincts/2024-voting-precincts-wgs84.geojson.gz", "official ArcGIS GeoJSON gzip", "Complete official 2024 election-cycle geometry."],
      ["raw/mi-dtmb-boe-2024-voting-precincts/layer-metadata.json", "official ArcGIS layer metadata JSON", "Official 2024 election-cycle description and fields."],
      ["raw/mi-dtmb-boe-2024-voting-precincts/item-metadata.json", "official ArcGIS item metadata JSON", "Official item description, authority, and terms."],
      ["raw/mi-dtmb-boe-2024-voting-precincts/metadata.xml", "official ArcGIS FGDC metadata XML", "Official field and lineage metadata."],
      ["raw/mi-dtmb-boe-2024-voting-precincts/collection-provenance.json", "collection provenance JSON", "Hash-pinned official request ledger."],
      ["raw/mi-sos-mvic/2024GEN.zip", "official Michigan SOS tab-delimited ZIP", "Official 2024 General precinct result export."],
      ["raw/mi-sos-mvic/2024-biennial-precinct-report.pdf", "official Michigan SOS PDF", "Official 2024 precinct count and cross-county jurisdiction context."],
    ],
  },
});

const SHARED_RAW_ARTIFACTS = Object.freeze([
  {
    relativePath:
      "data/precinct-geometry/MI/raw/census-2020-geographic-codes/county-subdivisions.json",
    format: "official Census TIGERweb JSON",
    note:
      "Official county-subdivision names and codes used only for municipality identity review.",
    sourceUrl:
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/22/query",
  },
  {
    relativePath:
      "data/precinct-geometry/MI/raw/census-2020-geographic-codes/county-subdivisions-layer-metadata.json",
    format: "official Census TIGERweb layer metadata JSON",
    note: "Official field and layer metadata for the county-subdivision identity table.",
    sourceUrl:
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/22?f=pjson",
  },
  {
    relativePath:
      "data/precinct-geometry/MI/raw/census-2020-geographic-codes/incorporated-places.json",
    format: "official Census TIGERweb JSON",
    note:
      "Official incorporated-place names and codes used only for municipality identity review.",
    sourceUrl:
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/28/query",
  },
  {
    relativePath:
      "data/precinct-geometry/MI/raw/census-2020-geographic-codes/incorporated-places-layer-metadata.json",
    format: "official Census TIGERweb layer metadata JSON",
    note: "Official field and layer metadata for the incorporated-place identity table.",
    sourceUrl:
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/28?f=pjson",
  },
]);

const RAW_SOURCE_PINS = Object.freeze({
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/2012-precinct-candidate-wgs84.geojson.gz": [10071954, "61962297587d38168fe1cc790a2f826d62c0e3e6d1dced4d1dc298b783105599"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/layer-metadata.json": [6305, "b21f297a80ba9ae6d1ab37c3c7f0dc139d85a7f1f99cc7df3dfcb0a21940e59f"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/service-metadata.json": [4360, "405fe6cedef715f4dcc0f8a0ac6b2256fe1aab81ae9884d1323d572990d1c71b"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/service-fgdc-metadata.xml": [15819, "91e60c5d8d9e29947380e40b2d0d795505235fe16bc5400aeadcb6f4c1fed8e1"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/query-count-2012.json": [14, "91943ea9490de1db527f83a5d9eb1611a8946db4d1d99d0768ec1f461d3dc953"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/query-year-counts.json": [511, "330a40a7de0fd263ed7fde916fdc489543bf0bb16a44eac40a5d8e3eecfad1e0"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/source-ledger.json": [15778, "4b37a3c7f8faef828314829f4b2a2d6c9dec2454c4cf96326793244f74b0980a"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-dtmb-boe-2012-precinct-candidate/2012-biennial-precinct-report.pdf": [184925, "656ad93100b799d5697fd8720ec1db858d736a941c4e5f11b636f0769fb908a1"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-sos-mvic/2012GEN.zip": [2095731, "229318cfda2cfda0151fa0816d3336ca59a74facb1bce66a347e9ef37ab32224"],
  "data/precinct-geometry/MI/2012-11-06-general/raw/mi-sos-mvic/archived-official-download-page.html": [8861, "ff6f7e7c36955ba18515529be813222c99b7a0f4314807fc9f8ae634c452f498"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/2016-voting-precincts-wgs84.geojson.gz": [7382064, "14ce9ebcedd5b5061ed7b858a3bd1bd9cc4a858c348fe2f338f3d1f7f8cdda62"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/layer-metadata.json": [5826, "6c078419758bfbe1c02c3a9a5a013b448d0835634cc68b49c4db2dda646ceabf"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/item-metadata.json": [6169, "2686e34e7d0fa662f8b9fe0ba3f652b9a83551f4b1463d1ac22eda6246a1a805"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/service-metadata.json": [5987, "b5b4f9799355729fbad0d1275922b847d70e4b3f1e189e618755374caff9f488"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/query-count.json": [14, "25da30c3e44b9101c07daf6fef8d3ee445ceb14e2a1a2bd1037249f3a706d7a3"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/collection-provenance.json": [5674, "7d936e0d18d94ba56f4f257774a821c538e887878636456830c5671ac146a397"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-dtmb-boe-2016-voting-precincts/2016-biennial-precinct-report.pdf": [1242561, "69e3c473fc80c6e84a4224e2aed1e8f1c9a679a7e5eb9e2db5b03d6f432a092d"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-sos-mvic/2016GEN.zip": [1568484, "9a4371dc0cf75c6d0b0abf279dfb4ffaa326729e196e5d6f30cb1cb20677dbba"],
  "data/precinct-geometry/MI/2016-11-08-general/raw/mi-sos-mvic/archived-official-download-page.html": [17274, "e36f95f6565f04c7ac21d673849e2fb918c6d1c8778d6ea426d9441d772aba32"],
  "data/precinct-geometry/MI/2020-11-03-general/raw/mi-dtmb-boe-2020-voting-precincts/2020-voting-precincts-wgs84.geojson.gz": [9443583, "fe9d991d341b3696434ea24968d32c87af738180e24b602d0683229dbee837c3"],
  "data/precinct-geometry/MI/2020-11-03-general/raw/mi-dtmb-boe-2020-voting-precincts/layer-metadata.json": [6679, "96662838cd1126519a86391d74c352bb3a249314529958eaf91c7ba1309bef8a"],
  "data/precinct-geometry/MI/2020-11-03-general/raw/mi-dtmb-boe-2020-voting-precincts/item-metadata.json": [5229, "ef9fb9e8425d20fb6bd74ee7d37afcd75f63fdde348309a8db060e30d788f44b"],
  "data/precinct-geometry/MI/2020-11-03-general/raw/mi-dtmb-boe-2020-voting-precincts/collection-provenance.json": [4831, "bc362a97f472c6e9a90d041165195160adcada18cc39f64931c767469f202a89"],
  "data/precinct-geometry/MI/2020-11-03-general/raw/mi-dtmb-boe-2020-voting-precincts/2020-biennial-precinct-report.pdf": [1335257, "93f58c49f5fe4c039e3c524319802f29f4b5bf3cf0c9296a3c9316aa48a3c062"],
  "data/precinct-geometry/MI/2020-11-03-general/raw/mi-sos-mvic/2020GEN.zip": [1728080, "7338b2419b0b7a9726cd2bdef0ee2853f72495991843bab351d7ac1f1b929c17"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-dtmb-boe-2024-voting-precincts/2024-voting-precincts-wgs84.geojson.gz": [15220121, "14d4a4bffc54f1588111326d360024cbe136599c03c443bfe56f9dd8bc14d7f7"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-dtmb-boe-2024-voting-precincts/layer-metadata.json": [7992, "fae33e7544338a750f30ae0e196bfeb6acf39324e2ee78717433f9eb3a0a0120"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-dtmb-boe-2024-voting-precincts/item-metadata.json": [5400, "a08ed544c530df239b7edf35ab9b49542d760037d4136b754f3aaf657eef936c"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-dtmb-boe-2024-voting-precincts/metadata.xml": [19908, "1a9f35e048693b5eadab2cbfe4abb83570f040b6c564aafff88cc00e2248c263"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-dtmb-boe-2024-voting-precincts/collection-provenance.json": [5047, "e176c567d36d7fd7087a6560686e1b1dae11f39ecaa53262f114527726a7fa06"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-sos-mvic/2024GEN.zip": [1587138, "64f9285bbe94565ff8685d90fccb283a72f04f849bc3b16873af26e9ae34294a"],
  "data/precinct-geometry/MI/2024-11-05-general/raw/mi-sos-mvic/2024-biennial-precinct-report.pdf": [1650419, "47c45ff173d3bf388c2a5b413a8ca2d2da18e4bf6c9724192392208a06872c19"],
  "data/precinct-geometry/MI/raw/census-2020-geographic-codes/county-subdivisions.json": [253663, "a341cc31a3327c2d219f4da58f788f9a95e2b182d7aa22459735a774aa4c2f90"],
  "data/precinct-geometry/MI/raw/census-2020-geographic-codes/county-subdivisions-layer-metadata.json": [7138, "27ee6fe0dee5f31259520f6ad80d8359f68fd68178885440f4a4d667a20f3331"],
  "data/precinct-geometry/MI/raw/census-2020-geographic-codes/incorporated-places.json": [75273, "70a4eab758edbd597f83f19f7a598c132d805fe9be2d9826a0820d1eb1c51904"],
  "data/precinct-geometry/MI/raw/census-2020-geographic-codes/incorporated-places-layer-metadata.json": [7244, "b2105e2c0f6519bbaa6319798f5dadf188c7247769ce13a4e674e6d4d061ddd9"],
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const absolute = (relativePath) => path.join(ROOT, relativePath);
const read = (relativePath) => readFileSync(absolute(relativePath));

function write(relativePath, bytes) {
  const target = absolute(relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    localArtifactPath: relativePath,
    byteCount: bytes.length,
    sha256: sha256(bytes),
  };
}

function writeJson(relativePath, value) {
  return write(relativePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

function writeGzipJson(relativePath, value) {
  const uncompressed = Buffer.from(`${JSON.stringify(value)}\n`);
  const bytes = gzipSync(uncompressed, { level: 9, mtime: 0 });
  return {
    ...write(relativePath, bytes),
    uncompressedByteCount: uncompressed.length,
    uncompressedSha256: sha256(uncompressed),
  };
}

function readPinnedSource(relativePath) {
  const bytes = read(relativePath);
  const [expectedByteCount, expectedSha256] = RAW_SOURCE_PINS[relativePath] ?? [];
  if (!expectedSha256) {
    throw new Error(`Michigan raw source is not hash-pinned: ${relativePath}.`);
  }
  const actualSha256 = sha256(bytes);
  if (bytes.length !== expectedByteCount || actualSha256 !== expectedSha256) {
    throw new Error(
      `Michigan raw source drifted: ${relativePath}; expected ${expectedByteCount} bytes/${expectedSha256}, got ${bytes.length} bytes/${actualSha256}.`,
    );
  }
  return { bytes, actualSha256 };
}

function sourceArtifact(relativePath, format, note, sourceUrl) {
  const { bytes, actualSha256 } = readPinnedSource(relativePath);
  const artifact = {
    localArtifactPath: relativePath,
    byteCount: bytes.length,
    sha256: actualSha256,
    format,
    sourceUrl,
    derivation:
      "Retained byte-for-byte from the cited official source, or deterministically combined from the official paged requests recorded by the adjacent collection provenance artifact.",
    note,
  };
  if (relativePath.endsWith(".geojson.gz")) {
    const uncompressed = gunzipSync(bytes);
    artifact.compression = "gzip";
    artifact.uncompressedByteCount = uncompressed.length;
    artifact.uncompressedSha256 = sha256(uncompressed);
  }
  return artifact;
}

function assertPinnedInputs(spec) {
  for (const [relativePath] of spec.rawArtifacts) {
    readPinnedSource(`${spec.base}/${relativePath}`);
  }
  for (const artifact of SHARED_RAW_ARTIFACTS) {
    readPinnedSource(artifact.relativePath);
  }
}

function officialSourceUnitId(unit) {
  return [
    `county=${unit.countyCode}`,
    `municipality=${unit.municipalityCode}`,
    `ward=${unit.ward}`,
    `precinct=${unit.precinct}`,
    `label=${unit.label || "~"}`,
  ].join(";");
}

function unitDisplayName(unit) {
  const parts = [unit.municipalityName];
  if (Number(unit.ward)) parts.push(`Ward ${Number(unit.ward)}`);
  parts.push(`Precinct ${Number(unit.precinct)}`);
  if (unit.label) parts.push(`Label ${unit.label}`);
  return parts.join(" - ");
}

function candidateName(candidate) {
  return [candidate.firstName, candidate.middleName, candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function parentForSourceUnit(unit, parentGeoids) {
  let countyName = String(unit.countyName)
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  countyName = COUNTY_NAME_ALIASES.get(countyName) ?? countyName;
  const parentGeoid = parentGeoids.get(countyName);
  if (!parentGeoid) {
    throw new Error(`Missing Michigan county GEOID for ${unit.countyName}.`);
  }
  return parentGeoid;
}

function candidateTotals(candidateVotes, candidates) {
  const totals = {
    democraticVotes: 0,
    republicanVotes: 0,
    otherVotes: 0,
    totalVotes: 0,
  };
  for (const [candidateId, votes] of candidateVotes) {
    const party = candidates.get(candidateId)?.partyCode;
    if (party === "DEM") totals.democraticVotes += votes;
    else if (party === "REP") totals.republicanVotes += votes;
    else totals.otherVotes += votes;
    totals.totalVotes += votes;
  }
  return totals;
}

function addTotals(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key];
}

function subtractTotals(mapped, result) {
  return Object.fromEntries(
    Object.keys(result).map((key) => [key, mapped[key] - result[key]]),
  );
}

function zeroTotals() {
  return {
    democraticVotes: 0,
    republicanVotes: 0,
    otherVotes: 0,
    totalVotes: 0,
  };
}

function geometryDisplayName(geometryUnit, primaryUnit) {
  for (const properties of geometryUnit.sourceProperties) {
    for (const key of [
      "Precinct_Long_Name",
      "PrecinctLabel",
      "Label",
      "Jurisdiction_Name",
    ]) {
      const value = String(properties?.[key] ?? "").trim();
      if (value) return value;
    }
  }
  return primaryUnit ? unitDisplayName(primaryUnit) : geometryUnit.sourceId;
}

function rawArtifactUrl(year, relativePath, spec) {
  if (relativePath.endsWith("GEN.zip")) return spec.resultUrl;
  if (relativePath.includes("archived-official-download-page")) {
    return year === 2016
      ? "https://web.archive.org/web/20240418004849id_/https://miboecfr.nictusa.com/cgi-bin/cfr/precinct_srch.cgi?elect_year_type=2016GEN&county_code=00&Submit=Search"
      : "https://miboecfr.nictusa.com/cgi-bin/cfr/precinct_srch.cgi?elect_year_type=2012GEN&county_code=82&Submit=Search";
  }
  if (relativePath.includes("biennial-precinct-report")) {
    return spec.biennialReportUrl;
  }
  if (relativePath.includes("item-metadata")) {
    const itemIds = {
      2016: "8ce0f3ce3ff74109ac02a26d34a0f4fc",
      2020: "49eb37d0a4294924bf8ef5ffe0eac47e",
      2024: "02d40893317d46569017beeb14f9c63e",
    };
    return `https://www.arcgis.com/sharing/rest/content/items/${itemIds[year]}?f=pjson`;
  }
  return spec.layerUrl;
}

function relationshipNote(assignment, resolution, primaryUnit, parentGeoids) {
  const sourceParent = parentForSourceUnit(primaryUnit, parentGeoids);
  const crossCounty = sourceParent !== assignment.geometryUnit.parentGeoid;
  const method = resolution.matchKind?.includes("unique_municipality_precinct")
    ? "The reviewed relationship uses the unique official municipality and precinct within the official county/election-cycle geometry after the result and geometry ward fields failed to agree."
    : "The reviewed relationship uses the official municipality identity plus the exact ward, precinct, and label composite in the official election-cycle geometry.";
  return crossCounty
    ? `${method} The result source county ${sourceParent} differs from geometry parent ${assignment.geometryUnit.parentGeoid}; the official statewide precinct report and exact statewide municipality/ward/precinct identity are retained as cross-county review evidence.`
    : method;
}

function canonicalUnits(model, reviewed) {
  const rows = [];
  const aliases = [];
  const assignments = [...model.assigned.values()].sort((left, right) =>
    left.geometryUnit.sourceId.localeCompare(right.geometryUnit.sourceId),
  );
  for (const assignment of assignments) {
    const sources = assignment.sourceUnits
      .map((unit, index) => ({ unit, resolution: assignment.resolutions[index] }))
      .sort((left, right) => {
        const leftSame = parentForSourceUnit(left.unit, model.parentGeoids)
          === assignment.geometryUnit.parentGeoid;
        const rightSame = parentForSourceUnit(right.unit, model.parentGeoids)
          === assignment.geometryUnit.parentGeoid;
        return Number(rightSame) - Number(leftSame)
          || officialSourceUnitId(left.unit).localeCompare(officialSourceUnitId(right.unit));
      });
    const primary = sources[0];
    const sourceUnitId = officialSourceUnitId(primary.unit);
    const resultUnitCode = reportingUnitCode({
      state: STATE,
      electionId: model.spec.electionId,
      reportingGrain: "precinct",
      parentGeoid: assignment.geometryUnit.parentGeoid,
      sourceUnitId,
    });
    rows.push({
      resultUnitCode,
      sourceUnitId,
      sourceDisplayName: geometryDisplayName(assignment.geometryUnit, primary.unit),
      parentGeoid: assignment.geometryUnit.parentGeoid,
      reportingGrain: "precinct",
      isGeographic: true,
      resultStatus: "candidate_detail_complete",
      candidateVotes: assignment.candidateVotes,
      totalVotes: assignment.totalVotes,
      sourceUnits: sources.map(({ unit }) => ({
        sourceUnitId: officialSourceUnitId(unit),
        sourceParentGeoid: parentForSourceUnit(unit, model.parentGeoids),
        sourceDisplayName: unitDisplayName(unit),
      })),
      relationship: {
        sourceFeatureId:
          `${assignment.geometryUnit.parentGeoid}|${assignment.geometryUnit.sourceId}`,
        relationshipType: "one_to_one",
        matchMethod: reviewed ? "reviewed_name" : "normalized_name_candidate",
        reviewStatus: reviewed ? "reviewed" : "pending",
        confidence: primary.resolution.matchKind?.includes("unique_")
          ? "medium"
          : "high",
        note: relationshipNote(
          assignment,
          primary.resolution,
          primary.unit,
          model.parentGeoids,
        ),
      },
      geometryUnit: assignment.geometryUnit,
    });
    for (const alias of sources.slice(1)) {
      aliases.push({
        resultUnitCode: reportingUnitCode({
          state: STATE,
          electionId: model.spec.electionId,
          reportingGrain: "precinct",
          parentGeoid: assignment.geometryUnit.parentGeoid,
          sourceUnitId: officialSourceUnitId(alias.unit),
        }),
        sourceUnitId: officialSourceUnitId(alias.unit),
        sourceDisplayName: unitDisplayName(alias.unit),
        parentGeoid: assignment.geometryUnit.parentGeoid,
        reportingGrain: "precinct",
        isGeographic: false,
        aliasOfResultUnitCode: resultUnitCode,
        relationships: [{
          sourceFeatureId: null,
          relationshipType: "source_alias",
          matchMethod: reviewed ? "reviewed_name" : "normalized_name_candidate",
          reviewStatus: reviewed ? "reviewed" : "pending",
          confidence: "high",
          note:
            `Official source identity from ${parentForSourceUnit(alias.unit, model.parentGeoids)} is aggregated into the same election precinct as ${resultUnitCode}; no votes are duplicated.`,
        }],
      });
    }
  }
  return { rows, aliases };
}

function unmatchedUnits(model) {
  return [...model.unmatched, ...model.ambiguous]
    .map((detail) => {
      const unit = detail.sourceUnit;
      const parentGeoid = parentForSourceUnit(unit, model.parentGeoids);
      const sourceUnitId = officialSourceUnitId(unit);
      return {
        resultUnitCode: reportingUnitCode({
          state: STATE,
          electionId: model.spec.electionId,
          reportingGrain: "precinct",
          parentGeoid,
          sourceUnitId,
        }),
        sourceUnitId,
        sourceDisplayName: unitDisplayName(unit),
        parentGeoid,
        reportingGrain: "precinct",
        isGeographic: true,
        resultStatus: "unmatched_geometry",
        candidateVotes: unit.candidateVotes,
        totalVotes: unit.totalVotes,
        sourceUnits: [{
          sourceUnitId,
          sourceParentGeoid: parentGeoid,
          sourceDisplayName: unitDisplayName(unit),
        }],
        relationships: [{
          sourceFeatureId: null,
          relationshipType: "unmatched",
          matchMethod: "normalized_name_candidate",
          reviewStatus: "reviewed",
          confidence: "low",
          note:
            `No unique official geometry candidate was established; municipality candidates: ${detail.municipalityCandidates.join(",") || "none"}; geometry candidates: ${detail.candidateGeometryIds.join(",") || "none"}.`,
        }],
      };
    })
    .sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
}

function nonGeographicUnits(model) {
  return model.nonGeographic
    .map((unit) => {
      const parentGeoid = parentForSourceUnit(unit, model.parentGeoids);
      const sourceUnitId = officialSourceUnitId(unit);
      return {
        resultUnitCode: reportingUnitCode({
          state: STATE,
          electionId: model.spec.electionId,
          reportingGrain: "administrative_reporting_unit",
          parentGeoid,
          sourceUnitId,
        }),
        sourceUnitId,
        sourceDisplayName: unitDisplayName(unit),
        parentGeoid,
        reportingGrain: "administrative_reporting_unit",
        isGeographic: false,
        resultStatus: "non_geographic_reconciliation_only",
        candidateVotes: unit.candidateVotes,
        totalVotes: unit.totalVotes,
        sourceUnits: [{
          sourceUnitId,
          sourceParentGeoid: parentGeoid,
          sourceDisplayName: unitDisplayName(unit),
        }],
        relationships: [{
          sourceFeatureId: null,
          relationshipType: "non_geographic",
          matchMethod: "exact_official_id",
          reviewStatus: "reviewed",
          confidence: "high",
          note:
            unit.label === "AVCB" || Number(unit.precinct.replace(/\D/g, "")) >= 900
              ? "Official absent-voter counting-board or precinct-900-series result retained for reconciliation and never assigned to a polygon."
              : "Official statistical-adjustment result retained for reconciliation and never assigned to a polygon.",
        }],
      };
    })
    .sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
}

function resultRows(units, candidates) {
  const candidateList = [...candidates.values()].sort((left, right) =>
    String(left.id).localeCompare(String(right.id), "en-US", { numeric: true }),
  );
  const rows = [];
  for (const unit of units) {
    for (const candidate of candidateList) {
      rows.push({
        resultUnitCode: unit.resultUnitCode,
        sourceUnitId: unit.sourceUnitId,
        sourceDisplayName: unit.sourceDisplayName,
        parentGeoid: unit.parentGeoid,
        reportingGrain: unit.reportingGrain,
        isGeographic: unit.isGeographic,
        resultStatus: unit.resultStatus,
        candidateId: candidate.id,
        candidate: candidateName(candidate),
        partyCode: candidate.partyCode,
        votes: unit.candidateVotes.get(candidate.id) ?? 0,
        sourceUnits: unit.sourceUnits,
      });
    }
  }
  return rows;
}

function reconciliationScopes(geographicUnits, matchedCodes) {
  const parents = [...new Set(geographicUnits.map((unit) => unit.parentGeoid))]
    .sort();
  const scopes = [];
  for (const parentGeoid of [...parents, STATE]) {
    const selected = geographicUnits.filter((unit) =>
      parentGeoid === STATE || unit.parentGeoid === parentGeoid,
    );
    const resultTotals = zeroTotals();
    const mappedTotals = zeroTotals();
    for (const unit of selected) {
      addTotals(resultTotals, unit.partyTotals);
      if (matchedCodes.has(unit.resultUnitCode)) {
        addTotals(mappedTotals, unit.partyTotals);
      }
    }
    scopes.push({
      scopeType: parentGeoid === STATE ? "state" : "parent",
      scopeId: parentGeoid,
      resultTotals,
      mappedTotals,
      deltas: subtractTotals(mappedTotals, resultTotals),
    });
  }
  return scopes;
}

function geometryDocument(model, spec) {
  const features = model.geometry.geometryUnits.map((unit) => ({
    type: "Feature",
    id: unit.sourceId,
    properties: {
      CRM_FEATURE_ID: unit.sourceId,
      CRM_PARENT_GEOID: unit.parentGeoid,
      CRM_NATIVE_ID: unit.sourceId,
      CRM_DISPLAY_NAME: geometryDisplayName(unit, null),
      SOURCE_MUNICIPALITY_FIPS: unit.municipalityFips,
      SOURCE_WARD: unit.ward,
      SOURCE_PRECINCT: unit.precinct,
      SOURCE_RAW_FEATURE_COUNT: unit.rawFeatureCount,
    },
    geometry: unit.geometry,
  }));
  return {
    type: "FeatureCollection",
    name: `Michigan ${model.year} official precinct geometry review`,
    crs: { type: "name", properties: { name: "EPSG:4326" } },
    metadata: {
      manifestId: spec.manifestId,
      sourceUrl: spec.layerUrl,
      generatedAt: GENERATED_AT,
      sourceFeatureCount: model.rawGeometry.features.length,
      normalizedFeatureCount: features.length,
      duplicateSourceParts:
        model.rawGeometry.features.length - model.geometry.geometryUnits.length,
    },
    features,
  };
}

function historicalBlockers(year, model) {
  if (year === 2012) {
    return [
      "The retained live legacy service labels these records ElectionYear=2012 but does not prove an immutable November 6 snapshot.",
      "The official GIS cohort has 4,874 features while the 2012 Biennial Precinct Report states 4,873 precincts.",
      `${model.summary.unmatchedResultUnits + model.summary.ambiguousResultUnits} geographic result unit remains unresolved and ${model.summary.unlinkedGeometryUnits} geometry units remain unlinked.`,
      "Affirmative derivative redistribution terms for the legacy service have not been retained.",
    ];
  }
  if (year === 2016) {
    return [
      "The official layer establishes the 2016 election cycle but does not prove an immutable November 8 snapshot.",
      `${model.summary.unmatchedResultUnits + model.summary.ambiguousResultUnits} geographic result units remain unresolved and ${model.summary.unlinkedGeometryUnits} geometry units remain unlinked.`,
      "Several municipal ward/precinct conventions require an authoritative or independently reviewed mapping before row-level publication.",
    ];
  }
  return [
    "The official layer establishes the 2020 election cycle but does not prove an immutable November 3 snapshot.",
    `${model.summary.unmatchedResultUnits + model.summary.ambiguousResultUnits} geographic result units remain unresolved and ${model.summary.unlinkedGeometryUnits} geometry units remain unlinked.`,
    "The official precinct ZIP does not equal the certified statewide summary and its AVCB/statistical rows are retained without proportional allocation.",
  ];
}

async function buildYear(year) {
  const spec = OUTPUT_SPECS[year];
  if (!spec || !MICHIGAN_PRECINCT_YEAR_SPECS[year]) {
    throw new Error(`Unsupported Michigan year ${year}.`);
  }
  assertPinnedInputs(spec);
  const model = await buildMichiganPrecinctJoinModel(year);
  const reviewed = year === 2024;
  const canonical = canonicalUnits(model, reviewed);
  const unmatched = unmatchedUnits(model);
  const nonGeographic = nonGeographicUnits(model);
  const geographicUnits = [...canonical.rows, ...unmatched].map((unit) => ({
    ...unit,
    partyTotals: candidateTotals(unit.candidateVotes, model.results.candidates),
  }));
  const resultUnitRows = [...geographicUnits, ...nonGeographic].sort(
    (left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode),
  );
  const normalizedRows = resultRows(resultUnitRows, model.results.candidates);
  const officialTotals = candidateTotals(
    model.results.sourceUnits.reduce((totals, unit) => {
      for (const [candidateId, votes] of unit.candidateVotes) {
        totals.set(candidateId, (totals.get(candidateId) ?? 0) + votes);
      }
      return totals;
    }, new Map()),
    model.results.candidates,
  );
  const geographicTotals = geographicUnits.reduce((totals, unit) => {
    addTotals(totals, unit.partyTotals);
    return totals;
  }, zeroTotals());
  const nonGeographicTotals = nonGeographic.reduce((totals, unit) => {
    addTotals(totals, candidateTotals(unit.candidateVotes, model.results.candidates));
    return totals;
  }, zeroTotals());
  const recombined = { ...geographicTotals };
  addTotals(recombined, nonGeographicTotals);
  if (JSON.stringify(recombined) !== JSON.stringify(officialTotals)) {
    throw new Error(`Michigan ${year} result normalization lost official votes.`);
  }

  const geometryPath = `${spec.base}/normalized/mi-${year}-official-precinct-geometry.geojson.gz`;
  const resultsPath = `${spec.base}/normalized/mi-${year}-official-precinct-results.json.gz`;
  const crosswalkPath = `${spec.base}/crosswalk/mi-${year}-result-to-geometry-review.json`;
  const reportPath = `${spec.base}/reports/mi-${year}-precinct-geometry-review.json`;
  const sourceEvidencePath = `${spec.base}/source-evidence.json`;
  const manifestPath = `${spec.base}/manifest.json`;
  const geometryOutput = writeGzipJson(geometryPath, geometryDocument(model, spec));
  const resultsDocument = {
    schemaVersion: 1,
    state: STATE,
    electionId: model.spec.electionId,
    reportingGrain: "precinct",
    parentLevel: "county",
    generatedAt: GENERATED_AT,
    source: {
      authority: "Michigan Department of State, Bureau of Elections",
      url: spec.resultUrl,
      artifact: model.spec.results,
      sha256: sha256(read(model.spec.results)),
      byteCount: read(model.spec.results).length,
    },
    sourceUnitCount: model.results.sourceUnits.length,
    canonicalGeographicUnitCount: geographicUnits.length,
    matchedGeographicUnitCount: canonical.rows.length,
    unmatchedGeographicUnitCount: unmatched.length,
    nonGeographicUnitCount: nonGeographic.length,
    sourceAliasUnitCount: canonical.aliases.length,
    rowCount: normalizedRows.length,
    candidates: [...model.results.candidates.values()].map((candidate) => ({
      id: candidate.id,
      name: candidateName(candidate),
      partyCode: candidate.partyCode,
    })),
    contestTotals: {
      president: {
        official: officialTotals,
        geographic: geographicTotals,
        nonGeographic: nonGeographicTotals,
      },
    },
    rows: normalizedRows,
  };
  const resultsOutput = writeGzipJson(resultsPath, resultsDocument);

  const featureIds = new Set(
    model.geometry.geometryUnits.map((unit) => `${unit.parentGeoid}|${unit.sourceId}`),
  );
  const featureParents = new Map(
    model.geometry.geometryUnits.map((unit) => [
      `${unit.parentGeoid}|${unit.sourceId}`,
      unit.parentGeoid,
    ]),
  );
  const crosswalkRows = [
    ...canonical.rows.map((unit) => ({
      resultUnitCode: unit.resultUnitCode,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName: unit.sourceDisplayName,
      parentGeoid: unit.parentGeoid,
      reportingGrain: unit.reportingGrain,
      isGeographic: true,
      relationships: [unit.relationship],
    })),
    ...unmatched.map((unit) => ({
      resultUnitCode: unit.resultUnitCode,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName: unit.sourceDisplayName,
      parentGeoid: unit.parentGeoid,
      reportingGrain: unit.reportingGrain,
      isGeographic: true,
      relationships: unit.relationships,
    })),
    ...nonGeographic.map((unit) => ({
      resultUnitCode: unit.resultUnitCode,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName: unit.sourceDisplayName,
      parentGeoid: unit.parentGeoid,
      reportingGrain: unit.reportingGrain,
      isGeographic: false,
      relationships: unit.relationships,
    })),
    ...canonical.aliases,
  ].sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  const matchedCodes = new Set(canonical.rows.map((unit) => unit.resultUnitCode));
  const scopes = reconciliationScopes(geographicUnits, matchedCodes);
  const crosswalk = {
    schemaVersion: 1,
    manifestId: spec.manifestId,
    state: STATE,
    electionId: model.spec.electionId,
    geographyLevel: "precinct",
    resultSourceId: `mi-${year}-official-precinct-results`,
    generatedAt: GENERATED_AT,
    rows: crosswalkRows,
    reconciliation: {
      status: reviewed ? "passed" : "failed",
      scopes,
    },
  };
  const crosswalkOutput = writeJson(crosswalkPath, crosswalk);

  const rawArtifacts = spec.rawArtifacts.map(([relative, format, note]) => {
    const fullPath = `${spec.base}/${relative}`;
    return sourceArtifact(
      fullPath,
      format,
      note,
      rawArtifactUrl(year, relative, spec),
    );
  });
  const crossCountyAssignments = canonical.rows
    .flatMap((unit) => unit.sourceUnits.map((source) => ({
      resultUnitCode: unit.resultUnitCode,
      sourceUnitId: source.sourceUnitId,
      sourceParentGeoid: source.sourceParentGeoid,
      geometryParentGeoid: unit.parentGeoid,
      sourceDisplayName: source.sourceDisplayName,
    })))
    .filter((row) => row.sourceParentGeoid !== row.geometryParentGeoid);
  const blockers = reviewed
    ? ["Immutable parent-scoped delivery and the guarded production release have not been completed."]
    : historicalBlockers(year, model);
  const sourceEvidence = {
    schemaVersion: 1,
    id: `mi-${year}-official-precinct-geometry-and-results-review`,
    state: STATE,
    election: {
      id: model.spec.electionId,
      date: spec.date,
      year,
      type: "general",
      office: "president",
    },
    authority: AUTHORITY,
    retrievedAt: spec.retrievedAt,
    reviewedAt: GENERATED_AT,
    sourceUrls: [spec.layerUrl, spec.resultUrl],
    boundaryContext: {
      boundaryVintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      sourceFeatureCount: model.rawGeometry.features.length,
      normalizedFeatureCount: model.geometry.geometryUnits.length,
      duplicateSourceParts:
        model.rawGeometry.features.length - model.geometry.geometryUnits.length,
      licenseOrTerms: spec.terms,
    },
    resultIdentity: {
      sourceUnitCount: model.results.sourceUnits.length,
      geographicSourceUnitCount:
        model.results.sourceUnits.length - model.nonGeographic.length,
      nonGeographicSourceUnitCount: model.nonGeographic.length,
      canonicalGeographicUnitCount: geographicUnits.length,
      mappedGeographicUnitCount: canonical.rows.length,
      unmatchedGeographicUnitCount: unmatched.length,
      sourceAliasUnitCount: canonical.aliases.length,
      officialTotals,
      geographicTotals,
      nonGeographicTotals,
    },
    joinReview: {
      reviewedForPublicRowRendering: reviewed,
      matchMethodCounts: model.summary.matchMethodCounts,
      crossCountyAssignments,
      unmatchedResultUnits: model.summary.unmatched,
      ambiguousResultUnits: model.summary.ambiguous,
      unlinkedGeometryUnits: model.summary.unlinkedGeometry,
    },
    artifacts: [
      ...rawArtifacts,
      ...SHARED_RAW_ARTIFACTS.map((artifact) => sourceArtifact(
        artifact.relativePath,
        artifact.format,
        artifact.note,
        artifact.sourceUrl,
      )),
    ],
    blockers,
    caveats: [
      "Displayed candidate votes, when eventually authorized, come only from the official Michigan SOS precinct ZIP; no GIS or secondary-source vote field is used.",
      `${model.nonGeographic.length} official statistical-adjustment or absent-voter-counting-board units are retained for reconciliation and never assigned to polygons.`,
      ...(crossCountyAssignments.length
        ? [`${crossCountyAssignments.length} official source rows use a different source county from their unique statewide geometry parent; both identities are retained and no vote allocation is performed.`]
        : []),
      ...blockers,
    ],
  };
  const evidenceOutput = writeJson(sourceEvidencePath, sourceEvidence);

  const relationshipCounts = reviewed
    ? {
        oneToOne: canonical.rows.length,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: unmatched.length,
        nonGeographic: nonGeographic.length,
        sourceAlias: canonical.aliases.length,
        pendingReview: 0,
      }
    : {
        oneToOne: 0,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: unmatched.length,
        nonGeographic: nonGeographic.length,
        sourceAlias: 0,
        pendingReview: canonical.rows.length + canonical.aliases.length,
      };
  const manifest = {
    schemaVersion: 1,
    id: spec.manifestId,
    state: STATE,
    election: {
      id: model.spec.electionId,
      date: spec.date,
      year,
      type: "general",
      office: "president",
    },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage: spec.boundaryVintage,
      vintageStatus: spec.vintageStatus,
      derivationMethod: "official_service",
    },
    source: {
      authority: AUTHORITY,
      url: spec.layerUrl,
      retrievedAt: spec.retrievedAt,
      artifact: sourceEvidencePath,
      sha256: evidenceOutput.sha256,
      byteCount: evidenceOutput.byteCount,
      format: "precinct-source-evidence+json",
      licenseOrTerms: spec.terms,
    },
    normalization: {
      script: "scripts/build-mi-reviewed-precincts.mjs",
      sourceCrs: spec.sourceCrs,
      servedCrs: "EPSG:4326",
      artifact: geometryPath,
      sha256: geometryOutput.sha256,
      byteCount: geometryOutput.byteCount,
      featureCount: model.geometry.geometryUnits.length,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: reviewed ? "reviewed" : "blocked",
      resultSourceId: `mi-${year}-official-precinct-results`,
      artifact: crosswalkPath,
      sha256: crosswalkOutput.sha256,
      byteCount: crosswalkOutput.byteCount,
      resultUnits: crosswalkRows.length,
      colorableResultUnits: geographicUnits.length,
      matchedResultUnits: canonical.rows.length,
      unmatchedResultUnits: unmatched.length,
      nonGeographicResultUnits: nonGeographic.length,
      sourceAliasResultUnits: canonical.aliases.length,
      ...(reviewed
        ? {
            reviewedRelationshipRecords: crosswalkRows.length,
            reviewedNoDataFeatures: model.unlinkedGeometry.length,
          }
        : {}),
      relationships: relationshipCounts,
      methods: [
        "exact_official_id",
        reviewed ? "reviewed_name" : "normalized_name_candidate",
      ],
    },
    validation: {
      status: "blocked",
      geometryValid: true,
      rowLevelRenderingSafe: reviewed,
      parentTotalsReconciled: reviewed,
      errors: blockers,
      warnings: [
        `${model.summary.matchedSourceResultUnits} geographic official source units map to ${model.summary.matchedGeometryUnits} official geometry units without proportional allocation.`,
        `${canonical.aliases.length} duplicate/cross-county source identities are retained as aliases and never duplicate votes.`,
        `${model.nonGeographic.length} non-geographic official units remain reconciliation-only.`,
      ],
    },
    delivery: null,
    caveats: sourceEvidence.caveats,
  };
  const manifestOutput = writeJson(manifestPath, manifest);

  const crosswalkInspection = inspectPrecinctCrosswalk(
    crosswalk,
    manifest,
    featureIds,
    featureParents,
  );
  const manifestInspection = inspectPrecinctGeometryManifest(manifest);
  const artifactInspection = validateManifestArtifacts(manifest, {
    root: ROOT,
    skipDelivery: true,
  });
  const errors = [
    ...crosswalkInspection.errors,
    ...manifestInspection.errors,
    ...artifactInspection.errors,
  ];
  if (errors.length) {
    throw new Error(`Michigan ${year} generated contract is invalid: ${errors.join("; ")}`);
  }

  const report = {
    schemaVersion: 1,
    state: STATE,
    electionId: model.spec.electionId,
    generatedAt: GENERATED_AT,
    disposition: reviewed
      ? "reviewed_row_level_rendering_delivery_pending"
      : "blocked_partial_official_crosswalk",
    source: {
      geometryFeatures: model.rawGeometry.features.length,
      normalizedFeatures: model.geometry.geometryUnits.length,
      officialResultUnits: model.results.sourceUnits.length,
      officialResultVotes: model.summary.officialResultVotes,
    },
    crosswalk: {
      resultUnits: crosswalkRows.length,
      colorableResultUnits: geographicUnits.length,
      matchedResultUnits: canonical.rows.length,
      unmatchedResultUnits: unmatched.length,
      nonGeographicResultUnits: nonGeographic.length,
      sourceAliasResultUnits: canonical.aliases.length,
      unlinkedGeometryUnits: model.unlinkedGeometry.length,
      matchMethodCounts: model.summary.matchMethodCounts,
      reconciliation: crosswalk.reconciliation.status,
    },
    totals: {
      official: officialTotals,
      geographic: geographicTotals,
      nonGeographic: nonGeographicTotals,
    },
    blockers,
    artifacts: {
      geometry: geometryOutput,
      results: resultsOutput,
      crosswalk: crosswalkOutput,
      sourceEvidence: evidenceOutput,
      manifest: manifestOutput,
    },
  };
  const reportOutput = writeJson(reportPath, report);
  return {
    year,
    manifest: manifestPath,
    reviewed,
    geometryFeatures: model.geometry.geometryUnits.length,
    resultUnits: crosswalkRows.length,
    matchedResultUnits: canonical.rows.length,
    unmatchedResultUnits: unmatched.length,
    nonGeographicResultUnits: nonGeographic.length,
    sourceAliasResultUnits: canonical.aliases.length,
    officialVotes: officialTotals.totalVotes,
    hashes: {
      manifest: manifestOutput.sha256,
      geometry: geometryOutput.sha256,
      results: resultsOutput.sha256,
      crosswalk: crosswalkOutput.sha256,
      sourceEvidence: evidenceOutput.sha256,
      report: reportOutput.sha256,
    },
  };
}

const requestedYears = process.argv
  .filter((value) => value.startsWith("--year="))
  .flatMap((value) => value.slice(7).split(","))
  .map(Number);
const years = requestedYears.length ? requestedYears : [2012, 2016, 2020, 2024];
const outputs = [];
for (const year of years) outputs.push(await buildYear(year));
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, outputs }, null, 2)}\n`);

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const ROOT = process.cwd();
const SOURCE_PATH = "data/precinct-geometry/IA/2024-11-05-general/raw/nytimes/IA-precincts-with-results.geojson.gz";
const RESULTS_PATH = "data/precinct-geometry/IA/2024-11-05-general/normalized/ia-2024-president-results.json.gz";
const SOURCE_SHA256 = "1bbe63c8316e4333fe2aa0cbc3477f6a4c454706e80d06cae857f4c6a8f66817";
const SOURCE_BYTES = 8_544_896;
const RESULTS_SHA256 = "693297ea851aa46a108353b48cd38db6087a55a42d8fe4948a3effe63e7b09a5";
const RESULTS_BYTES = 57_195;
const ELECTION_ID = "2024-11-05-general";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function safePath(relativePath) {
  if (
    typeof relativePath !== "string"
    || !relativePath.trim()
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) throw new Error(`Unsafe Iowa path: ${relativePath}`);
  const root = path.resolve(ROOT);
  const target = path.resolve(root, ...relativePath.split("/"));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Iowa path escapes repository: ${relativePath}`);
  return target;
}

function verified(relativePath, expectedSha256, expectedBytes) {
  const target = safePath(relativePath);
  if (!existsSync(target)) throw new Error(`Required Iowa artifact is missing: ${relativePath}`);
  const bytes = readFileSync(target);
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedSha256) throw new Error(`Required Iowa artifact bytes drifted: ${relativePath}`);
  return bytes;
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function signature(parentGeoid, democratic, republican, total) {
  return [
    parentGeoid,
    integer(democratic, "Democratic votes"),
    integer(republican, "Republican votes"),
    integer(total, "total votes"),
  ].join("|");
}

function writeJson(relativePath, document, gzip = false) {
  const target = safePath(relativePath);
  if (existsSync(target)) throw new Error(`Refusing to replace existing Iowa output: ${relativePath}`);
  mkdirSync(path.dirname(target), { recursive: true });
  const json = Buffer.from(gzip ? JSON.stringify(document) + "\n" : JSON.stringify(document, null, 2) + "\n", "utf8");
  const bytes = gzip ? gzipSync(json, { level: 9, mtime: 0 }) : json;
  writeFileSync(target, bytes, { flag: "wx" });
  return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function assertGeometryOnly(properties, context) {
  for (const key of Object.keys(properties ?? {})) {
    if (/^(?:votes?|pct_dem|candidate|party|total)/i.test(key)) {
      throw new Error(`${context} retained election-value property ${key}`);
    }
  }
}

function main() {
  const geometryOut = argument("out");
  const crosswalkOut = argument("crosswalk-out");
  if (!geometryOut || !crosswalkOut) {
    throw new Error("Usage: node scripts/build-ia-2024-reviewed-precincts.mjs --out=<path> --crosswalk-out=<path>");
  }
  const sourceBytes = verified(SOURCE_PATH, SOURCE_SHA256, SOURCE_BYTES);
  const resultsBytes = verified(RESULTS_PATH, RESULTS_SHA256, RESULTS_BYTES);
  const source = JSON.parse(gunzipSync(sourceBytes).toString("utf8"));
  const results = JSON.parse(gunzipSync(resultsBytes).toString("utf8"));
  if (
    source.type !== "FeatureCollection"
    || source.features?.length !== 1_653
    || results.schemaVersion !== 1
    || results.state !== "IA"
    || results.electionId !== ELECTION_ID
    || results.rows?.length !== 1_653
  ) throw new Error("Iowa 2024 source or official result contract drifted");

  const sourceBySignature = new Map();
  for (const [index, feature] of source.features.entries()) {
    const properties = feature?.properties ?? {};
    if (properties.state !== "IA" || properties.official_boundary !== true || !/^19\d{3}-.+/.test(String(properties.GEOID ?? ""))) {
      throw new Error(`Iowa 2024 source feature ${index} is not declared as an official Iowa boundary`);
    }
    const parentGeoid = properties.GEOID.slice(0, 5);
    const key = signature(parentGeoid, properties.votes_dem, properties.votes_rep, properties.votes_total);
    if (sourceBySignature.has(key)) throw new Error(`Iowa 2024 source signature is ambiguous: ${key}`);
    sourceBySignature.set(key, { index, feature, parentGeoid });
  }

  const used = new Set();
  const geometryFeatures = [];
  const crosswalkRows = [];
  for (const result of results.rows) {
    const key = signature(result.parentGeoid, result.democratic, result.republican, result.total);
    const match = sourceBySignature.get(key);
    if (!match || used.has(match.index)) {
      throw new Error(`Iowa 2024 official result has no unique official-boundary match: ${result.resultUnitCode}`);
    }
    if (result.other !== result.total - result.democratic - result.republican) {
      throw new Error(`Iowa 2024 official result total drifted: ${result.resultUnitCode}`);
    }
    used.add(match.index);
    const sourceProperties = match.feature.properties;
    const sourceFeatureId = `ia-2024:${result.parentGeoid}:${encodeURIComponent(result.sourceUnitId)}`;
    const sourceNativeId = String(sourceProperties.GEOID).slice(6);
    const properties = {
      CRM_FEATURE_ID: sourceFeatureId,
      CRM_NATIVE_ID: sourceNativeId,
      CRM_DISPLAY_NAME: result.sourceDisplayName,
      CRM_PARENT_GEOID: result.parentGeoid,
      CRM_PARENT_NAME: result.parentSourceName,
      CRM_SOURCE_GEOID: sourceProperties.GEOID,
      CRM_SOURCE_INDEX: match.index,
      CRM_OFFICIAL_BOUNDARY: true,
      CRM_REVIEW_METHOD: "unique_county_and_official_presidential_vote_signature",
    };
    assertGeometryOnly(properties, `Iowa 2024 output feature ${sourceFeatureId}`);
    geometryFeatures.push({ type: "Feature", properties, geometry: match.feature.geometry });
    crosswalkRows.push({
      resultUnitCode: result.resultUnitCode,
      sourceUnitId: result.sourceUnitId,
      sourceDisplayName: result.sourceDisplayName,
      parentGeoid: result.parentGeoid,
      reportingGrain: "precinct",
      isGeographic: true,
      relationships: [{
        sourceFeatureId: `${result.parentGeoid}|${sourceFeatureId}`,
        relationshipType: "one_to_one",
        matchMethod: "official_crosswalk",
        reviewStatus: "reviewed",
        confidence: "high",
        note: "Official-boundary feature from the New York Times statewide compilation matched uniquely to the official Iowa Secretary of State result by county and the complete reported presidential vote signature. Vote values come only from the official Iowa source and are not retained in geometry.",
        sourceFeatureContext: {
          sourceGeoid: sourceProperties.GEOID,
          officialBoundary: true,
          sourceFeatureIndex: match.index,
        },
      }],
    });
  }
  if (used.size !== 1_653) throw new Error(`Iowa 2024 source coverage drifted: ${used.size} of 1653 features used`);
  geometryFeatures.sort((left, right) => left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID));
  crosswalkRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));

  const geometry = {
    type: "FeatureCollection",
    metadata: {
      schemaVersion: 1,
      state: "IA",
      electionId: ELECTION_ID,
      sourceAuthority: "Iowa state and county election authorities, compiled by The New York Times",
      sourceUrl: "https://int.nyt.com/newsgraphics/elections/map-data/2024/national/IA-precincts-with-results.geojson.gz",
      sourceArtifactSha256: SOURCE_SHA256,
      licenseOrTerms: "NYT Computational Use of Data Agreement v1.0 - Non-Commercial; attribution and downstream terms required. Official source packages are separately retained where publicly available.",
      sourceFeatureCount: 1_653,
      normalizedFeatureCount: 1_653,
      officialBoundaryFeatureCount: 1_653,
      voteFieldsIncluded: false,
      reviewMethod: "All source features declare official_boundary=true and each matched one-to-one to an official Iowa precinct result using county plus complete presidential vote signature; election-value properties were stripped.",
    },
    features: geometryFeatures,
  };
  const crosswalk = {
    schemaVersion: 1,
    manifestId: "ia-2024-2024-11-05-precinct-geometry-candidate-v1",
    state: "IA",
    electionId: ELECTION_ID,
    geographyLevel: "precinct",
    resultSourceId: "ia-sos-2024-general-county-detailxml-reports",
    generatedAt: "2026-08-12T23:58:58.000Z",
    rows: crosswalkRows,
    reconciliation: {
      status: "passed",
      scopes: [{
        scopeType: "state",
        scopeId: "IA",
        resultTotals: results.totals,
        mappedTotals: results.totals,
        deltas: Object.fromEntries(Object.keys(results.totals).map((key) => [key, 0])),
      }],
      resultUnitCount: 1_653,
      geometryFeatureCount: 1_653,
      officialBoundaryFeatureCount: 1_653,
      relationshipRecordCount: 1_653,
      unmatchedResultUnitCount: 0,
      unusedSourceFeatureCount: 0,
      ambiguousSignatureCount: 0,
    },
  };
  const geometryArtifact = writeJson(geometryOut, geometry, true);
  const crosswalkArtifact = writeJson(crosswalkOut, crosswalk, false);
  console.log(JSON.stringify({
    status: "passed",
    sourceArtifact: { path: SOURCE_PATH, byteCount: SOURCE_BYTES, sha256: SOURCE_SHA256 },
    officialResults: { path: RESULTS_PATH, byteCount: RESULTS_BYTES, sha256: RESULTS_SHA256 },
    resultUnitCount: 1_653,
    sourceFeatureCount: 1_653,
    officialBoundaryFeatureCount: 1_653,
    matchedFeatureCount: used.size,
    voteFieldsIncluded: false,
    geometryArtifact,
    crosswalkArtifact,
  }, null, 2));
}

main();

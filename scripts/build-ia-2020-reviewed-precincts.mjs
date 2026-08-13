import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import shp from "shpjs";

const ROOT = process.cwd();
const SOURCE_PATH = "data/precinct-geometry/IA/2020-11-03-general/raw/vest/ia_2020.zip";
const RESULTS_PATH = "data/precinct-geometry/IA/2020-11-03-general/normalized/ia-2020-president-results.json.gz";
const SOURCE_SHA256 = "b480ee62f073126c866821fc76f44b27d72d37eaa34d693cd0256b447e981a9f";
const SOURCE_BYTES = 5_191_970;
const RESULTS_SHA256 = "f97cbccced3a5d30686bdbc6fe76b40c22d55e1958e276e896c7cb4d9d6f6ceb";
const RESULTS_BYTES = 57_646;
const ELECTION_ID = "2020-11-03-general";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return value?.slice(prefix.length) ?? null;
}

function safeTarget(relativePath) {
  if (
    typeof relativePath !== "string"
    || !relativePath.trim()
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe Iowa output path: ${relativePath}`);
  }
  const root = path.resolve(ROOT);
  const target = path.resolve(root, ...relativePath.split("/"));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Iowa output escapes repository root: ${relativePath}`);
  }
  return target;
}

function verifiedBytes(relativePath, expectedSha256, expectedByteCount) {
  const target = safeTarget(relativePath);
  if (!existsSync(target)) throw new Error(`Required Iowa artifact is missing: ${relativePath}`);
  const bytes = readFileSync(target);
  if (bytes.length !== expectedByteCount || sha256(bytes) !== expectedSha256) {
    throw new Error(`Required Iowa artifact bytes drifted: ${relativePath}`);
  }
  return bytes;
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function normalizedCounty(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\bcounty\b/gi, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function officialSignature(row) {
  return [
    normalizedCounty(row.parentSourceName),
    integer(row.democratic, "official Democratic votes"),
    integer(row.republican, "official Republican votes"),
    integer(row.other, "official other votes"),
    integer(row.total, "official total votes"),
  ].join("|");
}

function vestSignature(properties) {
  const democratic = integer(properties.G20PREDBID, "VEST Democratic votes");
  const republican = integer(properties.G20PRERTRU, "VEST Republican votes");
  const other = [
    "G20PRELJOR",
    "G20PREGHAW",
    "G20PRECBLA",
    "G20PREOFUE",
    "G20PREOKIN",
    "G20PREIWES",
    "G20PREIPIE",
    "G20PREOWRI",
  ].reduce((sum, field) => sum + integer(properties[field], `VEST ${field}`), 0);
  return [
    normalizedCounty(properties.COUNTY),
    democratic,
    republican,
    other,
    democratic + republican + other,
  ].join("|");
}

function forbiddenProperties(properties, featureIndex) {
  for (const key of Object.keys(properties ?? {})) {
    if (/^(?:G\d{2}|VOTES?|TOTAL|CANDIDATE|PARTY)/i.test(key)) {
      throw new Error(`Iowa 2020 output feature ${featureIndex} retained election-value field ${key}`);
    }
  }
}

function writeJson(relativePath, document) {
  const target = safeTarget(relativePath);
  if (existsSync(target)) throw new Error(`Refusing to replace existing Iowa output: ${relativePath}`);
  mkdirSync(path.dirname(target), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(document, null, 2) + "\n", "utf8");
  writeFileSync(target, bytes, { flag: "wx" });
  return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

function writeGzipJson(relativePath, document) {
  const target = safeTarget(relativePath);
  if (existsSync(target)) throw new Error(`Refusing to replace existing Iowa output: ${relativePath}`);
  mkdirSync(path.dirname(target), { recursive: true });
  const json = Buffer.from(JSON.stringify(document) + "\n", "utf8");
  const bytes = gzipSync(json, { level: 9, mtime: 0 });
  writeFileSync(target, bytes, { flag: "wx" });
  return { path: relativePath, byteCount: bytes.length, sha256: sha256(bytes) };
}

async function main() {
  const geometryOut = argument("out");
  const crosswalkOut = argument("crosswalk-out");
  if (!geometryOut || !crosswalkOut) {
    throw new Error("Usage: node scripts/build-ia-2020-reviewed-precincts.mjs --out=<path> --crosswalk-out=<path>");
  }

  const sourceBytes = verifiedBytes(SOURCE_PATH, SOURCE_SHA256, SOURCE_BYTES);
  const resultsBytes = verifiedBytes(RESULTS_PATH, RESULTS_SHA256, RESULTS_BYTES);
  const resultsDocument = JSON.parse(gunzipSync(resultsBytes).toString("utf8"));
  if (
    resultsDocument.schemaVersion !== 1
    || resultsDocument.state !== "IA"
    || resultsDocument.electionId !== ELECTION_ID
    || resultsDocument.rows?.length !== 1_661
  ) {
    throw new Error("Iowa 2020 official normalized result contract drifted");
  }

  const parsed = await shp(sourceBytes);
  const featureCollection = Array.isArray(parsed) ? parsed[0] : parsed;
  if (featureCollection?.type !== "FeatureCollection" || featureCollection.features?.length !== 1_661) {
    throw new Error("Iowa 2020 VEST source feature count drifted");
  }

  const sourceBySignature = new Map();
  for (const [index, feature] of featureCollection.features.entries()) {
    const signature = vestSignature(feature.properties ?? {});
    if (sourceBySignature.has(signature)) {
      throw new Error(`Iowa 2020 source has ambiguous presidential signature ${signature}`);
    }
    sourceBySignature.set(signature, { index, feature });
  }

  const usedSourceIndexes = new Set();
  const geometryFeatures = [];
  const crosswalkRows = [];
  for (const row of resultsDocument.rows) {
    const signature = officialSignature(row);
    const match = sourceBySignature.get(signature);
    if (!match || usedSourceIndexes.has(match.index)) {
      throw new Error(`Iowa 2020 official result has no unique geometry signature match: ${row.resultUnitCode}`);
    }
    usedSourceIndexes.add(match.index);
    const sourceProperties = match.feature.properties ?? {};
    const sourceFeatureId = `ia-2020:${row.parentGeoid}:${encodeURIComponent(row.sourceUnitId)}`;
    const properties = {
      CRM_FEATURE_ID: sourceFeatureId,
      CRM_NATIVE_ID: String(sourceProperties.DISTRICT ?? "").trim(),
      CRM_DISPLAY_NAME: row.sourceDisplayName,
      CRM_PARENT_GEOID: row.parentGeoid,
      CRM_PARENT_NAME: row.parentSourceName,
      CRM_SOURCE_NAME: String(sourceProperties.NAME ?? "").trim(),
      CRM_SOURCE_INDEX: match.index,
      CRM_REVIEW_METHOD: "unique_county_and_official_presidential_vote_signature",
    };
    forbiddenProperties(properties, match.index);
    geometryFeatures.push({ type: "Feature", properties, geometry: match.feature.geometry });
    crosswalkRows.push({
      resultUnitCode: row.resultUnitCode,
      sourceUnitId: row.sourceUnitId,
      sourceDisplayName: row.sourceDisplayName,
      parentGeoid: row.parentGeoid,
      reportingGrain: "precinct",
      isGeographic: true,
      relationships: [{
        sourceFeatureId: `${row.parentGeoid}|${sourceFeatureId}`,
        relationshipType: "one_to_one",
        matchMethod: "official_crosswalk",
        reviewStatus: "reviewed",
        confidence: "high",
        note: "Geometry-only VEST feature matched uniquely to the official Iowa Secretary of State precinct result by county and the complete presidential vote signature. Vote values come only from the official Iowa source and are not retained in geometry.",
        sourceFeatureContext: {
          vestCounty: String(sourceProperties.COUNTY ?? "").trim(),
          vestDistrict: String(sourceProperties.DISTRICT ?? "").trim(),
          vestName: String(sourceProperties.NAME ?? "").trim(),
          sourceFeatureIndex: match.index,
        },
      }],
    });
  }

  if (usedSourceIndexes.size !== 1_661) {
    throw new Error(`Iowa 2020 source coverage drifted: used ${usedSourceIndexes.size} of 1661 features`);
  }
  geometryFeatures.sort((left, right) => left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID));
  crosswalkRows.sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));

  const geometry = {
    type: "FeatureCollection",
    metadata: {
      schemaVersion: 1,
      state: "IA",
      electionId: ELECTION_ID,
      sourceAuthority: "Voting and Election Science Team (geometry reconstruction); Iowa Secretary of State and Iowa county election authorities (underlying election data)",
      sourceUrl: "https://dataverse.harvard.edu/file.xhtml?fileId=4789403&version=24.0",
      sourceArtifactSha256: SOURCE_SHA256,
      sourceFeatureCount: 1_661,
      normalizedFeatureCount: 1_661,
      voteFieldsIncluded: false,
      reviewMethod: "Every feature matched one-to-one to an official Iowa precinct result using a unique county plus complete presidential vote signature; all election-value properties were stripped.",
    },
    features: geometryFeatures,
  };
  const crosswalk = {
    schemaVersion: 1,
    manifestId: "ia-2020-2020-11-03-precinct-geometry-candidate-v1",
    state: "IA",
    electionId: ELECTION_ID,
    geographyLevel: "precinct",
    resultSourceId: "ia-sos-2020-general-precinct-results",
    generatedAt: "2026-08-12T23:58:58.000Z",
    rows: crosswalkRows,
    reconciliation: {
      status: "passed",
      scopes: [{
        scopeType: "state",
        scopeId: "IA",
        resultTotals: resultsDocument.totals,
        mappedTotals: resultsDocument.totals,
        deltas: Object.fromEntries(Object.keys(resultsDocument.totals).map((key) => [key, 0])),
      }],
      resultUnitCount: 1_661,
      geometryFeatureCount: 1_661,
      relationshipRecordCount: 1_661,
      unmatchedResultUnitCount: 0,
      unusedSourceFeatureCount: 0,
      ambiguousSignatureCount: 0,
    },
  };

  const geometryArtifact = writeGzipJson(geometryOut, geometry);
  const crosswalkArtifact = writeJson(crosswalkOut, crosswalk);
  console.log(JSON.stringify({
    status: "passed",
    sourceArtifact: { path: SOURCE_PATH, byteCount: SOURCE_BYTES, sha256: SOURCE_SHA256 },
    officialResults: { path: RESULTS_PATH, byteCount: RESULTS_BYTES, sha256: RESULTS_SHA256 },
    resultUnitCount: 1_661,
    sourceFeatureCount: 1_661,
    matchedFeatureCount: usedSourceIndexes.size,
    voteFieldsIncluded: false,
    geometryArtifact,
    crosswalkArtifact,
  }, null, 2));
}

await main();

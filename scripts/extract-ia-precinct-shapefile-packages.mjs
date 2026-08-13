import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import shp from "shpjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function args(argv) {
  const parsed = {};
  for (const token of argv) {
    const match = token.match(/^--([^=]+)=(.+)$/);
    if (!match) throw new Error(`Unsupported argument: ${token}`);
    parsed[match[1]] = match[2];
  }
  if (!parsed.manifest || !parsed.out) {
    throw new Error("Usage: node scripts/extract-ia-precinct-shapefile-packages.mjs --manifest=<path> --out=<path>");
  }
  return parsed;
}

function safeRepoPath(root, value, label) {
  if (typeof value !== "string" || path.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..")) {
    throw new Error(`Unsafe ${label}: ${value}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...value.split("/"));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the repository: ${value}`);
  }
  return resolved;
}

function featureCollections(parsed, selectedLayer) {
  const values = Array.isArray(parsed) ? parsed : [parsed];
  for (const value of values) {
    if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) {
      throw new Error("Unexpected shapefile parser output");
    }
  }
  if (!selectedLayer) return values;
  const selected = values.filter((value) => value.fileName === selectedLayer);
  if (selected.length !== 1) throw new Error(`Selected shapefile layer was not found exactly once: ${selectedLayer}`);
  return selected;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stable(child)]));
  }
  return value;
}

const options = args(process.argv.slice(2));
const root = process.cwd();
const manifestPath = safeRepoPath(root, options.manifest, "manifest path");
const outPath = safeRepoPath(root, options.out, "output path");
if (existsSync(outPath)) throw new Error(`Refusing to replace existing extraction: ${options.out}`);

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (manifest.schemaVersion !== 1 || manifest.state !== "IA" || !Array.isArray(manifest.packages) || manifest.packages.length !== 252) {
  throw new Error("Unexpected Iowa precinct source-package manifest");
}

const features = [];
for (const sourcePackage of [...manifest.packages].sort((left, right) => left.id.localeCompare(right.id))) {
  const artifactPath = safeRepoPath(root, sourcePackage.artifact, `${sourcePackage.id} artifact path`);
  const bytes = readFileSync(artifactPath);
  if (bytes.length !== sourcePackage.byteCount || sha256(bytes) !== sourcePackage.sha256) {
    throw new Error(`${sourcePackage.id} source archive bytes or SHA-256 drifted`);
  }
  const collections = featureCollections(await shp(bytes), sourcePackage.archive.selectedLayer);
  let packageRecordIndex = 0;
  for (const collection of collections) {
    for (const feature of collection.features) {
      if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) continue;
      features.push({
        type: "Feature",
        properties: {
          CRM_PACKAGE_ID: sourcePackage.id,
          CRM_PACKAGE_LABEL: sourcePackage.label,
          CRM_SOURCE_INDEX_ID: sourcePackage.indexId,
          CRM_PACKAGE_ROLE: sourcePackage.packageRole,
          CRM_PARENT_NAME: sourcePackage.parent?.name ?? null,
          CRM_PARENT_GEOID: sourcePackage.parent?.geoid ?? null,
          CRM_PACKAGE_RECORD_INDEX: packageRecordIndex,
          CRM_NATIVE_PROPERTIES: stable(feature.properties ?? {}),
        },
        geometry: feature.geometry,
      });
      packageRecordIndex += 1;
    }
  }
  if (packageRecordIndex !== sourcePackage.archive.sourceFeatureCount) {
    throw new Error(`${sourcePackage.id} parsed feature count drifted: ${packageRecordIndex}`);
  }
}

features.sort((left, right) => (
  left.properties.CRM_PACKAGE_ID.localeCompare(right.properties.CRM_PACKAGE_ID)
  || left.properties.CRM_PACKAGE_RECORD_INDEX - right.properties.CRM_PACKAGE_RECORD_INDEX
));
if (features.length !== manifest.summary.sourceFeatureCount) {
  throw new Error(`Iowa source feature count drifted: ${features.length}`);
}

const document = {
  type: "FeatureCollection",
  metadata: {
    schemaVersion: 1,
    state: "IA",
    electionId: manifest.election.id,
    sourceManifestPath: options.manifest,
    sourceManifestSha256: sha256(manifestBytes),
    sourcePackageCount: manifest.packages.length,
    sourceFeatureCount: features.length,
    role: "Deterministic expansion of all retained Iowa SOS post-2020 county and city precinct packages for reviewed crosswalk construction.",
  },
  features,
};
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(document)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: options.out, packageCount: manifest.packages.length, featureCount: features.length })}\n`);

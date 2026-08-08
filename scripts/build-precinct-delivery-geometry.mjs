import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import {
  buildPrecinctDeliveryCandidateFeatureCollection,
  buildPrecinctDeliveryFeatureCollection,
} from "./lib/precinct-delivery-builder.mjs";
import {
  validateManifestArtifacts,
} from "./lib/precinct-geometry-validation.mjs";
import {
  inspectPrecinctGeometryManifest,
} from "../src/lib/precinct-geography.ts";

const CANDIDATE_OUTPUT_ROOT = path.join(
  ".etl",
  "precinct-delivery-candidates",
);

function readJsonArtifact(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  const buffer = readFileSync(absolutePath);
  const payload = relativePath.endsWith(".gz")
    ? zlib.gunzipSync(buffer)
    : buffer;
  return JSON.parse(payload.toString("utf8"));
}

function ensureInside(outputRoot, outputPath, message) {
  const resolvedRoot = path.resolve(outputRoot);
  const resolvedPath = path.resolve(outputPath);
  if (
    resolvedPath !== resolvedRoot
    && !resolvedPath.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(message);
  }
  return resolvedPath;
}

function writeImmutableArtifact(absoluteOutputPath, outputBuffer, relativePath) {
  if (existsSync(absoluteOutputPath)) {
    const existing = readFileSync(absoluteOutputPath);
    if (!existing.equals(outputBuffer)) {
      throw new Error(
        "refusing to overwrite a different immutable delivery artifact "
        + relativePath,
      );
    }
    return "verified_existing";
  }
  mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, outputBuffer);
  return "created";
}

function deliveryDeclarationMatches(manifest, outputBuffer, actualSha256) {
  return Boolean(
    manifest.delivery
    && outputBuffer.length === manifest.delivery.byteCount
    && actualSha256 === manifest.delivery.sha256,
  );
}

export function writeDeclaredPrecinctDeliveryArtifact({
  absoluteOutputPath,
  actualSha256,
  candidate,
  manifest,
  outputBuffer,
  relativeOutputPath,
}) {
  const verifiedSha256 = actualSha256 ?? createHash("sha256")
    .update(outputBuffer)
    .digest("hex");
  if (
    !candidate
    && !deliveryDeclarationMatches(
      manifest,
      outputBuffer,
      verifiedSha256,
    )
  ) {
    throw new Error(
      "refusing to write delivery bytes that do not match the manifest declaration",
    );
  }
  return writeImmutableArtifact(absoluteOutputPath, outputBuffer, relativeOutputPath);
}

export function buildPrecinctDeliveryArtifact(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const manifest = options.manifest;
  const candidate = options.candidate === true;
  const write = options.write === true;
  const manifestInspection = inspectPrecinctGeometryManifest(manifest);
  if (manifestInspection.errors.length > 0) {
    throw new Error(
      "precinct manifest contract is invalid: "
      + manifestInspection.errors.join("; "),
    );
  }
  if (!candidate && manifest.delivery?.format !== "geojson") {
    throw new Error(
      "manifest must declare a versioned GeoJSON delivery target before build",
    );
  }

  const preflight = validateManifestArtifacts(manifest, {
    root,
    skipDelivery: true,
  });
  if (
    preflight.errors.length > 0
    || (!candidate && !preflight.eligible)
  ) {
    throw new Error(
      "manifest failed pre-delivery validation: "
      + preflight.errors.concat(
        !candidate && !preflight.eligible
          ? ["manifest is not delivery eligible"]
          : [],
      ).join("; "),
    );
  }

  const normalizedGeometry = readJsonArtifact(
    root,
    manifest.normalization.artifact,
  );
  const crosswalkDocument = readJsonArtifact(
    root,
    manifest.crosswalk.artifact,
  );
  const delivery = candidate
    ? buildPrecinctDeliveryCandidateFeatureCollection(
      manifest,
      normalizedGeometry,
      crosswalkDocument,
    )
    : buildPrecinctDeliveryFeatureCollection(
      manifest,
      normalizedGeometry,
      crosswalkDocument,
    );
  const outputBuffer = Buffer.from(JSON.stringify(delivery) + "\n", "utf8");
  const actualSha256 = createHash("sha256")
    .update(outputBuffer)
    .digest("hex");

  const relativeOutputPath = candidate
    ? path.posix.join(
      CANDIDATE_OUTPUT_ROOT.replaceAll("\\", "/"),
      manifest.id + ".geojson",
    )
    : path.posix.join(
      "public",
      manifest.delivery.url.replace(/^\//, ""),
    );
  const allowedOutputRoot = candidate
    ? path.resolve(root, CANDIDATE_OUTPUT_ROOT)
    : path.resolve(root, "public", "data", "geography");
  const absoluteOutputPath = ensureInside(
    allowedOutputRoot,
    path.resolve(root, relativeOutputPath),
    candidate
      ? "candidate output must remain under .etl/precinct-delivery-candidates"
      : "delivery output must remain under public/data/geography",
  );

  const declarationMatches = candidate
    ? null
    : deliveryDeclarationMatches(manifest, outputBuffer, actualSha256);
  let writeDisposition = "dry_run";
  if (write) {
    writeDisposition = writeDeclaredPrecinctDeliveryArtifact({
      absoluteOutputPath,
      actualSha256,
      candidate,
      manifest,
      outputBuffer,
      relativeOutputPath,
    });
  }

  return {
    mode: candidate ? "candidate" : "public",
    candidateOnly: candidate,
    manifestId: manifest.id,
    state: manifest.state,
    electionId: manifest.election.id,
    output: relativeOutputPath.replaceAll("\\", "/"),
    writeRequested: write,
    writeDisposition,
    featureCount: delivery.features.length,
    parentCount: new Set(
      delivery.features.map((feature) => feature.properties.parentGeoid),
    ).size,
    resultUnitCount: new Set(
      delivery.features.map((feature) => feature.properties.resultUnitCode),
    ).size,
    byteCount: outputBuffer.length,
    sha256: actualSha256,
    declaredByteCount: manifest.delivery?.byteCount ?? null,
    declaredSha256: manifest.delivery?.sha256 ?? null,
    declarationMatches,
    publicEligible: preflight.eligible,
    releaseBlockers: manifestInspection.publicEligibilityReasons,
    sourceMetadata: delivery.metadata,
  };
}

function parseSelector(args) {
  const manifestId = args
    .find((argument) => argument.startsWith("--manifest="))
    ?.slice("--manifest=".length);
  const state = args
    .find((argument) => argument.startsWith("--state="))
    ?.slice("--state=".length)
    .trim()
    .toUpperCase();
  const candidate = args.includes("--candidate");
  const write = args.includes("--write");
  if (Boolean(manifestId) === Boolean(state)) {
    throw new Error(
      "usage: npm run build:precinct-delivery -- "
      + "(--manifest=<manifest-id> | --state=<state>) "
      + "[--candidate] [--write]",
    );
  }
  if (state && !candidate) {
    throw new Error("--state is restricted to local candidate builds");
  }
  if (state && !/^[A-Z]{2}$/.test(state)) {
    throw new Error("--state must be a two-letter state code");
  }
  return { manifestId, state, candidate, write };
}

export function runPrecinctDeliveryBuild(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const args = options.args ?? process.argv.slice(2);
  const selector = parseSelector(args);
  const registry = JSON.parse(
    readFileSync(
      path.join(root, "data", "precinct-geometry-manifests.json"),
      "utf8",
    ),
  );
  const manifests = registry.manifests
    .filter((entry) =>
      selector.manifestId
        ? entry.id === selector.manifestId
        : entry.state === selector.state)
    .sort((left, right) =>
      left.election.date.localeCompare(right.election.date)
      || left.id.localeCompare(right.id));

  if (manifests.length === 0) {
    throw new Error(
      selector.manifestId
        ? "unknown precinct geometry manifest " + selector.manifestId
        : "no precinct geometry manifests found for " + selector.state,
    );
  }

  const reports = manifests.map((manifest) =>
    buildPrecinctDeliveryArtifact({
      root,
      manifest,
      candidate: selector.candidate,
      write: selector.write,
    }));
  const output = reports.length === 1
    ? reports[0]
    : {
      mode: "candidate",
      state: selector.state,
      writeRequested: selector.write,
      manifestCount: reports.length,
      totalFeatureCount: reports.reduce(
        (sum, report) => sum + report.featureCount,
        0,
      ),
      reports,
    };

  if (
    !selector.candidate
    && reports.some((report) => report.declarationMatches !== true)
  ) {
    return {
      output,
      error:
        "delivery bytes do not match the manifest declaration; review the "
        + "reported hash and byte count, update the manifest, then rerun",
    };
  }
  return { output, error: null };
}

function main() {
  const result = runPrecinctDeliveryBuild();
  console.log(JSON.stringify(result.output, null, 2));
  if (result.error) {
    throw new Error(result.error);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}

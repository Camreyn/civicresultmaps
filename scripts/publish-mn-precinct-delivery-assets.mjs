import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectMinnesotaPrecinctBlobPublicationPlan,
  validateMinnesotaBlobPublicationAuthorization,
} from "./lib/mn-precinct-blob-publication.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArguments(args) {
  const write = args.includes("--write");
  const packagePath = args.find((argument) =>
    argument.startsWith("--package="))?.slice("--package=".length);
  const packageSha256 = args.find((argument) =>
    argument.startsWith("--package-sha256="))
    ?.slice("--package-sha256=".length);
  const concurrencyValue = args.find((argument) =>
    argument.startsWith("--concurrency="))?.slice("--concurrency=".length);
  const concurrency = concurrencyValue ? Number(concurrencyValue) : 4;
  for (const argument of args) {
    if (
      argument !== "--write"
      && !argument.startsWith("--package=")
      && !argument.startsWith("--package-sha256=")
      && !argument.startsWith("--concurrency=")
    ) {
      throw new Error("Unknown Minnesota Blob publication option: " + argument);
    }
  }
  if (!packagePath || !packageSha256) {
    throw new Error(
      "usage: npm run precinct-gis:delivery-publish:mn -- "
      + "--package=<release-candidate.json> --package-sha256=<sha256> "
      + "[--concurrency=4] [--write]",
    );
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("Minnesota Blob publication concurrency must be 1 through 8");
  }
  return { write, packagePath, packageSha256, concurrency };
}

function publicPlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    state: plan.state,
    releaseCandidate: plan.releaseCandidate,
    decision: plan.decision,
    assetCount: plan.assetCount,
    indexCount: plan.indexCount,
    parentArtifactCount: plan.parentArtifactCount,
    totalByteCount: plan.totalByteCount,
    uploadOrder: plan.uploadOrder,
    canonicalManifestChanged: plan.canonicalManifestChanged,
    publicEligibilityChanged: plan.publicEligibilityChanged,
    artifacts: plan.artifacts.map(({ absolutePath: _absolutePath, ...artifact }) =>
      artifact),
  };
}

async function verifyPublicBlob(url, artifact) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      "Published Minnesota geometry returned HTTP " + response.status,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== artifact.byteCount || sha256(bytes) !== artifact.sha256) {
    throw new Error("Published Minnesota geometry failed byte/hash verification");
  }
}

async function publishArtifact(artifact, sdk) {
  let existing = null;
  try {
    existing = await sdk.head(artifact.pathname);
  } catch (error) {
    if (!(error instanceof sdk.BlobNotFoundError)) throw error;
  }
  if (existing) {
    if (existing.size !== artifact.byteCount) {
      throw new Error(
        "Existing immutable Minnesota geometry has a different byte count",
      );
    }
    await verifyPublicBlob(existing.url, artifact);
    return {
      ...artifact,
      disposition: "verified_existing",
      url: existing.url,
      remoteMutationPerformed: false,
    };
  }

  const bytes = readFileSync(artifact.absolutePath);
  const uploaded = await sdk.put(artifact.pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 31_536_000,
    contentType: artifact.kind === "index"
      ? "application/json"
      : "application/geo+json",
    multipart: bytes.length >= 4 * 1024 * 1024,
  });
  if (
    uploaded.pathname !== artifact.pathname
    || new URL(uploaded.url).pathname !== "/" + artifact.pathname
  ) {
    throw new Error("Published Minnesota geometry URL/pathname drifted");
  }
  await verifyPublicBlob(uploaded.url, artifact);
  return {
    ...artifact,
    disposition: "created",
    url: uploaded.url,
    remoteMutationPerformed: true,
  };
}

async function publishBatch(artifacts, concurrency, sdk) {
  const results = new Array(artifacts.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < artifacts.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await publishArtifact(artifacts[index], sdk);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, artifacts.length) },
      () => worker(),
    ),
  );
  return results;
}

function writeEvidence(root, evidence) {
  const bytes = Buffer.from(JSON.stringify(evidence, null, 2) + "\n", "utf8");
  const digest = sha256(bytes);
  const relativePath = path.posix.join(
    ".etl",
    "precinct-blob-publications",
    "MN",
    "mn-precinct-blob-publication-"
      + evidence.releaseCandidate.sha256.slice(0, 12)
      + "-"
      + digest.slice(0, 12)
      + ".json",
  );
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  if (existsSync(absolutePath)) {
    if (!readFileSync(absolutePath).equals(bytes)) {
      throw new Error("Refusing to overwrite different Blob publication evidence");
    }
  } else {
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, bytes, { mode: 0o600 });
  }
  return { path: relativePath, byteCount: bytes.length, sha256: digest };
}

export async function publishMinnesotaPrecinctDeliveryAssets(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const plan = inspectMinnesotaPrecinctBlobPublicationPlan({
    root,
    packagePath: options.packagePath,
    packageSha256: options.packageSha256,
  });
  if (!options.write) {
    return {
      mode: "plan",
      ...publicPlan(plan),
      remoteMutationPerformed: false,
      evidence: null,
    };
  }
  const authorization = validateMinnesotaBlobPublicationAuthorization(plan);
  const sdk = await import("@vercel/blob");
  const parentResults = await publishBatch(
    plan.artifacts.filter((artifact) => artifact.kind === "parent"),
    options.concurrency ?? 4,
    sdk,
  );
  const indexResults = await publishBatch(
    plan.artifacts.filter((artifact) => artifact.kind === "index"),
    options.concurrency ?? 4,
    sdk,
  );
  const results = [...parentResults, ...indexResults];
  const origins = new Set(results.map((result) => new URL(result.url).origin));
  if (origins.size !== 1) {
    throw new Error("Minnesota geometry assets were not published to one origin");
  }
  const evidenceDocument = {
    schemaVersion: 1,
    state: "MN",
    purpose: "mn-precinct-parent-scoped-immutable-geometry-publication",
    publishedAtUtc: new Date().toISOString(),
    authorizationId: authorization.authorizationId,
    releaseCandidate: plan.releaseCandidate,
    deliveryOrigin: [...origins][0],
    assetCount: results.length,
    createdCount: results.filter((result) => result.disposition === "created").length,
    verifiedExistingCount: results.filter(
      (result) => result.disposition === "verified_existing",
    ).length,
    remoteMutationPerformed: results.some(
      (result) => result.remoteMutationPerformed,
    ),
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
    nextRequiredStep:
      "Configure CRM_PRECINCT_GEOGRAPHY_ORIGIN to deliveryOrigin in a protected preview and verify every year/county before canonical manifest activation.",
    artifacts: results.map(({
      absolutePath: _absolutePath,
      remoteMutationPerformed: _remoteMutationPerformed,
      ...result
    }) => result),
  };
  const evidence = writeEvidence(root, evidenceDocument);
  return {
    mode: "write",
    decision: "ASSETS_PUBLISHED_MANIFESTS_STILL_BLOCKED",
    releaseCandidate: plan.releaseCandidate,
    deliveryOrigin: evidenceDocument.deliveryOrigin,
    assetCount: evidenceDocument.assetCount,
    createdCount: evidenceDocument.createdCount,
    verifiedExistingCount: evidenceDocument.verifiedExistingCount,
    remoteMutationPerformed: evidenceDocument.remoteMutationPerformed,
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
    evidence,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await publishMinnesotaPrecinctDeliveryAssets(args);
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

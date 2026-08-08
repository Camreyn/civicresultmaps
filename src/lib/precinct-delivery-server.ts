import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrecinctGeometryManifestView } from "./precinct-geography";
import {
  selectPrecinctDeliveryFeatures,
  selectPrecinctParentDeliveryArtifact,
  type PrecinctDeliveryFeatureCollection,
  type PrecinctDeliveryMetadata,
} from "./precinct-map-delivery.ts";

export type ParentScopedPrecinctDelivery = {
  collection: PrecinctDeliveryFeatureCollection;
  sourceByteCount: number;
  sourceSha256: string;
  indexByteCount?: number;
  indexSha256?: string;
};

type DeliveryReadOptions = {
  repositoryRoot?: string;
  featureLimit?: number;
  deliveryOrigin?: string | null;
  fetchImpl?: typeof fetch;
};

function publicDeliveryPath(repositoryRoot: string, deliveryUrl: string) {
  if (
    !deliveryUrl.startsWith("/data/geography/")
    || deliveryUrl.includes("\\")
    || deliveryUrl.includes("?")
    || deliveryUrl.includes("#")
  ) {
    throw new Error("delivery URL is not a safe immutable geography path");
  }
  const segments = deliveryUrl.split("/").filter(Boolean);
  if (
    segments.some((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return true;
      }
      return decoded === "."
        || decoded === ".."
        || decoded.includes("/")
        || decoded.includes("\\");
    })
  ) {
    throw new Error("delivery URL contains an unsafe path segment");
  }

  const publicRoot = path.resolve(repositoryRoot, "public");
  const absolutePath = path.resolve(publicRoot, ...segments);
  if (!absolutePath.startsWith(publicRoot + path.sep)) {
    throw new Error("delivery path escapes the public directory");
  }
  return absolutePath;
}

function configuredDeliveryOrigin(options: DeliveryReadOptions) {
  const raw = options.deliveryOrigin
    ?? process.env.CRM_PRECINCT_GEOGRAPHY_ORIGIN
    ?? "";
  const value = raw.trim();
  if (!value) return null;
  let origin: URL;
  try {
    origin = new URL(value.endsWith("/") ? value : value + "/");
  } catch {
    throw new Error("precinct geography delivery origin is not a valid URL");
  }
  if (
    origin.protocol !== "https:"
    || origin.username
    || origin.password
    || origin.search
    || origin.hash
  ) {
    throw new Error(
      "precinct geography delivery origin must be a credential-free HTTPS URL",
    );
  }
  return origin;
}

async function readDeliveryBytes(
  deliveryUrl: string,
  options: DeliveryReadOptions,
) {
  const origin = configuredDeliveryOrigin(options);
  if (!origin) {
    return readFile(publicDeliveryPath(
      options.repositoryRoot ?? process.cwd(),
      deliveryUrl,
    ));
  }
  publicDeliveryPath(options.repositoryRoot ?? process.cwd(), deliveryUrl);
  const requestUrl = new URL(deliveryUrl.replace(/^\//, ""), origin);
  const response = await (options.fetchImpl ?? fetch)(requestUrl, {
    cache: "force-cache",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      "immutable precinct delivery origin returned HTTP " + response.status,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readVerifiedDeliveryBytes(input: {
  deliveryUrl: string;
  expectedByteCount: number;
  expectedSha256: string;
  mismatchOwner: "manifest" | "index";
  options: DeliveryReadOptions;
}) {
  if (
    !Number.isSafeInteger(input.expectedByteCount)
    || input.expectedByteCount <= 0
    || input.expectedByteCount > 64 * 1024 * 1024
    || !/^[a-f0-9]{64}$/i.test(input.expectedSha256)
  ) {
    throw new Error("delivery declaration is outside safe byte/hash bounds");
  }
  const bytes = await readDeliveryBytes(input.deliveryUrl, input.options);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== input.expectedByteCount) {
    throw new Error(input.mismatchOwner === "manifest"
      ? "delivery artifact byte count does not match manifest"
      : "delivery artifact byte count does not match index");
  }
  if (actualSha256 !== input.expectedSha256.toLowerCase()) {
    throw new Error(input.mismatchOwner === "manifest"
      ? "delivery artifact SHA-256 does not match manifest"
      : "delivery artifact SHA-256 does not match index");
  }
  return { bytes, sha256: actualSha256 };
}

function parseJson(bytes: Buffer, label: string) {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(label + " is not valid JSON");
  }
}

function assertMetadataMatchesManifest(
  metadata: PrecinctDeliveryMetadata,
  manifest: PrecinctGeometryManifestView,
) {
  const expectedMetadata = {
    manifestId: manifest.id,
    state: manifest.state,
    electionId: manifest.election.id,
    boundaryVintage: manifest.geography.boundaryVintage,
    sourceAuthority: manifest.source.authority,
    sourceUrl: manifest.source.url,
    licenseOrTerms: manifest.source.licenseOrTerms,
  };
  for (const [key, expected] of Object.entries(expectedMetadata)) {
    if (metadata[key as keyof typeof expectedMetadata] !== expected) {
      throw new Error(`delivery metadata ${key} does not match manifest`);
    }
  }
}

function parentArtifactUrl(indexUrl: string, artifactPath: string) {
  const indexDirectory = indexUrl.slice(0, indexUrl.lastIndexOf("/") + 1);
  const candidate = indexDirectory + artifactPath;
  publicDeliveryPath(process.cwd(), candidate);
  return candidate;
}

export async function readParentScopedPrecinctDelivery(
  manifest: PrecinctGeometryManifestView,
  parentGeoid: string,
  options: DeliveryReadOptions = {},
): Promise<ParentScopedPrecinctDelivery> {
  if (!manifest.eligible) {
    throw new Error("precinct manifest is not public-delivery eligible");
  }
  if (!manifest.delivery) {
    throw new Error("parent-scoped delivery requires a delivery declaration");
  }
  publicDeliveryPath(
    options.repositoryRoot ?? process.cwd(),
    manifest.delivery.url,
  );

  if (manifest.delivery.format === "geojson") {
    const verified = await readVerifiedDeliveryBytes({
      deliveryUrl: manifest.delivery.url,
      expectedByteCount: manifest.delivery.byteCount,
      expectedSha256: manifest.delivery.sha256,
      mismatchOwner: "manifest",
      options,
    });
    const collection = selectPrecinctDeliveryFeatures(
      parseJson(verified.bytes, "delivery artifact"),
      parentGeoid,
      options.featureLimit,
    );
    assertMetadataMatchesManifest(collection.metadata, manifest);
    return {
      collection,
      sourceByteCount: verified.bytes.byteLength,
      sourceSha256: verified.sha256,
    };
  }

  if (manifest.delivery.format !== "parent_scoped_geojson") {
    throw new Error(
      "parent-scoped delivery currently requires GeoJSON or a parent-scoped GeoJSON index",
    );
  }

  const verifiedIndex = await readVerifiedDeliveryBytes({
    deliveryUrl: manifest.delivery.url,
    expectedByteCount: manifest.delivery.byteCount,
    expectedSha256: manifest.delivery.sha256,
    mismatchOwner: "manifest",
    options,
  });
  const selected = selectPrecinctParentDeliveryArtifact(
    parseJson(verifiedIndex.bytes, "delivery index"),
    parentGeoid,
    options.featureLimit,
  );
  assertMetadataMatchesManifest(selected.index.metadata, manifest);
  if (
    selected.index.featureIdProperty !== manifest.delivery.featureIdProperty
    || selected.index.resultUnitProperty !== manifest.delivery.resultUnitProperty
    || selected.index.parentGeoidProperty !== manifest.delivery.parentGeoidProperty
    || selected.index.parentCount !== manifest.delivery.parentCount
    || selected.index.featureCount !== manifest.delivery.featureCount
  ) {
    throw new Error("delivery index contract does not match manifest");
  }
  const verifiedParent = await readVerifiedDeliveryBytes({
    deliveryUrl: parentArtifactUrl(
      manifest.delivery.url,
      selected.artifact.path,
    ),
    expectedByteCount: selected.artifact.byteCount,
    expectedSha256: selected.artifact.sha256,
    mismatchOwner: "index",
    options,
  });
  const parentValue = parseJson(verifiedParent.bytes, "parent delivery artifact");
  const collection = selectPrecinctDeliveryFeatures(
    parentValue,
    parentGeoid,
    options.featureLimit,
  );
  const rawFeatureCount = parentValue
    && typeof parentValue === "object"
    && "features" in parentValue
    && Array.isArray(parentValue.features)
    ? parentValue.features.length
    : -1;
  if (
    collection.features.length !== selected.artifact.featureCount
    || rawFeatureCount !== selected.artifact.featureCount
  ) {
    throw new Error("parent delivery feature count does not match index");
  }
  assertMetadataMatchesManifest(collection.metadata, manifest);
  return {
    collection,
    sourceByteCount: verifiedParent.bytes.byteLength,
    sourceSha256: verifiedParent.sha256,
    indexByteCount: verifiedIndex.bytes.byteLength,
    indexSha256: verifiedIndex.sha256,
  };
}

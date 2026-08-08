import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrecinctGeometryManifestView } from "./precinct-geography";
import {
  selectPrecinctDeliveryFeatures,
  type PrecinctDeliveryFeatureCollection,
} from "./precinct-map-delivery.ts";

export type ParentScopedPrecinctDelivery = {
  collection: PrecinctDeliveryFeatureCollection;
  sourceByteCount: number;
  sourceSha256: string;
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

export async function readParentScopedPrecinctDelivery(
  manifest: PrecinctGeometryManifestView,
  parentGeoid: string,
  options: {
    repositoryRoot?: string;
    featureLimit?: number;
  } = {},
): Promise<ParentScopedPrecinctDelivery> {
  if (!manifest.eligible) {
    throw new Error("precinct manifest is not public-delivery eligible");
  }
  if (!manifest.delivery || manifest.delivery.format !== "geojson") {
    throw new Error("parent-scoped delivery currently requires GeoJSON");
  }

  const absolutePath = publicDeliveryPath(
    options.repositoryRoot ?? process.cwd(),
    manifest.delivery.url,
  );
  const bytes = await readFile(absolutePath);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== manifest.delivery.byteCount) {
    throw new Error("delivery artifact byte count does not match manifest");
  }
  if (sourceSha256 !== manifest.delivery.sha256.toLowerCase()) {
    throw new Error("delivery artifact SHA-256 does not match manifest");
  }

  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("delivery artifact is not valid JSON");
  }
  const collection = selectPrecinctDeliveryFeatures(
    value,
    parentGeoid,
    options.featureLimit,
  );
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
    if (collection.metadata[key as keyof typeof expectedMetadata] !== expected) {
      throw new Error(`delivery metadata ${key} does not match manifest`);
    }
  }
  return {
    collection,
    sourceByteCount: bytes.byteLength,
    sourceSha256,
  };
}

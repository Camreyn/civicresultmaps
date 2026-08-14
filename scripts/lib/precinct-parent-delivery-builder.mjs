import { createHash } from "node:crypto";
import {
  selectPrecinctDeliveryFeatures,
  selectPrecinctParentDeliveryArtifact,
} from "../../src/lib/precinct-map-delivery.ts";
import {
  isValidLocalGeographyDeliveryParentId,
  localGeographyDeliveryParentValidationMessage,
} from "../../src/lib/local-geography-parent.ts";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(value) {
  return Buffer.from(JSON.stringify(value) + "\n", "utf8");
}

function parentGeoids(value) {
  if (
    !value
    || typeof value !== "object"
    || value.type !== "FeatureCollection"
    || !Array.isArray(value.features)
    || value.features.length === 0
  ) {
    throw new Error("parent-scoped delivery requires a nonempty FeatureCollection");
  }
  const state = String(value?.metadata?.state ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("parent-scoped delivery metadata requires a two-letter state");
  }
  const parents = new Set();
  for (const [index, feature] of value.features.entries()) {
    const parentGeoid = String(feature?.properties?.parentGeoid ?? "");
    if (!isValidLocalGeographyDeliveryParentId(state, parentGeoid)) {
      throw new Error(
        "delivery feature " + index + " "
        + localGeographyDeliveryParentValidationMessage(state),
      );
    }
    parents.add(parentGeoid);
  }
  return [...parents].sort();
}

export function buildParentScopedPrecinctDeliveryPackage(
  statewideCollection,
  options = {},
) {
  const parents = parentGeoids(statewideCollection);
  const parentArtifacts = parents.map((parentGeoid) => {
    const collection = selectPrecinctDeliveryFeatures(
      statewideCollection,
      parentGeoid,
      options.featureLimit,
    );
    if (collection.features.length === 0) {
      throw new Error("parent-scoped delivery produced an empty parent area");
    }
    const bytes = serialize(collection);
    const digest = sha256(bytes);
    return {
      parentGeoid,
      path: "parents/" + parentGeoid + "-" + digest.slice(0, 12) + ".geojson",
      sha256: digest,
      byteCount: bytes.length,
      featureCount: collection.features.length,
      bytes,
    };
  });
  const featureCount = parentArtifacts.reduce(
    (sum, artifact) => sum + artifact.featureCount,
    0,
  );
  if (featureCount !== statewideCollection.features.length) {
    throw new Error("parent-scoped delivery did not preserve every feature");
  }
  const resultUnits = new Set(
    statewideCollection.features.map(
      (feature) => feature.properties.resultUnitCode,
    ),
  );
  if (resultUnits.size !== featureCount) {
    throw new Error("parent-scoped delivery result-unit identity is not one-to-one");
  }

  const index = {
    schemaVersion: 1,
    format: "parent_scoped_geojson",
    metadata: statewideCollection.metadata,
    featureIdProperty: "geometryFeatureId",
    resultUnitProperty: "resultUnitCode",
    parentGeoidProperty: "parentGeoid",
    parentCount: parentArtifacts.length,
    featureCount,
    parents: parentArtifacts.map(({ bytes: _bytes, ...artifact }) => artifact),
  };
  const indexBytes = serialize(index);
  const indexSha256 = sha256(indexBytes);
  for (const artifact of parentArtifacts) {
    const selected = selectPrecinctParentDeliveryArtifact(
      index,
      artifact.parentGeoid,
      options.featureLimit,
    );
    if (
      selected.artifact.sha256 !== artifact.sha256
      || selected.artifact.byteCount !== artifact.byteCount
      || selected.artifact.featureCount !== artifact.featureCount
    ) {
      throw new Error("parent-scoped index validation drifted");
    }
  }

  return {
    index,
    indexBytes,
    indexSha256,
    indexByteCount: indexBytes.length,
    parentArtifacts,
    parentCount: parentArtifacts.length,
    featureCount,
    resultUnitCount: resultUnits.size,
    parentArtifactByteCount: parentArtifacts.reduce(
      (sum, artifact) => sum + artifact.byteCount,
      0,
    ),
  };
}

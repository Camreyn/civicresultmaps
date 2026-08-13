import type { ResultRow } from "./types";

// Harris County, Texas has 1,070 election-specific VTD features in 2024.
// Keep the guard bounded while allowing complete county-scoped delivery.
export const MAX_SELECTED_PARENT_PRECINCT_FEATURES = 1500;

export type PrecinctDeliveryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type PrecinctDeliveryFeature = {
  type: "Feature";
  properties: {
    geometryFeatureId: string;
    resultUnitCode: string;
    parentGeoid: string;
    sourceFeatureId: string;
    displayName: string;
    geographyType: string;
    relationshipType: "one_to_one" | "one_to_many" | "no_data";
  };
  geometry: PrecinctDeliveryGeometry;
};

export type PrecinctDeliveryMetadata = {
  schemaVersion: 1;
  manifestId: string;
  state: string;
  electionId: string;
  boundaryVintage: string;
  sourceAuthority: string;
  sourceUrl: string;
  licenseOrTerms: string;
};

export type PrecinctDeliveryFeatureCollection = {
  type: "FeatureCollection";
  metadata: PrecinctDeliveryMetadata;
  features: PrecinctDeliveryFeature[];
};

export type PrecinctParentDeliveryArtifact = {
  parentGeoid: string;
  path: string;
  sha256: string;
  byteCount: number;
  featureCount: number;
};

export type PrecinctParentDeliveryIndex = {
  schemaVersion: 1;
  format: "parent_scoped_geojson";
  metadata: PrecinctDeliveryMetadata;
  featureIdProperty: string;
  resultUnitProperty: string;
  parentGeoidProperty: string;
  parentCount: number;
  featureCount: number;
  parents: PrecinctParentDeliveryArtifact[];
};

export type JoinedPrecinctDeliveryFeature = {
  feature: PrecinctDeliveryFeature;
  result: ResultRow | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  context: string,
) {
  const result = value[key];
  if (typeof result !== "string" || result.trim().length === 0) {
    throw new Error(context + "." + key + " must be a nonempty string");
  }
  return result;
}

function requiredPositiveInteger(
  value: Record<string, unknown>,
  key: string,
  context: string,
) {
  const result = value[key];
  if (
    typeof result !== "number"
    || !Number.isSafeInteger(result)
    || result <= 0
  ) {
    throw new Error(context + "." + key + " must be a positive integer");
  }
  return Number(result);
}

function deliveryMetadata(value: unknown): PrecinctDeliveryMetadata {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("precinct delivery metadata schemaVersion must equal 1");
  }
  const metadata = {
    schemaVersion: 1 as const,
    manifestId: requiredString(value, "manifestId", "metadata"),
    state: requiredString(value, "state", "metadata"),
    electionId: requiredString(value, "electionId", "metadata"),
    boundaryVintage: requiredString(value, "boundaryVintage", "metadata"),
    sourceAuthority: requiredString(value, "sourceAuthority", "metadata"),
    sourceUrl: requiredString(value, "sourceUrl", "metadata"),
    licenseOrTerms: requiredString(value, "licenseOrTerms", "metadata"),
  };
  if (!/^[A-Z]{2}$/.test(metadata.state)) {
    throw new Error("metadata.state must be a two-letter state code");
  }
  if (!metadata.sourceUrl.startsWith("https://")) {
    throw new Error("metadata.sourceUrl must use HTTPS");
  }
  return metadata;
}

function isSafeParentArtifactPath(value: string, parentGeoid: string) {
  if (
    !new RegExp(
      "^parents/" + parentGeoid + "-[a-f0-9]{12}\\.geojson$",
    ).test(value)
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
  ) {
    return false;
  }
  try {
    return value.split("/").every((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded !== "."
        && decoded !== ".."
        && !decoded.includes("/")
        && !decoded.includes("\\");
    });
  } catch {
    return false;
  }
}

export function selectPrecinctParentDeliveryArtifact(
  value: unknown,
  parentGeoid: string,
  limit = MAX_SELECTED_PARENT_PRECINCT_FEATURES,
): {
  index: PrecinctParentDeliveryIndex;
  artifact: PrecinctParentDeliveryArtifact;
} {
  if (!/^\d{5}$/.test(parentGeoid)) {
    throw new Error("parentGeoid must be a five-digit county GEOID");
  }
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || value.format !== "parent_scoped_geojson"
  ) {
    throw new Error(
      "precinct parent delivery index must use schemaVersion 1 and parent_scoped_geojson",
    );
  }
  const metadata = deliveryMetadata(value.metadata);
  const featureIdProperty = requiredString(
    value,
    "featureIdProperty",
    "index",
  );
  const resultUnitProperty = requiredString(
    value,
    "resultUnitProperty",
    "index",
  );
  const parentGeoidProperty = requiredString(
    value,
    "parentGeoidProperty",
    "index",
  );
  const parentCount = requiredPositiveInteger(value, "parentCount", "index");
  const featureCount = requiredPositiveInteger(value, "featureCount", "index");
  if (!Array.isArray(value.parents) || value.parents.length !== parentCount) {
    throw new Error("index.parents length must equal index.parentCount");
  }

  const seen = new Set<string>();
  let indexedFeatures = 0;
  const parents = value.parents.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new Error("index.parents[" + index + "] must be an object");
    }
    const context = "index.parents[" + index + "]";
    const candidateParent = requiredString(candidate, "parentGeoid", context);
    if (!/^\d{5}$/.test(candidateParent) || seen.has(candidateParent)) {
      throw new Error(context + ".parentGeoid must be unique and five digits");
    }
    seen.add(candidateParent);
    const artifactPath = requiredString(candidate, "path", context);
    if (!isSafeParentArtifactPath(artifactPath, candidateParent)) {
      throw new Error(context + ".path is not a safe content-addressed parent artifact");
    }
    const artifactSha256 = requiredString(candidate, "sha256", context)
      .toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(artifactSha256)) {
      throw new Error(context + ".sha256 must be a SHA-256 value");
    }
    const byteCount = requiredPositiveInteger(candidate, "byteCount", context);
    const candidateFeatureCount = requiredPositiveInteger(
      candidate,
      "featureCount",
      context,
    );
    if (candidateFeatureCount > limit) {
      throw new Error(
        context + ".featureCount is above the safe client limit " + limit,
      );
    }
    indexedFeatures += candidateFeatureCount;
    return {
      parentGeoid: candidateParent,
      path: artifactPath,
      sha256: artifactSha256,
      byteCount,
      featureCount: candidateFeatureCount,
    };
  });
  if (indexedFeatures !== featureCount) {
    throw new Error("indexed parent feature counts must equal index.featureCount");
  }
  const artifact = parents.find((entry) => entry.parentGeoid === parentGeoid);
  if (!artifact) {
    throw new Error("requested parent is not present in the delivery index");
  }
  return {
    index: {
      schemaVersion: 1,
      format: "parent_scoped_geojson",
      metadata,
      featureIdProperty,
      resultUnitProperty,
      parentGeoidProperty,
      parentCount,
      featureCount,
      parents,
    },
    artifact,
  };
}

export function geographyManifestApiPath(options: {
  state: string;
  electionDate?: string;
  electionId?: string;
  level?: string;
  includeBlocked?: boolean;
}) {
  const state = options.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("state must be a two-letter code");
  }
  const params = new URLSearchParams({
    state,
    level: options.level?.trim().toLowerCase() || "precinct",
  });
  if (options.electionDate) {
    params.set("electionDate", options.electionDate);
  }
  if (options.electionId) {
    params.set("electionId", options.electionId);
  }
  if (options.includeBlocked) {
    params.set("includeBlocked", "true");
  }
  return "/api/geography-manifests?" + params.toString();
}

export function parentScopedPrecinctDeliveryApiPath(options: {
  manifestId: string;
  parentGeoid: string;
}) {
  const manifestId = options.manifestId.trim();
  if (!/^[a-z0-9][a-z0-9-]+$/.test(manifestId)) {
    throw new Error("manifestId must be a lowercase, dash-delimited identifier");
  }
  const parentGeoid = options.parentGeoid.trim();
  if (!/^\d{5}$/.test(parentGeoid)) {
    throw new Error("parentGeoid must be a five-digit county GEOID");
  }
  return "/api/precinct-geography?" + new URLSearchParams({
    manifestId,
    parentGeoid,
  }).toString();
}

export function selectPrecinctDeliveryFeatures(
  value: unknown,
  parentGeoid: string,
  limit = MAX_SELECTED_PARENT_PRECINCT_FEATURES,
): PrecinctDeliveryFeatureCollection {
  if (!/^\d{5}$/.test(parentGeoid)) {
    throw new Error("parentGeoid must be a five-digit county GEOID");
  }
  if (!isRecord(value) || value.type !== "FeatureCollection") {
    throw new Error("precinct delivery must be a GeoJSON FeatureCollection");
  }
  if (!Array.isArray(value.features)) {
    throw new Error("precinct delivery features must be an array");
  }
  const metadata = deliveryMetadata(value.metadata);

  const selected = value.features.flatMap((candidate, index) => {
    if (!isRecord(candidate) || candidate.type !== "Feature") {
      throw new Error("features[" + index + "] must be a GeoJSON Feature");
    }
    if (!isRecord(candidate.properties)) {
      throw new Error("features[" + index + "].properties must be an object");
    }
    const properties = candidate.properties;
    const candidateParent = requiredString(
      properties,
      "parentGeoid",
      "features[" + index + "].properties",
    );
    if (candidateParent !== parentGeoid) {
      return [];
    }
    for (const key of [
      "geometryFeatureId",
      "resultUnitCode",
      "sourceFeatureId",
      "displayName",
      "geographyType",
      "relationshipType",
    ]) {
      requiredString(properties, key, "features[" + index + "].properties");
    }
    if (
      !["one_to_one", "one_to_many", "no_data"].includes(
        String(properties.relationshipType),
      )
    ) {
      throw new Error(
        "features["
        + index
        + "].properties.relationshipType must be one_to_one, one_to_many, or no_data",
      );
    }
    if (
      !isRecord(candidate.geometry)
      || (
        candidate.geometry.type !== "Polygon"
        && candidate.geometry.type !== "MultiPolygon"
      )
      || !Array.isArray(candidate.geometry.coordinates)
    ) {
      throw new Error(
        "features[" + index + "] must contain Polygon or MultiPolygon geometry",
      );
    }
    return [candidate as PrecinctDeliveryFeature];
  });

  if (selected.length > limit) {
    throw new Error(
      "selected parent contains "
      + selected.length
      + " features, above the safe client limit "
      + limit,
    );
  }
  return { type: "FeatureCollection", metadata, features: selected };
}

export function joinPrecinctDeliveryResults(
  features: PrecinctDeliveryFeature[],
  results: ResultRow[],
  expectedLevel = "precinct",
): JoinedPrecinctDeliveryFeature[] {
  const byCode = new Map<string, ResultRow>();
  for (const result of results) {
    if (result.level !== expectedLevel) {
      continue;
    }
    if (byCode.has(result.jurisdictionCode)) {
      throw new Error(
        "duplicate local result code " + result.jurisdictionCode,
      );
    }
    byCode.set(result.jurisdictionCode, result);
  }
  return features.map((feature) => ({
    feature,
    result: byCode.get(feature.properties.resultUnitCode) ?? null,
  }));
}

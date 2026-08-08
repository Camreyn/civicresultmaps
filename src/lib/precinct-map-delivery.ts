import type { ResultRow } from "./types";

export const MAX_SELECTED_PARENT_PRECINCT_FEATURES = 1000;

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
    relationshipType: "one_to_one" | "one_to_many";
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
  if (!isRecord(value.metadata) || value.metadata.schemaVersion !== 1) {
    throw new Error("precinct delivery metadata schemaVersion must equal 1");
  }
  const metadata = {
    schemaVersion: 1 as const,
    manifestId: requiredString(value.metadata, "manifestId", "metadata"),
    state: requiredString(value.metadata, "state", "metadata"),
    electionId: requiredString(value.metadata, "electionId", "metadata"),
    boundaryVintage: requiredString(
      value.metadata,
      "boundaryVintage",
      "metadata",
    ),
    sourceAuthority: requiredString(
      value.metadata,
      "sourceAuthority",
      "metadata",
    ),
    sourceUrl: requiredString(value.metadata, "sourceUrl", "metadata"),
    licenseOrTerms: requiredString(
      value.metadata,
      "licenseOrTerms",
      "metadata",
    ),
  };
  if (!/^[A-Z]{2}$/.test(metadata.state)) {
    throw new Error("metadata.state must be a two-letter state code");
  }
  if (!metadata.sourceUrl.startsWith("https://")) {
    throw new Error("metadata.sourceUrl must use HTTPS");
  }

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
): JoinedPrecinctDeliveryFeature[] {
  const byCode = new Map<string, ResultRow>();
  for (const result of results) {
    if (result.level !== "precinct") {
      continue;
    }
    if (byCode.has(result.jurisdictionCode)) {
      throw new Error(
        "duplicate precinct result code " + result.jurisdictionCode,
      );
    }
    byCode.set(result.jurisdictionCode, result);
  }
  return features.map((feature) => ({
    feature,
    result: byCode.get(feature.properties.resultUnitCode) ?? null,
  }));
}

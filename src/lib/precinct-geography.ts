export const PRECINCT_GEOGRAPHY_SCHEMA_VERSION = 1 as const;

export type GeometryVintageStatus =
  | "election_date_confirmed"
  | "current_only"
  | "unknown";

export type GeometryReviewStatus =
  | "candidate"
  | "blocked"
  | "reviewed"
  | "rejected";

export type CrosswalkReviewStatus = "pending" | "blocked" | "reviewed";

export type GeographyDelivery =
  | {
      format: "geojson";
      url: string;
      sha256: string;
      byteCount: number;
      featureIdProperty: string;
      resultUnitProperty: string;
    }
  | {
      format: "pmtiles";
      url: string;
      sha256: string;
      byteCount: number;
      sourceLayer: string;
      featureIdProperty: string;
      resultUnitProperty: string;
      minZoom: number;
      maxZoom: number;
    };

export type DigitizedMapReview = {
  georeferenceBasis: "embedded" | "control_points";
  controlPointCount: number;
  rmseMeters: number | null;
  tool: string;
  reviewer: string;
  reviewedAt: string;
  labelReviewComplete: boolean;
  topologyReviewComplete: boolean;
};

export type PrecinctGeometryManifest = {
  schemaVersion: typeof PRECINCT_GEOGRAPHY_SCHEMA_VERSION;
  id: string;
  state: string;
  election: {
    id: string;
    date: string;
    year: number;
    type: string;
    office: string;
  };
  geography: {
    level: string;
    parentLevel: string;
    boundaryVintage: string;
    vintageStatus: GeometryVintageStatus;
    derivationMethod:
      | "official_export"
      | "official_service"
      | "digitized_map"
      | "official_crosswalk"
      | "availability_diagnostic";
    digitizationReview?: DigitizedMapReview;
  };
  source: {
    authority: string;
    url: string;
    retrievedAt: string;
    artifact: string;
    sha256: string;
    byteCount: number;
    format: string;
    licenseOrTerms: string;
  };
  normalization: {
    script: string;
    sourceCrs: string;
    servedCrs: "EPSG:4326";
    artifact: string;
    sha256: string;
    featureCount: number;
    sourceFeatureIdFields: string[];
    parentIdFields: string[];
  };
  crosswalk: {
    status: CrosswalkReviewStatus;
    resultSourceId: string;
    artifact: string;
    sha256: string;
    resultUnits: number;
    colorableResultUnits: number;
    matchedResultUnits: number;
    unmatchedResultUnits: number;
    nonGeographicResultUnits: number;
    sourceAliasResultUnits: number;
    relationships: {
      oneToOne: number;
      oneToMany: number;
      manyToOne: number;
      unmatched: number;
      nonGeographic: number;
      sourceAlias: number;
      pendingReview: number;
    };
    methods: string[];
  };
  validation: {
    status: GeometryReviewStatus;
    geometryValid: boolean;
    rowLevelRenderingSafe: boolean;
    parentTotalsReconciled: boolean;
    errors: string[];
    warnings: string[];
  };
  delivery: GeographyDelivery | null;
  caveats: string[];
};

export type PrecinctGeometryRegistry = {
  schemaVersion: typeof PRECINCT_GEOGRAPHY_SCHEMA_VERSION;
  updatedAt: string;
  manifests: PrecinctGeometryManifest[];
};

export type ReportingUnitIdentity = {
  state: string;
  electionId: string;
  reportingGrain: string;
  parentGeoid?: string | null;
  sourceUnitId: string;
};

function reportingUnitCodePart(value: string) {
  return encodeURIComponent(value.trim());
}

export function reportingUnitCode(identity: ReportingUnitIdentity) {
  const state = identity.state.trim().toUpperCase();
  const electionId = identity.electionId.trim();
  const reportingGrain = identity.reportingGrain.trim().toLowerCase();
  const parentGeoid = String(identity.parentGeoid ?? "").trim();
  const sourceUnitId = identity.sourceUnitId.trim();

  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("reporting unit state must be a two-letter code");
  }
  if (!electionId) {
    throw new Error("reporting unit electionId is required");
  }
  if (!reportingGrain) {
    throw new Error("reporting unit reportingGrain is required");
  }
  if (!sourceUnitId) {
    throw new Error("reporting unit sourceUnitId is required");
  }

  return [
    "reporting",
    state,
    reportingUnitCodePart(electionId),
    reportingUnitCodePart(reportingGrain),
    parentGeoid ? reportingUnitCodePart(parentGeoid) : "~",
    reportingUnitCodePart(sourceUnitId),
  ].join(":");
}

export type ManifestInspection = {
  errors: string[];
  publicEligibilityReasons: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(path + " must be an object");
    return {};
  }
  return value;
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(path + "." + key + " must be a non-empty string");
    return "";
  }
  return value;
}

function stringArray(
  row: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  options: { nonEmpty?: boolean } = {},
) {
  const value = row[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(path + "." + key + " must be an array of strings");
    return [] as string[];
  }
  if (options.nonEmpty && value.length === 0) {
    errors.push(path + "." + key + " must not be empty");
  }
  return value as string[];
}

function nonNegativeInteger(
  row: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
) {
  const value = row[key];
  if (!Number.isInteger(value) || Number(value) < 0) {
    errors.push(path + "." + key + " must be a non-negative integer");
    return 0;
  }
  return Number(value);
}

function requiredBoolean(
  row: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
) {
  const value = row[key];
  if (typeof value !== "boolean") {
    errors.push(path + "." + key + " must be a boolean");
    return false;
  }
  return value;
}

function enumValue(
  row: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  const value = requiredString(row, key, path, errors);
  if (value && !allowed.includes(value)) {
    errors.push(path + "." + key + " must be one of " + allowed.join(", "));
  }
  return value;
}

function validateSha256(value: string, path: string, errors: string[]) {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    errors.push(path + " must be a 64-character SHA-256 value");
  }
}

function validateIsoDate(value: string, path: string, errors: string[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) {
    errors.push(path + " must be an ISO calendar date");
  }
}

function validateIsoTimestamp(
  value: string,
  path: string,
  errors: string[],
  validationTime: number,
) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    errors.push(path + " must be an ISO timestamp");
  } else if (parsed > validationTime) {
    errors.push(path + " must not be in the future");
  }
}

function validateRepositoryPath(value: string, path: string, errors: string[], allowedRoots = ["data/"]) {
  if (
    !allowedRoots.some((root) => value.startsWith(root))
    || value.includes("\\")
    || value.split("/").includes("..")
    || value.startsWith("/")
  ) {
    errors.push(path + " must be a safe repository-relative path under " + allowedRoots.join(" or "));
  }
}

function validateHttpsUrl(value: string, path: string, errors: string[]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push(path + " must use HTTPS");
    }
  } catch {
    errors.push(path + " must be a valid URL");
  }
}

function isSafePublicDeliveryUrl(value: string) {
  if (
    !value.startsWith("/data/geography/")
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
  ) {
    return false;
  }
  try {
    return value
      .split("/")
      .filter(Boolean)
      .every((segment) => {
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

function publicEligibilityReasons(
  manifest: PrecinctGeometryManifest,
): string[] {
  const reasons: string[] = [];
  if (
    manifest.geography.derivationMethod === "digitized_map"
    && (
      !manifest.geography.digitizationReview?.labelReviewComplete
      || !manifest.geography.digitizationReview?.topologyReviewComplete
    )
  ) {
    reasons.push(
      "digitized-map label and topology reviews are not complete",
    );
  }
  if (manifest.validation.status !== "reviewed") {
    reasons.push("validation status is not reviewed");
  }
  if (manifest.geography.vintageStatus !== "election_date_confirmed") {
    reasons.push("geometry vintage is not confirmed for the election date");
  }
  if (!manifest.validation.geometryValid) {
    reasons.push("geometry validation has not passed");
  }
  if (!manifest.validation.rowLevelRenderingSafe) {
    reasons.push("row-level rendering is not safe");
  }
  if (!manifest.validation.parentTotalsReconciled) {
    reasons.push("parent totals do not reconcile");
  }
  if (manifest.validation.errors.length > 0) {
    reasons.push("validation errors remain");
  }
  if (manifest.crosswalk.status !== "reviewed") {
    reasons.push("crosswalk is not reviewed");
  }
  if (manifest.crosswalk.unmatchedResultUnits !== 0) {
    reasons.push("colorable result units remain unmatched");
  }
  if (
    manifest.crosswalk.relationships.unmatched !== 0
    || manifest.crosswalk.relationships.pendingReview !== 0
  ) {
    reasons.push("crosswalk relationships remain unmatched or pending");
  }
  if (
    manifest.crosswalk.matchedResultUnits
    !== manifest.crosswalk.colorableResultUnits
  ) {
    reasons.push("not every colorable result unit is matched");
  }
  if (!manifest.delivery) {
    reasons.push("no immutable delivery artifact is declared");
  }
  return reasons;
}

export function inspectPrecinctGeometryManifest(
  value: unknown,
  validationTime = Date.now(),
): ManifestInspection {
  const errors: string[] = [];
  const root = asRecord(value, "manifest", errors);
  if (root.schemaVersion !== PRECINCT_GEOGRAPHY_SCHEMA_VERSION) {
    errors.push("manifest.schemaVersion must equal 1");
  }

  const id = requiredString(root, "id", "manifest", errors);
  if (id && !/^[a-z0-9][a-z0-9-]+$/.test(id)) {
    errors.push("manifest.id must be a lowercase, dash-delimited identifier");
  }

  const state = requiredString(root, "state", "manifest", errors);
  if (state && !/^[A-Z]{2}$/.test(state)) {
    errors.push("manifest.state must be a two-letter uppercase code");
  }

  const election = asRecord(root.election, "manifest.election", errors);
  requiredString(election, "id", "manifest.election", errors);
  const electionDate = requiredString(election, "date", "manifest.election", errors);
  validateIsoDate(electionDate, "manifest.election.date", errors);
  const electionYear = nonNegativeInteger(
    election,
    "year",
    "manifest.election",
    errors,
  );
  requiredString(election, "type", "manifest.election", errors);
  requiredString(election, "office", "manifest.election", errors);
  if (electionDate && electionYear && Number(electionDate.slice(0, 4)) !== electionYear) {
    errors.push("manifest.election.year must agree with manifest.election.date");
  }

  const geography = asRecord(root.geography, "manifest.geography", errors);
  requiredString(geography, "level", "manifest.geography", errors);
  requiredString(geography, "parentLevel", "manifest.geography", errors);
  requiredString(geography, "boundaryVintage", "manifest.geography", errors);
  enumValue(
    geography,
    "vintageStatus",
    ["election_date_confirmed", "current_only", "unknown"],
    "manifest.geography",
    errors,
  );
  const derivationMethod = enumValue(
    geography,
    "derivationMethod",
    [
      "official_export",
      "official_service",
      "digitized_map",
      "official_crosswalk",
      "availability_diagnostic",
    ],
    "manifest.geography",
    errors,
  );
  if (derivationMethod === "digitized_map") {
    const review = asRecord(
      geography.digitizationReview,
      "manifest.geography.digitizationReview",
      errors,
    );
    const basis = enumValue(
      review,
      "georeferenceBasis",
      ["embedded", "control_points"],
      "manifest.geography.digitizationReview",
      errors,
    );
    const controlPointCount = nonNegativeInteger(
      review,
      "controlPointCount",
      "manifest.geography.digitizationReview",
      errors,
    );
    if (basis === "control_points" && controlPointCount < 4) {
      errors.push(
        "manifest.geography.digitizationReview.controlPointCount "
        + "must be at least 4 for control-point georeferencing",
      );
    }
    if (
      review.rmseMeters !== null
      && (
        typeof review.rmseMeters !== "number"
        || !Number.isFinite(review.rmseMeters)
        || review.rmseMeters < 0
      )
    ) {
      errors.push(
        "manifest.geography.digitizationReview.rmseMeters "
        + "must be null or a non-negative finite number",
      );
    }
    if (basis === "control_points" && review.rmseMeters === null) {
      errors.push(
        "manifest.geography.digitizationReview.rmseMeters "
        + "is required for control-point georeferencing",
      );
    }
    requiredString(
      review,
      "tool",
      "manifest.geography.digitizationReview",
      errors,
    );
    requiredString(
      review,
      "reviewer",
      "manifest.geography.digitizationReview",
      errors,
    );
    const reviewedAt = requiredString(
      review,
      "reviewedAt",
      "manifest.geography.digitizationReview",
      errors,
    );
    validateIsoTimestamp(
      reviewedAt,
      "manifest.geography.digitizationReview.reviewedAt",
      errors,
      validationTime,
    );
    requiredBoolean(
      review,
      "labelReviewComplete",
      "manifest.geography.digitizationReview",
      errors,
    );
    requiredBoolean(
      review,
      "topologyReviewComplete",
      "manifest.geography.digitizationReview",
      errors,
    );
  }

  const source = asRecord(root.source, "manifest.source", errors);
  requiredString(source, "authority", "manifest.source", errors);
  const sourceUrl = requiredString(source, "url", "manifest.source", errors);
  validateHttpsUrl(sourceUrl, "manifest.source.url", errors);
  const retrievedAt = requiredString(source, "retrievedAt", "manifest.source", errors);
  validateIsoTimestamp(retrievedAt, "manifest.source.retrievedAt", errors, validationTime);
  const sourceArtifact = requiredString(source, "artifact", "manifest.source", errors);
  validateRepositoryPath(sourceArtifact, "manifest.source.artifact", errors);
  const sourceHash = requiredString(source, "sha256", "manifest.source", errors);
  validateSha256(sourceHash, "manifest.source.sha256", errors);
  nonNegativeInteger(source, "byteCount", "manifest.source", errors);
  requiredString(source, "format", "manifest.source", errors);
  requiredString(source, "licenseOrTerms", "manifest.source", errors);

  const normalization = asRecord(
    root.normalization,
    "manifest.normalization",
    errors,
  );
  const script = requiredString(
    normalization,
    "script",
    "manifest.normalization",
    errors,
  );
  validateRepositoryPath(script, "manifest.normalization.script", errors, ["scripts/"]);
  requiredString(normalization, "sourceCrs", "manifest.normalization", errors);
  const servedCrs = requiredString(
    normalization,
    "servedCrs",
    "manifest.normalization",
    errors,
  );
  if (servedCrs && servedCrs !== "EPSG:4326") {
    errors.push("manifest.normalization.servedCrs must equal EPSG:4326");
  }
  const normalizedArtifact = requiredString(
    normalization,
    "artifact",
    "manifest.normalization",
    errors,
  );
  validateRepositoryPath(
    normalizedArtifact,
    "manifest.normalization.artifact",
    errors,
  );
  const normalizedHash = requiredString(
    normalization,
    "sha256",
    "manifest.normalization",
    errors,
  );
  validateSha256(normalizedHash, "manifest.normalization.sha256", errors);
  nonNegativeInteger(
    normalization,
    "featureCount",
    "manifest.normalization",
    errors,
  );
  stringArray(
    normalization,
    "sourceFeatureIdFields",
    "manifest.normalization",
    errors,
    { nonEmpty: true },
  );
  stringArray(
    normalization,
    "parentIdFields",
    "manifest.normalization",
    errors,
    { nonEmpty: true },
  );

  const crosswalk = asRecord(root.crosswalk, "manifest.crosswalk", errors);
  enumValue(
    crosswalk,
    "status",
    ["pending", "blocked", "reviewed"],
    "manifest.crosswalk",
    errors,
  );
  requiredString(crosswalk, "resultSourceId", "manifest.crosswalk", errors);
  const crosswalkArtifact = requiredString(
    crosswalk,
    "artifact",
    "manifest.crosswalk",
    errors,
  );
  validateRepositoryPath(
    crosswalkArtifact,
    "manifest.crosswalk.artifact",
    errors,
  );
  const crosswalkHash = requiredString(
    crosswalk,
    "sha256",
    "manifest.crosswalk",
    errors,
  );
  validateSha256(crosswalkHash, "manifest.crosswalk.sha256", errors);
  const resultUnits = nonNegativeInteger(
    crosswalk,
    "resultUnits",
    "manifest.crosswalk",
    errors,
  );
  const colorableResultUnits = nonNegativeInteger(
    crosswalk,
    "colorableResultUnits",
    "manifest.crosswalk",
    errors,
  );
  const matchedResultUnits = nonNegativeInteger(
    crosswalk,
    "matchedResultUnits",
    "manifest.crosswalk",
    errors,
  );
  const unmatchedResultUnits = nonNegativeInteger(
    crosswalk,
    "unmatchedResultUnits",
    "manifest.crosswalk",
    errors,
  );
  const nonGeographicResultUnits = nonNegativeInteger(
    crosswalk,
    "nonGeographicResultUnits",
    "manifest.crosswalk",
    errors,
  );
  const sourceAliasResultUnits = nonNegativeInteger(
    crosswalk,
    "sourceAliasResultUnits",
    "manifest.crosswalk",
    errors,
  );
  if (
    colorableResultUnits + nonGeographicResultUnits + sourceAliasResultUnits
    !== resultUnits
  ) {
    errors.push(
      "manifest.crosswalk resultUnits must equal colorableResultUnits plus nonGeographicResultUnits plus sourceAliasResultUnits",
    );
  }
  if (matchedResultUnits + unmatchedResultUnits !== colorableResultUnits) {
    errors.push(
      "manifest.crosswalk colorableResultUnits must equal matchedResultUnits plus unmatchedResultUnits",
    );
  }

  const relationships = asRecord(
    crosswalk.relationships,
    "manifest.crosswalk.relationships",
    errors,
  );
  const relationshipCounts = [
    "oneToOne",
    "oneToMany",
    "manyToOne",
    "unmatched",
    "nonGeographic",
    "sourceAlias",
    "pendingReview",
  ].map((key) =>
    nonNegativeInteger(
      relationships,
      key,
      "manifest.crosswalk.relationships",
      errors,
    ),
  );
  if (relationshipCounts.reduce((sum, count) => sum + count, 0) !== resultUnits) {
    errors.push(
      "manifest.crosswalk.relationships counts must sum to resultUnits",
    );
  }
  stringArray(crosswalk, "methods", "manifest.crosswalk", errors, {
    nonEmpty: resultUnits > 0,
  });

  const validation = asRecord(root.validation, "manifest.validation", errors);
  enumValue(
    validation,
    "status",
    ["candidate", "blocked", "reviewed", "rejected"],
    "manifest.validation",
    errors,
  );
  requiredBoolean(
    validation,
    "geometryValid",
    "manifest.validation",
    errors,
  );
  requiredBoolean(
    validation,
    "rowLevelRenderingSafe",
    "manifest.validation",
    errors,
  );
  requiredBoolean(
    validation,
    "parentTotalsReconciled",
    "manifest.validation",
    errors,
  );
  stringArray(validation, "errors", "manifest.validation", errors);
  stringArray(validation, "warnings", "manifest.validation", errors);
  stringArray(root, "caveats", "manifest", errors);

  if (root.delivery !== null) {
    const delivery = asRecord(root.delivery, "manifest.delivery", errors);
    const format = enumValue(
      delivery,
      "format",
      ["geojson", "pmtiles"],
      "manifest.delivery",
      errors,
    );
    const deliveryUrl = requiredString(
      delivery,
      "url",
      "manifest.delivery",
      errors,
    );
    if (deliveryUrl && !isSafePublicDeliveryUrl(deliveryUrl)) {
      errors.push(
        "manifest.delivery.url must use a safe versioned /data/geography/ path",
      );
    }
    const deliveryHash = requiredString(
      delivery,
      "sha256",
      "manifest.delivery",
      errors,
    );
    validateSha256(deliveryHash, "manifest.delivery.sha256", errors);
    nonNegativeInteger(delivery, "byteCount", "manifest.delivery", errors);
    requiredString(
      delivery,
      "featureIdProperty",
      "manifest.delivery",
      errors,
    );
    requiredString(
      delivery,
      "resultUnitProperty",
      "manifest.delivery",
      errors,
    );
    if (format === "pmtiles") {
      requiredString(delivery, "sourceLayer", "manifest.delivery", errors);
      const minZoom = nonNegativeInteger(
        delivery,
        "minZoom",
        "manifest.delivery",
        errors,
      );
      const maxZoom = nonNegativeInteger(
        delivery,
        "maxZoom",
        "manifest.delivery",
        errors,
      );
      if (maxZoom < minZoom) {
        errors.push("manifest.delivery.maxZoom must be at least minZoom");
      }
    }
  }

  if (derivationMethod === "availability_diagnostic") {
    if (normalization.featureCount !== 0) {
      errors.push(
        "availability-diagnostic manifests must have zero normalized features",
      );
    }
    if (validation.geometryValid !== false) {
      errors.push(
        "availability-diagnostic manifests must mark geometry invalid",
      );
    }
    if (root.delivery !== null) {
      errors.push(
        "availability-diagnostic manifests must not declare delivery",
      );
    }
  }
  if (errors.length > 0) {
    return { errors, publicEligibilityReasons: ["manifest contract is invalid"] };
  }

  const manifest = value as PrecinctGeometryManifest;
  return {
    errors,
    publicEligibilityReasons: publicEligibilityReasons(manifest),
  };
}

export function isPrecinctGeometryManifestPubliclyEligible(
  manifest: PrecinctGeometryManifest,
  validationTime = Date.now(),
) {
  const inspection = inspectPrecinctGeometryManifest(manifest, validationTime);
  return (
    inspection.errors.length === 0
    && inspection.publicEligibilityReasons.length === 0
  );
}

export function inspectPrecinctGeometryRegistry(
  value: unknown,
  validationTime = Date.now(),
): { errors: string[]; manifests: ManifestInspection[] } {
  const errors: string[] = [];
  const root = asRecord(value, "registry", errors);
  if (root.schemaVersion !== PRECINCT_GEOGRAPHY_SCHEMA_VERSION) {
    errors.push("registry.schemaVersion must equal 1");
  }
  const updatedAt = requiredString(root, "updatedAt", "registry", errors);
  validateIsoTimestamp(updatedAt, "registry.updatedAt", errors, validationTime);
  if (!Array.isArray(root.manifests)) {
    errors.push("registry.manifests must be an array");
    return { errors, manifests: [] };
  }

  const inspections = root.manifests.map((manifest, index) => {
    const inspection = inspectPrecinctGeometryManifest(manifest, validationTime);
    for (const error of inspection.errors) {
      errors.push("registry.manifests[" + index + "]: " + error);
    }
    return inspection;
  });

  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const [index, value] of root.manifests.entries()) {
    if (!isRecord(value)) {
      continue;
    }
    const id = String(value.id || "");
    if (ids.has(id)) {
      errors.push("registry.manifests[" + index + "] duplicates manifest id " + id);
    }
    ids.add(id);

    const election = isRecord(value.election) ? value.election : {};
    const geography = isRecord(value.geography) ? value.geography : {};
    const identity = [
      value.state,
      election.id,
      geography.level,
      geography.boundaryVintage,
    ].join("|");
    if (identities.has(identity)) {
      errors.push(
        "registry.manifests[" + index + "] duplicates geography identity " + identity,
      );
    }
    identities.add(identity);
  }

  return { errors, manifests: inspections };
}

export type PrecinctGeometryManifestFilters = {
  state?: string;
  electionId?: string;
  electionDate?: string;
  level?: string;
  includeBlocked?: boolean;
};

export type PrecinctGeometryManifestView = PrecinctGeometryManifest & {
  eligible: boolean;
  publicEligibilityReasons: string[];
};

export function listPrecinctGeometryManifestViews(
  value: unknown,
  filters: PrecinctGeometryManifestFilters = {},
  validationTime = Date.now(),
): PrecinctGeometryManifestView[] {
  const registryInspection = inspectPrecinctGeometryRegistry(value, validationTime);
  if (registryInspection.errors.length > 0) {
    throw new Error(
      "precinct geometry registry is invalid: "
      + registryInspection.errors.join("; "),
    );
  }

  const registry = value as PrecinctGeometryRegistry;
  const normalizedState = filters.state?.trim().toUpperCase();
  const normalizedElectionId = filters.electionId?.trim();
  const normalizedElectionDate = filters.electionDate?.trim();
  const normalizedLevel = filters.level?.trim().toLowerCase();

  return registry.manifests
    .filter((manifest) => !normalizedState || manifest.state === normalizedState)
    .filter(
      (manifest) =>
        !normalizedElectionId
        || manifest.election.id === normalizedElectionId,
    )
    .filter(
      (manifest) =>
        !normalizedElectionDate
        || manifest.election.date === normalizedElectionDate,
    )
    .filter(
      (manifest) =>
        !normalizedLevel
        || manifest.geography.level.toLowerCase() === normalizedLevel,
    )
    .map((manifest) => {
      const inspection = inspectPrecinctGeometryManifest(manifest, validationTime);
      return {
        ...manifest,
        eligible: inspection.publicEligibilityReasons.length === 0,
        publicEligibilityReasons: inspection.publicEligibilityReasons,
      };
    })
    .filter((manifest) => filters.includeBlocked || manifest.eligible)
    .sort(
      (left, right) =>
        left.state.localeCompare(right.state)
        || left.election.date.localeCompare(right.election.date)
        || left.geography.level.localeCompare(right.geography.level)
        || left.id.localeCompare(right.id),
    );
}

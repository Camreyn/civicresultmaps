import { createHash } from "node:crypto";
import type { PrecinctGeometryManifest } from "./precinct-geography";

const GUARDED_LOCAL_GEOGRAPHY_RELEASES = Object.freeze({
  AK: {
    geographyLevel: "precinct",
    releaseCandidatePattern: /^ak-precinct-gis-four-election-v\d+$/,
  },
  IA: {
    geographyLevel: "precinct",
    releaseCandidatePattern: /^ia-precinct-gis-three-election-v\d+$/,
  },
  ME: {
    geographyLevel: "local_reporting_unit",
    releaseCandidatePattern: /^me-local-reporting-gis-three-election-v\d+$/,
  },
  MN: {
    geographyLevel: "precinct",
    releaseCandidatePattern: /^mn-precinct-gis-four-election-v\d+$/,
  },
  NV: {
    geographyLevel: "precinct",
    releaseCandidatePattern: /^nv-precinct-gis-three-election-v\d+$/,
  },
  SC: {
    geographyLevel: "precinct",
    releaseCandidatePattern: /^sc-precinct-gis-three-election-v\d+$/,
    reviewedMatchMethods: Object.freeze([
      "exact_official_id",
      "official_crosswalk",
      "reviewed_name",
    ]),
  },
  TX: {
    geographyLevel: "precinct",
    releaseCandidatePattern: /^tx-precinct-gis-four-election-v\d+$/,
  },
  WI: {
    geographyLevel: "local_reporting_unit",
    releaseCandidatePattern: /^wi-local-reporting-gis-three-election-v\d+$/,
    reviewedMatchMethods: Object.freeze([
      "exact_official_id",
      "official_crosswalk",
      "reviewed_name",
      "spatial_review",
    ]),
  },
} satisfies Record<string, {
  geographyLevel: string;
  releaseCandidatePattern: RegExp;
  reviewedMatchMethods?: readonly string[];
}>);

const DEFAULT_REVIEWED_MATCH_METHODS = Object.freeze([
  "exact_official_id",
  "official_crosswalk",
]);

type GuardedLocalGeographyState = keyof typeof GUARDED_LOCAL_GEOGRAPHY_RELEASES;

function guardedReleaseContract(state: string) {
  const normalized = state.trim().toUpperCase();
  return Object.hasOwn(GUARDED_LOCAL_GEOGRAPHY_RELEASES, normalized)
    ? GUARDED_LOCAL_GEOGRAPHY_RELEASES[
        normalized as GuardedLocalGeographyState
      ]
    : null;
}

export function guardedLocalGeographyLevel(state: string) {
  return guardedReleaseContract(state)?.geographyLevel ?? null;
}

export function guardedLocalGeographyMatchMethods(state: string) {
  const contract = guardedReleaseContract(state);
  return contract && "reviewedMatchMethods" in contract
    ? contract.reviewedMatchMethods
    : DEFAULT_REVIEWED_MATCH_METHODS;
}

export function requiresPrecinctResultPublicationGate(input: {
  state: string;
  level: string;
}) {
  const contract = guardedReleaseContract(input.state);
  return contract !== null && input.level === contract.geographyLevel;
}

export function requiresPrecinctGeometryPublicationGate(
  manifest: Pick<PrecinctGeometryManifest, "state" | "geography">,
) {
  const contract = guardedReleaseContract(manifest.state);
  return contract !== null
    && manifest.geography.level === contract.geographyLevel;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [
        key,
        canonicalize((value as Record<string, unknown>)[key]),
      ]),
  );
}

function semanticJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return recordValue(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function precinctGeometryPublicManifestSha256(
  manifest: PrecinctGeometryManifest & Partial<{
    eligible: boolean;
    publicEligibilityReasons: string[];
  }>,
) {
  const document = { ...manifest } as Record<string, unknown>;
  delete document.eligible;
  delete document.publicEligibilityReasons;
  return sha256(JSON.stringify(document, null, 2) + "\n");
}

function credentialFreeHttpsOrigin(value: unknown) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
      && parsed.pathname === "/"
      && parsed.origin === value;
  } catch {
    return false;
  }
}

/**
 * Binds one eligible static guarded-state manifest to the exact publication audit
 * stored by the guarded database transaction. This is intentionally stricter
 * than checking geography_versions.status alone: a stale or foreign publish
 * cannot authorize a different set of static delivery bytes.
 */
export function matchesPrecinctGeometryPublicationMetadata(
  manifest: PrecinctGeometryManifest & Partial<{
    eligible: boolean;
    publicEligibilityReasons: string[];
  }>,
  metadataValue: unknown,
) {
  if (!requiresPrecinctGeometryPublicationGate(manifest)) return true;
  if (manifest.delivery?.format !== "parent_scoped_geojson") return false;

  const metadata = recordValue(metadataValue);
  const releaseCandidate = recordValue(metadata?.releaseCandidate);
  const activation = recordValue(metadata?.publicActivation);
  const crosswalkMetadata = recordValue(metadata?.crosswalk);
  if (!metadata || !releaseCandidate || !activation) return false;

  const expectedFeatureCount = manifest.delivery.featureCount;
  const expectedRelationshipCount = manifest.crosswalk.reviewedRelationshipRecords
    ?? expectedFeatureCount;
  const releaseSha256 = releaseCandidate.sha256;
  const changedAtUtc = activation.changedAtUtc;
  const releaseContract = guardedReleaseContract(manifest.state);
  return metadata.manifestId === manifest.id
    && metadata.publicDeliveryAuthorized === true
    && releaseCandidate.publicDeliveryAuthorized === true
    && typeof releaseCandidate.id === "string"
    && releaseContract !== null
    && releaseContract.releaseCandidatePattern.test(releaseCandidate.id)
    && typeof releaseSha256 === "string"
    && /^[a-f0-9]{64}$/.test(releaseSha256)
    && recordValue(metadata.normalization)?.featureCount === expectedFeatureCount
    && crosswalkMetadata?.reviewedRelationships
      === expectedRelationshipCount
    && (
      manifest.crosswalk.reviewedNoDataFeatures === undefined
      || crosswalkMetadata?.reviewedNoDataFeatures
        === manifest.crosswalk.reviewedNoDataFeatures
    )
    && typeof activation.activationId === "string"
    && activation.activationId.trim().length > 0
    && typeof activation.activationCandidateSha256 === "string"
    && /^[a-f0-9]{64}$/.test(activation.activationCandidateSha256)
    && activation.releasePackageSha256 === releaseSha256
    && typeof activation.blobPublicationSha256 === "string"
    && /^[a-f0-9]{64}$/.test(activation.blobPublicationSha256)
    && credentialFreeHttpsOrigin(activation.deliveryOrigin)
    && typeof activation.authorizationSha256 === "string"
    && /^[a-f0-9]{64}$/.test(activation.authorizationSha256)
    && activation.mode === "publish"
    && activation.year === manifest.election.year
    && activation.manifestId === manifest.id
    && activation.publicManifestSha256
      === precinctGeometryPublicManifestSha256(manifest)
    && semanticJson(activation.delivery) === semanticJson(manifest.delivery)
    && Object.hasOwn(activation, "previousCaveat")
    && (
      activation.previousCaveat === null
      || typeof activation.previousCaveat === "string"
    )
    && typeof changedAtUtc === "string"
    && !Number.isNaN(Date.parse(changedAtUtc))
    && Number.isInteger(Number(activation.revision))
    && Number(activation.revision) >= 1
    && !Object.hasOwn(activation, "rollback");
}

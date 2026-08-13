import { createHash } from "node:crypto";
import type { PrecinctGeometryManifest } from "./precinct-geography";

const PRECINCT_PUBLICATION_GATED_STATES = new Set(["IA", "MN", "NV", "TX"]);

export function requiresPrecinctResultPublicationGate(input: {
  state: string;
  level: string;
}) {
  return PRECINCT_PUBLICATION_GATED_STATES.has(input.state.toUpperCase())
    && input.level === "precinct";
}

export function requiresPrecinctGeometryPublicationGate(
  manifest: Pick<PrecinctGeometryManifest, "state" | "geography">,
) {
  return PRECINCT_PUBLICATION_GATED_STATES.has(manifest.state)
    && manifest.geography.level === "precinct";
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
  return metadata.manifestId === manifest.id
    && metadata.publicDeliveryAuthorized === true
    && releaseCandidate.publicDeliveryAuthorized === true
    && typeof releaseCandidate.id === "string"
    && new RegExp(
      "^" + manifest.state.toLowerCase() + "-precinct-gis-"
        + (["IA", "NV"].includes(manifest.state) ? "three" : "four")
        + "-election-v\\d+$",
    ).test(releaseCandidate.id)
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

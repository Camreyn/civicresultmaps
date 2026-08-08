import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLocalCloneDatabaseUrl } from "../db/database-driver.ts";
import {
  listPrecinctGeometryManifestViews,
  type PrecinctGeometryManifestFilters,
  type PrecinctGeometryManifestView,
} from "./precinct-geography.ts";
import {
  selectPrecinctDeliveryFeatures,
  type PrecinctDeliveryFeatureCollection,
} from "./precinct-map-delivery.ts";

const REHEARSAL_FLAG = "CRM_PRECINCT_REHEARSAL";
const ALLOWED_PUBLIC_ELIGIBILITY_REASONS = new Set([
  "validation status is not reviewed",
  "row-level rendering is not safe",
  "validation errors remain",
  "no immutable delivery artifact is declared",
]);

type MinnesotaPrecinctRehearsalCandidate = {
  byteCount: number;
  electionYear: number;
  featureCount: number;
  fileName: string;
  manifestId: string;
  sha256: string;
};

export const MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES = Object.freeze([
  {
    manifestId: "mn-2012-11-06-lcc-2012generalresults-v1",
    electionYear: 2012,
    fileName: "mn-2012-11-06-lcc-2012generalresults-v1.geojson",
    featureCount: 4_102,
    byteCount: 43_222_011,
    sha256: "f0f9727bd5b212c83d565bf343609d2bdd416a382be1975fd9fcaa525e737714",
  },
  {
    manifestId: "mn-2016-11-08-lcc-vtd2016general-v1",
    electionYear: 2016,
    fileName: "mn-2016-11-08-lcc-vtd2016general-v1.geojson",
    featureCount: 4_120,
    byteCount: 26_793_881,
    sha256: "ce27114ad1971cca472f635f0b2292c60be0c3104c44f49c794c7cfc5e74d207",
  },
  {
    manifestId: "mn-2020-11-03-lcc-preliminary-identity-geometry-v1",
    electionYear: 2020,
    fileName: "mn-2020-11-03-lcc-preliminary-identity-geometry-v1.geojson",
    featureCount: 4_110,
    byteCount: 25_998_261,
    sha256: "c06e1b9712c44c031262872faa70924dd9198928f0ae4274d2259787125e3e8c",
  },
  {
    manifestId: "mn-2024-11-05-lcc-vtd2024general-v1",
    electionYear: 2024,
    fileName: "mn-2024-11-05-lcc-vtd2024general-v1.geojson",
    featureCount: 4_103,
    byteCount: 27_550_483,
    sha256: "df94482464f9cd7065b2e6cf624eb6d19ab5717bb477ac57e798dd23066f9f06",
  },
] satisfies readonly MinnesotaPrecinctRehearsalCandidate[]);

const candidateByManifestId = new Map(
  MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES.map((candidate) => [
    candidate.manifestId,
    candidate,
  ]),
);

export type MinnesotaPrecinctRehearsalMarker = {
  active: true;
  mode: "local_only";
  publicEligible: false;
  notice: string;
  delivery: {
    format: "geojson";
    sha256: string;
    byteCount: number;
    featureCount: number;
  };
};

export type MinnesotaPrecinctRehearsalManifestView =
  PrecinctGeometryManifestView & {
    localRehearsal: MinnesotaPrecinctRehearsalMarker;
  };

export type MinnesotaPrecinctRehearsalLookup = {
  candidate: MinnesotaPrecinctRehearsalCandidate;
  manifest: MinnesotaPrecinctRehearsalManifestView;
};

export type MinnesotaPrecinctRehearsalStatus =
  | { enabled: false }
  | {
      enabled: true;
      database: "crm_clone_dev";
      state: "MN";
    };

export function resolveMinnesotaPrecinctRehearsal(): MinnesotaPrecinctRehearsalStatus {
  const requested = process.env[REHEARSAL_FLAG];
  if (requested === undefined || requested === "") {
    return { enabled: false };
  }
  if (requested !== "mn") {
    throw new Error(REHEARSAL_FLAG + " must equal 'mn' when set");
  }
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new Error("Minnesota precinct rehearsal requires NODE_ENV=development or test");
  }
  if (process.env.CRM_DATABASE_DRIVER !== "postgres") {
    throw new Error("Minnesota precinct rehearsal requires CRM_DATABASE_DRIVER=postgres");
  }
  if (process.env.CRM_DATABASE_STRICT !== "true") {
    throw new Error("Minnesota precinct rehearsal requires CRM_DATABASE_STRICT=true");
  }

  // This shared guard rejects non-loopback hosts, the wrong port, the read-only
  // snapshot, and every database other than the disposable crm_clone_dev copy.
  getLocalCloneDatabaseUrl();
  return { enabled: true, database: "crm_clone_dev", state: "MN" };
}

function assertRehearsalReadyManifest(
  manifest: PrecinctGeometryManifestView,
  candidate: MinnesotaPrecinctRehearsalCandidate,
) {
  const unexpectedReasons = manifest.publicEligibilityReasons.filter(
    (reason) => !ALLOWED_PUBLIC_ELIGIBILITY_REASONS.has(reason),
  );
  if (
    manifest.id !== candidate.manifestId
    || manifest.state !== "MN"
    || manifest.election.year !== candidate.electionYear
    || manifest.eligible
    || manifest.delivery !== null
    || manifest.validation.status !== "blocked"
    || !manifest.validation.geometryValid
    || manifest.validation.rowLevelRenderingSafe
    || !manifest.validation.parentTotalsReconciled
    || manifest.geography.vintageStatus !== "election_date_confirmed"
    || manifest.crosswalk.status !== "reviewed"
    || manifest.crosswalk.unmatchedResultUnits !== 0
    || manifest.crosswalk.relationships.unmatched !== 0
    || manifest.crosswalk.relationships.pendingReview !== 0
    || manifest.crosswalk.matchedResultUnits
      !== manifest.crosswalk.colorableResultUnits
    || manifest.crosswalk.matchedResultUnits !== candidate.featureCount
    || manifest.normalization.featureCount !== candidate.featureCount
    || unexpectedReasons.length > 0
    || manifest.publicEligibilityReasons.length
      !== ALLOWED_PUBLIC_ELIGIBILITY_REASONS.size
  ) {
    throw new Error(
      "Minnesota precinct rehearsal manifest no longer matches its reviewed blocked contract: "
      + manifest.id,
    );
  }
}

function rehearsalView(
  manifest: PrecinctGeometryManifestView,
  candidate: MinnesotaPrecinctRehearsalCandidate,
): MinnesotaPrecinctRehearsalManifestView {
  assertRehearsalReadyManifest(manifest, candidate);
  return {
    ...manifest,
    localRehearsal: {
      active: true,
      mode: "local_only",
      publicEligible: false,
      notice:
        "Local rehearsal only. The canonical manifest remains blocked, has no public delivery declaration, and is not published.",
      delivery: {
        format: "geojson",
        sha256: candidate.sha256,
        byteCount: candidate.byteCount,
        featureCount: candidate.featureCount,
      },
    },
  };
}

export function listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(
  registry: unknown,
  filters: PrecinctGeometryManifestFilters = {},
) {
  const status = resolveMinnesotaPrecinctRehearsal();
  if (!status.enabled) {
    return listPrecinctGeometryManifestViews(registry, filters);
  }

  const views = listPrecinctGeometryManifestViews(registry, {
    ...filters,
    includeBlocked: true,
  }).map((manifest) => {
    const candidate = candidateByManifestId.get(manifest.id);
    return candidate ? rehearsalView(manifest, candidate) : manifest;
  });

  return views.filter((manifest) =>
    filters.includeBlocked
    || manifest.eligible
    || "localRehearsal" in manifest
  );
}

export function findMinnesotaPrecinctRehearsalManifest(
  registry: unknown,
  manifestId: string,
): MinnesotaPrecinctRehearsalLookup | null {
  const candidate = candidateByManifestId.get(manifestId);
  if (!candidate || !resolveMinnesotaPrecinctRehearsal().enabled) {
    return null;
  }
  const manifest = listPrecinctGeometryManifestViews(registry, {
    includeBlocked: true,
    state: "MN",
  }).find((view) => view.id === manifestId);
  if (!manifest) {
    throw new Error("Minnesota precinct rehearsal manifest is missing: " + manifestId);
  }
  return { candidate, manifest: rehearsalView(manifest, candidate) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function candidatePath(fileName: string) {
  if (!/^[a-z0-9-]+\.geojson$/.test(fileName)) {
    throw new Error("Minnesota precinct rehearsal candidate filename is unsafe");
  }
  const candidateRoot = path.join(
    process.cwd(),
    ".etl",
    "precinct-delivery-candidates",
  );
  return path.join(candidateRoot, fileName);
}

function pinnedCandidateForLookup(lookup: MinnesotaPrecinctRehearsalLookup) {
  const expected = candidateByManifestId.get(lookup.manifest.id);
  if (!expected || expected !== lookup.candidate) {
    throw new Error("Minnesota precinct rehearsal lookup is not in the pinned catalog");
  }
  assertRehearsalReadyManifest(lookup.manifest, expected);
  return expected;
}

export function verifyMinnesotaPrecinctRehearsalCandidateBytes(
  lookup: MinnesotaPrecinctRehearsalLookup,
  bytes: Uint8Array,
) {
  if (!resolveMinnesotaPrecinctRehearsal().enabled) {
    throw new Error("Minnesota precinct rehearsal is disabled");
  }
  const expected = pinnedCandidateForLookup(lookup);
  if (bytes.byteLength !== expected.byteCount) {
    throw new Error("Minnesota precinct rehearsal candidate byte count does not match its pin");
  }
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  if (sourceSha256 !== expected.sha256) {
    throw new Error("Minnesota precinct rehearsal candidate SHA-256 does not match its pin");
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Minnesota precinct rehearsal candidate is not valid JSON");
  }
  if (
    !isRecord(value)
    || !Array.isArray(value.features)
    || value.features.length !== expected.featureCount
  ) {
    throw new Error("Minnesota precinct rehearsal candidate feature count drifted");
  }
  return { expected, sourceSha256, value };
}

export async function readMinnesotaPrecinctRehearsalDelivery(
  lookup: MinnesotaPrecinctRehearsalLookup,
  parentGeoid: string,
  options: { featureLimit?: number } = {},
): Promise<{
  collection: PrecinctDeliveryFeatureCollection;
  sourceByteCount: number;
  sourceSha256: string;
}> {
  if (!resolveMinnesotaPrecinctRehearsal().enabled) {
    throw new Error("Minnesota precinct rehearsal is disabled");
  }
  const expected = pinnedCandidateForLookup(lookup);
  const bytes = await readFile(candidatePath(expected.fileName));
  const verified = verifyMinnesotaPrecinctRehearsalCandidateBytes(
    lookup,
    bytes,
  );

  const collection = selectPrecinctDeliveryFeatures(
    verified.value,
    parentGeoid,
    options.featureLimit,
  );
  const expectedMetadata = {
    manifestId: lookup.manifest.id,
    state: lookup.manifest.state,
    electionId: lookup.manifest.election.id,
    boundaryVintage: lookup.manifest.geography.boundaryVintage,
    sourceAuthority: lookup.manifest.source.authority,
    sourceUrl: lookup.manifest.source.url,
    licenseOrTerms: lookup.manifest.source.licenseOrTerms,
  };
  for (const [key, expectedValue] of Object.entries(expectedMetadata)) {
    if (collection.metadata[key as keyof typeof expectedMetadata] !== expectedValue) {
      throw new Error("Minnesota precinct rehearsal delivery metadata " + key + " drifted");
    }
  }

  return {
    collection,
    sourceByteCount: bytes.byteLength,
    sourceSha256: verified.sourceSha256,
  };
}

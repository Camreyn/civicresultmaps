import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectReleaseArtifact } from "./tx-precinct-release-candidate.mjs";
import {
  inspectPrecinctGeometryManifest,
  inspectPrecinctGeometryRegistry,
} from "../../src/lib/precinct-geography.ts";

export const TEXAS_PUBLIC_ACTIVATION_ROOT =
  ".etl/precinct-public-activations/TX";
export const TEXAS_PUBLIC_ACTIVATION_YEARS = Object.freeze([
  2012,
  2016,
  2020,
  2024,
]);

const REGISTRY_PATH = "data/precinct-geometry-manifests.json";
const COVERAGE_PATHS = Object.freeze([
  [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
  [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
  [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
  [2024, "data/precinct-geometry-coverage-inventory.json"],
]);

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeTexasPublicActivationDocument(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function semanticallyEqual(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function readRepositoryJson(root, relativePath) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  if (!existsSync(absolutePath)) {
    throw new Error("Texas public activation target is missing: " + relativePath);
  }
  const bytes = readFileSync(absolutePath);
  return {
    path: relativePath,
    absolutePath,
    bytes,
    byteCount: bytes.length,
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function loadReleasePackage(options) {
  if (!/^[a-f0-9]{64}$/.test(options.packageSha256 ?? "")) {
    throw new Error("Texas public activation requires the exact package SHA-256");
  }
  const artifact = inspectReleaseArtifact(options.root, options.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/TX/"],
    sha256: options.packageSha256,
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "tx-precinct-gis-four-election-v1"
    || document?.state !== "TX"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.publicEligibilityChanged !== false
    || document?.totals?.elections !== 4
    || !Array.isArray(document?.years)
    || !semanticallyEqual(
      document.years.map((year) => Number(year.year)),
      TEXAS_PUBLIC_ACTIVATION_YEARS,
    )
    || Number.isNaN(Date.parse(document?.preparedFromLocalValidationAt))
  ) {
    throw new Error("Texas public-activation package contract is incompatible");
  }
  return {
    artifact,
    document,
    packageRoot: path.dirname(path.resolve(
      options.root,
      ...artifact.path.split("/"),
    )),
    identity: {
      id: document.id,
      path: options.packagePath,
      sha256: artifact.sha256,
    },
  };
}

function loadDraftManifests(root, loaded) {
  return loaded.document.years.map((year) => {
    const draft = inspectReleaseArtifact(
      loaded.packageRoot,
      year.draftManifest.path,
      {
        allowedRoots: ["draft-manifests/"],
        byteCount: year.draftManifest.byteCount,
        sha256: year.draftManifest.sha256,
      },
    );
    const manifest = JSON.parse(draft.bytes.toString("utf8"));
    const inspection = inspectPrecinctGeometryManifest(manifest);
    if (
      inspection.errors.length
      || inspection.publicEligibilityReasons.length
      || manifest.state !== "TX"
      || manifest.election?.year !== year.year
      || manifest.id !== year.manifestId
      || manifest.geography?.level !== "precinct"
      || manifest.delivery?.format !== "parent_scoped_geojson"
      || manifest.delivery?.url !== year.proposedPublicDelivery?.url
      || manifest.delivery?.sha256 !== year.proposedPublicDelivery?.sha256
      || manifest.delivery?.byteCount !== year.proposedPublicDelivery?.byteCount
      || manifest.delivery?.featureCount !== year.certifiedResults?.reportingUnits
      || manifest.delivery?.parentCount !== 254
    ) {
      throw new Error("Texas " + year.year + " draft manifest is not public-eligible");
    }
    const preimage = inspectReleaseArtifact(root, year.canonicalManifest.path, {
      allowedRoots: ["data/precinct-geometry/TX/"],
      byteCount: year.canonicalManifest.byteCount,
      sha256: year.canonicalManifest.sha256,
    });
    const preimageManifest = JSON.parse(preimage.bytes.toString("utf8"));
    if (
      preimageManifest.id !== manifest.id
      || preimageManifest.validation?.status !== "blocked"
      || preimageManifest.validation?.rowLevelRenderingSafe !== false
      || preimageManifest.delivery !== null
    ) {
      throw new Error("Texas " + year.year + " canonical source preimage is not blocked");
    }
    return {
      year: year.year,
      manifestId: manifest.id,
      preimage: {
        path: year.canonicalManifest.path,
        byteCount: preimage.byteCount,
        sha256: preimage.sha256,
      },
      draft: {
        path: path.posix.join(
          path.posix.dirname(loaded.identity.path),
          year.draftManifest.path,
        ),
        byteCount: draft.byteCount,
        sha256: draft.sha256,
        manifest,
      },
    };
  });
}

function updateRegistry(root, manifests, activatedAtUtc) {
  const current = readRepositoryJson(root, REGISTRY_PATH);
  if (
    current.value?.schemaVersion !== 1
    || !Array.isArray(current.value?.manifests)
  ) {
    throw new Error("Texas canonical manifest registry is invalid");
  }
  const existing = current.value.manifests.filter((row) => row?.state === "TX");
  const drafts = manifests.map((item) => item.draft.manifest);
  let disposition;
  let nextRows;
  if (existing.length === 0) {
    disposition = "activate";
    nextRows = [...current.value.manifests, ...drafts];
  } else if (
    existing.length === drafts.length
    && drafts.every((draft) => existing.some((row) => semanticallyEqual(row, draft)))
  ) {
    disposition = "verified_existing";
    nextRows = current.value.manifests;
  } else {
    throw new Error("Texas canonical registry is partially activated or drifted");
  }
  const value = {
    ...current.value,
    updatedAt: disposition === "activate"
      ? activatedAtUtc
      : current.value.updatedAt,
    manifests: nextRows,
  };
  const inspection = inspectPrecinctGeometryRegistry(
    value,
    Math.max(Date.now(), Date.parse(activatedAtUtc) + 1),
  );
  if (inspection.errors.length) {
    throw new Error(
      "Texas activated registry is invalid: " + inspection.errors.join("; "),
    );
  }
  const eligible = inspection.manifests.filter((item, index) =>
    value.manifests[index]?.state === "TX"
    && item.publicEligibilityReasons.length === 0);
  if (eligible.length !== 4) {
    throw new Error("Texas activated registry does not contain four eligible manifests");
  }
  return { current, value, disposition };
}

function recomputeCoverageSummary(value) {
  const states = value.states ?? [];
  const count = (field, choices) => Object.fromEntries(
    choices.map((choice) => [
      choice,
      states.filter((row) => (row[field] ?? "undecided") === choice).length,
    ]),
  );
  return {
    totalJurisdictions: states.length,
    programStatus: count("programStatus", ["not_started", "in_progress", "reviewed"]),
    disposition: count("disposition", [
      "undecided",
      "mapped",
      "partial",
      "official_geometry_unavailable",
      "blocked",
    ]),
    publicEligibleJurisdictions: states.filter((row) =>
      (row.geometry?.publicEligibleManifestCount ?? 0) > 0).length,
  };
}

function texasCoverageRow(manifest, activatedAtUtc) {
  return {
    state: "TX",
    stateName: "Texas",
    electionId: manifest.election.id,
    programStatus: "reviewed",
    wave: 6,
    disposition: "mapped",
    checkedAt: activatedAtUtc,
    sourceTiers: ["tier_1_official_export_database"],
    resultReportingGrains: ["precinct"],
    generalOfficialSourceLeads: [
      manifest.source.url,
      "https://data.capitol.texas.gov/",
      "https://www.sos.state.tx.us/elections/historical/index.shtml",
    ],
    geometry: {
      manifestIds: [manifest.id],
      officialSourceLeads: [manifest.source.url],
      retainedArtifacts: [
        manifest.source.artifact,
        manifest.normalization.artifact,
        manifest.crosswalk.artifact,
      ],
      levels: [manifest.geography.level],
      vintageStatuses: [manifest.geography.vintageStatus],
      featureCount: manifest.normalization.featureCount,
      publicEligibleManifestCount: 1,
    },
    crosswalk: {
      resultUnits: manifest.crosswalk.resultUnits,
      colorableResultUnits: manifest.crosswalk.colorableResultUnits,
      matchedResultUnits: manifest.crosswalk.matchedResultUnits,
      unmatchedResultUnits: manifest.crosswalk.unmatchedResultUnits,
      nonGeographicResultUnits: manifest.crosswalk.nonGeographicResultUnits,
      sourceAliasResultUnits: manifest.crosswalk.sourceAliasResultUnits,
    },
    blockers: [],
    nextAction:
      "Keep both guarded public APIs closed until the reviewed hidden load, immutable Blob publication, deployment-origin verification, and atomic database publication are complete.",
    notes: [
      "Texas Legislative Council VTDs are presented as VTD / precinct approximations; exact official IDs, not display names, govern joins.",
      "TLC VTD totals remain a distinct official local product and do not replace certified Texas Secretary of State county or statewide totals.",
    ],
  };
}

function updateCoverage(root, manifest, relativePath, activatedAtUtc) {
  const current = readRepositoryJson(root, relativePath);
  if (!Array.isArray(current.value?.states)) {
    throw new Error("Texas coverage inventory is invalid: " + relativePath);
  }
  const expectedRow = texasCoverageRow(manifest, activatedAtUtc);
  const existing = current.value.states.filter((row) => row?.state === "TX");
  let disposition;
  let states;
  if (existing.length === 0) {
    disposition = "activate";
    states = [...current.value.states, expectedRow];
  } else if (existing.length === 1 && semanticallyEqual(existing[0], expectedRow)) {
    disposition = "verified_existing";
    states = current.value.states;
  } else {
    throw new Error(relativePath + " contains a partial or drifted Texas row");
  }
  const value = {
    ...current.value,
    updatedAt: disposition === "activate"
      ? activatedAtUtc
      : current.value.updatedAt,
    states,
  };
  value.summary = recomputeCoverageSummary(value);
  return { current, value, disposition };
}

function outputFile(relativePath, built) {
  const bytes = serializeTexasPublicActivationDocument(built.value);
  return {
    path: relativePath,
    absolutePath: built.current.absolutePath,
    preimage: {
      byteCount: built.current.byteCount,
      sha256: built.current.sha256,
    },
    byteCount: bytes.length,
    sha256: sha256(bytes),
    disposition: built.disposition,
    bytes,
  };
}

export function inspectTexasPublicActivationPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = loadReleasePackage({ ...options, root });
  const manifests = loadDraftManifests(root, loaded);
  const activatedAtUtc = loaded.document.preparedFromLocalValidationAt;
  const outputs = [outputFile(
    REGISTRY_PATH,
    updateRegistry(root, manifests, activatedAtUtc),
  )];
  for (const [year, relativePath] of COVERAGE_PATHS) {
    const manifest = manifests.find((item) => item.year === year)?.draft.manifest;
    if (!manifest) throw new Error("Texas activation is missing year " + year);
    outputs.push(outputFile(
      relativePath,
      updateCoverage(root, manifest, relativePath, activatedAtUtc),
    ));
  }
  const plan = {
    schemaVersion: 1,
    id: "tx-precinct-public-activation-v1",
    state: "TX",
    decision: "DEPLOY_GUARDED_STATIC_MANIFESTS_DATABASE_REMAINS_BLOCKED",
    releaseCandidate: loaded.identity,
    activatedAtUtc,
    manifests: manifests.map((item) => ({
      year: item.year,
      manifestId: item.manifestId,
      canonicalSourcePreimage: item.preimage,
      draftManifest: {
        path: item.draft.path,
        byteCount: item.draft.byteCount,
        sha256: item.draft.sha256,
        publicManifestSha256: sha256(
          serializeTexasPublicActivationDocument(item.draft.manifest),
        ),
        delivery: item.draft.manifest.delivery,
      },
    })),
    trackedOutputs: outputs.map(({
      bytes: _bytes,
      absolutePath: _absolutePath,
      ...file
    }) => file),
    safety: {
      productionContacted: false,
      productionMutationPerformed: false,
      publicFileWritten: false,
      databasePublicationStatusChanged: false,
      publicEndpointsRemainDatabaseGated: true,
      gitPublicationPerformed: false,
    },
  };
  const bytes = serializeTexasPublicActivationDocument(plan);
  const digest = sha256(bytes);
  return {
    root,
    packageDocument: loaded.document,
    plan,
    bytes,
    sha256: digest,
    outputPath: path.posix.join(
      TEXAS_PUBLIC_ACTIVATION_ROOT,
      loaded.identity.sha256.slice(0, 12) + "-" + digest.slice(0, 12),
      "activation-candidate.json",
    ),
    outputs,
  };
}

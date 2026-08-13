import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectReleaseArtifact } from "./me-local-release-candidate.mjs";
import {
  inspectPrecinctGeometryManifest,
  inspectPrecinctGeometryRegistry,
} from "../../src/lib/precinct-geography.ts";

export const MAINE_PUBLIC_ACTIVATION_ROOT =
  ".etl/precinct-public-activations/ME";
export const MAINE_PUBLIC_ACTIVATION_YEARS = Object.freeze([
  2016,
  2020,
  2024,
]);

const REGISTRY_PATH = "data/precinct-geometry-manifests.json";
const COVERAGE_PATHS = Object.freeze([
  [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
  [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
  [2024, "data/precinct-geometry-coverage-inventory.json"],
]);

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeMainePublicActivationDocument(value) {
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
    throw new Error("Maine public activation target is missing: " + relativePath);
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
    throw new Error("Maine public activation requires the exact package SHA-256");
  }
  const artifact = inspectReleaseArtifact(options.root, options.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/ME/"],
    sha256: options.packageSha256,
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "me-local-reporting-gis-three-election-v1"
    || document?.state !== "ME"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.publicEligibilityChanged !== false
    || document?.totals?.elections !== 3
    || !Array.isArray(document?.years)
    || !semanticallyEqual(
      document.years.map((year) => Number(year.year)),
      MAINE_PUBLIC_ACTIVATION_YEARS,
    )
    || Number.isNaN(Date.parse(document?.preparedFromLocalValidationAt))
  ) {
    throw new Error("Maine public-activation package contract is incompatible");
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
      || manifest.state !== "ME"
      || manifest.election?.year !== year.year
      || manifest.id !== year.manifestId
      || manifest.geography?.level !== "local_reporting_unit"
      || manifest.delivery?.format !== "parent_scoped_geojson"
      || manifest.delivery?.url !== year.proposedPublicDelivery?.url
      || manifest.delivery?.sha256 !== year.proposedPublicDelivery?.sha256
      || manifest.delivery?.byteCount !== year.proposedPublicDelivery?.byteCount
      || manifest.delivery?.featureCount !== year.reviewedGeometry?.featureCount
      || manifest.delivery?.parentCount !== 16
    ) {
      throw new Error("Maine " + year.year + " draft manifest is not public-eligible");
    }
    const preimage = inspectReleaseArtifact(root, year.canonicalManifest.path, {
      allowedRoots: ["data/precinct-geometry/ME/"],
      byteCount: year.canonicalManifest.byteCount,
      sha256: year.canonicalManifest.sha256,
    });
    const preimageManifest = JSON.parse(preimage.bytes.toString("utf8"));
    if (
      preimageManifest.id !== manifest.id
      || preimageManifest.validation?.status !== "blocked"
      || preimageManifest.validation?.rowLevelRenderingSafe !== true
      || preimageManifest.delivery !== null
    ) {
      throw new Error("Maine " + year.year + " canonical source preimage is not blocked");
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
    throw new Error("Maine canonical manifest registry is invalid");
  }
  const existing = current.value.manifests.filter((row) => row?.state === "ME");
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
    throw new Error("Maine canonical registry is partially activated or drifted");
  }
  const value = {
    ...current.value,
    updatedAt: disposition === "activate" ? activatedAtUtc : current.value.updatedAt,
    manifests: nextRows,
  };
  const inspection = inspectPrecinctGeometryRegistry(
    value,
    Math.max(Date.now(), Date.parse(activatedAtUtc) + 1),
  );
  if (inspection.errors.length) {
    throw new Error(
      "Maine activated registry is invalid: " + inspection.errors.join("; "),
    );
  }
  const eligible = inspection.manifests.filter((item, index) =>
    value.manifests[index]?.state === "ME"
    && item.publicEligibilityReasons.length === 0);
  if (eligible.length !== 3) {
    throw new Error("Maine activated registry does not contain three eligible manifests");
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

function maineCoverageRow(manifest, activatedAtUtc) {
  return {
    state: "ME",
    stateName: "Maine",
    electionId: manifest.election.id,
    programStatus: "reviewed",
    wave: 8,
    disposition: "mapped",
    checkedAt: activatedAtUtc,
    sourceTiers: ["official_export", "official_service"].includes(
      manifest.geography.derivationMethod,
    )
      ? ["tier_1_official_export_database"]
      : ["tier_1_official_export_database", "tier_3_secondary_geometry"],
    resultReportingGrains: ["local_reporting_unit"],
    generalOfficialSourceLeads: [
      manifest.source.url,
      "https://sos.maine.gov/mainens/election-results-statistics",
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
      ["official_export", "official_service"].includes(
          manifest.geography.derivationMethod,
        )
        ? "An official Maine local-boundary source supplies the reviewed presentation geometry."
        : manifest.election.year === 2020
          ? "VEST election-specific geometry is explicitly attributed and used only with official Maine Secretary of State local result rows and retained CC BY 4.0 evidence."
          : "The New York Times election-specific official-boundary compilation and reviewed Maine GeoLibrary gap geometry are used only with official Maine Secretary of State result rows under retained terms.",
      manifest.election.year === 2016
        ? "The attributed election-specific geometry is joined to official Maine Secretary of State local results through the retained reviewed crosswalk."
        : "The attributed election-specific geometry is joined to official Maine Secretary of State local results through exact retained identities; election values are excluded from geometry delivery.",
      manifest.election.year === 2024
        ? "The 2024 geometry is distributed under the retained New York Times C-UDA 1.0 Non-Commercial terms; the public map and provenance must preserve attribution, non-commercial use, and downstream terms."
        : "Geometry redistribution terms and exact source provenance are retained with the release artifacts.",
      "The 2012 election remains separately blocked because five official result rows and eight votes are not mapped, election-date vintage is unconfirmed, and derivative redistribution permission remains unresolved.",
    ],
  };
}

function updateCoverage(root, manifest, relativePath, activatedAtUtc) {
  const current = readRepositoryJson(root, relativePath);
  if (!Array.isArray(current.value?.states)) {
    throw new Error("Maine coverage inventory is invalid: " + relativePath);
  }
  const existing = current.value.states.filter((row) => row?.state === "ME");
  let disposition;
  let states;
  if (existing.length === 0) {
    const expectedRow = maineCoverageRow(manifest, activatedAtUtc);
    disposition = "activate";
    states = [...current.value.states, expectedRow];
  } else if (existing.length === 1) {
    const row = existing[0];
    const currentEligible = Number(
      row.geometry?.publicEligibleManifestCount,
    );
    if (
      row.electionId !== manifest.election.id
      || row.programStatus !== "reviewed"
      || row.disposition !== "mapped"
      || !Array.isArray(row.geometry?.manifestIds)
      || row.geometry.manifestIds.length !== 1
      || row.geometry.manifestIds[0] !== manifest.id
      || row.geometry.featureCount !== manifest.normalization.featureCount
      || !semanticallyEqual(
        row.geometry.levels,
        [manifest.geography.level],
      )
      || ![0, 1].includes(currentEligible)
      || row.crosswalk?.resultUnits !== manifest.crosswalk.resultUnits
      || row.crosswalk?.matchedResultUnits
        !== manifest.crosswalk.matchedResultUnits
      || row.crosswalk?.unmatchedResultUnits
        !== manifest.crosswalk.unmatchedResultUnits
    ) {
      throw new Error(relativePath + " contains a drifted Maine row");
    }
    const expectedRow = {
      ...row,
      checkedAt: currentEligible === 1 ? row.checkedAt : activatedAtUtc,
      geometry: {
        ...row.geometry,
        publicEligibleManifestCount: 1,
      },
      blockers: [],
      nextAction:
        "Keep both guarded public APIs closed until the reviewed hidden load, immutable Blob publication, deployment-origin verification, and atomic database publication are complete.",
    };
    if (currentEligible === 1) {
      if (!semanticallyEqual(row, expectedRow)) {
        throw new Error(relativePath + " contains a partial Maine activation");
      }
      disposition = "verified_existing";
      states = current.value.states;
    } else {
      disposition = "activate";
      states = current.value.states.map((candidate) =>
        candidate?.state === "ME" ? expectedRow : candidate);
    }
  } else {
    throw new Error(relativePath + " contains a partial or drifted Maine row");
  }
  const value = {
    ...current.value,
    updatedAt: disposition === "activate" ? activatedAtUtc : current.value.updatedAt,
    states,
  };
  value.summary = recomputeCoverageSummary(value);
  return { current, value, disposition };
}

function outputFile(relativePath, built) {
  const bytes = serializeMainePublicActivationDocument(built.value);
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

export function inspectMainePublicActivationPlan(options = {}) {
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
    if (!manifest) throw new Error("Maine activation is missing year " + year);
    outputs.push(outputFile(
      relativePath,
      updateCoverage(root, manifest, relativePath, activatedAtUtc),
    ));
  }
  const plan = {
    schemaVersion: 1,
    id: "me-local-public-activation-three-election-v1",
    state: "ME",
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
          serializeMainePublicActivationDocument(item.draft.manifest),
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
  const bytes = serializeMainePublicActivationDocument(plan);
  const digest = sha256(bytes);
  return {
    root,
    packageDocument: loaded.document,
    plan,
    bytes,
    sha256: digest,
    outputPath: path.posix.join(
      MAINE_PUBLIC_ACTIVATION_ROOT,
      loaded.identity.sha256.slice(0, 12) + "-" + digest.slice(0, 12),
      "activation-candidate.json",
    ),
    outputs,
  };
}

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectReleaseArtifact } from "./nv-precinct-release-candidate.mjs";
import {
  inspectPrecinctGeometryManifest,
  inspectPrecinctGeometryRegistry,
} from "../../src/lib/precinct-geography.ts";

export const NEVADA_PUBLIC_ACTIVATION_ROOT =
  ".etl/precinct-public-activations/NV";
export const NEVADA_PUBLIC_ACTIVATION_YEARS = Object.freeze([
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

// Exact semantic preimages from the merged v1 activation and the reviewed v2
// correction lineage. A correction may replace only these rows (or the final
// v2 rows); an unknown, partial, or manually edited activation fails closed.
const REVIEWED_PUBLIC_MANIFEST_PREIMAGE_SHA256 = Object.freeze({
  2016: Object.freeze([
    "5c2b94bb395eb7703aa5e492eb85ea115fcdac4350c2011a86663480a1a36fce",
    "af78e7da6b6aca042c5aba4b33c72f585b418f42b9c5ba5a47731915de78b11a",
  ]),
  2020: Object.freeze([
    "78d97ec487fe2f782e0a80974e88ee892ed590da8b8e6120b4d180baaa5ac693",
    "ecc29faa9cebb13c163c64be5e95fd103dfbcaf884178aaf00f3f8c98b41ad7b",
  ]),
  2024: Object.freeze([
    "09a41995e90eff4daeeabc7232d27606926a044597b345cc08ed8eef01424db0",
    "e0f2ec89b3429efcb97edc0262393537450a2c962c6e06055e5db5334283c2db",
  ]),
});

const REVIEWED_COVERAGE_ROW_PREIMAGE_SHA256 = Object.freeze({
  2016: Object.freeze([
    "7b2e39f9b3d43c970bdc8a09e01a94759d4028c5c42e7d0c1450eb68ccf29b61",
    "18d2d8ec9c080e3a4947bceb1b00e83c91b324ba6dc984c8c2c7d304ca91adef",
  ]),
  2020: Object.freeze([
    "6ab709835dd93f7798335d51b42008aad9797a07aaac79ec5b68005310a139f3",
    "fe282e04bb5ce0ecb55a8a8a60dcee0c82220953cc35017988c0fb73ca7b7d30",
  ]),
  2024: Object.freeze([
    "c31c67ad8cd29e9da961d7164fe8fcc668ca1528e2409d378781e36ed9c66981",
    "f188f288c1983281b6aaa97eadcf8445a50e463c319c00294241942fd3861f85",
  ]),
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeNevadaPublicActivationDocument(value) {
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

function semanticSha256(value) {
  return sha256(Buffer.from(JSON.stringify(canonical(value)), "utf8"));
}

function readRepositoryJson(root, relativePath) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  if (!existsSync(absolutePath)) {
    throw new Error("Nevada public activation target is missing: " + relativePath);
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
    throw new Error("Nevada public activation requires the exact package SHA-256");
  }
  const artifact = inspectReleaseArtifact(options.root, options.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/NV/"],
    sha256: options.packageSha256,
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "nv-precinct-gis-three-election-v2"
    || document?.state !== "NV"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.publicEligibilityChanged !== false
    || document?.totals?.elections !== 3
    || !Array.isArray(document?.years)
    || !semanticallyEqual(
      document.years.map((year) => Number(year.year)),
      NEVADA_PUBLIC_ACTIVATION_YEARS,
    )
    || Number.isNaN(Date.parse(document?.preparedFromLocalValidationAt))
  ) {
    throw new Error("Nevada public-activation package contract is incompatible");
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
      || manifest.state !== "NV"
      || manifest.election?.year !== year.year
      || manifest.id !== year.manifestId
      || manifest.geography?.level !== "precinct"
      || manifest.delivery?.format !== "parent_scoped_geojson"
      || manifest.delivery?.url !== year.proposedPublicDelivery?.url
      || manifest.delivery?.sha256 !== year.proposedPublicDelivery?.sha256
      || manifest.delivery?.byteCount !== year.proposedPublicDelivery?.byteCount
      || manifest.delivery?.featureCount !== year.reviewedGeometry?.featureCount
      || manifest.delivery?.parentCount !== 17
    ) {
      throw new Error("Nevada " + year.year + " draft manifest is not public-eligible");
    }
    const preimage = inspectReleaseArtifact(root, year.canonicalManifest.path, {
      allowedRoots: ["data/precinct-geometry/NV/"],
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
      throw new Error("Nevada " + year.year + " canonical source preimage is not blocked");
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
    throw new Error("Nevada canonical manifest registry is invalid");
  }
  const existing = current.value.manifests.filter((row) => row?.state === "NV");
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
  } else if (
    existing.length === drafts.length
    && drafts.every((draft) => {
      const predecessor = existing.find((row) =>
        row?.election?.year === draft.election.year && row?.id === draft.id);
      return predecessor
        && (
          semanticallyEqual(predecessor, draft)
          || REVIEWED_PUBLIC_MANIFEST_PREIMAGE_SHA256[draft.election.year]
            ?.includes(semanticSha256(predecessor))
        );
    })
  ) {
    disposition = "upgrade_reviewed_preimage_to_v2";
    const byYear = new Map(drafts.map((draft) => [draft.election.year, draft]));
    nextRows = current.value.manifests.map((row) =>
      row?.state === "NV" ? byYear.get(row.election.year) : row);
  } else {
    throw new Error("Nevada canonical registry is partially activated or drifted");
  }
  const value = {
    ...current.value,
    updatedAt: disposition === "activate"
        || disposition === "upgrade_reviewed_preimage_to_v2"
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
      "Nevada activated registry is invalid: " + inspection.errors.join("; "),
    );
  }
  const eligible = inspection.manifests.filter((item, index) =>
    value.manifests[index]?.state === "NV"
    && item.publicEligibilityReasons.length === 0);
  if (eligible.length !== 3) {
    throw new Error("Nevada activated registry does not contain three eligible manifests");
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

function nevadaCoverageRow(manifest, activatedAtUtc) {
  return {
    state: "NV",
    stateName: "Nevada",
    electionId: manifest.election.id,
    programStatus: "reviewed",
    wave: 7,
    disposition: "mapped",
    checkedAt: activatedAtUtc,
    sourceTiers: manifest.geography.derivationMethod === "official_service"
      ? ["tier_1_official_export_database"]
      : ["tier_1_official_export_database", "tier_3_secondary_geometry"],
    resultReportingGrains: ["precinct"],
    generalOfficialSourceLeads: [
      manifest.source.url,
      "https://www.nvsos.gov/sos/elections/election-information/precinct-level-results",
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
      manifest.geography.derivationMethod === "official_service"
        ? "The official Nevada Legislative Counsel Bureau election-cycle precinct layer supplies the reviewed presentation geometry."
        : "VEST election-specific geometry is explicitly attributed and used only with the official Nevada Secretary of State precinct result export and retained license evidence.",
      manifest.election.year === 2024
        ? "Clark County's official Statement of Vote supplies exact totals for 58 mapped precincts whose candidate allocation remains suppressed; the map displays a distinct privacy-suppressed state and never infers a winner. Reviewed no-data polygons remain visible without invented result rows."
        : "Privacy-suppressed result cells remain unknown; no vote value is inferred. Reviewed no-data polygons remain visible without invented result rows.",
      "The 2012 election remains separately blocked pending the election-date Washoe County precinct archive tracked in GitHub issue #220.",
    ],
  };
}

function updateCoverage(root, manifest, relativePath, activatedAtUtc) {
  const current = readRepositoryJson(root, relativePath);
  if (!Array.isArray(current.value?.states)) {
    throw new Error("Nevada coverage inventory is invalid: " + relativePath);
  }
  const expectedRow = nevadaCoverageRow(manifest, activatedAtUtc);
  const existing = current.value.states.filter((row) => row?.state === "NV");
  let disposition;
  let states;
  if (existing.length === 0) {
    disposition = "activate";
    states = [...current.value.states, expectedRow];
  } else if (existing.length === 1 && semanticallyEqual(existing[0], expectedRow)) {
    disposition = "verified_existing";
    states = current.value.states;
  } else if (
    existing.length === 1
    && REVIEWED_COVERAGE_ROW_PREIMAGE_SHA256[manifest.election.year]
      ?.includes(semanticSha256(existing[0]))
  ) {
    disposition = "upgrade_reviewed_preimage_to_v2";
    states = current.value.states.map((row) =>
      row?.state === "NV" ? expectedRow : row);
  } else {
    throw new Error(relativePath + " contains a partial or drifted Nevada row");
  }
  const value = {
    ...current.value,
    updatedAt: disposition === "activate"
        || disposition === "upgrade_reviewed_preimage_to_v2"
      ? activatedAtUtc
      : current.value.updatedAt,
    states,
  };
  value.summary = recomputeCoverageSummary(value);
  return { current, value, disposition };
}

function outputFile(relativePath, built) {
  const bytes = serializeNevadaPublicActivationDocument(built.value);
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

export function inspectNevadaPublicActivationPlan(options = {}) {
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
    if (!manifest) throw new Error("Nevada activation is missing year " + year);
    outputs.push(outputFile(
      relativePath,
      updateCoverage(root, manifest, relativePath, activatedAtUtc),
    ));
  }
  const plan = {
    schemaVersion: 1,
    id: "nv-precinct-public-activation-three-election-v1",
    state: "NV",
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
          serializeNevadaPublicActivationDocument(item.draft.manifest),
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
  const bytes = serializeNevadaPublicActivationDocument(plan);
  const digest = sha256(bytes);
  return {
    root,
    packageDocument: loaded.document,
    plan,
    bytes,
    sha256: digest,
    outputPath: path.posix.join(
      NEVADA_PUBLIC_ACTIVATION_ROOT,
      loaded.identity.sha256.slice(0, 12) + "-" + digest.slice(0, 12),
      "activation-candidate.json",
    ),
    outputs,
  };
}

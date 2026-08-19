import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectReleaseArtifact } from "./pa-precinct-release-candidate.mjs";
import {
  inspectPrecinctGeometryManifest,
  inspectPrecinctGeometryRegistry,
} from "../../src/lib/precinct-geography.ts";

export const PENNSYLVANIA_PUBLIC_ACTIVATION_ROOT =
  ".etl/precinct-public-activations/PA";
export const PENNSYLVANIA_PUBLIC_ACTIVATION_YEARS = Object.freeze([
  2016,
  2020,
]);

const REGISTRY_PATH = "data/precinct-geometry-manifests.json";
const COVERAGE_PATHS = Object.freeze([
  [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
  [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
]);
const COVERAGE_FOLLOWUPS = Object.freeze({
  2020: Object.freeze({
    officialSourceLead:
      "https://www.pasda.psu.edu/uci/DataSummary.aspx?dataset=1994",
    retainedArtifacts: Object.freeze([
      "data/precinct-geometry/PA/2020-11-03-general/official-county-followups/union-county/source-evidence.json",
      "data/precinct-geometry/PA/2020-11-03-general/official-county-followups/union-county/normalized/pa-2020-union-county-precincts-candidate.geojson.gz",
      "data/precinct-geometry/PA/2020-11-03-general/official-county-followups/union-county/crosswalk/pa-2020-union-county-result-to-geometry-review.json",
    ]),
    geometry: Object.freeze({
      manifestId:
        "pa-2020-union-county-official-precinct-geometry-candidate-v1",
      manifestPath:
        "data/precinct-geometry/PA/2020-11-03-general/official-county-followups/union-county/manifest.json",
      featureCount: 27,
      matchedResultUnits: 27,
      vintageStatus: "election_date_confirmed",
      validationStatus: "blocked",
      delivery: null,
    }),
    crosswalk: Object.freeze({
      resultUnits: 27,
      matchedResultUnits: 27,
    }),
  }),
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializePennsylvaniaPublicActivationDocument(value) {
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
    throw new Error("Pennsylvania public activation target is missing: " + relativePath);
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
    throw new Error("Pennsylvania public activation requires the exact package SHA-256");
  }
  const artifact = inspectReleaseArtifact(options.root, options.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/PA/"],
    sha256: options.packageSha256,
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "pa-precinct-gis-two-election-v1"
    || document?.state !== "PA"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.publicEligibilityChanged !== false
    || document?.totals?.elections !== 2
    || !Array.isArray(document?.years)
    || !semanticallyEqual(
      document.years.map((year) => Number(year.year)),
      PENNSYLVANIA_PUBLIC_ACTIVATION_YEARS,
    )
    || Number.isNaN(Date.parse(document?.preparedFromLocalValidationAt))
  ) {
    throw new Error("Pennsylvania public-activation package contract is incompatible");
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
      || manifest.state !== "PA"
      || manifest.election?.year !== year.year
      || manifest.id !== year.manifestId
      || manifest.geography?.level !== "precinct"
      || manifest.delivery?.format !== "parent_scoped_geojson"
      || manifest.delivery?.url !== year.proposedPublicDelivery?.url
      || manifest.delivery?.sha256 !== year.proposedPublicDelivery?.sha256
      || manifest.delivery?.byteCount !== year.proposedPublicDelivery?.byteCount
      || manifest.delivery?.featureCount !== year.reviewedGeometry?.featureCount
      || manifest.delivery?.parentCount !== 67
    ) {
      throw new Error("Pennsylvania " + year.year + " draft manifest is not public-eligible");
    }
    const preimage = inspectReleaseArtifact(root, year.canonicalManifest.path, {
      allowedRoots: ["data/precinct-geometry/PA/"],
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
      throw new Error("Pennsylvania " + year.year + " canonical source preimage is not blocked");
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
    throw new Error("Pennsylvania canonical manifest registry is invalid");
  }
  const existing = current.value.manifests.filter((row) => row?.state === "PA");
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
    throw new Error("Pennsylvania canonical registry is partially activated or drifted");
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
      "Pennsylvania activated registry is invalid: " + inspection.errors.join("; "),
    );
  }
  const eligible = inspection.manifests.filter((item, index) =>
    value.manifests[index]?.state === "PA"
    && item.publicEligibilityReasons.length === 0);
  if (eligible.length !== 2) {
    throw new Error("Pennsylvania activated registry does not contain two eligible manifests");
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

function pennsylvaniaCoverageRow(manifest, activatedAtUtc) {
  const followup = COVERAGE_FOLLOWUPS[manifest.election.year];
  return {
    state: "PA",
    stateName: "Pennsylvania",
    electionId: manifest.election.id,
    programStatus: "reviewed",
    wave: 8,
    disposition: "partial",
    checkedAt: activatedAtUtc,
    sourceTiers: manifest.geography.derivationMethod === "official_export"
      ? ["tier_1_official_export_database"]
      : ["tier_1_official_export_database", "tier_2_public_secondary"],
    resultReportingGrains: ["precinct"],
    generalOfficialSourceLeads: [
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
      ...(followup ? [followup.officialSourceLead] : []),
    ],
    geometry: {
      manifestIds: [manifest.id, followup?.geometry.manifestId].filter(Boolean),
      officialSourceLeads: followup ? [followup.officialSourceLead] : [],
      secondarySourceLeads: [manifest.source.url],
      retainedArtifacts: [
        manifest.source.artifact,
        manifest.normalization.artifact,
        manifest.crosswalk.artifact,
        ...(followup?.retainedArtifacts ?? []),
      ],
      levels: [manifest.geography.level],
      vintageStatuses: [manifest.geography.vintageStatus],
      featureCount: manifest.normalization.featureCount,
      publicEligibleManifestCount: 1,
      ...(followup ? { candidateFollowup: followup.geometry } : {}),
    },
    crosswalk: {
      resultUnits: manifest.crosswalk.resultUnits,
      colorableResultUnits: manifest.crosswalk.colorableResultUnits,
      matchedResultUnits: manifest.crosswalk.matchedResultUnits,
      unmatchedResultUnits: manifest.crosswalk.unmatchedResultUnits,
      nonGeographicResultUnits: manifest.crosswalk.nonGeographicResultUnits,
      sourceAliasResultUnits: manifest.crosswalk.sourceAliasResultUnits,
      ...(followup ? { candidateFollowup: followup.crosswalk } : {}),
    },
    blockers: [],
    nextAction:
      "Keep both guarded public APIs closed until the reviewed hidden load, immutable Blob publication, deployment-origin verification, and atomic database publication are complete.",
    notes: [
      "Official Pennsylvania Department of State results supply every displayed value; retained secondary geometry contains no election values.",
      "Geographic precincts use reviewed election-specific relationships. Official source units without reviewed geometry remain excluded and are never assigned to polygons.",
      "The map is parent-scoped by Pennsylvania county GEOID; election values are excluded from geometry delivery.",
      "Each election retains its own boundary vintage. Cross-election precinct comparison requires a separately reviewed common-geography crosswalk and is not inferred by this release.",
    ],
  };
}

function updateCoverage(root, manifest, relativePath, activatedAtUtc) {
  const current = readRepositoryJson(root, relativePath);
  if (!Array.isArray(current.value?.states)) {
    throw new Error("Pennsylvania coverage inventory is invalid: " + relativePath);
  }
  const existing = current.value.states.filter((row) => row?.state === "PA");
  let disposition;
  let states;
  if (existing.length === 0) {
    const expectedRow = pennsylvaniaCoverageRow(manifest, activatedAtUtc);
    disposition = "activate";
    states = [...current.value.states, expectedRow];
  } else if (existing.length === 1) {
    const row = existing[0];
    const currentEligible = Number(
      row.geometry?.publicEligibleManifestCount,
    );
    const expectedFollowup = COVERAGE_FOLLOWUPS[manifest.election.year];
    const expectedManifestIds = [
      manifest.id,
      expectedFollowup?.geometry.manifestId,
    ].filter(Boolean);
    const expectedRetainedArtifacts = [
      manifest.source.artifact,
      manifest.normalization.artifact,
      manifest.crosswalk.artifact,
      ...(expectedFollowup?.retainedArtifacts ?? []),
    ];
    if (
      row.electionId !== manifest.election.id
      || row.programStatus !== "reviewed"
      || row.disposition !== "partial"
      || !semanticallyEqual(row.geometry?.manifestIds, expectedManifestIds)
      || !semanticallyEqual(
        row.geometry?.candidateFollowup,
        expectedFollowup?.geometry,
      )
      || !semanticallyEqual(
        row.crosswalk?.candidateFollowup,
        expectedFollowup?.crosswalk,
      )
      || !semanticallyEqual(
        row.geometry?.retainedArtifacts,
        expectedRetainedArtifacts,
      )
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
      throw new Error(relativePath + " contains a drifted Pennsylvania row");
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
      if (!Array.isArray(row.blockers) || row.blockers.length !== 0) {
        throw new Error(relativePath + " contains a partial Pennsylvania activation");
      }
      disposition = "verified_existing";
      states = current.value.states;
    } else {
      disposition = "activate";
      states = current.value.states.map((candidate) =>
        candidate?.state === "PA" ? expectedRow : candidate);
    }
  } else {
    throw new Error(relativePath + " contains a partial or drifted Pennsylvania row");
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
  const bytes = serializePennsylvaniaPublicActivationDocument(built.value);
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

export function inspectPennsylvaniaPublicActivationPlan(options = {}) {
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
    if (!manifest) throw new Error("Pennsylvania activation is missing year " + year);
    outputs.push(outputFile(
      relativePath,
      updateCoverage(root, manifest, relativePath, activatedAtUtc),
    ));
  }
  const plan = {
    schemaVersion: 1,
    id: "pa-precinct-public-activation-two-election-v1",
    state: "PA",
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
          serializePennsylvaniaPublicActivationDocument(item.draft.manifest),
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
  const bytes = serializePennsylvaniaPublicActivationDocument(plan);
  const digest = sha256(bytes);
  return {
    root,
    packageDocument: loaded.document,
    plan,
    bytes,
    sha256: digest,
    outputPath: path.posix.join(
      PENNSYLVANIA_PUBLIC_ACTIVATION_ROOT,
      loaded.identity.sha256.slice(0, 12) + "-" + digest.slice(0, 12),
      "activation-candidate.json",
    ),
    outputs,
  };
}

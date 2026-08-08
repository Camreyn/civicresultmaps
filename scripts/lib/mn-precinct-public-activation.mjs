import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  inspectReleaseArtifact,
} from "./mn-precinct-release-candidate.mjs";
import {
  inspectMinnesotaPrecinctBlobPublicationPlan,
} from "./mn-precinct-blob-publication.mjs";
import {
  inspectPrecinctGeometryManifest,
  inspectPrecinctGeometryRegistry,
} from "../../src/lib/precinct-geography.ts";

export const MINNESOTA_PUBLIC_ACTIVATION_ROOT =
  ".etl/precinct-public-activations/MN";
export const MINNESOTA_PUBLIC_ACTIVATION_YEARS = Object.freeze([
  2012,
  2016,
  2020,
  2024,
]);
export const MINNESOTA_PUBLIC_ACTIVATION_SCOPES = Object.freeze([
  "activate_mn_canonical_geometry_manifests",
  "mark_mn_geography_versions_published",
  "deploy_mn_precinct_public_maps",
]);
export const MINNESOTA_PUBLIC_ROLLBACK_SCOPES = Object.freeze([
  "restore_previous_mn_precinct_application_deployment",
  "mark_mn_geography_versions_blocked",
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

export function serializeMinnesotaPublicActivationDocument(value) {
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

function safeEvidence(root, relativePath, allowedRoot, expectedSha256) {
  if (
    typeof relativePath !== "string"
    || path.isAbsolute(relativePath)
    || relativePath.includes("\\")
    || relativePath.split("/").includes("..")
    || !relativePath.startsWith(allowedRoot + "/")
    || !relativePath.endsWith(".json")
    || !/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")
  ) {
    throw new Error("Minnesota public-activation evidence path is unsafe");
  }
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolutePath.startsWith(allowed + path.sep) || !existsSync(absolutePath)) {
    throw new Error("Minnesota public-activation evidence is missing");
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (digest !== expectedSha256) {
    throw new Error("Minnesota public-activation evidence SHA-256 drifted");
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Minnesota public-activation evidence is not valid JSON");
  }
  return { path: relativePath, absolutePath, bytes, sha256: digest, value };
}

function readRepositoryJson(root, relativePath) {
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
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

function releasePackage(options) {
  if (!/^[a-f0-9]{64}$/.test(options.packageSha256 ?? "")) {
    throw new Error("Minnesota public activation requires the exact package SHA-256");
  }
  const artifact = inspectReleaseArtifact(options.root, options.packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/MN/"],
    sha256: options.packageSha256,
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "mn-precinct-gis-four-election-v1"
    || document?.state !== "MN"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.safety?.canonicalManifestChanged !== false
    || document?.safety?.publicEligibilityChanged !== false
    || document?.totals?.elections !== 4
    || !Array.isArray(document?.years)
    || document.years.length !== 4
    || !semanticallyEqual(
      document.years.map((year) => year.year),
      MINNESOTA_PUBLIC_ACTIVATION_YEARS,
    )
  ) {
    throw new Error("Minnesota public-activation package contract is incompatible");
  }
  return {
    artifact,
    document,
    root: path.dirname(path.resolve(
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

function draftManifests(root, loaded) {
  return loaded.document.years.map((year) => {
    const draft = inspectReleaseArtifact(
      loaded.root,
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
      || manifest.state !== "MN"
      || manifest.election?.year !== year.year
      || manifest.id !== year.manifestId
      || manifest.delivery?.url !== year.proposedPublicDelivery?.url
      || manifest.delivery?.sha256 !== year.proposedPublicDelivery?.sha256
      || manifest.delivery?.byteCount !== year.proposedPublicDelivery?.byteCount
      || manifest.delivery?.featureCount !== year.certifiedResults?.reportingUnits
    ) {
      throw new Error("Minnesota " + year.year + " draft manifest is not public-eligible");
    }
    const preimage = inspectReleaseArtifact(root, year.canonicalManifest.path, {
      allowedRoots: ["data/precinct-geometry/MN/"],
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
      throw new Error("Minnesota " + year.year + " canonical preimage is not blocked");
    }
    return {
      year: year.year,
      electionId: year.electionId,
      manifestId: manifest.id,
      preimage: {
        path: year.canonicalManifest.path,
        byteCount: preimage.byteCount,
        sha256: preimage.sha256,
        manifest: preimageManifest,
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

export function validateMinnesotaHiddenLoadReceipt(value, context) {
  const expectedTotals = context.packageDocument.totals;
  if (
    value?.schemaVersion !== 1
    || value?.state !== "MN"
    || value?.releaseCandidate?.id !== context.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || typeof value?.committedAtUtc !== "string"
    || Number.isNaN(Date.parse(value.committedAtUtc))
    || Date.parse(value.committedAtUtc) > context.now
    || !/^[a-f0-9]{64}$/.test(value?.endpointFingerprint ?? "")
    || typeof value?.preflight?.databaseName !== "string"
    || !value.preflight.databaseName
    || value?.productionMutationPerformed !== true
    || value?.publicFileWritten !== false
    || value?.canonicalManifestChanged !== false
    || value?.publicDeliveryAuthorized !== false
    || value?.transaction?.canonicalManifestChanged !== false
    || value?.transaction?.publicFileWritten !== false
    || value?.transaction?.publicDeliveryAuthorized !== false
  ) {
    throw new Error("Minnesota hidden-load receipt is incomplete or incompatible");
  }
  for (const key of [
    "reportingUnits",
    "candidateResultRows",
    "geometryFeatures",
    "reviewedExactCrosswalks",
    "zeroVoteUnits",
  ]) {
    if (value.transaction?.totals?.[key] !== expectedTotals[key]) {
      throw new Error("Minnesota hidden-load receipt total drifted: " + key);
    }
  }
  if (
    value.transaction?.validation?.years?.length !== 4
    || !semanticallyEqual(
      value.transaction.validation.years.map((year) => Number(year.year)),
      MINNESOTA_PUBLIC_ACTIVATION_YEARS,
    )
  ) {
    throw new Error("Minnesota hidden-load receipt year validation is incomplete");
  }
  return {
    committedAtUtc: value.committedAtUtc,
    databaseName: value.preflight.databaseName,
    endpointFingerprint: value.endpointFingerprint,
    authorizationId: value.authorization?.authorizationId ?? null,
    totals: value.transaction.totals,
  };
}

function credentialFreeHttpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Minnesota Blob evidence delivery origin is invalid");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
  ) {
    throw new Error("Minnesota Blob evidence origin must be credential-free HTTPS");
  }
  return url.origin;
}

export function validateMinnesotaBlobPublicationEvidence(value, plan, now = Date.now()) {
  const origin = credentialFreeHttpsOrigin(value?.deliveryOrigin);
  if (
    value?.schemaVersion !== 1
    || value?.state !== "MN"
    || value?.purpose !== "mn-precinct-parent-scoped-immutable-geometry-publication"
    || value?.releaseCandidate?.id !== plan.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== plan.releaseCandidate.sha256
    || typeof value?.publishedAtUtc !== "string"
    || Number.isNaN(Date.parse(value.publishedAtUtc))
    || Date.parse(value.publishedAtUtc) > now
    || value?.assetCount !== 352
    || value?.canonicalManifestChanged !== false
    || value?.publicEligibilityChanged !== false
    || !Array.isArray(value?.artifacts)
    || value.artifacts.length !== 352
  ) {
    throw new Error("Minnesota Blob publication evidence is incomplete or incompatible");
  }
  const expected = new Map(plan.artifacts.map((artifact) => [artifact.pathname, artifact]));
  const seen = new Set();
  for (const artifact of value.artifacts) {
    const wanted = expected.get(artifact?.pathname);
    let remote;
    try {
      remote = new URL(artifact?.url);
    } catch {
      throw new Error("Minnesota Blob publication evidence contains an invalid URL");
    }
    if (
      !wanted
      || seen.has(artifact.pathname)
      || artifact.kind !== wanted.kind
      || artifact.year !== wanted.year
      || artifact.packageRelativePath !== wanted.packageRelativePath
      || artifact.publicUrl !== wanted.publicUrl
      || artifact.byteCount !== wanted.byteCount
      || artifact.sha256 !== wanted.sha256
      || remote.origin !== origin
      || remote.pathname !== "/" + wanted.pathname
      || !["created", "verified_existing"].includes(artifact.disposition)
    ) {
      throw new Error("Minnesota Blob publication artifact set drifted");
    }
    seen.add(artifact.pathname);
  }
  if (seen.size !== expected.size) {
    throw new Error("Minnesota Blob publication artifact set is incomplete");
  }
  return {
    publishedAtUtc: value.publishedAtUtc,
    deliveryOrigin: origin,
    authorizationId: value.authorizationId ?? null,
    assetCount: seen.size,
  };
}

function candidateSharedPreimage(loaded, relativePath) {
  const artifact = loaded.document.scopedFileInventory?.sharedReviewFiles
    ?.find((item) => item.path === relativePath);
  if (!artifact) {
    throw new Error("Minnesota release package does not pin " + relativePath);
  }
  return artifact;
}

function updatedRegistry(root, loaded, manifests, activatedAtUtc) {
  const current = readRepositoryJson(root, REGISTRY_PATH);
  const expected = candidateSharedPreimage(loaded, REGISTRY_PATH);
  const draftById = new Map(manifests.map((item) => [item.manifestId, item.draft.manifest]));
  const preimageById = new Map(manifests.map((item) => [item.manifestId, item.preimage.manifest]));
  const currentRows = current.value?.manifests;
  if (!Array.isArray(currentRows)) {
    throw new Error("Minnesota canonical manifest registry is invalid");
  }
  let preimageRows = 0;
  let activatedRows = 0;
  const nextRows = currentRows.map((row) => {
    if (row?.state !== "MN" || !draftById.has(row.id)) return row;
    const preimage = preimageById.get(row.id);
    const draft = draftById.get(row.id);
    if (semanticallyEqual(row, preimage)) preimageRows += 1;
    else if (semanticallyEqual(row, draft)) activatedRows += 1;
    else throw new Error("Minnesota canonical registry preimage drifted for " + row.id);
    return draft;
  });
  if (preimageRows + activatedRows !== 4 || (preimageRows && activatedRows)) {
    throw new Error("Minnesota canonical registry is incomplete or partially activated");
  }
  if (preimageRows && (current.sha256 !== expected.sha256 || current.byteCount !== expected.byteCount)) {
    throw new Error("Minnesota canonical registry no longer matches the sealed preimage");
  }
  const value = {
    ...current.value,
    updatedAt: activatedAtUtc,
    manifests: nextRows,
  };
  const inspection = inspectPrecinctGeometryRegistry(value, Date.parse(activatedAtUtc) + 1);
  if (inspection.errors.length) {
    throw new Error("Minnesota activated registry is invalid: " + inspection.errors.join("; "));
  }
  const eligibleMinnesota = inspection.manifests.filter((_, index) =>
    value.manifests[index]?.state === "MN"
    && inspection.manifests[index].publicEligibilityReasons.length === 0);
  if (eligibleMinnesota.length !== 4) {
    throw new Error("Minnesota activated registry does not contain four eligible manifests");
  }
  return {
    current,
    value,
    sealedPreimage: {
      byteCount: expected.byteCount,
      sha256: expected.sha256,
    },
    disposition: activatedRows === 4 ? "verified_existing" : "activate",
  };
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

function updatedCoverage(root, loaded, year, relativePath, activatedAtUtc) {
  const current = readRepositoryJson(root, relativePath);
  const expected = candidateSharedPreimage(loaded, relativePath);
  const index = current.value?.states?.findIndex((row) => row.state === "MN");
  if (index < 0) throw new Error(relativePath + " has no Minnesota row");
  const row = current.value.states[index];
  const alreadyActivated = row.disposition === "mapped"
    && row.geometry?.publicEligibleManifestCount === 1
    && Array.isArray(row.blockers)
    && row.blockers.length === 0;
  if (!alreadyActivated) {
    if (
      current.sha256 !== expected.sha256
      || current.byteCount !== expected.byteCount
      || row.electionId !== loaded.document.years.find((item) => item.year === year)?.electionId
      || row.disposition !== "blocked"
      || row.geometry?.publicEligibleManifestCount !== 0
    ) {
      throw new Error(relativePath + " no longer matches its sealed blocked preimage");
    }
  }
  const nextRow = {
    ...row,
    disposition: "mapped",
    checkedAt: activatedAtUtc,
    geometry: {
      ...row.geometry,
      publicEligibleManifestCount: 1,
    },
    blockers: [],
    nextAction:
      "Verify the protected deployment and post-cutover APIs against the exact hidden-load and immutable-delivery receipts.",
  };
  const states = [...current.value.states];
  states[index] = nextRow;
  const value = {
    ...current.value,
    updatedAt: activatedAtUtc,
    states,
  };
  value.summary = recomputeCoverageSummary(value);
  return {
    current,
    value,
    sealedPreimage: {
      byteCount: expected.byteCount,
      sha256: expected.sha256,
    },
    disposition: alreadyActivated ? "verified_existing" : "activate",
  };
}

function outputFile(relativePath, built) {
  const bytes = serializeMinnesotaPublicActivationDocument(built.value);
  return {
    path: relativePath,
    absolutePath: built.current.absolutePath,
    preimage: {
      byteCount: built.sealedPreimage.byteCount,
      sha256: built.sealedPreimage.sha256,
    },
    byteCount: bytes.length,
    sha256: sha256(bytes),
    disposition: built.disposition,
    bytes,
  };
}

export function inspectMinnesotaPublicActivationPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const loaded = releasePackage({ ...options, root });
  if (
    !/^[a-f0-9]{64}$/.test(options.productionReceiptSha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(options.blobEvidenceSha256 ?? "")
  ) {
    throw new Error(
      "Minnesota public activation requires exact hidden-load and Blob evidence SHA-256 values",
    );
  }
  const manifests = draftManifests(root, loaded);
  const hiddenReceipt = safeEvidence(
    root,
    options.productionReceiptPath,
    ".etl/production-release-receipts/MN",
    options.productionReceiptSha256,
  );
  const hidden = validateMinnesotaHiddenLoadReceipt(hiddenReceipt.value, {
    now: options.now ?? Date.now(),
    packageDocument: loaded.document,
    releaseCandidate: loaded.identity,
  });
  const blobEvidence = safeEvidence(
    root,
    options.blobEvidencePath,
    ".etl/precinct-blob-publications/MN",
    options.blobEvidenceSha256,
  );
  const blobPlan = inspectMinnesotaPrecinctBlobPublicationPlan({
    root,
    packagePath: loaded.identity.path,
    packageSha256: loaded.identity.sha256,
  });
  const blob = validateMinnesotaBlobPublicationEvidence(
    blobEvidence.value,
    blobPlan,
    options.now ?? Date.now(),
  );
  const activatedAtUtc = new Date(Math.max(
    Date.parse(hidden.committedAtUtc),
    Date.parse(blob.publishedAtUtc),
  )).toISOString();
  const registry = updatedRegistry(root, loaded, manifests, activatedAtUtc);
  const outputs = [outputFile(REGISTRY_PATH, registry)];
  for (const [year, relativePath] of COVERAGE_PATHS) {
    outputs.push(outputFile(
      relativePath,
      updatedCoverage(root, loaded, year, relativePath, activatedAtUtc),
    ));
  }
  const document = {
    schemaVersion: 1,
    id: "mn-precinct-public-activation-v1",
    state: "MN",
    decision: "PROTECTED_PREVIEW_REQUIRED",
    releaseCandidate: loaded.identity,
    productionHiddenLoad: {
      path: hiddenReceipt.path,
      sha256: hiddenReceipt.sha256,
      ...hidden,
    },
    blobPublication: {
      path: blobEvidence.path,
      sha256: blobEvidence.sha256,
      ...blob,
    },
    activatedAtUtc,
    manifests: manifests.map((item) => ({
      year: item.year,
      electionId: item.electionId,
      manifestId: item.manifestId,
      canonicalPreimage: {
        path: item.preimage.path,
        byteCount: item.preimage.byteCount,
        sha256: item.preimage.sha256,
      },
      draftManifest: {
        path: item.draft.path,
        byteCount: item.draft.byteCount,
        sha256: item.draft.sha256,
        delivery: item.draft.manifest.delivery,
      },
    })),
    trackedOutputs: outputs.map(({
      bytes: _bytes,
      absolutePath: _absolute,
      disposition: _currentDisposition,
      ...file
    }) => ({ ...file, disposition: "activate" })),
    safety: {
      productionContacted: false,
      productionMutationPerformed: false,
      publicFileWritten: false,
      databasePublicationStatusChanged: false,
      deploymentPromoted: false,
      gitPublicationPerformed: false,
    },
  };
  const bytes = serializeMinnesotaPublicActivationDocument(document);
  const digest = sha256(bytes);
  return {
    root,
    packageDocument: loaded.document,
    plan: document,
    bytes,
    sha256: digest,
    outputPath: path.posix.join(
      MINNESOTA_PUBLIC_ACTIVATION_ROOT,
      loaded.identity.sha256.slice(0, 12) + "-" + digest.slice(0, 12),
      "activation-candidate.json",
    ),
    outputs,
  };
}

export function buildMinnesotaPublicActivationAuthorizationTemplate(plan, activationSha256) {
  return {
    schemaVersion: 1,
    state: "MN",
    decision: "NO_GO_PUBLIC",
    activationId: null,
    authorizedAtUtc: null,
    expiresAtUtc: null,
    releaseCandidate: plan.releaseCandidate,
    activationCandidate: {
      id: plan.id,
      sha256: activationSha256,
    },
    scopes: [...MINNESOTA_PUBLIC_ACTIVATION_SCOPES],
    people: {
      authorizedBy: null,
      operator: null,
      verifier: null,
      rollbackOwner: null,
    },
    deploymentWindow: {
      startsAtUtc: null,
      endsAtUtc: null,
      rollbackDecisionAtUtc: null,
    },
    protectedPreview: {
      deploymentId: null,
      url: null,
      gitSha: null,
      gitTreeSha: null,
      protectionVerified: false,
      verifiedAtUtc: null,
      verified: false,
      deliveryOrigin: plan.blobPublication.deliveryOrigin,
      trackedOutputs: plan.trackedOutputs.map((output) => ({
        path: output.path,
        sha256: output.sha256,
      })),
    },
    productionDeployment: {
      deploymentId: null,
      url: null,
      gitSha: null,
      gitTreeSha: null,
      readyVerified: false,
      promotedVerified: false,
      verifiedAtUtc: null,
      deliveryOrigin: plan.blobPublication.deliveryOrigin,
      trackedOutputs: plan.trackedOutputs.map((output) => ({
        path: output.path,
        sha256: output.sha256,
      })),
      blockedResultGateVerified: false,
      blockedGeometryGateVerified: false,
    },
    rollbackTarget: {
      deploymentId: null,
      url: null,
      gitSha: null,
      gitTreeSha: null,
      verifiedAtUtc: null,
      gateCapableVerified: false,
      blockedStaticManifestsVerified: false,
      blockedResultGateVerified: false,
      blockedGeometryGateVerified: false,
    },
    evidence: {
      productionHiddenLoad: {
        path: plan.productionHiddenLoad.path,
        sha256: plan.productionHiddenLoad.sha256,
      },
      blobPublication: {
        path: plan.blobPublication.path,
        sha256: plan.blobPublication.sha256,
      },
    },
  };
}

function requiredPerson(value, field) {
  const person = value?.people?.[field];
  if (typeof person !== "string" || !person.trim()) {
    throw new Error("Minnesota public activation requires named " + field);
  }
  return person.trim();
}

export function validateMinnesotaPublicActivationAuthorization(
  value,
  context,
) {
  const now = context.now ?? Date.now();
  const authorizedAt = Date.parse(value?.authorizedAtUtc);
  const expiresAt = Date.parse(value?.expiresAtUtc);
  const startsAt = Date.parse(value?.deploymentWindow?.startsAtUtc);
  const endsAt = Date.parse(value?.deploymentWindow?.endsAtUtc);
  const rollbackAt = Date.parse(value?.deploymentWindow?.rollbackDecisionAtUtc);
  const previewAt = Date.parse(value?.protectedPreview?.verifiedAtUtc);
  const productionAt = Date.parse(
    value?.productionDeployment?.verifiedAtUtc,
  );
  const rollbackTargetAt = Date.parse(value?.rollbackTarget?.verifiedAtUtc);
  const recovery = context.recovery === true;
  let previewUrl = null;
  let productionUrl = null;
  let rollbackTargetUrl = null;
  try {
    previewUrl = new URL(value?.protectedPreview?.url);
  } catch {
    // The shared compatibility check below reports one fail-closed error.
  }
  try {
    productionUrl = new URL(value?.productionDeployment?.url);
  } catch {
    // The shared compatibility check below reports one fail-closed error.
  }
  try {
    rollbackTargetUrl = new URL(value?.rollbackTarget?.url);
  } catch {
    // The shared compatibility check below reports one fail-closed error.
  }
  if (
    value?.schemaVersion !== 1
    || value?.state !== "MN"
    || value?.decision !== "GO_PUBLIC"
    || typeof value?.activationId !== "string"
    || !value.activationId.trim()
    || value?.releaseCandidate?.id !== context.plan.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== context.plan.releaseCandidate.sha256
    || value?.activationCandidate?.id !== context.plan.id
    || value?.activationCandidate?.sha256 !== context.activationSha256
    || !semanticallyEqual(value?.scopes, MINNESOTA_PUBLIC_ACTIVATION_SCOPES)
    || [
      authorizedAt,
      expiresAt,
      startsAt,
      endsAt,
      rollbackAt,
      previewAt,
      productionAt,
      rollbackTargetAt,
    ]
      .some((time) => Number.isNaN(time))
    || expiresAt <= authorizedAt
    || startsAt > endsAt
    || rollbackAt < startsAt
    || rollbackAt > endsAt
    || value?.protectedPreview?.verified !== true
    || value?.protectedPreview?.protectionVerified !== true
    || typeof value?.protectedPreview?.deploymentId !== "string"
    || !value.protectedPreview.deploymentId.trim()
    || !/^[a-f0-9]{40}$/.test(value?.protectedPreview?.gitSha ?? "")
    || !/^[a-f0-9]{40}$/.test(value?.protectedPreview?.gitTreeSha ?? "")
    || value?.protectedPreview?.deliveryOrigin
      !== context.plan.blobPublication.deliveryOrigin
    || !semanticallyEqual(
      value?.protectedPreview?.trackedOutputs,
      context.plan.trackedOutputs.map((output) => ({
        path: output.path,
        sha256: output.sha256,
      })),
    )
    || previewUrl?.protocol !== "https:"
    || previewUrl?.username
    || previewUrl?.password
    || previewUrl?.search
    || previewUrl?.hash
    || previewAt > authorizedAt
    || value?.productionDeployment?.readyVerified !== true
    || value?.productionDeployment?.promotedVerified !== true
    || value?.productionDeployment?.blockedResultGateVerified !== true
    || value?.productionDeployment?.blockedGeometryGateVerified !== true
    || typeof value?.productionDeployment?.deploymentId !== "string"
    || !value.productionDeployment.deploymentId.trim()
    || !/^[a-f0-9]{40}$/.test(value?.productionDeployment?.gitSha ?? "")
    || !/^[a-f0-9]{40}$/.test(value?.productionDeployment?.gitTreeSha ?? "")
    || value.productionDeployment.gitTreeSha
      !== value.protectedPreview.gitTreeSha
    || value?.productionDeployment?.deliveryOrigin
      !== context.plan.blobPublication.deliveryOrigin
    || !semanticallyEqual(
      value?.productionDeployment?.trackedOutputs,
      context.plan.trackedOutputs.map((output) => ({
        path: output.path,
        sha256: output.sha256,
      })),
    )
    || productionUrl?.protocol !== "https:"
    || productionUrl?.username
    || productionUrl?.password
    || productionUrl?.search
    || productionUrl?.hash
    || productionAt < previewAt
    || productionAt > authorizedAt
    || value?.rollbackTarget?.gateCapableVerified !== true
    || value?.rollbackTarget?.blockedStaticManifestsVerified !== true
    || value?.rollbackTarget?.blockedResultGateVerified !== true
    || value?.rollbackTarget?.blockedGeometryGateVerified !== true
    || typeof value?.rollbackTarget?.deploymentId !== "string"
    || !value.rollbackTarget.deploymentId.trim()
    || value.rollbackTarget.deploymentId
      === value.productionDeployment.deploymentId
    || !/^[a-f0-9]{40}$/.test(value?.rollbackTarget?.gitSha ?? "")
    || !/^[a-f0-9]{40}$/.test(value?.rollbackTarget?.gitTreeSha ?? "")
    || value.rollbackTarget.gitTreeSha
      === value.productionDeployment.gitTreeSha
    || rollbackTargetUrl?.protocol !== "https:"
    || rollbackTargetUrl?.username
    || rollbackTargetUrl?.password
    || rollbackTargetUrl?.search
    || rollbackTargetUrl?.hash
    || rollbackTargetAt > authorizedAt
    || (!recovery && (
      authorizedAt > now
      || now > expiresAt
      || startsAt > now
      || now > endsAt
      || previewAt > now
      || now - previewAt > 4 * 60 * 60 * 1000
      || productionAt > now
      || now - productionAt > 4 * 60 * 60 * 1000
      || rollbackTargetAt > now
      || now - rollbackTargetAt > 4 * 60 * 60 * 1000
    ))
    || value?.evidence?.productionHiddenLoad?.sha256
      !== context.plan.productionHiddenLoad.sha256
    || value?.evidence?.productionHiddenLoad?.path
      !== context.plan.productionHiddenLoad.path
    || value?.evidence?.blobPublication?.sha256
      !== context.plan.blobPublication.sha256
    || value?.evidence?.blobPublication?.path
      !== context.plan.blobPublication.path
  ) {
    throw new Error("Minnesota public activation authorization is absent, expired, or incompatible");
  }
  const people = {
    authorizedBy: requiredPerson(value, "authorizedBy"),
    operator: requiredPerson(value, "operator"),
    verifier: requiredPerson(value, "verifier"),
    rollbackOwner: requiredPerson(value, "rollbackOwner"),
  };
  if (
    people.operator.toLocaleLowerCase() === people.verifier.toLocaleLowerCase()
    || new Set(Object.values(people).map((person) => person.toLocaleLowerCase())).size < 2
  ) {
    throw new Error("Minnesota public activation requires two independent people");
  }
  return {
    activationId: value.activationId.trim(),
    people,
    deploymentWindow: value.deploymentWindow,
    protectedPreview: value.protectedPreview,
    productionDeployment: value.productionDeployment,
    rollbackTarget: value.rollbackTarget,
  };
}

export function buildMinnesotaPublicRollbackAuthorizationTemplate(
  plan,
  activationSha256,
  publicationReceipt,
) {
  return {
    schemaVersion: 1,
    state: "MN",
    decision: "NO_GO_ROLLBACK",
    rollbackId: null,
    authorizedAtUtc: null,
    expiresAtUtc: null,
    releaseCandidate: plan.releaseCandidate,
    activationCandidate: {
      id: plan.id,
      sha256: activationSha256,
    },
    publication: {
      activationId: publicationReceipt.activationId,
      revision: publicationReceipt.revision,
      changedAtUtc: publicationReceipt.changedAtUtc,
    },
    scopes: [...MINNESOTA_PUBLIC_ROLLBACK_SCOPES],
    people: {
      authorizedBy: null,
      operator: null,
      verifier: null,
      rollbackOwner: null,
    },
    rollbackWindow: {
      startsAtUtc: null,
      endsAtUtc: null,
    },
    applicationRollback: {
      target: publicationReceipt.rollbackTarget,
      databaseBlockFirstAcknowledged: false,
      restoreAfterDatabaseRollbackAcknowledged: false,
    },
    evidence: {
      publicationReceipt: {
        path: publicationReceipt.path,
        sha256: publicationReceipt.sha256,
      },
    },
  };
}

export function validateMinnesotaPublicRollbackAuthorization(value, context) {
  const now = context.now ?? Date.now();
  const authorizedAt = Date.parse(value?.authorizedAtUtc);
  const expiresAt = Date.parse(value?.expiresAtUtc);
  const startsAt = Date.parse(value?.rollbackWindow?.startsAtUtc);
  const endsAt = Date.parse(value?.rollbackWindow?.endsAtUtc);
  const receipt = context.publicationReceipt;
  const recovery = context.recovery === true;
  if (
    value?.schemaVersion !== 1
    || value?.state !== "MN"
    || value?.decision !== "GO_ROLLBACK"
    || typeof value?.rollbackId !== "string"
    || !value.rollbackId.trim()
    || value?.releaseCandidate?.id !== context.plan.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== context.plan.releaseCandidate.sha256
    || value?.activationCandidate?.id !== context.plan.id
    || value?.activationCandidate?.sha256 !== context.activationSha256
    || value?.publication?.activationId !== receipt.activationId
    || Number(value?.publication?.revision) !== receipt.revision
    || value?.publication?.changedAtUtc !== receipt.changedAtUtc
    || !semanticallyEqual(value?.scopes, MINNESOTA_PUBLIC_ROLLBACK_SCOPES)
    || [authorizedAt, expiresAt, startsAt, endsAt]
      .some((time) => Number.isNaN(time))
    || expiresAt <= authorizedAt
    || startsAt > endsAt
    || (!recovery && (
      authorizedAt > now
      || now > expiresAt
      || startsAt > now
      || now > endsAt
    ))
    || !semanticallyEqual(
      value?.applicationRollback?.target,
      receipt.rollbackTarget,
    )
    || value?.applicationRollback?.databaseBlockFirstAcknowledged !== true
    || value?.applicationRollback?.restoreAfterDatabaseRollbackAcknowledged
      !== true
    || value?.evidence?.publicationReceipt?.path !== receipt.path
    || value?.evidence?.publicationReceipt?.sha256 !== receipt.sha256
  ) {
    throw new Error("Minnesota rollback authorization is absent, expired, or incompatible");
  }
  const people = {
    authorizedBy: requiredPerson(value, "authorizedBy"),
    operator: requiredPerson(value, "operator"),
    verifier: requiredPerson(value, "verifier"),
    rollbackOwner: requiredPerson(value, "rollbackOwner"),
  };
  if (
    people.operator.toLocaleLowerCase() === people.verifier.toLocaleLowerCase()
    || new Set(Object.values(people).map((person) => person.toLocaleLowerCase())).size < 2
  ) {
    throw new Error("Minnesota rollback requires two independent people");
  }
  return {
    activationId: value.rollbackId.trim(),
    rollbackId: value.rollbackId.trim(),
    publicationActivationId: receipt.activationId,
    people,
    rollbackWindow: value.rollbackWindow,
    applicationRollback: value.applicationRollback,
  };
}

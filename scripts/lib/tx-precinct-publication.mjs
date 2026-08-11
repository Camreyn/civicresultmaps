import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectTexasPrecinctBlobPublicationPlan } from "./tx-precinct-blob-publication.mjs";
import { inspectReleaseArtifact } from "./tx-precinct-release-candidate.mjs";
import {
  inspectPrecinctGeometryManifest,
  inspectPrecinctGeometryRegistry,
} from "../../src/lib/precinct-geography.ts";

export const TEXAS_PUBLICATION_YEARS = Object.freeze([2012, 2016, 2020, 2024]);
export const TEXAS_PUBLICATION_SCOPES = Object.freeze([
  "publish_tx_geography_versions",
  "authorize_tx_precinct_results",
  "increment_public_data_revision",
]);

const EXPECTED_TOTALS = Object.freeze({
  reportingUnits: 36_762,
  candidateResultRows: 110_286,
  geometryFeatures: 36_762,
  reviewedExactCrosswalks: 36_762,
  zeroVoteUnits: 1_280,
  sourceDocuments: 8,
  importRuns: 4,
});

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function serializeTexasPublicationDocument(value) {
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

export function semanticallyEqual(left, right) {
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
    throw new Error("Texas publication evidence path is unsafe");
  }
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  const allowed = path.resolve(root, ...allowedRoot.split("/"));
  if (!absolutePath.startsWith(allowed + path.sep) || !existsSync(absolutePath)) {
    throw new Error("Texas publication evidence is missing");
  }
  const bytes = readFileSync(absolutePath);
  const digest = sha256(bytes);
  if (digest !== expectedSha256) {
    throw new Error("Texas publication evidence SHA-256 drifted");
  }
  return {
    path: relativePath,
    absolutePath,
    bytes,
    sha256: digest,
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function credentialFreeHttpsOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Texas publication delivery origin is invalid");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== "/"
    || parsed.origin !== value
  ) {
    throw new Error("Texas publication origin must be credential-free HTTPS");
  }
  return parsed.origin;
}

function loadPackage(root, packagePath, packageSha256) {
  if (!/^[a-f0-9]{64}$/.test(packageSha256 ?? "")) {
    throw new Error("Texas publication requires the exact package SHA-256");
  }
  const artifact = inspectReleaseArtifact(root, packagePath, {
    allowedRoots: [".etl/precinct-release-candidates/TX/"],
    sha256: packageSha256,
  });
  const document = JSON.parse(artifact.bytes.toString("utf8"));
  if (
    document?.schemaVersion !== 1
    || document?.id !== "tx-precinct-gis-four-election-v1"
    || document?.state !== "TX"
    || document?.decision !== "NO_GO_PRODUCTION"
    || document?.totals?.reportingUnits !== EXPECTED_TOTALS.reportingUnits
    || document?.totals?.candidateResultRows !== EXPECTED_TOTALS.candidateResultRows
    || document?.totals?.geometryFeatures !== EXPECTED_TOTALS.geometryFeatures
    || document?.totals?.reviewedExactCrosswalks
      !== EXPECTED_TOTALS.reviewedExactCrosswalks
    || document?.totals?.zeroVoteUnits !== EXPECTED_TOTALS.zeroVoteUnits
    || !Array.isArray(document?.years)
    || !semanticallyEqual(
      document.years.map((year) => Number(year.year)),
      TEXAS_PUBLICATION_YEARS,
    )
  ) {
    throw new Error("Texas publication release package is incompatible");
  }
  return {
    artifact,
    document,
    root: path.dirname(path.resolve(root, ...artifact.path.split("/"))),
    identity: { id: document.id, path: packagePath, sha256: artifact.sha256 },
  };
}

function publicManifests(root, loaded) {
  const registryPath = "data/precinct-geometry-manifests.json";
  const registryBytes = readFileSync(path.resolve(root, registryPath));
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const inspection = inspectPrecinctGeometryRegistry(registry);
  if (inspection.errors.length) {
    throw new Error("Texas publication registry is invalid: " + inspection.errors.join("; "));
  }
  const rows = registry.manifests.filter((manifest) => manifest?.state === "TX");
  if (rows.length !== 4) {
    throw new Error("Texas publication registry does not contain four manifests");
  }
  return loaded.document.years.map((year) => {
    const draftArtifact = inspectReleaseArtifact(loaded.root, year.draftManifest.path, {
      allowedRoots: ["draft-manifests/"],
      byteCount: year.draftManifest.byteCount,
      sha256: year.draftManifest.sha256,
    });
    const draft = JSON.parse(draftArtifact.bytes.toString("utf8"));
    const manifest = rows.find((row) => row.id === year.manifestId);
    const manifestInspection = inspectPrecinctGeometryManifest(manifest);
    if (
      !manifest
      || !semanticallyEqual(manifest, draft)
      || manifestInspection.errors.length
      || manifestInspection.publicEligibilityReasons.length
      || manifest.election?.year !== year.year
      || manifest.delivery?.format !== "parent_scoped_geojson"
      || manifest.delivery?.featureCount !== year.certifiedResults.reportingUnits
      || manifest.delivery?.parentCount !== 254
    ) {
      throw new Error("Texas " + year.year + " public manifest drifted from the package");
    }
    return {
      year: year.year,
      electionId: year.electionId,
      manifestId: manifest.id,
      publicManifestSha256: sha256(serializeTexasPublicationDocument(manifest)),
      delivery: manifest.delivery,
      boundaryVintage: manifest.geography.boundaryVintage,
      blockedManifestSha256: year.canonicalManifest.sha256,
      featureCount: manifest.delivery.featureCount,
      zeroVoteUnits: year.certifiedResults.zeroVoteUnits,
      resultRows: year.certifiedResults.candidateResultRows,
      manifest,
    };
  }).map((item, _index, all) => {
    if (new Set(all.map((row) => row.manifestId)).size !== 4) {
      throw new Error("Texas publication manifest IDs are duplicated");
    }
    return item;
  });
}

function validAuditArtifact(value) {
  return typeof value?.path === "string"
    && value.path.startsWith(".etl/")
    && !value.path.includes("\\")
    && !value.path.split("/").includes("..")
    && /^[a-f0-9]{64}$/.test(value?.sha256 ?? "");
}

export function validateTexasHiddenLoadReceipt(value, context) {
  const audit = value?.transaction?.productionReleaseAudit;
  const validation = value?.validation;
  if (
    value?.schemaVersion !== 1
    || value?.state !== "TX"
    || value?.decision !== "COMMITTED_HIDDEN_NOT_PUBLIC"
    || value?.releaseCandidate?.id !== context.releaseCandidate.id
    || value?.releaseCandidate?.path !== context.releaseCandidate.path
    || value?.releaseCandidate?.sha256 !== context.releaseCandidate.sha256
    || typeof value?.committedAtUtc !== "string"
    || Number.isNaN(Date.parse(value.committedAtUtc))
    || Date.parse(value.committedAtUtc) > context.now
    || !/^[a-f0-9]{64}$/.test(value?.endpointFingerprint ?? "")
    || value?.productionMutationPerformed !== true
    || value?.canonicalManifestChanged !== false
    || value?.publicFileWritten !== false
    || value?.publicDeliveryAuthorized !== false
    || value?.transaction?.productionMutationPerformed !== true
    || value?.transaction?.publicDeliveryAuthorized !== false
    || validation?.productionMutationPerformed !== true
    || validation?.publicDeliveryAuthorized !== false
    || value?.transaction?.revision !== validation?.revision
    || !Number.isInteger(Number(value?.transaction?.revision))
    || Number(value.transaction.revision) < 1
    || value?.committedAtUtc !== audit?.transaction?.executedAtUtc
    || value?.transaction?.revision !== audit?.transaction?.publicRevision
    || value?.authorization?.id !== audit?.authorizationId
    || value?.authorization?.path !== audit?.authorization?.path
    || value?.authorization?.sha256 !== audit?.authorization?.sha256
    || value?.preflight?.path !== audit?.preflight?.path
    || value?.preflight?.sha256 !== audit?.preflight?.sha256
    || value?.backup?.manifestSha256 !== audit?.backupManifest?.sha256
    || value?.backup?.dumpSha256 !== audit?.backupManifest?.dumpSha256
    || value?.endpointFingerprint !== audit?.endpointFingerprint
    || audit?.releasePackage?.path !== context.releaseCandidate.path
    || audit?.releasePackage?.sha256 !== context.releaseCandidate.sha256
    || ![
      audit?.releasePackage,
      audit?.authorization,
      audit?.preflight,
    ].every(validAuditArtifact)
    || !/^[a-f0-9]{64}$/.test(audit?.backupManifest?.sha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(audit?.backupManifest?.dumpSha256 ?? "")
    || !semanticallyEqual(validation?.productionReleaseAudit, audit)
    || !semanticallyEqual(validation?.releaseCandidate, {
      id: context.releaseCandidate.id,
      sha256: context.releaseCandidate.sha256,
      publicDeliveryAuthorized: false,
    })
    || validation?.database?.name !== value?.transaction?.database?.name
    || typeof validation?.database?.name !== "string"
    || !validation.database.name
    || !Array.isArray(validation?.years)
    || validation.years.length !== 4
    || !semanticallyEqual(
      validation.years.map((year) => Number(year.year)),
      TEXAS_PUBLICATION_YEARS,
    )
  ) {
    throw new Error("Texas hidden-load receipt is incomplete or incompatible");
  }
  const totals = {
    reportingUnits: validation.years.reduce((sum, year) => sum + year.reportingUnits, 0),
    candidateResultRows: validation.years.reduce((sum, year) => sum + year.resultRows, 0),
    geometryFeatures: validation.years.reduce((sum, year) => sum + year.features, 0),
    reviewedExactCrosswalks: validation.years.reduce(
      (sum, year) => sum + year.exactCrosswalks,
      0,
    ),
    zeroVoteUnits: validation.years.reduce((sum, year) => sum + year.zeroVoteUnits, 0),
  };
  for (const [key, expected] of Object.entries(EXPECTED_TOTALS)) {
    if (key === "sourceDocuments" || key === "importRuns") continue;
    if (Number(totals[key]) !== expected) {
      throw new Error("Texas hidden-load receipt total drifted: " + key);
    }
  }
  return {
    committedAtUtc: value.committedAtUtc,
    databaseName: validation.database.name,
    endpointFingerprint: value.endpointFingerprint,
    hiddenRevision: value.transaction.revision,
    productionReleaseAudit: audit,
    totals,
  };
}

export function validateTexasBlobPublicationEvidence(value, blobPlan, now = Date.now()) {
  const origin = credentialFreeHttpsOrigin(value?.deliveryOrigin);
  if (
    value?.schemaVersion !== 1
    || value?.state !== "TX"
    || value?.purpose !== "tx-precinct-parent-scoped-immutable-geometry-publication"
    || value?.releaseCandidate?.id !== blobPlan.releaseCandidate.id
    || value?.releaseCandidate?.path !== blobPlan.releaseCandidate.path
    || value?.releaseCandidate?.sha256 !== blobPlan.releaseCandidate.sha256
    || typeof value?.publishedAtUtc !== "string"
    || Number.isNaN(Date.parse(value.publishedAtUtc))
    || Date.parse(value.publishedAtUtc) > now
    || value?.assetCount !== 1020
    || value?.canonicalManifestChanged !== false
    || value?.publicEligibilityChanged !== false
    || !Array.isArray(value?.artifacts)
    || value.artifacts.length !== 1020
  ) {
    throw new Error("Texas Blob publication evidence is incomplete or incompatible");
  }
  const expected = new Map(blobPlan.artifacts.map((artifact) => [artifact.pathname, artifact]));
  const seen = new Set();
  for (const artifact of value.artifacts) {
    const wanted = expected.get(artifact?.pathname);
    let remote;
    try {
      remote = new URL(artifact?.url);
    } catch {
      throw new Error("Texas Blob publication evidence contains an invalid URL");
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
      throw new Error("Texas Blob publication artifact set drifted");
    }
    seen.add(artifact.pathname);
  }
  if (seen.size !== expected.size) {
    throw new Error("Texas Blob publication artifact set is incomplete");
  }
  return {
    publishedAtUtc: value.publishedAtUtc,
    deliveryOrigin: origin,
    authorizationId: value.authorizationId ?? null,
    assetCount: seen.size,
  };
}

export function inspectTexasPublicationPlan(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const now = options.now ?? Date.now();
  const loaded = loadPackage(root, options.packagePath, options.packageSha256);
  const manifests = publicManifests(root, loaded);
  const hiddenArtifact = safeEvidence(
    root,
    options.hiddenReceiptPath,
    ".etl/production-release-receipts/TX",
    options.hiddenReceiptSha256,
  );
  const hidden = validateTexasHiddenLoadReceipt(hiddenArtifact.value, {
    now,
    releaseCandidate: loaded.identity,
  });
  const blobArtifact = safeEvidence(
    root,
    options.blobEvidencePath,
    ".etl/precinct-blob-publications/TX",
    options.blobEvidenceSha256,
  );
  const blobPlan = inspectTexasPrecinctBlobPublicationPlan({
    root,
    packagePath: loaded.identity.path,
    packageSha256: loaded.identity.sha256,
  });
  const blob = validateTexasBlobPublicationEvidence(blobArtifact.value, blobPlan, now);
  const registryBytes = readFileSync(path.resolve(root, "data/precinct-geometry-manifests.json"));
  const plan = {
    schemaVersion: 1,
    id: "tx-precinct-database-publication-v1",
    state: "TX",
    decision: "GO_AUTHORIZATION_AND_VERIFIED_DEPLOYMENT_REQUIRED",
    releaseCandidate: loaded.identity,
    hiddenLoad: {
      path: hiddenArtifact.path,
      sha256: hiddenArtifact.sha256,
      ...hidden,
    },
    blobPublication: {
      path: blobArtifact.path,
      sha256: blobArtifact.sha256,
      ...blob,
    },
    staticRegistry: {
      path: "data/precinct-geometry-manifests.json",
      byteCount: registryBytes.length,
      sha256: sha256(registryBytes),
    },
    manifests: manifests.map(({ manifest: _manifest, ...manifest }) => manifest),
    expectedTotals: EXPECTED_TOTALS,
    safety: {
      databaseMutationPerformed: false,
      blobMutationPerformed: false,
      gitMutationPerformed: false,
      deploymentMutationPerformed: false,
      publicCutoverIsSingleDatabaseTransaction: true,
    },
  };
  const bytes = serializeTexasPublicationDocument(plan);
  return {
    root,
    packageDocument: loaded.document,
    plan,
    bytes,
    sha256: sha256(bytes),
  };
}

export function buildTexasPublicationAuthorizationTemplate(plan, planSha256) {
  return {
    schemaVersion: 1,
    state: "TX",
    decision: "NO_GO_PUBLIC",
    activationId: null,
    approvedBy: null,
    authorizedAtUtc: null,
    expiresAtUtc: null,
    releaseCandidate: plan.releaseCandidate,
    publicationPlan: { id: plan.id, sha256: planSha256 },
    scopes: [...TEXAS_PUBLICATION_SCOPES],
    productionDeployment: {
      deploymentId: null,
      url: null,
      gitSha: null,
      readyVerified: false,
      promotedVerified: false,
      blockedResultGateVerified: false,
      blockedGeometryGateVerified: false,
      verifiedAtUtc: null,
      deliveryOrigin: plan.blobPublication.deliveryOrigin,
      staticRegistrySha256: plan.staticRegistry.sha256,
    },
    evidence: {
      hiddenLoad: { path: plan.hiddenLoad.path, sha256: plan.hiddenLoad.sha256 },
      blobPublication: {
        path: plan.blobPublication.path,
        sha256: plan.blobPublication.sha256,
      },
    },
  };
}

export function validateTexasPublicationAuthorization(value, context) {
  const now = context.now ?? Date.now();
  const authorizedAt = Date.parse(value?.authorizedAtUtc);
  const expiresAt = Date.parse(value?.expiresAtUtc);
  const deployedAt = Date.parse(value?.productionDeployment?.verifiedAtUtc);
  let deploymentUrl;
  try {
    deploymentUrl = new URL(value?.productionDeployment?.url);
  } catch {
    // The common fail-closed check below reports an incompatible record.
  }
  if (
    value?.schemaVersion !== 1
    || value?.state !== "TX"
    || value?.decision !== "GO_PUBLIC"
    || typeof value?.activationId !== "string"
    || !value.activationId.trim()
    || typeof value?.approvedBy !== "string"
    || !value.approvedBy.trim()
    || value?.releaseCandidate?.id !== context.plan.releaseCandidate.id
    || value?.releaseCandidate?.sha256 !== context.plan.releaseCandidate.sha256
    || value?.publicationPlan?.id !== context.plan.id
    || value?.publicationPlan?.sha256 !== context.planSha256
    || !semanticallyEqual(value?.scopes, TEXAS_PUBLICATION_SCOPES)
    || [authorizedAt, expiresAt, deployedAt].some(Number.isNaN)
    || authorizedAt > now
    || expiresAt <= authorizedAt
    || now > expiresAt
    || deployedAt > authorizedAt
    || deployedAt > now
    || now - deployedAt > 4 * 60 * 60 * 1000
    || typeof value?.productionDeployment?.deploymentId !== "string"
    || !value.productionDeployment.deploymentId.trim()
    || !/^[a-f0-9]{40}$/.test(value?.productionDeployment?.gitSha ?? "")
    || value?.productionDeployment?.readyVerified !== true
    || value?.productionDeployment?.promotedVerified !== true
    || value?.productionDeployment?.blockedResultGateVerified !== true
    || value?.productionDeployment?.blockedGeometryGateVerified !== true
    || value?.productionDeployment?.deliveryOrigin
      !== context.plan.blobPublication.deliveryOrigin
    || value?.productionDeployment?.staticRegistrySha256
      !== context.plan.staticRegistry.sha256
    || deploymentUrl?.protocol !== "https:"
    || deploymentUrl?.username
    || deploymentUrl?.password
    || deploymentUrl?.search
    || deploymentUrl?.hash
    || value?.evidence?.hiddenLoad?.path !== context.plan.hiddenLoad.path
    || value?.evidence?.hiddenLoad?.sha256 !== context.plan.hiddenLoad.sha256
    || value?.evidence?.blobPublication?.path
      !== context.plan.blobPublication.path
    || value?.evidence?.blobPublication?.sha256
      !== context.plan.blobPublication.sha256
  ) {
    throw new Error("Texas public authorization is absent, expired, or incompatible");
  }
  return {
    activationId: value.activationId.trim(),
    approvedBy: value.approvedBy.trim(),
    productionDeployment: value.productionDeployment,
  };
}

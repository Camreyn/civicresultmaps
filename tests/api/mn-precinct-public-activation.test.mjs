import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildMinnesotaPublicActivationAuthorizationTemplate,
  buildMinnesotaPublicRollbackAuthorizationTemplate,
  inspectMinnesotaPublicActivationPlan,
  serializeMinnesotaPublicActivationDocument,
  validateMinnesotaPublicActivationAuthorization,
  validateMinnesotaPublicRollbackAuthorization,
} from "../../scripts/lib/mn-precinct-public-activation.mjs";
import {
  inspectMinnesotaPrecinctBlobPublicationPlan,
} from "../../scripts/lib/mn-precinct-blob-publication.mjs";
import {
  applyMinnesotaGeographyPublicationTransaction,
  inspectMinnesotaPublicationReceipt,
  verifyMinnesotaActivationGitCandidate,
} from "../../scripts/publish-mn-precinct-geography-status.mjs";
import {
  prepareMinnesotaPublicActivation,
  writeMinnesotaActivationTrackedOutputs,
} from "../../scripts/prepare-mn-precinct-public-activation.mjs";

const YEARS = [2012, 2016, 2020, 2024];
const ELECTION_DATES = new Map([
  [2012, "2012-11-06"],
  [2016, "2016-11-08"],
  [2020, "2020-11-03"],
  [2024, "2024-11-05"],
]);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function fixtureGisPlan() {
  return {
    years: YEARS.map(() => ({
      reportingUnits: Array.from({ length: 87 }),
      geometry: {
        features: Array.from({ length: 87 }),
        crosswalks: Array.from({ length: 87 }),
      },
    })),
  };
}

function fixtureRollbackTarget(overrides = {}) {
  return {
    deploymentId: "dpl_previous",
    url: "https://fixture-previous.vercel.app",
    gitSha: "c".repeat(40),
    gitTreeSha: "d".repeat(40),
    verifiedAtUtc: "2026-08-08T00:40:00.000Z",
    gateCapableVerified: true,
    blockedStaticManifestsVerified: true,
    blockedResultGateVerified: true,
    blockedGeometryGateVerified: true,
    ...overrides,
  };
}

function fixturePublicAuthorization(template) {
  return {
    ...template,
    decision: "GO_PUBLIC",
    activationId: "fixture-public-window",
    authorizedAtUtc: "2026-08-08T00:50:00.000Z",
    expiresAtUtc: "2026-08-08T02:00:00.000Z",
    people: {
      authorizedBy: "Project owner",
      operator: "Release operator",
      verifier: "Independent verifier",
      rollbackOwner: "Project owner",
    },
    deploymentWindow: {
      startsAtUtc: "2026-08-08T00:45:00.000Z",
      endsAtUtc: "2026-08-08T01:30:00.000Z",
      rollbackDecisionAtUtc: "2026-08-08T01:20:00.000Z",
    },
    protectedPreview: {
      deploymentId: "dpl_fixture",
      url: "https://fixture-preview.vercel.app",
      gitSha: "a".repeat(40),
      gitTreeSha: "c".repeat(40),
      protectionVerified: true,
      verifiedAtUtc: "2026-08-08T00:35:00.000Z",
      verified: true,
      deliveryOrigin: template.protectedPreview.deliveryOrigin,
      trackedOutputs: template.protectedPreview.trackedOutputs,
    },
    productionDeployment: {
      deploymentId: "dpl_fixture_production",
      url: "https://fixture-production.vercel.app",
      gitSha: "b".repeat(40),
      gitTreeSha: "c".repeat(40),
      readyVerified: true,
      promotedVerified: true,
      verifiedAtUtc: "2026-08-08T00:45:00.000Z",
      deliveryOrigin: template.productionDeployment.deliveryOrigin,
      trackedOutputs: template.productionDeployment.trackedOutputs,
      blockedResultGateVerified: true,
      blockedGeometryGateVerified: true,
    },
    rollbackTarget: fixtureRollbackTarget({
      deploymentId: "dpl_fixture_previous",
      gitSha: "d".repeat(40),
      gitTreeSha: "e".repeat(40),
    }),
  };
}

function write(root, relativePath, bytes) {
  const target = path.resolve(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    path: relativePath,
    byteCount: bytes.length,
    sha256: digest(bytes),
  };
}

function manifest(year, delivery = null) {
  const date = ELECTION_DATES.get(year);
  const id = `mn-${year}-fixture-v1`;
  const reviewed = Boolean(delivery);
  return {
    schemaVersion: 1,
    id,
    state: "MN",
    election: {
      id: `${date}-general`,
      date,
      year,
      type: "general",
      office: "president",
    },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage: `Official Minnesota ${year} election boundaries`,
      vintageStatus: "election_date_confirmed",
      derivationMethod: "official_export",
      nativeCrs: "EPSG:26915",
      servedCrs: "EPSG:4326",
    },
    source: {
      authority: "Minnesota official GIS authority",
      url: "https://example.gov/mn/precincts",
      retrievedAt: "2026-08-01T00:00:00.000Z",
      artifact: `data/precinct-geometry/MN/${date}-general/source.json`,
      sha256: "1".repeat(64),
      byteCount: 100,
      format: "official fixture",
      licenseOrTerms: "Official fixture terms and complete redistribution disclaimer.",
    },
    normalization: {
      script: `scripts/collect-mn-${year}.mjs`,
      sourceCrs: "EPSG:26915",
      servedCrs: "EPSG:4326",
      artifact: `data/precinct-geometry/MN/${date}-general/normalized.geojson.gz`,
      sha256: "2".repeat(64),
      featureCount: 87,
      sourceFeatureIdFields: ["CRM_FEATURE_ID"],
      parentIdFields: ["CRM_PARENT_GEOID"],
    },
    crosswalk: {
      status: "reviewed",
      resultSourceId: `mn-${year}-results`,
      artifact: `data/precinct-geometry/MN/${date}-general/crosswalk.json`,
      sha256: "3".repeat(64),
      resultUnits: 87,
      colorableResultUnits: 87,
      matchedResultUnits: 87,
      unmatchedResultUnits: 0,
      nonGeographicResultUnits: 0,
      sourceAliasResultUnits: 0,
      relationships: {
        oneToOne: 87,
        oneToMany: 0,
        manyToOne: 0,
        unmatched: 0,
        nonGeographic: 0,
        sourceAlias: 0,
        pendingReview: 0,
      },
      methods: ["exact_official_id"],
    },
    validation: {
      status: reviewed ? "reviewed" : "blocked",
      geometryValid: true,
      rowLevelRenderingSafe: reviewed,
      parentTotalsReconciled: true,
      errors: reviewed ? [] : ["Public delivery is not authorized."],
      warnings: ["Fixture review is complete."],
    },
    delivery,
    caveats: ["Certified result rows remain the sole vote authority."],
  };
}

function coverage(year, manifestId) {
  const date = ELECTION_DATES.get(year);
  const state = {
    state: "MN",
    stateName: "Minnesota",
    electionId: `${date}-general`,
    programStatus: "reviewed",
    disposition: "blocked",
    checkedAt: "2026-08-01T00:00:00.000Z",
    geometry: {
      manifestIds: [manifestId],
      featureCount: 87,
      publicEligibleManifestCount: 0,
    },
    blockers: ["Public release pending."],
    nextAction: "Keep blocked.",
  };
  return {
    schemaVersion: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    purpose: "Fixture coverage inventory",
    election: {
      id: `${date}-general`,
      date,
      year,
      type: "general",
      office: "president",
    },
    summary: {
      totalJurisdictions: 1,
      programStatus: { not_started: 0, in_progress: 0, reviewed: 1 },
      disposition: {
        undecided: 0,
        mapped: 0,
        partial: 0,
        official_geometry_unavailable: 0,
        blocked: 1,
      },
      publicEligibleJurisdictions: 0,
    },
    states: [state],
  };
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-public-activation-"));
  const releaseRoot = ".etl/precinct-release-candidates/MN/fixture-package";
  const years = [];
  const blockedManifests = [];
  for (const year of YEARS) {
    const date = ELECTION_DATES.get(year);
    const publicRoot =
      `/data/geography/mn/${date}/precinct/mn-${year}-fixture-v1-aaaaaaaaaaaa`;
    const parentArtifacts = [];
    for (let index = 0; index < 87; index += 1) {
      const parentGeoid = "27" + String(index * 2 + 1).padStart(3, "0");
      const bytes = Buffer.from(`${year}:${parentGeoid}\n`);
      const sha256 = digest(bytes);
      const packageRelativePath =
        `delivery-assets/${year}/parents/${parentGeoid}-${sha256.slice(0, 12)}.geojson`;
      write(root, `${releaseRoot}/${packageRelativePath}`, bytes);
      parentArtifacts.push({
        parentGeoid,
        packageRelativePath,
        publicUrl: `${publicRoot}/parents/${parentGeoid}-${sha256.slice(0, 12)}.geojson`,
        sha256,
        byteCount: bytes.length,
        featureCount: 1,
      });
    }
    const indexBytes = Buffer.from(`index:${year}\n`);
    const index = {
      packageRelativePath: `delivery-assets/${year}/index.json`,
      publicUrl: `${publicRoot}/index.json`,
      sha256: digest(indexBytes),
      byteCount: indexBytes.length,
    };
    write(root, `${releaseRoot}/${index.packageRelativePath}`, indexBytes);
    const delivery = {
      format: "parent_scoped_geojson",
      url: index.publicUrl,
      sha256: index.sha256,
      byteCount: index.byteCount,
      featureIdProperty: "geometryFeatureId",
      resultUnitProperty: "resultUnitCode",
      parentGeoidProperty: "parentGeoid",
      parentCount: 87,
      featureCount: 87,
    };
    const blocked = manifest(year);
    const draft = manifest(year, delivery);
    blockedManifests.push(blocked);
    const canonicalPath =
      `data/precinct-geometry/MN/${date}-general/manifest.json`;
    const canonicalArtifact = write(root, canonicalPath, serialize(blocked));
    const draftPath = `draft-manifests/${draft.id}.json`;
    const draftArtifact = write(root, `${releaseRoot}/${draftPath}`, serialize(draft));
    years.push({
      year,
      electionId: `${date}-general`,
      manifestId: draft.id,
      canonicalManifest: {
        ...canonicalArtifact,
        validationStatus: "blocked",
        rowLevelRenderingSafe: false,
        delivery: null,
      },
      certifiedResults: { reportingUnits: 87 },
      proposedPublicDelivery: delivery,
      draftManifest: {
        path: draftPath,
        byteCount: draftArtifact.byteCount,
        sha256: draftArtifact.sha256,
      },
      parentScopedDelivery: {
        format: "parent_scoped_geojson",
        publicationPerformed: false,
        electionValuesInDelivery: false,
        parentCount: 87,
        featureCount: 87,
        index,
        parentArtifacts,
      },
    });
  }
  const registryPath = "data/precinct-geometry-manifests.json";
  const registry = write(root, registryPath, serialize({
    schemaVersion: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    manifests: blockedManifests,
  }));
  const coveragePaths = new Map([
    [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
    [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
    [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
    [2024, "data/precinct-geometry-coverage-inventory.json"],
  ]);
  const sharedReviewFiles = [registry];
  for (const year of YEARS) {
    sharedReviewFiles.push(write(
      root,
      coveragePaths.get(year),
      serialize(coverage(year, `mn-${year}-fixture-v1`)),
    ));
  }
  const packageDocument = {
    schemaVersion: 1,
    id: "mn-precinct-gis-four-election-v1",
    state: "MN",
    decision: "NO_GO_PRODUCTION",
    safety: {
      publicFileWritten: false,
      canonicalManifestChanged: false,
      publicEligibilityChanged: false,
    },
    totals: {
      elections: 4,
      reportingUnits: 348,
      candidateResultRows: 1_044,
      geometryFeatures: 348,
      reviewedExactCrosswalks: 348,
      zeroVoteUnits: 0,
    },
    years,
    scopedFileInventory: { sharedReviewFiles },
  };
  const packagePath = `${releaseRoot}/release-candidate.json`;
  const packageArtifact = write(root, packagePath, serialize(packageDocument));
  const blobPlan = inspectMinnesotaPrecinctBlobPublicationPlan({
    root,
    packagePath,
    packageSha256: packageArtifact.sha256,
  });
  const origin = "https://fixture.public.blob.vercel-storage.com";
  const blobEvidence = {
    schemaVersion: 1,
    state: "MN",
    purpose: "mn-precinct-parent-scoped-immutable-geometry-publication",
    publishedAtUtc: "2026-08-08T00:30:00.000Z",
    authorizationId: "fixture-blob",
    releaseCandidate: blobPlan.releaseCandidate,
    deliveryOrigin: origin,
    assetCount: 352,
    createdCount: 352,
    verifiedExistingCount: 0,
    remoteMutationPerformed: true,
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
    artifacts: blobPlan.artifacts.map(({ absolutePath: _absolute, ...artifact }) => ({
      ...artifact,
      disposition: "created",
      url: origin + "/" + artifact.pathname,
    })),
  };
  const blobArtifact = write(
    root,
    ".etl/precinct-blob-publications/MN/fixture.json",
    serialize(blobEvidence),
  );
  const hiddenReceipt = {
    schemaVersion: 1,
    state: "MN",
    releaseCandidate: {
      id: packageDocument.id,
      sha256: packageArtifact.sha256,
    },
    committedAtUtc: "2026-08-08T00:20:00.000Z",
    endpointFingerprint: "a".repeat(64),
    authorization: { authorizationId: "fixture-db" },
    preflight: { databaseName: "crm_production" },
    transaction: {
      totals: packageDocument.totals,
      validation: { years: YEARS.map((year) => ({ year })) },
      canonicalManifestChanged: false,
      publicFileWritten: false,
      publicDeliveryAuthorized: false,
    },
    productionMutationPerformed: true,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    publicDeliveryAuthorized: false,
  };
  const receiptArtifact = write(
    root,
    ".etl/production-release-receipts/MN/fixture.json",
    serialize(hiddenReceipt),
  );
  const options = {
    root,
    packagePath,
    packageSha256: packageArtifact.sha256,
    productionReceiptPath: receiptArtifact.path,
    productionReceiptSha256: receiptArtifact.sha256,
    blobEvidencePath: blobArtifact.path,
    blobEvidenceSha256: blobArtifact.sha256,
    now: Date.parse("2026-08-08T01:00:00.000Z"),
  };
  return { root, options };
}

test("Minnesota public activation is receipt-bound and plan-only by default", () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    assert.equal(built.plan.decision, "PROTECTED_PREVIEW_REQUIRED");
    assert.equal(built.plan.productionHiddenLoad.databaseName, "crm_production");
    assert.equal(built.plan.blobPublication.assetCount, 352);
    assert.equal(built.plan.manifests.length, 4);
    assert.equal(built.plan.trackedOutputs.length, 5);
    assert.equal(
      JSON.parse(readFileSync(
        path.join(item.root, "data/precinct-geometry-manifests.json"),
      )).manifests[0].validation.status,
      "blocked",
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota activation writer changes only five deterministic tracked files", async () => {
  const item = fixture();
  try {
    const result = await prepareMinnesotaPublicActivation({
      ...item.options,
      write: true,
    });
    assert.equal(result.decision, "PROTECTED_PREVIEW_REQUIRED");
    assert.equal(result.trackedOutputs.length, 5);
    assert.ok(result.trackedOutputs.every((file) => file.disposition === "updated"));
    const registry = JSON.parse(readFileSync(
      path.join(item.root, "data/precinct-geometry-manifests.json"),
    ));
    assert.ok(registry.manifests.every((row) => row.validation.status === "reviewed"));
    assert.ok(registry.manifests.every((row) => row.delivery?.format === "parent_scoped_geojson"));
    const rerun = await prepareMinnesotaPublicActivation({
      ...item.options,
      write: true,
    });
    assert.equal(
      rerun.activationCandidate.sha256,
      result.activationCandidate.sha256,
    );
    assert.equal(
      rerun.activationCandidate.path,
      result.activationCandidate.path,
    );
    assert.ok(rerun.trackedOutputs.every(
      (file) => file.disposition === "verified_existing",
    ));
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota public authorization requires verified preview and production deployments plus two people", () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const template = buildMinnesotaPublicActivationAuthorizationTemplate(
      built.plan,
      built.sha256,
    );
    assert.throws(
      () => validateMinnesotaPublicActivationAuthorization(template, {
        now: Date.parse("2026-08-08T01:00:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
      }),
      /authorization is absent/,
    );
    const authorization = fixturePublicAuthorization(template);
    const checked = validateMinnesotaPublicActivationAuthorization(
      authorization,
      {
        now: Date.parse("2026-08-08T01:00:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
      },
    );
    assert.equal(checked.activationId, "fixture-public-window");
    assert.equal(checked.people.verifier, "Independent verifier");
    assert.equal(
      checked.productionDeployment.deploymentId,
      "dpl_fixture_production",
    );
    assert.equal(checked.rollbackTarget.deploymentId, "dpl_fixture_previous");
    assert.throws(
      () => validateMinnesotaPublicActivationAuthorization(
        { ...authorization, productionDeployment: template.productionDeployment },
        {
          now: Date.parse("2026-08-08T01:00:00.000Z"),
          plan: built.plan,
          activationSha256: built.sha256,
        },
      ),
      /authorization is absent/,
    );
    assert.throws(
      () => validateMinnesotaPublicActivationAuthorization({
        ...authorization,
        productionDeployment: {
          ...authorization.productionDeployment,
          gitTreeSha: "f".repeat(40),
        },
      }, {
        now: Date.parse("2026-08-08T01:00:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
      }),
      /authorization is absent/,
    );
    assert.throws(
      () => validateMinnesotaPublicActivationAuthorization({
        ...authorization,
        productionDeployment: {
          ...authorization.productionDeployment,
          verifiedAtUtc: "2026-08-08T00:30:00.000Z",
        },
      }, {
        now: Date.parse("2026-08-08T01:00:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
      }),
      /authorization is absent/,
    );
    assert.equal(
      validateMinnesotaPublicActivationAuthorization(authorization, {
        now: Date.parse("2026-08-09T01:00:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
        recovery: true,
      }).activationId,
      "fixture-public-window",
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota rollback requires a separate decision bound to the publish receipt", () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const publicationReceipt = {
      path: ".etl/production-publication-receipts/MN/publish.json",
      sha256: "b".repeat(64),
      activationId: "fixture-public-window",
      revision: 29,
      changedAtUtc: "2026-08-08T01:00:00.000Z",
      rollbackTarget: {
        deploymentId: "dpl_previous",
        url: "https://fixture-previous.vercel.app",
        gitSha: "c".repeat(40),
        gitTreeSha: "d".repeat(40),
        verifiedAtUtc: "2026-08-08T00:40:00.000Z",
        gateCapableVerified: true,
        blockedStaticManifestsVerified: true,
        blockedResultGateVerified: true,
        blockedGeometryGateVerified: true,
      },
    };
    const template = buildMinnesotaPublicRollbackAuthorizationTemplate(
      built.plan,
      built.sha256,
      publicationReceipt,
    );
    assert.throws(
      () => validateMinnesotaPublicRollbackAuthorization(template, {
        now: Date.parse("2026-08-08T01:20:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
        publicationReceipt,
      }),
      /authorization is absent/,
    );
    const authorization = {
      ...template,
      decision: "GO_ROLLBACK",
      rollbackId: "fixture-rollback-window",
      authorizedAtUtc: "2026-08-08T01:16:00.000Z",
      expiresAtUtc: "2026-08-08T02:00:00.000Z",
      people: {
        authorizedBy: "Project owner",
        operator: "Release operator",
        verifier: "Independent verifier",
        rollbackOwner: "Project owner",
      },
      rollbackWindow: {
        startsAtUtc: "2026-08-08T01:10:00.000Z",
        endsAtUtc: "2026-08-08T01:45:00.000Z",
      },
      applicationRollback: {
        target: publicationReceipt.rollbackTarget,
        databaseBlockFirstAcknowledged: true,
        restoreAfterDatabaseRollbackAcknowledged: true,
      },
    };
    const checked = validateMinnesotaPublicRollbackAuthorization(
      authorization,
      {
        now: Date.parse("2026-08-08T01:20:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
        publicationReceipt,
      },
    );
    assert.equal(checked.activationId, "fixture-rollback-window");
    assert.equal(checked.publicationActivationId, "fixture-public-window");
    assert.equal(
      checked.applicationRollback.target.deploymentId,
      "dpl_previous",
    );
    assert.throws(
      () => validateMinnesotaPublicRollbackAuthorization({
        ...authorization,
        applicationRollback: {
          ...authorization.applicationRollback,
          target: {
            ...authorization.applicationRollback.target,
            deploymentId: "dpl_unpinned",
          },
        },
      }, {
        now: Date.parse("2026-08-08T01:20:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
        publicationReceipt,
      }),
      /authorization is absent/,
    );
    assert.equal(
      validateMinnesotaPublicRollbackAuthorization(authorization, {
        now: Date.parse("2026-08-09T01:20:00.000Z"),
        plan: built.plan,
        activationSha256: built.sha256,
        publicationReceipt,
        recovery: true,
      }).rollbackId,
      "fixture-rollback-window",
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota publish receipt pins the exact gate-capable rollback deployment", () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const activation = {
      plan: built.plan,
      artifact: {
        path: ".etl/precinct-public-activations/MN/activation.json",
        sha256: "a".repeat(64),
      },
    };
    const publicAuthorization = fixturePublicAuthorization(
      buildMinnesotaPublicActivationAuthorizationTemplate(
        built.plan,
        activation.artifact.sha256,
      ),
    );
    const rollbackTarget = publicAuthorization.rollbackTarget;
    const publicAuthorizationArtifact = write(
      item.root,
      ".etl/production-authorizations/MN/public.json",
      serialize(publicAuthorization),
    );
    const receipt = {
      schemaVersion: 1,
      state: "MN",
      mode: "publish",
      changedAtUtc: "2026-08-08T01:00:00.000Z",
      releaseCandidate: built.plan.releaseCandidate,
      activationCandidate: activation.artifact,
      authorization: {
        activationId: "fixture-public-window",
        path: publicAuthorizationArtifact.path,
        sha256: publicAuthorizationArtifact.sha256,
        rollbackTarget,
      },
      transaction: {
        mode: "publish",
        disposition: "updated",
        geographyVersions: 4,
        features: 348,
        crosswalks: 348,
        reportingUnits: 348,
        sourceDocuments: 8,
        importRuns: 4,
        revision: 29,
        committedAtUtc: "2026-08-08T01:00:00.000Z",
      },
      databasePublicationStatusConfirmed: true,
    };
    const artifact = write(
      item.root,
      ".etl/production-publication-receipts/MN/publish.json",
      serialize(receipt),
    );
    const inspected = inspectMinnesotaPublicationReceipt(item.root, {
      publicationReceiptPath: artifact.path,
      publicationReceiptSha256: artifact.sha256,
      now: Date.parse("2026-08-08T01:05:00.000Z"),
    }, activation);
    assert.deepEqual(inspected.summary.rollbackTarget, rollbackTarget);

    const tampered = write(
      item.root,
      ".etl/production-publication-receipts/MN/publish-missing-target.json",
      serialize({
        ...receipt,
        authorization: {
          activationId: receipt.authorization.activationId,
          path: receipt.authorization.path,
          sha256: receipt.authorization.sha256,
        },
      }),
    );
    assert.throws(
      () => inspectMinnesotaPublicationReceipt(item.root, {
        publicationReceiptPath: tampered.path,
        publicationReceiptSha256: tampered.sha256,
        now: Date.parse("2026-08-08T01:05:00.000Z"),
      }, activation),
      /receipt is incomplete/,
    );
    const substituted = write(
      item.root,
      ".etl/production-publication-receipts/MN/publish-substituted-target.json",
      serialize({
        ...receipt,
        authorization: {
          ...receipt.authorization,
          rollbackTarget: fixtureRollbackTarget({
            deploymentId: "dpl_substituted",
            gitSha: "f".repeat(40),
            gitTreeSha: "0".repeat(40),
          }),
        },
      }),
    );
    assert.throws(
      () => inspectMinnesotaPublicationReceipt(item.root, {
        publicationReceiptPath: substituted.path,
        publicationReceiptSha256: substituted.sha256,
        now: Date.parse("2026-08-08T01:05:00.000Z"),
      }, activation),
      /receipt is incomplete/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota publication binds the operator checkout to the verified preview commit", () => {
  const expected = "a".repeat(40);
  const expectedTree = "c".repeat(40);
  const productionCommit = "b".repeat(40);
  const rollbackCommit = "d".repeat(40);
  const rollbackTree = "e".repeat(40);
  const calls = [];
  const runner = (_command, args) => {
    calls.push(args);
    if (args[0] === "rev-parse" && args[1] === "HEAD") {
      return { status: 0, stdout: expected + "\n" };
    }
    if (args[0] === "rev-parse" && args[1] === "HEAD^{tree}") {
      return { status: 0, stdout: expectedTree + "\n" };
    }
    if (
      args[0] === "rev-parse"
      && args[1] === `${productionCommit}^{tree}`
    ) {
      return { status: 0, stdout: expectedTree + "\n" };
    }
    if (
      args[0] === "rev-parse"
      && args[1] === `${rollbackCommit}^{tree}`
    ) {
      return { status: 0, stdout: rollbackTree + "\n" };
    }
    return { status: 0, stdout: "" };
  };
  assert.deepEqual(
    verifyMinnesotaActivationGitCandidate(
      process.cwd(),
      {
        protectedPreview: { gitSha: expected, gitTreeSha: expectedTree },
        productionDeployment: {
          gitSha: productionCommit,
          gitTreeSha: expectedTree,
        },
        rollbackTarget: {
          gitSha: rollbackCommit,
          gitTreeSha: rollbackTree,
        },
      },
      runner,
    ),
    {
      gitSha: expected,
      gitTreeSha: expectedTree,
      productionDeployment: {
        gitSha: productionCommit,
        gitTreeSha: expectedTree,
      },
      rollbackTarget: {
        gitSha: rollbackCommit,
        gitTreeSha: rollbackTree,
      },
      trackedWorktreeClean: true,
    },
  );
  assert.deepEqual(calls, [
    ["rev-parse", "HEAD"],
    ["rev-parse", "HEAD^{tree}"],
    ["rev-parse", `${productionCommit}^{tree}`],
    ["rev-parse", `${rollbackCommit}^{tree}`],
    ["status", "--porcelain", "--untracked-files=no"],
  ]);
  assert.throws(
    () => verifyMinnesotaActivationGitCandidate(
      process.cwd(),
      {
        protectedPreview: {
          gitSha: "b".repeat(40),
          gitTreeSha: expectedTree,
        },
        productionDeployment: {
          gitSha: productionCommit,
          gitTreeSha: expectedTree,
        },
        rollbackTarget: {
          gitSha: rollbackCommit,
          gitTreeSha: rollbackTree,
        },
      },
      runner,
    ),
    /does not match the verified preview Git SHA/,
  );
  assert.throws(
    () => verifyMinnesotaActivationGitCandidate(
      process.cwd(),
      {
        protectedPreview: { gitSha: expected, gitTreeSha: expectedTree },
        productionDeployment: {
          gitSha: productionCommit,
          gitTreeSha: "d".repeat(40),
        },
        rollbackTarget: {
          gitSha: rollbackCommit,
          gitTreeSha: rollbackTree,
        },
      },
      runner,
    ),
    /tree does not match both verified deployments/,
  );
  assert.throws(
    () => verifyMinnesotaActivationGitCandidate(
      process.cwd(),
      {
        protectedPreview: { gitSha: expected, gitTreeSha: expectedTree },
        productionDeployment: {
          gitSha: "f".repeat(40),
          gitTreeSha: expectedTree,
        },
        rollbackTarget: {
          gitSha: rollbackCommit,
          gitTreeSha: rollbackTree,
        },
      },
      runner,
    ),
    /production deployment commit does not resolve/,
  );
  assert.throws(
    () => verifyMinnesotaActivationGitCandidate(
      process.cwd(),
      {
        protectedPreview: { gitSha: expected, gitTreeSha: expectedTree },
        productionDeployment: {
          gitSha: productionCommit,
          gitTreeSha: expectedTree,
        },
        rollbackTarget: {
          gitSha: "f".repeat(40),
          gitTreeSha: rollbackTree,
        },
      },
      runner,
    ),
    /rollback deployment commit does not resolve/,
  );
});

test("Minnesota publication transaction atomically publishes exact versions and crosswalks", async () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const versions = YEARS.map((year, index) => ({
      id: `00000000-0000-0000-0000-00000000000${index}`,
      year,
      status: "blocked",
      caveat: "Public delivery is not authorized.",
      features: 87,
      crosswalks: 87,
      metadata: {
        manifestId: `mn-${year}-fixture-v1`,
        manifestSha256: built.plan.manifests.find(
          (manifest) => manifest.year === year,
        ).canonicalPreimage.sha256,
        publicDeliveryAuthorized: false,
        releaseCandidate: {
          id: built.plan.releaseCandidate.id,
          sha256: built.plan.releaseCandidate.sha256,
          publicDeliveryAuthorized: false,
        },
      },
    }));
    const tx = {
      async unsafe(sql) {
        if (sql.includes("current_database()")) {
          return [{ database_name: "crm_production", transaction_read_only: "off" }];
        }
        if (sql.includes("select gv.id,e.id election_id")) return versions;
        if (sql.includes("metadata=jsonb_set(metadata,'{publicActivation,revision}'")) {
          return [{ count: 4 }];
        }
        if (sql.startsWith("update geography_versions")) return [{ id: "updated" }];
        if (sql.includes("update reporting_unit_geometry_crosswalks")) {
          return [{ count: 87 }];
        }
        if (sql.includes("with updated as (update reporting_units")) {
          return [{ count: 348 }];
        }
        if (sql.includes("with updated as (update source_documents")) {
          return [{ count: 8 }];
        }
        if (sql.includes("with updated as (update import_runs")) {
          return [{ count: 4 }];
        }
        if (sql.includes("select count(*)::int versions")) {
          return [{
            versions: 4,
            expected_status: 4,
            expected_flags: 4,
            bound_activation: 4,
            operation_bound: 4,
            revision_min: 29,
            revision_max: 29,
            crosswalks: 348,
          }];
        }
        if (sql.includes("select count(*)::int crosswalks")) {
          return [{
            crosswalks: 348,
            expected_flags: 348,
            exact_crosswalks: 348,
            linked_features: 348,
          }];
        }
        if (sql.includes("from reporting_units where")) {
          return [{ total: 348, expected_flags: 348 }];
        }
        if (sql.includes("from source_documents where")) {
          return [{ total: 8, expected_flags: 8 }];
        }
        if (sql.includes("from import_runs where")) {
          return [{ total: 4, expected_flags: 4 }];
        }
        if (sql.includes("insert into public_data_revisions")) {
          return [{ revision: 29 }];
        }
        return [];
      },
    };
    const result = await applyMinnesotaGeographyPublicationTransaction(tx, {
      mode: "publish",
      plan: built.plan,
      activationSha256: built.sha256,
      authorization: {
        activationId: "fixture-public-window",
        rollbackTarget: fixtureRollbackTarget(),
      },
      authorizationSha256: "d".repeat(64),
      publicationActivationId: "fixture-public-window",
      publicationAuthorizationSha256: "d".repeat(64),
      databaseName: "crm_production",
      changedAtUtc: "2026-08-08T01:00:00.000Z",
      gisPlan: fixtureGisPlan(),
      validateCurrentDatabase: async () => ({
        years: YEARS.map((year) => ({ year })),
      }),
    });
    assert.deepEqual(result, {
      disposition: "updated",
      mode: "publish",
      geographyVersions: 4,
      features: 348,
      crosswalks: 348,
      reportingUnits: 348,
      sourceDocuments: 8,
      importRuns: 4,
      revision: 29,
      committedAtUtc: "2026-08-08T01:00:00.000Z",
      databaseValidation: {
        years: YEARS.map((year) => ({ year })),
      },
      productionMutationPerformed: true,
    });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota rollback restores original caveats and rejects a substituted rollback target", async () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const rollbackTarget = fixtureRollbackTarget();
    const versions = built.plan.manifests.map((manifest, index) => ({
      id: `10000000-0000-0000-0000-00000000000${index}`,
      year: manifest.year,
      status: "published",
      caveat: "Publicly authorized fixture.",
      features: 87,
      crosswalks: 87,
      metadata: {
        manifestId: manifest.manifestId,
        manifestSha256: manifest.canonicalPreimage.sha256,
        publicDeliveryAuthorized: true,
        releaseCandidate: {
          id: built.plan.releaseCandidate.id,
          sha256: built.plan.releaseCandidate.sha256,
          publicDeliveryAuthorized: true,
        },
        publicActivation: {
          activationId: "fixture-public-window",
          activationCandidateSha256: built.sha256,
          releasePackageSha256: built.plan.releaseCandidate.sha256,
          blobPublicationSha256: built.plan.blobPublication.sha256,
          deliveryOrigin: built.plan.blobPublication.deliveryOrigin,
          authorizationSha256: "d".repeat(64),
          rollbackTarget,
          changedAtUtc: "2026-08-08T01:00:00.000Z",
          mode: "publish",
          year: manifest.year,
          manifestId: manifest.manifestId,
          publicManifestSha256: manifest.draftManifest.sha256,
          delivery: manifest.draftManifest.delivery,
          previousCaveat: "Public delivery is not authorized.",
          revision: 29,
        },
      },
    }));
    const restoredCaveats = [];
    const tx = {
      async unsafe(sql, parameters = []) {
        if (sql.includes("current_database()")) {
          return [{ database_name: "crm_production", transaction_read_only: "off" }];
        }
        if (sql.includes("select gv.id,e.id election_id")) return versions;
        if (sql.includes("metadata=jsonb_set(metadata,'{publicActivation,rollback,revision}'")) {
          return [{ count: 4 }];
        }
        if (sql.startsWith("update geography_versions")) {
          restoredCaveats.push(parameters[2]);
          return [{ id: "updated" }];
        }
        if (sql.includes("update reporting_unit_geometry_crosswalks")) {
          return [{ count: 87 }];
        }
        if (sql.includes("with updated as (update reporting_units")) {
          return [{ count: 348 }];
        }
        if (sql.includes("with updated as (update source_documents")) {
          return [{ count: 8 }];
        }
        if (sql.includes("with updated as (update import_runs")) {
          return [{ count: 4 }];
        }
        if (sql.includes("insert into public_data_revisions")) {
          return [{ revision: 30 }];
        }
        if (sql.includes("select count(*)::int versions")) {
          return [{
            versions: 4,
            expected_status: 4,
            expected_flags: 4,
            bound_activation: 4,
            operation_bound: 4,
            revision_min: 30,
            revision_max: 30,
          }];
        }
        if (sql.includes("select count(*)::int crosswalks")) {
          return [{
            crosswalks: 348,
            expected_flags: 348,
            exact_crosswalks: 348,
            linked_features: 348,
          }];
        }
        if (sql.includes("from reporting_units where")) {
          return [{ total: 348, expected_flags: 348 }];
        }
        if (sql.includes("from source_documents where")) {
          return [{ total: 8, expected_flags: 8 }];
        }
        if (sql.includes("from import_runs where")) {
          return [{ total: 4, expected_flags: 4 }];
        }
        return [];
      },
    };
    const substitutedRollbackTarget = fixtureRollbackTarget({
      deploymentId: "dpl_substituted",
      gitSha: "e".repeat(40),
      gitTreeSha: "f".repeat(40),
    });
    await assert.rejects(
      () => applyMinnesotaGeographyPublicationTransaction(tx, {
        mode: "rollback",
        plan: built.plan,
        activationSha256: built.sha256,
        authorization: {
          activationId: "fixture-rollback-window",
          applicationRollback: { target: substitutedRollbackTarget },
        },
        authorizationSha256: "e".repeat(64),
        publicationActivationId: "fixture-public-window",
        publicationAuthorizationSha256: "d".repeat(64),
        publicationReceipt: {
          path: ".etl/production-publication-receipts/MN/publish.json",
          sha256: "f".repeat(64),
          activationId: "fixture-public-window",
          authorizationSha256: "d".repeat(64),
          revision: 29,
          changedAtUtc: "2026-08-08T01:00:00.000Z",
          rollbackTarget: substitutedRollbackTarget,
        },
        databaseName: "crm_production",
        changedAtUtc: "2026-08-08T01:30:00.000Z",
        gisPlan: fixtureGisPlan(),
      }),
      /does not match the publication being reversed/,
    );
    assert.deepEqual(restoredCaveats, []);
    const result = await applyMinnesotaGeographyPublicationTransaction(tx, {
      mode: "rollback",
      plan: built.plan,
      activationSha256: built.sha256,
      authorization: {
        activationId: "fixture-rollback-window",
        applicationRollback: { target: rollbackTarget },
      },
      authorizationSha256: "e".repeat(64),
      publicationActivationId: "fixture-public-window",
      publicationAuthorizationSha256: "d".repeat(64),
      publicationReceipt: {
        path: ".etl/production-publication-receipts/MN/publish.json",
        sha256: "f".repeat(64),
        activationId: "fixture-public-window",
        authorizationSha256: "d".repeat(64),
        revision: 29,
        changedAtUtc: "2026-08-08T01:00:00.000Z",
        rollbackTarget,
      },
      databaseName: "crm_production",
      changedAtUtc: "2026-08-08T01:30:00.000Z",
      gisPlan: fixtureGisPlan(),
    });
    assert.equal(result.mode, "rollback");
    assert.equal(result.revision, 30);
    assert.equal(result.committedAtUtc, "2026-08-08T01:30:00.000Z");
    assert.deepEqual(restoredCaveats, Array(4).fill("Public delivery is not authorized."));

    await assert.rejects(
      () => applyMinnesotaGeographyPublicationTransaction(tx, {
        mode: "rollback",
        plan: built.plan,
        activationSha256: built.sha256,
        authorization: {
          activationId: "fixture-rollback-window",
          applicationRollback: { target: rollbackTarget },
        },
        authorizationSha256: "e".repeat(64),
        publicationActivationId: "different-publication",
        publicationAuthorizationSha256: "d".repeat(64),
        publicationReceipt: {
          path: ".etl/production-publication-receipts/MN/publish.json",
          sha256: "f".repeat(64),
          activationId: "fixture-public-window",
          authorizationSha256: "d".repeat(64),
          revision: 29,
          changedAtUtc: "2026-08-08T01:00:00.000Z",
          rollbackTarget,
        },
        databaseName: "crm_production",
        changedAtUtc: "2026-08-08T01:30:00.000Z",
        gisPlan: fixtureGisPlan(),
      }),
      /does not match the publication being reversed/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota publication receipt can be recovered read-only from exact DB audit metadata", async () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const rollbackTarget = fixtureRollbackTarget();
    const versions = built.plan.manifests.map((manifest, index) => ({
      id: `20000000-0000-0000-0000-00000000000${index}`,
      year: manifest.year,
      status: "published",
      caveat: "Publicly authorized fixture.",
      features: 87,
      crosswalks: 87,
      metadata: {
        manifestId: manifest.manifestId,
        manifestSha256: manifest.canonicalPreimage.sha256,
        publicDeliveryAuthorized: true,
        releaseCandidate: {
          id: built.plan.releaseCandidate.id,
          sha256: built.plan.releaseCandidate.sha256,
          publicDeliveryAuthorized: true,
        },
        publicActivation: {
          activationId: "fixture-public-window",
          activationCandidateSha256: built.sha256,
          releasePackageSha256: built.plan.releaseCandidate.sha256,
          blobPublicationSha256: built.plan.blobPublication.sha256,
          deliveryOrigin: built.plan.blobPublication.deliveryOrigin,
          authorizationSha256: "d".repeat(64),
          rollbackTarget,
          changedAtUtc: "2026-08-08T01:00:00.000Z",
          mode: "publish",
          year: manifest.year,
          manifestId: manifest.manifestId,
          publicManifestSha256: manifest.draftManifest.sha256,
          delivery: manifest.draftManifest.delivery,
          previousCaveat: "Public delivery is not authorized.",
          revision: 29,
        },
      },
    }));
    const tx = {
      async unsafe(sql) {
        if (sql.includes("current_database()")) {
          return [{ database_name: "crm_production", transaction_read_only: "on" }];
        }
        if (sql.includes("select gv.id,e.id election_id")) return versions;
        if (sql.includes("select count(*)::int versions")) {
          return [{
            versions: 4,
            expected_status: 4,
            expected_flags: 4,
            bound_activation: 4,
            operation_bound: 4,
            revision_min: 29,
            revision_max: 29,
          }];
        }
        if (sql.includes("select count(*)::int crosswalks")) {
          return [{
            crosswalks: 348,
            expected_flags: 348,
            exact_crosswalks: 348,
            linked_features: 348,
          }];
        }
        if (sql.includes("from reporting_units where")) {
          return [{ total: 348, expected_flags: 348 }];
        }
        if (sql.includes("from source_documents where")) {
          return [{ total: 8, expected_flags: 8 }];
        }
        if (sql.includes("from import_runs where")) {
          return [{ total: 4, expected_flags: 4 }];
        }
        if (sql.includes("update ") || sql.includes("insert into")) {
          throw new Error("receipt recovery attempted a write");
        }
        return [];
      },
    };
    const result = await applyMinnesotaGeographyPublicationTransaction(tx, {
      mode: "publish",
      plan: built.plan,
      activationSha256: built.sha256,
      authorization: {
        activationId: "fixture-public-window",
        rollbackTarget,
      },
      authorizationSha256: "d".repeat(64),
      publicationActivationId: "fixture-public-window",
      publicationAuthorizationSha256: "d".repeat(64),
      databaseName: "crm_production",
      changedAtUtc: "2026-08-09T01:00:00.000Z",
      gisPlan: fixtureGisPlan(),
      recoveryOnly: true,
    });
    assert.equal(result.disposition, "verified_existing");
    assert.equal(result.revision, 29);
    assert.equal(result.committedAtUtc, "2026-08-08T01:00:00.000Z");
    assert.equal(result.productionMutationPerformed, false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota activation receipts reject Blob or package tampering", () => {
  const item = fixture();
  try {
    const evidencePath = path.resolve(
      item.root,
      ...item.options.blobEvidencePath.split("/"),
    );
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    evidence.artifacts[0].sha256 = "0".repeat(64);
    const tamperedBytes = serialize(evidence);
    writeFileSync(evidencePath, tamperedBytes);
    assert.throws(
      () => inspectMinnesotaPublicActivationPlan({
        ...item.options,
        blobEvidenceSha256: digest(tamperedBytes),
      }),
      /artifact set drifted/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota activation requires exact hashes for both production receipts", () => {
  const item = fixture();
  try {
    assert.throws(
      () => inspectMinnesotaPublicActivationPlan({
        ...item.options,
        productionReceiptSha256: undefined,
      }),
      /requires exact hidden-load and Blob evidence SHA-256 values/,
    );
    assert.throws(
      () => inspectMinnesotaPublicActivationPlan({
        ...item.options,
        blobEvidenceSha256: undefined,
      }),
      /requires exact hidden-load and Blob evidence SHA-256 values/,
    );
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota activation preflights every tracked target before writing any", () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const first = built.outputs[0];
    const firstPreimage = readFileSync(first.absolutePath);
    const last = built.outputs.at(-1);
    writeFileSync(last.absolutePath, Buffer.from("drifted\n"));
    assert.throws(
      () => writeMinnesotaActivationTrackedOutputs(built.outputs),
      /Refusing to overwrite drifted activation target/,
    );
    assert.ok(readFileSync(first.absolutePath).equals(firstPreimage));
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota publication blocks before writes when live result data drifted", async () => {
  const item = fixture();
  try {
    const built = inspectMinnesotaPublicActivationPlan(item.options);
    const versions = YEARS.map((year, index) => ({
      id: `00000000-0000-0000-0000-00000000000${index}`,
      year,
      status: "blocked",
      caveat: "Public delivery is not authorized.",
      features: 87,
      crosswalks: 87,
      metadata: {
        manifestId: `mn-${year}-fixture-v1`,
        manifestSha256: built.plan.manifests.find(
          (manifest) => manifest.year === year,
        ).canonicalPreimage.sha256,
        publicDeliveryAuthorized: false,
        releaseCandidate: {
          id: built.plan.releaseCandidate.id,
          sha256: built.plan.releaseCandidate.sha256,
          publicDeliveryAuthorized: false,
        },
      },
    }));
    const writes = [];
    const tx = {
      async unsafe(sql) {
        if (sql.includes("current_database()")) {
          return [{ database_name: "crm_production", transaction_read_only: "off" }];
        }
        if (sql.includes("select gv.id,e.id election_id")) return versions;
        if (sql.startsWith("update ")) writes.push(sql);
        return [];
      },
    };
    await assert.rejects(
      () => applyMinnesotaGeographyPublicationTransaction(tx, {
        mode: "publish",
        plan: built.plan,
        activationSha256: built.sha256,
        authorization: {
          activationId: "fixture-public-window",
          rollbackTarget: fixtureRollbackTarget(),
        },
        authorizationSha256: "d".repeat(64),
        publicationActivationId: "fixture-public-window",
        publicationAuthorizationSha256: "d".repeat(64),
        databaseName: "crm_production",
        changedAtUtc: "2026-08-08T01:00:00.000Z",
        gisPlan: fixtureGisPlan(),
        validateCurrentDatabase: async () => {
          throw new Error("Minnesota 2020 database counts drifted");
        },
      }),
      /database counts drifted/,
    );
    assert.deepEqual(writes, []);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("public activation documents serialize deterministically", () => {
  const value = { schemaVersion: 1, state: "MN", scopes: ["a", "b"] };
  assert.equal(
    digest(serializeMinnesotaPublicActivationDocument(value)),
    digest(serializeMinnesotaPublicActivationDocument(value)),
  );
});

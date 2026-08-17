import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PENNSYLVANIA_PUBLICATION_SCOPES,
  PENNSYLVANIA_PUBLIC_ROLLBACK_SCOPES,
  buildPennsylvaniaPublicRollbackAuthorizationTemplate,
  buildPennsylvaniaPublicationAuthorizationTemplate,
  serializePennsylvaniaPublicationDocument,
  sha256,
  validatePennsylvaniaBlobPublicationEvidence,
  validatePennsylvaniaPublicRollbackAuthorization,
  validatePennsylvaniaPublicationAuthorization,
} from "../../scripts/lib/pa-precinct-publication.mjs";
import {
  applyPennsylvaniaGeographyPublicationTransaction,
  assertPennsylvaniaPublicationRecoveryVersionSet,
  inspectPennsylvaniaPublicationReceipt,
  verifyPennsylvaniaPublicationGitCandidate,
} from "../../scripts/publish-pa-precinct-geography-status.mjs";
const deliveryOrigin = "https://example.public.blob.vercel-storage.com";
const blobReleaseCandidate = {
  id: "pa-precinct-gis-two-election-v1",
  path: ".etl/precinct-release-candidates/PA/example/release-candidate.json",
  sha256: "d".repeat(64),
};
const blobArtifacts = Array.from({ length: 136 }, (_, index) => {
  const year = [2016, 2020][Math.min(1, Math.floor(index / 68))];
  const kind = index % 68 === 67 ? "index" : "parent";
  return {
    kind,
    year,
    packageRelativePath: `delivery-assets/${year}/file-${index}.json`,
    publicUrl: `/data/geography/pa/${year}/precinct/file-${index}.json`,
    pathname: `data/geography/pa/${year}/precinct/file-${index}.json`,
    byteCount: 100 + index,
    sha256: index.toString(16).padStart(64, "0"),
  };
});
const blobPlan = {
  releaseCandidate: blobReleaseCandidate,
  artifacts: blobArtifacts,
};
const evidence = {
  schemaVersion: 1,
  state: "PA",
  purpose: "pa-precinct-parent-scoped-immutable-geometry-publication",
  releaseCandidate: blobReleaseCandidate,
  authorizationId: "pa-blob-publication-1",
  publishedAtUtc: "2026-08-13T00:00:00.000Z",
  deliveryOrigin,
  assetCount: blobPlan.artifacts.length,
  canonicalManifestChanged: false,
  publicEligibilityChanged: false,
  artifacts: blobPlan.artifacts.map((artifact) => ({
    ...artifact,
    url: `${deliveryOrigin}/${artifact.pathname}`,
    disposition: "created",
  })),
};

const releaseCandidate = {
  id: "pa-precinct-gis-two-election-v1",
  path: ".etl/precinct-release-candidates/PA/example/release-candidate.json",
  sha256: "1".repeat(64),
};
const planSha256 = "2".repeat(64);
const rollbackTarget = {
  deploymentId: "dpl_pennsylvania_previous",
  url: "https://previous.civicresultmaps.org",
  gitSha: "3".repeat(40),
  gitTreeSha: "4".repeat(40),
  verifiedAtUtc: "2026-08-13T00:30:00.000Z",
  gateCapableVerified: true,
  blockedResultGateVerified: true,
  blockedGeometryGateVerified: true,
};
const authorizationPlan = {
  id: "pa-precinct-database-publication-v1",
  releaseCandidate,
  hiddenLoad: { path: "hidden.json", sha256: "5".repeat(64) },
  blobPublication: {
    path: "blob.json",
    sha256: "6".repeat(64),
    deliveryOrigin,
  },
  staticRegistry: { sha256: "7".repeat(64) },
};

function publicAuthorization() {
  const value = buildPennsylvaniaPublicationAuthorizationTemplate(
    authorizationPlan,
    planSha256,
  );
  Object.assign(value, {
    decision: "GO_PUBLIC",
    activationId: "pa-precinct-public-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T00:50:00.000Z",
    expiresAtUtc: "2026-08-13T02:00:00.000Z",
  });
  Object.assign(value.productionDeployment, {
    deploymentId: "dpl_pennsylvania_public",
    url: "https://civicresultmaps.org",
    gitSha: "8".repeat(40),
    gitTreeSha: "9".repeat(40),
    readyVerified: true,
    promotedVerified: true,
    blockedResultGateVerified: true,
    blockedGeometryGateVerified: true,
    verifiedAtUtc: "2026-08-13T00:45:00.000Z",
  });
  Object.assign(value.rollbackTarget, rollbackTarget);
  return value;
}

function publicationSummary() {
  return {
    path: ".etl/production-publication-receipts/PA/pa-precinct-publish.json",
    sha256: "a".repeat(64),
    activationId: "pa-precinct-public-camreyn",
    authorizationSha256: "b".repeat(64),
    revision: 41,
    changedAtUtc: "2026-08-13T01:00:00.000Z",
    rollbackTarget,
    productionDeployment: publicAuthorization().productionDeployment,
  };
}

test("Pennsylvania Blob evidence requires all 136 immutable artifacts", () => {
  const result = validatePennsylvaniaBlobPublicationEvidence(
    evidence,
    blobPlan,
    Date.parse("2026-08-13T00:01:00.000Z"),
  );
  assert.equal(result.assetCount, 136);
  assert.equal(result.deliveryOrigin, deliveryOrigin);
  const incomplete = { ...evidence, assetCount: 135 };
  assert.throws(
    () => validatePennsylvaniaBlobPublicationEvidence(incomplete, blobPlan),
    /incomplete or incompatible/,
  );
});

test("Pennsylvania public authorization pins production and rollback deployment trees", () => {
  const value = publicAuthorization();
  const checked = validatePennsylvaniaPublicationAuthorization(value, {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  assert.equal(checked.approvedBy, "Camreyn");
  assert.deepEqual(value.scopes, PENNSYLVANIA_PUBLICATION_SCOPES);
  assert.deepEqual(checked.rollbackTarget, rollbackTarget);

  const sameTree = structuredClone(value);
  sameTree.rollbackTarget.gitTreeSha = value.productionDeployment.gitTreeSha;
  assert.throws(
    () => validatePennsylvaniaPublicationAuthorization(sameTree, {
      plan: authorizationPlan,
      planSha256,
      now: Date.parse("2026-08-13T01:01:00.000Z"),
    }),
    /incompatible/,
  );
});

test("Pennsylvania rollback authorization is bound to the exact publication receipt", () => {
  const receipt = publicationSummary();
  const value = buildPennsylvaniaPublicRollbackAuthorizationTemplate(
    authorizationPlan,
    planSha256,
    receipt,
  );
  Object.assign(value, {
    decision: "GO_ROLLBACK",
    rollbackId: "pa-rollback-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T01:10:00.000Z",
    expiresAtUtc: "2026-08-13T02:00:00.000Z",
  });
  Object.assign(value.rollbackWindow, {
    startsAtUtc: "2026-08-13T01:10:00.000Z",
    endsAtUtc: "2026-08-13T01:50:00.000Z",
  });
  value.applicationRollback.databaseBlockFirstAcknowledged = true;
  value.applicationRollback.restoreAfterDatabaseRollbackAcknowledged = true;
  const checked = validatePennsylvaniaPublicRollbackAuthorization(value, {
    plan: authorizationPlan,
    planSha256,
    publicationReceipt: receipt,
    now: Date.parse("2026-08-13T01:20:00.000Z"),
  });
  assert.equal(checked.rollbackId, "pa-rollback-camreyn");
  assert.deepEqual(value.scopes, PENNSYLVANIA_PUBLIC_ROLLBACK_SCOPES);

  const substituted = structuredClone(value);
  substituted.applicationRollback.target.deploymentId = "dpl_substituted";
  assert.throws(
    () => validatePennsylvaniaPublicRollbackAuthorization(substituted, {
      plan: authorizationPlan,
      planSha256,
      publicationReceipt: receipt,
      now: Date.parse("2026-08-13T01:20:00.000Z"),
    }),
    /incompatible/,
  );
});

test("Pennsylvania publication receipt reloads its exact original public authorization", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-pa-precinct-publication-"));
  const authorizationPath =
    ".etl/production-authorizations/PA/pa-precinct-public-authorization.json";
  const receiptPath =
    ".etl/production-publication-receipts/PA/pa-precinct-publish-receipt.json";
  const authorization = publicAuthorization();
  const authorizationBytes = serializePennsylvaniaPublicationDocument(authorization);
  const authorizationSha256 = sha256(authorizationBytes);
  const plan = {
    ...authorizationPlan,
    hiddenLoad: authorizationPlan.hiddenLoad,
    blobPublication: authorizationPlan.blobPublication,
  };
  const receipt = {
    schemaVersion: 1,
    state: "PA",
    mode: "publish",
    decision: "PUBLISHED",
    activationId: authorization.activationId,
    approvedBy: authorization.approvedBy,
    releaseCandidate,
    publicationPlan: { id: plan.id, sha256: planSha256 },
    authorization: { path: authorizationPath, sha256: authorizationSha256 },
    hiddenLoad: plan.hiddenLoad,
    blobPublication: {
      ...plan.blobPublication,
      deliveryOrigin,
    },
    productionDeployment: authorization.productionDeployment,
    rollbackTarget,
    changedAtUtc: "2026-08-13T01:00:00.000Z",
    revision: 41,
    postconditions: {
      mode: "publish",
      status: "published",
      publicDeliveryAuthorized: true,
      geographyVersions: 2,
      crosswalks: 14_819,
      reportingUnits: 14_819,
      sourceDocuments: 4,
      importRuns: 2,
      resultRows: 44_457,
      invalidConstraints: 0,
    },
    productionMutationPerformed: true,
    publicDeliveryAuthorized: true,
  };
  for (const [relative, bytes] of [
    [authorizationPath, authorizationBytes],
    [receiptPath, serializePennsylvaniaPublicationDocument(receipt)],
  ]) {
    const absolute = path.resolve(root, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }
  const receiptBytes = readFileSync(path.resolve(root, ...receiptPath.split("/")));
  const inspected = inspectPennsylvaniaPublicationReceipt(root, {
    publicationReceiptPath: receiptPath,
    publicationReceiptSha256: sha256(receiptBytes),
    now: Date.parse("2026-08-13T01:10:00.000Z"),
  }, { plan, sha256: planSha256 });
  assert.equal(inspected.summary.activationId, authorization.activationId);

  const substituted = structuredClone(receipt);
  substituted.rollbackTarget.deploymentId = "dpl_substituted";
  const substitutedPath =
    ".etl/production-publication-receipts/PA/pa-precinct-substituted-receipt.json";
  const substitutedBytes = serializePennsylvaniaPublicationDocument(substituted);
  writeFileSync(
    path.resolve(root, ...substitutedPath.split("/")),
    substitutedBytes,
  );
  assert.throws(
    () => inspectPennsylvaniaPublicationReceipt(root, {
      publicationReceiptPath: substitutedPath,
      publicationReceiptSha256: sha256(substitutedBytes),
      now: Date.parse("2026-08-13T01:10:00.000Z"),
    }, { plan, sha256: planSha256 }),
    /incomplete or incompatible/,
  );
});

test("Pennsylvania Git verifier resolves both the live and rollback deployment trees", () => {
  const authorization = validatePennsylvaniaPublicationAuthorization(publicAuthorization(), {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  const outputs = new Map([
    ["rev-parse HEAD", authorization.productionDeployment.gitSha],
    ["rev-parse HEAD^{tree}", authorization.productionDeployment.gitTreeSha],
    [
      `rev-parse ${authorization.productionDeployment.gitSha}^{tree}`,
      authorization.productionDeployment.gitTreeSha,
    ],
    [
      `rev-parse ${authorization.rollbackTarget.gitSha}^{tree}`,
      authorization.rollbackTarget.gitTreeSha,
    ],
    ["status --porcelain --untracked-files=no", ""],
  ]);
  const runner = (_command, args) => outputs.get(args.join(" ")) + "\n";
  assert.equal(
    verifyPennsylvaniaPublicationGitCandidate(process.cwd(), authorization, runner)
      .trackedWorktreeClean,
    true,
  );
  outputs.set(
    `rev-parse ${authorization.rollbackTarget.gitSha}^{tree}`,
    "f".repeat(40),
  );
  assert.throws(
    () => verifyPennsylvaniaPublicationGitCandidate(process.cwd(), authorization, runner),
    /drifted/,
  );
});

function rollbackTransactionFixture() {
  const manifests = [2016, 2020].map((year, index) => ({
    year,
    manifestId: `pa-${year}-manifest`,
    publicManifestSha256: String(index + 3).repeat(64).slice(0, 64),
    blockedManifestSha256: String(index + 6).repeat(64).slice(0, 64),
    delivery: {
      format: "parent_scoped_geojson",
      featureCount: [9167, 9150][index],
      parentCount: 67,
      indexPath: `/data/geography/pa/${year}/precinct/index.json`,
    },
  }));
  const plan = {
    id: authorizationPlan.id,
    releaseCandidate,
    hiddenLoad: { databaseName: "neondb" },
    blobPublication: {
      sha256: "6".repeat(64),
      deliveryOrigin,
    },
    manifests,
  };
  const publicationReceipt = publicationSummary();
  const gisPlan = {
    years: manifests.map((manifest) => ({
      manifest: { validation: { errors: [`blocked ${manifest.year}`] } },
    })),
  };
  const versions = manifests.map((manifest, index) => {
    const previousCaveat = gisPlan.years[index].manifest.validation.errors.join(" ");
    return {
      id: `00000000-0000-0000-0000-00000000${index + 1}`,
      year: manifest.year,
      status: "published",
      caveat: "Reviewed Pennsylvania election-specific precinct geometry is publicly authorized under activation "
        + publicationReceipt.activationId + ".",
      metadata: {
        manifestId: manifest.manifestId,
        publicDeliveryAuthorized: true,
        releaseCandidate: {
          sha256: releaseCandidate.sha256,
          publicDeliveryAuthorized: true,
        },
        publicActivation: {
          activationId: publicationReceipt.activationId,
          activationCandidateSha256: planSha256,
          releasePackageSha256: releaseCandidate.sha256,
          blobPublicationSha256: plan.blobPublication.sha256,
          deliveryOrigin,
          authorizationSha256: publicationReceipt.authorizationSha256,
          rollbackTarget,
          mode: "publish",
          year: manifest.year,
          manifestId: manifest.manifestId,
          publicManifestSha256: manifest.publicManifestSha256,
          delivery: manifest.delivery,
          previousCaveat,
          changedAtUtc: publicationReceipt.changedAtUtc,
          revision: publicationReceipt.revision,
        },
      },
    };
  });
  const authorization = {
    activationId: "pa-rollback-camreyn",
    rollbackId: "pa-rollback-camreyn",
    publicationActivationId: publicationReceipt.activationId,
    approvedBy: "Camreyn",
    applicationRollback: { target: rollbackTarget },
  };
  return { plan, publicationReceipt, gisPlan, versions, authorization };
}

function rollbackClient(fixture) {
  let revision = 41;
  let reason = "Pennsylvania precinct unit geometry publish pa-precinct-public-camreyn";
  let versionUpdateCount = 0;
  const unsafe = async (statement, parameters = []) => {
    const sql = String(statement);
    if (sql.includes("current_database()")) {
      return [{ database_name: "neondb", transaction_read_only: "off" }];
    }
    if (sql.includes("set_config") || sql.includes("pg_advisory_xact_lock")) {
      return [];
    }
    if (sql.includes("for update") && sql.includes("public_data_revisions")) {
      return [{ revision }];
    }
    if (sql.includes("for update of gv")) return fixture.versions;
    if (sql.startsWith("update geography_versions")) {
      const row = fixture.versions.find((item) => item.id === parameters[0]);
      row.status = parameters[1];
      row.caveat = parameters[2];
      row.metadata.publicDeliveryAuthorized = JSON.parse(parameters[3]);
      row.metadata.releaseCandidate.publicDeliveryAuthorized = JSON.parse(parameters[3]);
      row.metadata.publicActivation = JSON.parse(parameters[4]);
      versionUpdateCount += 1;
      return [{ id: row.id }];
    }
    if (sql.startsWith("update reporting_unit_geometry_crosswalks")) {
      return Array.from({ length: 14_819 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update reporting_units")) {
      return Array.from({ length: 14_819 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update source_documents")) {
      return Array.from({ length: 4 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update import_runs")) {
      return Array.from({ length: 2 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update public_data_revisions")) {
      revision += 1;
      reason = parameters[0];
      return [{ revision }];
    }
    if (sql.includes("select e.year,gv.status")) return fixture.versions;
    if (sql.includes("from reporting_unit_geometry_crosswalks")) {
      assert.doesNotMatch(sql, /'reviewed_name'/);
      assert.match(sql, /'exact_official_id','official_crosswalk'/);
      assert.match(sql, /x\.geography_feature_id is not null/);
      assert.doesNotMatch(sql, /x\.geometry_feature_id/);
      return [{ total: 14_819, exact: 14_819 }];
    }
    if (sql.includes("from reporting_units where")) {
      return [{ total: 14_819, exact: 14_819 }];
    }
    if (sql.includes("from source_documents where")) {
      return [{ total: 4, exact: 4 }];
    }
    if (sql.includes("from import_runs where")) {
      return [{ total: 2, exact: 2 }];
    }
    if (sql.includes("from result_rows rr")) return [{ total: 44_457 }];
    if (sql.includes("from pg_constraint")) return [{ count: 0 }];
    if (sql.includes("from public_data_revisions")) return [{ revision, reason }];
    throw new Error("Unexpected Pennsylvania publication SQL: " + sql);
  };
  return { unsafe, get versionUpdateCount() { return versionUpdateCount; } };
}

test("Pennsylvania rollback atomically blocks database delivery and preserves publish audit", async () => {
  const fixture = rollbackTransactionFixture();
  const client = rollbackClient(fixture);
  const result = await applyPennsylvaniaGeographyPublicationTransaction(client, {
    mode: "rollback",
    plan: fixture.plan,
    planSha256,
    authorization: fixture.authorization,
    authorizationSha256: "c".repeat(64),
    publicationReceipt: fixture.publicationReceipt,
    changedAtUtc: "2026-08-13T01:30:00.000Z",
    gisPlan: fixture.gisPlan,
  });
  assert.equal(result.result, "ROLLED_BACK");
  assert.equal(result.publicDeliveryAuthorized, false);
  assert.equal(client.versionUpdateCount, 2);
  for (const [index, version] of fixture.versions.entries()) {
    assert.equal(version.status, "blocked");
    assert.equal(version.caveat, `blocked ${[2016, 2020][index]}`);
    assert.equal(version.metadata.publicDeliveryAuthorized, false);
    assert.equal(version.metadata.publicActivation.activationId, "pa-precinct-public-camreyn");
    assert.equal(
      version.metadata.publicActivation.rollback.rollbackId,
      "pa-rollback-camreyn",
    );
    assert.equal(
      version.metadata.publicActivation.rollback.publicationReceiptSha256,
      fixture.publicationReceipt.sha256,
    );
  }
});

test("Pennsylvania publication atomically records the pinned rollback target", async () => {
  const fixture = rollbackTransactionFixture();
  for (const [index, version] of fixture.versions.entries()) {
    version.status = "blocked";
    version.caveat = `blocked ${version.year}`;
    version.metadata = {
      manifestId: fixture.plan.manifests[index].manifestId,
      manifestSha256: fixture.plan.manifests[index].blockedManifestSha256,
      publicDeliveryAuthorized: false,
      releaseCandidate: {
        sha256: releaseCandidate.sha256,
        publicDeliveryAuthorized: false,
      },
    };
  }
  const authorization = validatePennsylvaniaPublicationAuthorization(publicAuthorization(), {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  const client = rollbackClient(fixture);
  const result = await applyPennsylvaniaGeographyPublicationTransaction(client, {
    mode: "publish",
    plan: fixture.plan,
    planSha256,
    authorization,
    authorizationSha256: "b".repeat(64),
    changedAtUtc: "2026-08-13T01:02:00.000Z",
    gisPlan: fixture.gisPlan,
    executionContext: {},
    validateCurrentDatabase: async () => ({ validated: true }),
  });
  assert.equal(result.result, "PUBLISHED");
  assert.equal(result.publicDeliveryAuthorized, true);
  assert.equal(client.versionUpdateCount, 2);
  for (const version of fixture.versions) {
    assert.equal(version.status, "published");
    assert.equal(version.metadata.publicDeliveryAuthorized, true);
    assert.equal(
      version.metadata.publicActivation.activationId,
      authorization.activationId,
    );
    assert.deepEqual(
      version.metadata.publicActivation.rollbackTarget,
      rollbackTarget,
    );
    assert.equal(
      Object.hasOwn(version.metadata.publicActivation, "rollback"),
      false,
    );
  }
});

test("Pennsylvania rollback transaction rejects a substituted live rollback target", async () => {
  const fixture = rollbackTransactionFixture();
  fixture.authorization.applicationRollback.target = {
    ...rollbackTarget,
    deploymentId: "dpl_substituted",
  };
  const client = rollbackClient(fixture);
  await assert.rejects(
    () => applyPennsylvaniaGeographyPublicationTransaction(client, {
      mode: "rollback",
      plan: fixture.plan,
      planSha256,
      authorization: fixture.authorization,
      authorizationSha256: "c".repeat(64),
      publicationReceipt: fixture.publicationReceipt,
      changedAtUtc: "2026-08-13T01:30:00.000Z",
      gisPlan: fixture.gisPlan,
    }),
    /drifted from the publication receipt/,
  );
  assert.equal(client.versionUpdateCount, 0);
});

test("Pennsylvania publication runner contains database-first rollback and read-only recovery guards", () => {
  const source = readFileSync(
    "scripts/publish-pa-precinct-geography-status.mjs",
    "utf8",
  );
  assert.match(source, /--rollback/);
  assert.match(source, /--publication-receipt-sha256/);
  assert.match(
    source,
    /I_ACKNOWLEDGE_DATABASE_FIRST_PENNSYLVANIA_PRECINCT_PUBLIC_ROLLBACK/,
  );
  assert.match(source, /sql\.begin\("read only"/);
  assert.match(source, /publicationReceiptSha256/);
  assert.match(source, /transactionBodyCompleted/);
  assert.match(source, /disposition === "created"/);
});

test("Pennsylvania publication receipt recovery requires both geography versions", () => {
  const versions = [2016, 2020].map((year) => ({ year }));
  assert.equal(assertPennsylvaniaPublicationRecoveryVersionSet(versions), versions);
  assert.throws(
    () => assertPennsylvaniaPublicationRecoveryVersionSet(versions.slice(0, 1)),
    /incomplete version set/,
  );
});

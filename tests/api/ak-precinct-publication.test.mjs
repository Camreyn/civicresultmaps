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
  ALASKA_PUBLICATION_SCOPES,
  ALASKA_PUBLIC_ROLLBACK_SCOPES,
  buildAlaskaPublicRollbackAuthorizationTemplate,
  buildAlaskaPublicationAuthorizationTemplate,
  serializeAlaskaPublicationDocument,
  sha256,
  validateAlaskaBlobPublicationEvidence,
  validateAlaskaPublicRollbackAuthorization,
  validateAlaskaPublicationAuthorization,
} from "../../scripts/lib/ak-precinct-publication.mjs";
import {
  applyAlaskaGeographyPublicationTransaction,
  inspectAlaskaPublicationReceipt,
  verifyAlaskaPublicationGitCandidate,
} from "../../scripts/publish-ak-precinct-geography-status.mjs";
const deliveryOrigin = "https://example.public.blob.vercel-storage.com";
const blobReleaseCandidate = {
  id: "ak-precinct-gis-four-election-v1",
  path: ".etl/precinct-release-candidates/AK/example/release-candidate.json",
  sha256: "d".repeat(64),
};
const blobArtifacts = Array.from({ length: 164 }, (_, index) => {
  const year = [2012, 2016, 2020, 2024][Math.min(3, Math.floor(index / 41))];
  const kind = index % 41 === 40 ? "index" : "parent";
  return {
    kind,
    year,
    packageRelativePath: `delivery-assets/${year}/file-${index}.json`,
    publicUrl: `/data/geography/ak/${year}/precinct/file-${index}.json`,
    pathname: `data/geography/ak/${year}/precinct/file-${index}.json`,
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
  state: "AK",
  purpose: "ak-precinct-parent-scoped-immutable-geometry-publication",
  releaseCandidate: blobReleaseCandidate,
  authorizationId: "ak-blob-publication-1",
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
  id: "ak-precinct-gis-four-election-v1",
  path: ".etl/precinct-release-candidates/AK/example/release-candidate.json",
  sha256: "1".repeat(64),
};
const planSha256 = "2".repeat(64);
const rollbackTarget = {
  deploymentId: "dpl_alaska_previous",
  url: "https://previous.civicresultmaps.org",
  gitSha: "3".repeat(40),
  gitTreeSha: "4".repeat(40),
  verifiedAtUtc: "2026-08-13T00:30:00.000Z",
  gateCapableVerified: true,
  blockedResultGateVerified: true,
  blockedGeometryGateVerified: true,
};
const authorizationPlan = {
  id: "ak-precinct-database-publication-v1",
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
  const value = buildAlaskaPublicationAuthorizationTemplate(
    authorizationPlan,
    planSha256,
  );
  Object.assign(value, {
    decision: "GO_PUBLIC",
    activationId: "ak-precinct-public-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T00:50:00.000Z",
    expiresAtUtc: "2026-08-13T02:00:00.000Z",
  });
  Object.assign(value.productionDeployment, {
    deploymentId: "dpl_alaska_public",
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
    path: ".etl/production-publication-receipts/AK/ak-precinct-publish.json",
    sha256: "a".repeat(64),
    activationId: "ak-precinct-public-camreyn",
    authorizationSha256: "b".repeat(64),
    revision: 41,
    changedAtUtc: "2026-08-13T01:00:00.000Z",
    rollbackTarget,
    productionDeployment: publicAuthorization().productionDeployment,
  };
}

test("Alaska Blob evidence requires all 164 immutable artifacts", () => {
  const result = validateAlaskaBlobPublicationEvidence(
    evidence,
    blobPlan,
    Date.parse("2026-08-13T00:01:00.000Z"),
  );
  assert.equal(result.assetCount, 164);
  assert.equal(result.deliveryOrigin, deliveryOrigin);
  const incomplete = { ...evidence, assetCount: 163 };
  assert.throws(
    () => validateAlaskaBlobPublicationEvidence(incomplete, blobPlan),
    /incomplete or incompatible/,
  );
});

test("Alaska public authorization pins production and rollback deployment trees", () => {
  const value = publicAuthorization();
  const checked = validateAlaskaPublicationAuthorization(value, {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  assert.equal(checked.approvedBy, "Camreyn");
  assert.deepEqual(value.scopes, ALASKA_PUBLICATION_SCOPES);
  assert.deepEqual(checked.rollbackTarget, rollbackTarget);

  const sameTree = structuredClone(value);
  sameTree.rollbackTarget.gitTreeSha = value.productionDeployment.gitTreeSha;
  assert.throws(
    () => validateAlaskaPublicationAuthorization(sameTree, {
      plan: authorizationPlan,
      planSha256,
      now: Date.parse("2026-08-13T01:01:00.000Z"),
    }),
    /incompatible/,
  );
});

test("Alaska rollback authorization is bound to the exact publication receipt", () => {
  const receipt = publicationSummary();
  const value = buildAlaskaPublicRollbackAuthorizationTemplate(
    authorizationPlan,
    planSha256,
    receipt,
  );
  Object.assign(value, {
    decision: "GO_ROLLBACK",
    rollbackId: "ak-rollback-camreyn",
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
  const checked = validateAlaskaPublicRollbackAuthorization(value, {
    plan: authorizationPlan,
    planSha256,
    publicationReceipt: receipt,
    now: Date.parse("2026-08-13T01:20:00.000Z"),
  });
  assert.equal(checked.rollbackId, "ak-rollback-camreyn");
  assert.deepEqual(value.scopes, ALASKA_PUBLIC_ROLLBACK_SCOPES);

  const substituted = structuredClone(value);
  substituted.applicationRollback.target.deploymentId = "dpl_substituted";
  assert.throws(
    () => validateAlaskaPublicRollbackAuthorization(substituted, {
      plan: authorizationPlan,
      planSha256,
      publicationReceipt: receipt,
      now: Date.parse("2026-08-13T01:20:00.000Z"),
    }),
    /incompatible/,
  );
});

test("Alaska publication receipt reloads its exact original public authorization", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-ak-precinct-publication-"));
  const authorizationPath =
    ".etl/production-authorizations/AK/ak-precinct-public-authorization.json";
  const receiptPath =
    ".etl/production-publication-receipts/AK/ak-precinct-publish-receipt.json";
  const authorization = publicAuthorization();
  const authorizationBytes = serializeAlaskaPublicationDocument(authorization);
  const authorizationSha256 = sha256(authorizationBytes);
  const plan = {
    ...authorizationPlan,
    hiddenLoad: authorizationPlan.hiddenLoad,
    blobPublication: authorizationPlan.blobPublication,
  };
  const receipt = {
    schemaVersion: 1,
    state: "AK",
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
      geographyVersions: 4,
      crosswalks: 2_205,
      reportingUnits: 2_205,
      sourceDocuments: 8,
      importRuns: 4,
      resultRows: 12_021,
      invalidConstraints: 0,
    },
    productionMutationPerformed: true,
    publicDeliveryAuthorized: true,
  };
  for (const [relative, bytes] of [
    [authorizationPath, authorizationBytes],
    [receiptPath, serializeAlaskaPublicationDocument(receipt)],
  ]) {
    const absolute = path.resolve(root, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }
  const receiptBytes = readFileSync(path.resolve(root, ...receiptPath.split("/")));
  const inspected = inspectAlaskaPublicationReceipt(root, {
    publicationReceiptPath: receiptPath,
    publicationReceiptSha256: sha256(receiptBytes),
    now: Date.parse("2026-08-13T01:10:00.000Z"),
  }, { plan, sha256: planSha256 });
  assert.equal(inspected.summary.activationId, authorization.activationId);

  const substituted = structuredClone(receipt);
  substituted.rollbackTarget.deploymentId = "dpl_substituted";
  const substitutedPath =
    ".etl/production-publication-receipts/AK/ak-precinct-substituted-receipt.json";
  const substitutedBytes = serializeAlaskaPublicationDocument(substituted);
  writeFileSync(
    path.resolve(root, ...substitutedPath.split("/")),
    substitutedBytes,
  );
  assert.throws(
    () => inspectAlaskaPublicationReceipt(root, {
      publicationReceiptPath: substitutedPath,
      publicationReceiptSha256: sha256(substitutedBytes),
      now: Date.parse("2026-08-13T01:10:00.000Z"),
    }, { plan, sha256: planSha256 }),
    /incomplete or incompatible/,
  );
});

test("Alaska Git verifier resolves both the live and rollback deployment trees", () => {
  const authorization = validateAlaskaPublicationAuthorization(publicAuthorization(), {
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
    verifyAlaskaPublicationGitCandidate(process.cwd(), authorization, runner)
      .trackedWorktreeClean,
    true,
  );
  outputs.set(
    `rev-parse ${authorization.rollbackTarget.gitSha}^{tree}`,
    "f".repeat(40),
  );
  assert.throws(
    () => verifyAlaskaPublicationGitCandidate(process.cwd(), authorization, runner),
    /drifted/,
  );
});

function rollbackTransactionFixture() {
  const manifests = [2012, 2016, 2020, 2024].map((year, index) => ({
    year,
    manifestId: `ak-${year}-manifest`,
    publicManifestSha256: String(index + 3).repeat(64).slice(0, 64),
    blockedManifestSha256: String(index + 6).repeat(64).slice(0, 64),
    delivery: {
      format: "parent_scoped_geojson",
      featureCount: [438, 441, 441, 402][index],
      parentCount: 40,
      indexPath: `/data/geography/ak/${year}/precinct/index.json`,
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
      caveat: "Reviewed Alaska election-specific precinct geometry is publicly authorized under activation "
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
    activationId: "ak-rollback-camreyn",
    rollbackId: "ak-rollback-camreyn",
    publicationActivationId: publicationReceipt.activationId,
    approvedBy: "Camreyn",
    applicationRollback: { target: rollbackTarget },
  };
  return { plan, publicationReceipt, gisPlan, versions, authorization };
}

function rollbackClient(fixture) {
  let revision = 41;
  let reason = "Alaska precinct unit geometry publish ak-precinct-public-camreyn";
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
      return Array.from({ length: 2_205 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update reporting_units")) {
      return Array.from({ length: 2_205 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update source_documents")) {
      return Array.from({ length: 8 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update import_runs")) {
      return Array.from({ length: 4 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update public_data_revisions")) {
      revision += 1;
      reason = parameters[0];
      return [{ revision }];
    }
    if (sql.includes("select e.year,gv.status")) return fixture.versions;
    if (sql.includes("from reporting_unit_geometry_crosswalks")) {
      assert.match(sql, /x\.match_method in \('exact_official_id','official_crosswalk'\)/);
      assert.match(sql, /x\.geography_feature_id is not null/);
      assert.doesNotMatch(sql, /x\.geometry_feature_id/);
      return [{ total: 2_205, exact: 2_205 }];
    }
    if (sql.includes("from reporting_units where")) {
      return [{ total: 2_205, exact: 2_205 }];
    }
    if (sql.includes("from source_documents where")) {
      return [{ total: 8, exact: 8 }];
    }
    if (sql.includes("from import_runs where")) {
      return [{ total: 4, exact: 4 }];
    }
    if (sql.includes("from result_rows rr")) return [{ total: 12_021 }];
    if (sql.includes("from pg_constraint")) return [{ count: 0 }];
    if (sql.includes("from public_data_revisions")) return [{ revision, reason }];
    throw new Error("Unexpected Alaska publication SQL: " + sql);
  };
  return { unsafe, get versionUpdateCount() { return versionUpdateCount; } };
}

test("Alaska rollback atomically blocks database delivery and preserves publish audit", async () => {
  const fixture = rollbackTransactionFixture();
  const client = rollbackClient(fixture);
  const result = await applyAlaskaGeographyPublicationTransaction(client, {
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
  assert.equal(client.versionUpdateCount, 4);
  for (const [index, version] of fixture.versions.entries()) {
    assert.equal(version.status, "blocked");
    assert.equal(version.caveat, `blocked ${[2012, 2016, 2020, 2024][index]}`);
    assert.equal(version.metadata.publicDeliveryAuthorized, false);
    assert.equal(version.metadata.publicActivation.activationId, "ak-precinct-public-camreyn");
    assert.equal(
      version.metadata.publicActivation.rollback.rollbackId,
      "ak-rollback-camreyn",
    );
    assert.equal(
      version.metadata.publicActivation.rollback.publicationReceiptSha256,
      fixture.publicationReceipt.sha256,
    );
  }
});

test("Alaska publication atomically records the pinned rollback target", async () => {
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
  const authorization = validateAlaskaPublicationAuthorization(publicAuthorization(), {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  const client = rollbackClient(fixture);
  const result = await applyAlaskaGeographyPublicationTransaction(client, {
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
  assert.equal(client.versionUpdateCount, 4);
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

test("Alaska rollback transaction rejects a substituted live rollback target", async () => {
  const fixture = rollbackTransactionFixture();
  fixture.authorization.applicationRollback.target = {
    ...rollbackTarget,
    deploymentId: "dpl_substituted",
  };
  const client = rollbackClient(fixture);
  await assert.rejects(
    () => applyAlaskaGeographyPublicationTransaction(client, {
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

test("Alaska publication runner contains database-first rollback and read-only recovery guards", () => {
  const source = readFileSync(
    "scripts/publish-ak-precinct-geography-status.mjs",
    "utf8",
  );
  assert.match(source, /--rollback/);
  assert.match(source, /--publication-receipt-sha256/);
  assert.match(
    source,
    /I_ACKNOWLEDGE_DATABASE_FIRST_ALASKA_PRECINCT_PUBLIC_ROLLBACK/,
  );
  assert.match(source, /sql\.begin\("read only"/);
  assert.match(source, /publicationReceiptSha256/);
  assert.match(source, /transactionBodyCompleted/);
  assert.match(source, /disposition === "created"/);
});

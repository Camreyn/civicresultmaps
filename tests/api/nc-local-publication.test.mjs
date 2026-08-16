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
  NORTH_CAROLINA_PUBLICATION_SCOPES,
  NORTH_CAROLINA_PUBLIC_ROLLBACK_SCOPES,
  buildNorthCarolinaPublicRollbackAuthorizationTemplate,
  buildNorthCarolinaPublicationAuthorizationTemplate,
  serializeNorthCarolinaPublicationDocument,
  sha256,
  validateNorthCarolinaBlobPublicationEvidence,
  validateNorthCarolinaPublicRollbackAuthorization,
  validateNorthCarolinaPublicationAuthorization,
} from "../../scripts/lib/nc-local-publication.mjs";
import {
  applyNorthCarolinaGeographyPublicationTransaction,
  assertNorthCarolinaPublicationRecoveryVersionSet,
  inspectNorthCarolinaPublicationReceipt,
  verifyNorthCarolinaPublicationGitCandidate,
} from "../../scripts/publish-nc-local-geography-status.mjs";
const deliveryOrigin = "https://example.public.blob.vercel-storage.com";
const blobReleaseCandidate = {
  id: "nc-local-gis-three-election-v1",
  path: ".etl/precinct-release-candidates/NC/example/release-candidate.json",
  sha256: "d".repeat(64),
};
const blobArtifacts = Array.from({ length: 303 }, (_, index) => {
  const year = [2012, 2016, 2020][Math.min(2, Math.floor(index / 101))];
  const level = year === 2012 ? "vtd" : "precinct";
  const kind = index % 101 === 100 ? "index" : "parent";
  return {
    kind,
    year,
    packageRelativePath: `delivery-assets/${year}/file-${index}.json`,
    publicUrl: `/data/geography/nc/${year}/${level}/file-${index}.json`,
    pathname: `data/geography/nc/${year}/${level}/file-${index}.json`,
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
  state: "NC",
  purpose: "nc-local-parent-scoped-immutable-geometry-publication",
  releaseCandidate: blobReleaseCandidate,
  authorizationId: "nc-blob-publication-1",
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
  id: "nc-local-gis-three-election-v1",
  path: ".etl/precinct-release-candidates/NC/example/release-candidate.json",
  sha256: "1".repeat(64),
};
const planSha256 = "2".repeat(64);
const rollbackTarget = {
  deploymentId: "dpl_northCarolina_previous",
  url: "https://previous.civicresultmaps.org",
  gitSha: "3".repeat(40),
  gitTreeSha: "4".repeat(40),
  verifiedAtUtc: "2026-08-13T00:30:00.000Z",
  gateCapableVerified: true,
  blockedResultGateVerified: true,
  blockedGeometryGateVerified: true,
};
const authorizationPlan = {
  id: "nc-local-database-publication-v1",
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
  const value = buildNorthCarolinaPublicationAuthorizationTemplate(
    authorizationPlan,
    planSha256,
  );
  Object.assign(value, {
    decision: "GO_PUBLIC",
    activationId: "nc-local-public-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T00:50:00.000Z",
    expiresAtUtc: "2026-08-13T02:00:00.000Z",
  });
  Object.assign(value.productionDeployment, {
    deploymentId: "dpl_northCarolina_public",
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
    path: ".etl/production-publication-receipts/NC/nc-local-publish.json",
    sha256: "a".repeat(64),
    activationId: "nc-local-public-camreyn",
    authorizationSha256: "b".repeat(64),
    revision: 41,
    changedAtUtc: "2026-08-13T01:00:00.000Z",
    rollbackTarget,
    productionDeployment: publicAuthorization().productionDeployment,
  };
}

test("North Carolina Blob evidence requires all 303 immutable artifacts", () => {
  const result = validateNorthCarolinaBlobPublicationEvidence(
    evidence,
    blobPlan,
    Date.parse("2026-08-13T00:01:00.000Z"),
  );
  assert.equal(result.assetCount, 303);
  assert.equal(result.deliveryOrigin, deliveryOrigin);
  const incomplete = { ...evidence, assetCount: 302 };
  assert.throws(
    () => validateNorthCarolinaBlobPublicationEvidence(incomplete, blobPlan),
    /incomplete or incompatible/,
  );
});

test("North Carolina public authorization pins production and rollback deployment trees", () => {
  const value = publicAuthorization();
  const checked = validateNorthCarolinaPublicationAuthorization(value, {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  assert.equal(checked.approvedBy, "Camreyn");
  assert.deepEqual(value.scopes, NORTH_CAROLINA_PUBLICATION_SCOPES);
  assert.deepEqual(checked.rollbackTarget, rollbackTarget);

  const sameTree = structuredClone(value);
  sameTree.rollbackTarget.gitTreeSha = value.productionDeployment.gitTreeSha;
  assert.throws(
    () => validateNorthCarolinaPublicationAuthorization(sameTree, {
      plan: authorizationPlan,
      planSha256,
      now: Date.parse("2026-08-13T01:01:00.000Z"),
    }),
    /incompatible/,
  );
});

test("North Carolina rollback authorization is bound to the exact publication receipt", () => {
  const receipt = publicationSummary();
  const value = buildNorthCarolinaPublicRollbackAuthorizationTemplate(
    authorizationPlan,
    planSha256,
    receipt,
  );
  Object.assign(value, {
    decision: "GO_ROLLBACK",
    rollbackId: "nc-rollback-camreyn",
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
  const checked = validateNorthCarolinaPublicRollbackAuthorization(value, {
    plan: authorizationPlan,
    planSha256,
    publicationReceipt: receipt,
    now: Date.parse("2026-08-13T01:20:00.000Z"),
  });
  assert.equal(checked.rollbackId, "nc-rollback-camreyn");
  assert.deepEqual(value.scopes, NORTH_CAROLINA_PUBLIC_ROLLBACK_SCOPES);

  const substituted = structuredClone(value);
  substituted.applicationRollback.target.deploymentId = "dpl_substituted";
  assert.throws(
    () => validateNorthCarolinaPublicRollbackAuthorization(substituted, {
      plan: authorizationPlan,
      planSha256,
      publicationReceipt: receipt,
      now: Date.parse("2026-08-13T01:20:00.000Z"),
    }),
    /incompatible/,
  );
});

test("North Carolina publication receipt reloads its exact original public authorization", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-nc-local-publication-"));
  const authorizationPath =
    ".etl/production-authorizations/NC/nc-local-public-authorization.json";
  const receiptPath =
    ".etl/production-publication-receipts/NC/nc-local-publish-receipt.json";
  const authorization = publicAuthorization();
  const authorizationBytes = serializeNorthCarolinaPublicationDocument(authorization);
  const authorizationSha256 = sha256(authorizationBytes);
  const plan = {
    ...authorizationPlan,
    hiddenLoad: authorizationPlan.hiddenLoad,
    blobPublication: authorizationPlan.blobPublication,
  };
  const receipt = {
    schemaVersion: 1,
    state: "NC",
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
      geographyVersions: 3,
      crosswalks: 9_285,
      reportingUnits: 9_285,
      sourceDocuments: 6,
      importRuns: 3,
      resultRows: 24_174,
      invalidConstraints: 0,
    },
    productionMutationPerformed: true,
    publicDeliveryAuthorized: true,
  };
  for (const [relative, bytes] of [
    [authorizationPath, authorizationBytes],
    [receiptPath, serializeNorthCarolinaPublicationDocument(receipt)],
  ]) {
    const absolute = path.resolve(root, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }
  const receiptBytes = readFileSync(path.resolve(root, ...receiptPath.split("/")));
  const inspected = inspectNorthCarolinaPublicationReceipt(root, {
    publicationReceiptPath: receiptPath,
    publicationReceiptSha256: sha256(receiptBytes),
    now: Date.parse("2026-08-13T01:10:00.000Z"),
  }, { plan, sha256: planSha256 });
  assert.equal(inspected.summary.activationId, authorization.activationId);

  const substituted = structuredClone(receipt);
  substituted.rollbackTarget.deploymentId = "dpl_substituted";
  const substitutedPath =
    ".etl/production-publication-receipts/NC/nc-local-substituted-receipt.json";
  const substitutedBytes = serializeNorthCarolinaPublicationDocument(substituted);
  writeFileSync(
    path.resolve(root, ...substitutedPath.split("/")),
    substitutedBytes,
  );
  assert.throws(
    () => inspectNorthCarolinaPublicationReceipt(root, {
      publicationReceiptPath: substitutedPath,
      publicationReceiptSha256: sha256(substitutedBytes),
      now: Date.parse("2026-08-13T01:10:00.000Z"),
    }, { plan, sha256: planSha256 }),
    /incomplete or incompatible/,
  );
});

test("North Carolina Git verifier resolves both the live and rollback deployment trees", () => {
  const authorization = validateNorthCarolinaPublicationAuthorization(publicAuthorization(), {
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
    verifyNorthCarolinaPublicationGitCandidate(process.cwd(), authorization, runner)
      .trackedWorktreeClean,
    true,
  );
  outputs.set(
    `rev-parse ${authorization.rollbackTarget.gitSha}^{tree}`,
    "f".repeat(40),
  );
  assert.throws(
    () => verifyNorthCarolinaPublicationGitCandidate(process.cwd(), authorization, runner),
    /drifted/,
  );
});

function rollbackTransactionFixture() {
  const manifests = [2012, 2016, 2020].map((year, index) => ({
    year,
    geographyLevel: year === 2012 ? "vtd" : "precinct",
    manifestId: `nc-${year}-manifest`,
    publicManifestSha256: String(index + 3).repeat(64).slice(0, 64),
    blockedManifestSha256: String(index + 6).repeat(64).slice(0, 64),
    delivery: {
      format: "parent_scoped_geojson",
      featureCount: [2692, 2704, 2662][index],
      parentCount: 100,
      indexPath: `/data/geography/nc/${year}/${year === 2012 ? "vtd" : "precinct"}/index.json`,
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
      geography_type: manifest.geographyLevel,
      status: "published",
      caveat: "Reviewed North Carolina election-specific local geometry is publicly authorized under activation "
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
          geographyLevel: manifest.geographyLevel,
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
    activationId: "nc-rollback-camreyn",
    rollbackId: "nc-rollback-camreyn",
    publicationActivationId: publicationReceipt.activationId,
    approvedBy: "Camreyn",
    applicationRollback: { target: rollbackTarget },
  };
  return { plan, publicationReceipt, gisPlan, versions, authorization };
}

function rollbackClient(fixture) {
  let revision = 41;
  let reason = "North Carolina local geography unit geometry publish nc-local-public-camreyn";
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
      return Array.from({ length: 9_285 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update reporting_units")) {
      return Array.from({ length: 9_285 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update source_documents")) {
      return Array.from({ length: 6 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update import_runs")) {
      return Array.from({ length: 3 }, (_, id) => ({ id }));
    }
    if (sql.startsWith("update public_data_revisions")) {
      revision += 1;
      reason = parameters[0];
      return [{ revision }];
    }
    if (sql.includes("select e.year,gv.geography_type")) return fixture.versions;
    if (sql.includes("from reporting_unit_geometry_crosswalks")) {
      assert.doesNotMatch(sql, /'reviewed_name'/);
      assert.match(sql, /x\.match_method='exact_official_id'/);
      assert.match(sql, /x\.geography_feature_id is not null/);
      assert.doesNotMatch(sql, /x\.geometry_feature_id/);
      return [{ total: 9_285, exact: 9_285 }];
    }
    if (sql.includes("from reporting_units where")) {
      return [{ total: 9_285, exact: 9_285 }];
    }
    if (sql.includes("from source_documents where")) {
      return [{ total: 6, exact: 6 }];
    }
    if (sql.includes("from import_runs where")) {
      return [{ total: 3, exact: 3 }];
    }
    if (sql.includes("from result_rows rr")) return [{ total: 24_174 }];
    if (sql.includes("from pg_constraint")) return [{ count: 0 }];
    if (sql.includes("from public_data_revisions")) return [{ revision, reason }];
    throw new Error("Unexpected North Carolina publication SQL: " + sql);
  };
  return { unsafe, get versionUpdateCount() { return versionUpdateCount; } };
}

test("North Carolina rollback atomically blocks database delivery and preserves publish audit", async () => {
  const fixture = rollbackTransactionFixture();
  const client = rollbackClient(fixture);
  const result = await applyNorthCarolinaGeographyPublicationTransaction(client, {
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
  assert.equal(client.versionUpdateCount, 3);
  for (const [index, version] of fixture.versions.entries()) {
    assert.equal(version.status, "blocked");
    assert.equal(version.caveat, `blocked ${[2012, 2016, 2020][index]}`);
    assert.equal(version.metadata.publicDeliveryAuthorized, false);
    assert.equal(version.metadata.publicActivation.activationId, "nc-local-public-camreyn");
    assert.equal(
      version.metadata.publicActivation.rollback.rollbackId,
      "nc-rollback-camreyn",
    );
    assert.equal(
      version.metadata.publicActivation.rollback.publicationReceiptSha256,
      fixture.publicationReceipt.sha256,
    );
  }
});

test("North Carolina publication atomically records the pinned rollback target", async () => {
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
  const authorization = validateNorthCarolinaPublicationAuthorization(publicAuthorization(), {
    plan: authorizationPlan,
    planSha256,
    now: Date.parse("2026-08-13T01:01:00.000Z"),
  });
  const client = rollbackClient(fixture);
  const result = await applyNorthCarolinaGeographyPublicationTransaction(client, {
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
  assert.equal(client.versionUpdateCount, 3);
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

test("North Carolina rollback transaction rejects a substituted live rollback target", async () => {
  const fixture = rollbackTransactionFixture();
  fixture.authorization.applicationRollback.target = {
    ...rollbackTarget,
    deploymentId: "dpl_substituted",
  };
  const client = rollbackClient(fixture);
  await assert.rejects(
    () => applyNorthCarolinaGeographyPublicationTransaction(client, {
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

test("North Carolina publication runner contains database-first rollback and read-only recovery guards", () => {
  const source = readFileSync(
    "scripts/publish-nc-local-geography-status.mjs",
    "utf8",
  );
  assert.match(source, /--rollback/);
  assert.match(source, /--publication-receipt-sha256/);
  assert.match(
    source,
    /I_ACKNOWLEDGE_DATABASE_FIRST_NORTH_CAROLINA_LOCAL_PUBLIC_ROLLBACK/,
  );
  assert.match(source, /sql\.begin\("read only"/);
  assert.match(source, /publicationReceiptSha256/);
  assert.match(source, /transactionBodyCompleted/);
  assert.match(source, /disposition === "created"/);
});

test("North Carolina publication receipt recovery requires all three geography versions", () => {
  const versions = [2012, 2016, 2020].map((year) => ({ year }));
  assert.equal(assertNorthCarolinaPublicationRecoveryVersionSet(versions), versions);
  assert.throws(
    () => assertNorthCarolinaPublicationRecoveryVersionSet(versions.slice(0, 2)),
    /incomplete version set/,
  );
});

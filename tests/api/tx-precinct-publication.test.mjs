import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TEXAS_PUBLICATION_SCOPES,
  buildTexasPublicationAuthorizationTemplate,
  validateTexasBlobPublicationEvidence,
  validateTexasHiddenLoadReceipt,
  validateTexasPublicationAuthorization,
} from "../../scripts/lib/tx-precinct-publication.mjs";

const releaseCandidate = {
  id: "tx-precinct-gis-four-election-v1",
  path: ".etl/precinct-release-candidates/TX/example/release-candidate.json",
  sha256: "1".repeat(64),
};
const endpointFingerprint = "2".repeat(64);
const committedAtUtc = "2026-08-11T03:00:00.000Z";
const audit = {
  releasePackage: { path: releaseCandidate.path, sha256: releaseCandidate.sha256 },
  authorization: {
    path: ".etl/production-authorizations/TX/hidden.json",
    sha256: "3".repeat(64),
  },
  preflight: {
    path: ".etl/production-preflight-candidates/TX/preflight.json",
    sha256: "4".repeat(64),
  },
  backupManifest: { sha256: "5".repeat(64), dumpSha256: "6".repeat(64) },
  authorizationId: "tx-hidden-camreyn",
  endpointFingerprint,
  transaction: { executedAtUtc: committedAtUtc, publicRevision: 31 },
};
const yearRows = [
  [2012, 8952, 26856, 278],
  [2016, 8941, 26823, 285],
  [2020, 9157, 27471, 353],
  [2024, 9712, 29136, 364],
].map(([year, units, rows, zero]) => ({
  year,
  reportingUnits: units,
  resultRows: rows,
  features: units,
  exactCrosswalks: units,
  zeroVoteUnits: zero,
}));

function hiddenReceipt() {
  return {
    schemaVersion: 1,
    state: "TX",
    decision: "COMMITTED_HIDDEN_NOT_PUBLIC",
    releaseCandidate,
    committedAtUtc,
    endpointFingerprint,
    authorization: {
      id: audit.authorizationId,
      path: audit.authorization.path,
      sha256: audit.authorization.sha256,
    },
    preflight: { path: audit.preflight.path, sha256: audit.preflight.sha256 },
    backup: {
      manifestSha256: audit.backupManifest.sha256,
      dumpSha256: audit.backupManifest.dumpSha256,
    },
    transaction: {
      database: { name: "neondb" },
      productionMutationPerformed: true,
      publicDeliveryAuthorized: false,
      revision: 31,
      productionReleaseAudit: audit,
    },
    validation: {
      database: { name: "neondb" },
      productionMutationPerformed: true,
      publicDeliveryAuthorized: false,
      revision: 31,
      releaseCandidate: {
        id: releaseCandidate.id,
        sha256: releaseCandidate.sha256,
        publicDeliveryAuthorized: false,
      },
      productionReleaseAudit: audit,
      years: yearRows,
    },
    productionMutationPerformed: true,
    canonicalManifestChanged: false,
    publicFileWritten: false,
    publicDeliveryAuthorized: false,
  };
}

test("Texas publication accepts only the exact hidden-load audit and totals", () => {
  const value = hiddenReceipt();
  const inspected = validateTexasHiddenLoadReceipt(value, {
    now: Date.parse("2026-08-11T04:00:00.000Z"),
    releaseCandidate,
  });
  assert.equal(inspected.databaseName, "neondb");
  assert.equal(inspected.totals.reportingUnits, 36_762);
  assert.equal(inspected.totals.candidateResultRows, 110_286);
  const recovered = structuredClone(value);
  recovered.recovery = {
    recoveredAtUtc: "2026-08-11T03:30:00.000Z",
    productionMutationPerformed: false,
  };
  assert.equal(
    validateTexasHiddenLoadReceipt(recovered, {
      now: Date.parse("2026-08-11T04:00:00.000Z"),
      releaseCandidate,
    }).hiddenRevision,
    31,
  );
  const tampered = structuredClone(value);
  tampered.validation.years[3].reportingUnits -= 1;
  assert.throws(
    () => validateTexasHiddenLoadReceipt(tampered, {
      now: Date.parse("2026-08-11T04:00:00.000Z"),
      releaseCandidate,
    }),
    /total drifted/,
  );
});

test("Texas Blob evidence must cover all 1,020 exact immutable objects", () => {
  const origin = "https://crm-public.public.blob.vercel-storage.com";
  const artifacts = Array.from({ length: 1020 }, (_, index) => ({
    kind: index >= 1016 ? "index" : "parent",
    year: [2012, 2016, 2020, 2024][Math.min(3, Math.floor(index / 254))],
    packageRelativePath: "delivery-assets/file-" + index + ".json",
    publicUrl: "/data/geography/tx/file-" + index + ".json",
    pathname: "data/geography/tx/file-" + index + ".json",
    byteCount: 100 + index,
    sha256: index.toString(16).padStart(64, "0"),
  }));
  const blobPlan = { releaseCandidate, artifacts };
  const evidence = {
    schemaVersion: 1,
    state: "TX",
    purpose: "tx-precinct-parent-scoped-immutable-geometry-publication",
    publishedAtUtc: "2026-08-11T03:30:00.000Z",
    authorizationId: "tx-blob-camreyn",
    releaseCandidate,
    deliveryOrigin: origin,
    assetCount: 1020,
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      url: origin + "/" + artifact.pathname,
      disposition: "created",
    })),
  };
  assert.equal(
    validateTexasBlobPublicationEvidence(
      evidence,
      blobPlan,
      Date.parse("2026-08-11T04:00:00.000Z"),
    ).assetCount,
    1020,
  );
  evidence.artifacts[0].sha256 = "f".repeat(64);
  assert.throws(
    () => validateTexasBlobPublicationEvidence(
      evidence,
      blobPlan,
      Date.parse("2026-08-11T04:00:00.000Z"),
    ),
    /artifact set drifted/,
  );
});

test("Texas sole-owner public authorization pins deployment and evidence", () => {
  const plan = {
    id: "tx-precinct-database-publication-v1",
    releaseCandidate,
    hiddenLoad: { path: "hidden.json", sha256: "7".repeat(64) },
    blobPublication: {
      path: "blob.json",
      sha256: "8".repeat(64),
      deliveryOrigin: "https://crm-public.public.blob.vercel-storage.com",
    },
    staticRegistry: { sha256: "9".repeat(64) },
  };
  const planSha256 = "a".repeat(64);
  const value = buildTexasPublicationAuthorizationTemplate(plan, planSha256);
  Object.assign(value, {
    decision: "GO_PUBLIC",
    activationId: "tx-public-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-11T03:50:00.000Z",
    expiresAtUtc: "2026-08-11T04:30:00.000Z",
  });
  Object.assign(value.productionDeployment, {
    deploymentId: "dpl_texas",
    url: "https://civicresultmaps.org",
    gitSha: "b".repeat(40),
    readyVerified: true,
    promotedVerified: true,
    blockedResultGateVerified: true,
    blockedGeometryGateVerified: true,
    verifiedAtUtc: "2026-08-11T03:45:00.000Z",
  });
  const result = validateTexasPublicationAuthorization(value, {
    plan,
    planSha256,
    now: Date.parse("2026-08-11T04:00:00.000Z"),
  });
  assert.equal(result.approvedBy, "Camreyn");
  assert.deepEqual(value.scopes, TEXAS_PUBLICATION_SCOPES);
  value.productionDeployment.staticRegistrySha256 = "c".repeat(64);
  assert.throws(
    () => validateTexasPublicationAuthorization(value, {
      plan,
      planSha256,
      now: Date.parse("2026-08-11T04:00:00.000Z"),
    }),
    /incompatible/,
  );
});

test("Texas public cutover remains one guarded transaction", () => {
  const source = readFileSync(
    "scripts/publish-tx-precinct-geography-status.mjs",
    "utf8",
  );
  assert.match(source, /I_ACKNOWLEDGE_ATOMIC_TEXAS_PRECINCT_PUBLIC_CUTOVER/);
  assert.match(source, /sql\.begin/);
  assert.match(source, /transactionBodyCompleted/);
  assert.match(source, /ambiguous-commit recovery marker/);
  assert.match(source, /--recover-receipt/);
  assert.match(source, /sql\.begin\("read only"/);
  assert.match(source, /CRM_TX_PRECINCT_PUBLICATION_RECEIPT_RECOVERY/);
  assert.match(source, /RECOVERED_PUBLICATION_RECEIPT/);
  assert.match(source, /disposition === "created"/);
  assert.match(source, /crosswalks\.length !== 36_762/);
  assert.match(source, /units\.length !== 36_762/);
  assert.match(source, /sources\.length !== 8/);
  assert.match(source, /runs\.length !== 4/);
});

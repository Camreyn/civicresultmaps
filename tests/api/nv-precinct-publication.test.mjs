import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NEVADA_PUBLICATION_SCOPES,
  buildNevadaPublicationAuthorizationTemplate,
  validateNevadaBlobPublicationEvidence,
  validateNevadaHiddenLoadReceipt,
  validateNevadaPublicationAuthorization,
} from "../../scripts/lib/nv-precinct-publication.mjs";

const releaseCandidate = {
  id: "nv-precinct-gis-three-election-v1",
  path: ".etl/precinct-release-candidates/NV/example/release-candidate.json",
  sha256: "1".repeat(64),
};
const endpointFingerprint = "2".repeat(64);
const committedAtUtc = "2026-08-11T03:00:00.000Z";
const audit = {
  releasePackage: { path: releaseCandidate.path, sha256: releaseCandidate.sha256 },
  authorization: {
    path: ".etl/production-authorizations/NV/hidden.json",
    sha256: "3".repeat(64),
  },
  preflight: {
    path: ".etl/production-preflight-candidates/NV/preflight.json",
    sha256: "4".repeat(64),
  },
  backupManifest: { sha256: "5".repeat(64), dumpSha256: "6".repeat(64) },
  authorizationId: "nv-hidden-camreyn",
  endpointFingerprint,
  transaction: { executedAtUtc: committedAtUtc, publicRevision: 31 },
};
const yearRows = [
  [2016, 1843, 5529, 2067, 206],
  [2020, 1869, 5607, 2094, 207],
  [2024, 1518, 4554, 1726, 234],
].map(([year, units, rows, features, zero]) => ({
  year,
  reportingUnits: units,
  resultRows: rows,
  features,
  exactCrosswalks: units,
  zeroVoteUnits: zero,
}));

function hiddenReceipt() {
  return {
    schemaVersion: 1,
    state: "NV",
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

test("Nevada publication accepts only the exact hidden-load audit and totals", () => {
  const value = hiddenReceipt();
  const inspected = validateNevadaHiddenLoadReceipt(value, {
    now: Date.parse("2026-08-11T04:00:00.000Z"),
    releaseCandidate,
  });
  assert.equal(inspected.databaseName, "neondb");
  assert.equal(inspected.totals.reportingUnits, 5_230);
  assert.equal(inspected.totals.candidateResultRows, 15_690);
  const recovered = structuredClone(value);
  recovered.recovery = {
    recoveredAtUtc: "2026-08-11T03:30:00.000Z",
    productionMutationPerformed: false,
  };
  assert.equal(
    validateNevadaHiddenLoadReceipt(recovered, {
      now: Date.parse("2026-08-11T04:00:00.000Z"),
      releaseCandidate,
    }).hiddenRevision,
    31,
  );
  const tampered = structuredClone(value);
  tampered.validation.years[2].reportingUnits -= 1;
  assert.throws(
    () => validateNevadaHiddenLoadReceipt(tampered, {
      now: Date.parse("2026-08-11T04:00:00.000Z"),
      releaseCandidate,
    }),
    /total drifted/,
  );
});

test("Nevada Blob evidence must cover all 54 exact immutable objects", () => {
  const origin = "https://crm-public.public.blob.vercel-storage.com";
  const artifacts = Array.from({ length: 54 }, (_, index) => ({
    kind: index >= 51 ? "index" : "parent",
    year: index >= 51
      ? [2016, 2020, 2024][index - 51]
      : [2016, 2020, 2024][Math.floor(index / 17)],
    packageRelativePath: "delivery-assets/file-" + index + ".json",
    publicUrl: "/data/geography/nv/file-" + index + ".json",
    pathname: "data/geography/nv/file-" + index + ".json",
    byteCount: 100 + index,
    sha256: index.toString(16).padStart(64, "0"),
  }));
  const blobPlan = { releaseCandidate, artifacts };
  const evidence = {
    schemaVersion: 1,
    state: "NV",
    purpose: "nv-precinct-parent-scoped-immutable-geometry-publication",
    publishedAtUtc: "2026-08-11T03:30:00.000Z",
    authorizationId: "nv-blob-camreyn",
    releaseCandidate,
    deliveryOrigin: origin,
    assetCount: 54,
    canonicalManifestChanged: false,
    publicEligibilityChanged: false,
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      url: origin + "/" + artifact.pathname,
      disposition: "created",
    })),
  };
  assert.equal(
    validateNevadaBlobPublicationEvidence(
      evidence,
      blobPlan,
      Date.parse("2026-08-11T04:00:00.000Z"),
    ).assetCount,
    54,
  );
  evidence.artifacts[0].sha256 = "f".repeat(64);
  assert.throws(
    () => validateNevadaBlobPublicationEvidence(
      evidence,
      blobPlan,
      Date.parse("2026-08-11T04:00:00.000Z"),
    ),
    /artifact set drifted/,
  );
});

test("Nevada sole-owner public authorization pins deployment and evidence", () => {
  const plan = {
    id: "nv-precinct-database-publication-v1",
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
  const value = buildNevadaPublicationAuthorizationTemplate(plan, planSha256);
  Object.assign(value, {
    decision: "GO_PUBLIC",
    activationId: "nv-public-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-11T03:50:00.000Z",
    expiresAtUtc: "2026-08-11T04:30:00.000Z",
  });
  Object.assign(value.productionDeployment, {
    deploymentId: "dpl_nevada",
    url: "https://civicresultmaps.org",
    gitSha: "b".repeat(40),
    readyVerified: true,
    promotedVerified: true,
    blockedResultGateVerified: true,
    blockedGeometryGateVerified: true,
    verifiedAtUtc: "2026-08-11T03:45:00.000Z",
  });
  const result = validateNevadaPublicationAuthorization(value, {
    plan,
    planSha256,
    now: Date.parse("2026-08-11T04:00:00.000Z"),
  });
  assert.equal(result.approvedBy, "Camreyn");
  assert.deepEqual(value.scopes, NEVADA_PUBLICATION_SCOPES);
  value.productionDeployment.staticRegistrySha256 = "c".repeat(64);
  assert.throws(
    () => validateNevadaPublicationAuthorization(value, {
      plan,
      planSha256,
      now: Date.parse("2026-08-11T04:00:00.000Z"),
    }),
    /incompatible/,
  );
});

test("Nevada public cutover remains one guarded transaction", () => {
  const source = readFileSync(
    "scripts/publish-nv-precinct-geography-status.mjs",
    "utf8",
  );
  assert.match(source, /I_ACKNOWLEDGE_ATOMIC_NEVADA_PRECINCT_PUBLIC_CUTOVER/);
  assert.match(source, /sql\.begin/);
  assert.match(source, /transactionBodyCompleted/);
  assert.match(source, /ambiguous-commit recovery marker/);
  assert.match(source, /--recover-receipt/);
  assert.match(source, /sql\.begin\("read only"/);
  assert.match(source, /CRM_NV_PRECINCT_PUBLICATION_RECEIPT_RECOVERY/);
  assert.match(source, /RECOVERED_PUBLICATION_RECEIPT/);
  assert.match(source, /disposition === "created"/);
  assert.match(source, /crosswalks\.length !== 5_230/);
  assert.match(source, /units\.length !== 5_230/);
  assert.match(source, /sources\.length !== 6/);
  assert.match(source, /runs\.length !== 3/);
});

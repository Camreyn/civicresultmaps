import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NEVADA_PRODUCTION_RELEASE_SCOPES,
  buildNevadaProductionAuthorizationTemplate,
  validateNevadaProductionAuthorization,
  validateNevadaProductionBackupEvidence,
  validateNevadaProductionPreflightEvidence,
} from "../../scripts/lib/nv-precinct-production-release.mjs";

const releaseCandidate = {
  id: "nv-precinct-gis-three-election-v2",
  sha256: "1".repeat(64),
};
const endpointFingerprint = "2".repeat(64);
const now = new Date("2026-08-11T04:00:00.000Z");

function preflight() {
  return {
    schemaVersion: 1,
    state: "NV",
    capturedAtUtc: "2026-08-11T03:30:00.000Z",
    releaseCandidate,
    endpointFingerprint,
    productionMutationPerformed: false,
    database: { name: "neondb", transactionReadOnly: true },
    migration0008: { status: "complete" },
    migration0009: { status: "absent" },
    invalidConstraints: 0,
    publicRevision: 42,
    nevada: {
      coreYearRows: [2016, 2020, 2024].map((year) => ({
        year,
        precinctResultRows: 0,
      })),
      precinctYearRows: [2016, 2020, 2024].map((year) => ({
        year,
        reportingUnits: 0,
        linkedPrecinctResultRows: 0,
        geographyVersions: 0,
        geometryFeatures: 0,
        reviewedExactCrosswalks: 0,
      })),
      sourceDocuments: [],
    },
  };
}

function backup() {
  const counts = { states: 51, result_rows: 1000 };
  return {
    manifestVersion: 3,
    backupPurpose: "nv-precinct-production-release-rollback",
    createdAtUtc: "2026-08-11T03:35:00.000Z",
    releaseCandidate,
    dumpFile: "nv.dump",
    dumpSha256: "3".repeat(64),
    dumpFormat: "custom",
    includedSchemas: ["public"],
    excludedTableDataPatterns: [],
    sourceEndpointFingerprint: endpointFingerprint,
    sourceServerVersionNum: 170010,
    sourcePublicTableCount: 2,
    sourcePublicTableRowCounts: counts,
    sourceInvalidConstraints: 0,
    pgClientMajor: 17,
    remoteMutationPerformed: false,
    restoreVerification: {
      verified: true,
      verifiedAtUtc: "2026-08-11T03:40:00.000Z",
      database: "crm_nv_precinct_restore_verify",
      defaultTransactionReadOnly: true,
      publicTableCount: 2,
      publicTableRowCounts: counts,
      invalidConstraints: 0,
      tableDataEntryCount: 2,
      exactSourceTableSet: true,
      exactSourceRowCounts: true,
    },
  };
}

test("Nevada hidden release requires fresh exact preflight and restored backup", () => {
  const preflightSummary = validateNevadaProductionPreflightEvidence(preflight(), {
    releaseCandidate,
    endpointFingerprint,
    now,
  });
  assert.equal(preflightSummary.databaseName, "neondb");
  const backupSummary = validateNevadaProductionBackupEvidence(backup(), {
    releaseCandidate,
    endpointFingerprint,
    preflightCapturedAtUtc: preflightSummary.capturedAtUtc,
    now,
  });
  assert.equal(backupSummary.sourcePublicTableCount, 2);

  const stale = preflight();
  stale.capturedAtUtc = "2026-08-10T20:00:00.000Z";
  assert.throws(
    () => validateNevadaProductionPreflightEvidence(stale, {
      releaseCandidate,
      endpointFingerprint,
      now,
    }),
    /four-hour/,
  );
  const beforePreflight = backup();
  beforePreflight.createdAtUtc = preflight().capturedAtUtc;
  assert.throws(
    () => validateNevadaProductionBackupEvidence(beforePreflight, {
      releaseCandidate,
      endpointFingerprint,
      preflightCapturedAtUtc: preflight().capturedAtUtc,
      now,
    }),
    /must follow/,
  );

  const alreadyLoaded = preflight();
  alreadyLoaded.nevada.precinctYearRows[2].reportingUnits = 1576;
  assert.throws(
    () => validateNevadaProductionPreflightEvidence(alreadyLoaded, {
      releaseCandidate,
      endpointFingerprint,
      now,
    }),
    /already contains precinct release rows/,
  );
});

test("Nevada sole-owner authorization is hash-bound, scoped, and time-limited", () => {
  const template = buildNevadaProductionAuthorizationTemplate({
    releaseCandidate,
    preflightSha256: "4".repeat(64),
    backupManifestSha256: "5".repeat(64),
  });
  assert.equal(template.decision, "NO_GO_PRODUCTION");
  const authorization = {
    ...template,
    decision: "GO_PRODUCTION",
    authorizationId: "nv-release-camreyn-20260811",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-11T03:45:00.000Z",
    expiresAtUtc: "2026-08-11T04:30:00.000Z",
  };
  const result = validateNevadaProductionAuthorization(authorization, {
    releaseCandidate,
    preflightSha256: "4".repeat(64),
    backupManifestSha256: "5".repeat(64),
    now,
  });
  assert.equal(result.approvedBy, "Camreyn");
  assert.deepEqual(authorization.scopes, NEVADA_PRODUCTION_RELEASE_SCOPES);
  const tampered = structuredClone(authorization);
  tampered.evidence.preflightSha256 = "6".repeat(64);
  assert.throws(
    () => validateNevadaProductionAuthorization(tampered, {
      releaseCandidate,
      preflightSha256: "4".repeat(64),
      backupManifestSha256: "5".repeat(64),
      now,
    }),
    /incomplete or incompatible/,
  );
});

test("Nevada runner preserves public blocks and ambiguous-commit evidence", () => {
  const runner = readFileSync("scripts/apply-nv-precinct-release.mjs", "utf8");
  const database = readFileSync("scripts/lib/nv-precinct-gis-db.mjs", "utf8");
  assert.match(runner, /CRM_NV_PRECINCT_PRODUCTION_WRITES/);
  assert.match(runner, /CRM_NV_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256/);
  assert.match(runner, /transactionBodyCompleted/);
  assert.match(runner, /ambiguous-commit recovery marker/);
  assert.match(runner, /--recover-receipt/);
  assert.match(runner, /sql\.begin\("read only"/);
  assert.match(runner, /readNevadaPersistedProductionReleaseAudit/);
  assert.match(runner, /CRM_NV_PRECINCT_HIDDEN_RECEIPT_RECOVERY/);
  assert.match(runner, /disposition === "created"/);
  assert.match(runner, /COMMITTED_HIDDEN_NOT_PUBLIC/);
  assert.match(runner, /ensureNevadaDerivationConstraint/);
  assert.match(runner, /years: \[2016, 2020, 2024\]/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.match(database, /status='blocked'| 'blocked'/);
});

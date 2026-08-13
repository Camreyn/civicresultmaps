import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertIowaReleaseCandidateDocument,
  sha256,
} from "../../scripts/lib/ia-precinct-production-preflight.mjs";
import {
  IOWA_PRODUCTION_RELEASE_SCOPES,
  buildIowaProductionAuthorizationTemplate,
  validateIowaProductionAuthorization,
  validateIowaProductionBackupEvidence,
  validateIowaProductionPreflightEvidence,
} from "../../scripts/lib/ia-precinct-production-release.mjs";
import { buildIowaTestReleaseFixture } from "./ia-precinct-release-fixture.mjs";

const { built } = await buildIowaTestReleaseFixture();
const packageSha256 = sha256(built.packageBytes);
const candidate = assertIowaReleaseCandidateDocument(built.packageDocument, packageSha256);
const now = new Date("2026-08-13T00:30:00.000Z");
const endpointFingerprint = "a".repeat(64);

test("Iowa release candidate and authorization scopes are state-specific", () => {
  assert.deepEqual(IOWA_PRODUCTION_RELEASE_SCOPES, [
    "apply_migration_0009",
    "load_ia_precinct_results_and_geometry_hidden",
    "increment_public_data_revision",
  ]);
  const template = buildIowaProductionAuthorizationTemplate({
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
  });
  assert.equal(template.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(template.scopes, IOWA_PRODUCTION_RELEASE_SCOPES);
  assert.equal(template.replacement, undefined);
});

test("Iowa fresh empty production evidence validates and preexisting rows fail", () => {
  const report = {
    schemaVersion: 1,
    state: "IA",
    productionMutationPerformed: false,
    database: { transactionReadOnly: true, name: "production" },
    invalidConstraints: 0,
    migration0008: { status: "complete" },
    migration0009: { status: "absent" },
    releaseCandidate: { id: candidate.id, sha256: candidate.sha256 },
    endpointFingerprint,
    publicRevision: 10,
    capturedAtUtc: "2026-08-13T00:00:00.000Z",
    iowa: {
      precinctYearRows: [2016, 2020, 2024].map((year) => ({
        year,
        reportingUnits: 0,
        linkedPrecinctResultRows: 0,
        geographyVersions: 0,
        geometryFeatures: 0,
        reviewedExactCrosswalks: 0,
      })),
      coreYearRows: [2016, 2020, 2024].map((year) => ({ year, precinctResultRows: 0 })),
    },
  };
  assert.doesNotThrow(() => validateIowaProductionPreflightEvidence(report, {
    releaseCandidate: candidate,
    endpointFingerprint,
    now,
  }));
  report.iowa.precinctYearRows[1].reportingUnits = 1;
  assert.throws(() => validateIowaProductionPreflightEvidence(report, {
    releaseCandidate: candidate,
    endpointFingerprint,
    now,
  }), /already contains precinct release rows/);
});

test("Iowa backup and authorization require exact fresh hashes", () => {
  const preflightCapturedAtUtc = "2026-08-13T00:00:00.000Z";
  const backup = {
    manifestVersion: 3,
    backupPurpose: "ia-precinct-production-release-rollback",
    releaseCandidate: { id: candidate.id, sha256: candidate.sha256 },
    sourceEndpointFingerprint: endpointFingerprint,
    dumpSha256: "d".repeat(64),
    dumpFormat: "custom",
    pgClientMajor: 17,
    sourceServerVersionNum: 170000,
    includedSchemas: ["public"],
    excludedTableDataPatterns: [],
    remoteMutationPerformed: false,
    sourceInvalidConstraints: 0,
    createdAtUtc: "2026-08-13T00:05:00.000Z",
    sourcePublicTableCount: 2,
    sourcePublicTableRowCounts: { elections: 4, contests: 8 },
    restoreVerification: {
      verified: true,
      defaultTransactionReadOnly: true,
      exactSourceTableSet: true,
      exactSourceRowCounts: true,
      invalidConstraints: 0,
      verifiedAtUtc: "2026-08-13T00:10:00.000Z",
      publicTableCount: 2,
      tableDataEntryCount: 2,
      publicTableRowCounts: { elections: 4, contests: 8 },
    },
  };
  assert.doesNotThrow(() => validateIowaProductionBackupEvidence(backup, {
    releaseCandidate: candidate,
    endpointFingerprint,
    preflightCapturedAtUtc,
    now,
  }));
  const authorization = {
    ...buildIowaProductionAuthorizationTemplate({
      releaseCandidate: candidate,
      preflightSha256: "b".repeat(64),
      backupManifestSha256: "c".repeat(64),
    }),
    decision: "GO_PRODUCTION",
    authorizationId: "ia-release-1",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T00:15:00.000Z",
    expiresAtUtc: "2026-08-13T01:15:00.000Z",
  };
  assert.doesNotThrow(() => validateIowaProductionAuthorization(authorization, {
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
    now,
  }));
  authorization.scopes[1] = "load_nv_precinct_results_and_geometry_hidden";
  assert.throws(() => validateIowaProductionAuthorization(authorization, {
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
    now,
  }), /incomplete or incompatible/);
});

test("Iowa production runners use the correctly spelled environment guard", () => {
  const files = [
    "scripts/apply-ia-precinct-release.mjs",
    "scripts/report-ia-precinct-production-preflight.mjs",
    "scripts/publish-ia-precinct-geography-status.mjs",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.match(files, /CRM_DATABASE_ENVIRONMENT/);
  assert.doesNotMatch(files, /CRM_DATABASE_EIAIRONMENT|NODE_EIA/);
  assert.doesNotMatch(files, /replacement-publication-receipt|GO_PRODUCTION_UPGRADE/);
});

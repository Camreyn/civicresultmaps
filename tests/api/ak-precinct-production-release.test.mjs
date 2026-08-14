import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertAlaskaReleaseCandidateDocument,
  sha256,
} from "../../scripts/lib/ak-precinct-production-preflight.mjs";
import {
  ALASKA_PRODUCTION_RELEASE_SCOPES,
  buildAlaskaProductionAuthorizationTemplate,
  validateAlaskaProductionAuthorization,
  validateAlaskaProductionBackupEvidence,
  validateAlaskaProductionPreflightEvidence,
} from "../../scripts/lib/ak-precinct-production-release.mjs";
import { buildAlaskaTestReleaseFixture } from "./ak-precinct-release-fixture.mjs";

const { built } = await buildAlaskaTestReleaseFixture();
const packageSha256 = sha256(built.packageBytes);
const candidate = assertAlaskaReleaseCandidateDocument(built.packageDocument, packageSha256);
const now = new Date("2026-08-13T00:30:00.000Z");
const endpointFingerprint = "a".repeat(64);

test("Alaska release candidate and authorization scopes are state-specific", () => {
  assert.deepEqual(ALASKA_PRODUCTION_RELEASE_SCOPES, [
    "apply_migration_0009",
    "load_ak_precinct_results_and_geometry_hidden",
    "increment_public_data_revision",
  ]);
  const template = buildAlaskaProductionAuthorizationTemplate({
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
  });
  assert.equal(template.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(template.scopes, ALASKA_PRODUCTION_RELEASE_SCOPES);
  assert.equal(template.replacement, undefined);
});

test("Alaska fresh empty production evidence validates and preexisting rows fail", () => {
  const report = {
    schemaVersion: 1,
    state: "AK",
    productionMutationPerformed: false,
    database: { transactionReadOnly: true, name: "production" },
    invalidConstraints: 0,
    migration0008: { status: "complete" },
    migration0009: { status: "absent" },
    releaseCandidate: { id: candidate.id, sha256: candidate.sha256 },
    endpointFingerprint,
    publicRevision: 10,
    capturedAtUtc: "2026-08-13T00:00:00.000Z",
    alaska: {
      localYearRows: [2012, 2016, 2020, 2024].map((year) => ({
        year,
        reportingUnits: 0,
        linkedLocalResultRows: 0,
        geographyVersions: 0,
        geometryFeatures: 0,
        reviewedRelationships: 0,
      })),
      coreYearRows: [2012, 2016, 2020, 2024].map((year) => ({ year, localResultRows: 0 })),
    },
  };
  assert.doesNotThrow(() => validateAlaskaProductionPreflightEvidence(report, {
    releaseCandidate: candidate,
    endpointFingerprint,
    now,
  }));
  report.alaska.localYearRows[1].reportingUnits = 1;
  assert.throws(() => validateAlaskaProductionPreflightEvidence(report, {
    releaseCandidate: candidate,
    endpointFingerprint,
    now,
  }), /already contains precinct release rows/);
});

test("Alaska backup and authorization require exact fresh hashes", () => {
  const preflightCapturedAtUtc = "2026-08-13T00:00:00.000Z";
  const backup = {
    manifestVersion: 3,
    backupPurpose: "ak-precinct-production-release-rollback",
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
  assert.doesNotThrow(() => validateAlaskaProductionBackupEvidence(backup, {
    releaseCandidate: candidate,
    endpointFingerprint,
    preflightCapturedAtUtc,
    now,
  }));
  const authorization = {
    ...buildAlaskaProductionAuthorizationTemplate({
      releaseCandidate: candidate,
      preflightSha256: "b".repeat(64),
      backupManifestSha256: "c".repeat(64),
    }),
    decision: "GO_PRODUCTION",
    authorizationId: "ak-release-1",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T00:15:00.000Z",
    expiresAtUtc: "2026-08-13T01:15:00.000Z",
  };
  assert.doesNotThrow(() => validateAlaskaProductionAuthorization(authorization, {
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
    now,
  }));
  authorization.scopes[1] = "load_nv_precinct_results_and_geometry_hidden";
  assert.throws(() => validateAlaskaProductionAuthorization(authorization, {
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
    now,
  }), /incomplete or incompatible/);
});

test("Alaska production runners use the correctly spelled environment guard", () => {
  const files = [
    "scripts/apply-ak-precinct-release.mjs",
    "scripts/report-ak-precinct-production-preflight.mjs",
    "scripts/publish-ak-precinct-geography-status.mjs",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.match(files, /CRM_DATABASE_ENVIRONMENT/);
  assert.doesNotMatch(files, /CRM_DATABASE_EIAIRONMENT|NODE_EIA/);
  assert.doesNotMatch(files, /replacement-publication-receipt|GO_PRODUCTION_UPGRADE/);
});

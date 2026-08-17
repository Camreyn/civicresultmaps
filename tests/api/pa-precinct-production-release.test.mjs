import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readPennsylvaniaBackupManifest,
} from "../../scripts/apply-pa-precinct-release.mjs";
import {
  assertPennsylvaniaReleaseCandidateDocument,
  sha256,
} from "../../scripts/lib/pa-precinct-production-preflight.mjs";
import {
  PENNSYLVANIA_PRODUCTION_RELEASE_SCOPES,
  buildPennsylvaniaProductionAuthorizationTemplate,
  validatePennsylvaniaProductionAuthorization,
  validatePennsylvaniaProductionBackupEvidence,
  validatePennsylvaniaProductionPreflightEvidence,
} from "../../scripts/lib/pa-precinct-production-release.mjs";
import { buildPennsylvaniaTestReleaseFixture } from "./pa-precinct-release-fixture.mjs";

const { built } = await buildPennsylvaniaTestReleaseFixture();
const packageSha256 = sha256(built.packageBytes);
const candidate = assertPennsylvaniaReleaseCandidateDocument(built.packageDocument, packageSha256);
const now = new Date("2026-08-13T00:30:00.000Z");
const endpointFingerprint = "a".repeat(64);

test("Pennsylvania release candidate and authorization scopes are state-specific", () => {
  assert.deepEqual(PENNSYLVANIA_PRODUCTION_RELEASE_SCOPES, [
    "apply_migration_0009",
    "load_pa_precinct_results_and_geometry_hidden",
    "increment_public_data_revision",
  ]);
  const template = buildPennsylvaniaProductionAuthorizationTemplate({
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
  });
  assert.equal(template.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(template.scopes, PENNSYLVANIA_PRODUCTION_RELEASE_SCOPES);
  assert.equal(template.replacement, undefined);
});

test("Pennsylvania fresh empty production evidence validates and preexisting rows fail", () => {
  const report = {
    schemaVersion: 1,
    state: "PA",
    productionMutationPerformed: false,
    database: { transactionReadOnly: true, name: "production" },
    invalidConstraints: 0,
    migration0008: { status: "complete" },
    migration0009: { status: "absent" },
    releaseCandidate: { id: candidate.id, sha256: candidate.sha256 },
    endpointFingerprint,
    publicRevision: 10,
    capturedAtUtc: "2026-08-13T00:00:00.000Z",
    pennsylvania: {
      localYearRows: [2016, 2020].map((year) => ({
        year,
        reportingUnits: 0,
        linkedLocalResultRows: 0,
        geographyVersions: 0,
        geometryFeatures: 0,
        reviewedRelationships: 0,
      })),
      coreYearRows: [2016, 2020].map((year) => ({ year, localResultRows: 0 })),
    },
  };
  assert.doesNotThrow(() => validatePennsylvaniaProductionPreflightEvidence(report, {
    releaseCandidate: candidate,
    endpointFingerprint,
    now,
  }));
  report.pennsylvania.localYearRows[0].reportingUnits = 1;
  assert.throws(() => validatePennsylvaniaProductionPreflightEvidence(report, {
    releaseCandidate: candidate,
    endpointFingerprint,
    now,
  }), /already contains precinct release rows/);
});

test("Pennsylvania backup and authorization require exact fresh hashes", () => {
  const preflightCapturedAtUtc = "2026-08-13T00:00:00.000Z";
  const backup = {
    manifestVersion: 3,
    backupPurpose: "pa-precinct-production-release-rollback",
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
  assert.doesNotThrow(() => validatePennsylvaniaProductionBackupEvidence(backup, {
    releaseCandidate: candidate,
    endpointFingerprint,
    preflightCapturedAtUtc,
    now,
  }));
  const authorization = {
    ...buildPennsylvaniaProductionAuthorizationTemplate({
      releaseCandidate: candidate,
      preflightSha256: "b".repeat(64),
      backupManifestSha256: "c".repeat(64),
    }),
    decision: "GO_PRODUCTION",
    authorizationId: "pa-release-1",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-13T00:15:00.000Z",
    expiresAtUtc: "2026-08-13T01:15:00.000Z",
  };
  assert.doesNotThrow(() => validatePennsylvaniaProductionAuthorization(authorization, {
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
    now,
  }));
  authorization.scopes[1] = "load_nv_precinct_results_and_geometry_hidden";
  assert.throws(() => validatePennsylvaniaProductionAuthorization(authorization, {
    releaseCandidate: candidate,
    preflightSha256: "b".repeat(64),
    backupManifestSha256: "c".repeat(64),
    now,
  }), /incomplete or incompatible/);
});

test("Pennsylvania backup reader confines and re-hashes the restore dump", () => {
  const backupRoot = mkdtempSync(path.join(tmpdir(), "crm-pa-backup-"));
  const stamp = "20260817T120000Z";
  const dumpFile = `pa-precinct-full-public-${stamp}.dump`;
  const manifestFile = `pa-precinct-full-public-${stamp}.manifest.json`;
  const dumpPath = path.join(backupRoot, dumpFile);
  const manifestPath = path.join(backupRoot, manifestFile);
  try {
    const dumpBytes = Buffer.from("restore-verified dump\n", "utf8");
    writeFileSync(dumpPath, dumpBytes);
    const manifestBytes = Buffer.from(JSON.stringify({
      dumpFile,
      dumpSha256: sha256(dumpBytes),
    }) + "\n", "utf8");
    writeFileSync(manifestPath, manifestBytes);
    const inspected = readPennsylvaniaBackupManifest(
      manifestPath,
      sha256(manifestBytes),
      { backupRoot },
    );
    assert.equal(inspected.dumpAbsolute, dumpPath);

    assert.throws(() => readPennsylvaniaBackupManifest(
      path.join(path.dirname(backupRoot), manifestFile),
      sha256(manifestBytes),
      { backupRoot },
    ), /escapes its fixed backup root/);

    writeFileSync(dumpPath, Buffer.from("tampered dump\n", "utf8"));
    assert.throws(() => readPennsylvaniaBackupManifest(
      manifestPath,
      sha256(manifestBytes),
      { backupRoot },
    ), /missing or hash-drifted/);
  } finally {
    rmSync(backupRoot, { recursive: true, force: true });
  }
});

test("Pennsylvania production runners use the correctly spelled environment guard", () => {
  const files = [
    "scripts/apply-pa-precinct-release.mjs",
    "scripts/report-pa-precinct-production-preflight.mjs",
    "scripts/publish-pa-precinct-geography-status.mjs",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.match(files, /CRM_DATABASE_ENVIRONMENT/);
  assert.doesNotMatch(files, /CRM_DATABASE_EIAIRONMENT|NODE_EIA/);
  assert.doesNotMatch(files, /replacement-publication-receipt|GO_PRODUCTION_UPGRADE/);
});

test("Pennsylvania backup guard accepts only the two-election release package", () => {
  const backupScript = readFileSync(
    "scripts/backup-pa-precinct-production.ps1",
    "utf8",
  );
  assert.equal(built.packageDocument.totals.elections, 2);
  assert.match(backupScript, /\$document\.totals\.elections -ne 2/);
  assert.doesNotMatch(backupScript, /\$document\.totals\.elections -ne 3/);
});

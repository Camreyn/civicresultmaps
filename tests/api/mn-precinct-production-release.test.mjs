import assert from "node:assert/strict";
import {
  existsSync,
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
  assertMinnesotaReceiptRecoveryEnvironment,
  assertMinnesotaProductionReleaseEnvironment,
  finalizeMinnesotaReceipt,
  inspectMinnesotaCleanIntegration,
  reserveMinnesotaReceiptTarget,
  runMinnesotaProductionRelease,
  verifyBackupDump,
} from "../../scripts/apply-mn-precinct-release.mjs";
import {
  buildMinnesotaPrecinctExecutionContext,
} from "../../scripts/lib/mn-precinct-gis-db.mjs";
import {
  assertMinnesotaReleaseCandidateDocument,
  buildMinnesotaProductionPreflightReport,
  productionEndpointFingerprint,
  sha256,
} from "../../scripts/lib/mn-precinct-production-preflight.mjs";
import {
  buildMinnesotaProductionAuthorizationTemplate,
  buildMinnesotaOwnerConfirmationTemplate,
  ensureMinnesotaPrecinctSchema,
  MINNESOTA_OWNER_CONFIRMATION_TEXT,
  MINNESOTA_PRODUCTION_DATABASE_SCOPES,
  MINNESOTA_SOLE_OWNER_ACKNOWLEDGEMENT,
  readAndVerifyEvidenceFile,
  validateMinnesotaProductionAuthorization,
  validateMinnesotaProductionBackupEvidence,
  validateMinnesotaProductionPreflightEvidence,
  validateMinnesotaProductionReviewEvidence,
} from "../../scripts/lib/mn-precinct-production-release.mjs";

const PACKAGE_SHA = "a".repeat(64);
const ENDPOINT = "1".repeat(64);
const OVERLAY_SHA = "2".repeat(64);
const REVIEW_SHA = "3".repeat(64);
const CONFIRMATION_SHA = "4".repeat(64);
const AUTHORIZATION_SHA = "5".repeat(64);
const PREFLIGHT_SHA = "6".repeat(64);
const BACKUP_SHA = "7".repeat(64);
const DUMP_SHA = "8".repeat(64);
const GIT_SHA = "9".repeat(40);
const GIT_TREE_SHA = "a".repeat(40);
const EMPTY_STATUS_SHA = sha256(Buffer.from("", "utf8"));
const PACKAGE_PATH = ".etl/package.json";
const NOW = new Date("2026-08-08T01:00:00.000Z");

test("Minnesota durable-audit SQL decodes serialized parameters as JSON objects", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "scripts/lib/mn-precinct-gis-db.mjs"),
    "utf8",
  );
  assert.match(
    source,
    /metadata->'productionReleaseAudit'=\$3::text::jsonb/,
  );
  assert.match(
    source,
    /ir\.metadata->'productionReleaseAudit'=\$4::text::jsonb/,
  );
  assert.doesNotMatch(
    source,
    /(?:ir\.)?metadata->'productionReleaseAudit'=\$[34]::jsonb/,
  );
});

function candidateDocument() {
  return {
    schemaVersion: 1,
    id: "mn-precinct-gis-four-election-v1",
    state: "MN",
    decision: "NO_GO_PRODUCTION",
    safety: {
      explicitProductionAuthorizationRequired: true,
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      canonicalRegistryChanged: false,
    },
    totals: {
      elections: 4,
      reportingUnits: 16_435,
      candidateResultRows: 49_305,
      zeroVoteUnits: 125,
      geometryFeatures: 16_435,
      reviewedExactCrosswalks: 16_435,
    },
    databaseActivationContract: {
      migration: {
        path: "drizzle/0008_typical_thunderbolts.sql",
        byteCount: 1,
        sha256: "b".repeat(64),
      },
    },
    years: [2012, 2016, 2020, 2024].map((year) => ({
      year,
      canonicalManifest: {
        path: `data/precinct-geometry/MN/${year}/manifest.json`,
        byteCount: year,
        sha256: "c".repeat(64),
        validationStatus: "blocked",
        rowLevelRenderingSafe: false,
        delivery: null,
      },
    })),
  };
}

function releaseCandidate() {
  return assertMinnesotaReleaseCandidateDocument(candidateDocument(), PACKAGE_SHA);
}

function preflightReport() {
  return buildMinnesotaProductionPreflightReport({
    identity: {
      database_name: "crm_production",
      server_version_num: "170010",
      database_bytes: "123456",
      transaction_read_only: "on",
    },
    publicTables: [{ table_name: "elections" }, { table_name: "result_rows" }],
    precinctTables: [],
    precinctColumns: [],
    invalidConstraints: 0,
    revision: [{ revision: 21 }],
    coreYears: [2012, 2016, 2020, 2024].map((year) => ({
      year,
      election_date: `${year}-11-01`,
      result_rows: 0,
      precinct_result_rows: 0,
      county_result_rows: 0,
    })),
    precinctYears: [],
    sourceDocuments: [],
  }, {
    capturedAtUtc: "2026-08-08T00:30:00.000Z",
    endpointFingerprint: ENDPOINT,
    releaseCandidate: releaseCandidate(),
  });
}

function reviewedReleaseEvidence() {
  return {
    overlay: {
      schemaVersion: 1,
      state: "MN",
      decision: "REVIEW_REQUIRED",
      sourceReleaseCandidate: { path: PACKAGE_PATH, sha256: PACKAGE_SHA },
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      gitMutationPerformed: false,
    },
    review: {
      schemaVersion: 1,
      state: "MN",
      decision: "READY_FOR_HUMAN_CONFIRMATION",
      sourceReleaseCandidate: { path: PACKAGE_PATH, sha256: PACKAGE_SHA },
      sourceOverlay: { path: ".etl/overlay.json", sha256: OVERLAY_SHA },
      isolatedDiffGate: {
        machineClassificationsComplete: true,
        unclassifiedReviewFiles: 0,
      },
      safety: {
        productionContacted: false,
        productionMutationPerformed: false,
        publicFileWritten: false,
        canonicalManifestChanged: false,
        gitMutationPerformed: false,
      },
    },
    confirmation: {
      schemaVersion: 1,
      state: "MN",
      decision: "GO_OWNER_CONFIRMATION",
      confirmedAtUtc: "2026-08-08T00:10:00.000Z",
      confirmedBy: "Project owner",
      confirmationText: MINNESOTA_OWNER_CONFIRMATION_TEXT,
      candidate: { path: PACKAGE_PATH, sha256: PACKAGE_SHA },
      overlay: { path: ".etl/overlay.json", sha256: OVERLAY_SHA },
      review: {
        path: ".etl/review.json",
        sha256: REVIEW_SHA,
        decisionBeforeConfirmation: "READY_FOR_HUMAN_CONFIRMATION",
        confirmed: true,
      },
      cleanIntegration: {
        gitSha: GIT_SHA,
        gitTreeSha: GIT_TREE_SHA,
        trackedStatusSha256: EMPTY_STATUS_SHA,
        trackedStatusClean: true,
        diffCheckPassed: true,
        missingPaths: 0,
        unexpectedPaths: 0,
      },
      authorization: {
        productionMutation: false,
        publicGeometryPublication: false,
        canonicalEligibilityActivation: false,
        deployment: false,
        gitPublication: false,
      },
    },
  };
}

function reviewContext() {
  return {
    now: NOW,
    authorizedAtUtc: "2026-08-08T00:15:00.000Z",
    operator: "Database operator",
    releaseCandidate: releaseCandidate(),
    releaseCandidatePath: PACKAGE_PATH,
    overlay: { path: ".etl/overlay.json", sha256: OVERLAY_SHA },
    review: { path: ".etl/review.json", sha256: REVIEW_SHA },
    confirmation: {
      path: ".etl/confirmation.json",
      sha256: CONFIRMATION_SHA,
    },
    cleanIntegration: {
      gitSha: GIT_SHA,
      gitTreeSha: GIT_TREE_SHA,
      trackedStatusSha256: EMPTY_STATUS_SHA,
      trackedStatusClean: true,
      diffCheckPassed: true,
      missingPaths: 0,
      unexpectedPaths: 0,
    },
  };
}

function productionReleaseAudit() {
  return {
    authorization: {
      path: ".etl/authorization.json",
      sha256: AUTHORIZATION_SHA,
    },
    releaseOverlay: { path: ".etl/overlay.json", sha256: OVERLAY_SHA },
    releaseReview: { path: ".etl/review.json", sha256: REVIEW_SHA },
    releaseConfirmation: {
      path: ".etl/confirmation.json",
      sha256: CONFIRMATION_SHA,
    },
    preflight: { path: ".etl/preflight.json", sha256: PREFLIGHT_SHA },
    backupManifest: { sha256: BACKUP_SHA, dumpSha256: DUMP_SHA },
    authorizationId: "mn-release-window-001",
    endpointFingerprint: ENDPOINT,
    transaction: {
      executedAtUtc: "2026-08-08T01:00:00.000Z",
      publicRevision: 22,
    },
  };
}

function writeJsonArtifact(root, relativePath, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
  const absolute = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return { path: relativePath, absolute, bytes, sha256: sha256(bytes) };
}

function productionRunnerFixture({ soleOwner = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-production-runner-"));
  const databaseUrl = "postgresql://user:pass@db.example.com/crm_production?sslmode=require";
  const endpointFingerprint = productionEndpointFingerprint(databaseUrl);
  const migrationPath = "drizzle/0008_fixture.sql";
  const migrationBytes = Buffer.from("select 1;\n", "utf8");
  const migrationAbsolute = path.join(root, ...migrationPath.split("/"));
  mkdirSync(path.dirname(migrationAbsolute), { recursive: true });
  writeFileSync(migrationAbsolute, migrationBytes);
  const packagePath = ".etl/precinct-release-candidates/MN/fixture/release-candidate.json";
  const packageDocument = {
    schemaVersion: 1,
    id: "mn-precinct-gis-four-election-v1",
    state: "MN",
    decision: "NO_GO_PRODUCTION",
    safety: {
      explicitProductionAuthorizationRequired: true,
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      canonicalRegistryChanged: false,
    },
    totals: {
      elections: 4,
      reportingUnits: 16_435,
      candidateResultRows: 49_305,
      zeroVoteUnits: 125,
      geometryFeatures: 16_435,
      reviewedExactCrosswalks: 16_435,
    },
    scopedFileInventory: {
      releaseDependencies: [],
      sharedReviewFiles: [],
      sourceAndDataArtifacts: [],
    },
    databaseActivationContract: {
      migration: {
        path: migrationPath,
        byteCount: migrationBytes.length,
        sha256: sha256(migrationBytes),
      },
    },
    years: [],
  };
  const packageArtifact = writeJsonArtifact(root, packagePath, packageDocument);
  const candidate = {
    id: packageDocument.id,
    sha256: packageArtifact.sha256,
  };
  const overlayPath = ".etl/precinct-release-overlays/MN/fixture/overlay.json";
  const overlayArtifact = writeJsonArtifact(root, overlayPath, {
    schemaVersion: 1,
    state: "MN",
    decision: "REVIEW_REQUIRED",
    sourceReleaseCandidate: { path: packagePath, sha256: candidate.sha256 },
    productionMutationPerformed: false,
    publicFileWritten: false,
    canonicalManifestChanged: false,
    gitMutationPerformed: false,
  });
  const reviewPath = ".etl/precinct-release-reviews/MN/fixture/review.json";
  const reviewArtifact = writeJsonArtifact(root, reviewPath, {
    schemaVersion: 1,
    state: "MN",
    decision: "READY_FOR_HUMAN_CONFIRMATION",
    sourceReleaseCandidate: { path: packagePath, sha256: candidate.sha256 },
    sourceOverlay: { path: overlayPath, sha256: overlayArtifact.sha256 },
    isolatedDiffGate: {
      machineClassificationsComplete: true,
      unclassifiedReviewFiles: 0,
    },
    safety: {
      productionContacted: false,
      productionMutationPerformed: false,
      publicFileWritten: false,
      canonicalManifestChanged: false,
      gitMutationPerformed: false,
    },
  });
  const cleanIntegration = {
    gitSha: GIT_SHA,
    gitTreeSha: GIT_TREE_SHA,
    trackedStatusSha256: EMPTY_STATUS_SHA,
    trackedStatusClean: true,
    diffCheckPassed: true,
    missingPaths: 0,
    unexpectedPaths: 0,
  };
  const confirmationPath =
    ".etl/precinct-release-confirmations/MN/fixture/confirmation.json";
  const confirmationArtifact = writeJsonArtifact(root, confirmationPath, {
    schemaVersion: 1,
    state: "MN",
    decision: "GO_OWNER_CONFIRMATION",
    confirmedAtUtc: "2026-08-08T00:20:00.000Z",
    confirmedBy: "Project owner",
    confirmationText: MINNESOTA_OWNER_CONFIRMATION_TEXT,
    candidate: { path: packagePath, sha256: candidate.sha256 },
    overlay: { path: overlayPath, sha256: overlayArtifact.sha256 },
    review: {
      path: reviewPath,
      sha256: reviewArtifact.sha256,
      decisionBeforeConfirmation: "READY_FOR_HUMAN_CONFIRMATION",
      confirmed: true,
    },
    cleanIntegration,
    authorization: {
      productionMutation: false,
      publicGeometryPublication: false,
      canonicalEligibilityActivation: false,
      deployment: false,
      gitPublication: false,
    },
  });
  const preflightPath = ".etl/production-preflight-candidates/MN/fixture.json";
  const preflightArtifact = writeJsonArtifact(root, preflightPath, {
    schemaVersion: 1,
    state: "MN",
    capturedAtUtc: "2026-08-08T00:30:00.000Z",
    endpointFingerprint,
    releaseCandidate: candidate,
    database: { name: "crm_production", transactionReadOnly: true },
    invalidConstraints: 0,
    migration0008: { status: "absent" },
    publicRevision: 21,
    productionMutationPerformed: false,
  });
  const backupValue = {
    manifestVersion: 3,
    backupPurpose: "mn-precinct-production-release-rollback",
    createdAtUtc: "2026-08-08T00:35:00.000Z",
    dumpFile: "fixture.dump",
    dumpSha256: DUMP_SHA,
    dumpFormat: "custom",
    releaseCandidate: candidate,
    sourceEndpointFingerprint: endpointFingerprint,
    includedSchemas: ["public"],
    excludedTableDataPatterns: [],
    sourcePublicTableCount: 2,
    sourcePublicTableRowCounts: { elections: 4, result_rows: 261 },
    sourceInvalidConstraints: 0,
    sourceServerVersionNum: 170010,
    pgClientMajor: 17,
    remoteMutationPerformed: false,
    restoreVerification: {
      verified: true,
      verifiedAtUtc: "2026-08-08T00:45:00.000Z",
      database: "crm_mn_precinct_restore_verify",
      defaultTransactionReadOnly: true,
      publicTableCount: 2,
      publicTableRowCounts: { elections: 4, result_rows: 261 },
      invalidConstraints: 0,
      tableDataEntryCount: 2,
      exactSourceTableSet: true,
      exactSourceRowCounts: true,
    },
  };
  const backupBytes = Buffer.from(JSON.stringify(backupValue, null, 2) + "\n");
  const backupArtifact = {
    path: "C:\\tmp\\crm-db-clone\\mn-release-backups\\fixture.manifest.json",
    bytes: backupBytes,
    sha256: sha256(backupBytes),
    value: backupValue,
  };
  const authorizationPath = ".etl/production-authorizations/MN/fixture.json";
  const authorizationArtifact = writeJsonArtifact(root, authorizationPath, {
    schemaVersion: 1,
    state: "MN",
    decision: "GO_PRODUCTION",
    authorizationId: "fixture-hidden-release",
    releaseCandidate: candidate,
    authorizedAtUtc: "2026-08-08T00:50:00.000Z",
    expiresAtUtc: "2026-08-08T02:00:00.000Z",
    people: soleOwner ? {
      authorizedBy: "Project owner",
      operator: "Project owner",
      verifier: "Project owner",
      rollbackOwner: "Project owner",
    } : {
      authorizedBy: "Project owner",
      operator: "Database operator",
      verifier: "Independent verifier",
      rollbackOwner: "Project owner",
    },
    humanControl: soleOwner ? {
      mode: "SOLE_OWNER",
      soleOwnerApprovedBy: "Project owner",
      soleOwnerAcknowledgement: MINNESOTA_SOLE_OWNER_ACKNOWLEDGEMENT,
    } : {
      mode: "TWO_PERSON",
      soleOwnerApprovedBy: null,
      soleOwnerAcknowledgement: null,
    },
    deploymentWindow: {
      startsAtUtc: "2026-08-08T00:55:00.000Z",
      endsAtUtc: "2026-08-08T01:50:00.000Z",
      rollbackDecisionAtUtc: "2026-08-08T01:40:00.000Z",
    },
    evidence: {
      preflight: { path: preflightPath, sha256: preflightArtifact.sha256 },
      backupManifest: {
        path: backupArtifact.path,
        sha256: backupArtifact.sha256,
      },
      releaseOverlay: { path: overlayPath, sha256: overlayArtifact.sha256 },
      releaseReview: { path: reviewPath, sha256: reviewArtifact.sha256 },
      releaseConfirmation: {
        path: confirmationPath,
        sha256: confirmationArtifact.sha256,
      },
    },
    scopes: [...MINNESOTA_PRODUCTION_DATABASE_SCOPES],
  });
  return {
    root,
    cleanIntegration,
    endpointFingerprint,
    backupArtifact,
    backupDump: { path: "fixture.dump", byteCount: 42, sha256: DUMP_SHA },
    authorizationArtifact,
    options: {
      root,
      packagePath,
      preflightPath,
      backupManifestPath: backupArtifact.path,
      authorizationPath,
      authorizationSha256: authorizationArtifact.sha256,
      receiptPath: ".etl/production-release-receipts/MN/fixture.json",
      apply: true,
      recoverReceipt: false,
      backupArtifact,
      backupDump: { path: "fixture.dump", byteCount: 42, sha256: DUMP_SHA },
      databaseUrl,
      cleanIntegration,
      planBuilder: () => ({ years: [] }),
      environment: {
        CRM_DATABASE_ENVIRONMENT: "production",
        CRM_MN_PRECINCT_PRODUCTION_WRITES: packageArtifact.sha256,
        CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID: "fixture-hidden-release",
        CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256: authorizationArtifact.sha256,
      },
    },
  };
}

test("Minnesota production execution context is separate and package pinned", () => {
  assert.throws(
    () => buildMinnesotaPrecinctExecutionContext({ mode: "production_release" }),
    /release-package SHA-256/,
  );
  const context = buildMinnesotaPrecinctExecutionContext({
    mode: "production_release",
    releaseCandidateId: "mn-precinct-gis-four-election-v1",
    releasePackageSha256: PACKAGE_SHA,
    databaseName: "crm_production",
    productionReleaseAudit: productionReleaseAudit(),
  });
  assert.equal(context.mode, "production_release");
  assert.equal(context.database.name, "crm_production");
  assert.equal(context.releaseCandidate.sha256, PACKAGE_SHA);
  assert.equal(context.releaseCandidate.publicDeliveryAuthorized, false);
  assert.deepEqual(context.productionReleaseAudit, productionReleaseAudit());
  assert.throws(
    () => buildMinnesotaPrecinctExecutionContext({
      mode: "production_release",
      releaseCandidateId: "mn-precinct-gis-four-election-v1",
      releasePackageSha256: PACKAGE_SHA,
      databaseName: "crm_production",
    }),
    /durable release-audit metadata/,
  );
});

test("Minnesota preflight requires a remote read-only exact package", () => {
  assert.throws(
    () => productionEndpointFingerprint("postgresql://user:pass@127.0.0.1/db"),
    /refuses a loopback/,
  );
  const defaultEndpoint = productionEndpointFingerprint(
    "postgresql://user:pass@db.example.com/crm_production?sslmode=require",
  );
  assert.match(defaultEndpoint, /^[a-f0-9]{64}$/);
  assert.notEqual(
    defaultEndpoint,
    productionEndpointFingerprint(
      "postgresql://user:pass@db.example.com:6432/crm_production?sslmode=require",
    ),
  );
  assert.notEqual(
    defaultEndpoint,
    productionEndpointFingerprint(
      "postgresql://user:pass@db.example.com/other_database?sslmode=require",
    ),
  );
  const report = preflightReport();
  assert.equal(report.migration0008.status, "absent");
  assert.equal(report.database.transactionReadOnly, true);
  assert.equal(report.productionMutationPerformed, false);
  assert.deepEqual(
    validateMinnesotaProductionPreflightEvidence(report, {
      now: NOW,
      endpointFingerprint: ENDPOINT,
      releaseCandidate: releaseCandidate(),
    }),
    {
      databaseName: "crm_production",
      migrationStatus: "absent",
      capturedAtUtc: "2026-08-08T00:30:00.000Z",
      publicRevision: 21,
    },
  );
  assert.throws(
    () => buildMinnesotaProductionPreflightReport({
      identity: { transaction_read_only: "off" },
    }, {}),
    /read-only transaction/,
  );
});

test("Minnesota authorization template is no-go and approval requires evidence and roles", () => {
  const candidate = releaseCandidate();
  const template = buildMinnesotaProductionAuthorizationTemplate(candidate);
  assert.equal(template.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(template.humanControl, {
    mode: "TWO_PERSON",
    soleOwnerApprovedBy: null,
    soleOwnerAcknowledgement: null,
  });
  assert.deepEqual(template.scopes, [...MINNESOTA_PRODUCTION_DATABASE_SCOPES]);
  assert.throws(
    () => validateMinnesotaProductionAuthorization(template, {
      now: NOW,
      releaseCandidate: candidate,
    }),
    /authorization is absent/,
  );
  const authorization = {
    ...template,
    decision: "GO_PRODUCTION",
    authorizationId: "mn-release-window-001",
    authorizedAtUtc: "2026-08-08T00:15:00.000Z",
    expiresAtUtc: "2026-08-08T02:00:00.000Z",
    people: {
      authorizedBy: "Project owner",
      operator: "Database operator",
      verifier: "Independent verifier",
      rollbackOwner: "Rollback owner",
    },
    deploymentWindow: {
      startsAtUtc: "2026-08-08T00:45:00.000Z",
      endsAtUtc: "2026-08-08T01:30:00.000Z",
      rollbackDecisionAtUtc: "2026-08-08T01:20:00.000Z",
    },
    evidence: {
      preflight: { path: ".etl/preflight.json", sha256: "d".repeat(64) },
      backupManifest: { path: "C:/tmp/backup.json", sha256: "e".repeat(64) },
      releaseOverlay: { path: ".etl/overlay.json", sha256: OVERLAY_SHA },
      releaseReview: { path: ".etl/review.json", sha256: REVIEW_SHA },
      releaseConfirmation: {
        path: ".etl/confirmation.json",
        sha256: CONFIRMATION_SHA,
      },
    },
  };
  const checked = validateMinnesotaProductionAuthorization(authorization, {
    now: NOW,
    releaseCandidate: candidate,
    preflightPath: ".etl/preflight.json",
    preflightSha256: "d".repeat(64),
    backupManifestPath: "C:/tmp/backup.json",
    backupManifestSha256: "e".repeat(64),
    releaseOverlayPath: ".etl/overlay.json",
    releaseOverlaySha256: OVERLAY_SHA,
    releaseReviewPath: ".etl/review.json",
    releaseReviewSha256: REVIEW_SHA,
    releaseConfirmationPath: ".etl/confirmation.json",
    releaseConfirmationSha256: CONFIRMATION_SHA,
  });
  assert.equal(checked.authorizationId, "mn-release-window-001");
  assert.equal(checked.people.rollbackOwner, "Rollback owner");
  assert.throws(
    () => validateMinnesotaProductionAuthorization({
      ...authorization,
      people: {
        ...authorization.people,
        operator: "Alice",
        verifier: " alice ",
      },
    }, {
      now: NOW,
      releaseCandidate: candidate,
      preflightPath: ".etl/preflight.json",
      preflightSha256: "d".repeat(64),
      backupManifestPath: "C:/tmp/backup.json",
      backupManifestSha256: "e".repeat(64),
      releaseOverlayPath: ".etl/overlay.json",
      releaseOverlaySha256: OVERLAY_SHA,
      releaseReviewPath: ".etl/review.json",
      releaseReviewSha256: REVIEW_SHA,
      releaseConfirmationPath: ".etl/confirmation.json",
      releaseConfirmationSha256: CONFIRMATION_SHA,
    }),
    /requires two independent people/,
  );
  assert.throws(
    () => validateMinnesotaProductionAuthorization({
      ...authorization,
      people: {
        ...authorization.people,
        operator: "Ａｌｉｃｅ　Ｓｍｉｔｈ",
        verifier: "alice  smith",
      },
    }, {
      now: NOW,
      releaseCandidate: candidate,
      preflightPath: ".etl/preflight.json",
      preflightSha256: "d".repeat(64),
      backupManifestPath: "C:/tmp/backup.json",
      backupManifestSha256: "e".repeat(64),
      releaseOverlayPath: ".etl/overlay.json",
      releaseOverlaySha256: OVERLAY_SHA,
      releaseReviewPath: ".etl/review.json",
      releaseReviewSha256: REVIEW_SHA,
      releaseConfirmationPath: ".etl/confirmation.json",
      releaseConfirmationSha256: CONFIRMATION_SHA,
    }),
    /requires two independent people/,
  );
  assert.throws(
    () => validateMinnesotaProductionAuthorization({
      ...authorization,
      deploymentWindow: {
        ...authorization.deploymentWindow,
        rollbackDecisionAtUtc: "2026-08-08T00:55:00.000Z",
      },
    }, {
      now: NOW,
      releaseCandidate: candidate,
      preflightPath: ".etl/preflight.json",
      preflightSha256: "d".repeat(64),
      backupManifestPath: "C:/tmp/backup.json",
      backupManifestSha256: "e".repeat(64),
      releaseOverlayPath: ".etl/overlay.json",
      releaseOverlaySha256: OVERLAY_SHA,
      releaseReviewPath: ".etl/review.json",
      releaseReviewSha256: REVIEW_SHA,
      releaseConfirmationPath: ".etl/confirmation.json",
      releaseConfirmationSha256: CONFIRMATION_SHA,
    }),
    /outside its deployment window/,
  );
  const soleOwnerAuthorization = {
    ...authorization,
    people: {
      authorizedBy: "Camreyn",
      operator: "Camreyn",
      verifier: "Camreyn",
      rollbackOwner: "Camreyn",
    },
    humanControl: {
      mode: "SOLE_OWNER",
      soleOwnerApprovedBy: "Camreyn",
      soleOwnerAcknowledgement: MINNESOTA_SOLE_OWNER_ACKNOWLEDGEMENT,
    },
  };
  const soleOwnerChecked = validateMinnesotaProductionAuthorization(
    soleOwnerAuthorization,
    {
      now: NOW,
      releaseCandidate: candidate,
      preflightPath: ".etl/preflight.json",
      preflightSha256: "d".repeat(64),
      backupManifestPath: "C:/tmp/backup.json",
      backupManifestSha256: "e".repeat(64),
      releaseOverlayPath: ".etl/overlay.json",
      releaseOverlaySha256: OVERLAY_SHA,
      releaseReviewPath: ".etl/review.json",
      releaseReviewSha256: REVIEW_SHA,
      releaseConfirmationPath: ".etl/confirmation.json",
      releaseConfirmationSha256: CONFIRMATION_SHA,
    },
  );
  assert.equal(soleOwnerChecked.humanControl.mode, "SOLE_OWNER");
  assert.equal(soleOwnerChecked.humanControl.soleOwnerApprovedBy, "Camreyn");
  assert.throws(
    () => validateMinnesotaProductionAuthorization({
      ...soleOwnerAuthorization,
      humanControl: {
        ...soleOwnerAuthorization.humanControl,
        soleOwnerAcknowledgement: "I approve.",
      },
    }, {
      now: NOW,
      releaseCandidate: candidate,
      preflightPath: ".etl/preflight.json",
      preflightSha256: "d".repeat(64),
      backupManifestPath: "C:/tmp/backup.json",
      backupManifestSha256: "e".repeat(64),
      releaseOverlayPath: ".etl/overlay.json",
      releaseOverlaySha256: OVERLAY_SHA,
      releaseReviewPath: ".etl/review.json",
      releaseReviewSha256: REVIEW_SHA,
      releaseConfirmationPath: ".etl/confirmation.json",
      releaseConfirmationSha256: CONFIRMATION_SHA,
    }),
    /human-control declaration is incompatible/,
  );
  assert.throws(
    () => validateMinnesotaProductionAuthorization({
      ...soleOwnerAuthorization,
      people: { ...soleOwnerAuthorization.people, verifier: "Someone else" },
    }, {
      now: NOW,
      releaseCandidate: candidate,
      preflightPath: ".etl/preflight.json",
      preflightSha256: "d".repeat(64),
      backupManifestPath: "C:/tmp/backup.json",
      backupManifestSha256: "e".repeat(64),
      releaseOverlayPath: ".etl/overlay.json",
      releaseOverlaySha256: OVERLAY_SHA,
      releaseReviewPath: ".etl/review.json",
      releaseReviewSha256: REVIEW_SHA,
      releaseConfirmationPath: ".etl/confirmation.json",
      releaseConfirmationSha256: CONFIRMATION_SHA,
    }),
    /sole-owner roles must all name the approved owner/,
  );
});

test("Minnesota hidden release requires exact overlay, review, and human confirmation", () => {
  const evidence = reviewedReleaseEvidence();
  const checked = validateMinnesotaProductionReviewEvidence(
    evidence,
    reviewContext(),
  );
  assert.equal(checked.overlay.sha256, OVERLAY_SHA);
  assert.equal(checked.review.sha256, REVIEW_SHA);
  assert.equal(checked.confirmation.sha256, CONFIRMATION_SHA);
  assert.throws(
    () => validateMinnesotaProductionReviewEvidence({
      ...evidence,
      review: {
        ...evidence.review,
        sourceOverlay: { sha256: "0".repeat(64) },
      },
    }, reviewContext()),
    /review evidence is incompatible/,
  );
  assert.throws(
    () => validateMinnesotaProductionReviewEvidence({
      ...evidence,
      confirmation: {
        ...evidence.confirmation,
        review: {
          ...evidence.confirmation.review,
          sha256: "0".repeat(64),
        },
      },
    }, reviewContext()),
    /human-confirmation evidence is incompatible/,
  );
  assert.throws(
    () => validateMinnesotaProductionReviewEvidence({
      ...evidence,
      confirmation: {
        ...evidence.confirmation,
        confirmedBy: "Ｄａｔａｂａｓｅ   ＯＰＥＲＡＴＯＲ",
      },
    }, reviewContext()),
    /owner confirmer and production operator must be different/,
  );
  const soleOwnerContext = {
    ...reviewContext(),
    operator: "Project owner",
    humanControl: {
      mode: "SOLE_OWNER",
      soleOwnerApprovedBy: "Project owner",
      soleOwnerAcknowledgement: MINNESOTA_SOLE_OWNER_ACKNOWLEDGEMENT,
    },
  };
  assert.equal(
    validateMinnesotaProductionReviewEvidence(evidence, soleOwnerContext)
      .confirmation.confirmedBy,
    "Project owner",
  );
});

test("Minnesota owner confirmation starts no-go and pins a clean Git tree", () => {
  const evidence = reviewedReleaseEvidence();
  const cleanIntegration = reviewContext().cleanIntegration;
  const template = buildMinnesotaOwnerConfirmationTemplate({
    releaseCandidate: releaseCandidate(),
    releaseCandidatePath: PACKAGE_PATH,
    overlay: reviewContext().overlay,
    overlayDocument: evidence.overlay,
    review: reviewContext().review,
    reviewDocument: evidence.review,
    cleanIntegration,
  });
  assert.equal(template.decision, "NO_GO_OWNER_CONFIRMATION");
  assert.equal(template.review.confirmed, false);
  assert.equal(template.cleanIntegration.gitTreeSha, GIT_TREE_SHA);
  assert.equal(template.authorization.productionMutation, false);
  const calls = [];
  const inspected = inspectMinnesotaCleanIntegration("C:/fixture", (_command, args) => {
    calls.push(args.join(" "));
    if (args[0] === "status") return { status: 0, stdout: "", stderr: "" };
    if (args[1] === "HEAD^{tree}") {
      return { status: 0, stdout: GIT_TREE_SHA + "\n", stderr: "" };
    }
    return { status: 0, stdout: GIT_SHA + "\n", stderr: "" };
  });
  assert.deepEqual(inspected, cleanIntegration);
  assert.equal(calls.length, 3);
  assert.throws(
    () => inspectMinnesotaCleanIntegration("C:/fixture", (_command, args) => (
      args[0] === "status"
        ? { status: 0, stdout: " M scripts/file.mjs\n", stderr: "" }
        : { status: 0, stdout: GIT_SHA + "\n", stderr: "" }
    )),
    /clean tracked Git integration tree/,
  );
});

test("Minnesota backup evidence requires a fresh restoration verification", () => {
  const manifest = {
    manifestVersion: 3,
    backupPurpose: "mn-precinct-production-release-rollback",
    createdAtUtc: "2026-08-08T00:20:00.000Z",
    dumpFile: "public-sanitized.dump",
    dumpSha256: "f".repeat(64),
    dumpFormat: "custom",
    releaseCandidate: {
      id: "mn-precinct-gis-four-election-v1",
      sha256: PACKAGE_SHA,
    },
    sourceEndpointFingerprint: ENDPOINT,
    includedSchemas: ["public"],
    excludedTableDataPatterns: [],
    sourcePublicTableCount: 2,
    sourcePublicTableRowCounts: { elections: 4, result_rows: 261 },
    sourceInvalidConstraints: 0,
    sourceServerVersionNum: 170010,
    pgClientMajor: 17,
    remoteMutationPerformed: false,
    restoreVerification: {
      verified: true,
      verifiedAtUtc: "2026-08-08T00:40:00.000Z",
      database: "crm_mn_precinct_restore_verify",
      defaultTransactionReadOnly: true,
      publicTableCount: 2,
      publicTableRowCounts: { elections: 4, result_rows: 261 },
      invalidConstraints: 0,
      tableDataEntryCount: 2,
      exactSourceTableSet: true,
      exactSourceRowCounts: true,
    },
  };
  const context = {
    now: NOW,
    endpointFingerprint: ENDPOINT,
    releaseCandidate: releaseCandidate(),
    preflightCapturedAtUtc: "2026-08-08T00:10:00.000Z",
  };
  assert.equal(
    validateMinnesotaProductionBackupEvidence(manifest, context).dumpSha256,
    "f".repeat(64),
  );
  for (const manifestVersion of [undefined, "garbage"]) {
    assert.throws(
      () => validateMinnesotaProductionBackupEvidence({
        ...manifest,
        manifestVersion,
      }, context),
      /incomplete or incompatible/,
    );
  }
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      restoreVerification: { verified: false },
    }, context),
    /incomplete or incompatible/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      releaseCandidate: {
        ...manifest.releaseCandidate,
        sha256: "0".repeat(64),
      },
    }, context),
    /incomplete or incompatible/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      restoreVerification: {
        ...manifest.restoreVerification,
        verifiedAtUtc: "2026-08-08T00:10:00.000Z",
      },
    }, context),
    /predates the backup/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      restoreVerification: {
        ...manifest.restoreVerification,
        verifiedAtUtc: "2026-08-08T01:10:00.000Z",
      },
    }, context),
    /outside the four-hour release window/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence(manifest, {
      ...context,
      preflightCapturedAtUtc: "2026-08-08T00:30:00.000Z",
    }),
    /backup predates preflight/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence(manifest, {
      ...context,
      preflightCapturedAtUtc: manifest.createdAtUtc,
    }),
    /backup predates preflight/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      restoreVerification: {
        ...manifest.restoreVerification,
        publicTableRowCounts: { elections: 4, result_rows: 260 },
      },
    }, context),
    /exact table or row-count proof drifted/,
  );
});

test("Minnesota production environment pins package, authorization ID, and authorization bytes", () => {
  const expected = {
    packageSha256: PACKAGE_SHA,
    authorizationId: "mn-release-window-001",
    authorizationSha256: AUTHORIZATION_SHA,
  };
  const environment = {
    CRM_DATABASE_ENVIRONMENT: "production",
    CRM_MN_PRECINCT_PRODUCTION_WRITES: PACKAGE_SHA,
    CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID: "mn-release-window-001",
    CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256: AUTHORIZATION_SHA,
  };
  assert.doesNotThrow(() => assertMinnesotaProductionReleaseEnvironment(
    expected,
    environment,
  ));
  assert.throws(
    () => assertMinnesotaProductionReleaseEnvironment(expected, {
      ...environment,
      CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256: "0".repeat(64),
    }),
    /authorization-SHA acknowledgement/,
  );
});

test("Minnesota receipt recovery is read-only, package pinned, and atomically reserved", () => {
  const recoveryEnvironment = {
    CRM_DATABASE_ENVIRONMENT: "production-read-only",
    CRM_MN_PRECINCT_RECEIPT_RECOVERY_PACKAGE_SHA256: PACKAGE_SHA,
    CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256: AUTHORIZATION_SHA,
  };
  assert.doesNotThrow(() => assertMinnesotaReceiptRecoveryEnvironment({
    packageSha256: PACKAGE_SHA,
    authorizationSha256: AUTHORIZATION_SHA,
  }, recoveryEnvironment));
  assert.throws(
    () => assertMinnesotaReceiptRecoveryEnvironment({
      packageSha256: PACKAGE_SHA,
      authorizationSha256: AUTHORIZATION_SHA,
    }, { ...recoveryEnvironment, CRM_DATABASE_ENVIRONMENT: "production" }),
    /production-read-only/,
  );
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-receipt-reservation-"));
  try {
    const target = {
      relativePath: ".etl/production-release-receipts/MN/fixture.json",
      absolute: path.join(root, ".etl", "production-release-receipts", "MN", "fixture.json"),
    };
    const reservation = { schemaVersion: 1, packageSha256: PACKAGE_SHA };
    const pending = reserveMinnesotaReceiptTarget(target, reservation);
    assert.equal(existsSync(pending.absolute), true);
    assert.throws(
      () => reserveMinnesotaReceiptTarget(target, reservation),
      /reservation already exists/,
    );
    assert.equal(
      reserveMinnesotaReceiptTarget(target, reservation, { allowExisting: true }).absolute,
      pending.absolute,
    );
    const receipt = { schemaVersion: 1, state: "MN", committed: true };
    const written = finalizeMinnesotaReceipt(target, pending, receipt);
    assert.equal(written.disposition, "created");
    assert.equal(existsSync(target.absolute), true);
    assert.equal(existsSync(pending.absolute), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Minnesota production authorization bytes cannot change after SHA review", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-production-auth-"));
  try {
    mkdirSync(path.join(root, ".etl"), { recursive: true });
    const relativePath = ".etl/authorization.json";
    const authorizationPath = path.join(root, ".etl", "authorization.json");
    const reviewedBytes = Buffer.from('{"decision":"GO_PRODUCTION","authorizationId":"one"}\n');
    writeFileSync(authorizationPath, reviewedBytes);
    const reviewedSha = sha256(reviewedBytes);
    assert.equal(
      readAndVerifyEvidenceFile(root, relativePath, reviewedSha).sha256,
      reviewedSha,
    );
    writeFileSync(
      authorizationPath,
      Buffer.from('{"decision":"GO_PRODUCTION","authorizationId":"two"}\n'),
    );
    assert.throws(
      () => readAndVerifyEvidenceFile(root, relativePath, reviewedSha),
      /evidence SHA-256 drifted/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Minnesota production runner verifies a dump beside its backup manifest", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-production-backup-"));
  try {
    const backupDirectory = path.join(root, "mn-release-backups");
    mkdirSync(backupDirectory, { recursive: true });
    const dumpBytes = Buffer.from("package-bound rollback dump", "utf8");
    const dumpFile = "mn-precinct-full-public-test.dump";
    const dumpPath = path.join(backupDirectory, dumpFile);
    writeFileSync(dumpPath, dumpBytes);
    const verified = verifyBackupDump({
      path: path.join(backupDirectory, "rollback.manifest.json"),
      value: {
        dumpFile,
        dumpSha256: sha256(dumpBytes),
      },
    }, root);
    assert.equal(verified.path, dumpPath);
    assert.equal(verified.byteCount, dumpBytes.length);
    assert.throws(
      () => verifyBackupDump({
        path: path.join(root, "outside.manifest.json"),
        value: { dumpFile, dumpSha256: sha256(dumpBytes) },
      }, path.join(root, "different-root")),
      /manifest directory is outside its fixed root/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration 0008 is hash checked and applied inside the supplied transaction", async () => {
  const migrationBytes = readFileSync("drizzle/0008_typical_thunderbolts.sql");
  let migrated = false;
  const statements = [];
  const tx = {
    async unsafe(sql) {
      if (sql.includes("information_schema.tables")) {
        return migrated
          ? [
            { table_name: "geography_features" },
            { table_name: "geography_versions" },
            { table_name: "reporting_unit_geometry_crosswalks" },
            { table_name: "reporting_units" },
          ]
          : [];
      }
      if (sql.includes("information_schema.columns")) {
        return migrated
          ? [
            { table_name: "result_rows", column_name: "reporting_unit_id" },
            { table_name: "review_rows", column_name: "reporting_unit_id" },
            { table_name: "turnout_rows", column_name: "reporting_unit_id" },
          ]
          : [];
      }
      if (sql.includes("not convalidated")) return [{ count: 0 }];
      statements.push(sql);
      migrated = true;
      return [];
    },
  };
  const result = await ensureMinnesotaPrecinctSchema(
    tx,
    migrationBytes,
    sha256(migrationBytes),
  );
  assert.equal(result.before, "absent");
  assert.equal(result.after, "complete");
  assert.equal(result.statementsApplied, true);
  assert.ok(statements.length >= 20);
});

test("Minnesota production runner carries every pinned audit input into one receipt", async () => {
  const item = productionRunnerFixture({ soleOwner: true });
  try {
    let transactionCalls = 0;
    const result = await runMinnesotaProductionRelease({
      ...item.options,
      now: NOW,
      postgresFactory: () => ({
        begin: async (callback) => callback({}),
        end: async () => {},
      }),
      transactionRunner: async (_tx, options) => {
        transactionCalls += 1;
        const releaseAudit = {
          ...options.releaseAudit,
          transaction: {
            executedAtUtc: options.transactionAtUtc,
            publicRevision: 22,
          },
        };
        return {
          committedAtUtc: options.transactionAtUtc,
          validation: { revision: 22, years: [] },
          totals: candidateDocument().totals,
          releaseAudit,
          canonicalManifestChanged: false,
          publicFileWritten: false,
          publicDeliveryAuthorized: false,
        };
      },
    });
    assert.equal(result.decision, "COMMITTED_HIDDEN_NOT_PUBLIC");
    assert.equal(transactionCalls, 1);
    const receipt = JSON.parse(readFileSync(
      path.join(item.root, ...result.receipt.path.split("/")),
      "utf8",
    ));
    assert.equal(
      receipt.transaction.releaseAudit.authorization.sha256,
      item.authorizationArtifact.sha256,
    );
    assert.equal(receipt.transaction.releaseAudit.preflight.path, item.options.preflightPath);
    assert.equal(receipt.transaction.releaseAudit.backupManifest.dumpSha256, DUMP_SHA);
    assert.equal(receipt.transaction.releaseAudit.transaction.publicRevision, 22);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota production runner rechecks the active window inside the transaction", async () => {
  const item = productionRunnerFixture();
  try {
    const times = [
      new Date("2026-08-08T01:00:00.000Z"),
      new Date("2026-08-08T01:41:00.000Z"),
    ];
    let transactionCalls = 0;
    await assert.rejects(
      () => runMinnesotaProductionRelease({
        ...item.options,
        nowFactory: () => times.shift(),
        postgresFactory: () => ({
          begin: async (callback) => callback({}),
          end: async () => {},
        }),
        transactionRunner: async () => {
          transactionCalls += 1;
          return {};
        },
      }),
      /outside its deployment window/,
    );
    assert.equal(transactionCalls, 0);
    assert.equal(existsSync(
      path.join(item.root, ...item.options.receiptPath.split("/")) + ".pending",
    ), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota post-commit receipt failure is recoverable through a read-only DB audit", async () => {
  const item = productionRunnerFixture();
  try {
    let persistedAudit;
    const transactionRunner = async (_tx, options) => {
      persistedAudit = {
        ...options.releaseAudit,
        transaction: {
          executedAtUtc: options.transactionAtUtc,
          publicRevision: 22,
        },
      };
      return {
        committedAtUtc: options.transactionAtUtc,
        validation: { revision: 22, years: [] },
        totals: candidateDocument().totals,
        releaseAudit: persistedAudit,
        canonicalManifestChanged: false,
        publicFileWritten: false,
        publicDeliveryAuthorized: false,
      };
    };
    await assert.rejects(
      () => runMinnesotaProductionRelease({
        ...item.options,
        now: NOW,
        testOnlyFailReceiptWrite: true,
        postgresFactory: () => ({
          begin: async (callback) => callback({}),
          end: async () => {},
        }),
        transactionRunner,
      }),
      /receipt write failure after commit/,
    );
    const pendingPath =
      path.join(item.root, ...item.options.receiptPath.split("/")) + ".pending";
    assert.equal(existsSync(pendingPath), true);
    const packageBytes = readFileSync(path.join(
      item.root,
      ...item.options.packagePath.split("/"),
    ));
    const releaseCandidateMetadata = {
      id: "mn-precinct-gis-four-election-v1",
      sha256: sha256(packageBytes),
      publicDeliveryAuthorized: false,
    };
    let readOnlyMode = null;
    const recoveryPostgresFactory = (revision) => () => ({
      begin: async (mode, callback) => {
        readOnlyMode = mode;
        return callback({
          unsafe: async (sql) => {
            if (sql.includes("from geography_versions gv")) {
              return [2012, 2016, 2020, 2024].map((year) => ({
                year,
                status: "blocked",
                metadata: {
                  publicDeliveryAuthorized: false,
                  releaseCandidate: releaseCandidateMetadata,
                  productionReleaseAudit: persistedAudit,
                },
              }));
            }
            if (sql.includes("not convalidated")) return [{ count: 0 }];
            if (sql.includes("public_data_revisions")) return [{ revision }];
            throw new Error("Unexpected recovery SQL: " + sql);
          },
        });
      },
      end: async () => {},
    });
    const recoveryOptions = {
      ...item.options,
      apply: false,
      recoverReceipt: true,
      now: new Date("2026-08-08T01:10:00.000Z"),
      environment: {
        CRM_DATABASE_ENVIRONMENT: "production-read-only",
        CRM_MN_PRECINCT_RECEIPT_RECOVERY_PACKAGE_SHA256:
          releaseCandidateMetadata.sha256,
        CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256:
          item.authorizationArtifact.sha256,
      },
    };
    const pendingBytes = readFileSync(pendingPath);
    await assert.rejects(
      () => runMinnesotaProductionRelease({
        ...recoveryOptions,
        postgresFactory: recoveryPostgresFactory(23),
      }),
      /public revision drifted/,
    );
    assert.equal(existsSync(pendingPath), true);
    assert.equal(readFileSync(pendingPath).equals(pendingBytes), true);
    const recovery = await runMinnesotaProductionRelease({
      ...recoveryOptions,
      postgresFactory: recoveryPostgresFactory(22),
    });
    assert.equal(readOnlyMode, "read only");
    assert.equal(recovery.decision, "RECOVERED_HIDDEN_RECEIPT");
    assert.equal(recovery.productionMutationPerformed, false);
    assert.equal(existsSync(pendingPath), false);
    const receipt = JSON.parse(readFileSync(
      path.join(item.root, ...recovery.receipt.path.split("/")),
      "utf8",
    ));
    assert.equal(receipt.recovery.productionMutationPerformed, false);
    assert.equal(receipt.productionMutationPerformed, true);
    assert.equal(receipt.transaction.releaseAudit.transaction.publicRevision, 22);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota ambiguous commit acknowledgement preserves the recovery marker", async () => {
  const item = productionRunnerFixture();
  try {
    let callbackCompleted = false;
    let durableAudit;
    await assert.rejects(
      () => runMinnesotaProductionRelease({
        ...item.options,
        now: NOW,
        postgresFactory: () => ({
          begin: async (callback) => {
            await callback({});
            callbackCompleted = true;
            throw new Error("connection lost after possible commit");
          },
          end: async () => {},
        }),
        transactionRunner: async (_tx, options) => {
          durableAudit = {
            ...options.releaseAudit,
            transaction: {
              executedAtUtc: options.transactionAtUtc,
              publicRevision: 22,
            },
          };
          return {
            committedAtUtc: options.transactionAtUtc,
            validation: { revision: 22, years: [] },
            totals: candidateDocument().totals,
            releaseAudit: durableAudit,
            canonicalManifestChanged: false,
            publicFileWritten: false,
            publicDeliveryAuthorized: false,
          };
        },
      }),
      /connection lost after possible commit/,
    );
    assert.equal(callbackCompleted, true);
    assert.equal(durableAudit.transaction.publicRevision, 22);
    const receiptAbsolute = path.join(
      item.root,
      ...item.options.receiptPath.split("/"),
    );
    assert.equal(existsSync(receiptAbsolute), false);
    assert.equal(existsSync(receiptAbsolute + ".pending"), true);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota production runner rejects altered authorization bytes before connecting", async () => {
  const item = productionRunnerFixture();
  try {
    let factoryCalls = 0;
    await assert.rejects(
      () => runMinnesotaProductionRelease({
        ...item.options,
        authorizationSha256: "0".repeat(64),
        postgresFactory: () => {
          factoryCalls += 1;
          return {};
        },
      }),
      /evidence SHA-256 drifted/,
    );
    assert.equal(factoryCalls, 0);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Minnesota production CLIs do not load env files or authorize public cutover", () => {
  const applySource = readFileSync("scripts/apply-mn-precinct-release.mjs", "utf8");
  const preflightSource = readFileSync(
    "scripts/report-mn-precinct-production-preflight.mjs",
    "utf8",
  );
  assert.doesNotMatch(applySource + preflightSource, /--env-file|dotenv\.config/);
  assert.match(applySource, /CRM_MN_PRECINCT_PRODUCTION_WRITES/);
  assert.match(applySource, /CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID/);
  assert.match(applySource, /CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256/);
  assert.match(applySource, /--authorization-sha256/);
  assert.match(preflightSource, /CRM_MN_PRODUCTION_PREFLIGHT_ACK/);
  assert.match(applySource, /publicDeliveryAuthorized: false/);
  const backupSource = readFileSync(
    "scripts/backup-mn-precinct-production.ps1",
    "utf8",
  );
  assert.match(backupSource, /--format=custom --schema=public/);
  assert.doesNotMatch(backupSource, /--exclude-table-data/);
  assert.match(backupSource, /exactSourceRowCounts = \$true/);
  assert.match(backupSource, /releaseCandidate = \$releaseCandidate/);
  assert.match(backupSource, /CRM_MN_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT/);
  assert.match(backupSource, /Get-LegacyEndpointFingerprint/);
  assert.match(backupSource, /@\(\$uri\.Host\.ToLowerInvariant\(\), \$port, \$database\)/);
  assert.doesNotMatch(backupSource, /docker compose|-f \$ComposeFile/);
  assert.doesNotMatch(applySource, /canonicalManifestChanged: true|publicFileWritten: true/);
});

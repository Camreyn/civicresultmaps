import assert from "node:assert/strict";
import {
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
  ensureMinnesotaPrecinctSchema,
  MINNESOTA_PRODUCTION_DATABASE_SCOPES,
  validateMinnesotaProductionAuthorization,
  validateMinnesotaProductionBackupEvidence,
  validateMinnesotaProductionPreflightEvidence,
} from "../../scripts/lib/mn-precinct-production-release.mjs";

const PACKAGE_SHA = "a".repeat(64);
const ENDPOINT = "1".repeat(64);
const NOW = new Date("2026-08-08T01:00:00.000Z");

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
  });
  assert.equal(context.mode, "production_release");
  assert.equal(context.database.name, "crm_production");
  assert.equal(context.releaseCandidate.sha256, PACKAGE_SHA);
  assert.equal(context.releaseCandidate.publicDeliveryAuthorized, false);
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
    },
  };
  const checked = validateMinnesotaProductionAuthorization(authorization, {
    now: NOW,
    releaseCandidate: candidate,
    preflightSha256: "d".repeat(64),
    backupManifestSha256: "e".repeat(64),
  });
  assert.equal(checked.authorizationId, "mn-release-window-001");
  assert.equal(checked.people.rollbackOwner, "Rollback owner");
});

test("Minnesota backup evidence requires a fresh restoration verification", () => {
  const manifest = {
    manifestVersion: 3,
    backupPurpose: "mn-precinct-production-release-rollback",
    createdAtUtc: "2026-08-08T00:20:00.000Z",
    dumpFile: "public-sanitized.dump",
    dumpSha256: "f".repeat(64),
    releaseCandidate: {
      id: "mn-precinct-gis-four-election-v1",
      sha256: PACKAGE_SHA,
    },
    sourceEndpointFingerprint: ENDPOINT,
    includedSchemas: ["public"],
    excludedTableDataPatterns: [],
    remoteMutationPerformed: false,
    restoreVerification: {
      verified: true,
      verifiedAtUtc: "2026-08-08T00:40:00.000Z",
    },
  };
  assert.equal(
    validateMinnesotaProductionBackupEvidence(manifest, {
      now: NOW,
      endpointFingerprint: ENDPOINT,
      releaseCandidate: releaseCandidate(),
    }).dumpSha256,
    "f".repeat(64),
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      restoreVerification: { verified: false },
    }, {
      now: NOW,
      endpointFingerprint: ENDPOINT,
      releaseCandidate: releaseCandidate(),
    }),
    /incomplete or incompatible/,
  );
  assert.throws(
    () => validateMinnesotaProductionBackupEvidence({
      ...manifest,
      releaseCandidate: {
        ...manifest.releaseCandidate,
        sha256: "0".repeat(64),
      },
    }, {
      now: NOW,
      endpointFingerprint: ENDPOINT,
      releaseCandidate: releaseCandidate(),
    }),
    /incomplete or incompatible/,
  );
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

test("Minnesota production CLIs do not load env files or authorize public cutover", () => {
  const applySource = readFileSync("scripts/apply-mn-precinct-release.mjs", "utf8");
  const preflightSource = readFileSync(
    "scripts/report-mn-precinct-production-preflight.mjs",
    "utf8",
  );
  assert.doesNotMatch(applySource + preflightSource, /--env-file|dotenv\.config/);
  assert.match(applySource, /CRM_MN_PRECINCT_PRODUCTION_WRITES/);
  assert.match(applySource, /CRM_MN_PRECINCT_PRODUCTION_AUTHORIZATION_ID/);
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

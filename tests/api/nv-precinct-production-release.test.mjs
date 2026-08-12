import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertNevadaPublishedReplacementPrecondition,
} from "../../scripts/lib/nv-precinct-gis-db.mjs";
import {
  NEVADA_PRODUCTION_RELEASE_SCOPES,
  NEVADA_PRODUCTION_REPLACEMENT_SCOPE,
  NEVADA_REVIEWED_V1_PUBLICATION,
  buildNevadaProductionAuthorizationTemplate,
  validateNevadaProductionAuthorization,
  validateNevadaProductionBackupEvidence,
  validateNevadaProductionPreflightEvidence,
  validateNevadaReviewedReplacementPublicationReceipt,
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

function reviewedV1PublicationReceipt() {
  const reviewed = NEVADA_REVIEWED_V1_PUBLICATION;
  return {
    schemaVersion: 1,
    state: "NV",
    decision: "PUBLISHED",
    activationId: "nv-public-7002cd6-20260812T132755Z",
    releaseCandidate: { ...reviewed.releaseCandidate },
    publicationPlan: {
      id: "nv-precinct-database-publication-v1",
      sha256: reviewed.publicationPlanSha256,
    },
    authorization: {
      path: ".etl/production-authorizations/NV/nv-public-go.json",
      sha256: reviewed.authorizationSha256,
    },
    hiddenLoad: {
      path: ".etl/production-release-receipts/NV/nv-hidden.json",
      sha256: reviewed.hiddenReceiptSha256,
    },
    blobPublication: {
      path: ".etl/precinct-blob-publications/NV/nv-v1.json",
      sha256: reviewed.blobPublicationSha256,
      deliveryOrigin: reviewed.deliveryOrigin,
    },
    productionDeployment: {
      readyVerified: true,
      promotedVerified: true,
      blockedResultGateVerified: true,
      blockedGeometryGateVerified: true,
    },
    changedAtUtc: "2026-08-12T13:29:01.061Z",
    revision: 9,
    postconditions: { ...reviewed.postconditions },
    productionMutationPerformed: true,
    publicDeliveryAuthorized: true,
  };
}

function replacementSummary() {
  return validateNevadaReviewedReplacementPublicationReceipt(
    reviewedV1PublicationReceipt(),
    {
      publicationReceiptPath:
        ".etl/production-publication-receipts/NV/nv-v1.json",
      publicationReceiptSha256:
        NEVADA_REVIEWED_V1_PUBLICATION.publicationReceiptSha256,
      now: new Date("2026-08-12T16:00:00.000Z"),
    },
  );
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

test("Nevada v2 replacement is bound to the exact reviewed v1 publication", () => {
  const replacement = replacementSummary();
  const reviewedYears = NEVADA_REVIEWED_V1_PUBLICATION.years;
  const report = preflight();
  report.nevada.precinctYearRows = reviewedYears.map((year) => ({
    year: year.year,
    reportingUnits: year.reportingUnits,
    linkedPrecinctResultRows: year.resultRows,
    geographyVersions: 1,
    geometryFeatures: year.geometryFeatures,
    reviewedExactCrosswalks: year.reviewedExactCrosswalks,
  }));
  report.nevada.coreYearRows = reviewedYears.map((year) => ({
    year: year.year,
    precinctResultRows: year.resultRows,
  }));
  const preflightSummary = validateNevadaProductionPreflightEvidence(report, {
    releaseCandidate,
    endpointFingerprint,
    now,
    replacement,
  });
  assert.equal(preflightSummary.releaseMode, "reviewed_v1_to_v2_replacement");
  const driftedPreflight = structuredClone(report);
  driftedPreflight.nevada.precinctYearRows[2].geometryFeatures -= 1;
  assert.throws(
    () => validateNevadaProductionPreflightEvidence(driftedPreflight, {
      releaseCandidate,
      endpointFingerprint,
      now,
      replacement,
    }),
    /incompatible or already contains/,
  );

  const template = buildNevadaProductionAuthorizationTemplate({
    releaseCandidate,
    preflightSha256: "4".repeat(64),
    backupManifestSha256: "5".repeat(64),
    replacement,
  });
  assert.equal(template.decision, "NO_GO_PRODUCTION_UPGRADE");
  assert.equal(
    template.scopes.at(-1),
    NEVADA_PRODUCTION_REPLACEMENT_SCOPE,
  );
  const authorization = {
    ...template,
    decision: "GO_PRODUCTION_UPGRADE",
    authorizationId: "nv-v2-replacement-camreyn",
    approvedBy: "Camreyn",
    authorizedAtUtc: "2026-08-11T03:45:00.000Z",
    expiresAtUtc: "2026-08-11T04:30:00.000Z",
  };
  const result = validateNevadaProductionAuthorization(authorization, {
    releaseCandidate,
    preflightSha256: "4".repeat(64),
    backupManifestSha256: "5".repeat(64),
    replacement,
    now,
  });
  assert.equal(result.replacement.publicationReceipt.sha256,
    NEVADA_REVIEWED_V1_PUBLICATION.publicationReceiptSha256);

  const alteredReceipt = reviewedV1PublicationReceipt();
  alteredReceipt.postconditions.reportingUnits += 1;
  assert.throws(
    () => validateNevadaReviewedReplacementPublicationReceipt(
      alteredReceipt,
      {
        publicationReceiptPath:
          ".etl/production-publication-receipts/NV/nv-v1.json",
        publicationReceiptSha256:
          NEVADA_REVIEWED_V1_PUBLICATION.publicationReceiptSha256,
        now: new Date("2026-08-12T16:00:00.000Z"),
      },
    ),
    /altered, or incompatible/,
  );
});

test("Nevada v2 replacement transaction requires the exact published v1 rows", async () => {
  const replacement = replacementSummary();
  const reviewed = NEVADA_REVIEWED_V1_PUBLICATION;
  const electionIds = Object.fromEntries(
    reviewed.years.map((year) => [year.year, `election-${year.year}`]),
  );
  const buildVersions = () => reviewed.years.map((year) => ({
    election_id: electionIds[year.year],
    year: year.year,
    status: "published",
    metadata: {
      manifestId: year.manifestId,
      manifestSha256: year.manifestSha256,
      publicDeliveryAuthorized: true,
      releaseCandidate: {
        id: replacement.releaseCandidate.id,
        sha256: replacement.releaseCandidate.sha256,
        publicDeliveryAuthorized: true,
      },
      publicActivation: {
        activationId: replacement.activationId,
        activationCandidateSha256: reviewed.publicationPlanSha256,
        releasePackageSha256: replacement.releaseCandidate.sha256,
        blobPublicationSha256: reviewed.blobPublicationSha256,
        deliveryOrigin: reviewed.deliveryOrigin,
        authorizationSha256: reviewed.authorizationSha256,
        mode: "publish",
        year: year.year,
        manifestId: year.manifestId,
        publicManifestSha256: "a".repeat(64),
        changedAtUtc: replacement.changedAtUtc,
        revision: replacement.revision,
      },
    },
    features: year.geometryFeatures,
    crosswalks: year.reviewedExactCrosswalks,
    exact_crosswalks: year.reviewedExactCrosswalks,
    reporting_units: year.reportingUnits,
    exact_reporting_units: year.reportingUnits,
    result_rows: year.resultRows,
  }));
  const fakeTransaction = (mutateVersions = (rows) => rows) => ({
    async unsafe(sql, params) {
      if (sql.includes("select e.id election_id,e.year")) {
        return mutateVersions(buildVersions());
      }
      if (sql.includes("select candidate_name,sum(votes)")) {
        const year = Number(String(params[0]).split("-").at(-1));
        return Object.entries(
          reviewed.years.find((item) => item.year === year).candidateTotals,
        ).map(([candidate_name, votes]) => ({ candidate_name, votes }));
      }
      if (sql.includes("group by rr.reporting_unit_id having sum(rr.votes)=0")) {
        const year = Number(String(params[0]).split("-").at(-1));
        return [{
          count: reviewed.years.find((item) => item.year === year).zeroVoteUnits,
        }];
      }
      if (sql.includes("source_documents sd")) {
        return [{
          source_documents: reviewed.postconditions.sourceDocuments,
          exact_source_documents: reviewed.postconditions.sourceDocuments,
          import_runs: reviewed.postconditions.importRuns,
          exact_import_runs: reviewed.postconditions.importRuns,
          invalid_constraints: 0,
        }];
      }
      throw new Error("Unexpected replacement precondition SQL: " + sql);
    },
  });
  const result = await assertNevadaPublishedReplacementPrecondition(
    fakeTransaction(),
    replacement,
  );
  assert.equal(result.years[2].reportingUnits, 1_518);

  await assert.rejects(
    assertNevadaPublishedReplacementPrecondition(
      fakeTransaction((rows) => rows.map((row) =>
        row.year === 2024 ? { ...row, status: "blocked" } : row)),
      replacement,
    ),
    /2024 reviewed v1 replacement precondition drifted/,
  );
});

test("Nevada runner preserves public blocks and ambiguous-commit evidence", () => {
  const runner = readFileSync("scripts/apply-nv-precinct-release.mjs", "utf8");
  const database = readFileSync("scripts/lib/nv-precinct-gis-db.mjs", "utf8");
  assert.match(runner, /CRM_NV_PRECINCT_PRODUCTION_WRITES/);
  assert.match(runner, /CRM_NV_PRECINCT_PRODUCTION_AUTHORIZATION_SHA256/);
  assert.match(runner, /CRM_NV_PRECINCT_PRODUCTION_REPLACEMENT_RECEIPT_SHA256/);
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
  assert.match(database, /assertNevadaPublishedReplacementPrecondition/);
});

import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import {
  applyNevadaPrecinctGisTransaction,
  validateNevadaPrecinctGisClient,
} from "../../scripts/lib/nv-precinct-gis-db.mjs";
import { buildNevadaPrecinctGisPlan } from "../../scripts/lib/nv-precinct-gis-plan.mjs";
import {
  NEVADA_REVIEWED_V1_PUBLICATION,
  validateNevadaProductionReplacementSummary,
} from "../../scripts/lib/nv-precinct-production-release.mjs";

const DATABASE_URL =
  "postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev";
const V2_PACKAGE_SHA256 =
  "aefa507b4e1a2577f9dfdc71b978a6e5201362d51e6111bcf3d7debf1df7aba1";

function reviewedReplacement() {
  const reviewed = NEVADA_REVIEWED_V1_PUBLICATION;
  return validateNevadaProductionReplacementSummary({
    publicationReceipt: {
      path: ".etl/production-publication-receipts/NV/nv-publication-b13d531f79b0-nv-public-7002cd6-20260812T132755Z.json",
      sha256: reviewed.publicationReceiptSha256,
    },
    releaseCandidate: { ...reviewed.releaseCandidate },
    activationId: "nv-public-7002cd6-20260812T132755Z",
    changedAtUtc: "2026-08-12T13:29:01.061Z",
    revision: 9,
  });
}

test("Nevada exact published v1 clone upgrades atomically to blocked v2", async () => {
  const plan = await buildNevadaPrecinctGisPlan({ years: [2016, 2020, 2024] });
  const replacement = reviewedReplacement();
  const sql = postgres(DATABASE_URL, {
    max: 1,
    connection: { application_name: "crm-nv-v1-v2-upgrade-local-rehearsal" },
  });
  try {
    const before = await sql.unsafe(
      "select revision::int revision from public_data_revisions where scope='public'",
    );
    const beforeRevision = Number(before[0].revision);
    await assert.rejects(
      sql.begin(async (nv) => {
        const releaseAudit = {
          releasePackage: {
            path: ".etl/precinct-release-candidates/NV/nv-precinct-gis-three-election-v2-aefa507b4e1a/release-candidate.json",
            sha256: V2_PACKAGE_SHA256,
          },
          authorization: {
            path: ".etl/production-authorizations/NV/nv-v2-upgrade-rehearsal.json",
            sha256: "1".repeat(64),
          },
          preflight: {
            path: ".etl/production-preflight-candidates/NV/nv-v2-upgrade-rehearsal.json",
            sha256: "2".repeat(64),
          },
          backupManifest: {
            sha256: "3".repeat(64),
            dumpSha256: "4".repeat(64),
          },
          authorizationId: "nv-v2-upgrade-local-rehearsal",
          endpointFingerprint: "5".repeat(64),
          transaction: {
            executedAtUtc: "2026-08-12T17:00:00.000Z",
            publicRevision: beforeRevision + 1,
          },
          replacementPublication: replacement,
        };
        const executionContext = {
          mode: "production_release",
          releasePackageSha256: V2_PACKAGE_SHA256,
          releaseCandidateId: "nv-precinct-gis-three-election-v2",
          databaseName: "crm_clone_dev",
          productionReleaseAudit: releaseAudit,
        };
        const applied = await applyNevadaPrecinctGisTransaction(nv, plan, {
          executionContext,
        });
        assert.equal(applied.revision, beforeRevision + 1);
        assert.equal(applied.replacementPrecondition.years[2].reportingUnits, 1_518);
        assert.equal(applied.years[2].reportingUnits, 1_576);
        assert.equal(applied.years[2].resultRows, 4_612);
        assert.equal(applied.years[2].features, 1_635);
        const validation = await validateNevadaPrecinctGisClient(nv, plan, {
          executionContext,
          readOnlySession: false,
        });
        assert.equal(
          validation.years.reduce((sum, year) => sum + year.reportingUnits, 0),
          5_288,
        );
        assert.equal(
          validation.years.reduce((sum, year) => sum + year.resultRows, 0),
          15_748,
        );
        assert.equal(
          validation.years.reduce((sum, year) => sum + year.features, 0),
          5_796,
        );
        assert.equal(
          validation.years.reduce((sum, year) => sum + year.exactCrosswalks, 0),
          5_288,
        );
        await assert.rejects(
          applyNevadaPrecinctGisTransaction(nv, plan, { executionContext }),
          /reviewed v1 replacement precondition drifted/,
        );
        throw new Error("ROLL_BACK_NEVADA_V1_V2_UPGRADE_REHEARSAL");
      }),
      /ROLL_BACK_NEVADA_V1_V2_UPGRADE_REHEARSAL/,
    );
    const after = await sql.unsafe([
      "select revision::int revision,",
      " (select count(*)::int from geography_versions gv",
      "  where gv.state_code='NV' and gv.status='published') published",
      "from public_data_revisions where scope='public'",
    ].join("\n"));
    assert.equal(Number(after[0].revision), beforeRevision);
    assert.equal(Number(after[0].published), 3);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

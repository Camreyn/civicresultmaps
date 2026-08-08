import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { getLocalCloneDatabaseUrl } from "../../src/db/database-driver.ts";
import { buildMinnesotaPrecinctGisPlan } from "../../scripts/lib/mn-precinct-gis-plan.mjs";
import { buildMinnesotaPrecinctReleaseCandidate } from "../../scripts/lib/mn-precinct-release-candidate.mjs";
import { collectMinnesotaProductionPreflight } from "../../scripts/lib/mn-precinct-production-preflight.mjs";
import {
  applyMinnesotaPrecinctGisPlan,
  validateMinnesotaPrecinctGisDatabase,
} from "../../scripts/lib/mn-precinct-gis-db.mjs";
import { applyMinnesotaProductionReleaseTransaction } from "../../scripts/lib/mn-precinct-production-release.mjs";

const enabled = process.env.CRM_RUN_LOCAL_DB_TESTS === "true";
if (enabled) process.env.CRM_DATABASE_DRIVER = "postgres";

function withoutRevision(value) {
  const copy = structuredClone(value);
  delete copy.revision;
  return copy;
}

test("Minnesota local DB setup rolls back atomically and repeats without semantic drift", {
  skip: enabled ? false : "set CRM_RUN_LOCAL_DB_TESTS=true with the guarded local clone variables",
  timeout: 240_000,
}, async () => {
  const plan = buildMinnesotaPrecinctGisPlan();

  await applyMinnesotaPrecinctGisPlan(plan);
  const beforeRollback = await validateMinnesotaPrecinctGisDatabase(plan);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    await assert.rejects(
      applyMinnesotaPrecinctGisPlan(plan, { testOnlyFailAfterYear: 2016 }),
      /Intentional Minnesota GIS rollback after 2016/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  const afterRollback = await validateMinnesotaPrecinctGisDatabase(plan);
  assert.deepEqual(afterRollback, beforeRollback);

  const candidate = buildMinnesotaPrecinctReleaseCandidate();
  const candidateSha256 = createHash("sha256")
    .update(candidate.packageBytes)
    .digest("hex");
  const releaseSql = postgres(getLocalCloneDatabaseUrl({ requireWriteOptIn: true }), {
    max: 1,
    connection: { application_name: "civicresultmaps-mn-release-rollback-test" },
  });
  try {
    const releaseCandidate = {
      id: candidate.packageDocument.id,
      sha256: candidateSha256,
      canonicalManifestPreimages: candidate.packageDocument.years.map((year) => ({
        year: year.year,
        ...year.canonicalManifest,
      })),
    };
    const preflightReport = await releaseSql.begin("read only", (tx) =>
      collectMinnesotaProductionPreflight(tx, {
        capturedAtUtc: new Date().toISOString(),
        endpointFingerprint: "localtest000",
        releaseCandidate,
      }));
    await assert.rejects(
      releaseSql.begin((tx) => applyMinnesotaProductionReleaseTransaction(tx, {
        releaseCandidate,
        packageDocument: candidate.packageDocument,
        migrationBytes: readFileSync("drizzle/0008_typical_thunderbolts.sql"),
        databaseName: "crm_clone_dev",
        preflightReport,
        plan,
        testOnlyFailBeforeCommit: true,
      })),
      /Intentional Minnesota production release rollback before commit/,
    );
  } finally {
    await releaseSql.end({ timeout: 5 });
  }
  const afterProductionContextRollback = await validateMinnesotaPrecinctGisDatabase(plan);
  assert.deepEqual(afterProductionContextRollback, beforeRollback);

  const firstApply = await applyMinnesotaPrecinctGisPlan(plan);
  const firstValidation = await validateMinnesotaPrecinctGisDatabase(plan);
  const secondApply = await applyMinnesotaPrecinctGisPlan(plan);
  const secondValidation = await validateMinnesotaPrecinctGisDatabase(plan);

  assert.equal(secondApply.revision, firstApply.revision + 1);
  assert.deepEqual(withoutRevision(secondValidation), withoutRevision(firstValidation));
  assert.deepEqual(
    secondValidation.years.map((year) => ({
      year: year.year,
      sameYearResultRows: year.sameYearResultRows,
      safeBlockedGeographyVersions: year.safeBlockedGeographyVersions,
      exactFeatures: year.exactFeatures,
      exactCrosswalks: year.exactCrosswalks,
    })),
    [
      { year: 2012, sameYearResultRows: 12_306, safeBlockedGeographyVersions: 1, exactFeatures: 4_102, exactCrosswalks: 4_102 },
      { year: 2016, sameYearResultRows: 12_360, safeBlockedGeographyVersions: 1, exactFeatures: 4_120, exactCrosswalks: 4_120 },
      { year: 2020, sameYearResultRows: 12_330, safeBlockedGeographyVersions: 1, exactFeatures: 4_110, exactCrosswalks: 4_110 },
      { year: 2024, sameYearResultRows: 12_309, safeBlockedGeographyVersions: 1, exactFeatures: 4_103, exactCrosswalks: 4_103 },
    ],
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import {
  applyTexasPrecinctGisTransaction,
} from "../../scripts/lib/tx-precinct-gis-db.mjs";
import { buildTexasPrecinctGisPlan } from "../../scripts/lib/tx-precinct-gis-plan.mjs";
import { applyTexasGeographyPublicationTransaction } from "../../scripts/publish-tx-precinct-geography-status.mjs";

const DATABASE_URL =
  "postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev";
const releaseCandidate = {
  id: "tx-precinct-gis-four-election-v1",
  sha256: "41c2cc7f901b200f76eda265183d354a7f46f2ffc01ab477e1bd4f8d07c3ecb5",
};
const changedAtUtc = "2026-08-11T04:30:00.000Z";

function publicManifestSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(value, null, 2) + "\n")
    .digest("hex");
}

test("Texas hidden load and public cutover commit together in rehearsal, then roll back", async () => {
  const gisPlan = await buildTexasPrecinctGisPlan();
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json"));
  const manifests = gisPlan.years.map((year) => {
    const manifest = registry.manifests.find((row) => row.id === year.manifest.id);
    assert.ok(manifest, "missing activated Texas manifest " + year.year);
    return {
      year: year.year,
      electionId: year.electionId,
      manifestId: manifest.id,
      publicManifestSha256: publicManifestSha256(manifest),
      delivery: manifest.delivery,
      boundaryVintage: manifest.geography.boundaryVintage,
      blockedManifestSha256: year.manifestSha256,
      featureCount: manifest.delivery.featureCount,
      zeroVoteUnits: year.zeroVoteUnits,
      resultRows: year.resultRows.length,
    };
  });
  const sql = postgres(DATABASE_URL, {
    max: 1,
    connection: { application_name: "crm-tx-publication-local-rehearsal" },
  });
  try {
    const before = await sql.unsafe(
      "select revision::int revision from public_data_revisions where scope='public'",
    );
    const beforeRevision = Number(before[0].revision);
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe([
          "delete from result_rows rr using contests c,elections e",
          "where rr.contest_id=c.id and c.election_id=e.id",
          " and rr.state_code='TX' and rr.level='precinct'",
          " and e.office='president' and e.year in (2012,2016,2020,2024)",
        ].join("\n"));
        await tx.unsafe([
          "delete from geography_versions gv using elections e",
          "where gv.election_id=e.id and gv.state_code='TX'",
          " and gv.geography_type='precinct'",
          " and e.office='president' and e.year in (2012,2016,2020,2024)",
        ].join("\n"));
        await tx.unsafe([
          "delete from reporting_units ru using elections e",
          "where ru.election_id=e.id and ru.state_code='TX'",
          " and ru.reporting_grain='precinct'",
          " and e.office='president' and e.year in (2012,2016,2020,2024)",
        ].join("\n"));
        const audit = {
          releasePackage: {
            path: ".etl/precinct-release-candidates/TX/example/release-candidate.json",
            sha256: releaseCandidate.sha256,
          },
          authorization: {
            path: ".etl/production-authorizations/TX/example-hidden.json",
            sha256: "1".repeat(64),
          },
          preflight: {
            path: ".etl/production-preflight-candidates/TX/example.json",
            sha256: "2".repeat(64),
          },
          backupManifest: {
            sha256: "3".repeat(64),
            dumpSha256: "4".repeat(64),
          },
          authorizationId: "tx-local-hidden-rehearsal",
          endpointFingerprint: "5".repeat(64),
          transaction: {
            executedAtUtc: "2026-08-11T04:20:00.000Z",
            publicRevision: beforeRevision + 1,
          },
        };
        const executionContext = {
          mode: "production_release",
          releasePackageSha256: releaseCandidate.sha256,
          releaseCandidateId: releaseCandidate.id,
          databaseName: "crm_clone_dev",
          productionReleaseAudit: audit,
        };
        const hidden = await applyTexasPrecinctGisTransaction(tx, gisPlan, {
          executionContext,
        });
        assert.equal(hidden.revision, beforeRevision + 1);
        const publication = await applyTexasGeographyPublicationTransaction(tx, {
          plan: {
            releaseCandidate,
            hiddenLoad: {
              databaseName: "crm_clone_dev",
              productionReleaseAudit: audit,
            },
            blobPublication: {
              sha256: "6".repeat(64),
              deliveryOrigin: "https://crm-public.public.blob.vercel-storage.com",
            },
            manifests,
          },
          planSha256: "7".repeat(64),
          authorization: { activationId: "tx-local-public-rehearsal" },
          authorizationSha256: "8".repeat(64),
          changedAtUtc,
          gisPlan,
          executionContext,
        });
        assert.equal(publication.revision, beforeRevision + 2);
        assert.equal(publication.postconditions.reportingUnits, 36_762);
        assert.equal(publication.postconditions.resultRows, 110_286);
        await assert.rejects(
          applyTexasPrecinctGisTransaction(tx, gisPlan, {
            executionContext: {
              ...executionContext,
              productionReleaseAudit: {
                ...audit,
                authorizationId: "tx-local-hidden-replay",
              },
            },
          }),
          /refuses existing precinct release rows/,
        );
        throw new Error("ROLL_BACK_TEXAS_PUBLICATION_REHEARSAL");
      }),
      /ROLL_BACK_TEXAS_PUBLICATION_REHEARSAL/,
    );
    const after = await sql.unsafe([
      "select revision::int revision,",
      " (select count(*)::int from geography_versions",
      "  where state_code='TX' and status='published') published",
      "from public_data_revisions where scope='public'",
    ].join("\n"));
    assert.equal(Number(after[0].revision), beforeRevision);
    assert.equal(Number(after[0].published), 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

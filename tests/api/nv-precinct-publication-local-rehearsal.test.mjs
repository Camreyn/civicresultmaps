import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import {
  applyNevadaPrecinctGisTransaction,
} from "../../scripts/lib/nv-precinct-gis-db.mjs";
import { buildNevadaPrecinctGisPlan } from "../../scripts/lib/nv-precinct-gis-plan.mjs";
import { applyNevadaGeographyPublicationTransaction } from "../../scripts/publish-nv-precinct-geography-status.mjs";

const DATABASE_URL =
  "postgresql://crm_clone_admin:crm_clone_local_only@127.0.0.1:54329/crm_clone_dev";
const releaseCandidate = {
  id: "nv-precinct-gis-three-election-v1",
  sha256: "8634e8c3b514520572898714514e154901dc2c85d83ac1d54a2d2d043d495cb0",
};
const changedAtUtc = "2026-08-11T04:30:00.000Z";

function publicManifestSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(value, null, 2) + "\n")
    .digest("hex");
}

test("Nevada hidden load and public cutover commit together in rehearsal, then roll back", async () => {
  const gisPlan = await buildNevadaPrecinctGisPlan({
    years: [2016, 2020, 2024],
  });
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json"));
  const manifests = gisPlan.years.map((year) => {
    const manifest = registry.manifests.find((row) => row.id === year.manifest.id);
    assert.ok(manifest, "missing activated Nevada manifest " + year.year);
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
    connection: { application_name: "crm-nv-publication-local-rehearsal" },
  });
  try {
    const before = await sql.unsafe(
      "select revision::int revision from public_data_revisions where scope='public'",
    );
    const beforeRevision = Number(before[0].revision);
    await assert.rejects(
      sql.begin(async (nv) => {
        await nv.unsafe([
          "delete from result_rows rr using contests c,elections e",
          "where rr.contest_id=c.id and c.election_id=e.id",
          " and rr.state_code='NV' and rr.level='precinct'",
          " and e.office='president' and e.year in (2016,2020,2024)",
        ].join("\n"));
        await nv.unsafe([
          "delete from geography_versions gv using elections e",
          "where gv.election_id=e.id and gv.state_code='NV'",
          " and gv.geography_type='precinct'",
          " and e.office='president' and e.year in (2016,2020,2024)",
        ].join("\n"));
        await nv.unsafe([
          "delete from reporting_units ru using elections e",
          "where ru.election_id=e.id and ru.state_code='NV'",
          " and ru.reporting_grain='precinct'",
          " and e.office='president' and e.year in (2016,2020,2024)",
        ].join("\n"));
        const audit = {
          releasePackage: {
            path: ".etl/precinct-release-candidates/NV/example/release-candidate.json",
            sha256: releaseCandidate.sha256,
          },
          authorization: {
            path: ".etl/production-authorizations/NV/example-hidden.json",
            sha256: "1".repeat(64),
          },
          preflight: {
            path: ".etl/production-preflight-candidates/NV/example.json",
            sha256: "2".repeat(64),
          },
          backupManifest: {
            sha256: "3".repeat(64),
            dumpSha256: "4".repeat(64),
          },
          authorizationId: "nv-local-hidden-rehearsal",
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
        const hidden = await applyNevadaPrecinctGisTransaction(nv, gisPlan, {
          executionContext,
        });
        assert.equal(hidden.revision, beforeRevision + 1);
        const publication = await applyNevadaGeographyPublicationTransaction(nv, {
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
          authorization: { activationId: "nv-local-public-rehearsal" },
          authorizationSha256: "8".repeat(64),
          changedAtUtc,
          gisPlan,
          executionContext,
        });
        assert.equal(publication.revision, beforeRevision + 2);
        assert.equal(publication.postconditions.reportingUnits, 5_230);
        assert.equal(publication.postconditions.resultRows, 15_690);
        await assert.rejects(
          applyNevadaPrecinctGisTransaction(nv, gisPlan, {
            executionContext: {
              ...executionContext,
              productionReleaseAudit: {
                ...audit,
                authorizationId: "nv-local-hidden-replay",
              },
            },
          }),
          /refuses existing precinct release rows/,
        );
        throw new Error("ROLL_BACK_NEVADA_PUBLICATION_REHEARSAL");
      }),
      /ROLL_BACK_NEVADA_PUBLICATION_REHEARSAL/,
    );
    const after = await sql.unsafe([
      "select revision::int revision,",
      " (select count(*)::int from geography_versions",
      "  where state_code='NV' and status='published') published",
      "from public_data_revisions where scope='public'",
    ].join("\n"));
    assert.equal(Number(after[0].revision), beforeRevision);
    assert.equal(Number(after[0].published), 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

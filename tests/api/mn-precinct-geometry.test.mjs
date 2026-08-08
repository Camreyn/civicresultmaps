import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  validateManifestArtifacts,
} from "../../scripts/lib/precinct-geometry-validation.mjs";

const base = "data/precinct-geometry/MN/2024-11-05-general";
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, "utf8"));
const report = JSON.parse(
  readFileSync(
    `${base}/reports/mn-2024-11-05-precinct-geometry-report.json`,
    "utf8",
  ),
);

test("Minnesota 2024 official precinct package is complete and fail-closed", () => {
  const inspection = validateManifestArtifacts(manifest, {
    root: process.cwd(),
  });

  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.eligible, false);
  assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
  assert.equal(manifest.crosswalk.status, "reviewed");
  assert.equal(manifest.delivery, null);
  assert.equal(inspection.geometry.features, 4103);
  assert.equal(inspection.geometry.uniqueFeatureKeys, 4103);
  assert.equal(inspection.crosswalk.resultUnits, 4103);
  assert.equal(inspection.crosswalk.relationships.oneToOne, 4103);
  assert.equal(inspection.crosswalk.relationships.pendingReview, 0);
  assert.equal(inspection.sourcePackages.parentsWithPackages, 87);
  assert.equal(inspection.sourcePackages.missingParentCount, 0);
});

test("Minnesota VTDIDs and vote totals reconcile without hiding zero-vote precincts", () => {
  assert.equal(report.identityReview.exactVtdidMatches, 4103);
  assert.deepEqual(report.identityReview.geometryOnlyVtdids, []);
  assert.deepEqual(report.identityReview.resultOnlyVtdids, []);
  assert.equal(report.results.zeroPresidentialVoteRows, 28);
  assert.deepEqual(report.crosswalk.statewideDeltas, {
    totalVotes: 0,
    trump: 0,
    harris: 0,
    other: 0,
    comparisonDemVotes: 0,
    comparisonRepVotes: 0,
    comparisonOtherVotes: 0,
  });
  assert.equal(report.results.totals.totalVotes, 3253920);
  assert.equal(report.results.totals.trump, 1519032);
  assert.equal(report.results.totals.harris, 1656979);
  assert.equal(report.results.totals.other, 77909);
  assert.ok(
    statSync(`${base}/raw/lcc-gis/vtd2024general.zip`).size < 100_000_000,
  );
});

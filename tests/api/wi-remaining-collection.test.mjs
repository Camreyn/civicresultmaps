import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const tracker = JSON.parse(readFileSync("data/wi-2024-remaining-data-collection-tracker.json", "utf8"));
const inventory = JSON.parse(readFileSync("data/wi-2024-public-source-inventory.json", "utf8"));
const requestSummary = JSON.parse(readFileSync("data/wi-2024-records-request-packet-summary.json", "utf8"));
const status = JSON.parse(readFileSync("data/wi-2024-remaining-data-status.json", "utf8"));
const wardGeometry = JSON.parse(readFileSync("data/wi-2024-ward-geometry-summary.json", "utf8"));
const wardGeometryJoinReport = JSON.parse(readFileSync("data/wi-2024-ward-geometry-join-report.json", "utf8"));
const hardMissingEvidence = JSON.parse(readFileSync("data/wi-2024-hard-missing-source-evidence.json", "utf8"));

const requiredFamilies = [
  "wardRegisteredVoterDenominators",
  "perAuditUnitOutcomes",
  "municipalWardGeometry",
  "rowLevelBallotMode",
];

test("Wisconsin remaining-data collection tracker covers WEC and every county", () => {
  assert.equal(tracker.state, "WI");
  assert.equal(tracker.currentProductionFlagsRemainAuthoritative, true);
  assert.deepEqual(tracker.dataFamilies.map((family) => family.id), requiredFamilies);

  const targets = tracker.targets;
  assert.equal(targets.length, 73);
  assert.equal(targets.filter((target) => target.targetType === "state_agency").length, 1);
  assert.equal(targets.filter((target) => target.targetType === "county_clerk").length, 72);
  assert.equal(targets.some((target) => target.id === "WI-WEC"), true);
  assert.equal(targets.some((target) => target.county === "Milwaukee County"), true);
  assert.equal(targets.some((target) => target.county === "Dane County"), true);

  for (const target of targets) {
    for (const family of requiredFamilies) {
      assert.ok(target.families[family], target.id + " should track " + family);
      if (target.id === "WI-WEC" && family === "municipalWardGeometry") {
        assert.equal(target.families[family].parserStatus, "collected_geojson_jurisdiction_reconciled_not_row_safe");
      } else {
        assert.equal(target.families[family].parserStatus, "not_started");
      }
    }
  }
});

test("Wisconsin public source inventory keeps loaded context separate from missing data", () => {
  assert.equal(inventory.state, "WI");
  assert.equal(inventory.probeEnabled, true);
  assert.equal(inventory.summary.sourceCandidateCount, 5);
  assert.equal(inventory.summary.requestPathCount, 1);
  assert.equal(inventory.summary.loadedContextCount, 2);

  const sourceIds = inventory.sources.map((source) => source.id).sort();
  assert.deepEqual(sourceIds, [
    "eac-2024-eavs-v2",
    "wec-2024-post-election-audit-report",
    "wec-election-results-2024-general",
    "wec-records-request",
    "wi-legislature-2024-election-data-jan2025-wards",
  ]);
  assert.match(inventory.sources.find((source) => source.id === "wec-records-request").recommendation, /official request path/);
});

test("Wisconsin records request packet summary covers WEC, counties, and municipal audit fallback", () => {
  assert.equal(requestSummary.state, "WI");
  assert.equal(requestSummary.packetCount, 74);
  assert.deepEqual(requestSummary.byTargetType, {
    state_agency: 1,
    county_clerk: 72,
    municipal_clerk: 1,
  });
  assert.deepEqual(requestSummary.requiredFamilies, requiredFamilies);
  assert.equal(requestSummary.packets.some((packet) => packet.targetId === "WI-WEC"), true);
  assert.equal(requestSummary.packets.some((packet) => packet.targetId === "WI-MUNICIPAL-AUDIT-TEMPLATE"), true);
});

test("Wisconsin remaining-data status references collection artifacts", () => {
  assert.equal(status.summary.collectionTrackerTargets, 73);
  assert.equal(status.summary.collectionTrackerFamilies, 4);
  assert.equal(status.summary.publicSourceCandidateCount, 5);
  assert.equal(status.summary.requestPacketCount, 74);
  assert.equal(status.collectionPlan.countyTargetCount, 72);
  assert.equal(status.collectionPlan.stateAgencyTargetCount, 1);
  assert.deepEqual(status.collectionPlan.dataFamilies.map((family) => family.id), requiredFamilies);
});

test("Wisconsin remaining-data package exposes npm pipeline entrypoints", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["etl:collect:wi:remaining"], "node scripts/collect-wi-public-source-inventory.mjs");
  assert.equal(packageJson.scripts["etl:requests:wi:remaining"], "node scripts/create-wi-records-request-packets.mjs");
  assert.equal(packageJson.scripts["etl:collect:wi:ward-geometry"], "node scripts/collect-wi-ward-geometry.mjs");
  assert.equal(packageJson.scripts["etl:validate:wi:ward-geometry"], "node scripts/validate-wi-ward-geometry-joins.mjs");
  assert.match(packageJson.scripts["test:api"], /wi-remaining-collection\.test\.mjs/);
});


test("Wisconsin ward geometry candidate is collected from official WI Legislature ArcGIS", () => {
  assert.equal(wardGeometry.status, "public_candidate_collected_needs_join_validation");
  assert.equal(wardGeometry.featureCount, 7086);
  assert.equal(wardGeometry.countyCount, 72);
  assert.equal(wardGeometry.municipalityCount, 1910);
  assert.equal(wardGeometry.totalPresidentialVotes, 3422918);
  assert.equal(wardGeometry.localGeojsonGzip, "data/wi-2024-ward-geometry.geojson.gz");
  assert.equal(existsSync(wardGeometry.localGeojsonGzip), true);
  assert.ok(statSync(wardGeometry.localGeojsonGzip).size > 1_000_000);
  assert.match(wardGeometry.sourceUrl, /2024_Election_Data_with_2025_Wards/);
  assert.match(wardGeometry.caveats.join(" "), /join validation/);
});


test("Wisconsin ward geometry join validation quantifies remaining mapping gaps", () => {
  assert.equal(wardGeometryJoinReport.state, "WI");
  assert.equal(wardGeometryJoinReport.status, "candidate_collected_jurisdiction_reconciled_ward_version_deltas");
  assert.equal(wardGeometryJoinReport.summary.reviewRows, 3503);
  assert.equal(wardGeometryJoinReport.summary.geometryFeatures, 7086);
  assert.equal(wardGeometryJoinReport.summary.matchedReviewRows, 3478);
  assert.equal(wardGeometryJoinReport.summary.unmatchedReviewRows, 25);
  assert.equal(wardGeometryJoinReport.summary.parseFailures, 0);
  assert.equal(wardGeometryJoinReport.summary.exactPresidentialTotalRows, 3370);
  assert.equal(wardGeometryJoinReport.summary.mismatchedMatchedRows, 108);
  assert.equal(wardGeometryJoinReport.summary.matchedPct, 99.29);
  assert.equal(wardGeometryJoinReport.summary.affectedJurisdictions, 38);
  assert.equal(wardGeometryJoinReport.summary.affectedJurisdictionsReconciled, 38);
  assert.equal(wardGeometryJoinReport.summary.unresolvedJurisdictions, 0);
  assert.equal(wardGeometryJoinReport.summary.rowLevelWardRenderingSafe, false);
  assert.equal(wardGeometryJoinReport.summary.jurisdictionLevelRenderingSafe, true);
  assert.equal(wardGeometryJoinReport.residualClassification.interpretation.includes("ward-version/allocation mismatch"), true);
  assert.match(wardGeometryJoinReport.caveats.join(" "), /County-level production indicators remain authoritative/);
});


test("Wisconsin hard-missing source evidence proves public sources do not carry missing fields", () => {
  assert.equal(hardMissingEvidence.state, "WI");
  assert.equal(hardMissingEvidence.summary.officialUrlProbeCount, 4);
  assert.equal(hardMissingEvidence.summary.officialUrlsReachable, 1);
  assert.equal(hardMissingEvidence.summary.officialUrlsBlockedByCloudflare, 3);
  assert.equal(hardMissingEvidence.summary.arcgisQueryCount, 6);
  assert.equal(hardMissingEvidence.summary.relevantArcgisResultCount, 1);
  assert.equal(hardMissingEvidence.summary.wecWardWorkbookSheetCount, 198);
  assert.equal(hardMissingEvidence.summary.wecWardWorkbookProvidesHardMissingFields, false);
  assert.equal(hardMissingEvidence.summary.geometryLayerProvidesHardMissingFields, false);
  assert.deepEqual(hardMissingEvidence.summary.familiesStillRequireRecordsRequests, [
    "wardRegisteredVoterDenominators",
    "rowLevelBallotMode",
    "perAuditUnitOutcomes",
    "wardGeometryCrosswalk",
  ]);
  assert.equal(hardMissingEvidence.conclusions.wardRegisteredVoterDenominators.requestRequired, true);
  assert.equal(hardMissingEvidence.conclusions.rowLevelBallotMode.requestRequired, true);
  assert.equal(hardMissingEvidence.conclusions.perAuditUnitOutcomes.requestRequired, true);
  assert.equal(hardMissingEvidence.conclusions.wardGeometryCrosswalk.requestRequired, true);
});

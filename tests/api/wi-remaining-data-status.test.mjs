import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = JSON.parse(readFileSync("data/wi-2024-remaining-data-status.json", "utf8"));

test("Wisconsin remaining-data report records unavailable statewide sources without changing flag inputs", () => {
  assert.equal(report.state, "WI");
  assert.equal(report.electionYear, 2024);
  assert.equal(report.summary.countyFlagsRemainAuthoritative, true);
  assert.equal(report.summary.noRemainingItemIsCurrentlyUsedAsAFlagInput, true);

  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.status, "statewide_not_found_public");
  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.primaryFallback.status, "loaded_eac_fallback");
  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.primaryFallback.rowCount, 1851);
  assert.deepEqual(
    report.remainingItems.wardRegisteredVoterDenominators.partialWardSources.map((source) => source.county).sort(),
    ["Jefferson", "Milwaukee", "Oneida"],
  );

  assert.equal(report.remainingItems.municipalWardGeometry.status, "public_candidate_collected_needs_join_validation");
  assert.equal(report.remainingItems.municipalWardGeometry.currentGeometry, "county_geometry_production_with_ward_candidate_collected");
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.featureCount, 7086);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.countyCount, 72);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.status, "candidate_collected_join_validation_needs_review");
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.reportPath, "data/wi-2024-ward-geometry-join-report.json");
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.matchedReviewRows, 3478);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.matchedPct, 99.29);
  assert.equal(report.remainingItems.rowLevelBallotMode.status, "not_available_from_wec_ward_workbook");
  assert.equal(report.remainingItems.rowLevelBallotMode.cvrAvailabilityInventory.rowCount, 72);
  assert.equal(report.remainingItems.rowLevelBallotMode.cvrAvailabilityInventory.badCountyCountyNames, 0);
});

test("Wisconsin remaining-data report carries aggregate audit context but not per-unit outcomes", () => {
  const audit = report.remainingItems.perAuditUnitOutcomes;
  assert.equal(audit.status, "not_published_in_final_report");
  assert.equal(audit.selectedReportingUnits, 373);
  assert.equal(audit.countiesCovered, 72);
  assert.equal(audit.aggregateAuditResults.auditedBallots, 327230);
  assert.equal(audit.aggregateAuditResults.locallyReportedPotentialEquipmentIssueErrors, 5);
  assert.equal(audit.aggregateAuditResults.finalEquipmentErrorRate, "0%");
  assert.equal(audit.flagInputStatus, "context_only_not_clearance_or_confirmation");
});

test("Wisconsin CVR availability scaffold uses clean county names", () => {
  const csv = readFileSync("data/wi-2024-cvr-availability.csv", "utf8");
  assert.match(csv, /Adams County,not_inventoried/);
  assert.doesNotMatch(csv, /County County/);
});

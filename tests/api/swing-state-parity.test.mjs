import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = JSON.parse(readFileSync("data/swing-state-2024-parity-status.json", "utf8"));
const states = new Map(report.states.map((state) => [state.state, state]));

function gapIds(state) {
  return states.get(state).parityGaps.map((gap) => gap.id);
}

test("swing-state parity report tracks all 2024 swing states against Wisconsin", () => {
  assert.equal(report.electionYear, 2024);
  assert.equal(report.benchmarkState, "WI");
  assert.deepEqual(report.swingStates, ["AZ", "GA", "MI", "NV", "NC", "PA", "WI"]);
  assert.equal(report.summary.states, 7);
  assert.equal(report.summary.validatedNativeStagingStates, 7);
  assert.equal(report.summary.statesWithLoadedEquipment, 7);
  assert.equal(report.summary.statesWithAuditContext, 1);
  assert.equal(report.summary.statesWithCvrContext, 1);
  assert.equal(report.summary.statesWithIncidentContext, 1);
  assert.equal(report.summary.statesWithHardMissingEvidence, 1);
});

test("Wisconsin remains the benchmark while records-request-only gaps stay explicit", () => {
  const wi = states.get("WI");
  assert.equal(wi.parityStatus, "benchmark_tableable_with_records_requests_remaining");
  assert.equal(wi.nativeCoverage.readinessGrade, "subcounty_comparison_review");
  assert.equal(wi.nativeCoverage.reportingGrain, "ward");
  assert.equal(wi.indicatorCoverage.flaggedCountyJurisdictions, 67);
  assert.equal(wi.indicatorCoverage.flaggedAreas, 126);
  assert.deepEqual(gapIds("WI"), ["hard_missing_records_requests", "subcounty_geometry"]);
});

test("non-Wisconsin swing states distinguish native review parity from missing context", () => {
  assert.equal(states.get("MI").parityStatus, "native_review_near_parity_admin_context_missing");
  assert.equal(states.get("PA").parityStatus, "native_review_near_parity_admin_context_missing");
  assert.equal(states.get("MI").nativeCoverage.reportingGrain, "precinct");
  assert.equal(states.get("PA").nativeCoverage.reviewRows, 9154);
  assert.equal(states.get("NC").nativeCoverage.reportingGrain, "reporting_unit");
  assert.ok(gapIds("NC").includes("state_native_turnout_denominator"));

  assert.equal(states.get("GA").nativeCoverage.readinessGrade, "subcounty_vote_share_only");
  assert.ok(gapIds("GA").includes("same_row_comparison_contest"));

  assert.equal(states.get("AZ").nativeCoverage.readinessGrade, "county_review_only");
  assert.equal(states.get("NV").nativeCoverage.readinessGrade, "county_review_only");
  assert.ok(gapIds("AZ").includes("subcounty_review_rows"));
  assert.ok(gapIds("NV").includes("subcounty_review_rows"));
});

test("parity generator and npm script are registered", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const generator = readFileSync("scripts/report-swing-state-parity.mjs", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  const route = readFileSync("src/app/api/swing-state-parity/route.ts", "utf8");
  const lib = readFileSync("src/lib/swing-state-parity.ts", "utf8");
  assert.match(packageJson.scripts["etl:status:swing-parity"], /report-swing-state-parity/);
  assert.match(packageJson.scripts["test:api"], /swing-state-parity\.test\.mjs/);
  assert.match(generator, /hard_missing_source_evidence/);
  assert.match(generator, /subcounty_review_rows/);
  assert.match(generator, /same_row_comparison_contest/);
});

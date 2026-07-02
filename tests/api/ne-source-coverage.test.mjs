import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const adminInventory = readJson("data/ne-2024-admin-source-inventory.json");
const reconciliationSummary = readJson("data/ne-2024-canvass-voting-statistics-reconciliation-summary.json");
const neConfig = readJson("etl/state-configs/ne.json");
const nativePackages = readJson("data/native-import-source-packages.json");
const acquisitionTiers = readJson("data/source-acquisition-tiers.json");
const turnoutPackages = readJson("data/turnout-source-packages.json");
const adminPackages = readJson("data/admin-source-packages.json");

const nativeNe = nativePackages.states.find((entry) => entry.state === "NE");
const discoveryNe = nativePackages.sourceDiscoveryQueue.find((entry) => entry.state === "NE");
const tierNe = acquisitionTiers.states.find((entry) => entry.state === "NE");
const turnoutNe = turnoutPackages.stateYearStatuses.find((entry) => entry.state === "NE" && entry.year === 2024);
const adminNe = adminPackages.stateYearStatuses.find((entry) => entry.state === "NE" && entry.electionYear === 2024);

test("Nebraska inventory keeps precinct, geometry, and admin request blockers explicit", () => {
  assert.equal(adminInventory.sameGrainComparison.status, "county_loaded_precinct_blocked");
  assert.equal(adminInventory.sameGrainComparison.loadedReportingGrain, "county");
  assert.match(adminInventory.sameGrainComparison.requestPath, /President and U\.S\. Senate/);
  assert.match(adminInventory.sameGrainComparison.caveat, /did not identify an official statewide precinct\/subcounty/);

  assert.equal(adminInventory.geometry.status, "county_loaded_precinct_or_subcounty_blocked");
  assert.equal(adminInventory.geometry.loadedArtifact, "data/ne-counties.geojson");
  assert.match(adminInventory.geometry.needed, /publishable reporting-unit crosswalk/);
  assert.match(adminInventory.geometry.caveat, /District shapefiles are not a substitute/);

  assert.equal(adminInventory.auditRecountCvrLitigation.status, "needs_source_inventory");
  assert.ok(adminInventory.auditRecountCvrLitigation.needed.some((item) => /post-election audit/.test(item)));
  assert.ok(adminInventory.auditRecountCvrLitigation.needed.some((item) => /CVR availability/.test(item)));
  assert.ok(adminInventory.auditRecountCvrLitigation.needed.some((item) => /recount records/.test(item)));
  assert.match(adminInventory.auditRecountCvrLitigation.requestPath, /Nebraska Secretary of State Elections Division/);

  assert.equal(adminInventory.reportedProblemsCorrectionsIncidents.status, "partial_canvass_inventory");
  assert.deepEqual(
    adminInventory.reportedProblemsCorrectionsIncidents.identifiedItems.map((item) => item.jurisdiction),
    ["Dawson County", "Gage County", "Johnson County"],
  );
  assert.match(adminInventory.reportedProblemsCorrectionsIncidents.caveat, /not evidence of fraud or misconduct/);
});

test("Nebraska turnout reconciliation remains caveated before replacing EAC fallback", () => {
  assert.equal(adminInventory.turnoutDenominators.loadedTurnoutSource.rows, 93);
  assert.equal(adminInventory.turnoutDenominators.loadedTurnoutSource.ballotsCast, 965145);
  assert.equal(adminInventory.turnoutDenominators.loadedTurnoutSource.registeredVoters, 1263487);
  assert.equal(adminInventory.turnoutDenominators.stateNativeSources[0].statewideTotalVoting, 965236);
  assert.equal(adminInventory.turnoutDenominators.stateNativeSources[0].ballotsCastDeltaCanvassMinusEac, 91);
  assert.equal(adminInventory.turnoutDenominators.stateNativeSources[0].registeredVotersDeltaCanvassMinusEac, 0);

  assert.equal(reconciliationSummary.rowCount, 93);
  assert.equal(reconciliationSummary.deltas.rowsWithBallotDelta, 34);
  assert.equal(reconciliationSummary.deltas.ballotsCastCanvassMinusEac, 91);
  assert.match(reconciliationSummary.activeTurnoutDecision, /Keep EAC fallback turnout active/);

  assert.equal(neConfig.turnout.sourceId, "ne-2024-eac-turnout");
  assert.equal(neConfig.turnout.stateNativeCanvassVotingStatistics.totalVoting, 965236);
  assert.equal(neConfig.turnout.stateNativeCanvassVotingStatistics.eacBallotsCast, 965145);
  assert.equal(neConfig.turnout.stateNativeCanvassVotingStatistics.rowsWithBallotDelta, 34);
  assert.equal(neConfig.expected.sources, neConfig.sources.length);
});

test("Nebraska registries expose source coverage caveats and request paths", () => {
  assert.ok(nativeNe, "NE native package entry is present");
  assert.match(nativeNe.nativeReadiness, /precinct_path_blocked/);
  assert.match(nativeNe.caveats.join("\n"), /not precinct\/subcounty scatter plots/);
  assert.match(nativeNe.artifacts.turnout.parserHint, /91-vote canvass-minus-EAC/);

  assert.ok(discoveryNe, "NE source discovery queue entry is present");
  assert.equal(discoveryNe.priority, 7);
  assert.ok(discoveryNe.requiredArtifacts.some((item) => /precinct-level or local reporting-unit result rows for President/.test(item)));
  assert.ok(discoveryNe.requiredArtifacts.some((item) => /CVR availability statement/.test(item)));
  assert.match(discoveryNe.blocker, /do not expose a statewide public precinct\/subcounty President plus U\.S\. Senate/);

  assert.ok(tierNe, "NE source acquisition tier entry is present");
  assert.equal(tierNe.tier, "tier_6_official_pdf_hostile");
  assert.match(tierNe.missingFields.join("\n"), /official public precinct\/subcounty U\.S\. Senate result rows/);
  assert.match(tierNe.nextAction, /request official audit, recount, CVR/);

  assert.ok(turnoutNe, "NE turnout status entry is present");
  assert.equal(turnoutNe.status, "loaded");
  assert.equal(turnoutNe.coverage.stateNativeCanvassBallotsCastDelta, 91);
  assert.equal(turnoutNe.coverage.stateNativeCanvassRowsWithBallotDelta, 34);

  assert.ok(adminNe, "NE admin source package entry is present");
  assert.equal(adminNe.audit.status, "needs_data");
  assert.equal(adminNe.cvr.status, "needs_data");
  assert.equal(adminNe.incidents.status, "partial");
  assert.match(adminNe.inventory.caveat, /not a normalized incident or audit outcome package/);
});

test("Nebraska display notes explain county review and turnout reconciliation limits", () => {
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");

  assert.match(tabs, /Nebraska review rows use official county-level President-versus-U\.S\. Senate two-year special election/);
  assert.match(tabs, /county context only/);
  assert.match(tabs, /91-vote canvass-minus-EAC difference across 34 county rows/);
  assert.match(tabs, /EAC fallback remains active until replacement semantics are reviewed/);
  assert.match(tabs, /request official Nebraska SOS or county equipment records/);
});

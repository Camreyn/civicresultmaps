import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("alaska native coverage is statewide-only and remains in source discovery", () => {
  const config = JSON.parse(readFileSync("etl/state-configs/ak.json", "utf8"));
  const inventory = JSON.parse(readFileSync("data/ak-2024-data-coverage-inventory.json", "utf8"));
  const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
  const sourceTiers = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
  const officialPageEvidence = JSON.parse(readFileSync("data/ak-2024-official-results-page-evidence.json", "utf8"));

  const discoveryAk = nativePackages.sourceDiscoveryQueue.find((entry) => entry.state === "AK");
  const tierAk = sourceTiers.states.find((entry) => entry.state === "AK" && entry.scope === "statewide");

  assert.equal(config.turnoutOnly, undefined);
  assert.equal(config.certifiedResults.format, "countyPresidentCsv");
  assert.equal(config.certifiedResults.sourceId, "ak-2024-general-president-statewide");
  assert.equal(config.reviewCharts.format, "countyComparisonCsv");
  assert.equal(config.reviewCharts.comparisonContest, "U.S. Representative first-choice votes");
  assert.equal(config.expected.resultRows, 1);
  assert.equal(config.expected.reviewRows, 1);
  assert.equal(config.expected.turnoutRows, 1);
  assert.equal(config.expected.stateTotal, 338177);
  assert.equal(config.expected.trump, 184458);
  assert.equal(config.expected.harris, 140026);
  assert.equal(config.expected.other, 13693);
  assert.equal(config.capabilities.certifiedResults, true);
  assert.equal(config.capabilities.reviewGraphs, true);
  assert.equal(config.capabilities.map, false);
  assert.equal(config.capabilities.historicalBaseline, false);

  assert.equal(inventory.completionDecision.decision, "remain_in_source_discovery_queue");
  assert.match(inventory.completionDecision.reason, /statewide only/i);
  assert.ok(inventory.sourceNeeds.some((need) => need.id === "ak-house-district-or-precinct-results"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-2024-official-results-page-evidence"));
  assert.equal(officialPageEvidence.expectedCounts.loadedLowerGrainFederalRows, 0);
  assert.ok(officialPageEvidence.sourceUrls.includes("https://www.elections.alaska.gov/election-results/e/?id=24genr"));
  assert.ok(officialPageEvidence.observations.some((observation) => /Statements? of Votes Cast/.test(observation)));
  assert.ok(inventory.displayCaveats.some((caveat) => /House District geometry cannot be joined/.test(caveat)));

  assert.equal(nativePackages.completedNativeStates.includes("AK"), false);
  assert.ok(discoveryAk);
  assert.match(discoveryAk.blocker, /statewide only/i);
  assert.match(discoveryAk.blocker, /All Details/i);
  assert.equal(discoveryAk.availableArtifacts.presidentialStatewideResults.localFile.includes("ak-2024-general-president-statewide.csv"), true);

  assert.ok(tierAk);
  assert.equal(tierAk.confidence, "partial");
  assert.match(tierAk.parserStatus, /All Details\/SOVC request path/);
  assert.match(tierAk.parserStatus, /statewide President and U.S. House comparison rows load/);
});

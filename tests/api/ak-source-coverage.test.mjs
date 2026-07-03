import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function parseTsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.map((line) => Object.fromEntries(line.split("\t").map((cell, index) => [headers[index], cell])));
}

test("alaska native coverage loads official precinct review rows with write-in caveat", () => {
  const config = JSON.parse(readFileSync("etl/state-configs/ak.json", "utf8"));
  const inventory = JSON.parse(readFileSync("data/ak-2024-data-coverage-inventory.json", "utf8"));
  const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
  const sourceTiers = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
  const officialPageEvidence = JSON.parse(readFileSync("data/ak-2024-official-results-page-evidence.json", "utf8"));
  const requestRows = parseTsv(readFileSync("data/ak-2024-source-request-matrix.tsv", "utf8"));
  const reviewCsv = readFileSync("data/ak-2024-general-precinct-president-us-house-review.csv", "utf8");

  const discoveryAk = nativePackages.sourceDiscoveryQueue.find((entry) => entry.state === "AK");
  const tierAk = sourceTiers.states.find((entry) => entry.state === "AK" && entry.scope === "statewide");

  assert.equal(config.turnoutOnly, undefined);
  assert.equal(config.certifiedResults.format, "countyPresidentCsv");
  assert.equal(config.certifiedResults.sourceId, "ak-2024-general-president-statewide");
  assert.equal(config.reviewCharts.format, "localComparisonCsv");
  assert.equal(config.reviewCharts.sourceId, "ak-2024-general-precinct-president-us-house-review");
  assert.equal(config.reviewCharts.comparisonContest, "U.S. Representative first-choice votes");
  assert.equal(config.expected.resultRows, 1);
  assert.equal(config.expected.reviewRows, 523);
  assert.equal(config.expected.turnoutRows, 1);
  assert.equal(config.expected.sources, 9);
  assert.equal(config.expected.stateTotal, 338177);
  assert.equal(config.expected.trump, 184458);
  assert.equal(config.expected.harris, 140026);
  assert.equal(config.expected.other, 13693);
  assert.equal(config.capabilities.certifiedResults, true);
  assert.equal(config.capabilities.reviewGraphs, true);
  assert.equal(config.capabilities.map, false);
  assert.equal(config.capabilities.historicalBaseline, false);

  assert.equal(reviewCsv.trim().split(/\r?\n/).length - 1, 523);
  assert.match(reviewCsv, /HD01 01-600 Ketchikan No\. 1/);
  assert.match(reviewCsv, /District 40\s+- Question/);

  assert.equal(inventory.completionDecision.decision, "materially_advanced_precinct_review_loaded_with_caveats");
  assert.match(inventory.completionDecision.reason, /523 same-grain precinct\/reporting-unit/i);
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-2024-general-enr-by-precinct"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.expectedCounts?.usHouseWriteInGapVersusSummary === 750));
  assert.ok(inventory.sourceNeeds.some((need) => need.id === "ak-us-house-write-in-precinct-allocation"));
  assert.ok(inventory.displayCaveats.some((caveat) => /not proof of fraud or misconduct/i.test(caveat)));

  assert.equal(officialPageEvidence.expectedCounts.loadedLowerGrainFederalRows, 523);
  assert.equal(officialPageEvidence.expectedCounts.usHouseWriteInGapVersusSummary, 750);
  assert.ok(officialPageEvidence.sourceUrls.includes("https://www.elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv"));
  assert.ok(officialPageEvidence.observations.some((observation) => /ENRbyPrecinct\.csv/.test(observation)));
  assert.ok(officialPageEvidence.caveats.some((caveat) => /write-ins/i.test(caveat)));

  assert.ok(discoveryAk);
  assert.match(discoveryAk.blocker, /ENRbyPrecinct\.csv/i);
  assert.match(discoveryAk.blocker, /750/);
  assert.equal(discoveryAk.availableArtifacts.presidentialStatewideResults.localFile.includes("ak-2024-general-president-statewide.csv"), true);

  assert.ok(tierAk);
  assert.equal(tierAk.confidence, "loaded_with_caveat");
  assert.match(tierAk.parserStatus, /523 localComparisonCsv review rows/);
  assert.match(tierAk.caveats, /750 votes below/);

  assert.ok(requestRows.some((row) => row.id === "ak-us-house-write-in-precinct-allocation"));
  assert.ok(requestRows.some((row) => row.local_artifact_status === "candidate_lead_collected"));
});
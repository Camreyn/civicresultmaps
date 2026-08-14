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
  const turnoutSemantics = JSON.parse(readFileSync("data/ak-2024-enr-turnout-semantics.json", "utf8"));
  const requestPacket = JSON.parse(readFileSync("data/ak-2024-official-source-request-packet.json", "utf8"));
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
  assert.equal(config.turnout.sourceId, "ak-2024-eac-turnout");
  assert.equal(config.turnout.stateNativeLeadReview.decision, "remain_documented_lead_not_active_turnout");
  assert.equal(config.turnout.stateNativeLeadReview.zeroRegistrationBallotUnits, 120);
  assert.equal(config.turnout.stateNativeLeadReview.zeroRegistrationBallots, 165047);
  assert.equal(config.expected.sources, 16);
  assert.equal(config.expected.canonicalCountyEquivalentFeatures, 30);
  assert.ok(config.sources.some((source) => source.id === "ak-county-equivalent-boundary"));
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

  assert.equal(inventory.completionDecision.decision, "four_election_precinct_gis_reviewed_guarded_release_pending");
  assert.match(inventory.completionDecision.reason, /402 geographic precincts.*121.*non-geographic/i);
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-2024-general-enr-by-precinct"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-2024-enr-turnout-semantics"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-2024-official-source-request-packet"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-county-equivalent-boundary"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.id === "ak-2024-precinct-gis-package"));
  assert.ok(inventory.loadedArtifacts.some((artifact) => artifact.expectedCounts?.usHouseWriteInGapVersusSummary === 750));
  assert.ok(inventory.sourceNeeds.some((need) => need.id === "ak-us-house-write-in-precinct-allocation"));
  assert.ok(inventory.displayCaveats.some((caveat) => /not proof of fraud or misconduct/i.test(caveat)));

  assert.equal(officialPageEvidence.expectedCounts.loadedLowerGrainFederalRows, 523);
  assert.equal(officialPageEvidence.expectedCounts.usHouseWriteInGapVersusSummary, 750);
  assert.equal(officialPageEvidence.expectedCounts.enrTurnoutRegisteredVoters, 611078);
  assert.equal(officialPageEvidence.expectedCounts.enrTurnoutTotalBallots, 340981);
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
  assert.match(tierAk.caveats, /750 U\.S\. House write-ins/i);

  assert.ok(requestRows.some((row) => row.id === "ak-us-house-write-in-precinct-allocation"));
  assert.ok(requestRows.some((row) => row.id === "ak-local-turnout-denominator" && row.local_artifact_status === "semantics_reconciliation_lead_collected"));
  assert.ok(requestRows.some((row) => row.id === "ak-official-source-request-packet"));

  assert.equal(turnoutSemantics.totals.reportingUnits, 523);
  assert.equal(turnoutSemantics.totals.registeredVoters, 611078);
  assert.equal(turnoutSemantics.totals.totalBallots, 340981);
  assert.equal(turnoutSemantics.sourceArtifactSha256, "aca7ab6e949d1319b48692ab8e8b694835ff6a9bd862fc9efbac91550c25f957");
  assert.equal(turnoutSemantics.replacementReview.decision, "remain_documented_lead_not_active_turnout");
  assert.equal(turnoutSemantics.replacementReview.activeTurnoutSourceId, "ak-2024-eac-turnout");
  assert.equal(turnoutSemantics.replacementReview.zeroRegistrationBallotUnits, 120);
  assert.equal(turnoutSemantics.replacementReview.zeroRegistrationBallots, 165047);
  assert.match(turnoutSemantics.replacementReview.invalidReplacementModes.join(" "), /duplicate the active EAC fallback totals/);
  assert.equal(turnoutSemantics.categories.election_day_precinct.reportingUnits, 402);
  assert.equal(turnoutSemantics.categories.district_absentee.registeredVoters, 0);
  assert.equal(turnoutSemantics.categories.district_early_voting.registeredVoters, 0);
  assert.equal(turnoutSemantics.categories.district_question.registeredVoters, 0);
  assert.ok(turnoutSemantics.caveats.some((caveat) => /does not activate ENR turnout/i.test(caveat)));

  assert.equal(requestPacket.requests.length, 5);
  assert.ok(requestPacket.requests.some((request) => request.id === "ak-state-native-turnout-semantics"));
  assert.ok(requestPacket.requests.some((request) => /Do not allocate the 750 write-ins/i.test(request.caveat)));
});
test("alaska legacy House District overlay is supplemental and reconciled", () => {
  const overlay = JSON.parse(readFileSync("data/ak-2024-legacy-house-district-overlay.json", "utf8"));
  const script = readFileSync("scripts/build-ak-legacy-house-district-overlay.mjs", "utf8");

  assert.equal(overlay.label, "Legacy supplemental House District overlay");
  assert.equal(overlay.rows.length, 40);
  assert.equal(overlay.reconciliation.legacyMappedReviewRows, 522);
  assert.equal(overlay.reconciliation.nativeStatewideTotal, 338177);
  assert.equal(overlay.reconciliation.legacyMappedTotals.total, 337776);
  assert.equal(overlay.reconciliation.excludedNonGeographicRow.total, 401);
  assert.ok(overlay.caveats.some((caveat) => /Supplemental map overlay only/i.test(caveat)));
  assert.ok(overlay.caveats.some((caveat) => /HD99/i.test(caveat)));
  assert.ok(overlay.rows.every((row) => row.level === "district"));
  assert.ok(overlay.indicators.length > 0);
  assert.ok(overlay.indicators.every((indicator) => indicator.level === "district"));
  assert.ok(overlay.indicators.every((indicator) => indicator.metrics.supplementalOverlay === true));
  assert.match(script, /ak-app-data\.js/);
  assert.match(script, /ak-2024-legacy-house-district-overlay\.json/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("native importer promotes validated staging artifacts only", () => {
  const importer = readFileSync("src/db/native-import.ts", "utf8");
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  const script = readFileSync("scripts/promote-native-staging.mjs", "utf8");
  const policy = readFileSync("src/lib/review-policy.ts", "utf8");

  assert.match(importer, /promoteNativeStagingArtifact/);
  assert.match(importer, /import \{ reviewPolicy \} from "\.\.\/lib\/review-policy\.ts"/);
  assert.match(importer, /Native staging artifact validation did not pass/);
  assert.match(importer, /must not self-authorize production writes/);
  assert.match(importer, /source_documents/);
  assert.match(importer, /result_rows/);
  assert.match(importer, /review_rows/);
  assert.match(importer, /turnout_rows/);
  assert.match(importer, /shouldReplaceResultRows/);
  assert.doesNotMatch(importer, /\|\| !artifact\.capabilities\.certifiedResults/);
  assert.match(importer, /shouldReplaceReviewRows/);
  assert.match(importer, /"nativeReviewRows" in native\.metrics/);
  assert.doesNotMatch(importer, /!artifact\.capabilities\.reviewGraphs/);
  assert.match(importer, /delete from analysis_indicators/);
  assert.match(importer, /analysisIndicatorsForNativeRows/);
  assert.match(importer, /reviewScopesForNativeRows/);
  assert.match(importer, /rest_of_county/);
  assert.match(importer, /auditContextForScope/);
  assert.match(importer, /aggregateAuditResults/);
  assert.match(importer, /denominatorContextForScope/);
  assert.match(importer, /comparisonContextForScope/);
  assert.match(importer, /isComparableDownBallotRow/);
  assert.match(importer, /oneSidedHouseComparison/);
  assert.match(importer, /multiDistrictHouseComparison/);
  assert.match(importer, /comparableDownBallotRowCount/);
  assert.match(importer, /comparisonCoverageMode/);
  assert.match(importer, /directionalScreenConfidence/);
  assert.match(importer, /directionalScreenReason/);
  assert.match(importer, /presidentVsGovernor/);
  assert.match(importer, /presidentVsUSHouse/);
  assert.match(explorer, /Harris \/ DEM \(low\)/);
  assert.match(explorer, /Governor-only/);
  assert.match(explorer, /DEM pres > House/);
  assert.match(explorer, /REP pres > House/);
  assert.match(explorer, /Harris share pattern/);
  assert.match(explorer, /presidential-over-House dropoff direction instead of candidate benefit/);
  assert.match(importer, /jurisdictionName: `\$\{split\.city\}, \$\{split\.county\} County`/);
  assert.match(importer, /insert into analysis_indicators/);
  assert.match(importer, /storedIndicatorRows/);
  assert.match(policy, /downBallotAverageThresholdPct: 2/);
  assert.match(policy, /voteShareCorrelationThreshold: 0\.35/);
  assert.match(importer, /certified_results = case/);
  assert.match(importer, /else capability_flags\.certified_results/);
  assert.match(importer, /review_graphs = case/);
  assert.match(importer, /else capability_flags\.review_graphs/);
  assert.match(importer, /const shouldReplaceTurnoutRows = native\.turnoutRows\.length > 0/);
  assert.match(importer, /if \(shouldReplaceTurnoutRows\)/);
  assert.doesNotMatch(importer, /parseLegacyBundle/);
  assert.match(script, /promoteNativeStagingArtifact/);
});

test("legacy importer tolerates non-array legacy turnout payloads", () => {
  const importer = readFileSync("src/db/legacy-import.ts", "utf8");

  assert.match(importer, /const turnoutRows = Array\.isArray\(appData\.turnoutData\) \? appData\.turnoutData : \[\]/);
  assert.match(importer, /for \(const \[index, row\] of turnoutRows\.entries\(\)\)/);
});

test("native staging indicator report uses the shared review policy", () => {
  const script = readFileSync("scripts/report-staging-indicator-counts.mjs", "utf8");

  assert.match(script, /reviewPolicy/);
  assert.match(script, /average_down_ballot_difference/);
  assert.match(script, /isComparableDownBallotRow/);
  assert.match(script, /comparableDownBallotRowCount/);
  assert.match(script, /down_ballot_outliers/);
  assert.match(script, /uniqueFlaggedJurisdictions/);
  assert.match(script, /uniqueFlaggedCountyJurisdictions/);
  assert.match(script, /flaggedAreas/);
  assert.match(script, /byLevel/);
  assert.match(script, /cityNameForWard/);
});

test("review indicator reads require enabled review graph capability", () => {
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");

  assert.match(dataAccess, /inner join capability_flags\s+on analysis_indicators\.state_code = capability_flags\.state_code/);
  assert.match(dataAccess, /inner join capability_flags\s+on review_rows\.state_code = capability_flags\.state_code/);
  assert.match(dataAccess, /capability_flags\.review_graphs = true/);
});
test("new york coverage inventory preserves supplemental review caveats", () => {
  const config = JSON.parse(readFileSync("etl/state-configs/ny.json", "utf8"));
  const inventory = JSON.parse(readFileSync("data/ny-2024-data-coverage-inventory.json", "utf8"));
  const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
  const localReviewManifest = JSON.parse(readFileSync("data/ny-2024-local-review-sources.json", "utf8"));
  const requestPackets = JSON.parse(readFileSync("data/ny-2024-missing-county-request-packets.json", "utf8"));
  const localReview = inventory.loadedArtifacts.find((artifact) => artifact.id === "ny-2024-local-review-openelections");
  const discoveryNy = nativePackages.sourceDiscoveryQueue.find((entry) => entry.state === "NY");
  const monroeWorkbookSource = localReviewManifest.files.find((file) => file.file === "Monroe.xlsx");
  const monroeOfficialSource = localReviewManifest.files.find((file) => file.file === "ny-2024-monroe-canvass-book.pdf");
  const rocklandSource = localReviewManifest.excludedFiles.find((file) => file.file === "Rockland (president only).xlsx");

  assert.equal(inventory.completionDecision.decision, "remain_in_source_discovery_queue");
  assert.equal(discoveryNy.completionDecision.decision, "remain_in_source_discovery_queue");
  assert.equal(nativePackages.completedNativeStates.includes("NY"), false);
  assert.match(config.reviewCharts.warning, /county-certified result totals remain the map authority/);
  assert.equal(localReview.expectedCounts.reviewRows, 10408);
  assert.equal(localReview.expectedCounts.missingCountyEquivalents, 12);
  assert.equal(inventory.completionDecision.reviewCoverage.requestPacketCount, 12);
  assert.equal(inventory.requestPath.countyRequestPackets, "data/ny-2024-missing-county-request-packets.json");
  assert.equal(discoveryNy.requestPacketArtifact, "data/ny-2024-missing-county-request-packets.json");
  assert.equal(requestPackets.packets.length, 12);
  assert.deepEqual(new Set(requestPackets.packets.map((packet) => packet.county)), new Set(inventory.completionDecision.reviewCoverage.excludedOrNotYetReviewedCounties));
  assert.equal(requestPackets.packets.find((packet) => packet.county === "Nassau County").currentReviewStatus, "no_manifest_source_file");
  assert.equal(requestPackets.packets.some((packet) => packet.county === "Monroe County"), false);
  assert.equal(monroeOfficialSource.status, "loaded");
  assert.equal(monroeOfficialSource.rows, 655);
  assert.equal(requestPackets.packets.find((packet) => packet.county === "Rockland County").currentSourceLead.status, "president_only_no_same_grain_us_senate_rows");
  assert.equal(localReview.expectedCounts.zeroRowManifestFiles, 1);
  assert.equal(localReview.expectedCounts.excludedManifestFiles, 12);
  assert.equal(monroeWorkbookSource.status, "excluded_zero_rows");
  assert.match(monroeWorkbookSource.reason, /no U.S. Senate section/);
  assert.equal(rocklandSource.status, "excluded_not_loaded");
  assert.match(rocklandSource.reason, /President-only workbook/);
  assert.ok(localReview.excludedOrNotYetReviewedCounties.includes("Rockland County"));
  assert.equal(localReview.excludedOrNotYetReviewedCounties.includes("Monroe County"), false);
  assert.match(inventory.displayCaveats.join(" "), /EAC turnout rows are fallback context/);
  assert.match(inventory.completionDecision.reason, /turnout is not state-native/);
  assert.match(inventory.completionDecision.wave21Decision, /VEDA is live but has no election data/);
  assert.match(inventory.completionDecision.wave24Decision, /655 official Monroe/);
  assert.match(inventory.completionDecision.wave25Decision, /Oswego County/);
  assert.equal(requestPackets.packets.find((packet) => packet.county === "Oswego County").status, "official_artifacts_found_not_loaded_reconciliation_needed");
  assert.match(inventory.packetFollowThrough[0].confidence, /official_detail_reconciled_loaded/);
  assert.ok(inventory.officialBlockerEvidence.some((entry) => entry.sourceUrl === "https://flateau.elections.ny.gov/downloads" && /Voter Statistics/.test(entry.observed)));
  assert.match(discoveryNy.completionDecision.reason, /12 county equivalents/);
});

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
  assert.match(importer, /!artifact\.capabilities\.certifiedResults/);
  assert.match(importer, /shouldReplaceReviewRows/);
  assert.match(importer, /"nativeReviewRows" in native\.metrics/);
  assert.match(importer, /!artifact\.capabilities\.reviewGraphs/);
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
  assert.match(importer, /certified_results = excluded\.certified_results/);
  assert.match(importer, /if \(native\.turnoutRows\.length > 0\)/);
  assert.doesNotMatch(importer, /parseLegacyBundle/);
  assert.match(script, /promoteNativeStagingArtifact/);
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
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const importer = readFileSync("src/db/native-import.ts", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");
const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
const pipeline = readFileSync("civic_etl/pipeline.py", "utf8");

test("historical promotion replaces only explicitly loaded review years", () => {
  assert.match(importer, /historicalReviewRows\?: NativeReviewRow\[\]/);
  assert.match(importer, /reviewYearsToReplace/);
  assert.match(importer, /for \(const reviewYear of reviewYearsToReplace\)/);
  assert.match(importer, /and election_year = \$\{reviewYear\}/);
  assert.match(importer, /storedHistoricalReviewRows/);
  assert.match(importer, /storedHistoricalIndicatorRows/);
  assert.match(importer, /for \(const historicalReviewYear of historicalReviewYears\)/);
  assert.match(importer, /review_graphs = true/);
});

test("review row storage and API are candidate-neutral with 2024 compatibility", () => {
  for (const column of ["dem_candidate", "rep_candidate", "dem_votes", "rep_votes", "dem_share", "rep_share"]) {
    assert.match(schema, new RegExp(column));
    assert.match(importer, new RegExp(column));
  }
  assert.match(dataAccess, /coalesce\(review_rows\.dem_votes, review_rows\.harris_votes\)/);
  assert.match(dataAccess, /coalesce\(review_rows\.rep_votes, review_rows\.trump_votes\)/);
  assert.match(dataAccess, /demCandidate: row\.demCandidate/);
  assert.match(dataAccess, /repCandidate: row\.repCandidate/);
});

test("historical source election years survive staging metadata", () => {
  assert.match(pipeline, /source\.raw\.get\("metadata", \{\}\)/);
  assert.match(importer, /sourceElectionYear/);
  assert.match(importer, /source\.metadata\?\.electionYear/);
  assert.match(importer, /metadataElectionYears/);
  assert.match(importer, /Math\.max\(\.\.\.metadataElectionYears\)/);
  assert.match(importer, /retargetLegacySourceDocument/);
  assert.match(importer, /update historical_result_rows set source_document_id/);
  assert.match(importer, /delete from source_documents where id/);
  assert.doesNotMatch(importer, /sourceIds\.get\(row\.sourceId\) \?\? primarySourceId/);
});

test("coverage reads capability flags for the selected election year", () => {
  assert.match(dataAccess, /getDatabaseCapabilitySummary/);
  assert.match(dataAccess, /and election_year = \$\{input\.year\}/);
  assert.match(dataAccess, /capabilities: capabilities \?\? emptyCapabilities/);
  assert.match(dataAccess, /capability_flags\.election_year = 2024/);
});

test("historical maps load same-year indicators and distinguish not evaluated", () => {
  assert.match(page, /const needsIndicators = activeTab === "map" \|\| needsReview/);
  assert.match(page, /listIndicators\(\{ state: selectedState, year: selectedYear \}\)/);
  assert.match(page, /listReviewRows\(\{ state: selectedState, year: selectedYear/);
  assert.match(page, /indicatorsEvaluated/);
  assert.match(page, /not been evaluated for advisory indicators/);
  assert.match(page, /indicatorEvaluation\.broadSignalWarning/);
  assert.match(page, /Broad-signal caution/);
  assert.match(explorer, /mapIndicatorsByTag/);
  assert.match(explorer, /indicatorsByTag/);
  assert.match(explorer, /Advisory indicators are not evaluated for this state-year/);
  assert.match(explorer, /demCorrelation/);
  assert.match(explorer, /repCorrelation/);
});
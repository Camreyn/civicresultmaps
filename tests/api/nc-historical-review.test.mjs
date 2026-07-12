import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildNorthCarolinaHistoricalReviewRows,
  expected,
  outputFile,
  serializeNorthCarolinaHistoricalReviewRows,
  source2016,
  source2020,
} from "../../scripts/normalize-nc-historical-review.mjs";

function totals(rows, prefix = "") {
  return rows.reduce(
    (summary, row) => {
      const demVotes = row[`${prefix}dem_votes`];
      const repVotes = row[`${prefix}rep_votes`];
      const otherVotes = row[`${prefix}other_votes`];
      summary.demVotes += demVotes;
      summary.repVotes += repVotes;
      summary.otherVotes += otherVotes;
      summary.totalVotes += prefix ? demVotes + repVotes + otherVotes : row.total_votes;
      return summary;
    },
    { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

test("NC 2020 historical review rows use only official Real Precinct=Y same-grain keys", async () => {
  const result = await buildNorthCarolinaHistoricalReviewRows();

  assert.equal(result.rows.length, expected.includedRealPrecinctKeys);
  assert.equal(result.excludedAdminKeys.length, expected.excludedAdministrativeKeys);
  assert.equal(new Set(result.rows.map((row) => `${row.jurisdiction_tag}|${row.local_unit}`)).size, expected.includedRealPrecinctKeys);
  assert.equal(new Set(result.excludedAdminKeys.map((row) => `${row.jurisdictionTag}|${row.localUnit}`)).size, expected.excludedAdministrativeKeys);
  assert.equal(new Set(result.rows.map((row) => row.jurisdiction_tag)).size, expected.countyTags);
  assert.ok(result.rows.every((row) => /^county:37\d{3}$/.test(row.jurisdiction_tag)));
  assert.ok(result.rows.every((row) => row.level === "precinct" && row.coverage_mode === "presidentVsSenate"));
  assert.ok(result.rows.every((row) => row.dem_candidate === expected.presidential.demCandidate));
  assert.ok(result.rows.every((row) => row.rep_candidate === expected.presidential.repCandidate));
  assert.ok(result.rows.every((row) => row.comparison_contest === expected.comparison.contest));
  assert.ok(result.rows.every((row) => row.comparison_dem_candidate === expected.comparison.demCandidate));
  assert.ok(result.rows.every((row) => row.comparison_rep_candidate === expected.comparison.repCandidate));
  assert.ok(result.rows.every((row) => row.source_id === source2020.sourceId && row.comparison_source_id === source2020.sourceId));
  assert.ok(result.rows.every((row) => row.source_url === source2020.sourceUrl));
  assert.ok(result.excludedAdminKeys.every((row) => row.realPrecinct === "N" && /^county:37\d{3}$/.test(row.jurisdictionTag)));

  assert.deepEqual(totals(result.rows), expected.presidential.included);
  assert.deepEqual(totals(result.rows, "comparison_"), expected.comparison.included);
  assert.deepEqual(result.summary.presidential.excluded, expected.presidential.excluded);
  assert.deepEqual(result.summary.presidential.source, expected.presidential.source);
  assert.deepEqual(result.summary.comparison.excluded, expected.comparison.excluded);
  assert.deepEqual(result.summary.comparison.source, expected.comparison.source);
  assert.equal(result.summary.presidential.included.totalVotes + result.summary.presidential.excluded.totalVotes, result.summary.presidential.source.totalVotes);
  assert.equal(result.summary.comparison.included.totalVotes + result.summary.comparison.excluded.totalVotes, result.summary.comparison.source.totalVotes);

  assert.deepEqual(result.evaluation2016, {
    electionYear: 2016,
    evaluated: false,
    status: "not_evaluated",
    reasonCode: "official_export_missing_real_precinct_column",
    reason: "The official 2016 NCSBE export predates the Real Precinct field. Administrative units cannot be excluded without inferring geography from labels, so no 2016 advisory review rows are produced.",
    sourceId: source2016.sourceId,
    sourceUrl: source2016.sourceUrl,
    localFile: source2016.localFile,
    realPrecinctColumnPresent: false,
  });

  assert.equal(await readFile(outputFile, "utf8"), serializeNorthCarolinaHistoricalReviewRows(result.rows));
});

test("NC config exposes year-aware historical review provenance and the 2016 exclusion", async () => {
  const config = JSON.parse(await readFile("etl/state-configs/nc.json", "utf8"));
  const sourceById = new Map(config.sources.map((source) => [source.id, source]));
  const raw2020 = sourceById.get(source2020.sourceId);
  const normalized2020 = sourceById.get("nc-2020-historical-review-rows");
  const excluded2016 = sourceById.get(source2016.sourceId);

  assert.equal(config.sources.length, 10);
  assert.equal(config.expected.sources, 10);
  assert.equal(config.expected.historicalReviewRows, expected.includedRealPrecinctKeys);
  assert.equal(raw2020.electionYear, 2020);
  assert.equal(raw2020.localFile, source2020.localFile);
  assert.equal(raw2020.status, "loaded");
  assert.equal(normalized2020.electionYear, 2020);
  assert.equal(normalized2020.localFile, outputFile);
  assert.equal(normalized2020.parser, "historicalReviewCsv");
  assert.equal(normalized2020.derivedFrom, source2020.sourceId);
  assert.equal(excluded2016.electionYear, 2016);
  assert.equal(excluded2016.localFile, source2016.localFile);
  assert.equal(excluded2016.status, "documented_exclusion");

  assert.equal(config.historicalReview.sourceId, normalized2020.id);
  assert.deepEqual(config.historicalReview.evaluatedYears, [2020]);
  assert.equal(config.historicalReview.expected.rowCount, expected.includedRealPrecinctKeys);
  assert.deepEqual(config.historicalReview.expected.rowCountsByYear, { "2020": expected.includedRealPrecinctKeys });
  assert.equal(config.historicalReview.realPrecinctFilter.includedReportingUnitKeys, expected.includedRealPrecinctKeys);
  assert.equal(config.historicalReview.realPrecinctFilter.excludedAdministrativeKeys, expected.excludedAdministrativeKeys);
  assert.equal(config.historicalReview.notEvaluatedYears[0].electionYear, 2016);
  assert.equal(config.historicalReview.notEvaluatedYears[0].reasonCode, "official_export_missing_real_precinct_column");
  assert.match(config.historicalReview.notEvaluatedYears[0].reason, /without inferring geography from labels/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildGeorgiaHistoricalReviewRows,
  outputFile,
  serializeGeorgiaHistoricalReviewRows,
  yearSpecs,
} from "../../scripts/normalize-ga-historical-review.mjs";

const built = await buildGeorgiaHistoricalReviewRows();
const config = JSON.parse(await readFile("etl/state-configs/ga.json", "utf8"));

function rowsForYear(year) {
  return built.rows.filter((row) => row.election_year === year);
}

function rowSummary(rows, prefix = "") {
  return rows.reduce(
    (summary, row) => ({
      demCandidate: row[`${prefix}dem_candidate`],
      repCandidate: row[`${prefix}rep_candidate`],
      demVotes: summary.demVotes + row[`${prefix}dem_votes`],
      repVotes: summary.repVotes + row[`${prefix}rep_votes`],
      otherVotes: summary.otherVotes + row[`${prefix}other_votes`],
      totalVotes: summary.totalVotes + (
        prefix
          ? row[`${prefix}dem_votes`] + row[`${prefix}rep_votes`] + row[`${prefix}other_votes`]
          : row.total_votes
      ),
    }),
    { demCandidate: "", repCandidate: "", demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

test("Georgia historical review normalizer emits 159 canonical county rows per year", () => {
  assert.equal(built.rows.length, 318);
  const tagSets = [];
  for (const spec of yearSpecs) {
    const rows = rowsForYear(spec.year);
    assert.equal(rows.length, 159);
    assert.ok(rows.every((row) => row.state === "GA" && row.level === "county"));
    assert.ok(rows.every((row) => row.county === row.local_unit));
    assert.ok(rows.every((row) => /^county:13\d{3}$/.test(row.jurisdiction_tag)));
    const tags = [...new Set(rows.map((row) => row.jurisdiction_tag))].sort();
    assert.equal(tags.length, 159);
    tagSets.push(tags);
  }
  assert.deepEqual(tagSets[0], tagSets[1]);
});

test("Georgia county sums exactly reconcile to official statewide President and Senate totals", () => {
  for (const spec of yearSpecs) {
    const rows = rowsForYear(spec.year);
    assert.deepEqual(rowSummary(rows), spec.expected.presidential);
    assert.deepEqual(rowSummary(rows, "comparison_"), spec.expected.comparison);
  }
});

test("Georgia 2020 review rows use the regular Perdue contest and preserve source candidate labels", () => {
  const rows = rowsForYear(2020);
  assert.ok(rows.every((row) => row.comparison_contest === "US Senate (Perdue)"));
  assert.ok(rows.every((row) => !/Loeffler|Special/i.test(row.comparison_contest)));
  assert.deepEqual([...new Set(rows.map((row) => row.dem_candidate))], ["Joseph R. Biden (Dem)"]);
  assert.deepEqual([...new Set(rows.map((row) => row.rep_candidate))], ["Donald J. Trump (I) (Rep)"]);
  assert.deepEqual([...new Set(rows.map((row) => row.comparison_dem_candidate))], ["Jon Ossoff (Dem)"]);
  assert.deepEqual([...new Set(rows.map((row) => row.comparison_rep_candidate))], ["David A. Perdue (I) (Rep)"]);
  assert.ok(rows.every((row) => row.source_id === "ga-2020-official-results"));
  assert.ok(rows.every((row) => row.comparison_source_id === "ga-2020-official-results"));
});

test("Georgia selected historical contests expose no precinct-result rows", () => {
  assert.deepEqual(
    built.summaries.map((summary) => [summary.year, summary.selectedPrecinctResultRows]),
    [[2016, 0], [2020, 0]],
  );
});

test("Georgia historical-review config records year-specific provenance and exact expectations", () => {
  assert.equal(config.historicalReview.format, "historicalReviewCsv");
  assert.equal(config.historicalReview.sourceId, "ga-historical-review-rows");
  assert.deepEqual(config.historicalReview.expected, {
    rowCount: 318,
    years: [2016, 2020],
    rowCountsByYear: { 2016: 159, 2020: 159 },
  });
  const sources = new Map(config.sources.map((source) => [source.id, source]));
  assert.equal(sources.get("ga-2016-official-results").electionYear, 2016);
  assert.equal(sources.get("ga-2020-official-results").electionYear, 2020);
  assert.equal(sources.get("ga-historical-review-rows").localFile, outputFile);
  assert.equal(sources.get("ga-historical-review-rows").parser, "historicalReviewCsv");
});

test("committed Georgia historical-review CSV is deterministic", async () => {
  const committed = await readFile(outputFile, "utf8");
  const normalizedCommitted = committed.replaceAll("\r\n", "\n");
  assert.equal(normalizedCommitted, serializeGeorgiaHistoricalReviewRows(built.rows));
});

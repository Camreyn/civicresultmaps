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
      const demVotes = row[prefix + "dem_votes"];
      const repVotes = row[prefix + "rep_votes"];
      const otherVotes = row[prefix + "other_votes"];
      summary.demVotes += demVotes;
      summary.repVotes += repVotes;
      summary.otherVotes += otherVotes;
      summary.totalVotes += prefix ? demVotes + repVotes + otherVotes : row.total_votes;
      return summary;
    },
    { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 },
  );
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  assert.equal(quoted, false);
  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift());
  return lines.map((line) => {
    const cells = splitCsvLine(line);
    assert.equal(cells.length, headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

function countyKey(value) {
  return String(value).replace(/\s+County$/i, "").trim().toUpperCase();
}

test("NC 2016 historical review rows are official county aggregates matching the presidential baseline", async () => {
  const result = await buildNorthCarolinaHistoricalReviewRows();
  const rows = result.rows2016;

  assert.equal(rows.length, expected.county2016.rowCount);
  assert.equal(new Set(rows.map((row) => row.jurisdiction_tag)).size, expected.county2016.rowCount);
  assert.ok(rows.every((row) => /^county:37\d{3}$/.test(row.jurisdiction_tag)));
  assert.ok(rows.every((row) => row.level === "county" && row.local_unit === row.county));
  assert.ok(rows.every((row) => row.coverage_mode === "presidentVsUSSenateCounty"));
  assert.ok(rows.every((row) => row.dem_candidate === expected.county2016.presidential.demCandidate));
  assert.ok(rows.every((row) => row.rep_candidate === expected.county2016.presidential.repCandidate));
  assert.ok(rows.every((row) => row.comparison_contest === expected.county2016.comparison.contest));
  assert.ok(rows.every((row) => row.comparison_dem_candidate === expected.county2016.comparison.demCandidate));
  assert.ok(rows.every((row) => row.comparison_rep_candidate === expected.county2016.comparison.repCandidate));
  assert.ok(rows.every((row) => row.source_id === source2016.sourceId && row.comparison_source_id === source2016.sourceId));
  assert.ok(rows.every((row) => row.source_url === source2016.sourceUrl));

  assert.deepEqual(totals(rows), {
    demVotes: expected.county2016.presidential.demVotes,
    repVotes: expected.county2016.presidential.repVotes,
    otherVotes: expected.county2016.presidential.otherVotes,
    totalVotes: expected.county2016.presidential.totalVotes,
  });
  assert.deepEqual(totals(rows, "comparison_"), {
    demVotes: expected.county2016.comparison.demVotes,
    repVotes: expected.county2016.comparison.repVotes,
    otherVotes: expected.county2016.comparison.otherVotes,
    totalVotes: expected.county2016.comparison.totalVotes,
  });
  assert.equal(result.summaries["2016"].reportingKeys, expected.county2016.reportingKeys);
  assert.equal(result.summaries["2016"].signedAdjustmentRows, expected.county2016.signedAdjustmentRows);
  assert.equal(result.summaries["2016"].signedAdjustmentVotes, expected.county2016.signedAdjustmentVotes);
  assert.equal(result.summaries["2016"].baselineCountyMatches, expected.county2016.rowCount);

  const baselineRows = parseCsv(await readFile("data/nc-historical-presidential-baseline.csv", "utf8"))
    .filter((row) => Number(row.election_year) === 2016);
  assert.equal(baselineRows.length, expected.county2016.rowCount);
  const reviewByCounty = new Map(rows.map((row) => [countyKey(row.county), row]));
  for (const baseline of baselineRows) {
    const review = reviewByCounty.get(countyKey(baseline.county));
    assert.ok(review, baseline.county);
    assert.deepEqual(
      [review.dem_votes, review.rep_votes, review.other_votes, review.total_votes],
      [baseline.dem_votes, baseline.rep_votes, baseline.other_votes, baseline.total_votes].map(Number),
      baseline.county,
    );
  }
});

test("NC 2020 historical review rows remain official Real Precinct=Y same-grain keys", async () => {
  const result = await buildNorthCarolinaHistoricalReviewRows();
  const rows = result.rows2020;
  const excluded = result.excludedAdminKeys2020;
  const summary = result.summaries["2020"];

  assert.equal(result.rows.length, expected.county2016.rowCount + expected.includedRealPrecinctKeys);
  assert.equal(rows.length, expected.includedRealPrecinctKeys);
  assert.equal(excluded.length, expected.excludedAdministrativeKeys);
  assert.equal(new Set(rows.map((row) => row.jurisdiction_tag + "|" + row.local_unit)).size, expected.includedRealPrecinctKeys);
  assert.equal(new Set(excluded.map((row) => row.jurisdictionTag + "|" + row.localUnit)).size, expected.excludedAdministrativeKeys);
  assert.equal(new Set(rows.map((row) => row.jurisdiction_tag)).size, expected.countyTags);
  assert.ok(rows.every((row) => /^county:37\d{3}$/.test(row.jurisdiction_tag)));
  assert.ok(rows.every((row) => row.level === "precinct" && row.coverage_mode === "presidentVsSenate"));
  assert.ok(rows.every((row) => row.dem_candidate === expected.presidential.demCandidate));
  assert.ok(rows.every((row) => row.rep_candidate === expected.presidential.repCandidate));
  assert.ok(rows.every((row) => row.comparison_contest === expected.comparison.contest));
  assert.ok(rows.every((row) => row.comparison_dem_candidate === expected.comparison.demCandidate));
  assert.ok(rows.every((row) => row.comparison_rep_candidate === expected.comparison.repCandidate));
  assert.ok(rows.every((row) => row.source_id === source2020.sourceId && row.comparison_source_id === source2020.sourceId));
  assert.ok(rows.every((row) => row.source_url === source2020.sourceUrl));
  assert.ok(excluded.every((row) => row.realPrecinct === "N" && /^county:37\d{3}$/.test(row.jurisdictionTag)));

  assert.deepEqual(totals(rows), expected.presidential.included);
  assert.deepEqual(totals(rows, "comparison_"), expected.comparison.included);
  assert.deepEqual(summary.presidential.excluded, expected.presidential.excluded);
  assert.deepEqual(summary.presidential.source, expected.presidential.source);
  assert.deepEqual(summary.comparison.excluded, expected.comparison.excluded);
  assert.deepEqual(summary.comparison.source, expected.comparison.source);
  assert.equal(summary.presidential.included.totalVotes + summary.presidential.excluded.totalVotes, summary.presidential.source.totalVotes);
  assert.equal(summary.comparison.included.totalVotes + summary.comparison.excluded.totalVotes, summary.comparison.source.totalVotes);

  assert.equal(await readFile(outputFile, "utf8"), serializeNorthCarolinaHistoricalReviewRows(result.rows));
});

test("NC config exposes both evaluated historical review years and year-specific provenance", async () => {
  const config = JSON.parse(await readFile("etl/state-configs/nc.json", "utf8"));
  const sourceById = new Map(config.sources.map((source) => [source.id, source]));
  const raw2016 = sourceById.get(source2016.sourceId);
  const raw2020 = sourceById.get(source2020.sourceId);
  const normalized = sourceById.get("nc-2020-historical-review-rows");

  assert.equal(config.sources.length, 11);
  assert.equal(config.expected.sources, 11);
  assert.equal(config.expected.historicalReviewRows, expected.county2016.rowCount + expected.includedRealPrecinctKeys);
  assert.equal(raw2016.electionYear, 2016);
  assert.equal(raw2016.localFile, source2016.localFile);
  assert.equal(raw2016.status, "loaded");
  assert.match(raw2016.reportingGrain, /county grain/i);
  assert.equal(raw2020.electionYear, 2020);
  assert.equal(raw2020.localFile, source2020.localFile);
  assert.equal(raw2020.status, "loaded");
  assert.equal(normalized.electionYear, 2020);
  assert.equal(normalized.localFile, outputFile);
  assert.equal(normalized.parser, "historicalReviewCsv");
  assert.deepEqual(normalized.metadata.electionYears, [2016, 2020]);
  assert.deepEqual(normalized.metadata.officialInputSourceIds, [source2016.sourceId, source2020.sourceId]);

  assert.equal(config.historicalReview.sourceId, normalized.id);
  assert.deepEqual(config.historicalReview.evaluatedYears, [2016, 2020]);
  assert.equal(config.historicalReview.expected.rowCount, expected.county2016.rowCount + expected.includedRealPrecinctKeys);
  assert.deepEqual(config.historicalReview.expected.rowCountsByYear, {
    "2016": expected.county2016.rowCount,
    "2020": expected.includedRealPrecinctKeys,
  });
  assert.equal(config.historicalReview.countyAggregation2016.baselineCountyMatches, expected.county2016.rowCount);
  assert.equal(config.historicalReview.countyAggregation2016.signedSourceAdjustmentRows, expected.county2016.signedAdjustmentRows);
  assert.equal(config.historicalReview.realPrecinctFilter.electionYear, 2020);
  assert.equal(config.historicalReview.realPrecinctFilter.includedReportingUnitKeys, expected.includedRealPrecinctKeys);
  assert.equal(config.historicalReview.realPrecinctFilter.excludedAdministrativeKeys, expected.excludedAdministrativeKeys);
  assert.match(config.historicalReview.warning, /no precinct-level claim/i);
  assert.match(config.historicalReview.warning, /not proof of fraud or misconduct/i);
});

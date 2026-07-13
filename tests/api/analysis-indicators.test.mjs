import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  calculateAnalysisIndicators,
  isComparableDownBallotRow,
  summarizeIndicatorEvaluation,
} from "../../src/lib/analysis-indicators.ts";
import { buildStagingIndicatorReport } from "../../scripts/report-staging-indicator-counts.mjs";

function precinctRows({ year = 2020, count = 10, coverageMode = "presidentVsSenate" } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const demVotes = 120 + index * 45;
    const repVotes = 500 - index * 25;
    const totalVotes = demVotes + repVotes + 20;
    return {
      comparisonContest: "United States Senator",
      comparisonDemCandidate: year === 2016 ? "Ann Kirkpatrick" : "Mark Kelly",
      comparisonDemCandidatePresent: true,
      comparisonDemVotes: Math.max(1, demVotes - 25),
      comparisonRepCandidate: year === 2016 ? "John McCain" : "Martha McSally",
      comparisonRepCandidatePresent: true,
      comparisonRepVotes: Math.max(1, repVotes - 10),
      county: "Example County",
      coverageMode,
      demCandidate: year === 2016 ? "Hillary Clinton" : "Joe Biden",
      demDropoff: ((demVotes - Math.max(1, demVotes - 25)) / totalVotes) * 100,
      demShare: (demVotes / totalVotes) * 100,
      demVotes,
      electionYear: year,
      jurisdictionTag: "county:04001",
      localUnit: `Precinct ${index + 1}`,
      repCandidate: "Donald Trump",
      repDropoff: ((repVotes - Math.max(1, repVotes - 10)) / totalVotes) * 100,
      repShare: (repVotes / totalVotes) * 100,
      repVotes,
      sourceId: `az-${year}-official-review`,
      totalVotes,
    };
  });
}

test("candidate-neutral calculator preserves historical year, labels, and county tag", () => {
  const indicators = calculateAnalysisIndicators("AZ", precinctRows({ year: 2016 }));
  const voteShare = indicators.find((indicator) => indicator.type === "vote_share_pattern");

  assert.ok(voteShare);
  assert.equal(voteShare.electionYear, 2016);
  assert.equal(voteShare.jurisdictionTag, "county:04001");
  assert.equal(voteShare.metrics.demCandidate, "Hillary Clinton");
  assert.equal(voteShare.metrics.repCandidate, "Donald Trump");
  assert.equal(voteShare.metrics.directionalScreenConfidence, "low");
  assert.match(voteShare.summary, /Hillary Clinton/);
  assert.doesNotMatch(voteShare.summary, /Kamala Harris/);
});

test("legacy 2024 Harris and Trump fields remain calculable", () => {
  const rows = precinctRows({ year: 2024 }).map((row) => ({
    ...row,
    demCandidate: undefined,
    demShare: undefined,
    demVotes: undefined,
    harris: row.demVotes,
    harrisShare: row.demShare,
    repCandidate: undefined,
    repShare: undefined,
    repVotes: undefined,
    trump: row.repVotes,
    trumpShare: row.repShare,
  }));
  const indicators = calculateAnalysisIndicators("AZ", rows);

  assert.ok(indicators.some((indicator) => indicator.type === "vote_share_pattern"));
  assert.ok(indicators.every((indicator) => indicator.electionYear === 2024));
});

test("multi-district and one-sided House rows stay outside down-ballot calculations", () => {
  const multiDistrict = precinctRows({ coverageMode: "multiDistrictHouseComparison" })[0];
  const oneSided = precinctRows({ coverageMode: "oneSidedHouseComparison" })[0];

  assert.equal(isComparableDownBallotRow(multiDistrict), false);
  assert.equal(isComparableDownBallotRow(oneSided), false);
});

test("fewer than eight local rows do not emit county-scope pattern flags", () => {
  const indicators = calculateAnalysisIndicators("AZ", precinctRows({ count: 7 }));

  assert.deepEqual(indicators, []);
});

test("same-grain county comparison rows can emit county distribution indicators", () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({
    comparisonContest: "United States Senator",
    comparisonDemCandidate: "Mark Kelly",
    comparisonDemCandidatePresent: true,
    comparisonDemVotes: 900,
    comparisonRepCandidate: "Martha McSally",
    comparisonRepCandidatePresent: true,
    comparisonRepVotes: 900,
    county: `County ${index + 1}`,
    coverageMode: "presidentVsSenate",
    demCandidate: "Joe Biden",
    demDropoff: index === 14 ? 12 : 1 + index / 20,
    demShare: 50,
    demVotes: 1000,
    electionYear: 2020,
    jurisdictionTag: `county:04${String(index + 1).padStart(3, "0")}`,
    localUnit: `County ${index + 1}`,
    repCandidate: "Donald Trump",
    repDropoff: 1,
    repShare: 48,
    repVotes: 960,
    sourceId: "az-2020-official-review",
    totalVotes: 2000,
  }));
  const indicators = calculateAnalysisIndicators("AZ", rows);
  const extreme = indicators.find((indicator) => indicator.type === "county_down_ballot_distribution" && indicator.county === "County 15");

  assert.ok(extreme);
  assert.equal(extreme.electionYear, 2020);
  assert.equal(extreme.jurisdictionTag, "county:04015");
});

test("evaluation summary warns when at least half of evaluated counties are flagged", () => {
  const summary = summarizeIndicatorEvaluation(
    [{ county: "Alpha" }, { county: "Beta" }],
    [{
      county: "Alpha",
      jurisdictionCode: "GA-ALPHA",
      jurisdictionName: "Alpha",
      level: "county",
      scopeKey: "county:GA-ALPHA",
    }],
  );

  assert.equal(summary.evaluatedCountyJurisdictions, 2);
  assert.equal(summary.uniqueFlaggedCountyJurisdictions, 1);
  assert.equal(summary.flaggedCountyRate, 0.5);
  assert.match(summary.broadSignalWarning, /At least half/);
});

test("year-aware staging report distinguishes evaluated historical rows from missing data", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "crm-historical-indicators-"));
  try {
    writeFileSync(
      path.join(directory, "az-2024-staging.json"),
      JSON.stringify({
        election: { year: 2024 },
        native: {
          historicalReviewRows: precinctRows({ year: 2020 }),
          metrics: {
            nativeHistoricalReviewWarning: "Historical comparison caveat.",
            nativeReviewWarning: "Current comparison caveat.",
          },
          reviewRows: [],
        },
        state: { code: "AZ" },
      }),
    );
    const report = await buildStagingIndicatorReport({ stagingDir: directory, year: 2020 });

    assert.equal(report.year, 2020);
    assert.equal(report.evaluatedStates, 1);
    assert.equal(report.notEvaluatedStates, 0);
    assert.equal(report.states[0].evaluationReason, "same-grain_review_rows_loaded");
    assert.equal(report.states[0].reviewRows, 10);
    assert.equal(report.states[0].evaluatedCountyJurisdictions, 1);
    assert.ok(report.states[0].indicatorRows > 0);
    assert.equal(report.states[0].evaluationCaveat, "Historical comparison caveat.");

    const currentReport = await buildStagingIndicatorReport({ stagingDir: directory, year: 2024 });
    assert.equal(currentReport.states[0].evaluationCaveat, "Current comparison caveat.");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
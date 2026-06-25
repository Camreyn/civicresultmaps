import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { reviewPolicy } from "../src/lib/review-policy.ts";

const stagingDir = process.argv[2] ?? ".etl/staging";

function normalizeJurisdictionName(name) {
  return String(name ?? "").trim().replace(/\s+County$/i, "");
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function pearsonSafe(xs, ys) {
  const pairs = xs
    .map((x, index) => [x, ys[index]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (pairs.length < 2) {
    return 0;
  }

  const xAverage = average(pairs.map(([x]) => x));
  const yAverage = average(pairs.map(([, y]) => y));
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - xAverage) * (y - yAverage), 0);
  const xDenominator = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - xAverage) ** 2, 0));
  const yDenominator = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - yAverage) ** 2, 0));

  return xDenominator && yDenominator ? numerator / (xDenominator * yDenominator) : 0;
}

function indicatorsForReviewRows(rows) {
  const byCounty = new Map();

  for (const row of rows) {
    if (!row.county) {
      continue;
    }

    const county = normalizeJurisdictionName(row.county);
    byCounty.set(county, [...(byCounty.get(county) ?? []), row]);
  }

  const indicators = [];

  for (const [county, countyRows] of byCounty) {
    if (countyRows.length < reviewPolicy.minWardRows) {
      continue;
    }

    const trumpCorrelation = pearsonSafe(
      countyRows.map((row) => row.trump ?? 0),
      countyRows.map((row) => row.trumpShare ?? 0),
    );
    const harrisCorrelation = pearsonSafe(
      countyRows.map((row) => row.harris ?? 0),
      countyRows.map((row) => row.harrisShare ?? 0),
    );
    const demAverageDropoff = average(countyRows.map((row) => row.demDropoff ?? 0));
    const repAverageDropoff = average(countyRows.map((row) => row.repDropoff ?? 0));
    const demOutliers = countyRows.filter(
      (row) =>
        (row.harris ?? 0) >= reviewPolicy.minCandidateVotes &&
        Math.abs(row.demDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
    ).length;
    const repOutliers = countyRows.filter(
      (row) =>
        (row.trump ?? 0) >= reviewPolicy.minCandidateVotes &&
        Math.abs(row.repDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
    ).length;
    const outlierTrigger = Math.max(3, Math.ceil(countyRows.length * 0.05));

    if (
      Math.abs(trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
      Math.abs(harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
    ) {
      indicators.push({ county, type: "vote_share_pattern" });
    }

    if (
      Math.abs(demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
      Math.abs(repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct
    ) {
      indicators.push({ county, type: "average_down_ballot_difference" });
    }

    if (demOutliers + repOutliers >= outlierTrigger) {
      indicators.push({ county, type: "down_ballot_outliers" });
    }
  }

  return indicators;
}

function countByType(indicators) {
  return indicators.reduce((counts, indicator) => {
    counts[indicator.type] = (counts[indicator.type] ?? 0) + 1;
    return counts;
  }, {});
}

const files = (await readdir(stagingDir))
  .filter((file) => /-2024-staging\.json$/i.test(file))
  .sort();

const rows = [];

for (const file of files) {
  const artifact = JSON.parse(await readFile(path.join(stagingDir, file), "utf8"));
  const state = String(artifact.state?.code ?? file.slice(0, 2)).toUpperCase();
  const reviewRows = artifact.native?.reviewRows ?? [];
  const indicators = indicatorsForReviewRows(reviewRows);
  rows.push({
    state,
    reviewRows: reviewRows.length,
    uniqueFlaggedJurisdictions: new Set(indicators.map((indicator) => indicator.county)).size,
    indicatorRows: indicators.length,
    byType: countByType(indicators),
  });
}

console.log(JSON.stringify({ policy: reviewPolicy, states: rows }, null, 2));
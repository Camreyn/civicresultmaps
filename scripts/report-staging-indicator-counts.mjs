import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { calculateAnalysisIndicators, summarizeIndicatorEvaluation } from "../src/lib/analysis-indicators.ts";
import { reviewPolicy } from "../src/lib/review-policy.ts";

function parseArgs(argv) {
  let stagingDir = ".etl/staging";
  let year = 2024;
  for (const arg of argv) {
    if (arg.startsWith("--staging-dir=")) {
      stagingDir = arg.slice("--staging-dir=".length);
    } else if (arg.startsWith("--year=")) {
      year = Number(arg.slice("--year=".length));
    } else if (!arg.startsWith("--")) {
      stagingDir = arg;
    }
  }
  if (![2016, 2020, 2024].includes(year)) {
    throw new Error("Indicator report year must be 2016, 2020, or 2024.");
  }
  return { stagingDir, year };
}

function countBy(indicators, key) {
  return indicators.reduce((counts, indicator) => {
    const value = indicator[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function currentReviewRows(artifact, year) {
  return (artifact.native?.reviewRows ?? []).map((row) => ({
    ...row,
    demCandidate: row.demCandidate ?? "Kamala Harris",
    demShare: row.demShare ?? row.harrisShare,
    demVotes: row.demVotes ?? row.harris,
    electionYear: year,
    level: row.level ?? "local",
    repCandidate: row.repCandidate ?? "Donald Trump",
    repShare: row.repShare ?? row.trumpShare,
    repVotes: row.repVotes ?? row.trump,
  }));
}

function reviewRowsForYear(artifact, year) {
  const artifactYear = Number(artifact.election?.year ?? 2024);
  if (year === artifactYear) {
    return currentReviewRows(artifact, year);
  }
  return (artifact.native?.historicalReviewRows ?? []).filter((row) => Number(row.electionYear) === year);
}

export async function buildStagingIndicatorReport({ stagingDir = ".etl/staging", year = 2024 } = {}) {
  if (![2016, 2020, 2024].includes(year)) {
    throw new Error("Indicator report year must be 2016, 2020, or 2024.");
  }
  const files = (await readdir(stagingDir))
    .filter((file) => /-2024-staging\.json$/i.test(file))
    .sort();
  const states = [];

  for (const file of files) {
    const artifact = JSON.parse(await readFile(path.join(stagingDir, file), "utf8"));
    const state = String(artifact.state?.code ?? file.slice(0, 2)).toUpperCase();
    const reviewRows = reviewRowsForYear(artifact, year);
    const indicators = calculateAnalysisIndicators(state, reviewRows);
    const evaluation = summarizeIndicatorEvaluation(reviewRows, indicators);
    const countyIndicators = indicators.filter((indicator) => indicator.level === "county");
    const evaluated = reviewRows.length > 0;
    states.push({
      state,
      year,
      evaluated,
      evaluationReason: evaluated
        ? "same-grain_review_rows_loaded"
        : year === Number(artifact.election?.year ?? 2024)
          ? "no_review_rows"
          : "no_historical_review_rows",
      reviewRows: reviewRows.length,
      evaluationCaveat: year === Number(artifact.election?.year ?? 2024)
        ? artifact.native?.metrics?.nativeReviewWarning ?? null
        : artifact.native?.metrics?.nativeHistoricalReviewWarning ?? null,
      comparisonCoverageModes: Array.from(new Set(reviewRows.map((row) => row.coverageMode).filter(Boolean))).sort(),
      evaluatedCountyJurisdictions: evaluation.evaluatedCountyJurisdictions,
      uniqueFlaggedJurisdictions: evaluation.uniqueFlaggedJurisdictions,
      uniqueFlaggedCountyJurisdictions: evaluation.uniqueFlaggedCountyJurisdictions,
      flaggedCountyRate: evaluation.flaggedCountyRate,
      broadSignalWarning: evaluation.broadSignalWarning,
      flaggedAreas: evaluation.flaggedAreas,
      indicatorRows: indicators.length,
      countyIndicatorRows: countyIndicators.length,
      byLevel: countBy(indicators, "level"),
      byType: countBy(indicators, "type"),
    });
  }

  return {
    policy: reviewPolicy,
    stagingDir,
    year,
    evaluatedStates: states.filter((state) => state.evaluated).length,
    notEvaluatedStates: states.filter((state) => !state.evaluated).length,
    states,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(await buildStagingIndicatorReport(options), null, 2));
}
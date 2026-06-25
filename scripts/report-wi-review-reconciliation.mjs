import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { reviewPolicy } from "../src/lib/review-policy.ts";

const stagingPath = process.argv[2] ?? ".etl/staging/wi-2024-staging.json";
const legacyEtaPath = process.argv[3] ?? ".etl/wi-old-eta-data.js";
const outPath = process.argv[4] ?? "data/wi-2024-review-reconciliation.json";
const legacyMinimumRows = 10;
const focusCounties = ["Walworth", "Eau Claire", "Ozaukee", "Outagamie", "Florence"];

function normalizeCountyName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+County$/i, "")
    .replace(/\bDu\b/g, "du");
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

function rowsByCounty(rows) {
  const byCounty = new Map();
  for (const row of rows) {
    const county = normalizeCountyName(row.county);
    if (!county) {
      continue;
    }
    byCounty.set(county, [...(byCounty.get(county) ?? []), row]);
  }
  return byCounty;
}

function metricsForRows(rows) {
  const trumpCorrelation = pearsonSafe(
    rows.map((row) => row.trump ?? 0),
    rows.map((row) => row.trumpShare ?? 0),
  );
  const harrisCorrelation = pearsonSafe(
    rows.map((row) => row.harris ?? 0),
    rows.map((row) => row.harrisShare ?? 0),
  );
  const demAverageDropoff = average(rows.map((row) => row.demDropoff ?? 0));
  const repAverageDropoff = average(rows.map((row) => row.repDropoff ?? 0));
  const demOutliers = rows.filter(
    (row) =>
      (row.harris ?? 0) >= reviewPolicy.minCandidateVotes &&
      Math.abs(row.demDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
  ).length;
  const repOutliers = rows.filter(
    (row) =>
      (row.trump ?? 0) >= reviewPolicy.minCandidateVotes &&
      Math.abs(row.repDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
  ).length;
  const outlierTrigger = Math.max(3, Math.ceil(rows.length * 0.05));

  return {
    demAverageDropoff: Number(demAverageDropoff.toFixed(6)),
    demOutliers,
    harrisCorrelation: Number(harrisCorrelation.toFixed(6)),
    outlierTrigger,
    repAverageDropoff: Number(repAverageDropoff.toFixed(6)),
    repOutliers,
    rowCount: rows.length,
    trumpCorrelation: Number(trumpCorrelation.toFixed(6)),
  };
}

function flagsForMetrics(metrics) {
  const flags = [];
  if (
    Math.abs(metrics.trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
    Math.abs(metrics.harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
  ) {
    flags.push("vote_share_pattern");
  }
  if (
    Math.abs(metrics.demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
    Math.abs(metrics.repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct
  ) {
    flags.push("average_down_ballot_difference");
  }
  if (metrics.demOutliers + metrics.repOutliers >= metrics.outlierTrigger) {
    flags.push("down_ballot_outliers");
  }
  return flags;
}

function countyIndicators(rows, minimumRows) {
  const indicators = [];
  const metricsByCounty = {};
  for (const [county, countyRows] of rowsByCounty(rows)) {
    const metrics = metricsForRows(countyRows);
    metricsByCounty[county] = metrics;
    if (countyRows.length < minimumRows) {
      continue;
    }
    for (const type of flagsForMetrics(metrics)) {
      indicators.push({ county, type, metrics });
    }
  }
  return { indicators, metricsByCounty };
}

function countByType(indicators) {
  return indicators.reduce((counts, indicator) => {
    counts[indicator.type] = (counts[indicator.type] ?? 0) + 1;
    return counts;
  }, {});
}

function loadLegacyRows(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: legacyEtaPath });
  const rows = sandbox.window.ETA_WARD_CHARTS?.metadata?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`Could not load ETA_WARD_CHARTS.metadata.rows from ${legacyEtaPath}`);
  }
  return rows;
}

function sortedSetDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort((a, b) => a.localeCompare(b));
}

function explanationForCounty(county) {
  if (county === "Florence") {
    return "Current-only because the current review policy uses minWardRows=8 and Florence has enough rows to evaluate; the legacy comparison target used a 10-row inclusion floor and skipped it.";
  }

  if (["Walworth", "Eau Claire", "Ozaukee", "Outagamie"].includes(county)) {
    return "Old-only because the legacy bundle's precomputed Senate comparison/drop-off values cross the average down-ballot threshold, while current staging recalculates from normalized WEC President and U.S. Senate rows and falls below threshold. This is a source row normalization and Senate comparison math delta, not a forced threshold change.";
  }

  return "No special reconciliation note.";
}

function scopedMetricSummary(metrics, minimumRows) {
  const included = Boolean(metrics && metrics.rowCount >= minimumRows);
  return {
    flags: included && metrics ? flagsForMetrics(metrics) : [],
    included,
    minimumRows,
    metrics: metrics ?? null,
    wouldFlagIfIncluded: metrics ? flagsForMetrics(metrics) : [],
  };
}

function metricDelta(county, currentMetrics, legacyMetrics) {
  return {
    county,
    explanation: explanationForCounty(county),
    current: scopedMetricSummary(currentMetrics, reviewPolicy.minWardRows),
    legacy: scopedMetricSummary(legacyMetrics, legacyMinimumRows),
  };
}

const [stagingText, legacyText] = await Promise.all([readFile(stagingPath, "utf8"), readFile(legacyEtaPath, "utf8")]);
const staging = JSON.parse(stagingText);
const currentRows = staging.native?.reviewRows ?? [];
const legacyRows = loadLegacyRows(legacyText);

const current = countyIndicators(currentRows, reviewPolicy.minWardRows);
const legacy = countyIndicators(legacyRows, legacyMinimumRows);
const currentCounties = new Set(current.indicators.map((indicator) => indicator.county));
const legacyCounties = new Set(legacy.indicators.map((indicator) => indicator.county));

const report = {
  generatedAt: new Date().toISOString(),
  state: "WI",
  year: 2024,
  policy: {
    current: reviewPolicy,
    legacyComparison: {
      minimumRows: legacyMinimumRows,
      note: "Legacy comparison uses the old mapper's precomputed ETA ward rows and historical row-inclusion behavior. It is a comparison target, not source of truth.",
    },
  },
  summary: {
    currentCountyIndicatorRows: current.indicators.length,
    currentUniqueFlaggedCounties: currentCounties.size,
    legacyCountyIndicatorRows: legacy.indicators.length,
    legacyUniqueFlaggedCounties: legacyCounties.size,
    oldOnlyCounties: sortedSetDifference(legacyCounties, currentCounties),
    currentOnlyCounties: sortedSetDifference(currentCounties, legacyCounties),
  },
  current: {
    flaggedCounties: [...currentCounties].sort((a, b) => a.localeCompare(b)),
    byType: countByType(current.indicators),
  },
  legacy: {
    flaggedCounties: [...legacyCounties].sort((a, b) => a.localeCompare(b)),
    byType: countByType(legacy.indicators),
  },
  metricDeltas: focusCounties.map((county) =>
    metricDelta(county, current.metricsByCounty[county], legacy.metricsByCounty[county]),
  ),
  explanation: {
    countyNameNormalization: "Current staging stores county names as e.g. 'Walworth County'; the reconciliation normalizes both current and legacy names to bare county names before comparison.",
    threshold: "Current production policy remains minWardRows=8, downBallotAverageThresholdPct=2, voteShareCorrelationThreshold=0.35, outlierThresholdPct=15, minCandidateVotes=100.",
    sourceRowNormalization: "Current staging is regenerated from normalized WEC ward rows. Legacy ETA rows carried precomputed drop-off values, so average down-ballot metrics can differ even when county and ward coverage is similar.",
    senateComparisonMath: "The current native review recalculates President-vs-U.S. Senate differences from the normalized source rows; the legacy comparison uses the old bundle's static Senate comparison values.",
    rowInclusion: "Florence is included by current minWardRows=8 and excluded by the legacy comparison floor of 10 rows.",
  },
};

await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
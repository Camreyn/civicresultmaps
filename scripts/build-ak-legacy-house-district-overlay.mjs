import { writeFile } from "node:fs/promises";

const legacyBundleUrl = "https://raw.githubusercontent.com/Camreyn/wisconsin-2024-election-mapper/main/data/ak-app-data.js";
const outputPath = "data/ak-2024-legacy-house-district-overlay.json";

const reviewPolicy = {
  countyDistributionDropoffThresholdPct: 4,
  countyDistributionZThreshold: 2,
  downBallotAverageThresholdPct: 2,
  minCandidateVotes: 100,
  minWardRows: 8,
  outlierThresholdPct: 15,
  voteShareCorrelationThreshold: 0.35,
};

function parseLegacyBundle(source) {
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("Legacy AK bundle did not contain a JSON assignment.");
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
}

function normalizeDistrictNumber(name) {
  const match = String(name).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function districtCode(name) {
  const number = normalizeDistrictNumber(name);
  return number ? `AK-HD-${String(number).padStart(2, "0")}` : `AK-${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function pearsonSafe(xs, ys) {
  const pairs = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
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

function indicatorSeverity(metrics) {
  const correlationScore =
    Math.max(Math.abs(metrics.trumpCorrelation), Math.abs(metrics.harrisCorrelation)) /
    Math.max(0.01, reviewPolicy.voteShareCorrelationThreshold);
  const averageDropoffScore =
    Math.max(Math.abs(metrics.demAverageDropoff), Math.abs(metrics.repAverageDropoff)) /
    Math.max(0.1, reviewPolicy.downBallotAverageThresholdPct);
  const outlierScore = (metrics.demOutliers + metrics.repOutliers) / Math.max(1, metrics.outlierTrigger);

  return Number((correlationScore + averageDropoffScore + outlierScore).toFixed(4));
}

function indicatorReasons(metrics) {
  const reasons = [];

  if (
    Math.abs(metrics.trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
    Math.abs(metrics.harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
  ) {
    reasons.push({
      detail:
        "Legacy supplemental House District overlay: larger local reporting-unit vote totals move with candidate vote share strongly enough to pass the review threshold. This is an advisory review flag, not proof of misconduct.",
      label: "Vote-share pattern",
      summary: `Vote-share correlation crossed threshold: Trump r=${metrics.trumpCorrelation.toFixed(3)}, Harris r=${metrics.harrisCorrelation.toFixed(3)}.`,
      type: "vote_share_pattern",
    });
  }

  if (
    Math.abs(metrics.demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
    Math.abs(metrics.repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct
  ) {
    reasons.push({
      detail:
        "Legacy supplemental House District overlay: the average gap between presidential votes and same-party U.S. House first-choice votes is large enough to review. Split-ticket voting and ranked-choice contest differences can explain some gap.",
      label: "Average down-ballot difference",
      summary: `Average President-vs-U.S. House difference crossed threshold: DEM ${metrics.demAverageDropoff.toFixed(2)}%, REP ${metrics.repAverageDropoff.toFixed(2)}%.`,
      type: "average_down_ballot_difference",
    });
  }

  if (metrics.demOutliers + metrics.repOutliers >= metrics.outlierTrigger) {
    reasons.push({
      detail:
        "Legacy supplemental House District overlay: enough local rows have unusually large President-versus-U.S. House first-choice differences to pass the outlier-count threshold. This is an advisory review flag, not proof of misconduct.",
      label: "Down-ballot outliers",
      summary: `Drop-off outlier count crossed threshold: DEM ${metrics.demOutliers}, REP ${metrics.repOutliers}, trigger ${metrics.outlierTrigger}.`,
      type: "down_ballot_outliers",
    });
  }

  return reasons;
}

function resultRows(appData) {
  return [...(appData.presidentCountyResults ?? [])]
    .sort((a, b) => (normalizeDistrictNumber(a.county) ?? 0) - (normalizeDistrictNumber(b.county) ?? 0))
    .map((row) => {
      const harris = Number(row.harris ?? 0);
      const trump = Number(row.trump ?? 0);
      const other = Number(row.other ?? 0);
      const winner = harris >= trump ? "Harris" : "Trump";
      const marginVotes = Math.abs(harris - trump);
      const totalVotes = Number(row.total ?? harris + trump + other);
      return {
        state: "AK",
        year: 2024,
        office: "president",
        level: "district",
        jurisdictionCode: districtCode(row.county),
        jurisdictionName: row.county,
        votes: { Harris: harris, Other: other, Trump: trump },
        totalVotes,
        marginVotes,
        marginPct: totalVotes ? Number(((marginVotes / totalVotes) * 100).toFixed(2)) : 0,
        winner,
        sourceId: "ak-2024-legacy-house-district-overlay",
      };
    });
}

function indicatorRows(appData) {
  const rowsByDistrict = new Map();
  for (const row of appData.reviewCharts?.metadata?.rows ?? []) {
    if (!row.county) {
      continue;
    }
    rowsByDistrict.set(row.county, [...(rowsByDistrict.get(row.county) ?? []), row]);
  }

  const indicators = [];
  for (const [district, rows] of [...rowsByDistrict.entries()].sort(
    ([a], [b]) => (normalizeDistrictNumber(a) ?? 0) - (normalizeDistrictNumber(b) ?? 0),
  )) {
    if (rows.length < reviewPolicy.minWardRows) {
      continue;
    }

    const metrics = {
      comparisonCoverageMode: "legacyPresidentVsUSHouseHouseDistrictOverlay",
      demAverageDropoff: average(rows.map((row) => row.demDropoff ?? 0)),
      demOutliers: rows.filter(
        (row) =>
          (row.harris ?? 0) >= reviewPolicy.minCandidateVotes &&
          Math.abs(row.demDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
      ).length,
      directionalScreenConfidence: "low",
      directionalScreenReason: "Legacy overlay aggregates official ENR precinct/reporting-unit rows to House Districts and compares President with ranked-choice U.S. House first-choice rows.",
      harrisCorrelation: pearsonSafe(
        rows.map((row) => row.harris ?? 0),
        rows.map((row) => row.harrisShare ?? 0),
      ),
      outlierTrigger: Math.max(3, Math.ceil(rows.length * 0.05)),
      repAverageDropoff: average(rows.map((row) => row.repDropoff ?? 0)),
      repOutliers: rows.filter(
        (row) =>
          (row.trump ?? 0) >= reviewPolicy.minCandidateVotes &&
          Math.abs(row.repDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
      ).length,
      rowCount: rows.length,
      supplementalOverlay: true,
      trumpCorrelation: pearsonSafe(
        rows.map((row) => row.trump ?? 0),
        rows.map((row) => row.trumpShare ?? 0),
      ),
    };
    const severity = indicatorSeverity(metrics);

    for (const reason of indicatorReasons(metrics)) {
      indicators.push({
        id: `ak-legacy-${districtCode(district).toLowerCase()}-${reason.type}`,
        state: "AK",
        electionYear: 2024,
        jurisdictionCode: districtCode(district),
        jurisdictionName: district,
        level: "district",
        type: reason.type,
        severity,
        label: reason.label,
        summary: reason.summary,
        detail: reason.detail,
        metrics,
      });
    }
  }

  return indicators;
}

const response = await fetch(legacyBundleUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch AK legacy bundle: ${response.status} ${response.statusText}`);
}

const appData = parseLegacyBundle(await response.text());
const rows = resultRows(appData);
const indicators = indicatorRows(appData);
const totals = rows.reduce(
  (sum, row) => ({
    harris: sum.harris + row.votes.Harris,
    other: sum.other + row.votes.Other,
    total: sum.total + row.totalVotes,
    trump: sum.trump + row.votes.Trump,
  }),
  { harris: 0, other: 0, total: 0, trump: 0 },
);

const artifact = {
  state: "AK",
  year: 2024,
  label: "Legacy supplemental House District overlay",
  source: {
    authority: "Alaska Division of Elections; legacy Civic Result Maps static bundle",
    bundleUrl: legacyBundleUrl,
    localArtifact: outputPath,
    sourceWorkbook: appData.metadata?.sourceWorkbook ?? "data/ak-2024-president-house-district-results.csv",
  },
  caveats: [
    "Supplemental map overlay only; active certified result rows remain the native statewide Alaska result package.",
    "Rows are legacy aggregation of official Alaska ENR precinct/reporting-unit data to 40 mapped State House Districts.",
    "The non-geographic HD99 Federal Overseas Absentee bucket is excluded from the mapped district totals.",
    "U.S. House comparison rows are ranked-choice first-choice context; advisory indicators are screening signals, not findings.",
  ],
  reconciliation: {
    legacyMappedDistrictRows: rows.length,
    legacyMappedReviewRows: appData.reviewCharts?.metadata?.rows?.length ?? 0,
    legacyMappedTotals: totals,
    nativeStatewideTotal: 338177,
    excludedNonGeographicRow: {
      id: "HD99 99-999 HD99 Fed Overseas Absentee",
      harris: 336,
      trump: 51,
      other: 14,
      total: 401,
    },
  },
  rows,
  indicators,
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, rows: rows.length, indicators: indicators.length, totals }, null, 2));
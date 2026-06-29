import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { reviewPolicy } from "../src/lib/review-policy.ts";

const stagingDir = process.argv[2] ?? ".etl/staging";

function normalizeJurisdictionName(name) {
  return String(name ?? "").trim().replace(/\s+County$/i, "");
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function cityNameForWard(localUnit) {
  const match = String(localUnit || "").match(/^\s*city of\s+(.+?)\s+(?:wards?|precincts?)\b/i);
  return match ? titleCase(match[1]) : null;
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function zScore(value, mean, deviation) {
  return Number.isFinite(value) && deviation ? (value - mean) / deviation : 0;
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

function scopesForReviewRows(stateCode, rows) {
  const byCounty = new Map();

  for (const row of rows) {
    if (!row.county) {
      continue;
    }
    const county = normalizeJurisdictionName(row.county);
    byCounty.set(county, [...(byCounty.get(county) ?? []), row]);
  }

  const scopes = Array.from(byCounty.entries()).map(([county, countyRows]) => ({
    county,
    jurisdictionName: county,
    level: "county",
    rows: countyRows,
    scopeKey: `county:${county}`,
  }));

  if (stateCode !== "WI") {
    return scopes;
  }

  const cityGroups = new Map();
  for (const row of rows) {
    const city = cityNameForWard(row.localUnit ?? row.ward);
    if (!city || !row.county) {
      continue;
    }
    const county = normalizeJurisdictionName(row.county);
    const key = `${county.toLowerCase()}|${city.toLowerCase()}`;
    const group = cityGroups.get(key) ?? { city, county, rows: [] };
    group.rows.push(row);
    cityGroups.set(key, group);
  }

  for (const group of cityGroups.values()) {
    if (group.rows.length < reviewPolicy.minWardRows) {
      continue;
    }
    const cityLocalUnits = new Set(group.rows.map((row) => row.localUnit ?? row.ward));
    const countyRows = byCounty.get(group.county) ?? [];
    const restRows = countyRows.filter((row) => !cityLocalUnits.has(row.localUnit ?? row.ward));
    if (!restRows.length) {
      continue;
    }
    scopes.push({
      city: group.city,
      county: group.county,
      jurisdictionName: `${group.city}, ${group.county} County`,
      level: "city",
      rows: group.rows,
      scopeKey: `city:${group.county}:${group.city}`,
    });
    scopes.push({
      city: group.city,
      county: group.county,
      jurisdictionName: `${group.county} County outside ${group.city}`,
      level: "rest_of_county",
      rows: restRows,
      scopeKey: `rest_of_county:${group.county}:${group.city}`,
    });
  }

  return scopes;
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
    demAverageDropoff,
    demOutliers,
    harrisCorrelation,
    outlierTrigger,
    repAverageDropoff,
    repOutliers,
    rowCount: rows.length,
    trumpCorrelation,
  };
}

function countyDistributionIndicatorsForReviewRows(stateCode, rows) {
  if (rows.length < reviewPolicy.minWardRows) {
    return [];
  }
  const countyRows = rows.filter(
    (row) => row.county && normalizeJurisdictionName(row.localUnit ?? row.county) === normalizeJurisdictionName(row.county),
  );
  if (countyRows.length !== rows.length) {
    return [];
  }
  const demValues = countyRows.map((row) => row.demDropoff).filter(Number.isFinite);
  const repValues = countyRows.map((row) => row.repDropoff).filter(Number.isFinite);
  if (!demValues.length && !repValues.length) {
    return [];
  }
  const demMean = average(demValues);
  const repMean = average(repValues);
  const demDeviation = standardDeviation(demValues);
  const repDeviation = standardDeviation(repValues);
  const indicators = [];
  for (const row of countyRows) {
    const demDropoff = row.demDropoff ?? 0;
    const repDropoff = row.repDropoff ?? 0;
    const demDistributionZ = zScore(row.demDropoff, demMean, demDeviation);
    const repDistributionZ = zScore(row.repDropoff, repMean, repDeviation);
    const absoluteTrigger =
      Math.abs(demDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct ||
      Math.abs(repDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct;
    const distributionTrigger =
      Math.abs(demDistributionZ) >= reviewPolicy.countyDistributionZThreshold ||
      Math.abs(repDistributionZ) >= reviewPolicy.countyDistributionZThreshold;
    if (!absoluteTrigger && !distributionTrigger) {
      continue;
    }
    const county = normalizeJurisdictionName(row.county);
    indicators.push({
      county,
      jurisdictionName: county,
      level: "county",
      metrics: {
        demAverageDropoff: demDropoff,
        demDistributionZ,
        repAverageDropoff: repDropoff,
        repDistributionZ,
        rowCount: 1,
        statewideCountyRows: countyRows.length,
      },
      rows: [row],
      scopeKey: `county:${county}`,
      type: "county_down_ballot_distribution",
    });
  }
  return indicators;
}

function indicatorsForReviewRows(stateCode, rows) {
  const indicators = [];

  indicators.push(...countyDistributionIndicatorsForReviewRows(stateCode, rows));

  for (const scope of scopesForReviewRows(stateCode, rows)) {
    if (scope.rows.length < reviewPolicy.minWardRows) {
      continue;
    }

    const metrics = metricsForRows(scope.rows);

    if (
      Math.abs(metrics.trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
      Math.abs(metrics.harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
    ) {
      indicators.push({ ...scope, metrics, type: "vote_share_pattern" });
    }

    if (
      Math.abs(metrics.demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
      Math.abs(metrics.repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct
    ) {
      indicators.push({ ...scope, metrics, type: "average_down_ballot_difference" });
    }

    if (metrics.demOutliers + metrics.repOutliers >= metrics.outlierTrigger) {
      indicators.push({ ...scope, metrics, type: "down_ballot_outliers" });
    }
  }

  return indicators;
}

function countBy(indicators, key) {
  return indicators.reduce((counts, indicator) => {
    const value = indicator[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
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
  const indicators = indicatorsForReviewRows(state, reviewRows);
  const countyIndicators = indicators.filter((indicator) => indicator.level === "county");
  rows.push({
    state,
    reviewRows: reviewRows.length,
    uniqueFlaggedJurisdictions: new Set(indicators.map((indicator) => indicator.county)).size,
    uniqueFlaggedCountyJurisdictions: new Set(countyIndicators.map((indicator) => indicator.county)).size,
    flaggedAreas: new Set(indicators.map((indicator) => indicator.scopeKey)).size,
    indicatorRows: indicators.length,
    countyIndicatorRows: countyIndicators.length,
    byLevel: countBy(indicators, "level"),
    byType: countBy(indicators, "type"),
  });
}

console.log(JSON.stringify({ policy: reviewPolicy, states: rows }, null, 2));
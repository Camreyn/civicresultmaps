import { reviewPolicy } from "./review-policy.ts";

export type CandidateNeutralReviewRow = {
  comparisonContest?: string;
  comparisonDemCandidate?: string;
  comparisonDemCandidatePresent?: boolean;
  comparisonDemVotes?: number;
  comparisonRepCandidate?: string;
  comparisonRepCandidatePresent?: boolean;
  comparisonRepVotes?: number;
  comparisonOtherVotes?: number;
  comparisonSourceId?: string;
  county: string;
  coverageMode?: string;
  demCandidate?: string;
  demDropoff?: number;
  demShare?: number;
  demVotes?: number;
  electionYear?: number;
  harris?: number;
  harrisShare?: number;
  jurisdictionTag?: string | null;
  level?: string;
  localUnit: string;
  repCandidate?: string;
  repDropoff?: number;
  repShare?: number;
  repVotes?: number;
  otherVotes?: number;
  presidentialParticipationProxy?: {
    denominator: number;
    denominatorType: string;
    note: string;
    numerator: number;
    numeratorType: string;
    registrationDenominatorTiming: string;
    sourceId: string;
    valuePct: number | null;
    warningRequired: boolean;
  };
  sourceId: string;
  sourceUrl?: string;
  totalVotes?: number;
  trump?: number;
  trumpShare?: number;
};

export type CandidateNeutralIndicatorMetrics = {
  comparableDownBallotRowCount: number;
  comparisonContest: string;
  comparisonCoverageMode: string;
  demAverageDropoff: number;
  demCandidate: string;
  demCorrelation: number;
  demOutliers: number;
  electionYear: number | null;
  incomparableDownBallotRowCount: number;
  outlierTrigger: number;
  repAverageDropoff: number;
  repCandidate: string;
  repCorrelation: number;
  repOutliers: number;
  rowCount: number;
  scopeType: string;
} & Record<string, unknown>;

export type CalculatedAnalysisIndicator = {
  county: string;
  detail: string;
  electionYear: number | null;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag: string | null;
  label: string;
  level: "county" | "city" | "rest_of_county";
  metrics: CandidateNeutralIndicatorMetrics;
  scopeKey: string;
  severity: number;
  sourceId: string;
  sourceUrl?: string;
  summary: string;
  type: string;
};

type ReviewScope = {
  city?: string;
  county: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag: string | null;
  level: CalculatedAnalysisIndicator["level"];
  rows: CandidateNeutralReviewRow[];
  scopeKey: string;
};

type CalculatorOptions = {
  enrichMetrics?: (scope: ReviewScope) => Record<string, unknown>;
};

function normalizeJurisdictionName(name: string) {
  return String(name ?? "").trim().replace(/\s+County$/i, "");
}

function jurisdictionCode(stateCode: string, name: string) {
  return `${stateCode}-${normalizeJurisdictionName(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function titleCase(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function cityNameForWard(localUnit: string) {
  const match = String(localUnit || "").match(/^\s*city of\s+(.+?)\s+(?:wards?|precincts?)\b/i);
  return match ? titleCase(match[1]) : null;
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function zScore(value: number | undefined, mean: number, deviation: number) {
  return typeof value === "number" && Number.isFinite(value) && deviation ? (value - mean) / deviation : 0;
}

function pearsonSafe(xs: number[], ys: number[]) {
  const pairs = xs.map((x, index) => [x, ys[index]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 2) return 0;
  const xAverage = average(pairs.map(([x]) => x));
  const yAverage = average(pairs.map(([, y]) => y));
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - xAverage) * (y - yAverage), 0);
  const xDenominator = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - xAverage) ** 2, 0));
  const yDenominator = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - yAverage) ** 2, 0));
  return xDenominator && yDenominator ? numerator / (xDenominator * yDenominator) : 0;
}

function demVotes(row: CandidateNeutralReviewRow) {
  return Number(row.demVotes ?? row.harris ?? 0);
}

function repVotes(row: CandidateNeutralReviewRow) {
  return Number(row.repVotes ?? row.trump ?? 0);
}

function demShare(row: CandidateNeutralReviewRow) {
  if (Number.isFinite(row.demShare)) return Number(row.demShare);
  if (Number.isFinite(row.harrisShare)) return Number(row.harrisShare);
  return row.totalVotes ? (demVotes(row) / row.totalVotes) * 100 : 0;
}

function repShare(row: CandidateNeutralReviewRow) {
  if (Number.isFinite(row.repShare)) return Number(row.repShare);
  if (Number.isFinite(row.trumpShare)) return Number(row.trumpShare);
  return row.totalVotes ? (repVotes(row) / row.totalVotes) * 100 : 0;
}

function defaultCandidates(year?: number) {
  if (year === 2016) return { dem: "Hillary Clinton", rep: "Donald Trump" };
  if (year === 2020) return { dem: "Joe Biden", rep: "Donald Trump" };
  if (year === 2024) return { dem: "Kamala Harris", rep: "Donald Trump" };
  return { dem: "Democratic candidate", rep: "Republican candidate" };
}

function candidateLabels(rows: CandidateNeutralReviewRow[]) {
  const year = rows.find((row) => Number.isFinite(row.electionYear))?.electionYear;
  const defaults = defaultCandidates(year);
  const dem = Array.from(new Set(rows.map((row) => row.demCandidate).filter((value): value is string => Boolean(value?.trim()))));
  const rep = Array.from(new Set(rows.map((row) => row.repCandidate).filter((value): value is string => Boolean(value?.trim()))));
  return {
    dem: dem.length === 1 ? dem[0] : defaults.dem,
    rep: rep.length === 1 ? rep[0] : defaults.rep,
  };
}

function comparisonContest(rows: CandidateNeutralReviewRow[]) {
  const labels = Array.from(new Set(rows.map((row) => row.comparisonContest).filter((value): value is string => Boolean(value?.trim()))));
  return labels.length === 1 ? labels[0] : labels.length > 1 ? "Multiple comparison contests" : "";
}

export function isComparableDownBallotRow(row: CandidateNeutralReviewRow) {
  if (["voteShareOnly", "oneSidedHouseComparison", "multiDistrictHouseComparison"].includes(row.coverageMode ?? "")) {
    return false;
  }
  if (typeof row.comparisonDemCandidatePresent === "boolean" || typeof row.comparisonRepCandidatePresent === "boolean") {
    return Boolean(row.comparisonDemCandidatePresent && row.comparisonRepCandidatePresent);
  }
  if (typeof row.comparisonDemVotes === "number" || typeof row.comparisonRepVotes === "number") {
    return Number(row.comparisonDemVotes ?? 0) > 0 && Number(row.comparisonRepVotes ?? 0) > 0;
  }
  return row.coverageMode !== undefined || Number.isFinite(row.demDropoff) || Number.isFinite(row.repDropoff);
}

function comparisonContext(rows: CandidateNeutralReviewRow[]) {
  const modes = Array.from(new Set(rows.map((row) => row.coverageMode).filter((value): value is string => Boolean(value?.trim())))).sort();
  const comparisonCoverageMode = modes.length === 1 ? modes[0] : modes.length > 1 ? "mixed" : "unknown";
  const lowConfidenceReasons: Record<string, string> = {
    mixed: "mixed comparison modes are loaded in this scope",
    multiDistrictHouseComparison: "the comparison race aggregates multiple U.S. House districts under one local key",
    oneSidedHouseComparison: "the comparison race is one-sided or not fully comparable",
    presidentVsGovernor: "Governor is a statewide executive race with candidate-specific ticket splitting",
    presidentVsHouse: "U.S. House races are district- and candidate-specific controls",
    presidentVsUSHouse: "U.S. House races are district- and candidate-specific controls",
    unknown: "the comparison mode is not recorded",
    voteShareOnly: "no same-row down-ballot comparison is loaded",
  };
  const historicalComparison = rows.some((row) => Number(row.electionYear ?? 2024) < 2024);
  const directionalScreenReason = lowConfidenceReasons[comparisonCoverageMode]
    ?? (/house/i.test(comparisonCoverageMode)
      ? "U.S. House races are district- and candidate-specific controls"
      : historicalComparison && /senate/i.test(comparisonCoverageMode)
        ? "U.S. Senate is a candidate-specific statewide comparison; broad differences can reflect ticket splitting and contest-specific participation"
        : historicalComparison
          ? "historical comparison contests are candidate- and election-specific controls"
          : "");
  return {
    comparisonCoverageMode,
    directionalScreenConfidence: directionalScreenReason ? "low" : "standard",
    directionalScreenReason,
  };
}

function scopesForRows(stateCode: string, rows: CandidateNeutralReviewRow[]) {
  const byCounty = new Map<string, CandidateNeutralReviewRow[]>();
  for (const row of rows) {
    if (!row.county) continue;
    const county = normalizeJurisdictionName(row.county);
    byCounty.set(county, [...(byCounty.get(county) ?? []), row]);
  }

  const scopes: ReviewScope[] = Array.from(byCounty.entries()).map(([county, countyRows]) => ({
    county,
    jurisdictionCode: jurisdictionCode(stateCode, county),
    jurisdictionName: county,
    jurisdictionTag: countyRows.find((row) => row.jurisdictionTag)?.jurisdictionTag ?? null,
    level: "county",
    rows: countyRows,
    scopeKey: `county:${county}`,
  }));

  if (stateCode !== "WI") return scopes;
  const cityGroups = new Map<string, { city: string; county: string; rows: CandidateNeutralReviewRow[] }>();
  for (const row of rows) {
    const city = cityNameForWard(row.localUnit);
    if (!city || !row.county) continue;
    const county = normalizeJurisdictionName(row.county);
    const key = `${county.toLowerCase()}|${city.toLowerCase()}`;
    const group = cityGroups.get(key) ?? { city, county, rows: [] };
    group.rows.push(row);
    cityGroups.set(key, group);
  }
  for (const group of cityGroups.values()) {
    if (group.rows.length < reviewPolicy.minWardRows) continue;
    const cityUnits = new Set(group.rows.map((row) => row.localUnit));
    const countyRows = byCounty.get(group.county) ?? [];
    const restRows = countyRows.filter((row) => !cityUnits.has(row.localUnit));
    if (!restRows.length) continue;
    scopes.push({
      city: group.city,
      county: group.county,
      jurisdictionCode: jurisdictionCode(stateCode, `${group.county}-${group.city}-city`),
      jurisdictionName: `${group.city}, ${group.county} County`,
      jurisdictionTag: group.rows.find((row) => row.jurisdictionTag)?.jurisdictionTag ?? null,
      level: "city",
      rows: group.rows,
      scopeKey: `city:${group.county}:${group.city}`,
    });
    scopes.push({
      city: group.city,
      county: group.county,
      jurisdictionCode: jurisdictionCode(stateCode, `${group.county}-${group.city}-rest`),
      jurisdictionName: `${group.county} County outside ${group.city}`,
      jurisdictionTag: restRows.find((row) => row.jurisdictionTag)?.jurisdictionTag ?? null,
      level: "rest_of_county",
      rows: restRows,
      scopeKey: `rest_of_county:${group.county}:${group.city}`,
    });
  }
  return scopes;
}

function indicatorSeverity(metrics: CandidateNeutralIndicatorMetrics) {
  const correlationScore = Math.max(Math.abs(metrics.demCorrelation), Math.abs(metrics.repCorrelation))
    / Math.max(0.01, reviewPolicy.voteShareCorrelationThreshold);
  const averageDropoffScore = Math.max(Math.abs(metrics.demAverageDropoff), Math.abs(metrics.repAverageDropoff))
    / Math.max(0.1, reviewPolicy.downBallotAverageThresholdPct);
  const outlierScore = (metrics.demOutliers + metrics.repOutliers) / Math.max(1, metrics.outlierTrigger);
  return Number((correlationScore + averageDropoffScore + outlierScore).toFixed(4));
}

function countyDistributionIndicators(stateCode: string, rows: CandidateNeutralReviewRow[], options: CalculatorOptions) {
  if (rows.length < reviewPolicy.minWardRows) return [];
  const countyRows = rows.filter((row) => {
    const localUnit = String(row.localUnit || "").trim();
    return row.county && (
      normalizeJurisdictionName(localUnit || row.county) === normalizeJurisdictionName(row.county)
      || /^county\s+total$/i.test(localUnit)
    );
  });
  if (countyRows.length !== rows.length) return [];
  const demValues = countyRows.map((row) => row.demDropoff).filter(Number.isFinite) as number[];
  const repValues = countyRows.map((row) => row.repDropoff).filter(Number.isFinite) as number[];
  if (!demValues.length && !repValues.length) return [];
  const demMean = average(demValues);
  const repMean = average(repValues);
  const demDeviation = standardDeviation(demValues);
  const repDeviation = standardDeviation(repValues);
  const indicators: CalculatedAnalysisIndicator[] = [];

  for (const row of countyRows) {
    const demDropoff = row.demDropoff ?? 0;
    const repDropoff = row.repDropoff ?? 0;
    const demDistributionZ = zScore(row.demDropoff, demMean, demDeviation);
    const repDistributionZ = zScore(row.repDropoff, repMean, repDeviation);
    const absoluteTrigger = Math.abs(demDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct
      || Math.abs(repDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct;
    const distributionTrigger = Math.abs(demDistributionZ) >= reviewPolicy.countyDistributionZThreshold
      || Math.abs(repDistributionZ) >= reviewPolicy.countyDistributionZThreshold;
    if (!absoluteTrigger && !distributionTrigger) continue;

    const county = normalizeJurisdictionName(row.county);
    const labels = candidateLabels([row]);
    const maxZ = Math.max(Math.abs(demDistributionZ), Math.abs(repDistributionZ));
    const maxDropoff = Math.max(Math.abs(demDropoff), Math.abs(repDropoff));
    const metrics: CandidateNeutralIndicatorMetrics = {
      comparableDownBallotRowCount: isComparableDownBallotRow(row) ? 1 : 0,
      comparisonContest: row.comparisonContest ?? "",
      comparisonCoverageMode: row.coverageMode ?? "unknown",
      comparisonGrain: row.level ?? "local",
      countyDistributionDropoffThresholdPct: reviewPolicy.countyDistributionDropoffThresholdPct,
      countyDistributionZThreshold: reviewPolicy.countyDistributionZThreshold,
      demAverageDropoff: demDropoff,
      demCandidate: labels.dem,
      demCorrelation: 0,
      demDistributionZ,
      demOutliers: Math.abs(demDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct ? 1 : 0,
      electionYear: row.electionYear ?? null,
      incomparableDownBallotRowCount: isComparableDownBallotRow(row) ? 0 : 1,
      outlierTrigger: 1,
      repAverageDropoff: repDropoff,
      repCandidate: labels.rep,
      repCorrelation: 0,
      repDistributionZ,
      repOutliers: Math.abs(repDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct ? 1 : 0,
      rowCount: 1,
      scopeType: "county",
      statewideCountyRows: countyRows.length,
    };
    const scope: ReviewScope = {
      county,
      jurisdictionCode: jurisdictionCode(stateCode, county),
      jurisdictionName: county,
      jurisdictionTag: row.jurisdictionTag ?? null,
      level: "county",
      rows: [row],
      scopeKey: `county:${county}`,
    };
    Object.assign(metrics, comparisonContext([row]), options.enrichMetrics?.(scope) ?? {});
    indicators.push({
      county,
      detail: "This county's same-grain presidential-versus-comparison-contest difference is large or unusual relative to the other loaded counties. Candidate, turnout, and contest differences can explain the pattern; this is an advisory review flag, not a finding of misconduct.",
      electionYear: row.electionYear ?? null,
      jurisdictionCode: scope.jurisdictionCode,
      jurisdictionName: county,
      jurisdictionTag: row.jurisdictionTag ?? null,
      label: "County down-ballot distribution",
      level: "county",
      metrics,
      scopeKey: scope.scopeKey,
      severity: Number((maxZ / Math.max(0.1, reviewPolicy.countyDistributionZThreshold) + maxDropoff / Math.max(0.1, reviewPolicy.countyDistributionDropoffThresholdPct)).toFixed(4)),
      sourceId: row.sourceId,
      summary: `County comparison difference crossed the review threshold: DEM ${demDropoff.toFixed(2)}% (z=${demDistributionZ.toFixed(2)}), REP ${repDropoff.toFixed(2)}% (z=${repDistributionZ.toFixed(2)}).`,
      type: "county_down_ballot_distribution",
    });
  }
  return indicators;
}

export function calculateAnalysisIndicators(
  stateCode: string,
  rows: CandidateNeutralReviewRow[],
  options: CalculatorOptions = {},
) {
  const state = stateCode.toUpperCase();
  const indicators: CalculatedAnalysisIndicator[] = [...countyDistributionIndicators(state, rows, options)];

  for (const scope of scopesForRows(state, rows)) {
    if (scope.rows.length < reviewPolicy.minWardRows) continue;
    const labels = candidateLabels(scope.rows);
    const demCorrelation = pearsonSafe(scope.rows.map(demVotes), scope.rows.map(demShare));
    const repCorrelation = pearsonSafe(scope.rows.map(repVotes), scope.rows.map(repShare));
    const downBallotRows = scope.rows.filter(isComparableDownBallotRow);
    const demAverageDropoff = average(downBallotRows.map((row) => row.demDropoff ?? 0));
    const repAverageDropoff = average(downBallotRows.map((row) => row.repDropoff ?? 0));
    const demOutliers = downBallotRows.filter((row) => demVotes(row) >= reviewPolicy.minCandidateVotes && Math.abs(row.demDropoff ?? 0) >= reviewPolicy.outlierThresholdPct).length;
    const repOutliers = downBallotRows.filter((row) => repVotes(row) >= reviewPolicy.minCandidateVotes && Math.abs(row.repDropoff ?? 0) >= reviewPolicy.outlierThresholdPct).length;
    const outlierTrigger = Math.max(3, Math.ceil(downBallotRows.length * 0.05));
    const years = Array.from(new Set(scope.rows.map((row) => row.electionYear).filter(Number.isFinite))) as number[];
    const metrics: CandidateNeutralIndicatorMetrics = {
      ...comparisonContext(scope.rows),
      ...(options.enrichMetrics?.(scope) ?? {}),
      comparableDownBallotRowCount: downBallotRows.length,
      comparisonContest: comparisonContest(scope.rows),
      comparisonGrain: Array.from(new Set(scope.rows.map((row) => row.level ?? "local"))).join(","),
      demAverageDropoff,
      demCandidate: labels.dem,
      demCorrelation,
      demOutliers,
      electionYear: years.length === 1 ? years[0] : null,
      incomparableDownBallotRowCount: scope.rows.length - downBallotRows.length,
      outlierTrigger,
      repAverageDropoff,
      repCandidate: labels.rep,
      repCorrelation,
      repOutliers,
      rowCount: scope.rows.length,
      scopeType: scope.level,
      ...(scope.city ? { city: scope.city } : {}),
    };
    const base = {
      county: scope.county,
      electionYear: metrics.electionYear,
      jurisdictionCode: scope.jurisdictionCode,
      jurisdictionName: scope.jurisdictionName,
      jurisdictionTag: scope.jurisdictionTag,
      level: scope.level,
      metrics,
      scopeKey: scope.scopeKey,
      severity: indicatorSeverity(metrics),
      sourceId: scope.rows.find((row) => row.sourceId)?.sourceId ?? "",
    };

    if (Math.abs(demCorrelation) >= reviewPolicy.voteShareCorrelationThreshold || Math.abs(repCorrelation) >= reviewPolicy.voteShareCorrelationThreshold) {
      indicators.push({
        ...base,
        detail: "Bigger local reporting-unit vote totals move with candidate vote share strongly enough to pass the review threshold. Reporting-unit size, geography, demographics, and vote-method mix can explain the pattern; this is an advisory flag, not proof of misconduct.",
        label: "Vote-share pattern",
        summary: `Vote-share correlation crossed threshold: ${labels.dem} r=${demCorrelation.toFixed(3)}, ${labels.rep} r=${repCorrelation.toFixed(3)}.`,
        type: "vote_share_pattern",
      });
    }
    if (Math.abs(demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct || Math.abs(repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct) {
      indicators.push({
        ...base,
        detail: "The average gap between presidential votes and the same-party comparison contest is large enough to review. Split-ticket voting and candidate or contest differences can explain the gap; this is an advisory flag, not proof of misconduct.",
        label: "Average down-ballot difference",
        summary: `Average President-vs-${metrics.comparisonContest || "comparison"} difference crossed threshold: DEM ${demAverageDropoff.toFixed(2)}%, REP ${repAverageDropoff.toFixed(2)}%.`,
        type: "average_down_ballot_difference",
      });
    }
    if (demOutliers + repOutliers >= outlierTrigger) {
      indicators.push({
        ...base,
        detail: "Enough local result rows have unusually large presidential-versus-comparison-contest differences to pass the outlier-count threshold. This is an advisory review flag, not proof of misconduct.",
        label: "Down-ballot outliers",
        summary: `Drop-off outlier count crossed threshold: DEM ${demOutliers}, REP ${repOutliers}, trigger ${outlierTrigger}.`,
        type: "down_ballot_outliers",
      });
    }
  }
  return indicators;
}
export type IndicatorEvaluationSummary = {
  broadSignalWarning: string | null;
  evaluatedCountyJurisdictions: number;
  flaggedAreas: number;
  flaggedCountyRate: number;
  uniqueFlaggedCountyJurisdictions: number;
  uniqueFlaggedJurisdictions: number;
};

export function summarizeIndicatorEvaluation(
  rows: Array<{ county?: string; jurisdictionName?: string }>,
  indicators: Array<{
    county?: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    level: string;
    scopeKey?: string;
  }>,
): IndicatorEvaluationSummary {
  const countyIndicators = indicators.filter((indicator) => indicator.level === "county");
  const evaluatedCountyJurisdictions = new Set(rows.map((row) => row.county ?? row.jurisdictionName).filter(Boolean)).size;
  const uniqueFlaggedCountyJurisdictions = new Set(
    countyIndicators.map((indicator) => indicator.county ?? indicator.jurisdictionName),
  ).size;
  const flaggedCountyRate = evaluatedCountyJurisdictions
    ? uniqueFlaggedCountyJurisdictions / evaluatedCountyJurisdictions
    : 0;

  return {
    broadSignalWarning: flaggedCountyRate >= 0.5
      ? "At least half of evaluated counties produced an advisory signal. Broad candidate- or contest-specific ticket splitting may dominate this screen; inspect the comparison caveats before interpreting individual flags."
      : null,
    evaluatedCountyJurisdictions,
    flaggedAreas: new Set(
      indicators.map((indicator) => indicator.scopeKey ?? `${indicator.level}:${indicator.jurisdictionCode}`),
    ).size,
    flaggedCountyRate: Number(flaggedCountyRate.toFixed(4)),
    uniqueFlaggedCountyJurisdictions,
    uniqueFlaggedJurisdictions: new Set(
      indicators.map((indicator) => indicator.county ?? indicator.jurisdictionName),
    ).size,
  };
}

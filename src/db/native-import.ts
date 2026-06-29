import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { reviewPolicy } from "../lib/review-policy.ts";

type NativeSource = {
  id: string;
  category: string;
  sourceUrl: string;
  localArtifact?: string;
  parser?: string;
  authority: string;
  timestampBasis: string;
  confidence: string;
  status: string;
  metadata?: Record<string, unknown>;
};

type NativeResultRow = {
  jurisdictionName: string;
  level: string;
  votes: Record<"Harris" | "Trump" | "Other", number>;
  sourceId: string;
};

type NativeReviewRow = {
  county: string;
  comparisonDemCandidatePresent?: boolean;
  comparisonDemVotes?: number;
  comparisonRepCandidatePresent?: boolean;
  comparisonRepVotes?: number;
  coverageMode?: string;
  localUnit: string;
  totalVotes?: number;
  harris?: number;
  trump?: number;
  harrisShare?: number;
  trumpShare?: number;
  demDropoff?: number;
  repDropoff?: number;
  sourceId: string;
};

type NativeIndicatorMetrics = {
  demAverageDropoff: number;
  demOutliers: number;
  harrisCorrelation: number;
  outlierTrigger: number;
  repAverageDropoff: number;
  repOutliers: number;
  rowCount: number;
  trumpCorrelation: number;
} & Record<string, unknown>;

type NativeAnalysisIndicator = {
  county: string;
  detail: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  label: string;
  level: "county" | "city" | "rest_of_county";
  metrics: NativeIndicatorMetrics;
  severity: number;
  sourceId: string;
  summary: string;
  type: string;
};

type WisconsinAuditSelection = {
  ballotsAudited: number;
  county: string;
  equipment: string;
  municipality: string;
  reportingUnit: string;
};

type WisconsinIndicatorContext = {
  aggregateAuditResults?: Record<string, unknown>;
  auditCaveat: string;
  auditSelections: WisconsinAuditSelection[];
  auditSourceUrl: string;
  statewideAuditFinding: string;
};

type NativeReviewScope = {
  city?: string;
  county: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  level: NativeAnalysisIndicator["level"];
  rows: NativeReviewRow[];
};
type NativeTurnoutRow = {
  county: string;
  localUnit: string;
  level?: string;
  ballotsCast: number;
  registeredVoters?: number;
  turnoutPct?: number | null;
  denominatorType?: string;
  registrationDenominatorTiming?: string;
  warningRequired?: boolean;
  sourceId: string;
};

type NativeHistoricalRow = {
  electionYear: number;
  sourceId: string;
  sourceLevel: string;
  rowMethod: string;
  jurisdictionName: string;
  localUnit: string;
  demVotes?: number;
  repVotes?: number;
  otherVotes?: number;
  totalVotes?: number;
  sourceUrl?: string;
  sourceDocumentId?: string;
};

type NativeArtifact = {
  state: {
    code: string;
    name: string;
    authority: string;
  };
  election: {
    year: number;
    office: string;
  };
  sources: NativeSource[];
  capabilities: Record<string, boolean>;
  validation: {
    passed: boolean;
    errors: string[];
    warnings: string[];
    metrics: Record<string, unknown>;
  };
  promotion: {
    productionWriteAllowed: boolean;
  };
  native?: {
    parser: string;
    resultRows: NativeResultRow[];
    reviewRows: NativeReviewRow[];
    turnoutRows: NativeTurnoutRow[];
    historicalRows?: NativeHistoricalRow[];
    metrics: Record<string, unknown>;
  };
};

const candidateParties = {
  Harris: "DEM",
  Trump: "REP",
  Other: "OTHER",
} as const;


function getDatabaseUrl() {
  return (
    [
      process.env.DATABASE_URL,
      process.env.POSTGRES_DATABASE_URL,
      process.env.POSTGRES_URL,
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.POSTGRES_DATABASE_URL_UNPOOLED,
      process.env.CRM_URL,
    ].find((value) => value && value.trim() && value.trim() !== '""') ?? ""
  );
}

function normalizeJurisdictionName(name: string) {
  return name.trim().replace(/\s+County$/i, "");
}

function jurisdictionCode(stateCode: string, name: string) {
  return `${stateCode}-${normalizeJurisdictionName(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function finiteNumbers(values: Array<number | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function zScore(value: number | undefined, mean: number, deviation: number) {
  return typeof value === "number" && Number.isFinite(value) && deviation ? (value - mean) / deviation : 0;
}

function pearsonSafe(xValues: number[], yValues: number[]) {
  const length = Math.min(xValues.length, yValues.length);

  if (length < 2) {
    return 0;
  }

  const x = xValues.slice(0, length);
  const y = yValues.slice(0, length);
  const xAverage = average(x);
  const yAverage = average(y);
  let numerator = 0;
  let xSquareSum = 0;
  let ySquareSum = 0;

  for (let index = 0; index < length; index += 1) {
    const xDelta = x[index] - xAverage;
    const yDelta = y[index] - yAverage;
    numerator += xDelta * yDelta;
    xSquareSum += xDelta * xDelta;
    ySquareSum += yDelta * yDelta;
  }

  const denominator = Math.sqrt(xSquareSum) * Math.sqrt(ySquareSum);
  return denominator ? numerator / denominator : 0;
}

function indicatorSeverity(metrics: NativeIndicatorMetrics) {
  const correlationScore =
    Math.max(Math.abs(metrics.trumpCorrelation), Math.abs(metrics.harrisCorrelation)) /
    Math.max(0.01, reviewPolicy.voteShareCorrelationThreshold);
  const averageDropoffScore =
    Math.max(Math.abs(metrics.demAverageDropoff), Math.abs(metrics.repAverageDropoff)) /
    Math.max(0.1, reviewPolicy.downBallotAverageThresholdPct);
  const outlierScore =
    (metrics.demOutliers + metrics.repOutliers) / Math.max(1, metrics.outlierTrigger);

  return Number((correlationScore + averageDropoffScore + outlierScore).toFixed(4));
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function cityNameForWard(localUnit: string) {
  const match = String(localUnit || "").match(/^\s*city of\s+(.+?)\s+(?:wards?|precincts?)\b/i);
  return match ? titleCase(match[1]) : null;
}

function reviewScopesForNativeRows(stateCode: string, rows: NativeReviewRow[]) {
  const rowsByCounty = new Map<string, NativeReviewRow[]>();

  for (const row of rows) {
    if (!row.county) {
      continue;
    }

    const county = normalizeJurisdictionName(row.county);
    rowsByCounty.set(county, [...(rowsByCounty.get(county) ?? []), row]);
  }

  const scopes: NativeReviewScope[] = Array.from(rowsByCounty.entries()).map(([county, countyRows]) => ({
    county,
    jurisdictionCode: jurisdictionCode(stateCode, county),
    jurisdictionName: county,
    level: "county",
    rows: countyRows,
  }));

  if (stateCode !== "WI") {
    return scopes;
  }

  const cityGroups = new Map<string, { city: string; county: string; rows: NativeReviewRow[] }>();
  for (const row of rows) {
    const city = cityNameForWard(row.localUnit);
    if (!city || !row.county) {
      continue;
    }
    const county = normalizeJurisdictionName(row.county);
    const key = `${county.toLowerCase()}|${city.toLowerCase()}`;
    const current = cityGroups.get(key) ?? { city, county, rows: [] };
    current.rows.push(row);
    cityGroups.set(key, current);
  }

  for (const split of cityGroups.values()) {
    if (split.rows.length < reviewPolicy.minWardRows) {
      continue;
    }
    const cityLocalUnits = new Set(split.rows.map((row) => row.localUnit));
    const countyRows = rowsByCounty.get(split.county) ?? [];
    const restRows = countyRows.filter((row) => !cityLocalUnits.has(row.localUnit));
    if (!restRows.length) {
      continue;
    }

    scopes.push({
      city: split.city,
      county: split.county,
      jurisdictionCode: jurisdictionCode(stateCode, `${split.county}-${split.city}-city`),
      jurisdictionName: `${split.city}, ${split.county} County`,
      level: "city",
      rows: split.rows,
    });
    scopes.push({
      city: split.city,
      county: split.county,
      jurisdictionCode: jurisdictionCode(stateCode, `${split.county}-${split.city}-rest`),
      jurisdictionName: `${split.county} County outside ${split.city}`,
      level: "rest_of_county",
      rows: restRows,
    });
  }

  return scopes;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function auditMunicipalityName(value: string) {
  return titleCase(String(value || "").replace(/^[CTV]\.\s*/i, "").trim());
}

async function loadWisconsinIndicatorContext(stateCode: string): Promise<WisconsinIndicatorContext | null> {
  if (stateCode !== "WI") {
    return null;
  }

  try {
    const [summaryText, csvText] = await Promise.all([
      readFile("data/wi-2024-audit-summary.json", "utf8"),
      readFile("data/wi-2024-audit-selections.csv", "utf8"),
    ]);
    const summary = JSON.parse(summaryText) as {
      aggregateAuditResults?: Record<string, unknown>;
      caveat?: string;
      sourcePdfUrl?: string;
      statewideFinding?: string;
    };
    const lines = csvText.trim().split(/\r?\n/).slice(1);
    const auditSelections = lines.map((line) => {
      const cells = splitCsvLine(line);
      return {
        ballotsAudited: Number(cells[7] || 0),
        county: normalizeJurisdictionName(cells[3] ?? ""),
        equipment: cells[6] ?? "",
        municipality: cells[4] ?? "",
        reportingUnit: cells[5] ?? "",
      };
    });
    return {
      aggregateAuditResults: summary.aggregateAuditResults,
      auditCaveat:
        summary.caveat ??
        "The WEC final audit report provides statewide findings and selected reporting units, not per-unit discrepancy outcomes.",
      auditSelections,
      auditSourceUrl: summary.sourcePdfUrl ?? "",
      statewideAuditFinding: summary.statewideFinding ?? "",
    };
  } catch {
    return null;
  }
}

function auditContextForScope(scope: NativeReviewScope, context: WisconsinIndicatorContext | null) {
  if (!context) {
    return null;
  }

  let matched = context.auditSelections.filter((row) => row.county.toLowerCase() === scope.county.toLowerCase());
  if (scope.level === "city" && scope.city) {
    matched = matched.filter((row) => auditMunicipalityName(row.municipality).toLowerCase() === scope.city?.toLowerCase());
  } else if (scope.level === "rest_of_county" && scope.city) {
    matched = matched.filter((row) => auditMunicipalityName(row.municipality).toLowerCase() !== scope.city?.toLowerCase());
  }

  return {
    aggregateAuditResults: context.aggregateAuditResults ?? null,
    auditedBallots: matched.reduce((sum, row) => sum + row.ballotsAudited, 0),
    caveat: context.auditCaveat,
    matchedSelectionRows: matched.length,
    sourceUrl: context.auditSourceUrl,
    statewideFinding: context.statewideAuditFinding,
    topEquipment: Array.from(new Set(matched.map((row) => row.equipment).filter(Boolean))).slice(0, 6),
  };
}

function denominatorContextForScope(stateCode: string, scope: NativeReviewScope) {
  if (stateCode !== "WI") {
    return null;
  }

  return {
    ballotModeContext: "EAC local-jurisdiction vote-method rows are loaded as context only and are not used as advisory flag inputs.",
    defaultTurnoutDenominator: "EAC 2024 local-jurisdiction turnout fallback",
    localVoteRows: "WEC ward-level federal/state workbook",
    missingDenominator: "WEC ward result rows do not include ward-level registered-voter denominators.",
    scopeType: scope.level,
  };
}

function countyDistributionIndicatorsForNativeRows(stateCode: string, rows: NativeReviewRow[]) {
  if (rows.length < reviewPolicy.minWardRows) {
    return [] as NativeAnalysisIndicator[];
  }

  const countyRows = rows.filter((row) => {
    const localUnit = String(row.localUnit || "").trim();
    return (
      row.county &&
      (normalizeJurisdictionName(localUnit || row.county) === normalizeJurisdictionName(row.county) ||
        /^county\s+total$/i.test(localUnit))
    );
  });

  if (countyRows.length !== rows.length) {
    return [] as NativeAnalysisIndicator[];
  }

  const demValues = finiteNumbers(countyRows.map((row) => row.demDropoff));
  const repValues = finiteNumbers(countyRows.map((row) => row.repDropoff));
  if (!demValues.length && !repValues.length) {
    return [] as NativeAnalysisIndicator[];
  }

  const demMean = average(demValues);
  const repMean = average(repValues);
  const demDeviation = standardDeviation(demValues);
  const repDeviation = standardDeviation(repValues);
  const indicators: NativeAnalysisIndicator[] = [];

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
    const metrics: NativeIndicatorMetrics = {
      county,
      countyDistributionDropoffThresholdPct: reviewPolicy.countyDistributionDropoffThresholdPct,
      countyDistributionZThreshold: reviewPolicy.countyDistributionZThreshold,
      demAverageDropoff: demDropoff,
      demDistributionMean: demMean,
      demDistributionStdDev: demDeviation,
      demDistributionZ,
      demOutliers: Math.abs(demDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct ? 1 : 0,
      harrisCorrelation: 0,
      outlierTrigger: 1,
      repAverageDropoff: repDropoff,
      repDistributionMean: repMean,
      repDistributionStdDev: repDeviation,
      repDistributionZ,
      repOutliers: Math.abs(repDropoff) >= reviewPolicy.countyDistributionDropoffThresholdPct ? 1 : 0,
      rowCount: 1,
      scopeType: "county",
      statewideCountyRows: countyRows.length,
      trumpCorrelation: 0,
    };
    const maxZ = Math.max(Math.abs(demDistributionZ), Math.abs(repDistributionZ));
    const maxDropoff = Math.max(Math.abs(demDropoff), Math.abs(repDropoff));
    const severity = Number(
      (
        maxZ / Math.max(0.1, reviewPolicy.countyDistributionZThreshold) +
        maxDropoff / Math.max(0.1, reviewPolicy.countyDistributionDropoffThresholdPct)
      ).toFixed(4),
    );

    indicators.push({
      county,
      detail:
        "This county-level President-versus-comparison-contest difference is large in absolute terms or relative to the statewide county distribution. It is an advisory county review screen, not precinct-level evidence or proof of tampering.",
      jurisdictionCode: jurisdictionCode(stateCode, county),
      jurisdictionName: county,
      label: "County comparison outlier",
      level: "county",
      metrics,
      severity,
      sourceId: row.sourceId,
      summary: `County comparison crossed threshold: DEM ${demDropoff.toFixed(2)}%, REP ${repDropoff.toFixed(2)}%, DEM z=${demDistributionZ.toFixed(2)}, REP z=${repDistributionZ.toFixed(2)}.`,
      type: "county_down_ballot_distribution",
    });
  }

  return indicators;
}

function isComparableDownBallotRow(row: NativeReviewRow) {
  if (row.coverageMode === "voteShareOnly" || row.coverageMode === "oneSidedHouseComparison") {
    return false;
  }

  if (
    typeof row.comparisonDemCandidatePresent === "boolean" ||
    typeof row.comparisonRepCandidatePresent === "boolean"
  ) {
    return Boolean(row.comparisonDemCandidatePresent && row.comparisonRepCandidatePresent);
  }

  if (typeof row.comparisonDemVotes === "number" || typeof row.comparisonRepVotes === "number") {
    return Number(row.comparisonDemVotes ?? 0) > 0 && Number(row.comparisonRepVotes ?? 0) > 0;
  }

  return row.coverageMode !== undefined || Number.isFinite(row.demDropoff) || Number.isFinite(row.repDropoff);
}

function comparisonContextForScope(scope: NativeReviewScope) {
  const coverageModes = Array.from(
    new Set(
      scope.rows
        .map((row) => row.coverageMode)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  ).sort();
  const comparisonCoverageMode =
    coverageModes.length === 1 ? coverageModes[0] : coverageModes.length > 1 ? "mixed" : "unknown";
  const lowConfidenceReasons: Record<string, string> = {
    mixed: "mixed comparison modes are loaded in this scope",
    oneSidedHouseComparison: "the comparison race is one-sided or not fully comparable",
    presidentVsGovernor:
      "Governor is a statewide executive race with candidate-specific ticket splitting; corroborate with additional contests or historical baselines before inferring candidate benefit",
    presidentVsHouse: "U.S. House races are district- and candidate-specific controls",
    presidentVsUSHouse: "U.S. House races are district- and candidate-specific controls",
    unknown: "the comparison mode is not recorded",
    voteShareOnly: "no same-row down-ballot comparison is loaded",
  };
  const directionalScreenReason =
    lowConfidenceReasons[comparisonCoverageMode] ??
    (/house/i.test(comparisonCoverageMode) ? "U.S. House races are district- and candidate-specific controls" : "");

  return {
    comparisonCoverageMode,
    directionalScreenConfidence: directionalScreenReason ? "low" : "standard",
    directionalScreenReason,
  };
}

async function analysisIndicatorsForNativeRows(stateCode: string, rows: NativeReviewRow[]) {
  const indicators: NativeAnalysisIndicator[] = [];
  const wisconsinContext = await loadWisconsinIndicatorContext(stateCode);

  indicators.push(...countyDistributionIndicatorsForNativeRows(stateCode, rows));

  for (const scope of reviewScopesForNativeRows(stateCode, rows)) {
    if (scope.rows.length < reviewPolicy.minWardRows) {
      continue;
    }

    const trumpCorrelation = pearsonSafe(
      scope.rows.map((row) => row.trump ?? 0),
      scope.rows.map((row) => row.trumpShare ?? 0),
    );
    const harrisCorrelation = pearsonSafe(
      scope.rows.map((row) => row.harris ?? 0),
      scope.rows.map((row) => row.harrisShare ?? 0),
    );
    const downBallotRows = scope.rows.filter(isComparableDownBallotRow);
    const demAverageDropoff = average(downBallotRows.map((row) => row.demDropoff ?? 0));
    const repAverageDropoff = average(downBallotRows.map((row) => row.repDropoff ?? 0));
    const demOutliers = downBallotRows.filter(
      (row) =>
        (row.harris ?? 0) >= reviewPolicy.minCandidateVotes &&
        Math.abs(row.demDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
    ).length;
    const repOutliers = downBallotRows.filter(
      (row) =>
        (row.trump ?? 0) >= reviewPolicy.minCandidateVotes &&
        Math.abs(row.repDropoff ?? 0) >= reviewPolicy.outlierThresholdPct,
    ).length;
    const outlierTrigger = Math.max(3, Math.ceil(downBallotRows.length * 0.05));
    const metrics: NativeIndicatorMetrics = {
      auditContext: auditContextForScope(scope, wisconsinContext),
      ...comparisonContextForScope(scope),
      comparableDownBallotRowCount: downBallotRows.length,
      county: scope.county,
      demAverageDropoff,
      demOutliers,
      denominatorContext: denominatorContextForScope(stateCode, scope),
      harrisCorrelation,
      incomparableDownBallotRowCount: scope.rows.length - downBallotRows.length,
      outlierTrigger,
      repAverageDropoff,
      repOutliers,
      rowCount: scope.rows.length,
      scopeType: scope.level,
      trumpCorrelation,
      ...(scope.city ? { city: scope.city } : {}),
    };
    const severity = indicatorSeverity(metrics);
    const sourceId = scope.rows.find((row) => row.sourceId)?.sourceId ?? "";
    const base = {
      county: scope.county,
      jurisdictionCode: scope.jurisdictionCode,
      jurisdictionName: scope.jurisdictionName,
      level: scope.level,
      metrics,
      severity,
      sourceId,
    };

    if (
      Math.abs(trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
      Math.abs(harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
    ) {
      indicators.push({
        ...base,
        detail:
          "Bigger local reporting-unit vote totals move with candidate vote share strongly enough to pass the native review threshold. This is an advisory review flag, not proof of tampering.",
        label: "Vote-share pattern",
        summary: `Vote-share correlation crossed threshold: Trump r=${trumpCorrelation.toFixed(3)}, Harris r=${harrisCorrelation.toFixed(3)}.`,
        type: "vote_share_pattern",
      });
    }

    if (
      Math.abs(demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
      Math.abs(repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct
    ) {
      indicators.push({
        ...base,
        detail:
          "The average gap between presidential votes and same-party down-ballot votes is large enough to review. Split-ticket voting can explain some gap; this flag identifies areas needing supporting records.",
        label: "Average down-ballot difference",
        summary: `Average President-vs-down-ballot difference crossed threshold: DEM ${demAverageDropoff.toFixed(2)}%, REP ${repAverageDropoff.toFixed(2)}%.`,
        type: "average_down_ballot_difference",
      });
    }

    if (demOutliers + repOutliers >= outlierTrigger) {
      indicators.push({
        ...base,
        detail:
          "Enough local result rows have unusually large President-versus-down-ballot differences to pass the outlier-count threshold. This is an advisory review flag, not proof of tampering.",
        label: "Down-ballot outliers",
        summary: `Drop-off outlier count crossed threshold: DEM ${demOutliers}, REP ${repOutliers}, trigger ${outlierTrigger}.`,
        type: "down_ballot_outliers",
      });
    }
  }

  return indicators;
}

function assertPromotable(artifact: NativeArtifact) {
  if (!artifact.validation?.passed) {
    throw new Error("Native staging artifact validation did not pass.");
  }
  if (artifact.promotion?.productionWriteAllowed) {
    throw new Error("Native staging artifacts must not self-authorize production writes.");
  }
  if (!artifact.native) {
    throw new Error("Native staging artifact does not contain parsed native rows.");
  }
}

export async function promoteNativeStagingArtifact(path: string) {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to promote native staging data.");
  }

  const artifact = JSON.parse(await readFile(path, "utf8")) as NativeArtifact;
  assertPromotable(artifact);

  const sql = neon(databaseUrl);
  const stateCode = artifact.state.code.toUpperCase();
  const electionYear = artifact.election.year;
  const office = artifact.election.office.toLowerCase();
  const native = artifact.native!;

  await sql`
    insert into states (code, name, authority)
    values (${stateCode}, ${artifact.state.name}, ${artifact.state.authority})
    on conflict (code) do update set
      name = excluded.name,
      authority = excluded.authority
  `;

  const [election] = await sql`
    insert into elections (year, office, election_date, label)
    values (${electionYear}, ${office}, ${`${electionYear}-11-05`}, ${`${electionYear} ${office}`})
    on conflict (year, office) do update set label = excluded.label
    returning id
  `;

  const [contest] = await sql`
    insert into contests (election_id, state_code, office, title)
    values (${election.id}, ${stateCode}, ${office}, ${`${artifact.state.name} ${electionYear} ${office}`})
    on conflict (election_id, state_code, office) do update set title = excluded.title
    returning id
  `;

  for (const [index, candidate] of (["Harris", "Trump", "Other"] as const).entries()) {
    await sql`
      insert into candidates (contest_id, name, party, ballot_order)
      values (${contest.id}, ${candidate}, ${candidateParties[candidate]}, ${index + 1})
      on conflict (contest_id, name, party) do update set ballot_order = excluded.ballot_order
    `;
  }

  const sourceIds = new Map<string, string>();
  for (const source of artifact.sources) {
    const [document] = await sql`
      insert into source_documents (
        slug,
        state_code,
        election_year,
        category,
        title,
        source_url,
        authority,
        local_artifact,
        parser,
        timestamp_basis,
        confidence,
        status,
        metadata
      )
      values (
        ${`${stateCode.toLowerCase()}-${electionYear}-${source.id}`},
        ${stateCode},
        ${electionYear},
        ${source.category},
        ${source.category},
        ${source.sourceUrl},
        ${source.authority},
        ${source.localArtifact ?? ""},
        ${source.parser ?? native.parser},
        ${source.timestampBasis},
        ${source.confidence},
        ${source.status},
        ${JSON.stringify({ nativeSourceId: source.id, ...(source.metadata ?? {}) })}::jsonb
      )
      on conflict (slug) do update set
        category = excluded.category,
        title = excluded.title,
        source_url = excluded.source_url,
        authority = excluded.authority,
        local_artifact = excluded.local_artifact,
        parser = excluded.parser,
        timestamp_basis = excluded.timestamp_basis,
        confidence = excluded.confidence,
        status = excluded.status,
        metadata = excluded.metadata
      returning id
    `;
    sourceIds.set(source.id, document.id);
  }

  const primarySourceId = sourceIds.get(native.resultRows[0]?.sourceId ?? artifact.sources[0]?.id);
  const [importRun] = await sql`
    insert into import_runs (
      state_code,
      election_year,
      parser,
      source_document_id,
      status,
      summary
    )
    values (
      ${stateCode},
      ${electionYear},
      ${native.parser},
      ${primarySourceId ?? null},
      'staged',
      ${JSON.stringify(native.metrics)}::jsonb
    )
    returning id
  `;

  const shouldReplaceResultRows = native.resultRows.length > 0 || !artifact.capabilities.certifiedResults;
  if (shouldReplaceResultRows) {
    await sql`
      delete from result_rows
      where state_code = ${stateCode}
        and contest_id = ${contest.id}
    `;
  }
  const shouldReplaceReviewRows =
    native.reviewRows.length > 0 ||
    (native.resultRows.length > 0 && "nativeReviewRows" in native.metrics) ||
    !artifact.capabilities.reviewGraphs;
  if (shouldReplaceReviewRows) {
    await sql`
      delete from review_rows
      where state_code = ${stateCode}
        and election_year = ${electionYear}
    `;
    await sql`
      delete from analysis_indicators
      where state_code = ${stateCode}
        and election_year = ${electionYear}
    `;
  }
  if (native.turnoutRows.length > 0) {
    await sql`
      delete from turnout_rows
      where state_code = ${stateCode}
        and election_year = ${electionYear}
    `;
  }
  const historicalRows = native.historicalRows ?? [];
  const shouldReplaceHistoricalRows = historicalRows.length > 0 || !artifact.capabilities.historicalBaseline;
  if (shouldReplaceHistoricalRows) {
    await sql`
      delete from historical_result_rows
      where state_code = ${stateCode}
    `;
  }

  let storedResultRows = 0;
  for (const row of native.resultRows) {
    const code = jurisdictionCode(stateCode, row.jurisdictionName);
    await sql`
      insert into jurisdictions (state_code, code, name, level)
      values (${stateCode}, ${code}, ${row.jurisdictionName}, ${row.level})
      on conflict (state_code, level, code) do update set name = excluded.name
    `;

    for (const [candidate, votes] of Object.entries(row.votes) as [keyof typeof candidateParties, number][]) {
      await sql`
        insert into result_rows (
          import_run_id,
          contest_id,
          state_code,
          jurisdiction_code,
          jurisdiction_name,
          level,
          candidate_name,
          party,
          votes,
          source_document_id
        )
        values (
          ${importRun.id},
          ${contest.id},
          ${stateCode},
          ${code},
          ${row.jurisdictionName},
          ${row.level},
          ${candidate},
          ${candidateParties[candidate]},
          ${votes},
          ${sourceIds.get(row.sourceId) ?? primarySourceId ?? null}
        )
        on conflict (contest_id, level, jurisdiction_code, candidate_name, party)
        do update set
          import_run_id = excluded.import_run_id,
          jurisdiction_name = excluded.jurisdiction_name,
          votes = excluded.votes,
          source_document_id = excluded.source_document_id
      `;
      storedResultRows += 1;
    }
  }

  let storedReviewRows = 0;
  for (const [index, row] of native.reviewRows.entries()) {
    const localUnit = row.localUnit || `review-row-${index + 1}`;
    await sql`
      insert into review_rows (
        import_run_id,
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        local_unit,
        level,
        harris_votes,
        trump_votes,
        total_votes,
        harris_share,
        trump_share,
        dem_dropoff,
        rep_dropoff,
        metrics,
        source_document_id
      )
      values (
        ${importRun.id},
        ${stateCode},
        ${electionYear},
        ${jurisdictionCode(stateCode, row.county)},
        ${row.county},
        ${localUnit},
        'local',
        ${numberOrNull(row.harris)},
        ${numberOrNull(row.trump)},
        ${numberOrNull(row.totalVotes)},
        ${numberOrNull(row.harrisShare)},
        ${numberOrNull(row.trumpShare)},
        ${numberOrNull(row.demDropoff)},
        ${numberOrNull(row.repDropoff)},
        ${JSON.stringify(row)}::jsonb,
        ${sourceIds.get(row.sourceId) ?? primarySourceId ?? null}
      )
      on conflict (state_code, election_year, jurisdiction_code, local_unit)
      do update set
        import_run_id = excluded.import_run_id,
        jurisdiction_name = excluded.jurisdiction_name,
        level = excluded.level,
        harris_votes = excluded.harris_votes,
        trump_votes = excluded.trump_votes,
        total_votes = excluded.total_votes,
        harris_share = excluded.harris_share,
        trump_share = excluded.trump_share,
        dem_dropoff = excluded.dem_dropoff,
        rep_dropoff = excluded.rep_dropoff,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
    storedReviewRows += 1;
  }

  let storedIndicatorRows = 0;
  for (const indicator of await analysisIndicatorsForNativeRows(stateCode, native.reviewRows)) {
    await sql`
      insert into analysis_indicators (
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        level,
        indicator_type,
        severity,
        label,
        summary,
        detail,
        metrics,
        source_document_id
      )
      values (
        ${stateCode},
        ${electionYear},
        ${indicator.jurisdictionCode},
        ${indicator.jurisdictionName},
        ${indicator.level},
        ${indicator.type},
        ${indicator.severity},
        ${indicator.label},
        ${indicator.summary},
        ${indicator.detail},
        ${JSON.stringify(indicator.metrics)}::jsonb,
        ${sourceIds.get(indicator.sourceId) ?? primarySourceId ?? null}
      )
      on conflict (state_code, election_year, level, jurisdiction_code, indicator_type, label)
      do update set
        jurisdiction_name = excluded.jurisdiction_name,
        severity = excluded.severity,
        summary = excluded.summary,
        detail = excluded.detail,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
    storedIndicatorRows += 1;
  }

  let storedTurnoutRows = 0;
  for (const [index, row] of native.turnoutRows.entries()) {
    const localUnit = row.localUnit || `turnout-row-${index + 1}`;
    await sql`
      insert into turnout_rows (
        import_run_id,
        state_code,
        election_year,
        jurisdiction_code,
        jurisdiction_name,
        level,
        ballots_cast,
        registered_voters,
        turnout_pct,
        denominator_note,
        warning_required,
        source_document_id
      )
      values (
        ${importRun.id},
        ${stateCode},
        ${electionYear},
        ${jurisdictionCode(stateCode, `${row.county}-${localUnit}`)},
        ${[row.county, localUnit].filter(Boolean).join(" / ")},
        ${row.level ?? "local"},
        ${row.ballotsCast},
        ${numberOrNull(row.registeredVoters)},
        ${numberOrNull(row.turnoutPct)},
        ${row.registrationDenominatorTiming ?? row.denominatorType ?? "Not recorded"},
        ${Boolean(row.warningRequired)},
        ${sourceIds.get(row.sourceId) ?? primarySourceId ?? null}
      )
      on conflict (state_code, election_year, level, jurisdiction_code)
      do update set
        import_run_id = excluded.import_run_id,
        jurisdiction_name = excluded.jurisdiction_name,
        ballots_cast = excluded.ballots_cast,
        registered_voters = excluded.registered_voters,
        turnout_pct = excluded.turnout_pct,
        denominator_note = excluded.denominator_note,
        warning_required = excluded.warning_required,
        source_document_id = excluded.source_document_id
    `;
    storedTurnoutRows += 1;
  }

  let storedHistoricalRows = 0;
  for (const [index, row] of historicalRows.entries()) {
    const localUnit = row.localUnit || `historical-row-${index + 1}`;
    await sql`
      insert into historical_result_rows (
        import_run_id,
        state_code,
        election_year,
        source_id,
        source_level,
        row_method,
        jurisdiction_code,
        jurisdiction_name,
        local_unit,
        dem_votes,
        rep_votes,
        other_votes,
        total_votes,
        metrics,
        source_document_id
      )
      values (
        ${importRun.id},
        ${stateCode},
        ${row.electionYear},
        ${row.sourceId},
        ${row.sourceLevel},
        ${row.rowMethod},
        ${jurisdictionCode(stateCode, row.jurisdictionName)},
        ${row.jurisdictionName},
        ${localUnit},
        ${numberOrNull(row.demVotes)},
        ${numberOrNull(row.repVotes)},
        ${numberOrNull(row.otherVotes)},
        ${numberOrNull(row.totalVotes)},
        ${JSON.stringify(row)}::jsonb,
        ${sourceIds.get(row.sourceDocumentId ?? row.sourceId) ?? primarySourceId ?? null}
      )
      on conflict (state_code, election_year, source_id, jurisdiction_code, local_unit)
      do update set
        import_run_id = excluded.import_run_id,
        source_level = excluded.source_level,
        row_method = excluded.row_method,
        jurisdiction_name = excluded.jurisdiction_name,
        dem_votes = excluded.dem_votes,
        rep_votes = excluded.rep_votes,
        other_votes = excluded.other_votes,
        total_votes = excluded.total_votes,
        metrics = excluded.metrics,
        source_document_id = excluded.source_document_id
    `;
    storedHistoricalRows += 1;
  }

  const summary = {
    ...native.metrics,
    storedResultRows,
    storedReviewRows,
    storedIndicatorRows,
    storedTurnoutRows,
    storedHistoricalRows,
  };

  await sql`
    insert into capability_flags (
      state_code,
      election_year,
      certified_results,
      map,
      review_graphs,
      turnout,
      historical_baseline,
      source_planner,
      notes
    )
    values (
      ${stateCode},
      ${electionYear},
      ${Boolean(artifact.capabilities.certifiedResults)},
      ${Boolean(artifact.capabilities.map)},
      ${Boolean(artifact.capabilities.reviewGraphs)},
      ${Boolean(artifact.capabilities.turnout)},
      ${Boolean(artifact.capabilities.historicalBaseline)},
      ${Boolean(artifact.capabilities.sourcePlanner)},
      'Native official-source ETL promotion.'
    )
    on conflict (state_code, election_year) do update set
      certified_results = excluded.certified_results,
      map = excluded.map,
      review_graphs = excluded.review_graphs,
      turnout = excluded.turnout,
      historical_baseline = excluded.historical_baseline,
      source_planner = excluded.source_planner,
      notes = excluded.notes
  `;

  await sql`
    insert into validation_reports (
      import_run_id,
      state_code,
      election_year,
      passed,
      errors,
      warnings,
      metrics
    )
    values (
      ${importRun.id},
      ${stateCode},
      ${electionYear},
      ${artifact.validation.passed},
      ${JSON.stringify(artifact.validation.errors)}::jsonb,
      ${JSON.stringify(artifact.validation.warnings)}::jsonb,
      ${JSON.stringify(artifact.validation.metrics)}::jsonb
    )
  `;

  await sql`
    update import_runs
    set
      status = 'promoted',
      finished_at = now(),
      summary = ${JSON.stringify(summary)}::jsonb
    where id = ${importRun.id}
  `;

  return {
    state: stateCode,
    electionYear,
    ...summary,
  };
}


import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

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

type NativeAnalysisIndicator = {
  county: string;
  detail: string;
  jurisdictionCode: string;
  label: string;
  metrics: {
    demAverageDropoff: number;
    demOutliers: number;
    harrisCorrelation: number;
    outlierTrigger: number;
    repAverageDropoff: number;
    repOutliers: number;
    rowCount: number;
    trumpCorrelation: number;
  };
  severity: number;
  sourceId: string;
  summary: string;
  type: string;
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

const reviewPolicy = {
  downBallotAverageThresholdPct: 6,
  minCandidateVotes: 100,
  minWardRows: 8,
  outlierThresholdPct: 15,
  voteShareCorrelationThreshold: 0.35,
};

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

function indicatorSeverity(metrics: NativeAnalysisIndicator["metrics"]) {
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

function analysisIndicatorsForNativeRows(stateCode: string, rows: NativeReviewRow[]) {
  const rowsByCounty = new Map<string, NativeReviewRow[]>();

  for (const row of rows) {
    if (!row.county) {
      continue;
    }

    const county = normalizeJurisdictionName(row.county);
    rowsByCounty.set(county, [...(rowsByCounty.get(county) ?? []), row]);
  }

  const indicators: NativeAnalysisIndicator[] = [];

  for (const [county, countyRows] of rowsByCounty) {
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
    const metrics = {
      demAverageDropoff,
      demOutliers,
      harrisCorrelation,
      outlierTrigger,
      repAverageDropoff,
      repOutliers,
      rowCount: countyRows.length,
      trumpCorrelation,
    };
    const severity = indicatorSeverity(metrics);
    const sourceId = countyRows.find((row) => row.sourceId)?.sourceId ?? "";

    if (
      Math.abs(trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
      Math.abs(harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
    ) {
      indicators.push({
        county,
        detail:
          "Bigger local reporting-unit vote totals move with candidate vote share strongly enough to pass the native review threshold. This is an advisory review flag, not proof of tampering.",
        jurisdictionCode: jurisdictionCode(stateCode, county),
        label: "Vote-share pattern",
        metrics,
        severity,
        sourceId,
        summary: `Vote-share correlation crossed threshold: Trump r=${trumpCorrelation.toFixed(3)}, Harris r=${harrisCorrelation.toFixed(3)}.`,
        type: "vote_share_pattern",
      });
    }

    if (
      Math.abs(demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
      Math.abs(repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct
    ) {
      indicators.push({
        county,
        detail:
          "The average gap between presidential votes and same-party down-ballot votes is large enough to review. Split-ticket voting can explain some gap; this flag identifies areas needing supporting records.",
        jurisdictionCode: jurisdictionCode(stateCode, county),
        label: "Average down-ballot difference",
        metrics,
        severity,
        sourceId,
        summary: `Average President-vs-down-ballot difference crossed threshold: DEM ${demAverageDropoff.toFixed(2)}%, REP ${repAverageDropoff.toFixed(2)}%.`,
        type: "average_down_ballot_difference",
      });
    }

    if (demOutliers + repOutliers >= outlierTrigger) {
      indicators.push({
        county,
        detail:
          "Enough local result rows have unusually large President-versus-down-ballot differences to pass the outlier-count threshold. This is an advisory review flag, not proof of tampering.",
        jurisdictionCode: jurisdictionCode(stateCode, county),
        label: "Down-ballot outliers",
        metrics,
        severity,
        sourceId,
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
  for (const indicator of analysisIndicatorsForNativeRows(stateCode, native.reviewRows)) {
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
        ${indicator.county},
        'county',
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

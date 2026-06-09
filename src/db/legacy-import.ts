import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "./url";

type LegacyCountyResult = {
  county: string;
  trump?: number;
  harris?: number;
  other?: number;
  total?: number;
};

type LegacyReviewRow = {
  county?: string;
  demDropoff?: number;
  harris?: number;
  harrisShare?: number;
  repDropoff?: number;
  total?: number;
  trump?: number;
  trumpShare?: number;
};

type LegacyAppData = {
  metadata?: {
    stateTotal?: number;
    countyRows?: number;
    sourceWorkbook?: string;
    notes?: string;
  };
  presidentCountyResults?: LegacyCountyResult[];
  etaAnalysis?: {
    coverageMode?: string;
  };
  reviewCharts?: {
    metadata?: {
      rows?: LegacyReviewRow[];
    };
  };
  turnoutData?: unknown[];
  historicalBaseline?: unknown[];
};

export type LegacyImportInput = {
  stateCode: string;
  stateName: string;
  authority: string;
  sourceSlug: string;
  sourceTitle: string;
  sourceUrl: string;
  localArtifact: string;
  parser: string;
  timestampBasis: string;
  confidence: string;
  bundleUrl: string;
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

function parseLegacyBundle(source: string): LegacyAppData {
  const firstBrace = source.indexOf("{");
  const lastSemicolon = source.lastIndexOf(";");
  const lastBrace = lastSemicolon >= 0 ? source.lastIndexOf("}", lastSemicolon) : source.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("Legacy bundle did not contain a JSON object assignment.");
  }

  return JSON.parse(source.slice(firstBrace, lastBrace + 1)) as LegacyAppData;
}

function normalizeCountyName(county: string) {
  return county.trim().replace(/\s+County$/i, "");
}

function jurisdictionCode(stateCode: string, county: string) {
  return `${stateCode}-${normalizeCountyName(county).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function pearsonSafe(xs: number[], ys: number[]) {
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

  if (!xDenominator || !yDenominator) {
    return 0;
  }

  return numerator / (xDenominator * yDenominator);
}

function indicatorSeverity(metrics: {
  demAverageDropoff: number;
  demOutliers: number;
  harrisCorrelation: number;
  outlierTrigger: number;
  repAverageDropoff: number;
  repOutliers: number;
  trumpCorrelation: number;
}) {
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

function analysisIndicatorsForState(input: LegacyImportInput, appData: LegacyAppData) {
  const reviewRows = appData.reviewCharts?.metadata?.rows ?? [];
  const rowsByCounty = new Map<string, LegacyReviewRow[]>();
  const voteShareOnly = appData.etaAnalysis?.coverageMode === "voteShareOnly";

  for (const row of reviewRows) {
    if (!row.county) {
      continue;
    }

    const county = normalizeCountyName(row.county);
    rowsByCounty.set(county, [...(rowsByCounty.get(county) ?? []), row]);
  }

  const indicators = [];

  for (const [county, rows] of rowsByCounty) {
    if (rows.length < reviewPolicy.minWardRows) {
      continue;
    }

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
    const metrics = {
      demAverageDropoff,
      demOutliers,
      harrisCorrelation,
      outlierTrigger,
      repAverageDropoff,
      repOutliers,
      rowCount: rows.length,
      trumpCorrelation,
    };
    const reasons: Array<{ detail: string; label: string; summary: string; type: string }> = [];

    if (
      Math.abs(trumpCorrelation) >= reviewPolicy.voteShareCorrelationThreshold ||
      Math.abs(harrisCorrelation) >= reviewPolicy.voteShareCorrelationThreshold
    ) {
      reasons.push({
        detail:
          "Bigger local reporting-unit vote totals move with candidate vote share strongly enough to pass the legacy review threshold. This is an advisory review flag, not proof of tampering.",
        label: "Vote-share pattern",
        summary: `Vote-share correlation crossed threshold: Trump r=${trumpCorrelation.toFixed(3)}, Harris r=${harrisCorrelation.toFixed(3)}.`,
        type: "vote_share_pattern",
      });
    }

    if (
      !voteShareOnly &&
      (Math.abs(demAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct ||
        Math.abs(repAverageDropoff) >= reviewPolicy.downBallotAverageThresholdPct)
    ) {
      reasons.push({
        detail:
          "The average gap between presidential votes and same-party down-ballot votes is large enough to review. Split-ticket voting can explain some gap; this flag identifies areas needing supporting records.",
        label: "Average down-ballot difference",
        summary: `Average President-vs-down-ballot difference crossed threshold: DEM ${demAverageDropoff.toFixed(2)}%, REP ${repAverageDropoff.toFixed(2)}%.`,
        type: "average_down_ballot_difference",
      });
    }

    if (!voteShareOnly && demOutliers + repOutliers >= outlierTrigger) {
      reasons.push({
        detail:
          "Enough local result rows have unusually large President-versus-down-ballot differences to pass the outlier-count threshold. This is an advisory review flag, not proof of tampering.",
        label: "Down-ballot outliers",
        summary: `Drop-off outlier count crossed threshold: DEM ${demOutliers}, REP ${repOutliers}, trigger ${outlierTrigger}.`,
        type: "down_ballot_outliers",
      });
    }

    const severity = indicatorSeverity(metrics);

    for (const reason of reasons) {
      indicators.push({
        county,
        detail: reason.detail,
        jurisdictionCode: jurisdictionCode(input.stateCode, county),
        label: reason.label,
        metrics,
        severity,
        summary: reason.summary,
        type: reason.type,
      });
    }
  }

  return indicators;
}

async function ensureAnalysisIndicatorsTable(sql: { query: (statement: string) => Promise<unknown> }) {
  await sql.query(`
    create table if not exists analysis_indicators (
      id uuid primary key default gen_random_uuid() not null,
      state_code text not null references states(code),
      election_year integer not null,
      jurisdiction_code text not null,
      jurisdiction_name text not null,
      level text not null,
      indicator_type text not null,
      severity numeric(10, 4) not null,
      label text not null,
      summary text not null,
      detail text not null,
      metrics jsonb default '{}'::jsonb not null,
      source_document_id uuid references source_documents(id),
      created_at timestamp with time zone default now() not null
    )
  `);
  await sql.query(`
    create unique index if not exists analysis_indicators_unique_idx
    on analysis_indicators (
      state_code,
      election_year,
      level,
      jurisdiction_code,
      indicator_type,
      label
    )
  `);
}

function validateLegacyRows(input: LegacyImportInput, appData: LegacyAppData, rows: LegacyCountyResult[]) {
  const expectedCountyRows = appData.metadata?.countyRows;
  const expectedStateTotal = appData.metadata?.stateTotal;
  const names = rows.map((row) => normalizeCountyName(row.county));
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  const numericNames = names.filter((name) => /^\d[\d,.\s-]*$/.test(name));
  const missingNames = rows.filter((row) => !row.county?.trim()).length;
  const totalVotes = rows.reduce(
    (sum, row) => sum + (row.harris ?? 0) + (row.trump ?? 0) + (row.other ?? 0),
    0,
  );
  const rowTotalMismatches = rows
    .filter((row) => row.total !== undefined)
    .filter((row) => (row.harris ?? 0) + (row.trump ?? 0) + (row.other ?? 0) !== row.total)
    .map((row) => row.county)
    .slice(0, 8);

  if (rows.length === 0) {
    throw new Error("Legacy bundle did not include presidentCountyResults rows.");
  }

  if (expectedCountyRows !== undefined && rows.length !== expectedCountyRows) {
    throw new Error(
      `Import validation failed for ${input.stateCode}: expected ${expectedCountyRows} county rows, found ${rows.length}.`,
    );
  }

  if (missingNames > 0 || duplicateNames.length > 0 || numericNames.length > 0) {
    throw new Error(
      `Import validation failed for ${input.stateCode}: invalid county labels. Missing: ${missingNames}; duplicates: ${[
        ...new Set(duplicateNames),
      ].join(", ") || "none"}; numeric labels: ${numericNames.slice(0, 8).join(", ") || "none"}.`,
    );
  }

  if (rowTotalMismatches.length > 0) {
    throw new Error(
      `Import validation failed for ${input.stateCode}: row totals do not match candidate sums for ${rowTotalMismatches.join(
        ", ",
      )}.`,
    );
  }

  if (expectedStateTotal !== undefined && totalVotes !== expectedStateTotal) {
    throw new Error(
      `Import validation failed for ${input.stateCode}: candidate sum ${totalVotes} does not match state total ${expectedStateTotal}.`,
    );
  }

  return {
    expectedCountyRows: expectedCountyRows ?? null,
    expectedStateTotal: expectedStateTotal ?? null,
    totalVotes,
  };
}

export async function cleanupLegacyState(input: Pick<LegacyImportInput, "stateCode" | "sourceSlug">) {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to clean up legacy state data.");
  }

  const sql = neon(databaseUrl);

  const deletedResults = await sql`
    delete from result_rows
    where state_code = ${input.stateCode}
    returning id
  `;
  const deletedIndicators = await sql`
    delete from analysis_indicators
    where state_code = ${input.stateCode}
    returning id
  `.catch(() => []);
  const deletedJurisdictions = await sql`
    delete from jurisdictions
    where state_code = ${input.stateCode}
    returning id
  `;
  const deletedImportRuns = await sql`
    delete from import_runs
    where state_code = ${input.stateCode}
    returning id
  `;
  const deletedSources = await sql`
    delete from source_documents
    where state_code = ${input.stateCode}
       or slug = ${input.sourceSlug}
    returning id
  `;
  const deletedCapabilities = await sql`
    delete from capability_flags
    where state_code = ${input.stateCode}
    returning state_code
  `;
  const deletedCandidates = await sql`
    delete from candidates
    where contest_id in (
      select id from contests where state_code = ${input.stateCode}
    )
    returning id
  `;
  const deletedContests = await sql`
    delete from contests
    where state_code = ${input.stateCode}
    returning id
  `;
  const deletedStateRows = await sql`
    delete from states
    where code = ${input.stateCode}
    returning code
  `;

  return {
    state: input.stateCode,
    deletedCapabilities: deletedCapabilities.length,
    deletedCandidates: deletedCandidates.length,
    deletedContests: deletedContests.length,
    deletedIndicators: deletedIndicators.length,
    deletedImportRuns: deletedImportRuns.length,
    deletedJurisdictions: deletedJurisdictions.length,
    deletedResults: deletedResults.length,
    deletedSources: deletedSources.length,
    deletedStates: deletedStateRows.length,
  };
}

export async function importLegacyState(input: LegacyImportInput) {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to import legacy state data.");
  }

  const response = await fetch(input.bundleUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch legacy bundle: ${response.status} ${response.statusText}`);
  }

  const appData = parseLegacyBundle(await response.text());
  const rows = appData.presidentCountyResults ?? [];

  const validation = validateLegacyRows(input, appData, rows);

  const sql = neon(databaseUrl);
  const hasReviewCharts = (appData.reviewCharts?.metadata?.rows?.length ?? 0) > 0;
  const indicators = analysisIndicatorsForState(input, appData);
  const hasTurnout = Array.isArray(appData.turnoutData) && appData.turnoutData.length > 0;
  const hasHistoricalBaseline =
    Array.isArray(appData.historicalBaseline) && appData.historicalBaseline.length > 0;

  await ensureAnalysisIndicatorsTable(sql);

  const [election] = await sql`
    insert into elections (year, office, election_date, label)
    values (2024, 'president', '2024-11-05', '2024 President')
    on conflict (year, office) do update set label = excluded.label
    returning id
  `;

  await sql`
    insert into states (code, name, authority, county_label)
    values (${input.stateCode}, ${input.stateName}, ${input.authority}, 'County')
    on conflict (code) do update set
      name = excluded.name,
      authority = excluded.authority,
      county_label = excluded.county_label
  `;

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
      ${input.stateCode},
      2024,
      true,
      true,
      ${hasReviewCharts},
      ${hasTurnout},
      ${hasHistoricalBaseline},
      true,
      ${appData.metadata?.notes ?? ""}
    )
    on conflict (state_code, election_year) do update set
      certified_results = true,
      map = true,
      review_graphs = excluded.review_graphs,
      turnout = excluded.turnout,
      historical_baseline = excluded.historical_baseline,
      source_planner = true,
      notes = excluded.notes
  `;

  const [contest] = await sql`
    insert into contests (election_id, state_code, office, title)
    values (${election.id}, ${input.stateCode}, 'president', ${`${input.stateName} President`})
    on conflict (election_id, state_code, office) do update set title = excluded.title
    returning id
  `;

  for (const [index, [candidateName, party]] of Object.entries(candidateParties).entries()) {
    await sql`
      insert into candidates (contest_id, name, party, ballot_order)
      values (${contest.id}, ${candidateName}, ${party}, ${index})
      on conflict (contest_id, name, party) do update set ballot_order = excluded.ballot_order
    `;
  }

  const [source] = await sql`
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
      ${input.sourceSlug},
      ${input.stateCode},
      2024,
      'Certified presidential county results',
      ${input.sourceTitle},
      ${input.sourceUrl},
      ${input.authority},
      ${input.localArtifact},
      ${input.parser},
      ${input.timestampBasis},
      ${input.confidence},
      'loaded',
      ${JSON.stringify(appData.metadata ?? {})}::jsonb
    )
    on conflict (slug) do update set
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
      ${input.stateCode},
      2024,
      ${input.parser},
      ${source.id},
      'staged',
      ${JSON.stringify({
        bundleUrl: input.bundleUrl,
        sourceUrl: input.sourceUrl,
        expectedCountyRows: appData.metadata?.countyRows ?? null,
        expectedStateTotal: appData.metadata?.stateTotal ?? null,
      })}::jsonb
    )
    returning id
  `;

  let resultRows = 0;
  let totalVotes = 0;

  for (const row of rows) {
    const county = normalizeCountyName(row.county);
    const code = jurisdictionCode(input.stateCode, row.county);
    const votesByCandidate = {
      Harris: row.harris ?? 0,
      Trump: row.trump ?? 0,
      Other: row.other ?? 0,
    };

    await sql`
      insert into jurisdictions (state_code, code, name, level)
      values (${input.stateCode}, ${code}, ${county}, 'county')
      on conflict (state_code, level, code) do update set name = excluded.name
    `;

    for (const [candidateName, votes] of Object.entries(votesByCandidate)) {
      totalVotes += votes;
      resultRows += 1;
      await sql`
        insert into result_rows (
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
          ${contest.id},
          ${input.stateCode},
          ${code},
          ${county},
          'county',
          ${candidateName},
          ${candidateParties[candidateName as keyof typeof candidateParties]},
          ${votes},
          ${source.id}
        )
        on conflict (contest_id, level, jurisdiction_code, candidate_name, party)
        do update set
          jurisdiction_name = excluded.jurisdiction_name,
          votes = excluded.votes,
          source_document_id = excluded.source_document_id
      `;
    }
  }

  await sql`
    delete from analysis_indicators
    where state_code = ${input.stateCode}
      and election_year = 2024
  `;

  for (const indicator of indicators) {
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
        ${input.stateCode},
        2024,
        ${indicator.jurisdictionCode},
        ${indicator.county},
        'county',
        ${indicator.type},
        ${indicator.severity},
        ${indicator.label},
        ${indicator.summary},
        ${indicator.detail},
        ${JSON.stringify(indicator.metrics)}::jsonb,
        ${source.id}
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
  }

  const [stored] = await sql`
    select
      count(distinct result_rows.jurisdiction_code)::int as counties,
      count(*)::int as result_rows,
      sum(result_rows.votes)::int as total_votes
    from result_rows
    inner join contests on result_rows.contest_id = contests.id
    inner join elections on contests.election_id = elections.id
    where result_rows.state_code = ${input.stateCode}
      and result_rows.level = 'county'
      and elections.year = 2024
      and elections.office = 'president'
  `;

  const storedCounties = Number(stored.counties);
  const storedRows = Number(stored.result_rows);
  const storedVotes = Number(stored.total_votes);
  const expectedStateTotal = appData.metadata?.stateTotal;

  if (
    storedCounties < rows.length ||
    storedRows < resultRows ||
    (expectedStateTotal !== undefined && totalVotes !== expectedStateTotal)
  ) {
    await sql`
      update import_runs
      set
        status = 'failed',
        finished_at = now(),
        summary = ${JSON.stringify({
          error: "Stored import counts did not match the legacy bundle.",
          expectedCounties: rows.length,
          expectedRows: resultRows,
          expectedStateTotal,
          totalVotes,
          storedCounties,
          storedRows,
          storedVotes,
        })}::jsonb
      where id = ${importRun.id}
    `;

    throw new Error(
      `Import verification failed for ${input.stateCode}: stored ${storedCounties} counties and ${storedRows} rows, expected at least ${rows.length} counties and ${resultRows} rows.`,
    );
  }

  await sql`
    update import_runs
    set
      status = 'promoted',
      finished_at = now(),
      summary = ${JSON.stringify({
        counties: rows.length,
        resultRows,
        indicatorRows: indicators.length,
        totalVotes,
        storedCounties,
        storedRows,
        storedVotes,
        expectedCountyRows: appData.metadata?.countyRows ?? null,
        expectedStateTotal: appData.metadata?.stateTotal ?? null,
      })}::jsonb
    where id = ${importRun.id}
  `;

  return {
    state: input.stateCode,
    importRunId: importRun.id,
    counties: rows.length,
    resultRows,
    indicatorRows: indicators.length,
    totalVotes: validation.totalVotes,
    storedCounties,
    storedRows,
    storedVotes,
    expectedCountyRows: appData.metadata?.countyRows ?? null,
    expectedStateTotal: appData.metadata?.stateTotal ?? null,
  };
}

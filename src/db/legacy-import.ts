import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "./url";

type LegacyCountyResult = {
  county: string;
  trump?: number;
  harris?: number;
  other?: number;
  total?: number;
};

type LegacyAppData = {
  metadata?: {
    stateTotal?: number;
    countyRows?: number;
    sourceWorkbook?: string;
    notes?: string;
  };
  presidentCountyResults?: LegacyCountyResult[];
  reviewCharts?: unknown[];
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

  if (rows.length === 0) {
    throw new Error("Legacy bundle did not include presidentCountyResults rows.");
  }

  const sql = neon(databaseUrl);
  const hasReviewCharts = Array.isArray(appData.reviewCharts) && appData.reviewCharts.length > 0;
  const hasTurnout = Array.isArray(appData.turnoutData) && appData.turnoutData.length > 0;
  const hasHistoricalBaseline =
    Array.isArray(appData.historicalBaseline) && appData.historicalBaseline.length > 0;

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
    totalVotes,
    storedCounties,
    storedRows,
    storedVotes,
    expectedCountyRows: appData.metadata?.countyRows ?? null,
    expectedStateTotal: appData.metadata?.stateTotal ?? null,
  };
}

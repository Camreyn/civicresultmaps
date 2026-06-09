import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getDb, hasDatabase } from "@/db";
import { getDatabaseUrl } from "@/db/url";
import { contests, elections } from "@/db/schema";
import {
  getCoverage,
  seedElections,
  seedImportRuns,
  seedResults,
  seedSources,
  seedStates,
} from "./seed-data";
import type {
  CapabilitySummary,
  CoverageSummary,
  AnalysisIndicator,
  CompletenessSummary,
  ElectionSummary,
  ImportRunSummary,
  ResultRow,
  SourceSummary,
  StateSummary,
} from "./types";

const emptyCapabilities: CapabilitySummary = {
  sourcePlanner: true,
  certifiedResults: false,
  map: false,
  reviewGraphs: false,
  turnout: false,
  historicalBaseline: false,
  notes: "",
};

function toIsoTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function completenessStatus(input: {
  capabilities: CapabilitySummary;
  indicatorCount: number;
  resultRows: number;
  sourceCount: number;
  sourcesMissingUrls: number;
}): CompletenessSummary["status"] {
  if (input.resultRows === 0) {
    return "pending";
  }

  if (input.sourceCount === 0 || input.sourcesMissingUrls > 0) {
    return "needs_sources";
  }

  if (!input.capabilities.map || !input.capabilities.certifiedResults) {
    return "results_only";
  }

  if (input.indicatorCount === 0 || !input.capabilities.reviewGraphs) {
    return "review_ready";
  }

  return "complete";
}

function completenessGaps(input: {
  capabilities: CapabilitySummary;
  indicatorCount: number;
  resultRows: number;
  sourceCount: number;
  sourcesMissingUrls: number;
}) {
  const gaps: string[] = [];

  if (input.resultRows === 0) {
    gaps.push("No result rows loaded");
  }

  if (input.sourceCount === 0) {
    gaps.push("No source records");
  }

  if (input.sourcesMissingUrls > 0) {
    gaps.push(`${input.sourcesMissingUrls} source URL${input.sourcesMissingUrls === 1 ? "" : "s"} missing`);
  }

  if (!input.capabilities.map) {
    gaps.push("Map capability pending");
  }

  if (input.indicatorCount === 0 || !input.capabilities.reviewGraphs) {
    gaps.push("Review indicators pending");
  }

  if (!input.capabilities.turnout) {
    gaps.push("Turnout pending");
  }

  if (!input.capabilities.historicalBaseline) {
    gaps.push("Historical baseline pending");
  }

  return gaps;
}

function seedCompletenessReport(year: number): CompletenessSummary[] {
  return seedStates.map((state) => {
    const results = seedResults.filter((row) => row.state === state.code && row.year === year);
    const sources = seedSources.filter((source) => source.state === state.code && source.electionYear === year);
    const importRuns = seedImportRuns.filter((run) => run.state === state.code && run.electionYear === year);
    const sourcesMissingUrls = sources.filter((source) => !source.sourceUrl.trim()).length;
    const indicatorCount = state.capabilities.reviewGraphs ? 1 : 0;
    const status = completenessStatus({
      capabilities: state.capabilities,
      indicatorCount,
      resultRows: results.length,
      sourceCount: sources.length,
      sourcesMissingUrls,
    });

    return {
      state: state.code,
      name: state.name,
      authority: state.authority,
      resultRows: results.length,
      resultJurisdictions: new Set(results.map((row) => row.jurisdictionCode)).size,
      sourceCount: sources.length,
      sourcesMissingUrls,
      indicatorCount,
      flaggedJurisdictions: indicatorCount,
      importRunCount: importRuns.length,
      latestImportAt: importRuns[0]?.startedAt ?? null,
      capabilities: state.capabilities,
      status,
      gaps: completenessGaps({
        capabilities: state.capabilities,
        indicatorCount,
        resultRows: results.length,
        sourceCount: sources.length,
        sourcesMissingUrls,
      }),
    };
  });
}

export function currentDataSource() {
  return hasDatabase() ? "database" : "seed-fallback";
}

export async function listStates(): Promise<StateSummary[]> {
  if (!hasDatabase()) {
    return seedStates;
  }

  let rows: Array<{
    code: string;
    name: string;
    authority: string;
    countyLabel: string;
    sourcePlanner: boolean | null;
    certifiedResults: boolean | null;
    map: boolean | null;
    reviewGraphs: boolean | null;
    turnout: boolean | null;
    historicalBaseline: boolean | null;
    notes: string | null;
  }>;

  try {
    const sql = neon(getDatabaseUrl());
    rows = (await sql`
      select
        states.code,
        states.name,
        states.authority,
        states.county_label as "countyLabel",
        capability_flags.source_planner as "sourcePlanner",
        capability_flags.certified_results as "certifiedResults",
        capability_flags.map,
        capability_flags.review_graphs as "reviewGraphs",
        capability_flags.turnout,
        capability_flags.historical_baseline as "historicalBaseline",
        capability_flags.notes
      from states
      left join capability_flags on states.code = capability_flags.state_code
      order by states.name
    `) as typeof rows;
  } catch {
    return seedStates;
  }

  if (rows.length === 0) {
    return seedStates;
  }

  const byCode = new Map<string, StateSummary>();

  for (const row of rows) {
    if (byCode.has(row.code)) {
      continue;
    }

    byCode.set(row.code, {
      code: row.code,
      name: row.name,
      authority: row.authority,
      countyLabel: row.countyLabel,
      capabilities: {
        sourcePlanner: row.sourcePlanner ?? emptyCapabilities.sourcePlanner,
        certifiedResults: row.certifiedResults ?? emptyCapabilities.certifiedResults,
        map: row.map ?? emptyCapabilities.map,
        reviewGraphs: row.reviewGraphs ?? emptyCapabilities.reviewGraphs,
        turnout: row.turnout ?? emptyCapabilities.turnout,
        historicalBaseline: row.historicalBaseline ?? emptyCapabilities.historicalBaseline,
        notes: row.notes ?? emptyCapabilities.notes,
      },
    });
  }

  return Array.from(byCode.values());
}

export async function listElections(input: {
  year?: number;
  office?: string;
}): Promise<ElectionSummary[]> {
  if (!hasDatabase()) {
    return seedElections.filter((election) => {
      if (input.year && election.year !== input.year) {
        return false;
      }

      if (input.office && election.office !== input.office.toLowerCase()) {
        return false;
      }

      return true;
    });
  }

  let rows: Array<{
    year: number;
    office: string;
    electionDate: string;
    label: string;
    stateCode: string | null;
  }>;

  try {
    const db = getDb();
    rows = await db
      .select({
        year: elections.year,
        office: elections.office,
        electionDate: elections.electionDate,
        label: elections.label,
        stateCode: contests.stateCode,
      })
      .from(elections)
      .leftJoin(contests, eq(elections.id, contests.electionId));
  } catch {
    return seedElections;
  }

  const grouped = new Map<string, ElectionSummary>();

  for (const row of rows) {
    if (input.year && row.year !== input.year) {
      continue;
    }

    if (input.office && row.office !== input.office.toLowerCase()) {
      continue;
    }

    const key = `${row.year}:${row.office}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.statesLoaded += row.stateCode ? 1 : 0;
      continue;
    }

    grouped.set(key, {
      year: row.year,
      office: row.office,
      electionDate: row.electionDate,
      label: row.label,
      statesLoaded: row.stateCode ? 1 : 0,
    });
  }

  return Array.from(grouped.values());
}

export async function listResults(input: {
  state: string;
  year: number;
  level: string;
}): Promise<ResultRow[]> {
  if (!hasDatabase()) {
    return seedResults.filter(
      (row) => row.state === input.state && row.year === input.year && row.level === input.level,
    );
  }

  let rows: Array<{
    stateCode: string;
    office: string;
    level: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    candidateName: string;
    party: string;
    votes: number;
    sourceDocumentId: string | null;
    sourceSlug: string | null;
  }>;

  try {
    const sql = neon(getDatabaseUrl());
    rows = (await sql`
      select
        result_rows.state_code as "stateCode",
        elections.office,
        result_rows.level,
        result_rows.jurisdiction_code as "jurisdictionCode",
        result_rows.jurisdiction_name as "jurisdictionName",
        result_rows.candidate_name as "candidateName",
        result_rows.party,
        result_rows.votes,
        result_rows.source_document_id as "sourceDocumentId",
        source_documents.slug as "sourceSlug"
      from result_rows
      inner join contests on result_rows.contest_id = contests.id
      inner join elections on contests.election_id = elections.id
      left join source_documents on result_rows.source_document_id = source_documents.id
      where result_rows.state_code = ${input.state}
        and result_rows.level = ${input.level}
        and elections.year = ${input.year}
      order by result_rows.jurisdiction_name, result_rows.candidate_name
    `) as typeof rows;
  } catch {
    return seedResults.filter(
      (row) => row.state === input.state && row.year === input.year && row.level === input.level,
    );
  }

  const grouped = new Map<string, ResultRow>();

  for (const row of rows) {
    const key = row.jurisdictionCode;
    const current =
      grouped.get(key) ??
      ({
        state: row.stateCode,
        year: input.year,
        office: row.office,
        level: row.level as ResultRow["level"],
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        votes: {},
        totalVotes: 0,
        marginVotes: 0,
        marginPct: 0,
        winner: "",
        sourceId: row.sourceSlug ?? row.sourceDocumentId ?? "database",
      } satisfies ResultRow);

    current.votes[row.candidateName] = row.votes;
    current.totalVotes += row.votes;
    grouped.set(key, current);
  }

  for (const row of grouped.values()) {
    const ranked = Object.entries(row.votes).sort((a, b) => b[1] - a[1]);
    row.winner = ranked[0]?.[0] ?? "";
    row.marginVotes = (ranked[0]?.[1] ?? 0) - (ranked[1]?.[1] ?? 0);
    row.marginPct = row.totalVotes > 0 ? Number(((row.marginVotes / row.totalVotes) * 100).toFixed(2)) : 0;
  }

  return Array.from(grouped.values());
}

export async function listSources(input: { state: string; year: number }): Promise<SourceSummary[]> {
  if (!hasDatabase()) {
    return seedSources.filter(
      (source) => source.state === input.state && source.electionYear === input.year,
    );
  }

  let rows: Array<{
    id: string;
    slug: string;
    state: string;
    electionYear: number;
    category: string;
    title: string;
    sourceUrl: string;
    authority: string;
    localArtifact: string | null;
    parser: string | null;
    timestampBasis: string;
    confidence: string;
    status: SourceSummary["status"];
  }>;

  try {
    const sql = neon(getDatabaseUrl());
    rows = (await sql`
      select
        id,
        slug,
        state_code as "state",
        election_year as "electionYear",
        category,
        title,
        source_url as "sourceUrl",
        authority,
        local_artifact as "localArtifact",
        parser,
        timestamp_basis as "timestampBasis",
        confidence,
        status
      from source_documents
      where state_code = ${input.state}
        and election_year = ${input.year}
      order by category, title
    `) as typeof rows;
  } catch {
    return seedSources.filter(
      (source) => source.state === input.state && source.electionYear === input.year,
    );
  }

  return rows.map((row) => ({
    id: row.slug,
    state: row.state,
    electionYear: row.electionYear,
    category: row.category,
    title: row.title,
    sourceUrl: row.sourceUrl,
    authority: row.authority,
    localArtifact: row.localArtifact ?? "",
    parser: row.parser ?? "",
    timestampBasis: row.timestampBasis,
    confidence: row.confidence,
    status: row.status,
  }));
}

export async function listIndicators(input: {
  state: string;
  year: number;
}): Promise<AnalysisIndicator[]> {
  if (!hasDatabase()) {
    return [];
  }

  let rows: Array<{
    detail: string;
    electionYear: number;
    id: string;
    jurisdictionCode: string;
    jurisdictionName: string;
    label: string;
    level: AnalysisIndicator["level"];
    metrics: unknown;
    severity: string | number;
    state: string;
    summary: string;
    type: string;
  }>;

  try {
    const sql = neon(getDatabaseUrl());
    rows = (await sql`
      select
        id,
        state_code as "state",
        election_year as "electionYear",
        jurisdiction_code as "jurisdictionCode",
        jurisdiction_name as "jurisdictionName",
        level,
        indicator_type as "type",
        severity,
        label,
        summary,
        detail,
        metrics
      from analysis_indicators
      where state_code = ${input.state}
        and election_year = ${input.year}
      order by severity desc, jurisdiction_name, label
    `) as typeof rows;
  } catch {
    return [];
  }

  return rows.map((row) => ({
    detail: row.detail,
    electionYear: row.electionYear,
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    label: row.label,
    level: row.level,
    metrics: row.metrics as Record<string, unknown>,
    severity: Number(row.severity),
    state: row.state,
    summary: row.summary,
    type: row.type,
  }));
}

export async function listCompletenessReport(input: { year: number }): Promise<CompletenessSummary[]> {
  if (!hasDatabase()) {
    return seedCompletenessReport(input.year);
  }

  type StateAggregate = {
    code: string;
    name: string;
    authority: string;
    sourcePlanner: boolean | null;
    certifiedResults: boolean | null;
    map: boolean | null;
    reviewGraphs: boolean | null;
    turnout: boolean | null;
    historicalBaseline: boolean | null;
    notes: string | null;
    resultRows: string | number | null;
    resultJurisdictions: string | number | null;
    sourceCount: string | number | null;
    sourcesMissingUrls: string | number | null;
    indicatorCount: string | number | null;
    flaggedJurisdictions: string | number | null;
    importRunCount: string | number | null;
    latestImportAt: Date | string | null;
  };

  let rows: StateAggregate[];

  try {
    const sql = neon(getDatabaseUrl());
    rows = (await sql`
      with result_counts as (
        select
          result_rows.state_code,
          count(*) as result_rows,
          count(distinct result_rows.jurisdiction_code) as result_jurisdictions
        from result_rows
        inner join contests on result_rows.contest_id = contests.id
        inner join elections on contests.election_id = elections.id
        where elections.year = ${input.year}
        group by result_rows.state_code
      ),
      source_counts as (
        select
          state_code,
          count(*) as source_count,
          count(*) filter (where trim(source_url) = '') as sources_missing_urls
        from source_documents
        where election_year = ${input.year}
        group by state_code
      ),
      indicator_counts as (
        select
          state_code,
          count(*) as indicator_count,
          count(distinct jurisdiction_code) as flagged_jurisdictions
        from analysis_indicators
        where election_year = ${input.year}
        group by state_code
      ),
      import_counts as (
        select
          state_code,
          count(*) as import_run_count,
          max(started_at) as latest_import_at
        from import_runs
        where election_year = ${input.year}
        group by state_code
      )
      select
        states.code,
        states.name,
        states.authority,
        capability_flags.source_planner as "sourcePlanner",
        capability_flags.certified_results as "certifiedResults",
        capability_flags.map,
        capability_flags.review_graphs as "reviewGraphs",
        capability_flags.turnout,
        capability_flags.historical_baseline as "historicalBaseline",
        capability_flags.notes,
        coalesce(result_counts.result_rows, 0) as "resultRows",
        coalesce(result_counts.result_jurisdictions, 0) as "resultJurisdictions",
        coalesce(source_counts.source_count, 0) as "sourceCount",
        coalesce(source_counts.sources_missing_urls, 0) as "sourcesMissingUrls",
        coalesce(indicator_counts.indicator_count, 0) as "indicatorCount",
        coalesce(indicator_counts.flagged_jurisdictions, 0) as "flaggedJurisdictions",
        coalesce(import_counts.import_run_count, 0) as "importRunCount",
        import_counts.latest_import_at as "latestImportAt"
      from states
      left join capability_flags
        on states.code = capability_flags.state_code
        and capability_flags.election_year = ${input.year}
      left join result_counts on states.code = result_counts.state_code
      left join source_counts on states.code = source_counts.state_code
      left join indicator_counts on states.code = indicator_counts.state_code
      left join import_counts on states.code = import_counts.state_code
      order by states.name
    `) as StateAggregate[];
  } catch {
    return seedCompletenessReport(input.year);
  }

  return rows.map((row) => {
    const capabilities: CapabilitySummary = {
      sourcePlanner: row.sourcePlanner ?? emptyCapabilities.sourcePlanner,
      certifiedResults: row.certifiedResults ?? emptyCapabilities.certifiedResults,
      map: row.map ?? emptyCapabilities.map,
      reviewGraphs: row.reviewGraphs ?? emptyCapabilities.reviewGraphs,
      turnout: row.turnout ?? emptyCapabilities.turnout,
      historicalBaseline: row.historicalBaseline ?? emptyCapabilities.historicalBaseline,
      notes: row.notes ?? emptyCapabilities.notes,
    };
    const resultRows = Number(row.resultRows ?? 0);
    const sourceCount = Number(row.sourceCount ?? 0);
    const sourcesMissingUrls = Number(row.sourcesMissingUrls ?? 0);
    const indicatorCount = Number(row.indicatorCount ?? 0);
    const status = completenessStatus({
      capabilities,
      indicatorCount,
      resultRows,
      sourceCount,
      sourcesMissingUrls,
    });

    return {
      state: row.code,
      name: row.name,
      authority: row.authority,
      resultRows,
      resultJurisdictions: Number(row.resultJurisdictions ?? 0),
      sourceCount,
      sourcesMissingUrls,
      indicatorCount,
      flaggedJurisdictions: Number(row.flaggedJurisdictions ?? 0),
      importRunCount: Number(row.importRunCount ?? 0),
      latestImportAt: toIsoTimestamp(row.latestImportAt),
      capabilities,
      status,
      gaps: completenessGaps({
        capabilities,
        indicatorCount,
        resultRows,
        sourceCount,
        sourcesMissingUrls,
      }),
    };
  });
}

export async function getCoverageSummary(input: {
  state: string;
  year: number;
}): Promise<CoverageSummary | null> {
  if (!hasDatabase()) {
    return getCoverage(input.state, input.year);
  }

  const [stateList, results, sources] = await Promise.all([
    listStates(),
    listResults({ state: input.state, year: input.year, level: "county" }),
    listSources(input),
  ]);
  const state = stateList.find((entry) => entry.code === input.state);

  if (!state) {
    return null;
  }

  const loadedJurisdictions = new Set(results.map((row) => row.jurisdictionCode)).size;

  return {
    state: input.state,
    year: input.year,
    expectedJurisdictions: loadedJurisdictions,
    loadedJurisdictions,
    resultRows: results.length,
    sourceCount: sources.length,
    validation: {
      passed: results.length > 0 && sources.length > 0,
      warnings: results.length > 0 ? [] : ["No result rows are loaded for this state yet."],
      errors: [],
    },
    capabilities: state.capabilities,
  };
}

export async function listImportRuns(): Promise<ImportRunSummary[]> {
  if (!hasDatabase()) {
    return seedImportRuns;
  }

  let rows: Array<{
    id: string;
    state: string;
    electionYear: number;
    parser: string;
    status: ImportRunSummary["status"];
    startedAt: Date | string;
    finishedAt: Date | string | null;
    summary: unknown;
  }>;

  try {
    const sql = neon(getDatabaseUrl());
    rows = (await sql`
      select
        id,
        state_code as "state",
        election_year as "electionYear",
        parser,
        status,
        started_at as "startedAt",
        finished_at as "finishedAt",
        summary
      from import_runs
      order by started_at desc
      limit 20
    `) as typeof rows;
  } catch {
    return seedImportRuns;
  }

  return rows.map((row) => ({
    id: row.id,
    state: row.state,
    electionYear: row.electionYear,
    parser: row.parser,
    status: row.status,
    startedAt: toIsoTimestamp(row.startedAt) ?? "",
    finishedAt: toIsoTimestamp(row.finishedAt),
    summary: row.summary as Record<string, unknown>,
  }));
}

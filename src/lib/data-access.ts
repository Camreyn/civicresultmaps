import { and, eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getDb, hasDatabase } from "@/db";
import { getDatabaseUrl } from "@/db/url";
import { contests, elections, sourceDocuments } from "@/db/schema";
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
    const db = getDb();
    rows = await db
      .select({
        id: sourceDocuments.id,
        slug: sourceDocuments.slug,
        state: sourceDocuments.stateCode,
        electionYear: sourceDocuments.electionYear,
        category: sourceDocuments.category,
        title: sourceDocuments.title,
        sourceUrl: sourceDocuments.sourceUrl,
        authority: sourceDocuments.authority,
        localArtifact: sourceDocuments.localArtifact,
        parser: sourceDocuments.parser,
        timestampBasis: sourceDocuments.timestampBasis,
        confidence: sourceDocuments.confidence,
        status: sourceDocuments.status,
      })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.stateCode, input.state),
          eq(sourceDocuments.electionYear, input.year),
        ),
      );
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

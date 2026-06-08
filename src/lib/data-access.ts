import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import {
  capabilityFlags,
  contests,
  elections,
  importRuns,
  resultRows,
  sourceDocuments,
  states,
} from "@/db/schema";
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
    const db = getDb();
    rows = await db
      .select({
        code: states.code,
        name: states.name,
        authority: states.authority,
        countyLabel: states.countyLabel,
        sourcePlanner: capabilityFlags.sourcePlanner,
        certifiedResults: capabilityFlags.certifiedResults,
        map: capabilityFlags.map,
        reviewGraphs: capabilityFlags.reviewGraphs,
        turnout: capabilityFlags.turnout,
        historicalBaseline: capabilityFlags.historicalBaseline,
        notes: capabilityFlags.notes,
      })
      .from(states)
      .leftJoin(capabilityFlags, eq(states.code, capabilityFlags.stateCode))
      .orderBy(states.name);
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
    const db = getDb();
    rows = await db
      .select({
        stateCode: resultRows.stateCode,
        office: elections.office,
        level: resultRows.level,
        jurisdictionCode: resultRows.jurisdictionCode,
        jurisdictionName: resultRows.jurisdictionName,
        candidateName: resultRows.candidateName,
        party: resultRows.party,
        votes: resultRows.votes,
        sourceDocumentId: resultRows.sourceDocumentId,
        sourceSlug: sourceDocuments.slug,
      })
      .from(resultRows)
      .innerJoin(contests, eq(resultRows.contestId, contests.id))
      .innerJoin(elections, eq(contests.electionId, elections.id))
      .leftJoin(sourceDocuments, eq(resultRows.sourceDocumentId, sourceDocuments.id))
      .where(
        and(
          eq(resultRows.stateCode, input.state),
          eq(resultRows.level, input.level),
          eq(elections.year, input.year),
        ),
      );
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
    startedAt: Date;
    finishedAt: Date | null;
    summary: unknown;
  }>;

  try {
    const db = getDb();
    rows = await db
      .select({
        id: importRuns.id,
        state: importRuns.stateCode,
        electionYear: importRuns.electionYear,
        parser: importRuns.parser,
        status: importRuns.status,
        startedAt: importRuns.startedAt,
        finishedAt: importRuns.finishedAt,
        summary: importRuns.summary,
      })
      .from(importRuns)
      .orderBy(importRuns.startedAt);
  } catch {
    return seedImportRuns;
  }

  return rows.map((row) => ({
    id: row.id,
    state: row.state,
    electionYear: row.electionYear,
    parser: row.parser,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    summary: row.summary as Record<string, unknown>,
  }));
}

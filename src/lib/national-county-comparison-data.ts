import { neon } from "@neondatabase/serverless";
import { hasDatabase } from "@/db";
import { getDatabaseUrl } from "@/db/url";
import {
  getCanonicalJurisdictionRegistry,
  jurisdictionTagForRow,
  resolveJurisdictionTag,
} from "./jurisdiction-tags";
import { seedResults, seedSources } from "./seed-data";
import {
  buildNationalCountyComparison,
  dataConfidenceForPath,
  makeNationalCountySnapshot,
  sumYearCoverage,
  type CanonicalCountyReference,
  type CountyFlipDirection,
  type CountyTurnoutSnapshot,
  type NationalComparisonCoverage,
  type NationalComparisonSummary,
  type NationalComparisonYear,
  type NationalCountyComparisonRow,
  type NationalCountySnapshotRecord,
  type NationalYearDataset,
  type NationalYearDatasetCoverage,
} from "./national-county-comparison";

type SourceFields = {
  sourceAuthority: string | null;
  sourceConfidence: string | null;
  sourceId: string;
  sourceMetadata: unknown;
  sourceParser: string | null;
  sourceStatus: string | null;
  sourceUrl: string | null;
};

type RawResultCandidate = SourceFields & {
  candidateName: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag: string | null;
  level: string;
  party: string;
  state: string;
  votes: number;
};

type RawHistoricalResult = SourceFields & {
  demVotes: number | null;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag: string | null;
  localUnit: string;
  metrics: unknown;
  otherVotes: number | null;
  repVotes: number | null;
  rowMethod: string;
  sourceLevel: string;
  state: string;
  totalVotes: number | null;
};

type RawTurnout = {
  ballotsCast: number;
  denominatorNote: string;
  jurisdictionCode: string;
  jurisdictionTag: string | null;
  level: string;
  registeredVoters: number | null;
  state: string;
  turnoutPct: number | null;
};

type MutableDiagnostics = {
  canonicalTags: Map<string, Set<string>>;
  comparableTags: Map<string, Set<string>>;
  duplicateTags: Map<string, Set<string>>;
  invalidUnits: Map<string, Set<string>>;
  nonGeographicUnits: Map<string, Set<string>>;
  rawUnits: Map<string, Set<string>>;
  unresolvedUnits: Map<string, Set<string>>;
};

export type NationalCountyComparisonQuery = {
  direction: CountyFlipDirection | "all";
  fips?: string;
  from: NationalComparisonYear;
  limit: number;
  offset: number;
  query?: string;
  state?: string;
  to: NationalComparisonYear;
};

export type NationalCountyComparisonQueryResult = {
  coverage: NationalComparisonCoverage;
  pagination: {
    hasMore: boolean;
    limit: number;
    offset: number;
    returned: number;
    total: number;
  };
  rows: NationalCountyComparisonRow[];
  summary: NationalComparisonSummary;
};


function setFor(map: Map<string, Set<string>>, state: string) {
  const existing = map.get(state);
  if (existing) return existing;
  const created = new Set<string>();
  map.set(state, created);
  return created;
}

function createDiagnostics(): MutableDiagnostics {
  return {
    canonicalTags: new Map(),
    comparableTags: new Map(),
    duplicateTags: new Map(),
    invalidUnits: new Map(),
    nonGeographicUnits: new Map(),
    rawUnits: new Map(),
    unresolvedUnits: new Map(),
  };
}

function zeroCoverage(): NationalYearDatasetCoverage {
  return {
    canonicalTaggedRows: 0,
    comparableRows: 0,
    duplicateTags: 0,
    invalidCanonicalTags: 0,
    nonGeographicRows: 0,
    rawJurisdictions: 0,
    unresolvedRows: 0,
  };
}

function finalizeDiagnostics(diagnostics: MutableDiagnostics) {
  const states = new Set([
    ...diagnostics.rawUnits.keys(),
    ...diagnostics.canonicalTags.keys(),
    ...diagnostics.comparableTags.keys(),
  ]);
  const stateCoverage: Record<string, NationalYearDatasetCoverage> = {};
  for (const state of states) {
    stateCoverage[state] = {
      canonicalTaggedRows: diagnostics.canonicalTags.get(state)?.size ?? 0,
      comparableRows: diagnostics.comparableTags.get(state)?.size ?? 0,
      duplicateTags: diagnostics.duplicateTags.get(state)?.size ?? 0,
      invalidCanonicalTags: diagnostics.invalidUnits.get(state)?.size ?? 0,
      nonGeographicRows: diagnostics.nonGeographicUnits.get(state)?.size ?? 0,
      rawJurisdictions: diagnostics.rawUnits.get(state)?.size ?? 0,
      unresolvedRows: diagnostics.unresolvedUnits.get(state)?.size ?? 0,
    };
  }
  return {
    coverage: sumYearCoverage(Object.values(stateCoverage)),
    stateCoverage,
  };
}

const canonicalReferences: CanonicalCountyReference[] = getCanonicalJurisdictionRegistry()
  .jurisdictions
  .filter((row) => /^county:\d{5}$/.test(row.jurisdictionTag))
  .map((row) => ({
    aliases: row.aliases,
    caveat: row.caveat,
    displayName: row.displayName,
    fips: row.fips,
    jurisdictionTag: row.jurisdictionTag,
    state: row.state,
  }));
const canonicalByTag = new Map(canonicalReferences.map((row) => [row.jurisdictionTag, row]));

export function listCanonicalCountyReferences() {
  return canonicalReferences;
}

function canonicalTagFor(state: string, jurisdictionTag: string | null) {
  if (!jurisdictionTag || !/^county:\d{5}$/.test(jurisdictionTag)) return null;
  const canonical = canonicalByTag.get(jurisdictionTag);
  return canonical?.state === state ? jurisdictionTag : null;
}

function observeUnit(input: {
  diagnostics: MutableDiagnostics;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag: string | null;
  level: string;
  state: string;
}) {
  const unitKey = `${input.jurisdictionCode}\u0000${input.jurisdictionName}\u0000${input.level}`;
  setFor(input.diagnostics.rawUnits, input.state).add(unitKey);
  const tag = canonicalTagFor(input.state, input.jurisdictionTag);
  if (tag) {
    setFor(input.diagnostics.canonicalTags, input.state).add(tag);
    return tag;
  }

  if (input.jurisdictionTag) {
    setFor(input.diagnostics.invalidUnits, input.state).add(unitKey);
    return null;
  }

  const resolution = resolveJurisdictionTag({
    state: input.state,
    jurisdictionCode: input.jurisdictionCode,
    jurisdictionName: input.jurisdictionName,
    level: input.level,
  });
  if (resolution.reason === "non_geographic") {
    setFor(input.diagnostics.nonGeographicUnits, input.state).add(unitKey);
  } else {
    // Resolution is diagnostic only. Comparisons require a persisted canonical tag.
    setFor(input.diagnostics.unresolvedUnits, input.state).add(unitKey);
  }
  return null;
}

function textField(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 500);
    }
  }
  return null;
}

function joinCaveats(...values: Array<string | null | undefined>) {
  const unique = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
  return unique.length ? unique.join(" ") : null;
}

function pathCaveat(confidence: ReturnType<typeof dataConfidenceForPath>, path: string) {
  if (confidence === "proxy") {
    return "This baseline uses a documented secondary source; review its provenance before relying on the total.";
  }
  if (confidence === "derived") {
    return `The county-equivalent total was produced through the documented ${path || "aggregation"} normalization path.`;
  }
  if (confidence === "partial") {
    return "One or more vote fields or source-status checks are incomplete for this snapshot.";
  }
  return null;
}

function partyFamily(candidateName: string, party: string) {
  const normalizedParty = party.trim().toLowerCase();
  if (normalizedParty === "d" || normalizedParty.startsWith("dem") || normalizedParty === "dfl") {
    return "dem" as const;
  }
  if (normalizedParty === "r" || normalizedParty.startsWith("rep")) {
    return "rep" as const;
  }
  if (/\b(harris|biden|clinton|obama)\b/i.test(candidateName)) {
    return "dem" as const;
  }
  if (/\b(trump|romney|mccain)\b/i.test(candidateName)) {
    return "rep" as const;
  }
  return "other" as const;
}

function turnoutByTag(rows: RawTurnout[]) {
  const grouped = new Map<string, RawTurnout[]>();
  for (const row of rows) {
    const tag = canonicalTagFor(row.state, row.jurisdictionTag);
    if (!tag) continue;
    grouped.set(tag, [...(grouped.get(tag) ?? []), row]);
  }

  const result = new Map<string, CountyTurnoutSnapshot>();
  for (const [tag, matches] of grouped) {
    const unitKeys = new Set(matches.map((row) => `${row.jurisdictionCode}\u0000${row.level}\u0000${row.ballotsCast}`));
    if (unitKeys.size !== 1) continue;
    const row = matches[0];
    result.set(tag, {
      ballotsCast: Number(row.ballotsCast),
      denominatorNote: row.denominatorNote,
      registeredVoters: row.registeredVoters == null ? null : Number(row.registeredVoters),
      turnoutPct: row.turnoutPct == null ? null : Number(row.turnoutPct),
    });
  }
  return result;
}

function resultDataset(
  year: NationalComparisonYear,
  candidates: RawResultCandidate[],
  turnoutRows: RawTurnout[],
  source: NationalYearDataset["source"],
): NationalYearDataset {
  const diagnostics = createDiagnostics();
  const observedUnits = new Set<string>();
  const groups = new Map<string, { rows: RawResultCandidate[]; unitKeys: Set<string> }>();

  for (const row of candidates) {
    const unitKey = `${row.state}\u0000${row.jurisdictionCode}\u0000${row.jurisdictionName}\u0000${row.level}`;
    if (!observedUnits.has(unitKey)) {
      observeUnit({ diagnostics, ...row });
      observedUnits.add(unitKey);
    }
    const tag = canonicalTagFor(row.state, row.jurisdictionTag);
    if (!tag) continue;
    const group = groups.get(tag) ?? { rows: [], unitKeys: new Set<string>() };
    group.rows.push(row);
    group.unitKeys.add(unitKey);
    groups.set(tag, group);
  }

  const turnout = turnoutByTag(turnoutRows);
  const snapshots: NationalCountySnapshotRecord[] = [];
  for (const [tag, group] of groups) {
    const canonical = canonicalByTag.get(tag);
    if (!canonical) continue;
    if (group.unitKeys.size !== 1) {
      setFor(diagnostics.duplicateTags, canonical.state).add(tag);
      continue;
    }

    let demVotes = 0;
    let repVotes = 0;
    let otherVotes = 0;
    for (const row of group.rows) {
      const family = partyFamily(row.candidateName, row.party);
      if (family === "dem") demVotes += Number(row.votes);
      else if (family === "rep") repVotes += Number(row.votes);
      else otherVotes += Number(row.votes);
    }
    const first = group.rows[0];
    const sourceStatus = group.rows.every((row) => row.sourceStatus === "loaded") ? "loaded" : first.sourceStatus;
    const parserPath = first.sourceParser ?? "certified county result";
    const classificationPath = [
      parserPath,
      first.sourceConfidence,
      textField(first.sourceMetadata, ["rowMethod", "row_method", "aggregationMethod", "method"]),
    ].filter(Boolean).join(" / ");
    const confidence = dataConfidenceForPath({
      demVotes,
      otherVotes,
      repVotes,
      sourceLevel: first.level,
      sourceParser: classificationPath,
      sourceStatus,
      totalVotes: demVotes + repVotes + otherVotes,
    });
    const snapshot = makeNationalCountySnapshot({
      caveat: joinCaveats(
        textField(first.sourceMetadata, ["caveat", "notes", "note"]),
        pathCaveat(confidence, parserPath),
      ),
      confidence,
      demVotes,
      otherVotes,
      repVotes,
      sourceAuthority: first.sourceAuthority,
      sourceConfidence: first.sourceConfidence,
      sourceId: first.sourceId,
      sourceUrl: first.sourceUrl,
      totalVotes: demVotes + repVotes + otherVotes,
      turnout: turnout.get(tag) ?? null,
      year,
    });
    snapshots.push({
      fips: canonical.fips,
      jurisdictionTag: tag,
      snapshot,
      state: canonical.state,
    });
    if (snapshot.winner !== "unavailable") {
      setFor(diagnostics.comparableTags, canonical.state).add(tag);
    }
  }

  const finalized = finalizeDiagnostics(diagnostics);
  return {
    ...finalized,
    family: "results",
    snapshots,
    source,
    year,
  };
}

function historicalDataset(
  year: NationalComparisonYear,
  historicalRows: RawHistoricalResult[],
  turnoutRows: RawTurnout[],
  source: NationalYearDataset["source"],
): NationalYearDataset {
  const diagnostics = createDiagnostics();
  const groups = new Map<string, RawHistoricalResult[]>();
  for (const row of historicalRows) {
    const tag = observeUnit({
      diagnostics,
      jurisdictionCode: row.jurisdictionCode,
      jurisdictionName: row.jurisdictionName,
      jurisdictionTag: row.jurisdictionTag,
      level: row.sourceLevel,
      state: row.state,
    });
    if (!tag) continue;
    groups.set(tag, [...(groups.get(tag) ?? []), row]);
  }

  const turnout = turnoutByTag(turnoutRows);
  const snapshots: NationalCountySnapshotRecord[] = [];
  for (const [tag, rows] of groups) {
    const canonical = canonicalByTag.get(tag);
    if (!canonical) continue;
    if (rows.length !== 1) {
      setFor(diagnostics.duplicateTags, canonical.state).add(tag);
      continue;
    }

    const row = rows[0];
    const parserPath = [row.rowMethod, row.sourceParser].filter(Boolean).join(" / ");
    const classificationPath = [parserPath, row.sourceConfidence].filter(Boolean).join(" / ");
    const confidence = dataConfidenceForPath({
      demVotes: row.demVotes,
      otherVotes: row.otherVotes,
      repVotes: row.repVotes,
      sourceLevel: row.sourceLevel,
      sourceParser: classificationPath,
      sourceStatus: row.sourceStatus,
      totalVotes: row.totalVotes,
    });
    const snapshot = makeNationalCountySnapshot({
      caveat: joinCaveats(
        textField(row.sourceMetadata, ["caveat", "notes", "note"]),
        textField(row.metrics, ["caveat", "notes", "note"]),
        pathCaveat(confidence, parserPath),
      ),
      confidence,
      demVotes: row.demVotes,
      otherVotes: row.otherVotes,
      repVotes: row.repVotes,
      sourceAuthority: row.sourceAuthority,
      sourceConfidence: row.sourceConfidence,
      sourceId: row.sourceId,
      sourceUrl: row.sourceUrl,
      totalVotes: row.totalVotes,
      turnout: turnout.get(tag) ?? null,
      year,
    });
    snapshots.push({
      fips: canonical.fips,
      jurisdictionTag: tag,
      snapshot,
      state: canonical.state,
    });
    if (snapshot.winner !== "unavailable") {
      setFor(diagnostics.comparableTags, canonical.state).add(tag);
    }
  }

  const finalized = finalizeDiagnostics(diagnostics);
  return {
    ...finalized,
    family: "historical",
    snapshots,
    source,
    year,
  };
}

function seedResultCandidates(year: NationalComparisonYear): RawResultCandidate[] {
  const sourceById = new Map(seedSources.map((source) => [source.id, source]));
  return seedResults
    .filter((row) => row.year === year && row.office === "president" && row.level === "county")
    .flatMap((row) => Object.entries(row.votes).map(([candidateName, votes]) => {
      const source = sourceById.get(row.sourceId);
      return {
        candidateName,
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        jurisdictionTag: row.jurisdictionTag ?? jurisdictionTagForRow({
          state: row.state,
          jurisdictionCode: row.jurisdictionCode,
          jurisdictionName: row.jurisdictionName,
          level: row.level,
        }),
        level: row.level,
        party: candidateName === "Harris" ? "Democratic" : candidateName === "Trump" ? "Republican" : "Other",
        sourceAuthority: source?.authority ?? null,
        sourceConfidence: source?.confidence ?? null,
        sourceId: row.sourceId,
        sourceMetadata: null,
        sourceParser: source?.parser ?? null,
        sourceStatus: source?.status ?? "loaded",
        sourceUrl: source?.sourceUrl ?? null,
        state: row.state,
        votes,
      };
    }));
}

async function loadDatabaseResultCandidates(year: NationalComparisonYear) {
  const sql = neon(getDatabaseUrl());
  return (await sql`
    select
      result_rows.state_code as "state",
      result_rows.jurisdiction_code as "jurisdictionCode",
      result_rows.jurisdiction_name as "jurisdictionName",
      result_rows.jurisdiction_tag as "jurisdictionTag",
      result_rows.level,
      result_rows.candidate_name as "candidateName",
      result_rows.party,
      result_rows.votes,
      coalesce(source_documents.slug, result_rows.source_document_id::text, 'database') as "sourceId",
      source_documents.source_url as "sourceUrl",
      source_documents.authority as "sourceAuthority",
      source_documents.confidence as "sourceConfidence",
      source_documents.status as "sourceStatus",
      source_documents.parser as "sourceParser",
      source_documents.metadata as "sourceMetadata"
    from result_rows
    inner join contests on result_rows.contest_id = contests.id
    inner join elections on contests.election_id = elections.id
    left join source_documents on result_rows.source_document_id = source_documents.id
    where elections.year = ${year}
      and lower(elections.office) = 'president'
      and (result_rows.level = 'county' or result_rows.jurisdiction_tag like 'county:%')
    order by result_rows.state_code, result_rows.jurisdiction_name, result_rows.candidate_name
  `) as RawResultCandidate[];
}

async function loadDatabaseHistoricalRows(year: NationalComparisonYear) {
  const sql = neon(getDatabaseUrl());
  return (await sql`
    select
      historical_result_rows.state_code as "state",
      historical_result_rows.jurisdiction_code as "jurisdictionCode",
      historical_result_rows.jurisdiction_name as "jurisdictionName",
      historical_result_rows.jurisdiction_tag as "jurisdictionTag",
      historical_result_rows.local_unit as "localUnit",
      historical_result_rows.source_level as "sourceLevel",
      historical_result_rows.row_method as "rowMethod",
      historical_result_rows.dem_votes as "demVotes",
      historical_result_rows.rep_votes as "repVotes",
      historical_result_rows.other_votes as "otherVotes",
      historical_result_rows.total_votes as "totalVotes",
      historical_result_rows.metrics,
      coalesce(source_documents.slug, historical_result_rows.source_id, 'database') as "sourceId",
      source_documents.source_url as "sourceUrl",
      source_documents.authority as "sourceAuthority",
      source_documents.confidence as "sourceConfidence",
      source_documents.status as "sourceStatus",
      source_documents.parser as "sourceParser",
      source_documents.metadata as "sourceMetadata"
    from historical_result_rows
    left join source_documents on historical_result_rows.source_document_id = source_documents.id
    where historical_result_rows.election_year = ${year}
    order by historical_result_rows.state_code, historical_result_rows.jurisdiction_name
  `) as RawHistoricalResult[];
}

async function loadDatabaseTurnoutRows(year: NationalComparisonYear) {
  const sql = neon(getDatabaseUrl());
  return (await sql`
    select
      turnout_rows.state_code as "state",
      turnout_rows.jurisdiction_code as "jurisdictionCode",
      turnout_rows.jurisdiction_tag as "jurisdictionTag",
      turnout_rows.level,
      turnout_rows.ballots_cast as "ballotsCast",
      turnout_rows.registered_voters as "registeredVoters",
      turnout_rows.turnout_pct as "turnoutPct",
      turnout_rows.denominator_note as "denominatorNote"
    from turnout_rows
    where turnout_rows.election_year = ${year}
      and turnout_rows.jurisdiction_tag like 'county:%'
    order by turnout_rows.state_code, turnout_rows.jurisdiction_code
  `) as RawTurnout[];
}

async function loadNationalYearDatasetUncached(year: NationalComparisonYear): Promise<NationalYearDataset> {
  if (!hasDatabase()) {
    if (year === 2024) {
      return resultDataset(year, seedResultCandidates(year), [], "seed_fallback");
    }
    return historicalDataset(year, [], [], "seed_fallback");
  }

  try {
    const turnoutRowsPromise = loadDatabaseTurnoutRows(year);
    if (year === 2024) {
      const [candidates, turnoutRows] = await Promise.all([
        loadDatabaseResultCandidates(year),
        turnoutRowsPromise,
      ]);
      return resultDataset(year, candidates, turnoutRows, "database");
    }
    const [historicalRows, turnoutRows] = await Promise.all([
      loadDatabaseHistoricalRows(year),
      turnoutRowsPromise,
    ]);
    return historicalDataset(year, historicalRows, turnoutRows, "database");
  } catch {
    if (year === 2024) {
      return resultDataset(year, seedResultCandidates(year), [], "seed_fallback");
    }
    return historicalDataset(year, [], [], "seed_fallback");
  }
}

export async function loadNationalYearDataset(year: NationalComparisonYear) {
  // A complete national year is larger than Next's 2 MB serialized data-cache limit.
  // Keep this boundary uncached so production-scale requests cannot fail during cache writes.
  return loadNationalYearDatasetUncached(year);
}

export async function queryNationalCountyComparisons(
  input: NationalCountyComparisonQuery,
): Promise<NationalCountyComparisonQueryResult> {
  const [from, to] = await Promise.all([
    loadNationalYearDataset(input.from),
    loadNationalYearDataset(input.to),
  ]);
  const result = buildNationalCountyComparison({
    direction: input.direction,
    fips: input.fips,
    from,
    query: input.query,
    references: canonicalReferences,
    state: input.state,
    to,
  });
  const rows = result.rows.slice(input.offset, input.offset + input.limit);

  return {
    coverage: result.coverage,
    pagination: {
      hasMore: input.offset + rows.length < result.rows.length,
      limit: input.limit,
      offset: input.offset,
      returned: rows.length,
      total: result.rows.length,
    },
    rows,
    summary: result.summary,
  };
}

export function emptyNationalYearCoverage() {
  return zeroCoverage();
}

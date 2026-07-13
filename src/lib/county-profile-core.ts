import {
  classifyDataConfidence,
  combineDataConfidence,
  type DataConfidence,
} from "./data-confidence.ts";
import {
  jurisdictionTagForRow,
  type CanonicalJurisdiction,
} from "./jurisdiction-tags.ts";
import { stateNameForCode } from "./us-states.ts";
import type {
  AnalysisIndicator,
  EquipmentRowSummary,
  HistoricalResultRowSummary,
  ResultRow,
  SourceSummary,
  TurnoutRowSummary,
  VoteMethodRowSummary,
} from "./types.ts";

export const countyProfileYears = [2016, 2020, 2024] as const;
export type CountyProfileYear = (typeof countyProfileYears)[number];

export type CountySourceReference = {
  authority: string;
  category: string;
  confidence: string;
  id: string;
  sourceUrl: string;
  status: string;
  title: string;
};

export type CountyElectionHistory = {
  available: boolean;
  candidateLabels: { dem: string; rep: string };
  caveats: string[];
  confidence: DataConfidence;
  demSharePct: number | null;
  demVotes: number | null;
  leader: "Democratic" | "Republican" | "Tie" | null;
  marginPct: number | null;
  marginVotes: number | null;
  otherVotes: number | null;
  repSharePct: number | null;
  repVotes: number | null;
  source: CountySourceReference | null;
  sourceLevel: string;
  totalVotes: number | null;
  year: CountyProfileYear;
};

export type CountyTurnoutContext = {
  available: boolean;
  ballotsCast: number | null;
  confidence: DataConfidence;
  denominatorNotes: string[];
  level: string;
  registeredVoters: number | null;
  rowCount: number;
  source: CountySourceReference | null;
  turnoutPct: number | null;
  warningRequired: boolean;
  year: 2024;
};

export type CountyEquipmentContext = EquipmentRowSummary & {
  confidence: DataConfidence;
};

export type CountyVoteMethodContext = VoteMethodRowSummary & {
  confidence: DataConfidence;
  jurisdictionTag: string;
};

export type CountyProfile = {
  aliases: string[];
  advisoryIndicators: AnalysisIndicator[];
  caveats: string[];
  confidence: DataConfidence;
  displayName: string;
  equipment: CountyEquipmentContext[];
  fips: string;
  geographyLevel: string;
  geometrySource: string;
  history: CountyElectionHistory[];
  jurisdictionTag: string;
  sources: CountySourceReference[];
  state: string;
  stateName: string;
  turnout: CountyTurnoutContext;
  voteMethods: CountyVoteMethodContext[];
};

export type CountyProfileBuildInput = {
  county: CanonicalJurisdiction;
  currentResults: ResultRow[];
  equipmentRows: EquipmentRowSummary[];
  historicalRows: HistoricalResultRowSummary[];
  indicators: AnalysisIndicator[];
  sources: SourceSummary[];
  turnoutRows: TurnoutRowSummary[];
  voteMethodRows: VoteMethodRowSummary[];
};

const candidateLabels: Record<CountyProfileYear, { dem: string; rep: string }> = {
  2016: { dem: "Hillary Clinton", rep: "Donald Trump" },
  2020: { dem: "Joe Biden", rep: "Donald Trump" },
  2024: { dem: "Kamala Harris", rep: "Donald Trump" },
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function roundedPct(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

function normalizeTotal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function sourceReference(
  sourceId: string | null | undefined,
  sources: SourceSummary[],
  fallback?: Partial<CountySourceReference>,
): CountySourceReference | null {
  const normalizedId = String(sourceId || "").trim();
  const source = sources.find((row) => row.id === normalizedId);
  if (source) {
    return {
      authority: source.authority,
      category: source.category,
      confidence: source.confidence,
      id: source.id,
      sourceUrl: fallback?.sourceUrl || source.sourceUrl,
      status: source.status,
      title: source.title,
    };
  }
  if (!normalizedId && !fallback?.sourceUrl && !fallback?.title) {
    return null;
  }
  return {
    authority: fallback?.authority ?? "Source authority is recorded in the state package",
    category: fallback?.category ?? "Election data source",
    confidence: fallback?.confidence ?? "See the state source package for provenance and caveats.",
    id: normalizedId || fallback?.id || "source-reference",
    sourceUrl: fallback?.sourceUrl ?? "",
    status: fallback?.status ?? "loaded",
    title: fallback?.title ?? (normalizedId || "Source reference"),
  };
}

function tagForRow(row: {
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionTag?: string | null;
  level?: string | null;
  state: string;
}) {
  return row.jurisdictionTag ?? jurisdictionTagForRow({
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    level: row.level,
    state: row.state,
  });
}

function tagForVoteMethod(row: VoteMethodRowSummary) {
  return row.jurisdictionTag
    ?? jurisdictionTagForRow({
      jurisdictionCode: row.jurisdictionCode,
      jurisdictionName: row.jurisdictionName,
      level: row.level,
      state: row.state,
    })
    ?? jurisdictionTagForRow({
      jurisdictionCode: row.jurisdictionCode,
      jurisdictionName: row.county,
      level: "county",
      state: row.state,
    });
}

function metricCaveats(metrics: Record<string, unknown>) {
  return uniqueStrings(
    ["caveat", "note", "notes", "warning", "sourceNote", "reconciliationNote"]
      .flatMap((key) => {
        const value = metrics[key];
        if (Array.isArray(value)) return value.map(String);
        return typeof value === "string" ? [value] : [];
      }),
  );
}

function historyMath(input: {
  demVotes: number | null;
  otherVotes: number | null;
  repVotes: number | null;
  totalVotes: number | null;
}) {
  const demVotes = normalizeTotal(input.demVotes);
  const repVotes = normalizeTotal(input.repVotes);
  let otherVotes = normalizeTotal(input.otherVotes);
  let totalVotes = normalizeTotal(input.totalVotes);

  if (totalVotes === null && demVotes !== null && repVotes !== null && otherVotes !== null) {
    totalVotes = demVotes + repVotes + otherVotes;
  }
  if (otherVotes === null && totalVotes !== null && demVotes !== null && repVotes !== null) {
    otherVotes = Math.max(totalVotes - demVotes - repVotes, 0);
  }

  const available = demVotes !== null && repVotes !== null && totalVotes !== null;
  const leader = !available
    ? null
    : demVotes === repVotes
      ? "Tie" as const
      : demVotes > repVotes
        ? "Democratic" as const
        : "Republican" as const;
  const marginVotes = available ? Math.abs(demVotes - repVotes) : null;

  return {
    available,
    demSharePct: available ? roundedPct(demVotes!, totalVotes!) : null,
    demVotes,
    leader,
    marginPct: available && marginVotes !== null ? roundedPct(marginVotes, totalVotes!) : null,
    marginVotes,
    otherVotes,
    repSharePct: available ? roundedPct(repVotes!, totalVotes!) : null,
    repVotes,
    totalVotes,
  };
}

function unavailableHistory(year: CountyProfileYear, caveat: string): CountyElectionHistory {
  return {
    available: false,
    candidateLabels: candidateLabels[year],
    caveats: [caveat],
    confidence: classifyDataConfidence({ available: false, caveat }),
    demSharePct: null,
    demVotes: null,
    leader: null,
    marginPct: null,
    marginVotes: null,
    otherVotes: null,
    repSharePct: null,
    repVotes: null,
    source: null,
    sourceLevel: "county",
    totalVotes: null,
    year,
  };
}

function historyForYear(input: CountyProfileBuildInput, year: CountyProfileYear): CountyElectionHistory {
  const { county, sources } = input;
  if (year === 2024) {
    const row = input.currentResults.find((candidate) => tagForRow(candidate) === county.jurisdictionTag);
    if (!row) {
      return unavailableHistory(year, `No 2024 presidential result is joined to ${county.jurisdictionTag}.`);
    }

    const demVotes = normalizeTotal(row.votes.Harris ?? row.votes.Biden ?? row.votes.Clinton ?? row.votes.Obama);
    const repVotes = normalizeTotal(row.votes.Trump ?? row.votes.Romney ?? row.votes.McCain);
    const result = historyMath({ demVotes, otherVotes: row.votes.Other, repVotes, totalVotes: row.totalVotes });
    const source = sourceReference(row.sourceId, sources);
    const caveats = uniqueStrings([
      !result.available ? "The current result row does not expose both major-party vote buckets and a total." : "",
      source?.confidence,
    ]);
    const confidence = classifyDataConfidence({
      available: result.available,
      caveat: caveats[0],
      jurisdictionTag: county.jurisdictionTag,
      sourceConfidence: source?.confidence,
      sourceLevel: row.level,
      sourceStatus: source?.status,
    });

    return {
      ...result,
      candidateLabels: candidateLabels[year],
      caveats,
      confidence,
      source,
      sourceLevel: row.level,
      year,
    };
  }

  const row = input.historicalRows.find(
    (candidate) => candidate.electionYear === year && tagForRow({ ...candidate, level: candidate.sourceLevel }) === county.jurisdictionTag,
  );
  if (!row) {
    return unavailableHistory(year, `No ${year} presidential baseline is joined to ${county.jurisdictionTag}.`);
  }

  const result = historyMath(row);
  const metricsSourceUrl = typeof row.metrics.sourceUrl === "string"
    ? row.metrics.sourceUrl
    : typeof row.metrics.source_url === "string" ? row.metrics.source_url : "";
  const source = sourceReference(row.sourceDocumentId !== "database" ? row.sourceDocumentId : row.sourceId, sources, {
    sourceUrl: metricsSourceUrl,
  });
  const caveats = uniqueStrings([
    ...metricCaveats(row.metrics),
    !result.available ? "One or more required historical vote fields are missing." : "",
    source?.confidence,
  ]);
  const confidence = classifyDataConfidence({
    available: result.available,
    caveat: caveats[0],
    jurisdictionTag: county.jurisdictionTag,
    rowMethod: row.rowMethod,
    sourceConfidence: source?.confidence,
    sourceLevel: row.sourceLevel,
    sourceStatus: source?.status,
  });

  return {
    ...result,
    candidateLabels: candidateLabels[year],
    caveats,
    confidence,
    source,
    sourceLevel: row.sourceLevel,
    year,
  };
}

function buildTurnout(input: CountyProfileBuildInput): CountyTurnoutContext {
  const matching = input.turnoutRows.filter((row) => tagForRow(row) === input.county.jurisdictionTag);
  if (!matching.length) {
    const caveat = `No 2024 turnout row is joined to ${input.county.jurisdictionTag}.`;
    return {
      available: false,
      ballotsCast: null,
      confidence: classifyDataConfidence({ available: false, caveat }),
      denominatorNotes: [caveat],
      level: "unavailable",
      registeredVoters: null,
      rowCount: 0,
      source: null,
      turnoutPct: null,
      warningRequired: false,
      year: 2024,
    };
  }

  const countyLevel = matching.filter((row) => /^(county|county_equivalent|parish|borough|planning_region)$/i.test(row.level));
  const rows = countyLevel.length ? countyLevel : matching;
  const ballotsCast = rows.reduce((sum, row) => sum + row.ballotsCast, 0);
  const registeredValues = rows.map((row) => row.registeredVoters).filter((value): value is number => value !== null);
  const incompleteDenominator = registeredValues.length > 0 && registeredValues.length < rows.length;
  const registeredVoters = registeredValues.length === rows.length
    ? registeredValues.reduce((sum, value) => sum + value, 0)
    : null;
  const sourceWarningRequired = rows.some((row) => row.warningRequired);
  const warningRequired = sourceWarningRequired || incompleteDenominator;
  const denominatorNotes = uniqueStrings(rows.map((row) => row.denominatorNote));
  const source = sourceReference(rows[0]?.sourceId, input.sources);
  const caveat = incompleteDenominator
    ? "Some matched turnout rows lack a compatible registered-voter denominator, so no combined turnout rate is calculated."
    : sourceWarningRequired
      ? "The source marks this turnout denominator as warning-required; read the denominator note before comparing rates."
      : rows.length > 1
        ? `${rows.length} same-county turnout rows were aggregated for this profile.`
        : denominatorNotes[0];
  const confidence = classifyDataConfidence({
    available: true,
    caveat,
    jurisdictionTag: input.county.jurisdictionTag,
    rowMethod: rows.length > 1 ? "aggregated matched turnout rows" : "reported turnout row",
    sourceConfidence: warningRequired ? `partial ${source?.confidence ?? ""}` : source?.confidence,
    sourceLevel: rows.length > 1 ? "aggregated local rows" : rows[0].level,
    sourceStatus: source?.status,
  });

  return {
    available: true,
    ballotsCast,
    confidence,
    denominatorNotes,
    level: rows.length > 1 ? `aggregate of ${rows[0].level} rows` : rows[0].level,
    registeredVoters,
    rowCount: rows.length,
    source,
    turnoutPct: registeredVoters && registeredVoters > 0
      ? roundedPct(ballotsCast, registeredVoters)
      : rows.length === 1
        ? rows[0].turnoutPct
        : null,
    warningRequired,
    year: 2024,
  };
}

function buildVoteMethods(input: CountyProfileBuildInput): CountyVoteMethodContext[] {
  const matching = input.voteMethodRows
    .map((row) => ({ row, tag: tagForVoteMethod(row) }))
    .filter((entry): entry is { row: VoteMethodRowSummary; tag: string } =>
      entry.tag === input.county.jurisdictionTag,
    );
  const byMethod = new Map<string, VoteMethodRowSummary[]>();
  for (const { row } of matching) {
    byMethod.set(row.method, [...(byMethod.get(row.method) ?? []), row]);
  }

  return Array.from(byMethod.values())
    .map((rows) => {
      const first = rows[0];
      const reported = rows.filter((row) => row.voters !== null);
      const voters = reported.length
        ? reported.reduce((sum, row) => sum + (row.voters ?? 0), 0)
        : null;
      const denominatorRows = reported.filter((row) => row.totalVoters !== null);
      const totalVoters = denominatorRows.length === reported.length && denominatorRows.length
        ? denominatorRows.reduce((sum, row) => sum + (row.totalVoters ?? 0), 0)
        : null;
      const aggregated = rows.length > 1;
      const partial = reported.length !== rows.length;
      const available = voters !== null;
      const caveat = partial
        ? ["Only", reported.length, "of", rows.length, "tagged source rows report this vote method."].join(" ")
        : aggregated
          ? [rows.length, "tagged source rows were reproducibly summed to county context."].join(" ")
          : first.valueStatus && first.valueStatus !== "reported"
            ? first.valueStatus
            : null;
      const valueStatus = !available ? "unavailable" : partial ? "partial" : aggregated ? "derived" : first.valueStatus;
      const methodSharePct = voters !== null && totalVoters && totalVoters > 0
        ? roundedPct(voters, totalVoters)
        : rows.length === 1
          ? first.methodSharePct
          : null;
      const confidence = classifyDataConfidence({
        available,
        caveat,
        jurisdictionTag: input.county.jurisdictionTag,
        rowMethod: aggregated ? "aggregated tagged vote-method rows" : "reported vote-method row",
        sourceConfidence: valueStatus,
        sourceLevel: aggregated ? "county aggregate from local rows" : first.level,
        sourceStatus: first.sourceStatus,
      });

      return {
        ...first,
        confidence,
        county: input.county.displayName,
        id: [first.state, first.electionYear, input.county.fips, first.method].join("-"),
        jurisdictionCode: input.county.fips,
        jurisdictionName: input.county.displayName,
        jurisdictionTag: input.county.jurisdictionTag,
        level: aggregated ? "county_aggregate" : first.level,
        localUnit: aggregated ? [rows.length, "tagged source jurisdictions"].join(" ") : first.localUnit,
        methodSharePct,
        sourceField: uniqueStrings(rows.map((row) => row.sourceField)).join("; "),
        totalVoters,
        valueStatus,
        voters,
      };
    })
    .sort((left, right) => left.methodLabel.localeCompare(right.methodLabel));
}
function profileCaveats(county: CanonicalJurisdiction, history: CountyElectionHistory[]) {
  return uniqueStrings([
    county.caveat,
    county.level === "county_equivalent"
      ? "This Census county equivalent is presented under the same county:<GEOID> contract as counties."
      : "",
    county.state === "AK"
      ? "Alaska election reporting units do not have a reviewed crosswalk to the 30 current borough and census-area FIPS units, so no county-equivalent vote allocation is inferred."
      : "",
    county.state === "CT"
      ? "Connecticut uses current planning-region county-equivalent FIPS. Historical profile rows are reproducible aggregates of official town results to those regions."
      : "",
    county.state === "ME"
      ? "Maine State UOCAVA is an intentional non-geographic row and is not allocated to any county profile."
      : "",
    county.state === "RI"
      ? "Rhode Island Federal Precincts is an intentional non-geographic row and is not allocated to any county profile."
      : "",
    county.fips === "15005"
      ? "Kalawao County presidential rows use the official Hawaii precinct 13-09 assignment to county FIPS 15005. The Hawaii Office turnout table does not report a separate Kalawao denominator."
      : "",
    ...history.filter((row) => !row.available).flatMap((row) => row.caveats),
  ]);
}

export function buildCountyProfile(input: CountyProfileBuildInput): CountyProfile {
  const history = countyProfileYears.map((year) => historyForYear(input, year));
  const turnout = buildTurnout(input);
  const equipment = input.equipmentRows
    .filter((row) => tagForRow(row) === input.county.jurisdictionTag)
    .map((row) => ({
      ...row,
      confidence: classifyDataConfidence({
        available: true,
        caveat: row.uniformityNote,
        jurisdictionTag: input.county.jurisdictionTag,
        sourceConfidence: "contextual supplemental election-administration metadata",
        sourceLevel: row.sourceGranularity,
      }),
    }));
  const voteMethods = buildVoteMethods(input);
  const advisoryIndicators = input.indicators.filter((row) => tagForRow(row) === input.county.jurisdictionTag);
  const sourceRows = [
    ...history.map((row) => row.source),
    turnout.source,
    ...equipment.map((row) => sourceReference(row.sourceId, input.sources, {
      category: "Election equipment context",
      sourceUrl: row.sourceUrl,
      title: row.sourceId,
    })),
    ...voteMethods.map((row) => sourceReference(row.sourceId, input.sources, {
      category: "Vote-method context",
      sourceUrl: row.sourceUrl,
      status: row.sourceStatus,
      title: row.sourceId,
    })),
  ].filter((row): row is CountySourceReference => Boolean(row));
  const sources = Array.from(new Map(sourceRows.map((row) => [row.id, row])).values());

  const availableHistory = history.filter((row) => row.available);
  const historyConfidence = availableHistory.length === 0
    ? classifyDataConfidence({
        available: false,
        caveat: "No presidential year has a comparable canonical county row.",
      })
    : history.some((row) => !row.available)
      ? combineDataConfidence([
          ...availableHistory.map((row) => row.confidence),
          classifyDataConfidence({
            available: true,
            caveat: "At least one requested presidential year is unavailable.",
            sourceConfidence: "partial coverage",
          }),
        ])
      : combineDataConfidence(availableHistory.map((row) => row.confidence));
  return {
    aliases: uniqueStrings(input.county.aliases.filter((alias) => alias !== input.county.displayName)),
    advisoryIndicators,
    caveats: profileCaveats(input.county, history),
    confidence: historyConfidence,
    displayName: input.county.displayName,
    equipment,
    fips: input.county.fips,
    geographyLevel: input.county.level,
    geometrySource: input.county.source,
    history,
    jurisdictionTag: input.county.jurisdictionTag,
    sources,
    state: input.county.state,
    stateName: stateNameForCode(input.county.state),
    turnout,
    voteMethods,
  };
}

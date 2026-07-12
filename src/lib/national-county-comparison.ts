export const nationalComparisonYears = [2016, 2020, 2024] as const;

export type NationalComparisonYear = (typeof nationalComparisonYears)[number];
export type CountyWinner = "blue" | "red" | "tie" | "unavailable";
export type CountyFlipDirection = "red_to_blue" | "blue_to_red" | "no_flip";
export type CountyDataConfidence = "exact" | "derived" | "partial" | "proxy";

export type CanonicalCountyReference = {
  aliases: string[];
  caveat: string;
  displayName: string;
  fips: string;
  jurisdictionTag: string;
  state: string;
};

export type CountyTurnoutSnapshot = {
  ballotsCast: number;
  denominatorNote: string;
  registeredVoters: number | null;
  turnoutPct: number | null;
};

export type NationalCountyElectionSnapshot = {
  caveat: string | null;
  confidence: CountyDataConfidence;
  demCandidate: string;
  demMarginPct: number | null;
  demMarginVotes: number | null;
  demSharePct: number | null;
  demVotes: number | null;
  otherVotes: number | null;
  repCandidate: string;
  repSharePct: number | null;
  repVotes: number | null;
  sourceAuthority: string | null;
  sourceConfidence: string | null;
  sourceId: string;
  sourceUrl: string | null;
  totalVotes: number | null;
  turnout: CountyTurnoutSnapshot | null;
  winner: CountyWinner;
  year: NationalComparisonYear;
};

export type NationalCountyComparisonRow = {
  aliases: string[];
  caveat: string | null;
  confidence: CountyDataConfidence;
  county: string;
  direction: CountyFlipDirection;
  fips: string;
  from: NationalCountyElectionSnapshot;
  jurisdictionTag: string;
  marginSwingPct: number | null;
  state: string;
  to: NationalCountyElectionSnapshot;
  totalVoteChange: number | null;
  totalVoteChangePct: number | null;
  turnoutBallotsChange: number | null;
  turnoutBallotsChangePct: number | null;
};

export type NationalYearDatasetCoverage = {
  canonicalTaggedRows: number;
  comparableRows: number;
  duplicateTags: number;
  invalidCanonicalTags: number;
  nonGeographicRows: number;
  rawJurisdictions: number;
  unresolvedRows: number;
};

export type NationalYearDataset = {
  coverage: NationalYearDatasetCoverage;
  family: "historical" | "results";
  snapshots: NationalCountySnapshotRecord[];
  source: "database" | "seed_fallback";
  stateCoverage: Record<string, NationalYearDatasetCoverage>;
  year: NationalComparisonYear;
};

export type NationalCountySnapshotRecord = {
  fips: string;
  jurisdictionTag: string;
  snapshot: NationalCountyElectionSnapshot;
  state: string;
};

export type NationalComparisonSummary = {
  blueToRed: number;
  matchedCount: number;
  noFlip: number;
  redToBlue: number;
  selectedCount: number;
};

export type NationalComparisonCoverage = {
  canonicalRegistryRows: number;
  caveats: string[];
  from: NationalYearDatasetCoverage & {
    dataSource: NationalYearDataset["source"];
    unavailableRegistryRows: number;
    year: NationalComparisonYear;
  };
  matchedCanonicalRows: number;
  missingBothRows: number;
  missingFromRows: number;
  missingToRows: number;
  notComparableRows: number;
  scope: string;
  to: NationalYearDatasetCoverage & {
    dataSource: NationalYearDataset["source"];
    unavailableRegistryRows: number;
    year: NationalComparisonYear;
  };
};

export type NationalComparisonResult = {
  coverage: NationalComparisonCoverage;
  rows: NationalCountyComparisonRow[];
  summary: NationalComparisonSummary;
};

const candidateLabels: Record<NationalComparisonYear, { dem: string; rep: string }> = {
  2016: { dem: "Hillary Clinton", rep: "Donald Trump" },
  2020: { dem: "Joe Biden", rep: "Donald Trump" },
  2024: { dem: "Kamala Harris", rep: "Donald Trump" },
};

const confidenceRank: Record<CountyDataConfidence, number> = {
  exact: 0,
  derived: 1,
  partial: 2,
  proxy: 3,
};

function round(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function finiteOrNull(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : value;
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100) : null;
}

export function dataConfidenceForPath(input: {
  demVotes: number | null;
  otherVotes: number | null;
  repVotes: number | null;
  sourceLevel?: string | null;
  sourceParser?: string | null;
  sourceStatus?: string | null;
  totalVotes: number | null;
}): CountyDataConfidence {
  if (
    input.demVotes == null
    || input.repVotes == null
    || input.totalVotes == null
    || input.sourceStatus === "needs_data"
    || input.sourceStatus === "candidate"
  ) {
    return "partial";
  }
  if (
    input.demVotes < 0
    || input.repVotes < 0
    || (input.otherVotes ?? 0) < 0
    || input.totalVotes <= 0
    || input.totalVotes < input.demVotes + input.repVotes + (input.otherVotes ?? 0)
  ) {
    return "partial";
  }

  const path = `${input.sourceLevel ?? ""} ${input.sourceParser ?? ""}`.toLowerCase();
  if (/wikipedia|secondary|third[-_ ]?party|mit election|open ?elections/.test(path)) {
    return "proxy";
  }

  if (/aggregat|precinct|municipalit|town|district|locality|split/.test(path)) {
    return "derived";
  }

  return "exact";
}

export function makeNationalCountySnapshot(input: {
  caveat?: string | null;
  confidence: CountyDataConfidence;
  demVotes: number | null;
  otherVotes: number | null;
  repVotes: number | null;
  sourceAuthority?: string | null;
  sourceConfidence?: string | null;
  sourceId: string;
  sourceUrl?: string | null;
  totalVotes: number | null;
  turnout?: CountyTurnoutSnapshot | null;
  year: NationalComparisonYear;
}): NationalCountyElectionSnapshot {
  const demVotes = finiteOrNull(input.demVotes);
  const repVotes = finiteOrNull(input.repVotes);
  let otherVotes = finiteOrNull(input.otherVotes);
  let totalVotes = finiteOrNull(input.totalVotes);

  if (otherVotes == null && totalVotes != null && demVotes != null && repVotes != null) {
    otherVotes = Math.max(totalVotes - demVotes - repVotes, 0);
  }
  if (totalVotes == null && demVotes != null && repVotes != null && otherVotes != null) {
    totalVotes = demVotes + repVotes + otherVotes;
  }

  const hasMajorPartyVotes = demVotes != null && repVotes != null && totalVotes != null && totalVotes > 0;
  const winner: CountyWinner = !hasMajorPartyVotes
    ? "unavailable"
    : demVotes > repVotes
      ? "blue"
      : repVotes > demVotes
        ? "red"
        : "tie";
  const demMarginVotes = hasMajorPartyVotes ? demVotes - repVotes : null;
  const labels = candidateLabels[input.year];

  return {
    caveat: input.caveat?.trim() || null,
    confidence: input.confidence,
    demCandidate: labels.dem,
    demMarginPct: demMarginVotes != null && totalVotes != null ? percentage(demMarginVotes, totalVotes) : null,
    demMarginVotes,
    demSharePct: demVotes != null && totalVotes != null ? percentage(demVotes, totalVotes) : null,
    demVotes,
    otherVotes,
    repCandidate: labels.rep,
    repSharePct: repVotes != null && totalVotes != null ? percentage(repVotes, totalVotes) : null,
    repVotes,
    sourceAuthority: input.sourceAuthority?.trim() || null,
    sourceConfidence: input.sourceConfidence?.trim() || null,
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl?.trim() || null,
    totalVotes,
    turnout: input.turnout ?? null,
    winner,
    year: input.year,
  };
}

function combineConfidence(...values: CountyDataConfidence[]) {
  return values.reduce((worst, value) => (
    confidenceRank[value] > confidenceRank[worst] ? value : worst
  ), "exact" as CountyDataConfidence);
}

function combineCaveats(...values: Array<string | null | undefined>) {
  const unique = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
  return unique.length ? unique.join(" ") : null;
}

function flipDirection(from: CountyWinner, to: CountyWinner): CountyFlipDirection {
  if (from === "red" && to === "blue") {
    return "red_to_blue";
  }
  if (from === "blue" && to === "red") {
    return "blue_to_red";
  }
  return "no_flip";
}

function emptyCoverage(): NationalYearDatasetCoverage {
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

function addCoverage(
  left: NationalYearDatasetCoverage,
  right: NationalYearDatasetCoverage,
): NationalYearDatasetCoverage {
  return {
    canonicalTaggedRows: left.canonicalTaggedRows + right.canonicalTaggedRows,
    comparableRows: left.comparableRows + right.comparableRows,
    duplicateTags: left.duplicateTags + right.duplicateTags,
    invalidCanonicalTags: left.invalidCanonicalTags + right.invalidCanonicalTags,
    nonGeographicRows: left.nonGeographicRows + right.nonGeographicRows,
    rawJurisdictions: left.rawJurisdictions + right.rawJurisdictions,
    unresolvedRows: left.unresolvedRows + right.unresolvedRows,
  };
}

function coverageForScope(dataset: NationalYearDataset, state?: string) {
  if (!state) {
    return dataset.coverage;
  }
  return dataset.stateCoverage[state] ?? emptyCoverage();
}

function snapshotMap(dataset: NationalYearDataset, state?: string) {
  return new Map(
    dataset.snapshots
      .filter((row) => !state || row.state === state)
      .map((row) => [row.jurisdictionTag, row.snapshot]),
  );
}

function referenceMatchesQuery(reference: CanonicalCountyReference, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    reference.displayName,
    reference.fips,
    reference.jurisdictionTag,
    reference.state,
    ...reference.aliases,
  ].some((value) => value.toLowerCase().includes(normalized));
}

function missingTagCaveats(input: {
  fromMap: Map<string, NationalCountyElectionSnapshot>;
  references: CanonicalCountyReference[];
  state?: string;
  toMap: Map<string, NationalCountyElectionSnapshot>;
}) {
  const caveats: string[] = [];
  const scopeIncludes = (state: string) => !input.state || input.state === state;

  const lacksComparableSnapshot = (
    map: Map<string, NationalCountyElectionSnapshot>, tag: string,
  ) => !map.has(tag) || map.get(tag)?.winner === "unavailable";

  if (scopeIncludes("AK")) {
    const alaskaRows = input.references.filter((row) => row.state === "AK");
    const missingAlaska = alaskaRows.filter(
      (row) => lacksComparableSnapshot(input.fromMap, row.jurisdictionTag) || lacksComparableSnapshot(input.toMap, row.jurisdictionTag),
    ).length;
    if (missingAlaska > 0) {
      caveats.push(
        `Alaska has ${missingAlaska} county-equivalent FIPS rows without a matched county-grain comparison. Official election-district results are not allocated to boroughs or census areas.`,
      );
    }
  }

  if (scopeIncludes("HI")) {
    const kalawao = input.references.find((row) => row.jurisdictionTag === "county:15005");
    if (kalawao && (lacksComparableSnapshot(input.fromMap, kalawao.jurisdictionTag) || lacksComparableSnapshot(input.toMap, kalawao.jurisdictionTag))) {
      caveats.push("Kalawao County is not separately reported in the official Hawaii exports; no allocation is forced.");
    }
  }

  return caveats;
}

export function buildNationalCountyComparison(input: {
  direction?: CountyFlipDirection | "all";
  fips?: string;
  from: NationalYearDataset;
  query?: string;
  references: CanonicalCountyReference[];
  state?: string;
  to: NationalYearDataset;
}): NationalComparisonResult {
  const state = input.state?.toUpperCase();
  const scopedReferences = input.references.filter((row) => !state || row.state === state);
  const fromMap = snapshotMap(input.from, state);
  const toMap = snapshotMap(input.to, state);
  const allMatchedRows: NationalCountyComparisonRow[] = [];
  const notComparableRows = scopedReferences.filter((reference) => {
    const from = fromMap.get(reference.jurisdictionTag);
    const to = toMap.get(reference.jurisdictionTag);
    return Boolean(from && to && (from.winner === "unavailable" || to.winner === "unavailable"));
  }).length;

  for (const reference of scopedReferences) {
    if (input.fips && reference.fips !== input.fips) {
      continue;
    }
    if (input.query && !referenceMatchesQuery(reference, input.query)) {
      continue;
    }

    const from = fromMap.get(reference.jurisdictionTag);
    const to = toMap.get(reference.jurisdictionTag);
    if (!from || !to) {
      continue;
    }
    if (from.winner === "unavailable" || to.winner === "unavailable") {
      continue;
    }

    const totalVoteChange = from.totalVotes != null && to.totalVotes != null
      ? to.totalVotes - from.totalVotes
      : null;
    const turnoutBallotsChange = from.turnout && to.turnout
      ? to.turnout.ballotsCast - from.turnout.ballotsCast
      : null;
    const direction = flipDirection(from.winner, to.winner);

    allMatchedRows.push({
      aliases: reference.aliases,
      caveat: combineCaveats(reference.caveat, from.caveat, to.caveat),
      confidence: combineConfidence(from.confidence, to.confidence),
      county: reference.displayName,
      direction,
      fips: reference.fips,
      from,
      jurisdictionTag: reference.jurisdictionTag,
      marginSwingPct: from.demMarginPct != null && to.demMarginPct != null
        ? round(to.demMarginPct - from.demMarginPct)
        : null,
      state: reference.state,
      to,
      totalVoteChange,
      totalVoteChangePct: totalVoteChange != null && from.totalVotes != null
        ? percentage(totalVoteChange, from.totalVotes)
        : null,
      turnoutBallotsChange,
      turnoutBallotsChangePct: turnoutBallotsChange != null && from.turnout
        ? percentage(turnoutBallotsChange, from.turnout.ballotsCast)
        : null,
    });
  }

  allMatchedRows.sort((left, right) => (
    left.state.localeCompare(right.state)
    || left.county.localeCompare(right.county)
    || left.fips.localeCompare(right.fips)
  ));

  const summaryBase = allMatchedRows.reduce(
    (summary, row) => {
      if (row.direction === "red_to_blue") summary.redToBlue += 1;
      if (row.direction === "blue_to_red") summary.blueToRed += 1;
      if (row.direction === "no_flip") summary.noFlip += 1;
      return summary;
    },
    { blueToRed: 0, noFlip: 0, redToBlue: 0 },
  );
  const rows = input.direction && input.direction !== "all"
    ? allMatchedRows.filter((row) => row.direction === input.direction)
    : allMatchedRows;

  const fromScopeCoverage = coverageForScope(input.from, state);
  const toScopeCoverage = coverageForScope(input.to, state);
  const missingFromRows = scopedReferences.filter(
    (row) => !fromMap.has(row.jurisdictionTag) && toMap.has(row.jurisdictionTag),
  ).length;
  const missingToRows = scopedReferences.filter(
    (row) => fromMap.has(row.jurisdictionTag) && !toMap.has(row.jurisdictionTag),
  ).length;
  const missingBothRows = scopedReferences.filter(
    (row) => !fromMap.has(row.jurisdictionTag) && !toMap.has(row.jurisdictionTag),
  ).length;
  const matchedCanonicalRows = Math.max(scopedReferences.length - missingFromRows - missingToRows - missingBothRows - notComparableRows, 0);
  const caveats = missingTagCaveats({ fromMap, references: scopedReferences, state, toMap });
  if (input.from.source === "seed_fallback" || input.to.source === "seed_fallback") {
    caveats.unshift(
      "The database was unavailable or not configured, so this response uses the limited built-in seed fallback and is not a national comparison release.",
    );
  }
  if (fromScopeCoverage.nonGeographicRows || toScopeCoverage.nonGeographicRows) {
    caveats.push(
      "Non-geographic result rows, including Maine State UOCAVA and Rhode Island Federal Precincts where present, remain intentionally outside county FIPS comparisons.",
    );
  }
  if (fromScopeCoverage.unresolvedRows || toScopeCoverage.unresolvedRows) {
    caveats.push("Unresolved or ambiguous reporting units are excluded instead of being forced into county FIPS rows.");
  }

  return {
    coverage: {
      canonicalRegistryRows: scopedReferences.length,
      caveats,
      from: {
        ...fromScopeCoverage,
        dataSource: input.from.source,
        unavailableRegistryRows: Math.max(scopedReferences.length - fromScopeCoverage.comparableRows, 0),
        year: input.from.year,
      },
      matchedCanonicalRows,
      missingBothRows,
      missingFromRows,
      missingToRows,
      notComparableRows,
      scope: state ?? "US",
      to: {
        ...toScopeCoverage,
        dataSource: input.to.source,
        unavailableRegistryRows: Math.max(scopedReferences.length - toScopeCoverage.comparableRows, 0),
        year: input.to.year,
      },
    },
    rows,
    summary: {
      ...summaryBase,
      matchedCount: allMatchedRows.length,
      selectedCount: rows.length,
    },
  };
}

export function sumYearCoverage(values: NationalYearDatasetCoverage[]) {
  return values.reduce(addCoverage, emptyCoverage());
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function nationalCountyComparisonsToCsv(rows: NationalCountyComparisonRow[]) {
  const headers = [
    "state",
    "fips",
    "jurisdiction_tag",
    "county",
    "direction",
    "from_year",
    "from_dem_candidate",
    "from_dem_votes",
    "from_rep_candidate",
    "from_rep_votes",
    "from_other_votes",
    "from_total_votes",
    "from_dem_margin_votes",
    "from_dem_margin_pct",
    "to_year",
    "to_dem_candidate",
    "to_dem_votes",
    "to_rep_candidate",
    "to_rep_votes",
    "to_other_votes",
    "to_total_votes",
    "to_dem_margin_votes",
    "to_dem_margin_pct",
    "margin_swing_pct",
    "total_vote_change",
    "total_vote_change_pct",
    "turnout_ballots_change",
    "turnout_ballots_change_pct",
    "confidence",
    "caveat",
    "from_source_id",
    "from_source_url",
    "to_source_id",
    "to_source_url",
  ];
  const lines = rows.map((row) => [
    row.state,
    row.fips,
    row.jurisdictionTag,
    row.county,
    row.direction,
    row.from.year,
    row.from.demCandidate,
    row.from.demVotes,
    row.from.repCandidate,
    row.from.repVotes,
    row.from.otherVotes,
    row.from.totalVotes,
    row.from.demMarginVotes,
    row.from.demMarginPct,
    row.to.year,
    row.to.demCandidate,
    row.to.demVotes,
    row.to.repCandidate,
    row.to.repVotes,
    row.to.otherVotes,
    row.to.totalVotes,
    row.to.demMarginVotes,
    row.to.demMarginPct,
    row.marginSwingPct,
    row.totalVoteChange,
    row.totalVoteChangePct,
    row.turnoutBallotsChange,
    row.turnoutBallotsChangePct,
    row.confidence,
    row.caveat,
    row.from.sourceId,
    row.from.sourceUrl,
    row.to.sourceId,
    row.to.sourceUrl,
  ].map(csvCell).join(","));

  return [headers.join(","), ...lines].join("\r\n");
}

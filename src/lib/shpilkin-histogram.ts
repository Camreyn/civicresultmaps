import type { ReviewRowSummary, TurnoutRowSummary } from "./types";
import {
  resolvePercentageDomain,
  type PercentageScaleMode,
} from "./percentage-scale.ts";

export const shpilkinBucketWidths = [1, 2, 5, 10] as const;

export type ShpilkinBucketWidth = (typeof shpilkinBucketWidths)[number];
export type ShpilkinCandidate = "dem" | "rep";
export type ShpilkinXAxis = "candidate_share" | "turnout";
export type ShpilkinAccumulation = "votes" | "units";
export type ShpilkinScope = "state_county" | "state_local" | "county_local";
export type ShpilkinParticipationMode = "turnout" | "presidential_participation_proxy";

export type ShpilkinCountyOption = {
  name: string;
  tag: string;
};

export type ShpilkinHistogramObservation = {
  candidateVoteWeight: number | null;
  id: string;
  label: string;
  level: string;
  parentTag: string | null;
  participationMode: ShpilkinParticipationMode | null;
  sourceIds: string[];
  sourceRowIds: string[];
  unitKey: string | null;
  valuePct: number;
  voteWeight: number | null;
  warningRequired: boolean;
};

export type ShpilkinHistogramBucket = {
  high: number;
  label: string;
  low: number;
  observationIds: string[];
  unitCount: number;
  value: number;
  voteCount: number;
};

export type ShpilkinHistogramResult = {
  buckets: ShpilkinHistogramBucket[];
  candidateLabel: string;
  denominatorNotes: string[];
  domainMax: number;
  domainMin: number;
  drawableObservationCount: number;
  inputObservationCount: number;
  levels: string[];
  maxBucketValue: number;
  observations: ShpilkinHistogramObservation[];
  omittedObservationCount: number;
  overflowObservationCount: number;
  participationMode: ShpilkinParticipationMode | null;
  proxyObservationCount: number;
  sourceCount: number;
  totalValue: number;
  untaggedSourceRowCount: number;
  warningObservationCount: number;
};

type ObservationBuildResult = {
  candidateLabel: string;
  denominatorNotes: string[];
  inputObservationCount: number;
  observations: ShpilkinHistogramObservation[];
  omittedObservationCount: number;
  participationMode: ShpilkinParticipationMode | null;
  proxyObservationCount: number;
  untaggedSourceRowCount: number;
};

type PresidentialParticipationProxy = {
  denominator: number | null;
  note: string;
  numerator: number | null;
  sourceId: string;
  valuePct: number | null;
};

const countyTagPattern = /^county:\d{5}$/u;

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegativeNumber(value: number | null | undefined) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function positiveNumber(value: number | null | undefined) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function unknownFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function presidentialParticipationProxy(row: ReviewRowSummary): PresidentialParticipationProxy | null {
  const raw = row.metrics?.presidentialParticipationProxy;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = raw as Record<string, unknown>;
  const numeratorValue = unknownFiniteNumber(values.numerator);
  const denominatorValue = unknownFiniteNumber(values.denominator);
  const numerator = numeratorValue !== null && numeratorValue >= 0 ? numeratorValue : null;
  const denominator = denominatorValue !== null && denominatorValue > 0 ? denominatorValue : null;
  const sourceId = typeof values.sourceId === "string" ? values.sourceId.trim() : "";
  if (!sourceId) return null;
  return {
    denominator,
    note: typeof values.note === "string" && values.note.trim()
      ? values.note.trim()
      : "Presidential contest votes divided by a registered-voter snapshot; this is not election-level turnout.",
    numerator,
    sourceId,
    valuePct: numerator !== null && denominator !== null ? (numerator / denominator) * 100 : null,
  };
}

function isCountyLevel(level: string) {
  return level.trim().toLowerCase() === "county";
}

function isLocalLevel(level: string) {
  const normalized = level.trim().toLowerCase();
  return normalized !== "state" && normalized !== "county";
}

function canonicalCountyTag(value: string | null | undefined) {
  return value && countyTagPattern.test(value) ? value : null;
}

function candidateVoteValue(row: ReviewRowSummary, candidate: ShpilkinCandidate) {
  return nonnegativeNumber(candidate === "dem" ? row.demVotes : row.repVotes);
}

function candidateStoredShare(row: ReviewRowSummary, candidate: ShpilkinCandidate) {
  return nonnegativeNumber(candidate === "dem" ? row.demShare : row.repShare);
}

function candidateShare(row: ReviewRowSummary, candidate: ShpilkinCandidate) {
  const votes = candidateVoteValue(row, candidate);
  const totalVotes = positiveNumber(row.totalVotes);
  return votes !== null && totalVotes !== null
    ? (votes / totalVotes) * 100
    : candidateStoredShare(row, candidate);
}

function candidateName(row: ReviewRowSummary, candidate: ShpilkinCandidate) {
  return candidate === "dem" ? row.demCandidate : row.repCandidate;
}

function mostFrequentCandidateName(rows: ReviewRowSummary[], candidate: ShpilkinCandidate) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = candidateName(row, candidate)?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const fallback = candidate === "dem" ? "Democratic candidate" : "Republican candidate";
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
    ?? fallback;
}

function turnoutShare(row: TurnoutRowSummary) {
  const stored = nonnegativeNumber(row.turnoutPct);
  if (stored !== null) return stored;
  const ballots = nonnegativeNumber(row.ballotsCast);
  const registered = positiveNumber(row.registeredVoters);
  return ballots !== null && registered !== null ? (ballots / registered) * 100 : null;
}

function turnoutCountyName(row: TurnoutRowSummary) {
  return row.jurisdictionName.split(/\s+\/\s+/u)[0]?.trim() || row.jurisdictionName;
}

function distinct(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function rowsForScope<Row extends { jurisdictionTag?: string | null; level: string }>(
  rows: Row[],
  scope: ShpilkinScope,
  countyTag: string | null,
) {
  if (scope === "state_county") return rows;
  const localRows = rows.filter((row) => isLocalLevel(row.level));
  return scope === "county_local"
    ? localRows.filter((row) => canonicalCountyTag(row.jurisdictionTag) === countyTag)
    : localRows;
}

function groupByCounty<Row extends { jurisdictionTag?: string | null }>(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const tag = canonicalCountyTag(row.jurisdictionTag);
    if (!tag) continue;
    groups.set(tag, [...(groups.get(tag) ?? []), row]);
  }
  return groups;
}

function preferredCountyRows<Row extends { level: string }>(rows: Row[]) {
  const directCountyRows = rows.filter((row) => isCountyLevel(row.level));
  return directCountyRows.length ? directCountyRows : rows.filter((row) => isLocalLevel(row.level));
}

function buildCandidateObservations(input: {
  candidate: ShpilkinCandidate;
  countyTag: string | null;
  reviewRows: ReviewRowSummary[];
  scope: ShpilkinScope;
}): ObservationBuildResult {
  const selectedRows = rowsForScope(input.reviewRows, input.scope, input.countyTag);
  const candidateLabel = mostFrequentCandidateName(selectedRows, input.candidate);

  if (input.scope !== "state_county") {
    const observations = selectedRows.flatMap((row) => {
      const valuePct = candidateShare(row, input.candidate);
      if (valuePct === null) return [];
      return [{
        candidateVoteWeight: candidateVoteValue(row, input.candidate),
        id: `review:${row.id}`,
        label: row.localUnit || row.jurisdictionName,
        level: row.level,
        parentTag: canonicalCountyTag(row.jurisdictionTag),
        participationMode: null,
        sourceIds: [row.sourceId],
        sourceRowIds: [row.id],
        unitKey: row.reportingUnitId ? `reporting-unit:${row.reportingUnitId}` : null,
        valuePct,
        voteWeight: positiveNumber(row.totalVotes),
        warningRequired: false,
      } satisfies ShpilkinHistogramObservation];
    });
    return {
      candidateLabel,
      denominatorNotes: [],
      inputObservationCount: selectedRows.length,
      observations,
      omittedObservationCount: selectedRows.length - observations.length,
      participationMode: null,
      proxyObservationCount: 0,
      untaggedSourceRowCount: input.scope === "state_local"
        ? selectedRows.filter((row) => !canonicalCountyTag(row.jurisdictionTag)).length
        : 0,
    };
  }

  const countyGroups = groupByCounty(selectedRows);
  const observations: ShpilkinHistogramObservation[] = [];
  let omittedObservationCount = 0;

  for (const [tag, groupedRows] of countyGroups) {
    const rows = preferredCountyRows(groupedRows);
    const completeVoteRows = rows.filter(
      (row) => candidateVoteValue(row, input.candidate) !== null && positiveNumber(row.totalVotes) !== null,
    );
    let valuePct: number | null = null;
    let voteWeight: number | null = null;
    let candidateVoteWeight: number | null = null;

    if (completeVoteRows.length === rows.length && rows.length > 0) {
      const candidateVotes = rows.reduce((sum, row) => sum + (candidateVoteValue(row, input.candidate) ?? 0), 0);
      voteWeight = rows.reduce((sum, row) => sum + (positiveNumber(row.totalVotes) ?? 0), 0);
      candidateVoteWeight = candidateVotes;
      valuePct = voteWeight > 0 ? (candidateVotes / voteWeight) * 100 : null;
    } else if (rows.length === 1) {
      valuePct = candidateShare(rows[0], input.candidate);
      voteWeight = positiveNumber(rows[0].totalVotes);
      candidateVoteWeight = candidateVoteValue(rows[0], input.candidate);
    }

    if (valuePct === null) {
      omittedObservationCount += 1;
      continue;
    }

    observations.push({
      candidateVoteWeight,
      id: `review-county:${tag}`,
      label: rows[0]?.jurisdictionName ?? tag,
      level: "county",
      parentTag: tag,
      participationMode: null,
      sourceIds: distinct(rows.map((row) => row.sourceId)),
      sourceRowIds: rows.map((row) => row.id),
      unitKey: tag,
      valuePct,
      voteWeight,
      warningRequired: false,
    });
  }

  return {
    candidateLabel,
    denominatorNotes: [],
    inputObservationCount: countyGroups.size,
    observations,
    omittedObservationCount,
    participationMode: null,
    proxyObservationCount: 0,
    untaggedSourceRowCount: selectedRows.filter((row) => !canonicalCountyTag(row.jurisdictionTag)).length,
  };
}

function buildTurnoutObservations(input: {
  countyTag: string | null;
  reviewRows: ReviewRowSummary[];
  scope: ShpilkinScope;
  turnoutRows: TurnoutRowSummary[];
}): ObservationBuildResult {
  const selectedRows = rowsForScope(input.turnoutRows, input.scope, input.countyTag);

  if (input.scope !== "state_county") {
    const observations = selectedRows.flatMap((row) => {
      const valuePct = turnoutShare(row);
      if (valuePct === null) return [];
      return [{
        candidateVoteWeight: null,
        id: `turnout:${row.id}`,
        label: row.jurisdictionName,
        level: row.level,
        parentTag: canonicalCountyTag(row.jurisdictionTag),
        participationMode: "turnout",
        sourceIds: [row.sourceId],
        sourceRowIds: [row.id],
        unitKey: row.reportingUnitId ? `reporting-unit:${row.reportingUnitId}` : null,
        valuePct,
        voteWeight: nonnegativeNumber(row.ballotsCast),
        warningRequired: row.warningRequired,
      } satisfies ShpilkinHistogramObservation];
    });
    if (selectedRows.length > 0) {
      return {
        candidateLabel: "",
        denominatorNotes: distinct(selectedRows.map((row) => row.denominatorNote)),
        inputObservationCount: selectedRows.length,
        observations,
        omittedObservationCount: selectedRows.length - observations.length,
        participationMode: "turnout",
        proxyObservationCount: 0,
        untaggedSourceRowCount: input.scope === "state_local"
          ? selectedRows.filter((row) => !canonicalCountyTag(row.jurisdictionTag)).length
          : 0,
      };
    }

    const proxyInputs = rowsForScope(input.reviewRows, input.scope, input.countyTag).flatMap((row) => {
      const proxy = presidentialParticipationProxy(row);
      return proxy ? [{ proxy, row }] : [];
    });
    const proxyObservations = proxyInputs.flatMap(({ proxy, row }) => {
      if (proxy.valuePct === null || proxy.numerator === null) return [];
      return [{
        candidateVoteWeight: null,
        id: `participation-proxy:${row.id}`,
        label: row.localUnit || row.jurisdictionName,
        level: row.level,
        parentTag: canonicalCountyTag(row.jurisdictionTag),
        participationMode: "presidential_participation_proxy" as const,
        sourceIds: distinct([row.sourceId, proxy.sourceId]),
        sourceRowIds: [row.id],
        unitKey: row.reportingUnitId ? `reporting-unit:${row.reportingUnitId}` : null,
        valuePct: proxy.valuePct,
        voteWeight: proxy.numerator,
        warningRequired: true,
      } satisfies ShpilkinHistogramObservation];
    });
    return {
      candidateLabel: "",
      denominatorNotes: distinct(proxyInputs.map(({ proxy }) => proxy.note)),
      inputObservationCount: proxyInputs.length,
      observations: proxyObservations,
      omittedObservationCount: proxyInputs.length - proxyObservations.length,
      participationMode: proxyInputs.length > 0 ? "presidential_participation_proxy" : null,
      proxyObservationCount: proxyObservations.length,
      untaggedSourceRowCount: input.scope === "state_local"
        ? proxyInputs.filter(({ row }) => !canonicalCountyTag(row.jurisdictionTag)).length
        : 0,
    };
  }

  const countyGroups = groupByCounty(selectedRows);
  const observations: ShpilkinHistogramObservation[] = [];
  let omittedObservationCount = 0;

  for (const [tag, groupedRows] of countyGroups) {
    const rows = preferredCountyRows(groupedRows);
    const ballots = rows.map((row) => nonnegativeNumber(row.ballotsCast));
    const registered = rows.map((row) => positiveNumber(row.registeredVoters));
    const ballotsComplete = ballots.every((value) => value !== null);
    const registrationComplete = registered.every((value) => value !== null);
    const totalBallots = ballotsComplete ? ballots.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    const totalRegistered = registrationComplete
      ? registered.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
    const valuePct = totalBallots !== null && totalRegistered !== null && totalRegistered > 0
      ? (totalBallots / totalRegistered) * 100
      : rows.length === 1 ? turnoutShare(rows[0]) : null;

    if (valuePct === null) {
      omittedObservationCount += 1;
      continue;
    }

    observations.push({
      candidateVoteWeight: null,
      id: `turnout-county:${tag}`,
      label: turnoutCountyName(rows[0]),
      level: "county",
      parentTag: tag,
      participationMode: "turnout",
      sourceIds: distinct(rows.map((row) => row.sourceId)),
      sourceRowIds: rows.map((row) => row.id),
      unitKey: tag,
      valuePct,
      voteWeight: totalBallots,
      warningRequired: rows.some((row) => row.warningRequired),
    });
  }

  return {
    candidateLabel: "",
    denominatorNotes: distinct(selectedRows.map((row) => row.denominatorNote)),
    inputObservationCount: countyGroups.size,
    observations,
    omittedObservationCount,
    participationMode: "turnout",
    proxyObservationCount: 0,
    untaggedSourceRowCount: selectedRows.filter((row) => !canonicalCountyTag(row.jurisdictionTag)).length,
  };
}

export function listShpilkinCountyOptions(
  reviewRows: ReviewRowSummary[],
  turnoutRows: TurnoutRowSummary[],
): ShpilkinCountyOption[] {
  const names = new Map<string, { name: string; priority: number }>();
  for (const row of turnoutRows) {
    if (!isLocalLevel(row.level)) continue;
    const tag = canonicalCountyTag(row.jurisdictionTag);
    if (tag) names.set(tag, { name: turnoutCountyName(row), priority: 1 });
  }
  for (const row of reviewRows) {
    if (!isLocalLevel(row.level)) continue;
    const tag = canonicalCountyTag(row.jurisdictionTag);
    if (!tag) continue;
    const existing = names.get(tag);
    if (!existing || existing.priority < 2) names.set(tag, { name: row.jurisdictionName, priority: 2 });
  }
  return [...names.entries()]
    .map(([tag, value]) => ({ name: value.name, tag }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.tag.localeCompare(right.tag));
}

export function buildShpilkinHistogram(input: {
  accumulation: ShpilkinAccumulation;
  bucketWidth: ShpilkinBucketWidth;
  candidate: ShpilkinCandidate;
  countyTag?: string | null;
  reviewRows: ReviewRowSummary[];
  scaleMode?: PercentageScaleMode;
  scope: ShpilkinScope;
  turnoutRows: TurnoutRowSummary[];
  xAxis: ShpilkinXAxis;
}): ShpilkinHistogramResult {
  const built = input.xAxis === "candidate_share"
    ? buildCandidateObservations({
      candidate: input.candidate,
      countyTag: input.countyTag ?? null,
      reviewRows: input.reviewRows,
      scope: input.scope,
    })
    : buildTurnoutObservations({
      countyTag: input.countyTag ?? null,
      reviewRows: input.reviewRows,
      scope: input.scope,
      turnoutRows: input.turnoutRows,
    });
  const observations = built.observations.filter((observation) =>
    input.accumulation === "units" || observation.voteWeight !== null,
  );
  const weightOmissions = built.observations.length - observations.length;
  const domain = resolvePercentageDomain(
    observations.map((observation) => observation.valuePct),
    input.bucketWidth,
    input.scaleMode ?? "comparison",
  );
  const bucketCount = Math.max(1, Math.ceil((domain.max - domain.min) / input.bucketWidth));
  const hasOverflow = observations.some((observation) => observation.valuePct > domain.max);
  const buckets: ShpilkinHistogramBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const low = domain.min + index * input.bucketWidth;
    const high = Math.min(domain.max, low + input.bucketWidth);
    return {
      high,
      label: hasOverflow && index === bucketCount - 1 ? `≥${low}%` : `${low}-${high}%`,
      low,
      observationIds: [],
      unitCount: 0,
      value: 0,
      voteCount: 0,
    };
  });

  for (const observation of observations) {
    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((observation.valuePct - domain.min) / input.bucketWidth)),
    );
    const bucket = buckets[bucketIndex];
    const voteCount = observation.voteWeight ?? 0;
    bucket.observationIds.push(...observation.sourceRowIds);
    bucket.unitCount += 1;
    bucket.voteCount += voteCount;
    bucket.value += input.accumulation === "votes" ? voteCount : 1;
  }

  const sourceCount = new Set(observations.flatMap((observation) => observation.sourceIds)).size;
  return {
    buckets,
    candidateLabel: built.candidateLabel,
    denominatorNotes: built.denominatorNotes,
    domainMax: domain.max,
    domainMin: domain.min,
    drawableObservationCount: observations.length,
    inputObservationCount: built.inputObservationCount,
    levels: distinct(observations.map((observation) => observation.level)).sort(),
    maxBucketValue: buckets.reduce((maximum, bucket) => Math.max(maximum, bucket.value), 0),
    observations,
    omittedObservationCount: built.omittedObservationCount + weightOmissions,
    overflowObservationCount: observations.filter((observation) => observation.valuePct > domain.max).length,
    participationMode: built.participationMode,
    proxyObservationCount: built.proxyObservationCount,
    sourceCount,
    totalValue: buckets.reduce((sum, bucket) => sum + bucket.value, 0),
    untaggedSourceRowCount: built.untaggedSourceRowCount,
    warningObservationCount: observations.filter((observation) => observation.warningRequired).length,
  };
}

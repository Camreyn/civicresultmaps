import {
  buildShpilkinHistogram,
  type ShpilkinAccumulation,
  type ShpilkinCandidate,
  type ShpilkinHistogramObservation,
  type ShpilkinScope,
} from "./shpilkin-histogram.ts";
import type { ReviewRowSummary, TurnoutRowSummary } from "./types";

export const klimekBucketWidths = [1, 2, 5] as const;

export type KlimekBucketWidth = (typeof klimekBucketWidths)[number];
export type KlimekPointSize = "total_votes" | "winner_votes";

export type KlimekMarginalBucket = {
  high: number;
  label: string;
  low: number;
  pointIds: string[];
  sourceRowIds: string[];
  unitCount: number;
  value: number;
};

export type KlimekFingerprintPoint = {
  ballotsCast: number | null;
  densityScore: number;
  id: string;
  label: string;
  level: string;
  parentTag: string | null;
  sizeValue: number;
  sourceIds: string[];
  sourceRowIds: string[];
  totalVotes: number | null;
  turnoutPct: number;
  warningRequired: boolean;
  winnerSharePct: number;
  winnerVotes: number | null;
  xBucketLow: number;
  yBucketLow: number;
};

export type KlimekFingerprintResult = {
  ambiguousUnitCount: number;
  bottomBuckets: KlimekMarginalBucket[];
  candidateIdentityMissingCount: number;
  candidateInputObservationCount: number;
  candidateOmittedObservationCount: number;
  candidateUnmatchedObservationCount: number;
  denominatorNotes: string[];
  levels: string[];
  loadedCandidateVotes: Record<ShpilkinCandidate, number | null>;
  maxBottomBucketValue: number;
  maxPointSizeValue: number;
  maxSideBucketValue: number;
  pairedObservationCount: number;
  pointWeightOmissionCount: number;
  points: KlimekFingerprintPoint[];
  referenceCandidate: ShpilkinCandidate | null;
  referenceCandidateLabel: string;
  sideBuckets: KlimekMarginalBucket[];
  sourceCount: number;
  totalBottomValue: number;
  totalSideValue: number;
  turnoutIdentityMissingCount: number;
  turnoutInputObservationCount: number;
  turnoutOmittedObservationCount: number;
  turnoutUnmatchedObservationCount: number;
  untaggedSourceRowCount: number;
  warningPointCount: number;
  xDomainMax: number;
  xOverflowPointCount: number;
  yDomainMax: number;
  yOverflowPointCount: number;
};

type ObservationIndex = {
  ambiguousKeys: Set<string>;
  missingIdentityCount: number;
  unique: Map<string, ShpilkinHistogramObservation>;
};

type PointBeforeDensity = Omit<KlimekFingerprintPoint, "densityScore" | "xBucketLow" | "yBucketLow">;

const maximumFingerprintDomain = 200;

function distinct(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function indexObservations(observations: ShpilkinHistogramObservation[]): ObservationIndex {
  const grouped = new Map<string, ShpilkinHistogramObservation[]>();
  let missingIdentityCount = 0;

  for (const observation of observations) {
    if (!observation.unitKey) {
      missingIdentityCount += 1;
      continue;
    }
    const rows = grouped.get(observation.unitKey);
    if (rows) {
      rows.push(observation);
    } else {
      grouped.set(observation.unitKey, [observation]);
    }
  }

  const ambiguousKeys = new Set<string>();
  const unique = new Map<string, ShpilkinHistogramObservation>();
  for (const [key, rows] of grouped) {
    if (rows.length === 1) {
      unique.set(key, rows[0]);
    } else {
      ambiguousKeys.add(key);
    }
  }

  return { ambiguousKeys, missingIdentityCount, unique };
}

function domainMaximum(values: number[], bucketWidth: KlimekBucketWidth) {
  const largest = values.reduce((maximum, value) => Math.max(maximum, value), 0);
  return Math.min(
    maximumFingerprintDomain,
    Math.max(100, Math.ceil(largest / bucketWidth) * bucketWidth),
  );
}

function bucketIndex(value: number, domainMax: number, bucketWidth: KlimekBucketWidth) {
  const bucketCount = Math.max(1, Math.ceil(domainMax / bucketWidth));
  return Math.min(bucketCount - 1, Math.max(0, Math.floor(value / bucketWidth)));
}

function buildMarginalBuckets(input: {
  accumulation: ShpilkinAccumulation;
  axis: "turnout" | "winner_share";
  bucketWidth: KlimekBucketWidth;
  domainMax: number;
  points: PointBeforeDensity[];
}) {
  const bucketCount = Math.max(1, Math.ceil(input.domainMax / input.bucketWidth));
  const hasOverflow = input.points.some((point) => (
    input.axis === "turnout" ? point.turnoutPct : point.winnerSharePct
  ) > input.domainMax);
  const buckets: KlimekMarginalBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const low = index * input.bucketWidth;
    const high = Math.min(input.domainMax, low + input.bucketWidth);
    return {
      high,
      label: hasOverflow && index === bucketCount - 1 ? `≥${low}%` : `${low}-${high}%`,
      low,
      pointIds: [],
      sourceRowIds: [],
      unitCount: 0,
      value: 0,
    };
  });

  for (const point of input.points) {
    const percentage = input.axis === "turnout" ? point.turnoutPct : point.winnerSharePct;
    const index = bucketIndex(percentage, input.domainMax, input.bucketWidth);
    const bucket = buckets[index];
    const voteWeight = input.axis === "turnout" ? point.ballotsCast : point.totalVotes;
    bucket.pointIds.push(point.id);
    bucket.sourceRowIds.push(...point.sourceRowIds);
    bucket.unitCount += 1;
    bucket.value += input.accumulation === "units" ? 1 : voteWeight ?? 0;
  }

  for (const bucket of buckets) {
    bucket.sourceRowIds = distinct(bucket.sourceRowIds);
  }
  return buckets;
}

function candidateVoteTotal(observations: ShpilkinHistogramObservation[]) {
  if (
    observations.length === 0
    || observations.some((observation) => observation.candidateVoteWeight === null)
  ) {
    return null;
  }
  return observations.reduce((sum, observation) => sum + (observation.candidateVoteWeight ?? 0), 0);
}

export function buildKlimekFingerprint(input: {
  accumulation: ShpilkinAccumulation;
  bucketWidth: KlimekBucketWidth;
  countyTag?: string | null;
  pointSize: KlimekPointSize;
  reviewRows: ReviewRowSummary[];
  scope: ShpilkinScope;
  turnoutRows: TurnoutRowSummary[];
}): KlimekFingerprintResult {
  const histogramInput = {
    accumulation: "units" as const,
    bucketWidth: input.bucketWidth,
    countyTag: input.countyTag ?? null,
    reviewRows: input.reviewRows,
    scope: input.scope,
    turnoutRows: input.turnoutRows,
  };
  const dem = buildShpilkinHistogram({ ...histogramInput, candidate: "dem", xAxis: "candidate_share" });
  const rep = buildShpilkinHistogram({ ...histogramInput, candidate: "rep", xAxis: "candidate_share" });
  const turnout = buildShpilkinHistogram({ ...histogramInput, candidate: "dem", xAxis: "turnout" });
  const loadedCandidateVotes = {
    dem: candidateVoteTotal(dem.observations),
    rep: candidateVoteTotal(rep.observations),
  };
  const referenceCandidate = loadedCandidateVotes.dem === null || loadedCandidateVotes.rep === null
    ? null
    : loadedCandidateVotes.dem === loadedCandidateVotes.rep
    ? null
    : loadedCandidateVotes.dem > loadedCandidateVotes.rep ? "dem" : "rep";
  const candidate = referenceCandidate === "rep" ? rep : dem;
  const candidateIndex = indexObservations(candidate.observations);
  const turnoutIndex = indexObservations(turnout.observations);
  const ambiguousKeys = new Set([...candidateIndex.ambiguousKeys, ...turnoutIndex.ambiguousKeys]);
  const pairs: Array<[ShpilkinHistogramObservation, ShpilkinHistogramObservation]> = [];

  if (referenceCandidate) {
    for (const [unitKey, candidateObservation] of candidateIndex.unique) {
      const turnoutObservation = turnoutIndex.unique.get(unitKey);
      if (turnoutObservation && !ambiguousKeys.has(unitKey)) {
        pairs.push([candidateObservation, turnoutObservation]);
      }
    }
  }

  const pointsBeforeDensity: PointBeforeDensity[] = [];
  let pointWeightOmissionCount = 0;
  for (const [candidateObservation, turnoutObservation] of pairs) {
    const totalVotes = candidateObservation.voteWeight;
    const winnerVotes = candidateObservation.candidateVoteWeight;
    const ballotsCast = turnoutObservation.voteWeight;
    const sizeValue = input.pointSize === "winner_votes" ? winnerVotes : totalVotes;
    const marginalWeightsAvailable = input.accumulation === "units"
      || (totalVotes !== null && ballotsCast !== null);
    if (sizeValue === null || !marginalWeightsAvailable) {
      pointWeightOmissionCount += 1;
      continue;
    }
    pointsBeforeDensity.push({
      ballotsCast,
      id: candidateObservation.unitKey ?? candidateObservation.id,
      label: candidateObservation.label,
      level: candidateObservation.level,
      parentTag: candidateObservation.parentTag ?? turnoutObservation.parentTag,
      sizeValue,
      sourceIds: distinct([...candidateObservation.sourceIds, ...turnoutObservation.sourceIds]),
      sourceRowIds: distinct([...candidateObservation.sourceRowIds, ...turnoutObservation.sourceRowIds]),
      totalVotes,
      turnoutPct: turnoutObservation.valuePct,
      warningRequired: turnoutObservation.warningRequired,
      winnerSharePct: candidateObservation.valuePct,
      winnerVotes,
    });
  }

  const xDomainMax = domainMaximum(pointsBeforeDensity.map((point) => point.turnoutPct), input.bucketWidth);
  const yDomainMax = domainMaximum(pointsBeforeDensity.map((point) => point.winnerSharePct), input.bucketWidth);
  const bottomBuckets = buildMarginalBuckets({
    accumulation: input.accumulation,
    axis: "turnout",
    bucketWidth: input.bucketWidth,
    domainMax: xDomainMax,
    points: pointsBeforeDensity,
  });
  const sideBuckets = buildMarginalBuckets({
    accumulation: input.accumulation,
    axis: "winner_share",
    bucketWidth: input.bucketWidth,
    domainMax: yDomainMax,
    points: pointsBeforeDensity,
  });
  const maxXUnits = Math.max(1, ...bottomBuckets.map((bucket) => bucket.unitCount));
  const maxYUnits = Math.max(1, ...sideBuckets.map((bucket) => bucket.unitCount));
  const points = pointsBeforeDensity
    .map((point) => {
      const xIndex = bucketIndex(point.turnoutPct, xDomainMax, input.bucketWidth);
      const yIndex = bucketIndex(point.winnerSharePct, yDomainMax, input.bucketWidth);
      const xDensity = bottomBuckets[xIndex].unitCount / maxXUnits;
      const yDensity = sideBuckets[yIndex].unitCount / maxYUnits;
      return {
        ...point,
        densityScore: Math.sqrt(xDensity * yDensity),
        xBucketLow: bottomBuckets[xIndex].low,
        yBucketLow: sideBuckets[yIndex].low,
      };
    })
    .sort((left, right) => right.sizeValue - left.sizeValue || left.label.localeCompare(right.label));
  const matchedUnitKeys = new Set(pairs.map(([observation]) => observation.unitKey).filter(Boolean));

  return {
    ambiguousUnitCount: ambiguousKeys.size,
    bottomBuckets,
    candidateIdentityMissingCount: candidateIndex.missingIdentityCount,
    candidateInputObservationCount: candidate.inputObservationCount,
    candidateOmittedObservationCount: candidate.omittedObservationCount,
    candidateUnmatchedObservationCount: candidate.observations.length - matchedUnitKeys.size,
    denominatorNotes: turnout.denominatorNotes,
    levels: distinct(points.map((point) => point.level)).sort(),
    loadedCandidateVotes,
    maxBottomBucketValue: Math.max(0, ...bottomBuckets.map((bucket) => bucket.value)),
    maxPointSizeValue: Math.max(0, ...points.map((point) => point.sizeValue)),
    maxSideBucketValue: Math.max(0, ...sideBuckets.map((bucket) => bucket.value)),
    pairedObservationCount: pairs.length,
    pointWeightOmissionCount,
    points,
    referenceCandidate,
    referenceCandidateLabel: referenceCandidate === "rep" ? rep.candidateLabel : dem.candidateLabel,
    sideBuckets,
    sourceCount: new Set(points.flatMap((point) => point.sourceIds)).size,
    totalBottomValue: bottomBuckets.reduce((sum, bucket) => sum + bucket.value, 0),
    totalSideValue: sideBuckets.reduce((sum, bucket) => sum + bucket.value, 0),
    turnoutIdentityMissingCount: turnoutIndex.missingIdentityCount,
    turnoutInputObservationCount: turnout.inputObservationCount,
    turnoutOmittedObservationCount: turnout.omittedObservationCount,
    turnoutUnmatchedObservationCount: turnout.observations.length - matchedUnitKeys.size,
    untaggedSourceRowCount: candidate.untaggedSourceRowCount + turnout.untaggedSourceRowCount,
    warningPointCount: points.filter((point) => point.warningRequired).length,
    xDomainMax,
    xOverflowPointCount: points.filter((point) => point.turnoutPct > xDomainMax).length,
    yDomainMax,
    yOverflowPointCount: points.filter((point) => point.winnerSharePct > yDomainMax).length,
  };
}

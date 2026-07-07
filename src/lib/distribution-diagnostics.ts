export type DistributionSeverity = "neutral" | "healthy" | "watch" | "elevated" | "severe";

export type VoteShareDistributionBucketInput = {
  high: number;
  label: string;
  low: number;
  rowCount: number;
  value: number;
};

export type VoteShareDistributionBucketDiagnostic = VoteShareDistributionBucketInput & {
  deviationRatio: number;
  expectedValue: number;
  index: number;
  isGlobalPeak: boolean;
  isLocalMaximum: boolean;
  isLocalMinimum: boolean;
  reason: string;
  severity: DistributionSeverity;
};

export function voteShareBucketIndex(share: number, bucketCount = 10) {
  if (!Number.isFinite(share)) {
    return 0;
  }

  return clamp(Math.floor((clamp(share, 0, 100) / 100) * bucketCount), 0, bucketCount - 1);
}

export function buildVoteShareDistributionDiagnostics(
  bucketInputs: VoteShareDistributionBucketInput[],
): VoteShareDistributionBucketDiagnostic[] {
  const values = bucketInputs.map((bucket) => Math.max(0, bucket.value));
  const maxValue = Math.max(0, ...values);
  const populatedBuckets = bucketInputs.filter((bucket) => bucket.value > 0).length;
  const populatedRows = bucketInputs.reduce((sum, bucket) => sum + (bucket.value > 0 ? bucket.rowCount : 0), 0);
  const globalPeakIndex = values.reduce((bestIndex, value, index) => (value > values[bestIndex] ? index : bestIndex), 0);
  const expectedValues = buildUnimodalExpectedValues(values, globalPeakIndex);

  return bucketInputs.map((bucket, index) => {
    const value = values[index] ?? 0;
    const previous = values[index - 1] ?? 0;
    const next = values[index + 1] ?? 0;
    const expectedValue = expectedValues[index] ?? 0;
    const deviationRatio = expectedValue > 0 ? Math.abs(value - expectedValue) / expectedValue : 0;
    const isLocalMaximum = value > 0 && value > previous && value > next;
    const isLocalMinimum = index > 0 && index < values.length - 1 && value < previous && value < next;
    const isInteriorZeroValley = isLocalMinimum && value === 0 && previous > 0 && next > 0;
    const isGlobalPeak = index === globalPeakIndex && value === maxValue && maxValue > 0;
    let severity: DistributionSeverity = "healthy";
    let reason = "Bucket follows the expected single-rise, single-fall distribution shape.";

    if (maxValue === 0 || populatedBuckets < 3 || populatedRows < 6) {
      severity = "neutral";
      reason = "Not enough populated buckets are available to score the distribution shape.";
    } else if (isInteriorZeroValley) {
      severity = "severe";
      reason = "Zero-count valley appears between populated neighboring buckets.";
    } else if (isLocalMaximum && !isGlobalPeak && value >= maxValue * 0.8) {
      severity = "severe";
      reason = "Secondary local maximum is close to the main peak.";
    } else if (isLocalMinimum && value <= Math.min(previous, next) * 0.35) {
      severity = "severe";
      reason = "Local minimum is much lower than both neighboring buckets.";
    } else if (isLocalMaximum && !isGlobalPeak && value >= maxValue * 0.55) {
      severity = "elevated";
      reason = "Secondary local maximum is materially high relative to the main peak.";
    } else if (deviationRatio >= 0.6 && expectedValue >= maxValue * 0.2) {
      severity = "elevated";
      reason = "Bucket differs materially from the expected unimodal curve.";
    } else if (isLocalMaximum && !isGlobalPeak) {
      severity = "watch";
      reason = "Small secondary local maximum interrupts the expected rise-and-fall shape.";
    } else if (isLocalMinimum) {
      severity = "watch";
      reason = "Local minimum interrupts the expected rise-and-fall shape.";
    } else if (deviationRatio >= 0.35 && expectedValue >= maxValue * 0.2) {
      severity = "watch";
      reason = "Bucket differs moderately from the expected unimodal curve.";
    }

    return {
      ...bucket,
      deviationRatio,
      expectedValue,
      index,
      isGlobalPeak,
      isLocalMaximum,
      isLocalMinimum,
      reason,
      severity,
    };
  });
}

function buildUnimodalExpectedValues(values: number[], peakIndex: number) {
  if (values.length === 0) {
    return [];
  }

  const smoothed = values.map((value, index) => {
    const previous = values[index - 1] ?? value;
    const next = values[index + 1] ?? value;
    return (previous + value * 2 + next) / 4;
  });
  const expected = [...smoothed];

  for (let index = peakIndex - 1; index >= 0; index -= 1) {
    expected[index] = Math.min(expected[index] ?? 0, expected[index + 1] ?? 0);
  }

  for (let index = peakIndex + 1; index < expected.length; index += 1) {
    expected[index] = Math.min(expected[index] ?? 0, expected[index - 1] ?? 0);
  }

  return expected.map((value) => Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

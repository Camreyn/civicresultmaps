import type { KlimekFingerprintResult, KlimekMarginalBucket } from "./klimek-fingerprint.ts";

export type KlimekPointAppearance = "winner_density" | "histogram_context";
export type HistogramBinRelation = "peak" | "valley" | "similar" | "unavailable";

export type HistogramBinContext = {
  observed: number;
  reference: number | null;
  relation: HistogramBinRelation;
};

export const histogramContextColors = {
  peak: "#f4a340",
  valley: "#42ba83",
  similar: "#ffffff",
  unavailable: "#9ca3af",
} as const;

/** A descriptive bar-height comparison, not a normality test or a unit assessment. */
export function compareHistogramBin(observed: number, reference: number | null): HistogramBinContext {
  if (!Number.isFinite(observed) || observed < 0 || reference === null || !Number.isFinite(reference) || reference < 0) {
    return { observed, reference: null, relation: "unavailable" };
  }
  // This 10% visual tolerance is not a statistical significance threshold.
  const tolerance = 0.1 * Math.max(observed, reference);
  const relation = Math.abs(observed - reference) <= tolerance
    ? "similar"
    : observed > reference ? "peak" : "valley";
  return { observed, reference, relation };
}

function marginalContext(buckets: KlimekMarginalBucket[]) {
  return buckets.map((bucket, index) => {
    const before = buckets[index - 1];
    const after = buckets[index + 1];
    // Keep endpoints/overflow neutral: they do not have two comparable neighbors.
    const reference = before && after && ![before, bucket, after].some((row) => row.label.startsWith("≥"))
      ? (before.value + after.value) / 2
      : null;
    return compareHistogramBin(bucket.value, reference);
  });
}

export function buildKlimekHistogramContext(fingerprint: KlimekFingerprintResult) {
  const bottom = marginalContext(fingerprint.bottomBuckets);
  const side = marginalContext(fingerprint.sideBuckets);
  const turnoutByPoint = new Map<string, HistogramBinContext>();
  const shareByPoint = new Map<string, HistogramBinContext>();
  fingerprint.bottomBuckets.forEach((bucket, index) => {
    bucket.pointIds.forEach((id) => turnoutByPoint.set(id, bottom[index]));
  });
  fingerprint.sideBuckets.forEach((bucket, index) => {
    bucket.pointIds.forEach((id) => shareByPoint.set(id, side[index]));
  });
  const byPoint = new Map(fingerprint.points.map((point) => {
    const turnout = turnoutByPoint.get(point.id) ?? compareHistogramBin(0, null);
    const share = shareByPoint.get(point.id) ?? compareHistogramBin(0, null);
    return [point.id, {
      share,
      turnout,
      fill: histogramContextColors[share.relation],
      fillOpacity: turnout.relation === "similar" ? 0.18 : turnout.relation === "unavailable" ? 0.55 : 0.95,
    }] as const;
  }));
  return { bottom, byPoint, side };
}

export function describeHistogramBin(context: HistogramBinContext | undefined) {
  if (!context || context.reference === null) return "neighbor comparison unavailable (endpoint or overflow)";
  const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const relation = context.relation === "similar" ? "similar to neighbors (within 10%)" : `${context.relation} relative to neighbors`;
  return `${relation}; observed ${number(context.observed)}, adjacent-bin mean ${number(context.reference)}`;
}

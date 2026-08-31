export const percentageScaleModes = ["comparison", "fit"] as const;

export type PercentageScaleMode = (typeof percentageScaleModes)[number];

export type PercentageDomain = {
  max: number;
  min: number;
};

export const comparisonPercentageDomain: PercentageDomain = { max: 100, min: 0 };
export const maximumPercentageDomain = 200;

function alignDown(value: number, interval: number) {
  return Math.floor(value / interval) * interval;
}

function alignUp(value: number, interval: number) {
  return Math.ceil(value / interval) * interval;
}

export function resolvePercentageDomain(
  values: number[],
  bucketWidth: number,
  scaleMode: PercentageScaleMode,
): PercentageDomain {
  if (scaleMode === "comparison") return comparisonPercentageDomain;

  const finiteValues = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (finiteValues.length === 0) return comparisonPercentageDomain;

  const interval = Math.max(1, bucketWidth);
  const boundedValues = finiteValues.map((value) => Math.min(value, maximumPercentageDomain));
  const smallest = Math.min(...boundedValues);
  const largest = Math.max(...boundedValues);
  let min = Math.max(0, alignDown(smallest - interval, interval));
  let max = Math.min(maximumPercentageDomain, alignUp(largest + interval, interval));

  if (max - min < 10) {
    if (min === 0) {
      max = Math.min(maximumPercentageDomain, Math.max(max, 10));
    } else if (max === maximumPercentageDomain) {
      min = Math.max(0, maximumPercentageDomain - 10);
    } else {
      const midpoint = (min + max) / 2;
      min = Math.max(0, alignDown(midpoint - 5, interval));
      max = Math.min(maximumPercentageDomain, alignUp(midpoint + 5, interval));
    }
  }

  if (max <= min) {
    return comparisonPercentageDomain;
  }

  return { max, min };
}

export function percentageTicks(domain: PercentageDomain) {
  if (domain.min === 0 && domain.max === 100) return [0, 25, 50, 75, 100];

  const span = domain.max - domain.min;
  const targetInterval = span / 5;
  const intervals = [1, 2, 5, 10, 20, 25, 50, 100];
  const interval = intervals.find((candidate) => candidate >= targetInterval) ?? 100;
  const edgeBuffer = span * 0.06;
  const ticks = [domain.min];

  for (
    let value = alignUp(domain.min, interval);
    value < domain.max;
    value += interval
  ) {
    if (value - domain.min >= edgeBuffer && domain.max - value >= edgeBuffer) {
      ticks.push(value);
    }
  }

  ticks.push(domain.max);
  return [...new Set(ticks)].sort((left, right) => left - right);
}

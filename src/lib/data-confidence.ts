export type DataConfidenceLevel =
  | "exact"
  | "derived"
  | "partial"
  | "proxy"
  | "non_geographic"
  | "unavailable";

export type DataConfidence = {
  level: DataConfidenceLevel;
  label: string;
  shortLabel: string;
  description: string;
  caveat: string | null;
};

export const dataConfidenceDefinitions: Record<DataConfidenceLevel, Omit<DataConfidence, "level" | "caveat">> = {
  exact: {
    label: "Exact reported geography",
    shortLabel: "Exact",
    description: "The published row maps directly to the canonical county or county-equivalent geography.",
  },
  derived: {
    label: "Derived from official rows",
    shortLabel: "Derived",
    description: "The value is reproducibly aggregated, normalized, or calculated from official published rows.",
  },
  partial: {
    label: "Partial coverage",
    shortLabel: "Partial",
    description: "An official row is available, but a field, jurisdiction, candidate total, or reconciliation item remains incomplete.",
  },
  proxy: {
    label: "Contextual proxy",
    shortLabel: "Proxy",
    description: "The value is contextual or supplemental and should not be treated as a silent replacement for an official certified total.",
  },
  non_geographic: {
    label: "Non-geographic row",
    shortLabel: "Non-geographic",
    description: "The reporting unit is statewide, UOCAVA, federal-only, or otherwise not a canonical county geography.",
  },
  unavailable: {
    label: "Unavailable",
    shortLabel: "Unavailable",
    description: "No comparable canonical county row is available for this data point.",
  },
};

function withDefinition(level: DataConfidenceLevel, caveat?: string | null): DataConfidence {
  return {
    level,
    ...dataConfidenceDefinitions[level],
    caveat: caveat?.trim() || null,
  };
}

export function classifyDataConfidence(input: {
  available?: boolean;
  caveat?: string | null;
  jurisdictionTag?: string | null;
  rowMethod?: string | null;
  sourceConfidence?: string | null;
  sourceLevel?: string | null;
  sourceStatus?: string | null;
}): DataConfidence {
  const caveat = input.caveat?.trim() || null;
  if (input.available === false) {
    return withDefinition("unavailable", caveat);
  }

  const sourceLevel = String(input.sourceLevel || "").toLowerCase();
  if (
    sourceLevel.includes("non_geographic")
    || sourceLevel.includes("statewide")
    || sourceLevel.includes("uocava")
    || (!input.jurisdictionTag && /federal[_\s-]?precinct/.test(sourceLevel))
  ) {
    return withDefinition("non_geographic", caveat);
  }

  const evidence = [
    input.rowMethod,
    input.sourceConfidence,
    input.sourceStatus,
    caveat,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/secondary|contextual|proxy|fallback|legacy|supplemental|estimated|lead only/.test(evidence)) {
    return withDefinition("proxy", caveat);
  }

  if (/partial|missing|unallocated|incomplete|not reconciled|coverage gap|write-in gap/.test(evidence)) {
    return withDefinition("partial", caveat);
  }

  if (/aggregate|aggregated|derived|normalized|calculated|crosswalk|rollup|summed/.test(evidence)) {
    return withDefinition("derived", caveat);
  }

  if (input.jurisdictionTag?.startsWith("county:")) {
    return withDefinition("exact", caveat);
  }

  return withDefinition(input.available === true ? "derived" : "unavailable", caveat);
}

export function combineDataConfidence(values: Array<DataConfidence | null | undefined>): DataConfidence {
  const available = values.filter((value): value is DataConfidence => Boolean(value));
  if (!available.length) {
    return withDefinition("unavailable");
  }

  const rank: Record<DataConfidenceLevel, number> = {
    exact: 0,
    derived: 1,
    partial: 2,
    proxy: 3,
    non_geographic: 4,
    unavailable: 5,
  };
  const lowest = [...available].sort((left, right) => rank[right.level] - rank[left.level])[0];
  const caveats = Array.from(new Set(available.map((value) => value.caveat).filter(Boolean)));
  return withDefinition(lowest.level, caveats.join(" "));
}

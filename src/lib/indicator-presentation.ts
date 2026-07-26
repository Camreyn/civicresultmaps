import type { AnalysisIndicator } from "./types";

const scopeKindByLevel: Record<AnalysisIndicator["level"], string> = {
  city: "City",
  city_town: "City / town",
  county: "Countywide",
  district: "District",
  precinct: "Precinct",
  rest_of_county: "Rest of county",
  state: "Statewide",
  town: "Town",
};

export type IndicatorScopePresentation = {
  key: string;
  kind: string;
  label: string;
  name: string;
};

export type IndicatorScopeSummary = {
  indicatorCount: number;
  scopeCount: number;
};

function humanizeLevel(level: string) {
  return level
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function presentIndicatorScope(indicator: AnalysisIndicator): IndicatorScopePresentation {
  const kind = scopeKindByLevel[indicator.level] ?? humanizeLevel(indicator.level);
  const name = indicator.jurisdictionName.trim() || "Unspecified jurisdiction";

  return {
    key: `${indicator.level}:${indicator.jurisdictionCode || name}`,
    kind,
    label: `${kind} \u00b7 ${name}`,
    name,
  };
}

export function summarizeIndicatorScopes(
  indicators: readonly AnalysisIndicator[],
): IndicatorScopeSummary {
  return {
    indicatorCount: indicators.length,
    scopeCount: new Set(indicators.map((indicator) => presentIndicatorScope(indicator).key)).size,
  };
}

export function formatIndicatorScopeSummary(summary: IndicatorScopeSummary) {
  const indicatorNoun = summary.indicatorCount === 1 ? "advisory indicator" : "advisory indicators";
  const scopeNoun = summary.scopeCount === 1 ? "scope" : "scopes";
  return `${summary.indicatorCount} ${indicatorNoun} across ${summary.scopeCount} ${scopeNoun}`;
}

import historicalAliasCatalog from "../../data/county-historical-aliases.json" with { type: "json" };
import {
  getCanonicalJurisdictionRegistry,
  normalizeJurisdictionAlias,
  type CanonicalJurisdiction,
} from "./jurisdiction-tags.ts";

import { stateNameForCode } from "./us-states.ts";
export { usStateOptions } from "./us-states.ts";

export type CountySearchMatch = CanonicalJurisdiction & {
  historicalContext?: CountyHistoricalContext;
  matchedOn: "alias" | "fips" | "historical_fips" | "historical_name" | "name" | "state";
  matchedValue: string;
  score: number;
  stateName: string;
};

export type CountyHistoricalContext = {
  caveat: string;
  effectiveDate: string;
  formerFips: string;
  formerName: string;
  relationship: string;
  sourceUrl: string;
  successorFips: string[];
};

type CountySearchScore = Pick<CountySearchMatch, "matchedOn" | "matchedValue" | "score"> & {
  historicalContext?: CountyHistoricalContext;
};

const historicalAliasesBySuccessor = new Map<string, CountyHistoricalContext[]>();
for (const record of historicalAliasCatalog.records) {
  for (const successorFips of record.successorFips) {
    const contexts = historicalAliasesBySuccessor.get(successorFips) ?? [];
    contexts.push({ ...record, successorFips: [...record.successorFips] });
    historicalAliasesBySuccessor.set(successorFips, contexts);
  }
}

function countyRows() {
  return getCanonicalJurisdictionRegistry().jurisdictions.filter((row) =>
    row.jurisdictionTag.startsWith("county:"),
  );
}


export function findCanonicalCountyByFips(fips: string) {
  if (!/^\d{5}$/.test(fips)) {
    return null;
  }

  return countyRows().find((row) => row.fips === fips) ?? null;
}

function scoreHistoricalCounty(row: CanonicalJurisdiction, query: string): CountySearchScore | null {
  const contexts = historicalAliasesBySuccessor.get(row.fips) ?? [];
  const candidates: CountySearchScore[] = [];
  for (const historicalContext of contexts) {
    const normalizedName = normalizeJurisdictionAlias(historicalContext.formerName);
    if (historicalContext.formerFips === query || `county:${historicalContext.formerFips}` === query) {
      candidates.push({
        historicalContext,
        matchedOn: "historical_fips",
        matchedValue: historicalContext.formerFips,
        score: 1,
      });
    } else if (normalizedName === query) {
      candidates.push({
        historicalContext,
        matchedOn: "historical_name",
        matchedValue: historicalContext.formerName,
        score: 2,
      });
    } else if (query.length >= 2 && historicalContext.formerFips.startsWith(query)) {
      candidates.push({
        historicalContext,
        matchedOn: "historical_fips",
        matchedValue: historicalContext.formerFips,
        score: 6,
      });
    } else if (normalizedName.startsWith(query)) {
      candidates.push({
        historicalContext,
        matchedOn: "historical_name",
        matchedValue: historicalContext.formerName,
        score: 7,
      });
    } else {
      const tokens = query.split(/\s+/).filter(Boolean);
      if (tokens.length && tokens.every((token) => normalizedName.includes(token))) {
        candidates.push({
          historicalContext,
          matchedOn: "historical_name",
          matchedValue: historicalContext.formerName,
          score: 9,
        });
      }
    }
  }
  return candidates.sort(
    (left, right) =>
      left.score - right.score
      || left.matchedValue.localeCompare(right.matchedValue),
  )[0] ?? null;
}

function scoreCounty(row: CanonicalJurisdiction, query: string): CountySearchScore | null {
  if (!query) {
    return { matchedOn: "state", matchedValue: stateNameForCode(row.state), score: 100 };
  }

  const normalizedName = normalizeJurisdictionAlias(row.displayName);
  const normalizedAliases = row.aliases
    .map((alias) => ({ alias, normalized: normalizeJurisdictionAlias(alias) }))
    .filter(({ normalized }) => normalized && normalized !== normalizedName);

  const historicalMatch = scoreHistoricalCounty(row, query);
  if (row.fips === query || row.jurisdictionTag === `county:${query}`) {
    return { matchedOn: "fips", matchedValue: row.fips, score: 0 };
  }
  if (historicalMatch?.score === 1) {
    return historicalMatch;
  }
  if (normalizedName === query) {
    return { matchedOn: "name", matchedValue: row.displayName, score: 1 };
  }

  const exactAlias = normalizedAliases.find(({ normalized }) => normalized === query);
  if (exactAlias) {
    return { matchedOn: "alias", matchedValue: exactAlias.alias, score: 2 };
  }
  if (historicalMatch?.score === 2) {
    return historicalMatch;
  }
  if (row.fips.startsWith(query)) {
    return { matchedOn: "fips", matchedValue: row.fips, score: 3 };
  }
  if (normalizedName.startsWith(query)) {
    return { matchedOn: "name", matchedValue: row.displayName, score: 4 };
  }

  const prefixAlias = normalizedAliases.find(({ normalized }) => normalized.startsWith(query));
  if (prefixAlias) {
    return { matchedOn: "alias", matchedValue: prefixAlias.alias, score: 5 };
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length && queryTokens.every((token) => normalizedName.includes(token))) {
    return { matchedOn: "name", matchedValue: row.displayName, score: 6 };
  }

  const tokenAlias = normalizedAliases.find(({ normalized }) =>
    queryTokens.length && queryTokens.every((token) => normalized.includes(token)),
  );
  if (tokenAlias) {
    return { matchedOn: "alias", matchedValue: tokenAlias.alias, score: 7 };
  }

  return historicalMatch;
}

export type CountySearchInput = {
  limit?: number;
  offset?: number;
  query?: string;
  state?: string;
};

function matchingCounties(input: CountySearchInput) {
  const query = normalizeJurisdictionAlias(input.query ?? "");
  const state = input.state?.trim().toUpperCase() || "";

  if (!query && !state) {
    return [];
  }

  return countyRows()
    .filter((row) => !state || row.state === state)
    .map((row) => {
      const match = scoreCounty(row, query);
      return match
        ? {
            ...row,
            ...match,
            stateName: stateNameForCode(row.state),
          }
        : null;
    })
    .filter((row): row is CountySearchMatch => Boolean(row))
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.state.localeCompare(right.state) ||
        left.displayName.localeCompare(right.displayName) ||
        left.fips.localeCompare(right.fips),
    );
}

export function searchCanonicalCountyPage(input: CountySearchInput) {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const matches = matchingCounties(input);
  return {
    limit,
    offset,
    results: matches.slice(offset, offset + limit),
    total: matches.length,
  };
}

export function searchCanonicalCounties(input: CountySearchInput): CountySearchMatch[] {
  return searchCanonicalCountyPage(input).results;
}

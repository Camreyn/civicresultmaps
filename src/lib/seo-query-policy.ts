import { countyByTag, countyElectionPath, stateByCode, stateElectionPath } from "./seo-geography.ts";

export type SeoSearchParams = Record<string, string | string[] | undefined>;

export function appQueryPath(params: SeoSearchParams) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (!entries.length) return "/";
  const query = new URLSearchParams();
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    for (const item of Array.isArray(value) ? value : [value!]) query.append(key, item);
  }
  return `/?${query}`;
}

export function appSeoPolicy(params: SeoSearchParams) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (!entries.length) return { path: "/", index: true, semantic: false };
  const fallback = { path: appQueryPath(params), index: false, semantic: false };
  if (entries.some(([, value]) => Array.isArray(value))) return fallback;
  const { state, year, tab, mode, fips } = params as Record<string, string | undefined>;
  const geography = state ? stateByCode(state) : undefined;
  if (!geography || (year !== undefined && year !== "2024")) return fallback;
  if (entries.some(([key]) => !["state", "year", "tab", "mode", "fips"].includes(key))) return fallback;
  // Exports, equipment, review and historical views are NOT equivalent to presidential results.
  if ((tab !== undefined && tab !== "map") || (mode !== undefined && !["winner", "margin", "volume"].includes(mode))) return fallback;
  if (fips !== undefined) {
    const county = countyByTag(`county:${fips}`);
    return county?.state === geography.code
      ? { path: countyElectionPath(county), index: true, semantic: true }
      : fallback;
  }
  return { path: stateElectionPath(geography), index: true, semantic: true };
}

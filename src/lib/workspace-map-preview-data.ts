import { cache } from "react";
import { listHistoricalResultRows, listResults, listReviewRows } from "./api";
import type { SupportedPresidentialYear } from "./api-version";
import { buildCountyVoteRaces } from "./county-vote-races";
import { buildWorkspaceMapPreview } from "./workspace-map-preview";
import type { SeoSearchParams } from "./seo-query-policy";

export const loadPreviewRaces = cache(async (state: string, year: SupportedPresidentialYear, comparisons = true) => {
  const [results, history, reviews] = await Promise.all([
    listResults({ state, year, level: "county" }),
    year === 2024 ? [] : listHistoricalResultRows({ state, year, limit: 5000 }),
    comparisons ? listReviewRows({ state, year, includeMetrics: true, limit: 5000 }) : [],
  ]);
  return buildCountyVoteRaces(state, year, results, history, reviews);
});

export function workspaceMapPreview(params: SeoSearchParams, strictMode = false) {
  return buildWorkspaceMapPreview(params, loadPreviewRaces, strictMode);
}

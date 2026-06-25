import { z } from "zod";
import { unstable_cache } from "next/cache";
import {
  currentDataSource,
  getCoverageSummary as uncachedGetCoverageSummary,
  listCompletenessReport as uncachedListCompletenessReport,
  listEquipmentRows as uncachedListEquipmentRows,
  listElections as uncachedListElections,
  listHistoricalResultRows as uncachedListHistoricalResultRows,
  listImportRuns as uncachedListImportRuns,
  listIndicators as uncachedListIndicators,
  listResults as uncachedListResults,
  listReviewRows as uncachedListReviewRows,
  listSources as uncachedListSources,
  listStates as uncachedListStates,
  listTurnoutRows as uncachedListTurnoutRows,
} from "./data-access";
import { listVoteMethodRows as uncachedListVoteMethodRows } from "./vote-methods";

export const publicDataRevalidateSeconds = 15 * 60;
export const publicDataStaleSeconds = 24 * 60 * 60;

export const publicDataCacheHeaders = {
  "Cache-Control": `public, max-age=0, s-maxage=${publicDataRevalidateSeconds}, stale-while-revalidate=${publicDataStaleSeconds}`,
  "CDN-Cache-Control": `public, s-maxage=${publicDataRevalidateSeconds}, stale-while-revalidate=${publicDataStaleSeconds}`,
  "Vercel-CDN-Cache-Control": `public, s-maxage=${publicDataRevalidateSeconds}, stale-while-revalidate=${publicDataStaleSeconds}`,
};

export const stateQuery = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase());

export const yearQuery = z.coerce.number().int().min(1788).max(2100);

export const officeQuery = z
  .string()
  .trim()
  .toLowerCase()
  .default("president");

export const levelQuery = z
  .enum(["county", "state", "district", "precinct"])
  .default("county");

export function apiEnvelope<T>(data: T, meta: Record<string, unknown> = {}) {
  return {
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source: currentDataSource(),
      ...meta,
    },
  };
}

export const getCoverageSummary = unstable_cache(
  uncachedGetCoverageSummary,
  ["public-data", "coverage-summary"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listCompletenessReport = uncachedListCompletenessReport;

export const listEquipmentRows = unstable_cache(
  uncachedListEquipmentRows,
  ["public-data", "equipment-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listHistoricalResultRows = unstable_cache(
  uncachedListHistoricalResultRows,
  ["public-data", "historical-result-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listIndicators = uncachedListIndicators;

export const listElections = unstable_cache(
  uncachedListElections,
  ["public-data", "elections"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listImportRuns = unstable_cache(
  uncachedListImportRuns,
  ["public-data", "import-runs"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listReviewRows = uncachedListReviewRows;

export const listResults = unstable_cache(
  uncachedListResults,
  ["public-data", "results"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listSources = unstable_cache(
  uncachedListSources,
  ["public-data", "sources"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listStates = uncachedListStates;

export const listTurnoutRows = unstable_cache(
  uncachedListTurnoutRows,
  ["public-data", "turnout-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listVoteMethodRows = unstable_cache(
  uncachedListVoteMethodRows,
  ["public-data", "vote-method-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export { listNativeSourcePackages } from "./native-source-packages";
export { listAdminSourceStatuses } from "./admin-source-packages";
export { listSourceAcquisitionTiers } from "./source-acquisition-tiers";
export { listTurnoutSourceStatuses } from "./turnout-source-packages";

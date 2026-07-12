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
import { publicApiSchemaVersion } from "./api-version";

export const publicDataRevalidateSeconds = 15 * 60;
export const publicDataStaleSeconds = 24 * 60 * 60;
const publicDataCacheNamespace = "public-data-historical-advisory-2026-07-12";

export const publicDataCacheHeaders = {
  "Cache-Control": `public, max-age=0, s-maxage=${publicDataRevalidateSeconds}, stale-while-revalidate=${publicDataStaleSeconds}`,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Disposition, X-Data-Sha256, X-Pagination-Limit, X-Pagination-Offset, X-Release-Id, X-Total-Count",
  "CDN-Cache-Control": `public, s-maxage=${publicDataRevalidateSeconds}, stale-while-revalidate=${publicDataStaleSeconds}`,
  "Vercel-CDN-Cache-Control": `public, s-maxage=${publicDataRevalidateSeconds}, stale-while-revalidate=${publicDataStaleSeconds}`,
};

export const publicApiErrorHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
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
  .enum(["county", "state", "district", "precinct", "city", "city_town", "town", "federal_precincts", "non_geographic"])
  .default("county");

export function apiEnvelope<T>(data: T, meta: Record<string, unknown> = {}) {
  return {
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      source: currentDataSource(),
      releaseId: null,
      schemaVersion: publicApiSchemaVersion,
      ...meta,
    },
  };
}

export type PublicApiError = string | {
  code: string;
  issues?: Array<{ field: string; message: string }>;
  message: string;
};

export function apiErrorEnvelope(
  error: PublicApiError,
  meta: Record<string, unknown> = {},
) {
  return {
    data: null,
    error,
    meta: {
      generatedAt: new Date().toISOString(),
      source: currentDataSource(),
      releaseId: null,
      schemaVersion: publicApiSchemaVersion,
      ...meta,
    },
  };
}

export const getCoverageSummary = unstable_cache(
  uncachedGetCoverageSummary,
  [publicDataCacheNamespace, "coverage-summary"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listCompletenessReport = uncachedListCompletenessReport;

export const listEquipmentRows = unstable_cache(
  uncachedListEquipmentRows,
  [publicDataCacheNamespace, "equipment-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listHistoricalResultRows = unstable_cache(
  uncachedListHistoricalResultRows,
  [publicDataCacheNamespace, "historical-result-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listIndicators = uncachedListIndicators;

export const listElections = unstable_cache(
  uncachedListElections,
  [publicDataCacheNamespace, "elections"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listImportRuns = unstable_cache(
  uncachedListImportRuns,
  [publicDataCacheNamespace, "import-runs"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listReviewRows = uncachedListReviewRows;

export const listResults = unstable_cache(
  uncachedListResults,
  [publicDataCacheNamespace, "results"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listSources = unstable_cache(
  uncachedListSources,
  [publicDataCacheNamespace, "sources"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listStates = uncachedListStates;

export const listTurnoutRows = unstable_cache(
  uncachedListTurnoutRows,
  [publicDataCacheNamespace, "turnout-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export const listVoteMethodRows = unstable_cache(
  uncachedListVoteMethodRows,
  [publicDataCacheNamespace, "vote-method-rows"],
  { revalidate: publicDataRevalidateSeconds },
);

export { listNativeSourcePackages } from "./native-source-packages";
export { listAdminSourceStatuses } from "./admin-source-packages";
export { listSourceAcquisitionTiers } from "./source-acquisition-tiers";
export { listSwingStateParity } from "./swing-state-parity";
export { listElectronicIntegrityArtifacts } from "./electronic-integrity-artifacts";
export { listElectronicIntegrityRequests } from "./electronic-integrity-requests";
export { listSourceRecordsRequests } from "./source-records-requests";
export { listTurnoutSourceStatuses } from "./turnout-source-packages";

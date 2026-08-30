import { cache } from "react";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import {
  currentDataSource,
  getCoverageSummary as uncachedGetCoverageSummary,
  getPublicDataRevision as uncachedGetPublicDataRevision,
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
import { publicApiSchemaVersion, securityIncidentApiSchemaVersion } from "./api-version";
import { listSecurityIncidents as uncachedListSecurityIncidents } from "./security-incidents";

export const publicDataRevalidateSeconds = 15 * 60;
const publicDataCacheNamespace = "public-data-historical-advisory-2026-07-12";
const currentPublicDataRevision = cache(uncachedGetPublicDataRevision);

function cachePublicData<Args extends unknown[], Result>(
  loader: (...args: Args) => Promise<Result>,
  key: string,
  options: { persistent?: boolean } = {},
) {
  if (options.persistent === false) {
    return cache(loader);
  }

  const cachedLoader = unstable_cache(
    async (_revision: string, ...args: Args) => loader(...args),
    [publicDataCacheNamespace, key],
    { revalidate: publicDataRevalidateSeconds },
  );
  return async (...args: Args) => {
    const revision = await currentPublicDataRevision();
    return revision === null
      ? loader(...args)
      : cachedLoader(revision, ...args);
  };
}

export const publicDataCacheHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Disposition, X-Data-Sha256, X-Deployment-Sha, X-Pagination-Limit, X-Pagination-Offset, X-Release-Id, X-Total-Count",
  "X-Deployment-Sha": process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
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
  .enum(["county", "state", "district", "precinct", "vtd", "local_reporting_unit", "city", "city_town", "town", "federal_precincts", "non_geographic"])
  .default("county");

export const parentGeoidQuery = z
  .string()
  .trim()
  .regex(
    /^(?:\d{5}|HD(?:0[1-9]|[1-3][0-9]|40))$/,
    "parentGeoid must be a supported county or House District identifier",
  );

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

export const getCoverageSummary = cachePublicData(
  uncachedGetCoverageSummary,
  "coverage-summary",
);

export const listCompletenessReport = cachePublicData(
  uncachedListCompletenessReport,
  "completeness-report",
);

export const listEquipmentRows = cachePublicData(
  uncachedListEquipmentRows,
  "equipment-rows",
);

export const listHistoricalResultRows = cachePublicData(
  uncachedListHistoricalResultRows,
  "historical-result-rows",
);

export const listIndicators = cachePublicData(
  uncachedListIndicators,
  "indicators",
);

export const listElections = cachePublicData(
  uncachedListElections,
  "elections",
);

export const listImportRuns = cachePublicData(
  uncachedListImportRuns,
  "import-runs",
);

// Metric-rich review payloads can exceed Next.js's 2 MB Data Cache item limit.
// Keep the public response complete and query this bounded, state-scoped data directly.
export const listReviewRows = cachePublicData(
  uncachedListReviewRows,
  "review-rows",
  { persistent: false },
);

export const listResults = cachePublicData(
  uncachedListResults,
  "results",
  { persistent: process.env.CRM_PRECINCT_REHEARSAL !== "mn" },
);

export const listSecurityIncidents = cachePublicData(
  uncachedListSecurityIncidents,
  `security-incidents-${securityIncidentApiSchemaVersion}`,
);

export const listSources = cachePublicData(
  uncachedListSources,
  "sources",
);

export const listStates = cachePublicData(
  uncachedListStates,
  "states",
);

// Precinct turnout payloads can also exceed Next.js's 2 MB Data Cache item
// limit. Keep full state/year responses available without persistent caching.
export const listTurnoutRows = cachePublicData(
  uncachedListTurnoutRows,
  "turnout-rows",
  { persistent: false },
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

import { NextResponse } from "next/server";
import { apiEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "./api";
import { getPublicDataRevision, listReviewRows, listTurnoutRows, listHistoricalResultRows } from "./data-access";
import { parsePublicPage, PublicPageError, readStablePublicPage } from "./public-data-pagination";

/** Deliberately bypasses Next's persistent result cache for revision-fenced pages. */
export async function publicDataPageResponse(family: "review" | "turnout" | "historical", params: URLSearchParams, state: string, year?: number) {
  try {
    const input = parsePublicPage(params);
    const common = { state, year: year ?? 2024, includeMetrics: params.get("includeMetrics") === "true" };
    const result = await readStablePublicPage<unknown>(input, {
      revision: getPublicDataRevision,
      rows: (page) => family === "review" ? listReviewRows({ ...common, ...page })
        : family === "turnout" ? listTurnoutRows({ ...common, ...page })
          : listHistoricalResultRows({ ...common, year, ...page }),
    });
    return NextResponse.json(apiEnvelope(result.data, result.meta), { headers: publicDataCacheHeaders });
  } catch (error) {
    const known = error instanceof PublicPageError;
    return NextResponse.json({ data: null, error: known ? error.code : "database_page_unavailable", meta: { source: "unavailable" } }, {
      status: known ? error.status : 503, headers: publicApiErrorHeaders,
    });
  }
}

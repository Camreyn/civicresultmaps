import { NextRequest, NextResponse } from "next/server";
import {
  apiEnvelope,
  apiErrorEnvelope,
  publicApiErrorHeaders,
  publicDataCacheHeaders,
  stateQuery,
} from "@/lib/api";
import { searchCanonicalCountyPage, usStateOptions } from "@/lib/county-search";

const validStates = new Set<string>(usStateOptions.map(([code]) => code));

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim();
  const stateParam = (params.get("state") ?? "").trim();
  const stateResult = stateParam ? stateQuery.safeParse(stateParam) : null;
  const requestedLimit = Number(params.get("limit") ?? 10);
  const requestedOffset = Number(params.get("offset") ?? 0);

  if (query.length > 120) {
    return NextResponse.json(
      apiErrorEnvelope("q must be 120 characters or fewer"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  if (stateResult && (!stateResult.success || !validStates.has(stateResult.data))) {
    return NextResponse.json(
      apiErrorEnvelope("state must be a valid two-letter U.S. state or DC code"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json(
      apiErrorEnvelope("limit must be an integer from 1 through 100"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
    return NextResponse.json(
      apiErrorEnvelope("offset must be a non-negative integer"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  const state = stateResult?.success ? stateResult.data : undefined;
  const page = searchCanonicalCountyPage({
    limit: requestedLimit,
    offset: requestedOffset,
    query,
    state,
  });

  return NextResponse.json(
    apiEnvelope(page.results, {
      contract: "county:<five-digit Census GEOID>",
      hasMore: page.offset + page.results.length < page.total,
      limit: page.limit,
      offset: page.offset,
      query,
      rowCount: page.results.length,
      source: "canonical-jurisdictions",
      state: state ?? null,
      total: page.total,
    }),
    { headers: publicDataCacheHeaders },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders, stateQuery } from "@/lib/api";
import { usStateOptions } from "@/lib/county-search";
import { getCanonicalJurisdictionRegistry } from "@/lib/jurisdiction-tags";

const validStates = new Set<string>(usStateOptions.map(([code]) => code));

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const fipsParam = params.get("fips");
  const stateResult = stateParam ? stateQuery.safeParse(stateParam) : null;
  const fips = fipsParam?.trim() || null;
  const limit = Number(params.get("limit") ?? 250);
  const offset = Number(params.get("offset") ?? 0);

  if (stateResult && (!stateResult.success || !validStates.has(stateResult.data))) {
    return NextResponse.json(
      apiErrorEnvelope("state must be a valid two-letter U.S. state or DC code"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }
  const state = stateResult?.success ? stateResult.data : null;

  if (fips && !/^\d{5}$/.test(fips)) {
    return NextResponse.json(
      apiErrorEnvelope("fips must be a five-digit county GEOID"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    return NextResponse.json(
      apiErrorEnvelope("limit must be an integer from 1 through 5000"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json(
      apiErrorEnvelope("offset must be a non-negative integer"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  const countyRows = getCanonicalJurisdictionRegistry().jurisdictions
    .filter((row) => row.jurisdictionTag.startsWith("county:"));
  const matchingRows = countyRows
    .filter((row) => !state || row.state === state)
    .filter((row) => !fips || row.fips === fips)
    .sort((left, right) => left.state.localeCompare(right.state) || left.fips.localeCompare(right.fips));
  const registry = matchingRows.slice(offset, offset + limit);

  return NextResponse.json(apiEnvelope(registry, {
    source: "canonical-jurisdictions",
    rowCount: registry.length,
    hasMore: offset + registry.length < matchingRows.length,
    limit,
    offset,
    total: matchingRows.length,
    registryCountyEquivalentCount: countyRows.length,
    contract: "county:<five-digit Census GEOID>",
  }), {
    headers: publicDataCacheHeaders,
  });
}

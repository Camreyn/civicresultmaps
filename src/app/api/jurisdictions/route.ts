import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, publicDataCacheHeaders, stateQuery } from "@/lib/api";
import { getCanonicalJurisdictionRegistry } from "@/lib/jurisdiction-tags";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const fipsParam = params.get("fips");
  const state = stateParam ? stateQuery.parse(stateParam) : null;
  const fips = fipsParam?.trim() || null;

  if (fips && !/^\d{5}$/.test(fips)) {
    return NextResponse.json(
      apiEnvelope([], { error: "fips must be a five-digit county GEOID" }),
      { status: 400 },
    );
  }

  const countyRows = getCanonicalJurisdictionRegistry().jurisdictions
    .filter((row) => row.jurisdictionTag.startsWith("county:"));
  const registry = countyRows
    .filter((row) => !state || row.state === state)
    .filter((row) => !fips || row.fips === fips)
    .sort((left, right) => left.state.localeCompare(right.state) || left.fips.localeCompare(right.fips));

  return NextResponse.json(apiEnvelope(registry, {
    source: "canonical-jurisdictions",
    rowCount: registry.length,
    registryCountyEquivalentCount: countyRows.length,
    contract: "county:<five-digit Census GEOID>",
  }), {
    headers: publicDataCacheHeaders,
  });
}

import { NextResponse } from "next/server";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { loadCountyProfile } from "@/lib/county-profile";

type RouteContext = { params: Promise<{ fips: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { fips } = await context.params;
  if (!/^\d{5}$/.test(fips)) {
    return NextResponse.json(
      apiErrorEnvelope("fips must be a five-digit county GEOID"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  const profile = await loadCountyProfile(fips);
  if (!profile) {
    return NextResponse.json(
      apiErrorEnvelope("No current Census county or county equivalent has that FIPS code"),
      { status: 404, headers: publicApiErrorHeaders },
    );
  }

  return NextResponse.json(
    apiEnvelope(profile, {
      caveat: "Advisory indicators are source-review prompts, not findings of fraud or misconduct.",
      contract: "county:<five-digit Census GEOID>",
      electionYears: [2016, 2020, 2024],
      fips,
    }),
    { headers: publicDataCacheHeaders },
  );
}

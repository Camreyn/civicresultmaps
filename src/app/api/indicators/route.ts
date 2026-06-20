import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listIndicators, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "");

  return NextResponse.json(apiEnvelope(await listIndicators({ state, year })), {
    headers: publicDataCacheHeaders,
  });
}

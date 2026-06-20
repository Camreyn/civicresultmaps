import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listHistoricalResultRows, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const yearParam = params.get("year");
  const year = yearParam ? yearQuery.parse(yearParam) : undefined;
  const limit = Number(params.get("limit") ?? 500);
  const includeMetrics = params.get("includeMetrics") === "true";

  return NextResponse.json(apiEnvelope(await listHistoricalResultRows({ includeMetrics, limit, state, year })), {
    headers: publicDataCacheHeaders,
  });
}

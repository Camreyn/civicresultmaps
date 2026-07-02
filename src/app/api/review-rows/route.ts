import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listReviewRows, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "2024");
  const limit = Number(params.get("limit") ?? 500);
  const includeMetrics = params.get("includeMetrics") === "true";

  return NextResponse.json(apiEnvelope(await listReviewRows({ includeMetrics, limit, state, year })), {
    headers: publicDataCacheHeaders,
  });
}

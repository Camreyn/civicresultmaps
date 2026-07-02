import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listTurnoutRows, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "2024");
  const limit = Number(params.get("limit") ?? 500);

  return NextResponse.json(apiEnvelope(await listTurnoutRows({ limit, state, year })), {
    headers: publicDataCacheHeaders,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listVoteMethodRows, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "");
  const limit = Number(params.get("limit") ?? 500);
  const method = params.get("method") ?? undefined;

  return NextResponse.json(apiEnvelope(await listVoteMethodRows({ limit, method, state, year })), {
    headers: publicDataCacheHeaders,
  });
}

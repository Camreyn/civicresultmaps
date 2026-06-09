import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listHistoricalResultRows, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const yearParam = params.get("year");
  const year = yearParam ? yearQuery.parse(yearParam) : undefined;
  const limit = Number(params.get("limit") ?? 500);

  return NextResponse.json(apiEnvelope(await listHistoricalResultRows({ limit, state, year })));
}

import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, levelQuery, listResults, stateQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "");
  const level = levelQuery.parse(params.get("level") ?? "county");

  return NextResponse.json(apiEnvelope(await listResults({ state, year, level })));
}

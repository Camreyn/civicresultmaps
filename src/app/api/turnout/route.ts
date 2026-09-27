import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listTurnoutRows, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";
import { publicDataPageResponse } from "@/lib/public-data-page-response";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "2024");
  if (params.get("paginate") === "true") return publicDataPageResponse("turnout", params, state, year);
  const limit = Number(params.get("limit") ?? 500);

  return NextResponse.json(apiEnvelope(await listTurnoutRows({ limit, state, year })), {
    headers: publicDataCacheHeaders,
  });
}

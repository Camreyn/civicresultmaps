import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listSwingStateParity, publicDataCacheHeaders, stateQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const parity = listSwingStateParity({ state });

  return NextResponse.json(
    apiEnvelope(parity, {
      state: state ?? null,
      rowCount: parity.states.length,
    }),
    { headers: publicDataCacheHeaders },
  );
}

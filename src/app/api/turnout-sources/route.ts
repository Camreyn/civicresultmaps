import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listTurnoutSourceStatuses, publicDataCacheHeaders } from "@/lib/api";
import { invalidPublicQuery, parseSourceStatusQuery } from "@/lib/public-api-query";

export async function GET(request: NextRequest) {
  const parsed = parseSourceStatusQuery(request.nextUrl.searchParams);
  if (!parsed.success) return invalidPublicQuery(parsed.error);

  const { state, year, status } = parsed.data;
  const packages = listTurnoutSourceStatuses({ state, status, year });

  return NextResponse.json(
    apiEnvelope(packages, {
      state: state ?? null,
      status: status ?? null,
      stateCount: packages.states.length,
      year,
    }),
    { headers: publicDataCacheHeaders },
  );
}

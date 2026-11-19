import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listAdminSourceStatuses, publicDataCacheHeaders } from "@/lib/api";
import { invalidPublicQuery, parseSourceStatusQuery } from "@/lib/public-api-query";

export async function GET(request: NextRequest) {
  const parsed = parseSourceStatusQuery(request.nextUrl.searchParams);
  if (!parsed.success) return invalidPublicQuery(parsed.error);

  const { state, year, status } = parsed.data;
  const packages = listAdminSourceStatuses({ state, status, year });

  return NextResponse.json(
    apiEnvelope(packages, {
      caveat:
        "Administration source statuses describe source availability. Equipment context is jurisdiction-level context, not vote, turnout, evidence of cause, or proof that every precinct in a county used one identical setup.",
      state: state ?? null,
      status: status ?? null,
      stateCount: packages.states.length,
      year,
    }),
    { headers: publicDataCacheHeaders },
  );
}

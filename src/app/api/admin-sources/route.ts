import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listAdminSourceStatuses, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";
import type { AdminSourceStatusValue } from "@/lib/admin-source-packages";

const statusValues = new Set<AdminSourceStatusValue>([
  "blocked",
  "candidate",
  "documented_exclusion",
  "loaded",
  "needs_data",
  "partial",
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const yearParam = params.get("year");
  const statusParam = params.get("status") as AdminSourceStatusValue | null;
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const year = yearParam ? yearQuery.parse(yearParam) : 2024;
  const status = statusParam && statusValues.has(statusParam) ? statusParam : undefined;
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

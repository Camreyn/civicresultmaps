import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listTurnoutSourceStatuses, stateQuery, yearQuery } from "@/lib/api";
import type { TurnoutSourceStatusValue } from "@/lib/turnout-source-packages";

const statusValues = new Set<TurnoutSourceStatusValue>([
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
  const statusParam = params.get("status") as TurnoutSourceStatusValue | null;
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const year = yearParam ? yearQuery.parse(yearParam) : 2024;
  const status = statusParam && statusValues.has(statusParam) ? statusParam : undefined;
  const packages = listTurnoutSourceStatuses({ state, status, year });

  return NextResponse.json(
    apiEnvelope(packages, {
      state: state ?? null,
      status: status ?? null,
      stateCount: packages.states.length,
      year,
    }),
  );
}

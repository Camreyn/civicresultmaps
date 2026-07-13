import { NextResponse } from "next/server";
import {
  apiEnvelope,
  listSecurityIncidents,
  publicDataCacheHeaders,
  stateQuery,
  yearQuery,
} from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = stateQuery.safeParse(searchParams.get("state") ?? "GA");
  const year = yearQuery.safeParse(searchParams.get("year") ?? "2024");
  const requestedLimit = Number(searchParams.get("limit") ?? 5000);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 5000)
    : null;

  if (!state.success || !year.success || limit === null) {
    return NextResponse.json(
      { error: "Invalid state, year, or limit query." },
      { headers: publicDataCacheHeaders, status: 400 },
    );
  }

  const rows = await listSecurityIncidents({ state: state.data, year: year.data, limit });
  const threatCountComplete = rows.length > 0 && rows.every((row) => row.threatCount !== null);
  const documentedThreatCount = threatCountComplete
    ? rows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0)
    : null;
  const affectedLocations = rows.reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0);

  return NextResponse.json(
    apiEnvelope(rows, {
      affectedLocations,
      documentedThreatCount,
      limit,
      rowCount: rows.length,
      threatCountComplete,
      caveat:
        "These are partial, official-source election-administration incident rows. They are separate from results and advisory indicators, are not evidence of fraud or misconduct, and an absent row does not establish that no incident occurred.",
    }),
    { headers: publicDataCacheHeaders },
  );
}

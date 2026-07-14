import { NextResponse } from "next/server";
import {
  apiEnvelope,
  listSecurityIncidents,
  publicDataCacheHeaders,
  stateQuery,
  yearQuery,
} from "@/lib/api";
import { securityIncidentApiSchemaVersion } from "@/lib/api-version";
import { summarizeSecurityIncidents } from "@/lib/security-incident-summary";

const securityIncidentCacheHeaders = {
  ...publicDataCacheHeaders,
  "Cache-Control": "public, max-age=300",
  "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const state = stateQuery.safeParse(searchParams.get("state") ?? "GA");
  const year = yearQuery.safeParse(searchParams.get("year") ?? "2024");
  const requestedLimit = Number(searchParams.get("limit") ?? 5000);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 5000)
    : null;

  if (!state.success || !year.success || limit === null) {
    console.warn(JSON.stringify({
      durationMs: Date.now() - startedAt,
      level: "warning",
      message: "security_incidents_invalid_query",
      route: "/api/security-incidents",
    }));
    return NextResponse.json(
      { error: "Invalid state, year, or limit query." },
      { headers: publicDataCacheHeaders, status: 400 },
    );
  }

  const rows = await listSecurityIncidents({ state: state.data, year: year.data, limit });
  const totals = summarizeSecurityIncidents(rows);

  console.log(JSON.stringify({
    durationMs: Date.now() - startedAt,
    level: "info",
    message: "security_incidents_response",
    route: "/api/security-incidents",
    rowCount: totals.rowCount,
    state: state.data,
    year: year.data,
  }));

  return NextResponse.json(
    apiEnvelope(rows, {
      ...totals,
      limit,
      schemaVersion: securityIncidentApiSchemaVersion,
      caveat:
        "These source-linked election-administration rows use the later Brennan Center 227-threat public-source tracker, retain statewide counts whose counties were not named, and preserve one additional earlier county mention with an unknown count. The tracker is not an FBI roster and may not be exhaustive. Reported threats and affected places remain different measures, and the rows are not evidence of fraud or misconduct.",
    }),
    { headers: securityIncidentCacheHeaders },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listSourceRecordsRequests, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";
import type { SourceRecordsRequestStatus } from "@/lib/source-records-requests";

const statusValues = new Set<SourceRecordsRequestStatus>([
  "acknowledged",
  "closed",
  "denied",
  "draft_ready",
  "fee_requested",
  "not_sent",
  "received",
  "redirected",
  "sent",
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const yearParam = params.get("year");
  const statusParam = params.get("status") as SourceRecordsRequestStatus | null;
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const year = yearParam ? yearQuery.parse(yearParam) : 2024;
  const status = statusParam && statusValues.has(statusParam) ? statusParam : undefined;
  const requestOps = listSourceRecordsRequests({ state, status, year });

  return NextResponse.json(
    apiEnvelope(requestOps, {
      caveat:
        "Source records request rows track records-request workflow only. A draft, sent, delayed, denied, redirected, or received request is not evidence of fraud, misconduct, or tampering.",
      state: state ?? null,
      status: status ?? null,
      year,
    }),
    { headers: publicDataCacheHeaders },
  );
}

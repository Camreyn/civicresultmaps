import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listElectronicIntegrityRequests, publicDataCacheHeaders, stateQuery, yearQuery } from "@/lib/api";
import type { ElectronicIntegrityRequestStatus } from "@/lib/electronic-integrity-requests";

const statusValues = new Set<ElectronicIntegrityRequestStatus>([
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
  const statusParam = params.get("status") as ElectronicIntegrityRequestStatus | null;
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const year = yearParam ? yearQuery.parse(yearParam) : 2024;
  const status = statusParam && statusValues.has(statusParam) ? statusParam : undefined;
  const requestOps = listElectronicIntegrityRequests({ state, status, year });

  return NextResponse.json(
    apiEnvelope(requestOps, {
      caveat:
        "Electronic integrity request rows track records-request workflow only. A draft, sent, delayed, denied, or received request is not evidence of electronic tampering.",
      state: state ?? null,
      status: status ?? null,
      year,
    }),
    { headers: publicDataCacheHeaders },
  );
}

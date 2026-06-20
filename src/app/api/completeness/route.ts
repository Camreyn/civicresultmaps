import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listCompletenessReport, publicDataCacheHeaders, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const year = yearQuery.parse(params.get("year") ?? "2024");
  const report = await listCompletenessReport({ year });

  return NextResponse.json(
    apiEnvelope(report, {
      completeStates: report.filter((state) => state.status === "complete").length,
      statesLoaded: report.length,
      year,
    }),
    { headers: publicDataCacheHeaders },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiEnvelope, listCompletenessReport, publicDataCacheHeaders, yearQuery } from "@/lib/api";
import { invalidPublicQuery } from "@/lib/public-api-query";

const completenessQuery = z.object({ year: yearQuery.default(2024) });

export async function GET(request: NextRequest) {
  const parsed = completenessQuery.safeParse({ year: request.nextUrl.searchParams.get("year") ?? undefined });
  if (!parsed.success) return invalidPublicQuery(parsed.error);

  const { year } = parsed.data;
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

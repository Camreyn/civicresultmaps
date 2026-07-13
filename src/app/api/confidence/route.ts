import { NextResponse } from "next/server";
import { apiEnvelope, publicDataCacheHeaders } from "@/lib/api";
import { dataConfidenceDefinitions } from "@/lib/data-confidence";

export function GET() {
  const definitions = Object.entries(dataConfidenceDefinitions).map(([level, definition]) => ({
    level,
    ...definition,
  }));
  return NextResponse.json(
    apiEnvelope(definitions, {
      contract: "exact|derived|partial|proxy|non_geographic|unavailable",
      total: definitions.length,
    }),
    { headers: publicDataCacheHeaders },
  );
}

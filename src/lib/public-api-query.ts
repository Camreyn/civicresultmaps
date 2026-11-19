import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorEnvelope, publicApiErrorHeaders, stateQuery, yearQuery } from "@/lib/api";
import { usStateOptions } from "@/lib/us-states";

const stateCodes = new Set<string>(usStateOptions.map(([code]) => code));
export const publicStateQuery = stateQuery.refine((state) => stateCodes.has(state));

const sourceStatusQuery = z.object({
  state: publicStateQuery.optional(),
  year: yearQuery.default(2024),
  status: z.enum(["blocked", "candidate", "documented_exclusion", "loaded", "needs_data", "partial"]).optional(),
});

export function parseSourceStatusQuery(params: URLSearchParams) {
  return sourceStatusQuery.safeParse({
    state: params.get("state") ?? undefined,
    year: params.get("year") ?? undefined,
    status: params.get("status") ?? undefined,
  });
}

export function invalidPublicQuery(error: z.ZodError) {
  return NextResponse.json(
    apiErrorEnvelope({
      code: "invalid_query",
      message: "One or more query parameters are invalid.",
      issues: error.issues.map((issue) => ({ field: issue.path.join("."), message: "Invalid value." })),
    }),
    { status: 400, headers: publicApiErrorHeaders },
  );
}

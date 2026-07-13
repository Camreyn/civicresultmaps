import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { publicApiSchemaVersion } from "@/lib/api-version";
import { queryNationalCountyComparisons } from "@/lib/national-county-comparison-data";
import {
  nationalComparisonYears,
  nationalCountyComparisonsToCsv,
  type NationalComparisonYear,
  type NationalCountyComparisonRow,
} from "@/lib/national-county-comparison";

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  z.string().max(maximum).optional(),
);

const comparisonYear = z.coerce
  .number()
  .int()
  .refine(
    (year) => nationalComparisonYears.includes(year as (typeof nationalComparisonYears)[number]),
    { message: `Year must be one of ${nationalComparisonYears.join(", ")}.` },
  );

const flipsQuery = z.object({
  direction: z.enum(["all", "red_to_blue", "blue_to_red", "no_flip"]).default("all"),
  fips: z.preprocess(
    (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
    z.string().regex(/^\d{5}$/, "FIPS must be exactly five digits.").optional(),
  ),
  format: z.enum(["json", "csv"]).default("json"),
  from: comparisonYear.default(2020),
  limit: z.coerce.number().int().min(1).max(5000).default(250),
  offset: z.coerce.number().int().min(0).default(0),
  q: optionalText(100),
  state: z.preprocess(
    (value) => typeof value === "string" && value.trim() ? value.trim().toUpperCase() : undefined,
    z.string().regex(/^[A-Z]{2}$/, "State must be a two-letter postal code.").optional(),
  ),
  view: z.enum(["full", "compact"]).default("full"),
  to: comparisonYear.default(2024),
}).refine((value) => value.from !== value.to, {
  message: "The comparison years must be different.",
  path: ["to"],
}).refine((value) => value.format !== "json" || value.view !== "full" || value.limit <= 1000, {
  message: "Full JSON responses are limited to 1,000 rows. Use view=compact, pagination, CSV, or a release ZIP for larger requests.",
  path: ["limit"],
});

function invalidQuery(error: z.ZodError) {
  return NextResponse.json(
    apiErrorEnvelope({
      code: "invalid_query",
      issues: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      message: "One or more flip-query parameters are invalid.",
    }),
    { status: 400, headers: publicApiErrorHeaders },
  );
}

function compactSnapshot(snapshot: NationalCountyComparisonRow["from"]) {
  return {
    confidence: snapshot.confidence,
    demCandidate: snapshot.demCandidate,
    demMarginPct: snapshot.demMarginPct,
    demMarginVotes: snapshot.demMarginVotes,
    demSharePct: snapshot.demSharePct,
    demVotes: snapshot.demVotes,
    otherVotes: snapshot.otherVotes,
    repCandidate: snapshot.repCandidate,
    repSharePct: snapshot.repSharePct,
    repVotes: snapshot.repVotes,
    sourceId: snapshot.sourceId,
    totalVotes: snapshot.totalVotes,
    turnout: snapshot.turnout,
    winner: snapshot.winner,
    year: snapshot.year,
  };
}

function compactComparisonRow(row: NationalCountyComparisonRow) {
  return {
    caveat: row.caveat,
    confidence: row.confidence,
    county: row.county,
    direction: row.direction,
    fips: row.fips,
    from: compactSnapshot(row.from),
    jurisdictionTag: row.jurisdictionTag,
    marginSwingPct: row.marginSwingPct,
    state: row.state,
    to: compactSnapshot(row.to),
    totalVoteChange: row.totalVoteChange,
    totalVoteChangePct: row.totalVoteChangePct,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = flipsQuery.safeParse({
    direction: params.get("direction") ?? undefined,
    fips: params.get("fips") ?? undefined,
    format: params.get("format") ?? undefined,
    from: params.get("from") ?? undefined,
    limit: params.get("limit") ?? undefined,
    offset: params.get("offset") ?? undefined,
    q: params.get("q") ?? undefined,
    state: params.get("state") ?? undefined,
    to: params.get("to") ?? undefined,
    view: params.get("view") ?? undefined,
  });
  if (!parsed.success) {
    return invalidQuery(parsed.error);
  }

  const result = await queryNationalCountyComparisons({
    direction: parsed.data.direction,
    fips: parsed.data.fips,
    from: parsed.data.from as NationalComparisonYear,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    query: parsed.data.q,
    state: parsed.data.state,
    to: parsed.data.to as NationalComparisonYear,
  });

  if (parsed.data.format === "csv") {
    const scope = parsed.data.state ? `-${parsed.data.state.toLowerCase()}` : "";
    return new NextResponse(nationalCountyComparisonsToCsv(result.rows), {
      headers: {
        ...publicDataCacheHeaders,
        "Content-Disposition": `attachment; filename="county-comparison-${parsed.data.from}-${parsed.data.to}${scope}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Pagination-Limit": String(result.pagination.limit),
        "X-Pagination-Offset": String(result.pagination.offset),
        "X-Total-Count": String(result.pagination.total),
      },
    });
  }

  const responseRows = parsed.data.view === "compact" ? result.rows.map(compactComparisonRow) : result.rows;

  return NextResponse.json(
    apiEnvelope(responseRows, {
      apiVersion: publicApiSchemaVersion,
      coverage: result.coverage,
      filters: {
        direction: parsed.data.direction,
        fips: parsed.data.fips ?? null,
        from: parsed.data.from,
        q: parsed.data.q ?? null,
        state: parsed.data.state ?? null,
        to: parsed.data.to,
        view: parsed.data.view,
      },
      pagination: result.pagination,
      summary: result.summary,
    }),
    { headers: publicDataCacheHeaders },
  );
}

import { NextRequest, NextResponse } from "next/server";

import {
  apiEnvelope,
  apiErrorEnvelope,
  publicApiErrorHeaders,
  publicDataCacheHeaders,
} from "@/lib/api";
import {
  getDistrictCompactnessDataset,
  queryDistrictCompactness,
  type DistrictCompactnessSort,
  type DistrictGeographyType,
  type DistrictResolutionStability,
} from "@/lib/district-compactness";

const geographyTypes = new Set<DistrictGeographyType>(["congressional", "state_upper", "state_lower"]);
const stabilityValues = new Set<DistrictResolutionStability>(["stable", "resolution_sensitive"]);
const sortValues = new Set<DistrictCompactnessSort>([
  "polsby_asc",
  "polsby_desc",
  "hull_asc",
  "resolution_difference_desc",
  "state_asc",
]);

function integerParameter(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

function badRequest(message: string) {
  return NextResponse.json(apiErrorEnvelope(message), {
    status: 400,
    headers: publicApiErrorHeaders,
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateCode = params.get("state")?.trim().toUpperCase() || undefined;
  if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) return badRequest("state must be a two-letter code");
  const geography = params.get("geography")?.trim().toLowerCase() || undefined;
  if (geography && !geographyTypes.has(geography as DistrictGeographyType)) {
    return badRequest("geography must be congressional, state_upper, or state_lower");
  }
  const stability = params.get("stability")?.trim().toLowerCase() || undefined;
  if (stability && !stabilityValues.has(stability as DistrictResolutionStability)) {
    return badRequest("stability must be stable or resolution_sensitive");
  }
  const sort = params.get("sort")?.trim().toLowerCase() || "polsby_asc";
  if (!sortValues.has(sort as DistrictCompactnessSort)) return badRequest("unsupported sort value");
  const query = params.get("q")?.trim().slice(0, 100) || undefined;
  const limit = integerParameter(params.get("limit"), 100, 1, 500);
  const offset = integerParameter(params.get("offset"), 0, 0, 100_000);
  if (limit === null) return badRequest("limit must be an integer from 1 through 500");
  if (offset === null) return badRequest("offset must be a non-negative integer no greater than 100000");

  const dataset = getDistrictCompactnessDataset();
  const result = queryDistrictCompactness({
    geographyType: geography as DistrictGeographyType | undefined,
    limit,
    offset,
    query,
    resolutionStability: stability as DistrictResolutionStability | undefined,
    sort: sort as DistrictCompactnessSort,
    stateCode,
  });

  return NextResponse.json(apiEnvelope(result.rows, {
    source: "us-census-tigerweb-2024-district-plans",
    rowCount: result.rows.length,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    filters: {
      geography: geography ?? null,
      q: query ?? null,
      stability: stability ?? null,
      state: stateCode ?? null,
    },
    sort: result.sort,
    plan: dataset.plan,
    methodology: dataset.methodology,
    resultRelationship: dataset.resultRelationship,
    advisoryOnly: true,
    contract: "Compactness describes boundary shape and resolution sensitivity. It is not a score of gerrymandering, partisan intent, legality, representational quality, or election integrity.",
  }), { headers: publicDataCacheHeaders });
}

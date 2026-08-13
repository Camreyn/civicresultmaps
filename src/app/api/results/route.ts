import { NextRequest, NextResponse } from "next/server";
import {
  apiEnvelope,
  apiErrorEnvelope,
  levelQuery,
  listResults,
  officeQuery,
  parentGeoidQuery,
  publicApiErrorHeaders,
  publicDataCacheHeaders,
  stateQuery,
  yearQuery,
} from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = stateQuery.parse(params.get("state") ?? "");
  const year = yearQuery.parse(params.get("year") ?? "2024");
  const level = levelQuery.parse(params.get("level") ?? "county");
  const officeParam = params.get("office");
  const office = officeParam ? officeQuery.parse(officeParam) : undefined;
  const parentGeoidParam = params.get("parentGeoid");
  const parsedParentGeoid = parentGeoidParam
    ? parentGeoidQuery.safeParse(parentGeoidParam)
    : null;
  if (parsedParentGeoid && !parsedParentGeoid.success) {
    return NextResponse.json(
      apiErrorEnvelope("parentGeoid must be a five-digit county GEOID"),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }
  const parentGeoid = parsedParentGeoid?.data;
  if (
    parentGeoid
    && level !== "precinct"
    && level !== "local_reporting_unit"
  ) {
    return NextResponse.json(
      apiErrorEnvelope(
        "parentGeoid is supported only for county-scoped local results",
      ),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }

  return NextResponse.json(apiEnvelope(await listResults({
    state,
    year,
    level,
    office,
    parentGeoid,
  })), {
    headers: publicDataCacheHeaders,
  });
}

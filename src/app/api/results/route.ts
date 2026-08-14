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
import {
  isValidLocalGeographyParentId,
  localGeographyParentValidationMessage,
} from "@/lib/local-geography-parent";

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
      apiErrorEnvelope(
        "parentGeoid must be a supported county or House District identifier",
      ),
      { status: 400, headers: publicApiErrorHeaders },
    );
  }
  const parentGeoid = parsedParentGeoid?.data;
  if (
    parentGeoid
    && !isValidLocalGeographyParentId({
      state,
      geographyLevel: level,
      parentGeoid,
    })
  ) {
    return NextResponse.json(
      apiErrorEnvelope(
        localGeographyParentValidationMessage({
          state,
          geographyLevel: level,
        }),
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

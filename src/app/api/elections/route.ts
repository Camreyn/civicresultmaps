import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listElections, officeQuery, yearQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const yearParam = params.get("year");
  const officeParam = params.get("office");

  const year = yearParam ? yearQuery.parse(yearParam) : undefined;
  const office = officeParam ? officeQuery.parse(officeParam) : undefined;

  return NextResponse.json(apiEnvelope(await listElections({ year, office })));
}

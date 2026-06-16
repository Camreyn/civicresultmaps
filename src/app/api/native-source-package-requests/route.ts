import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listNativeSourcePackageRequests, stateQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const stateParam = request.nextUrl.searchParams.get("state");
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const requests = listNativeSourcePackageRequests({ state });

  return NextResponse.json(
    apiEnvelope(requests, {
      requestCount: requests.requestCount,
      state: state ?? null,
    }),
  );
}

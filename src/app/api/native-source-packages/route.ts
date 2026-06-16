import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listNativeSourcePackages, stateQuery } from "@/lib/api";

export async function GET(request: NextRequest) {
  const stateParam = request.nextUrl.searchParams.get("state");
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const packages = listNativeSourcePackages({ state });

  return NextResponse.json(
    apiEnvelope(packages, {
      packageCount: packages.states.length,
      state: state ?? null,
    }),
  );
}

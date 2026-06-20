import { NextResponse } from "next/server";
import { apiEnvelope, listStates, publicDataCacheHeaders } from "@/lib/api";

export async function GET() {
  return NextResponse.json(apiEnvelope(await listStates()), {
    headers: publicDataCacheHeaders,
  });
}

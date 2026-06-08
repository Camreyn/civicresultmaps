import { NextResponse } from "next/server";
import { apiEnvelope, listStates } from "@/lib/api";

export async function GET() {
  return NextResponse.json(apiEnvelope(await listStates()));
}

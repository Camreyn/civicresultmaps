import { NextResponse } from "next/server";
import { apiEnvelope, listImportRuns } from "@/lib/api";

export async function GET() {
  return NextResponse.json(apiEnvelope(await listImportRuns()));
}

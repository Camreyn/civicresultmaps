import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi";
import { publicDataCacheHeaders } from "@/lib/api";

export function GET() {
  return NextResponse.json(buildOpenApiDocument(), {
    headers: {
      ...publicDataCacheHeaders,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

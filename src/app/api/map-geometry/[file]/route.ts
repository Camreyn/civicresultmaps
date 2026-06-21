import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { publicDataCacheHeaders } from "@/lib/api";

const allowedGeometryFile = /^(?:[a-z]{2}-(?:counties|house-districts)|verifiedvoting-[a-z]{2}-2024-equipment-areas)\.geojson$/;

type RouteContext = {
  params: Promise<{
    file: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { file } = await context.params;

  if (!allowedGeometryFile.test(file)) {
    return NextResponse.json(
      { error: "Unsupported map geometry file." },
      { headers: publicDataCacheHeaders, status: 400 },
    );
  }

  try {
    const json = await readFile(path.join(process.cwd(), "data", file), "utf8");
    return new NextResponse(json, {
      headers: {
        ...publicDataCacheHeaders,
        "Content-Type": "application/geo+json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json(
      {
        features: [],
        type: "FeatureCollection",
      },
      {
        headers: {
          ...publicDataCacheHeaders,
          "X-Geometry-Status": "missing",
        },
      },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { importLegacyState } from "@/db/legacy-import";

export const runtime = "nodejs";

const allowedImports = {
  WA: {
    stateCode: "WA",
    stateName: "Washington",
    authority: "Washington Secretary of State",
    sourceSlug: "wa-2024-president-county-results",
    sourceTitle: "Washington certified President/Vice President county page",
    sourceUrl: "https://results.vote.wa.gov/results/20241105/president-vice-president_bycounty.html",
    localArtifact: "data/wa-app-data.js",
    parser: "legacyStaticAppData",
    timestampBasis: "Legacy static project generated bundle from official Washington Secretary of State sources.",
    confidence: "Official Washington Secretary of State county results page.",
    bundleUrl:
      "https://raw.githubusercontent.com/Camreyn/wisconsin-2024-election-mapper/main/data/wa-app-data.js",
  },
};

export async function POST(request: NextRequest) {
  const importToken = process.env.IMPORT_TOKEN;
  const authHeader = request.headers.get("authorization");

  if (!importToken) {
    return NextResponse.json({ error: "IMPORT_TOKEN is not configured." }, { status: 503 });
  }

  if (authHeader !== `Bearer ${importToken}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { state?: string };
  const state = body.state?.toUpperCase() ?? "";
  const config = allowedImports[state as keyof typeof allowedImports];

  if (!config) {
    return NextResponse.json({ error: `No legacy import is configured for ${state}.` }, { status: 400 });
  }

  const result = await importLegacyState(config);
  return NextResponse.json({ ok: true, result, generatedAt: new Date().toISOString() });
}

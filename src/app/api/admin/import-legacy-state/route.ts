import { NextRequest, NextResponse } from "next/server";
import { legacyImportCatalog, legacyImportStates } from "@/db/legacy-catalog";
import { cleanupLegacyState, importLegacyState, refreshLegacyStateIndicators } from "@/db/legacy-import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const importToken = process.env.IMPORT_TOKEN;
  const authHeader = request.headers.get("authorization");

  if (!importToken) {
    return NextResponse.json({ error: "IMPORT_TOKEN is not configured." }, { status: 503 });
  }

  if (authHeader !== `Bearer ${importToken}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string; state?: string };
  const state = body.state?.toUpperCase() ?? "";
  const config = legacyImportCatalog[state as keyof typeof legacyImportCatalog];

  if (!config) {
    return NextResponse.json(
      {
        error: `No legacy import is configured for ${state}.`,
        configuredStates: legacyImportStates,
      },
      { status: 400 },
    );
  }

  if (body.action === "cleanup") {
    const result = await cleanupLegacyState(config);
    return NextResponse.json({ ok: true, result, generatedAt: new Date().toISOString() });
  }

  if (body.action === "refresh-indicators") {
    const result = await refreshLegacyStateIndicators(config);
    return NextResponse.json({ ok: true, result, generatedAt: new Date().toISOString() });
  }

  const result = await importLegacyState(config);
  return NextResponse.json({ ok: true, result, generatedAt: new Date().toISOString() });
}

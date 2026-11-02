import { NextResponse } from "next/server";
import { midtermEquipment, midtermEquipmentCsv } from "@/lib/midterm-equipment";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "NY";
  const year = params.get("year") ?? "2026";
  const format = params.get("format") ?? "json";
  if (!/^[A-Z]{2}$/.test(state) || year !== "2026" || !["json", "csv"].includes(format)) {
    return NextResponse.json({ error: "Use an uppercase state code, year=2026, and format=json or csv." }, { status: 400 });
  }
  if (state !== "NY") {
    return NextResponse.json({ error: "2026 equipment coverage currently starts with New York only.", state, year: 2026, status: "not_loaded", rows: [] }, { status: 404 });
  }
  const headers = { "Cache-Control": "public, max-age=300, s-maxage=3600" };
  if (format === "csv") {
    return new Response(midtermEquipmentCsv(), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ny-2026-equipment-source-snapshot.csv"' } });
  }
  return NextResponse.json(midtermEquipment, { headers });
}

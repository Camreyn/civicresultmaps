import { NextResponse } from "next/server";
import { equipmentClusterDiagnostics } from "@/lib/equipment-diagnostics";
import {
  apiEnvelope,
  listEquipmentRows,
  listIndicators,
  publicDataCacheHeaders,
  stateQuery,
  yearQuery,
} from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = stateQuery.safeParse(searchParams.get("state") ?? "WI");
  const year = yearQuery.safeParse(searchParams.get("year") ?? "2024");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 5000), 1), 20000);

  if (!state.success || !year.success) {
    return NextResponse.json(
      { error: "Invalid state or year query." },
      { headers: publicDataCacheHeaders, status: 400 },
    );
  }

  const [rows, indicators] = await Promise.all([
    listEquipmentRows({ state: state.data, year: year.data, limit }),
    listIndicators({ state: state.data, year: year.data }),
  ]);
  const diagnostics = equipmentClusterDiagnostics({ equipmentRows: rows, indicators }).slice(0, 25);

  return NextResponse.json(
    apiEnvelope(rows, {
      diagnostics,
      limit,
      rowCount: rows.length,
      caveat:
        "Equipment rows are election-administration context. They are not turnout or vote-result rows and do not prove or disprove advisory flags.",
    }),
    { headers: publicDataCacheHeaders },
  );
}

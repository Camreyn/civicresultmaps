import { NextRequest, NextResponse } from "next/server";
import { apiEnvelope, listSourceAcquisitionTiers, publicDataCacheHeaders, stateQuery } from "@/lib/api";
import type { SourceAcquisitionTierValue } from "@/lib/source-acquisition-tiers";

const tierValues = new Set<SourceAcquisitionTierValue>([
  "tier_1_official_export_database",
  "tier_2_official_dashboard_endpoint",
  "tier_3_sanctioned_bulk_partial",
  "tier_4_local_scattershot",
  "tier_5_digital_inconsistent",
  "tier_6_official_pdf_hostile",
  "tier_7_scanned_system_printout",
  "tier_8_scanned_handwritten",
  "unknown",
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stateParam = params.get("state");
  const tierParam = params.get("tier") as SourceAcquisitionTierValue | null;
  const state = stateParam ? stateQuery.parse(stateParam) : undefined;
  const tier = tierParam && tierValues.has(tierParam) ? tierParam : undefined;
  const packages = listSourceAcquisitionTiers({ state, tier });

  return NextResponse.json(
    apiEnvelope(packages, {
      state: state ?? null,
      tier: tier ?? null,
      rowCount: packages.states.length,
    }),
    { headers: publicDataCacheHeaders },
  );
}

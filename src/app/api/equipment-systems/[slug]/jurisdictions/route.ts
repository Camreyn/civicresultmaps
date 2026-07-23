import { NextResponse } from "next/server";

import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { equipmentCatalogApiSchemaVersion } from "@/lib/api-version";
import { equipmentCatalogMetadata, getEquipmentSystem } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  defaultEquipmentUsageEvidence,
  equipmentUsageMetadata,
  getEquipmentUsageSummary,
  queryEquipmentUsage,
  type EquipmentUsageEvidenceKind,
} from "@/lib/equipment-usage";

type RouteContext = { params: Promise<{ slug: string }> };

function integerParameter(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function GET(request: Request, { params }: RouteContext) {
  if (!isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady })) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_catalog_disabled", message: "The equipment catalog is not enabled." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  const summary = getEquipmentUsageSummary(slug);
  if (!system || !summary) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_system_not_found", message: "No reviewed equipment system matches this slug." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const search = new URL(request.url).searchParams;
  const requestedEvidence = search.get("evidence");
  if (requestedEvidence && !["device_family", "manufacturer_context"].includes(requestedEvidence)) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "invalid_equipment_evidence", message: "Evidence must be device_family or manufacturer_context." }),
      { headers: publicApiErrorHeaders, status: 400 },
    );
  }
  const evidenceKind = (requestedEvidence as EquipmentUsageEvidenceKind | null)
    ?? defaultEquipmentUsageEvidence(summary);
  const result = queryEquipmentUsage({
    slug,
    evidenceKind,
    state: search.get("state") ?? undefined,
    query: search.get("q") ?? undefined,
    limit: integerParameter(search.get("limit"), 20),
    offset: integerParameter(search.get("offset"), 0),
  });

  return NextResponse.json(
    apiEnvelope(
      { system: { slug: system.slug, displayName: system.displayName }, summary, evidenceKind, ...result },
      {
        generatedOn: equipmentUsageMetadata.generatedOn,
        schemaVersion: equipmentCatalogApiSchemaVersion,
        source: equipmentUsageMetadata.sourcePolicy.authority,
        total: result.total,
      },
    ),
    { headers: publicDataCacheHeaders },
  );
}

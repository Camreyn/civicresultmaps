import { NextResponse } from "next/server";

import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { equipmentCatalogApiSchemaVersion } from "@/lib/api-version";
import { equipmentCatalogMetadata } from "@/lib/equipment-catalog";
import {
  buildEquipmentComparison,
  normalizeEquipmentComparisonSlugs,
  validateEquipmentComparisonSlugs,
} from "@/lib/equipment-comparison";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";

export function GET(request: Request) {
  if (!isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady })) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_catalog_disabled", message: "The equipment catalog is not enabled." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const parameters = new URL(request.url).searchParams;
  const slugs = normalizeEquipmentComparisonSlugs(parameters.getAll("slugs"));
  const validation = validateEquipmentComparisonSlugs(slugs);
  if (!validation.valid) {
    return NextResponse.json(
      apiErrorEnvelope({ code: validation.code, message: validation.message }),
      { headers: publicApiErrorHeaders, status: 400 },
    );
  }

  const systems = buildEquipmentComparison(validation.slugs);
  return NextResponse.json(
    apiEnvelope(
      { systems },
      {
        catalogChannel: equipmentCatalogMetadata.channel,
        catalogStatus: equipmentCatalogMetadata.status,
        generatedOn: equipmentCatalogMetadata.generatedOn,
        schemaVersion: equipmentCatalogApiSchemaVersion,
        source: "CivicResultMaps reviewed equipment catalog",
        total: systems.length,
      },
    ),
    { headers: publicDataCacheHeaders },
  );
}

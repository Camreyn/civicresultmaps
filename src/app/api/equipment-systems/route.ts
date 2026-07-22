import { NextResponse } from "next/server";

import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { equipmentCatalogApiSchemaVersion } from "@/lib/api-version";
import { equipmentCatalogMetadata, listEquipmentSystems } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";

export function GET() {
  if (!isEquipmentExplorerEnabled({ productionReady: equipmentCatalogMetadata.productionReady })) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_catalog_disabled", message: "The equipment catalog pilot is not enabled." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const systems = listEquipmentSystems();
  return NextResponse.json(
    apiEnvelope(systems, {
      catalogStatus: equipmentCatalogMetadata.status,
      generatedOn: equipmentCatalogMetadata.generatedOn,
      schemaVersion: equipmentCatalogApiSchemaVersion,
      source: "CivicResultMaps reviewed equipment catalog",
      total: systems.length,
    }),
    { headers: publicDataCacheHeaders },
  );
}

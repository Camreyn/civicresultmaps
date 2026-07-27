import { NextResponse } from "next/server";

import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { equipmentCatalogApiSchemaVersion } from "@/lib/api-version";
import {
  equipmentCatalogMetadata,
  getEquipmentSystem,
  sourcesForEquipmentSystem,
} from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  if (!isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady })) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_catalog_disabled", message: "The equipment catalog pilot is not enabled." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const { slug } = await params;
  const system = getEquipmentSystem(slug);
  if (!system) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_system_not_found", message: "No reviewed equipment system matches this slug." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  return NextResponse.json(
    apiEnvelope(
      { system, sources: sourcesForEquipmentSystem(system) },
      {
        catalogChannel: equipmentCatalogMetadata.channel,
        catalogStatus: equipmentCatalogMetadata.status,
        generatedOn: equipmentCatalogMetadata.generatedOn,
        schemaVersion: equipmentCatalogApiSchemaVersion,
        source: "CivicResultMaps reviewed equipment catalog",
      },
    ),
    { headers: publicDataCacheHeaders },
  );
}

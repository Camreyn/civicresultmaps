import { NextResponse } from "next/server";

import { apiEnvelope, apiErrorEnvelope, publicApiErrorHeaders, publicDataCacheHeaders } from "@/lib/api";
import { equipmentCatalogApiSchemaVersion } from "@/lib/api-version";
import {
  equipmentCatalogMetadata,
  getEquipmentSystem,
} from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  equipmentUsageMetadata,
  getEquipmentUsageStateOverview,
} from "@/lib/equipment-usage";
import { stateNameForCode } from "@/lib/us-states";

type RouteContext = {
  params: Promise<{ state: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  if (!isEquipmentExplorerEnabled({ catalogChannel: equipmentCatalogMetadata.channel, productionReady: equipmentCatalogMetadata.productionReady })) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_catalog_disabled", message: "The equipment catalog is not enabled." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const { state } = await params;
  const stateCode = state.trim().toUpperCase();
  const overview = getEquipmentUsageStateOverview(stateCode);
  if (!overview) {
    return NextResponse.json(
      apiErrorEnvelope({ code: "equipment_state_not_found", message: "No indexed equipment observations match this state." }),
      { headers: publicApiErrorHeaders, status: 404 },
    );
  }

  const exactProductFamilySystems = overview.exactProductFamilySystems.flatMap((usage) => {
    const system = getEquipmentSystem(usage.slug);
    if (!system) return [];
    return [{
      usage,
      system: {
        slug: system.slug,
        displayName: system.displayName,
        manufacturer: system.manufacturer,
        deviceName: system.deviceName,
        deviceRole: system.deviceRole,
        systemName: system.systemName,
        systemVersion: system.systemVersion,
      },
    }];
  });

  return NextResponse.json(
    apiEnvelope(
      {
        state: { code: stateCode, name: stateNameForCode(stateCode) },
        totalObservations: overview.totalObservations,
        exactProductFamilySystems,
        manufacturerContexts: overview.manufacturerContexts,
        sourceIds: overview.sourceIds,
        caveat: overview.caveat,
      },
      {
        catalogChannel: equipmentCatalogMetadata.channel,
        generatedOn: equipmentUsageMetadata.generatedOn,
        schemaVersion: equipmentCatalogApiSchemaVersion,
        source: equipmentUsageMetadata.sourcePolicy.authority,
        total: overview.totalObservations,
      },
    ),
    { headers: publicDataCacheHeaders },
  );
}

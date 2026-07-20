import catalogData from "../../data/equipment-catalog.json";

export type EquipmentCatalog = typeof catalogData;
export type EquipmentSystem = EquipmentCatalog["systems"][number];
export type EquipmentComponent = EquipmentSystem["components"][number];
export type EquipmentSource = EquipmentCatalog["sources"][number];
export type EquipmentScene = EquipmentSystem["scene"];
export type EquipmentSceneNode = EquipmentScene["nodes"][number];

export type EquipmentSystemSummary = Pick<
  EquipmentSystem,
  | "certification"
  | "claimRevision"
  | "coverage"
  | "deviceName"
  | "deviceRole"
  | "displayName"
  | "editorialState"
  | "manufacturer"
  | "slug"
  | "status"
  | "summary"
  | "systemName"
  | "systemVersion"
>;

export const equipmentCatalogMetadata = {
  editorialState: catalogData.editorialState,
  generatedOn: catalogData.generatedOn,
  productionRequirement: catalogData.productionRequirement,
  productionReady:
    catalogData.systems.length > 0
    && catalogData.systems.every((system) => system.editorialState === catalogData.productionRequirement),
  methodology: catalogData.methodology,
  schemaVersion: catalogData.schemaVersion,
  status: catalogData.status,
};

export function listEquipmentSystems(): EquipmentSystemSummary[] {
  return catalogData.systems.map((system) => ({
    certification: system.certification,
    claimRevision: system.claimRevision,
    coverage: system.coverage,
    deviceName: system.deviceName,
    deviceRole: system.deviceRole,
    displayName: system.displayName,
    editorialState: system.editorialState,
    manufacturer: system.manufacturer,
    slug: system.slug,
    status: system.status,
    summary: system.summary,
    systemName: system.systemName,
    systemVersion: system.systemVersion,
  }));
}

export function listEquipmentSystemSlugs() {
  return catalogData.systems.map((system) => system.slug);
}

export function getEquipmentSystem(slug: string): EquipmentSystem | null {
  return catalogData.systems.find((system) => system.slug === slug) ?? null;
}

export function sourcesForEquipmentSystem(system: EquipmentSystem): EquipmentSource[] {
  const sourceIds = new Set<string>(system.sourceIds);
  return catalogData.sources.filter((source) => sourceIds.has(source.id));
}

export function sourcesForEquipmentRecord(
  sourceIds: readonly string[],
  sources: readonly EquipmentSource[],
) {
  const requested = new Set<string>(sourceIds);
  return sources.filter((source) => requested.has(source.id));
}

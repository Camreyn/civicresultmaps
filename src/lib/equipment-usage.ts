import usageData from "../../data/equipment-usage-index.json";

export type EquipmentUsageEvidenceKind = "device_family" | "manufacturer_context";

export type EquipmentUsageMapReference = {
  scope: "jurisdiction" | "state" | "unavailable";
  href: string | null;
  label: string | null;
  caveat: string | null;
};

export type EquipmentUsageSystemTarget = {
  kind: "equipment_system";
  slug: string;
};

export type EquipmentUsageManufacturerTarget = {
  kind: "manufacturer";
  id: string;
  displayName: string;
};

export type EquipmentUsageRelationTarget =
  | EquipmentUsageSystemTarget
  | EquipmentUsageManufacturerTarget;

export type EquipmentUsageRelation = {
  id: string;
  evidenceKind: EquipmentUsageEvidenceKind;
  target: EquipmentUsageRelationTarget;
  matchReason: string;
};

type EquipmentUsageStoredRecord = {
  id: string;
  relations: EquipmentUsageRelation[];
  state: string;
  electionYear: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  jurisdictionLevel: string;
  jurisdictionTag: string | null;
  vendor: string;
  systemName: string;
  equipmentType: string;
  sourceId: string;
  map: EquipmentUsageMapReference;
};

export type EquipmentUsageRecord = Omit<EquipmentUsageStoredRecord, "relations"> & {
  slug: string;
  evidenceKind: EquipmentUsageEvidenceKind;
  matchReason: string;
  relation: EquipmentUsageRelation;
  relationScope: "exact_product_family" | "manufacturer_context";
  relationTarget: EquipmentUsageRelationTarget;
  requestedDossierContext: {
    slug: string;
    relationship: "same_manufacturer_not_exact_deployment";
  } | null;
};

export type EquipmentUsageSource = {
  id: string;
  state: string;
  electionYear: number;
  authority: string;
  sourceUrl: string;
  apiUrl: string | null;
  localArtifact: string;
  reportingLevel: string;
  caveat: string;
};

export type EquipmentUsageSummary = {
  slug: string;
  manufacturerId: string;
  totalRecords: number;
  totalStates: number;
  deviceFamilyRecords: number;
  deviceFamilyStates: number;
  manufacturerContextRecords: number;
  manufacturerContextStates: number;
  jurisdictionMapLinks: number;
  stateMapLinks: number;
  unavailableMapLinks: number;
};

export type EquipmentUsageStateSystemSummary = {
  slug: string;
  state: string;
  totalRecords: number;
  deviceFamilyRecords: number;
  manufacturerContextRecords: 0;
  sourceIds: string[];
  reportedSystemNames: string[];
  reportedVendors: string[];
};

export type EquipmentUsageManufacturerContextSummary = {
  manufacturer: EquipmentUsageManufacturerTarget;
  state: string;
  totalRecords: number;
  sourceIds: string[];
  reportedSystemNames: string[];
  reportedVendors: string[];
  relatedDossierSlugs: string[];
  caveat: string;
};

export type EquipmentUsageStateOverview = {
  state: string;
  exactProductFamilySystems: EquipmentUsageStateSystemSummary[];
  manufacturerContexts: EquipmentUsageManufacturerContextSummary[];
  totalObservations: number;
  sourceIds: string[];
  caveat: string;
};

type EquipmentUsageIndex = {
  schemaVersion: number;
  generatedOn: string;
  description: string;
  sourcePolicy: { authority: string; caveat: string };
  coverage: {
    registryStateOrDistrictCount: number;
    loadedPackageCount: number;
    missingPackageCount: number;
    normalizedRowCount: number;
    indexedObservationCount: number;
    indexedRecordCount: number;
    indexedRelationCount: number;
    exactSystemRelationCount: number;
    manufacturerRelationCount: number;
    dossierCount: number;
    manufacturerCount: number;
  };
  manufacturers: Array<{ id: string; displayName: string }>;
  systems: Array<{ slug: string; manufacturerId: string }>;
  summaries: EquipmentUsageSummary[];
  sources: EquipmentUsageSource[];
  records: EquipmentUsageStoredRecord[];
};

const index = usageData as unknown as EquipmentUsageIndex;
const sourceById = new Map(index.sources.map((source) => [source.id, source]));
const manufacturerById = new Map(index.manufacturers.map((manufacturer) => [manufacturer.id, manufacturer]));
const manufacturerIdBySlug = new Map(index.systems.map((system) => [system.slug, system.manufacturerId]));

function publicRecord(
  storedRecord: EquipmentUsageStoredRecord,
  relation: EquipmentUsageRelation,
  requestedSlug: string,
): EquipmentUsageRecord {
  const { relations: _relations, ...record } = storedRecord;
  const manufacturerContext = relation.target.kind === "manufacturer";
  return {
    ...record,
    id: `${storedRecord.id}:${relation.id}`,
    slug: requestedSlug,
    evidenceKind: relation.evidenceKind,
    matchReason: relation.matchReason,
    relation,
    relationScope: manufacturerContext ? "manufacturer_context" : "exact_product_family",
    relationTarget: relation.target,
    requestedDossierContext: manufacturerContext
      ? { slug: requestedSlug, relationship: "same_manufacturer_not_exact_deployment" }
      : null,
  };
}

function recordsForSlug(slug: string): EquipmentUsageRecord[] {
  const manufacturerId = manufacturerIdBySlug.get(slug);
  if (!manufacturerId) return [];

  return index.records.flatMap((storedRecord) => storedRecord.relations
    .filter((relation) => (
      relation.target.kind === "equipment_system"
        ? relation.target.slug === slug
        : relation.target.id === manufacturerId
    ))
    .map((relation) => publicRecord(storedRecord, relation, slug)));
}

export const equipmentUsageMetadata = {
  coverage: index.coverage,
  description: index.description,
  generatedOn: index.generatedOn,
  schemaVersion: index.schemaVersion,
  sourcePolicy: index.sourcePolicy,
};

export function getEquipmentUsageSummary(slug: string) {
  return index.summaries.find((summary) => summary.slug === slug) ?? null;
}

export function listEquipmentUsageSummaries() {
  return [...index.summaries];
}

export function getEquipmentUsageManufacturer(manufacturerId: string) {
  return manufacturerById.get(manufacturerId) ?? null;
}

export function listEquipmentUsageManufacturers() {
  return [...index.manufacturers];
}

export function defaultEquipmentUsageEvidence(summary: EquipmentUsageSummary): EquipmentUsageEvidenceKind {
  return summary.deviceFamilyRecords > 0 ? "device_family" : "manufacturer_context";
}

export function listEquipmentUsageStates(slug: string, evidenceKind?: EquipmentUsageEvidenceKind) {
  return [...new Set(recordsForSlug(slug)
    .filter((record) => !evidenceKind || record.evidenceKind === evidenceKind)
    .map((record) => record.state))]
    .sort();
}

export function listEquipmentUsageStateCodes() {
  return [...new Set(index.records
    .filter((record) => record.relations.length > 0)
    .map((record) => record.state))]
    .sort();
}

export function getEquipmentUsageStateOverview(state: string): EquipmentUsageStateOverview | null {
  const normalizedState = state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedState)) return null;

  type MutableSystem = Omit<
    EquipmentUsageStateSystemSummary,
    "sourceIds" | "reportedSystemNames" | "reportedVendors"
  > & {
    sourceIds: Set<string>;
    reportedSystemNames: Set<string>;
    reportedVendors: Set<string>;
  };
  type MutableManufacturer = Omit<
    EquipmentUsageManufacturerContextSummary,
    "sourceIds" | "reportedSystemNames" | "reportedVendors" | "relatedDossierSlugs"
  > & {
    sourceIds: Set<string>;
    reportedSystemNames: Set<string>;
    reportedVendors: Set<string>;
    relatedDossierSlugs: Set<string>;
  };

  const systems = new Map<string, MutableSystem>();
  const manufacturers = new Map<string, MutableManufacturer>();
  const sourceIds = new Set<string>();
  const observationIds = new Set<string>();

  for (const record of index.records) {
    if (record.state !== normalizedState) continue;
    observationIds.add(record.id);
    sourceIds.add(record.sourceId);

    for (const relation of record.relations) {
      if (relation.target.kind === "equipment_system") {
        const summary = systems.get(relation.target.slug) ?? {
          slug: relation.target.slug,
          state: normalizedState,
          totalRecords: 0,
          deviceFamilyRecords: 0,
          manufacturerContextRecords: 0 as const,
          sourceIds: new Set<string>(),
          reportedSystemNames: new Set<string>(),
          reportedVendors: new Set<string>(),
        };
        summary.totalRecords += 1;
        summary.deviceFamilyRecords += 1;
        summary.sourceIds.add(record.sourceId);
        if (record.systemName.trim()) summary.reportedSystemNames.add(record.systemName.trim());
        if (record.vendor.trim()) summary.reportedVendors.add(record.vendor.trim());
        systems.set(relation.target.slug, summary);
        continue;
      }

      const manufacturerTarget = relation.target;
      const summary = manufacturers.get(manufacturerTarget.id) ?? {
        manufacturer: manufacturerTarget,
        state: normalizedState,
        totalRecords: 0,
        sourceIds: new Set<string>(),
        reportedSystemNames: new Set<string>(),
        reportedVendors: new Set<string>(),
        relatedDossierSlugs: new Set(
          index.systems
            .filter((system) => system.manufacturerId === manufacturerTarget.id)
            .map((system) => system.slug),
        ),
        caveat:
          "The source rows name this manufacturer but do not identify any related dossier model or configuration as deployed.",
      };
      summary.totalRecords += 1;
      summary.sourceIds.add(record.sourceId);
      if (record.systemName.trim()) summary.reportedSystemNames.add(record.systemName.trim());
      if (record.vendor.trim()) summary.reportedVendors.add(record.vendor.trim());
      manufacturers.set(manufacturerTarget.id, summary);
    }
  }

  if (observationIds.size === 0) return null;

  const exactProductFamilySystems = [...systems.values()]
    .map((summary) => ({
      ...summary,
      sourceIds: [...summary.sourceIds].sort(),
      reportedSystemNames: [...summary.reportedSystemNames].sort(),
      reportedVendors: [...summary.reportedVendors].sort(),
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const manufacturerContexts = [...manufacturers.values()]
    .map((summary) => ({
      ...summary,
      sourceIds: [...summary.sourceIds].sort(),
      reportedSystemNames: [...summary.reportedSystemNames].sort(),
      reportedVendors: [...summary.reportedVendors].sort(),
      relatedDossierSlugs: [...summary.relatedDossierSlugs].sort(),
    }))
    .sort((left, right) => left.manufacturer.displayName.localeCompare(right.manufacturer.displayName));

  return {
    state: normalizedState,
    exactProductFamilySystems,
    manufacturerContexts,
    totalObservations: observationIds.size,
    sourceIds: [...sourceIds].sort(),
    caveat: index.sourcePolicy.caveat,
  };
}

export function getEquipmentUsageStateSummary(state: string): EquipmentUsageStateSystemSummary[] {
  return getEquipmentUsageStateOverview(state)?.exactProductFamilySystems ?? [];
}

export function getEquipmentUsageSource(sourceId: string) {
  return sourceById.get(sourceId) ?? null;
}

export function queryEquipmentUsage({
  slug,
  evidenceKind,
  state,
  query,
  limit = 20,
  offset = 0,
}: {
  slug: string;
  evidenceKind?: EquipmentUsageEvidenceKind;
  state?: string;
  query?: string;
  limit?: number;
  offset?: number;
}) {
  const normalizedState = state?.trim().toUpperCase();
  const normalizedQuery = query?.trim().toLocaleLowerCase();
  const selected = recordsForSlug(slug).filter((record) => {
    if (evidenceKind && record.evidenceKind !== evidenceKind) return false;
    if (normalizedState && record.state !== normalizedState) return false;
    if (!normalizedQuery) return true;
    return [record.jurisdictionName, record.state, record.vendor, record.systemName, record.equipmentType]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 20));
  const safeOffset = Math.max(0, Math.trunc(offset) || 0);
  const records = selected.slice(safeOffset, safeOffset + safeLimit);
  const sources = [...new Set(records.map((record) => record.sourceId))]
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is EquipmentUsageSource => Boolean(source));

  return { records, sources, total: selected.length, limit: safeLimit, offset: safeOffset };
}

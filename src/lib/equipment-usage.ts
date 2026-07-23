import usageData from "../../data/equipment-usage-index.json";

export type EquipmentUsageEvidenceKind = "device_family" | "manufacturer_context";

export type EquipmentUsageMapReference = {
  scope: "jurisdiction" | "state" | "unavailable";
  href: string | null;
  label: string | null;
  caveat: string | null;
};

type EquipmentUsageStoredMatch = {
  slug: string;
  evidenceKind: EquipmentUsageEvidenceKind;
  matchReason: string;
};

type EquipmentUsageStoredRecord = {
  id: string;
  matches: EquipmentUsageStoredMatch[];
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

export type EquipmentUsageRecord = Omit<EquipmentUsageStoredRecord, "matches"> & EquipmentUsageStoredMatch;

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
  manufacturerContextRecords: number;
  sourceIds: string[];
  reportedSystemNames: string[];
  reportedVendors: string[];
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
    dossierCount: number;
  };
  summaries: EquipmentUsageSummary[];
  sources: EquipmentUsageSource[];
  records: EquipmentUsageStoredRecord[];
};

const index = usageData as unknown as EquipmentUsageIndex;
const sourceById = new Map(index.sources.map((source) => [source.id, source]));

function recordsForSlug(slug: string): EquipmentUsageRecord[] {
  return index.records.flatMap((storedRecord) => {
    const { matches, ...record } = storedRecord;
    return matches
      .filter((match) => match.slug === slug)
      .map((match) => ({ ...record, ...match, id: `${storedRecord.id}:${slug}` }));
  });
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
    .filter((record) => record.matches.length > 0)
    .map((record) => record.state))]
    .sort();
}

export function getEquipmentUsageStateSummary(state: string): EquipmentUsageStateSystemSummary[] {
  const normalizedState = state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedState)) return [];

  type MutableSummary = Omit<
    EquipmentUsageStateSystemSummary,
    "sourceIds" | "reportedSystemNames" | "reportedVendors"
  > & {
    sourceIds: Set<string>;
    reportedSystemNames: Set<string>;
    reportedVendors: Set<string>;
  };

  const summaries = new Map<string, MutableSummary>();
  for (const record of index.records) {
    if (record.state !== normalizedState) continue;
    for (const match of record.matches) {
      const summary = summaries.get(match.slug) ?? {
        slug: match.slug,
        state: normalizedState,
        totalRecords: 0,
        deviceFamilyRecords: 0,
        manufacturerContextRecords: 0,
        sourceIds: new Set<string>(),
        reportedSystemNames: new Set<string>(),
        reportedVendors: new Set<string>(),
      };
      summary.totalRecords += 1;
      if (match.evidenceKind === "device_family") summary.deviceFamilyRecords += 1;
      else summary.manufacturerContextRecords += 1;
      summary.sourceIds.add(record.sourceId);
      if (record.systemName.trim()) summary.reportedSystemNames.add(record.systemName.trim());
      if (record.vendor.trim()) summary.reportedVendors.add(record.vendor.trim());
      summaries.set(match.slug, summary);
    }
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      sourceIds: [...summary.sourceIds].sort(),
      reportedSystemNames: [...summary.reportedSystemNames].sort(),
      reportedVendors: [...summary.reportedVendors].sort(),
    }))
    .sort((left, right) => {
      const evidenceDifference = Number(right.deviceFamilyRecords > 0) - Number(left.deviceFamilyRecords > 0);
      return evidenceDifference || left.slug.localeCompare(right.slug);
    });
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

import type { AnalysisIndicator, EquipmentClusterDiagnostic, EquipmentRowSummary } from "./types";

function uniqueJurisdictionKey(row: Pick<EquipmentRowSummary, "jurisdictionCode" | "jurisdictionName">) {
  return row.jurisdictionCode || row.jurisdictionName.toUpperCase();
}

export function equipmentClusterDiagnostics(input: {
  equipmentRows: EquipmentRowSummary[];
  indicators: AnalysisIndicator[];
}): EquipmentClusterDiagnostic[] {
  if (!input.equipmentRows.length) {
    return [];
  }

  const flagged = new Set(input.indicators.map((indicator) => indicator.jurisdictionCode));
  const allJurisdictions = new Set(input.equipmentRows.map(uniqueJurisdictionKey));
  const statewideFlagRate = allJurisdictions.size > 0 ? flagged.size / allJurisdictions.size : 0;
  const groups = new Map<
    string,
    {
      equipmentType: string;
      jurisdictionCodes: Set<string>;
      systemName: string;
      usage: string;
      vendor: string;
    }
  >();

  for (const row of input.equipmentRows) {
    const key = [
      row.usage || "context",
      row.vendor || "Not recorded",
      row.systemName || "Not recorded",
      row.equipmentType || "Not recorded",
    ].join("|");
    const group =
      groups.get(key) ??
      {
        equipmentType: row.equipmentType || "Not recorded",
        jurisdictionCodes: new Set<string>(),
        systemName: row.systemName || "Not recorded",
        usage: row.usage || "context",
        vendor: row.vendor || "Not recorded",
      };
    group.jurisdictionCodes.add(uniqueJurisdictionKey(row));
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([groupKey, group]) => {
      const flaggedJurisdictions = Array.from(group.jurisdictionCodes).filter((code) => flagged.has(code)).length;
      const jurisdictionCount = group.jurisdictionCodes.size;
      const groupFlagRate = jurisdictionCount > 0 ? flaggedJurisdictions / jurisdictionCount : 0;
      const lift = statewideFlagRate > 0 ? groupFlagRate / statewideFlagRate : null;
      const status = flagged.size === 0 ? "limited" : jurisdictionCount < 3 ? "limited" : "ready";

      return {
        caveat:
          "Equipment clustering is context only. County-level equipment rows cannot prove or disprove tampering, and flags can cluster for demographic, geographic, contest, or reporting reasons.",
        flaggedJurisdictions,
        groupKey,
        jurisdictionCount,
        lift,
        statewideFlagRate,
        status,
        summary:
          flaggedJurisdictions === 0
            ? "No currently flagged jurisdictions are in this equipment group."
            : `${flaggedJurisdictions} of ${jurisdictionCount} jurisdiction${jurisdictionCount === 1 ? "" : "s"} in this equipment group currently have advisory flags.`,
        vendor: group.vendor,
        systemName: group.systemName,
        equipmentType: group.equipmentType,
        usage: group.usage,
      } satisfies EquipmentClusterDiagnostic;
    })
    .filter((diagnostic) => diagnostic.jurisdictionCount > 0)
    .sort(
      (a, b) =>
        b.flaggedJurisdictions - a.flaggedJurisdictions ||
        (b.lift ?? 0) - (a.lift ?? 0) ||
        b.jurisdictionCount - a.jurisdictionCount,
    );
}

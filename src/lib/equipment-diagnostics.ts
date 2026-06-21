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
  const minimumUsefulJurisdictions = 5;
  const controls = [
    "same selected state",
    "same imported jurisdiction level",
    "current advisory flag set only",
    "vendor/system grouping from Verified Voting Verifier fields",
  ];
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
      const status = flagged.size === 0 ? "limited" : jurisdictionCount < minimumUsefulJurisdictions ? "limited" : "ready";
      const rateLabel = `${(groupFlagRate * 100).toFixed(1)}%`;

      return {
        caveat:
          "Equipment clustering is context only. County-level equipment rows cannot prove or disprove tampering, and flags can cluster for demographic, geographic, contest, reporting-unit, or source-coverage reasons.",
        controls,
        flaggedJurisdictions,
        flaggedRate: groupFlagRate,
        groupKey,
        jurisdictionCount,
        lift,
        minimumUsefulJurisdictions,
        statewideFlagRate,
        status,
        summary:
          flagged.size === 0
            ? "No advisory flags are currently loaded for this state, so this is a coverage summary rather than a cluster check."
            : jurisdictionCount < minimumUsefulJurisdictions
              ? `${flaggedJurisdictions} of ${jurisdictionCount} jurisdictions in this small equipment group currently have advisory flags (${rateLabel}); treat this as too small for pattern claims.`
              : flaggedJurisdictions === 0
                ? "No currently flagged jurisdictions are in this equipment group."
                : `${flaggedJurisdictions} of ${jurisdictionCount} jurisdictions in this equipment group currently have advisory flags (${rateLabel}). Compare against geography, demographics, contest coverage, and source coverage before interpreting.`,
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

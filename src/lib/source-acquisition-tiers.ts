import sourceAcquisitionTiers from "../../data/source-acquisition-tiers.json";

export type SourceAcquisitionTierPackage = typeof sourceAcquisitionTiers;
export type SourceAcquisitionTierDefinition = SourceAcquisitionTierPackage["tierDefinitions"][number];
export type SourceAcquisitionTierRow = SourceAcquisitionTierPackage["states"][number];
export type SourceAcquisitionTierValue = SourceAcquisitionTierDefinition["tier"];

type SourceAcquisitionTierFilters = {
  state?: string;
  tier?: SourceAcquisitionTierValue;
};

const tierDefinitionByValue = new Map(sourceAcquisitionTiers.tierDefinitions.map((definition) => [definition.tier, definition]));

export function getSourceAcquisitionTierDefinition(tier: string) {
  return tierDefinitionByValue.get(tier);
}

export function sourceAcquisitionTierLabel(tier: string) {
  return getSourceAcquisitionTierDefinition(tier)?.label ?? tier.replaceAll("_", " ");
}

export function sourceAcquisitionTierRoiRank(tier: string) {
  return getSourceAcquisitionTierDefinition(tier)?.roiRank ?? 99;
}

export function sourceAcquisitionTierClass(tier: string) {
  return tier.replaceAll("_", "-");
}

export function getSourceAcquisitionRows(state: string) {
  const requestedState = state.toUpperCase();
  return sourceAcquisitionTiers.states
    .filter((entry) => entry.state === requestedState)
    .sort((a, b) => sourceAcquisitionTierRoiRank(a.tier) - sourceAcquisitionTierRoiRank(b.tier) || a.jurisdictionName.localeCompare(b.jurisdictionName));
}

export function listSourceAcquisitionTiers(input: SourceAcquisitionTierFilters = {}) {
  const requestedState = input.state?.toUpperCase();
  const states = sourceAcquisitionTiers.states
    .filter((entry) => !requestedState || entry.state === requestedState)
    .filter((entry) => !input.tier || entry.tier === input.tier)
    .sort((a, b) => sourceAcquisitionTierRoiRank(a.tier) - sourceAcquisitionTierRoiRank(b.tier) || a.state.localeCompare(b.state) || a.jurisdictionName.localeCompare(b.jurisdictionName));

  return {
    checkedAt: sourceAcquisitionTiers.checkedAt,
    description: sourceAcquisitionTiers.description,
    states,
    summary: {
      byConfidence: summarizeBy(states, "confidence"),
      byScope: summarizeBy(states, "scope"),
      byTier: summarizeBy(states, "tier"),
      highRoiRows: states.filter((entry) => sourceAcquisitionTierRoiRank(entry.tier) <= 2).length,
      humanSetupRows: states.filter((entry) => {
        const rank = sourceAcquisitionTierRoiRank(entry.tier);
        return rank >= 5 && rank < 99;
      }).length,
      localRows: states.filter((entry) => entry.scope !== "statewide").length,
      total: states.length,
      unknownRows: states.filter((entry) => entry.tier === "unknown").length,
    },
    tierDefinitions: sourceAcquisitionTiers.tierDefinitions,
  };
}

function summarizeBy<Key extends keyof SourceAcquisitionTierRow>(rows: SourceAcquisitionTierRow[], key: Key) {
  return rows.reduce<Record<string, number>>((summary, row) => {
    const value = String(row[key]);
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
}

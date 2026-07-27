import {
  getEquipmentSystem,
  listEquipmentSystems,
  type EquipmentSystem,
} from "./equipment-catalog";
import {
  getEquipmentUsageStateOverview,
  listEquipmentUsageStateCodes,
  type EquipmentUsageManufacturerContextSummary,
  type EquipmentUsageStateSystemSummary,
} from "./equipment-usage";
import { stateNameForCode } from "./us-states";

export const equipmentSocialCardVersion = "equipment-v3";

export type EquipmentNetworkPreviewStatus = "documented" | "optional" | "reviewed_without_attachment";

export type EquipmentNetworkQuickFact = {
  status: EquipmentNetworkPreviewStatus;
  label: string;
  shortLabel: string;
  detail: string;
  caveat: string;
  sourceIds: string[];
};

type EquipmentNetworkQuickFactDefinition = Omit<EquipmentNetworkQuickFact, "sourceIds">;

const networkQuickFacts: Record<string, EquipmentNetworkQuickFactDefinition> = {
  "clear-ballot-clearvote-25-clearaccess": {
    status: "reviewed_without_attachment",
    label: "No network attachment in the reviewed station configuration",
    shortLabel: "Local peripherals only",
    detail:
      "The reviewed station uses local peripherals. Clear Ballot's published policy says its certified products are not attached to modems, the Internet, Wi-Fi, or Bluetooth.",
    caveat:
      "This describes the reviewed certified configuration and manufacturer policy, not an inspection of a fielded unit.",
  },
  "clear-ballot-clearvote-25-clearcount": {
    status: "documented",
    label: "Closed wired Ethernet system documented",
    shortLabel: "Closed wired LAN",
    detail:
      "The certified configuration links CountServer, ScanStations, and CountStations through an approved Ethernet-switch alternative on a closed, isolated network.",
    caveat:
      "The certification record does not establish a jurisdiction's live cabling, switch settings, or current installation.",
  },
  "dominion-democracy-suite-517-imagecast-central": {
    status: "optional",
    label: "Optional isolated-LAN infrastructure documented",
    shortLabel: "Optional isolated LAN",
    detail:
      "The scanner attaches locally to its workstation by USB. Reviewed state documentation makes the workstation's closed data-center Ethernet path conditional.",
    caveat:
      "The optional infrastructure is part of the reviewed documentation; a jurisdiction connection or field network state is not established.",
  },
  "dominion-democracy-suite-517-imagecast-x": {
    status: "documented",
    label: "Built-in Ethernet capability documented",
    shortLabel: "Ethernet interface",
    detail:
      "The certified hardware profile includes a physical 10/100 RJ-45 interface, while the evaluated system used no public network or wireless technology.",
    caveat:
      "A physical interface is not evidence that an external peer was connected, enabled, or used in a jurisdiction.",
  },
  "ess-evs-6400-ds200": {
    status: "optional",
    label: "Optional cellular modem hardware documented historically",
    shortLabel: "Optional cellular modem",
    detail:
      "Historical federal and state records identify optional MultiTech cellular-modem alternatives for the DS200 hardware family.",
    caveat:
      "Those records do not establish inclusion in EVS 6.4.0.0 certification, modem firmware, activation, or use in a particular fielded unit.",
  },
  "ess-evs-6400-ds950": {
    status: "documented",
    label: "Closed-LAN result path documented in testing",
    shortLabel: "Closed-LAN test path",
    detail:
      "The EVS 6.4.0.0 Pro V&V report documents DS950 result transmission to the EMS through a closed local area network during accuracy testing.",
    caveat:
      "A laboratory test path does not establish a jurisdiction's switch, connection, settings, or field use.",
  },
};

export type EquipmentMachineSocialPreview = {
  kind: "machine";
  slug: string;
  title: string;
  description: string;
  displayName: string;
  deviceName: string;
  deviceRole: string;
  manufacturer: string;
  systemName: string;
  systemVersion: string;
  certificationId: string;
  certifiedOn: string;
  componentCount: number;
  changeRecordCount: number;
  sourceCount: number;
  referenceImage: EquipmentSystem["scene"]["referenceImages"][number] | null;
  network: EquipmentNetworkQuickFact;
};

export type EquipmentStateSocialPreviewSystem = EquipmentMachineSocialPreview & {
  usage: EquipmentUsageStateSystemSummary;
  evidenceLabel: string;
  evidenceShortLabel: "Named product family";
  detailHref: string;
};

export type EquipmentStateSocialPreviewManufacturerContext = EquipmentUsageManufacturerContextSummary;

export type EquipmentStateSocialPreview = {
  kind: "state";
  stateCode: string;
  stateName: string;
  title: string;
  description: string;
  systems: EquipmentStateSocialPreviewSystem[];
  manufacturerContexts: EquipmentStateSocialPreviewManufacturerContext[];
  namedFamilySystemCount: number;
  manufacturerContextCount: number;
  observationCount: number;
  sourceCount: number;
  caveat: string;
};

function uniqueNetworkSourceIds(system: EquipmentSystem) {
  return [...new Set(system.networkEvidence.configurations.flatMap((configuration) => configuration.sourceIds))];
}

export function getEquipmentNetworkQuickFact(slug: string): EquipmentNetworkQuickFact | null {
  const system = getEquipmentSystem(slug);
  const definition = networkQuickFacts[slug];
  if (!system || !definition) return null;
  return { ...definition, sourceIds: uniqueNetworkSourceIds(system) };
}

function machineDescription(system: EquipmentSystem, network: EquipmentNetworkQuickFact) {
  return [
    `${system.deviceName}: ${system.deviceRole}.`,
    `${network.label}.`,
    `${system.coverage.componentCount} sourced components and ${system.coverage.sourceCount} archived sources in the reviewed ${system.systemName} ${system.systemVersion} dossier.`,
  ].join(" ");
}

function buildMachinePreview(system: EquipmentSystem): EquipmentMachineSocialPreview {
  const network = getEquipmentNetworkQuickFact(system.slug);
  if (!network) {
    throw new Error(`Missing reviewed social-preview network fact for ${system.slug}`);
  }

  return {
    kind: "machine",
    slug: system.slug,
    title: `${system.displayName} equipment dossier`,
    description: machineDescription(system, network),
    displayName: system.displayName,
    deviceName: system.deviceName,
    deviceRole: system.deviceRole,
    manufacturer: system.manufacturer,
    systemName: system.systemName,
    systemVersion: system.systemVersion,
    certificationId: system.certification.certificationId,
    certifiedOn: system.certification.certifiedOn,
    componentCount: system.coverage.componentCount,
    changeRecordCount: system.coverage.configurationChangeCount,
    sourceCount: system.coverage.sourceCount,
    referenceImage: system.scene.referenceImages[0] ?? null,
    network,
  };
}

export function buildEquipmentMachineSocialPreview(slug: string): EquipmentMachineSocialPreview | null {
  const system = getEquipmentSystem(slug);
  return system ? buildMachinePreview(system) : null;
}

export function buildEquipmentStateSocialPreview(state: string): EquipmentStateSocialPreview | null {
  const stateCode = state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) return null;

  const overview = getEquipmentUsageStateOverview(stateCode);
  if (!overview) return null;

  const systems = overview.exactProductFamilySystems.flatMap((usage) => {
    const system = getEquipmentSystem(usage.slug);
    if (!system) return [];
    return [{
      ...buildMachinePreview(system),
      usage,
      evidenceLabel: `${usage.deviceFamilyRecords.toLocaleString("en-US")} named product-family ${usage.deviceFamilyRecords === 1 ? "record" : "records"}`,
      evidenceShortLabel: "Named product family" as const,
      detailHref: `/equipment/${system.slug}/usage?usageEvidence=device_family&usageState=${stateCode}#equipment-usage`,
    }];
  });
  const manufacturerContexts = overview.manufacturerContexts;
  const stateName = stateNameForCode(stateCode);
  const sourceCount = overview.sourceIds.length;
  const evidenceSummary = [
    systems.length
      ? `${systems.length} named product-family ${systems.length === 1 ? "match" : "matches"}`
      : "no exact dossier matches",
    manufacturerContexts.length
      ? `${manufacturerContexts.length} manufacturer-context ${manufacturerContexts.length === 1 ? "group" : "groups"}`
      : "no manufacturer-only context",
  ].join(" and ");

  return {
    kind: "state",
    stateCode,
    stateName,
    title: `${stateName} tracked election equipment`,
    description:
      `2024 source records for ${stateName} contain ${evidenceSummary}. Vendor-only rows are grouped by manufacturer and are not counted as dossier usage.`,
    systems,
    manufacturerContexts,
    namedFamilySystemCount: systems.length,
    manufacturerContextCount: manufacturerContexts.length,
    observationCount: overview.totalObservations,
    sourceCount,
    caveat:
      "State records identify a product family or manufacturer at the reported grain. Vendor-only context does not establish a related dossier model, and dossier network capability does not establish a state or local connection, configuration, activation, or use.",
  };
}

export function buildEquipmentIndexSocialPreview() {
  const systems = listEquipmentSystems().map((summary) => {
    const system = getEquipmentSystem(summary.slug);
    if (!system) throw new Error(`Missing equipment system ${summary.slug}`);
    return buildMachinePreview(system);
  });
  const documentedCount = systems.filter((system) => system.network.status === "documented").length;
  const optionalCount = systems.filter((system) => system.network.status === "optional").length;

  return {
    title: "U.S. Election Equipment Explorer",
    description:
      `${systems.length} source-linked equipment dossiers with certified-configuration facts, components, change records, and documented or optional network capability.`,
    systems,
    documentedCount,
    optionalCount,
  };
}

export function listTrackedEquipmentStates() {
  return listEquipmentUsageStateCodes()
    .map((stateCode) => ({ stateCode, stateName: stateNameForCode(stateCode) }))
    .sort((left, right) => left.stateName.localeCompare(right.stateName));
}

export function equipmentSocialCardPath(input: { slug?: string; state?: string } = {}) {
  const parameters = new URLSearchParams({ v: equipmentSocialCardVersion });
  if (input.slug) parameters.set("slug", input.slug);
  if (input.state) parameters.set("state", input.state.toUpperCase());
  return `/api/equipment-social-card?${parameters.toString()}`;
}

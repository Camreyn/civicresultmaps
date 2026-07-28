import catalogData from "@equipment-catalog-data";

import type { EquipmentCatalogChannel } from "./equipment-catalog-channel";

export type EquipmentCatalog = typeof catalogData;
type EquipmentCatalogSystem = EquipmentCatalog["systems"][number];
type EquipmentCatalogNetworkEvidence = EquipmentCatalogSystem["networkEvidence"];
type EquipmentCatalogNetworkConfiguration =
  EquipmentCatalogNetworkEvidence["configurations"][number];

export type EquipmentNetworkExternalPathway = {
  status: string;
  internetReachability: string;
  focusConnectionStatus: string;
  summary: string;
  originNodeIds: readonly string[];
  externalTransportNodeIds: readonly string[];
  boundaryNodeIds: readonly string[];
  receivingNodeIds: readonly string[];
  linkIds: readonly string[];
  caveat: string;
  sourceIds: readonly string[];
  sourceRevisionIds: readonly string[];
};

export type EquipmentNetworkConfiguration =
  Omit<EquipmentCatalogNetworkConfiguration, "externalPathway"> & {
    externalPathway: EquipmentNetworkExternalPathway;
  };
export type EquipmentNetworkEvidence =
  Omit<EquipmentCatalogNetworkEvidence, "configurations"> & {
    configurations: EquipmentNetworkConfiguration[];
  };
export type EquipmentSystem = Omit<EquipmentCatalogSystem, "networkEvidence"> & {
  networkEvidence: EquipmentNetworkEvidence;
};
export type EquipmentComponent = EquipmentSystem["components"][number];
export type EquipmentSource = EquipmentCatalog["sources"][number];
export type EquipmentScene = EquipmentSystem["scene"];
export type EquipmentSceneNode = EquipmentScene["nodes"][number];
export type EquipmentReferenceImage = EquipmentScene["referenceImages"][number];
export type EquipmentNetworkNode = EquipmentNetworkConfiguration["nodes"][number];
export type EquipmentNetworkLink = EquipmentNetworkConfiguration["links"][number];
export type EquipmentNetworkSourceImage = EquipmentNetworkEvidence["sourceImages"][number];

export type EquipmentEvidenceImage = {
  id: string;
  alt: string;
  assetUrl: string;
  assetSha256: string;
  width: number;
  height: number;
  kind: string;
  caption: string;
  pageOrSection: string;
  derivativeNote: string;
  caveat: string;
  sourceIds: readonly string[];
  sourceRevisionIds: readonly string[];
};

export type EquipmentSecuritySourceReview = {
  id: string;
  catalog: string;
  queryTerms: string[];
  resultStatus:
    | "applicable_product_matches_found"
    | "no_applicable_product_matches"
    | "no_catalog_matches"
    | "no_exact_product_matches";
  exactMatchCount: number;
  sourceIds: string[];
  sourceRevisionIds: string[];
  caveat: string;
};

export type EquipmentSecurityVulnerability = {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  cvssScore: number | null;
  cvssVersion: string | null;
  cisaKev: boolean;
  affectedFirmware: string[];
  fixedFirmware: string[];
  sourceIds: string[];
  sourceRevisionIds: string[];
  caveat: string;
};

export type EquipmentNonCveAdvisory = {
  id: string;
  kind: string;
  title: string;
  publishedOn: string | null;
  cvssScore: null;
  cisaKev: false;
  securitySeverity: null;
  operationalImpact: string;
  affectedFirmware: string | null;
  fixedFirmware: string | null;
  description: string;
  sourceIds: string[];
  sourceRevisionIds: string[];
  caveat: string;
};

export type EquipmentSecurityReview = {
  reviewedOn: string;
  productIdentityStatus:
    | "component_identity_unresolved"
    | "exact_model_historical_scope"
    | "exact_model_family_historical_scope";
  firmwareStatus: "not_publicly_established" | "documented" | "certified" | "fielded";
  firmwareVersion: string | null;
  overallStatus:
    | "exact_product_review_not_possible"
    | "no_exact_product_matches_found"
    | "applicable_vulnerabilities_found";
  coverageDefinition: string;
  rankingMethod: string;
  sourcesReviewed: EquipmentSecuritySourceReview[];
  vulnerabilities: EquipmentSecurityVulnerability[];
  nonCveAdvisories: EquipmentNonCveAdvisory[];
  caveat: string;
};

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

export type EquipmentSystemTile = EquipmentSystemSummary & {
  referenceImage: EquipmentReferenceImage | null;
  referenceSources: EquipmentSource[];
};

export const equipmentCatalogMetadata = {
  channel: catalogData.catalogChannel as EquipmentCatalogChannel,
  editorialState: catalogData.editorialState,
  generatedOn: catalogData.generatedOn,
  productionRequirement: catalogData.productionRequirement,
  productionReady:
    catalogData.catalogChannel === "public"
    && catalogData.systems.length > 0
    && catalogData.systems.every((system) => system.editorialState === catalogData.productionRequirement)
    && catalogData.releaseIds.length > 0,
  releaseIds: catalogData.releaseIds,
  methodology: catalogData.methodology,
  schemaVersion: catalogData.schemaVersion,
  status: catalogData.status,
};

function summarizeEquipmentSystem(system: EquipmentSystem): EquipmentSystemSummary {
  return {
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
  };
}

export function listEquipmentSystems(): EquipmentSystemSummary[] {
  return catalogData.systems.map(summarizeEquipmentSystem);
}

export function listEquipmentSystemTiles(): EquipmentSystemTile[] {
  return catalogData.systems.map((system) => {
    const referenceImage = system.scene.referenceImages[0] ?? null;
    const referenceSourceIds = new Set<string>(referenceImage?.sourceIds ?? []);

    return {
      ...summarizeEquipmentSystem(system),
      referenceImage,
      referenceSources: catalogData.sources.filter((source) => referenceSourceIds.has(source.id)),
    };
  });
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

export function securityReviewForEquipmentComponent(
  component: EquipmentComponent,
): EquipmentSecurityReview | null {
  return component.securityReview as EquipmentSecurityReview | null;
}

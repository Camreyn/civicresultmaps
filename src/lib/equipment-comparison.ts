import {
  getEquipmentSystem,
  listEquipmentSystemSlugs,
} from "./equipment-catalog";
import { getEquipmentNetworkQuickFact } from "./equipment-social-preview";
import { getEquipmentUsageSummary } from "./equipment-usage";

export type EquipmentComparisonValidation =
  | { valid: true; slugs: string[] }
  | { valid: false; code: "invalid_equipment_comparison"; message: string };

export function normalizeEquipmentComparisonSlugs(values: string | string[] | undefined) {
  const inputs = Array.isArray(values) ? values : values ? [values] : [];
  return inputs
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateEquipmentComparisonSlugs(slugs: string[]): EquipmentComparisonValidation {
  if (slugs.length < 2 || slugs.length > 3) {
    return {
      valid: false,
      code: "invalid_equipment_comparison",
      message: "Choose two or three equipment dossiers to compare.",
    };
  }
  if (new Set(slugs).size !== slugs.length) {
    return {
      valid: false,
      code: "invalid_equipment_comparison",
      message: "Each comparison slot must use a different equipment dossier.",
    };
  }
  const knownSlugs = new Set(listEquipmentSystemSlugs());
  const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
  if (unknown.length > 0) {
    return {
      valid: false,
      code: "invalid_equipment_comparison",
      message: `Unknown reviewed equipment dossier: ${unknown.join(", ")}.`,
    };
  }
  return { valid: true, slugs };
}

export function buildEquipmentComparison(slugs: string[]) {
  return slugs.map((slug) => {
    const system = getEquipmentSystem(slug);
    const network = getEquipmentNetworkQuickFact(slug);
    const usage = getEquipmentUsageSummary(slug);
    if (!system || !network || !usage) {
      throw new Error(`Unable to assemble reviewed comparison data for ${slug}.`);
    }

    return {
      slug: system.slug,
      displayName: system.displayName,
      deviceName: system.deviceName,
      deviceRole: system.deviceRole,
      manufacturer: system.manufacturer,
      summary: system.summary,
      systemName: system.systemName,
      systemVersion: system.systemVersion,
      certification: system.certification,
      components: {
        count: system.components.length,
        categories: [...new Set(system.components.map((component) => component.category))].sort(),
        names: system.components.map((component) => component.name),
        technicalSpecificationCount: system.coverage.technicalSpecificationCount,
        unknownTechnicalSpecificationCount: system.coverage.unknownTechnicalSpecificationCount,
      },
      network: {
        quickFact: network,
        configurationCount: system.networkEvidence.configurations.length,
        topologyKinds: [...new Set(system.networkEvidence.configurations.map((configuration) => configuration.topologyKind))].sort(),
        evidenceGapCount: system.networkEvidence.gaps.length,
        caveat: system.networkEvidence.publicationBoundary,
      },
      history: {
        versionObservationCount: system.versionObservations.length,
        configurationChangeCount: system.configurationChanges.length,
        changes: system.configurationChanges.map((change) => ({
          id: change.id,
          changeId: change.changeId,
          description: change.description,
          eacApprovedOn: change.eacApprovedOn,
          fieldDeploymentStatus: change.fieldDeploymentStatus,
          caveat: change.caveat,
        })),
        findingCount: system.findings.length,
        findingTypes: [...new Set(system.findings.map((finding) => finding.findingType))].sort(),
        deploymentObservationCount: system.deployments.length,
      },
      usage: {
        exactProductFamilyRecords: usage.deviceFamilyRecords,
        exactProductFamilyStates: usage.deviceFamilyStates,
        manufacturerContextRecords: usage.manufacturerContextRecords,
        manufacturerContextStates: usage.manufacturerContextStates,
        manufacturerId: usage.manufacturerId,
      },
      sources: {
        count: system.coverage.sourceCount,
        caveat: "Source counts describe the reviewed dossier package; a larger count does not imply broader field adoption.",
      },
    };
  });
}

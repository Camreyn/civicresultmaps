import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sourcePackagePath = "data/equipment-source-packages.json";
const claimDirectory = "data/equipment-claims";
const outputPaths = {
  public: "data/equipment-catalog.public.json",
  staging: "data/equipment-catalog.staging.json",
};

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function securityReviewRecords(component) {
  const review = component.securityReview;
  if (!review) return [];
  return [
    ...(review.sourcesReviewed ?? []),
    ...(review.vulnerabilities ?? []),
    ...(review.nonCveAdvisories ?? []),
  ];
}

function collectSourceIds(system) {
  return unique([
    ...(system.certification?.sourceIds ?? []),
    ...(system.components ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.components ?? []).flatMap((record) =>
      (record.technicalSpecifications ?? []).flatMap((specification) => specification.sourceIds ?? [])),
    ...(system.components ?? []).flatMap((record) =>
      securityReviewRecords(record).flatMap((securityRecord) => securityRecord.sourceIds ?? [])),
    ...(system.versionObservations ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.configurationChanges ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.findings ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.power ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.deployments ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) =>
      record.externalPathway?.sourceIds ?? []),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) =>
      (record.nodes ?? []).flatMap((node) => node.sourceIds ?? [])),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) =>
      (record.links ?? []).flatMap((link) => link.sourceIds ?? [])),
    ...(system.networkEvidence?.sourceImages ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.networkEvidence?.gaps ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.scene?.referenceSourceIds ?? []),
    ...(system.scene?.referenceImages ?? []).flatMap((record) => record.sourceIds ?? []),
  ]);
}

function collectSourceRevisionIds(system) {
  return unique([
    ...(system.certification?.sourceRevisionIds ?? []),
    ...(system.components ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.components ?? []).flatMap((record) =>
      (record.technicalSpecifications ?? []).flatMap((specification) => specification.sourceRevisionIds ?? [])),
    ...(system.components ?? []).flatMap((record) =>
      securityReviewRecords(record).flatMap((securityRecord) => securityRecord.sourceRevisionIds ?? [])),
    ...(system.versionObservations ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.configurationChanges ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.findings ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.power ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.deployments ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) =>
      record.externalPathway?.sourceRevisionIds ?? []),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) =>
      (record.nodes ?? []).flatMap((node) => node.sourceRevisionIds ?? [])),
    ...(system.networkEvidence?.configurations ?? []).flatMap((record) =>
      (record.links ?? []).flatMap((link) => link.sourceRevisionIds ?? [])),
    ...(system.networkEvidence?.sourceImages ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.networkEvidence?.gaps ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.scene?.referenceSourceRevisionIds ?? []),
    ...(system.scene?.referenceImages ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
  ]);
}

function withCoverage(system, editorial) {
  const normalizedSystem = {
    ...system,
    components: system.components.map((component) => ({
      ...component,
      securityReview: component.securityReview ?? null,
      technicalSpecifications: component.technicalSpecifications ?? [],
    })),
  };
  const technicalSpecifications = normalizedSystem.components.flatMap(
    (component) => component.technicalSpecifications,
  );
  const sourceIds = collectSourceIds(normalizedSystem);
  const sourceRevisionIds = collectSourceRevisionIds(normalizedSystem);
  const securityReviews = normalizedSystem.components
    .map((component) => component.securityReview)
    .filter(Boolean);
  const vulnerabilities = securityReviews.flatMap((review) => review.vulnerabilities ?? []);
  const nonCveAdvisories = securityReviews.flatMap((review) => review.nonCveAdvisories ?? []);
  return {
    ...normalizedSystem,
    claimRevision: editorial.revision,
    editorialState: editorial.state,
    sourceIds,
    sourceRevisionIds,
    coverage: {
      componentCount: normalizedSystem.components.length,
      sourcedComponentCount: normalizedSystem.components.filter((component) => component.sourceIds.length > 0).length,
      technicalSpecificationCount: technicalSpecifications.length,
      establishedTechnicalSpecificationCount: technicalSpecifications.filter(
        (record) => record.knowledgeStatus !== "not_publicly_established",
      ).length,
      unknownTechnicalSpecificationCount: technicalSpecifications.filter(
        (record) => record.knowledgeStatus === "not_publicly_established",
      ).length,
      configurationChangeCount: normalizedSystem.configurationChanges.length,
      deploymentObservationCount: normalizedSystem.deployments.length,
      findingCount: normalizedSystem.findings.length,
      powerRecordCount: normalizedSystem.power.length,
      confirmedPowerRecordCount: normalizedSystem.power.filter(
        (record) => ["confirmed", "documented_partial"].includes(record.knowledgeStatus),
      ).length,
      sourceCount: sourceIds.length,
      sourceRevisionCount: sourceRevisionIds.length,
      componentSecurityReviewCount: securityReviews.length,
      exactApplicableVulnerabilityCount: vulnerabilities.length,
      nonCveAdvisoryCount: nonCveAdvisories.length,
      networkConfigurationCount: normalizedSystem.networkEvidence.configurations.length,
      networkSourceImageCount: normalizedSystem.networkEvidence.sourceImages.length,
      fieldObservedNetworkConfigurationCount: normalizedSystem.networkEvidence.configurations.filter(
        (record) => record.evidenceLayer === "observed",
      ).length,
    },
  };
}

function catalogSourceIds(sourcePackage, systems) {
  return new Set([
    ...(sourcePackage.methodology?.changeControlSourceIds ?? []),
    ...systems.flatMap((system) => system.sourceIds),
  ]);
}

export function createEquipmentCatalog({ channel, claims, sourcePackage }) {
  if (!Object.hasOwn(outputPaths, channel)) throw new Error(`Unsupported equipment catalog channel: ${channel}`);

  const eligibleStates = channel === "public" ? ["published"] : ["approved", "published"];
  const eligibleClaims = claims.filter((claim) => eligibleStates.includes(claim.editorial?.state));
  const systems = eligibleClaims
    .map((claim) => withCoverage(claim.system, claim.editorial))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const includedSourceIds = catalogSourceIds(sourcePackage, systems);
  const releaseIds = unique(
    eligibleClaims
      .filter((claim) => claim.editorial?.state === "published")
      .map((claim) => claim.editorial?.publicationId),
  );

  return {
    schemaVersion: 2,
    catalogChannel: channel,
    generatedOn: [sourcePackage.reviewedOn, ...eligibleClaims.map((claim) => claim.reviewedOn)]
      .filter(Boolean)
      .sort()
      .at(-1),
    status: channel === "public" ? "published_catalog" : "reviewed_pilot",
    editorialState: channel === "public" ? "public_release" : "staging_review",
    productionRequirement: sourcePackage.editorialPolicy.publicProductionState,
    releaseIds,
    methodology: sourcePackage.methodology,
    sources: sourcePackage.sources
      .filter((source) => includedSourceIds.has(source.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
    systems,
  };
}

export async function createEquipmentCatalogs() {
  const sourcePackage = JSON.parse(await readFile(sourcePackagePath, "utf8"));
  const claimFiles = (await readdir(claimDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const claims = await Promise.all(
    claimFiles.map(async (name) => JSON.parse(await readFile(`${claimDirectory}/${name}`, "utf8"))),
  );

  return {
    public: createEquipmentCatalog({ channel: "public", claims, sourcePackage }),
    staging: createEquipmentCatalog({ channel: "staging", claims, sourcePackage }),
  };
}

async function writeOrCheckCatalogs() {
  const catalogs = await createEquipmentCatalogs();
  const checkOnly = process.argv.includes("--check");
  const stalePaths = [];

  for (const [channel, outputPath] of Object.entries(outputPaths)) {
    const catalog = catalogs[channel];
    const output = `${JSON.stringify(catalog, null, 2)}\n`;
    if (checkOnly) {
      const current = await readFile(outputPath, "utf8").catch(() => "");
      if (current.replace(/\r\n?/g, "\n") !== output) stalePaths.push(outputPath);
      continue;
    }

    await writeFile(outputPath, output, "utf8");
    console.log(
      `Wrote ${catalog.systems.length} ${channel} system ${catalog.systems.length === 1 ? "dossier" : "dossiers"} to ${outputPath}.`,
    );
  }

  if (stalePaths.length > 0) {
    throw new Error(`${stalePaths.join(", ")} ${stalePaths.length === 1 ? "is" : "are"} stale. Run npm run equipment:catalog:build.`);
  }
  if (checkOnly) console.log("Public and staging equipment catalogs are current.");
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) await writeOrCheckCatalogs();

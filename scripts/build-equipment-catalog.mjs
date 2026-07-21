import { readdir, readFile, writeFile } from "node:fs/promises";

const sourcePackagePath = "data/equipment-source-packages.json";
const claimDirectory = "data/equipment-claims";
const outputPath = "data/equipment-catalog.json";

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
    },
  };
}

export async function buildEquipmentCatalog() {
  const sourcePackage = JSON.parse(await readFile(sourcePackagePath, "utf8"));
  const claimFiles = (await readdir(claimDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const claims = await Promise.all(
    claimFiles.map(async (name) => JSON.parse(await readFile(`${claimDirectory}/${name}`, "utf8"))),
  );
  const eligibleClaims = claims.filter((claim) => ["approved", "published"].includes(claim.editorial?.state));
  const systems = eligibleClaims
    .map((claim) => withCoverage(claim.system, claim.editorial))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    schemaVersion: 2,
    generatedOn: [sourcePackage.reviewedOn, ...claims.map((claim) => claim.reviewedOn)].sort().at(-1),
    status: "reviewed_pilot",
    editorialState: "staging_review",
    productionRequirement: sourcePackage.editorialPolicy.publicProductionState,
    methodology: sourcePackage.methodology,
    sources: [...sourcePackage.sources].sort((left, right) => left.id.localeCompare(right.id)),
    systems,
  };
}

const catalog = await buildEquipmentCatalog();
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${catalog.systems.length} system ${catalog.systems.length === 1 ? "dossier" : "dossiers"} to ${outputPath}.`);

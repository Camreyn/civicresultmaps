import { readdir, readFile, writeFile } from "node:fs/promises";

const sourcePackagePath = "data/equipment-source-packages.json";
const claimDirectory = "data/equipment-claims";
const outputPath = "data/equipment-catalog.json";

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function collectSourceIds(system) {
  return unique([
    ...(system.certification?.sourceIds ?? []),
    ...(system.components ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.versionObservations ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.configurationChanges ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.findings ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.power ?? []).flatMap((record) => record.sourceIds ?? []),
    ...(system.deployments ?? []).flatMap((record) => record.sourceIds ?? []),
  ]);
}

function collectSourceRevisionIds(system) {
  return unique([
    ...(system.certification?.sourceRevisionIds ?? []),
    ...(system.components ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.versionObservations ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.configurationChanges ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.findings ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.power ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
    ...(system.deployments ?? []).flatMap((record) => record.sourceRevisionIds ?? []),
  ]);
}

function withCoverage(system, editorial) {
  const sourceIds = collectSourceIds(system);
  const sourceRevisionIds = collectSourceRevisionIds(system);
  return {
    ...system,
    claimRevision: editorial.revision,
    editorialState: editorial.state,
    sourceIds,
    sourceRevisionIds,
    coverage: {
      componentCount: system.components.length,
      sourcedComponentCount: system.components.filter((component) => component.sourceIds.length > 0).length,
      configurationChangeCount: system.configurationChanges.length,
      deploymentObservationCount: system.deployments.length,
      findingCount: system.findings.length,
      powerRecordCount: system.power.length,
      confirmedPowerRecordCount: system.power.filter((record) => record.knowledgeStatus === "confirmed").length,
      sourceCount: sourceIds.length,
      sourceRevisionCount: sourceRevisionIds.length,
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

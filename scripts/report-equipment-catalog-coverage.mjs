import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("data/equipment-catalog.json", "utf8"));

console.log(
  `Catalog: ${catalog.systems.length} dossiers, editorial ${catalog.editorialState}, production requires ${catalog.productionRequirement}`,
);
for (const system of catalog.systems) {
  const unknownComponents = system.components.filter((component) => component.evidenceStatus === "not_publicly_confirmed");
  const unmodeledKnownComponents = system.components.filter(
    (component) => component.evidenceStatus !== "not_publicly_confirmed" && component.sceneNodeName === null,
  );
  const unknownDeployments = system.deployments.filter((deployment) => deployment.componentsConfirmed.length === 0);
  console.log(system.displayName);
  console.log(`  Editorial: ${system.editorialState} claim revision ${system.claimRevision}`);
  console.log(`  Components: ${system.coverage.sourcedComponentCount}/${system.coverage.componentCount} source-linked`);
  console.log(`  Configuration changes: ${system.coverage.configurationChangeCount}`);
  console.log(`  Findings/listing statuses: ${system.coverage.findingCount}`);
  console.log(`  Sources/revisions: ${system.coverage.sourceCount}/${system.coverage.sourceRevisionCount}`);
  console.log(`  Deployment observations: ${system.coverage.deploymentObservationCount} (${unknownDeployments.length} without component confirmation)`);
  console.log(`  Confirmed power records: ${system.coverage.confirmedPowerRecordCount}/${system.coverage.powerRecordCount}`);
  console.log(`  Explicit evidence gaps: ${unknownComponents.map((component) => component.name).join(", ") || "none"}`);
  console.log(`  Known but not placed in 3D: ${unmodeledKnownComponents.map((component) => component.name).join(", ") || "none"}`);
}

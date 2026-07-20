import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [catalog, sourcePackage, claim, apiList, apiDetail, openApi, indexPage, detailPage, explorer, scene, workspace] = await Promise.all([
  readFile("data/equipment-catalog.json", "utf8").then(JSON.parse),
  readFile("data/equipment-source-packages.json", "utf8").then(JSON.parse),
  readFile("data/equipment-claims/ess-evs-6400-ds200.json", "utf8").then(JSON.parse),
  readFile("src/app/api/equipment-systems/route.ts", "utf8"),
  readFile("src/app/api/equipment-systems/[slug]/route.ts", "utf8"),
  readFile("src/lib/openapi.ts", "utf8"),
  readFile("src/app/equipment/page.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/page.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/equipment-explorer.client.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/equipment-orthographic-scene.tsx", "utf8"),
  readFile("src/app/workspace-tabs.tsx", "utf8"),
]);

assert.equal(catalog.schemaVersion, 2);
assert.equal(catalog.status, "reviewed_pilot");
assert.equal(catalog.editorialState, "staging_review");
assert.equal(catalog.productionRequirement, "published");
assert.equal(sourcePackage.schemaVersion, 2);
assert.equal(claim.schemaVersion, 2);
assert.equal(claim.editorial.state, "approved");
assert.equal(catalog.systems.length, 3);
assert.equal(sourcePackage.sources.length, 44);
assert.equal(claim.system.slug, "ess-evs-6400-ds200");

const sourceIds = new Set(sourcePackage.sources.map((source) => source.id));
assert.equal(sourceIds.size, sourcePackage.sources.length, "source IDs must be unique");
for (const source of sourcePackage.sources) {
  assert.match(source.url, /^https:\/\//);
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(source.localArtifact.startsWith("data/equipment-sources/"));
  assert.ok(source.caveat.length > 20);
  assert.equal(source.canonicalUrl, source.url);
  assert.ok(source.currentReviewedRevisionId);
  assert.ok(source.latestRetrievedRevisionId);
  assert.ok(source.revisions.some((revision) => revision.id === source.currentReviewedRevisionId));
}

const system = catalog.systems.find((entry) => entry.slug === "ess-evs-6400-ds200");
assert.ok(system, "DS200 pilot must remain in the generated catalog");
assert.equal(system.coverage.componentCount, 9);
assert.equal(system.coverage.sourcedComponentCount, 9);
assert.equal(system.coverage.configurationChangeCount, 6);
assert.equal(system.coverage.deploymentObservationCount, 4);
assert.equal(system.coverage.confirmedPowerRecordCount, 1);
assert.equal(system.coverage.technicalSpecificationCount, 7);
assert.equal(system.coverage.unknownTechnicalSpecificationCount, 3);
assert.match(system.certification.caveat, /certified configuration/i);
assert.equal(system.editorialState, "approved");
assert.ok(system.sourceRevisionIds.length > 0);
assert.equal(system.coverage.sourceRevisionCount, system.sourceRevisionIds.length);

const components = new Map(system.components.map((component) => [component.id, component]));
assert.equal(components.size, system.components.length);
for (const component of system.components) {
  assert.ok(component.sourceIds.length > 0, `${component.id} must be source-linked`);
  assert.ok(component.sourceRevisionIds.length > 0, `${component.id} must pin immutable source revisions`);
  for (const sourceId of component.sourceIds) assert.ok(sourceIds.has(sourceId));
  assert.ok(component.caveat.length > 20);
  for (const specification of component.technicalSpecifications) {
    assert.ok(specification.sourceIds.length > 0, `${specification.id} must be source-linked`);
    assert.ok(specification.sourceRevisionIds.length > 0, `${specification.id} must pin source revisions`);
    assert.ok(specification.caveat.length > 20);
    if (specification.knowledgeStatus === "not_publicly_established") {
      assert.equal(specification.value, null, `${specification.id} must preserve its unknown value`);
    } else {
      assert.ok(specification.value.length > 0);
    }
  }
}

const power = system.power[0];
assert.equal(power.knowledgeStatus, "documented_partial");
assert.equal(power.supplyType, "battery backup");
for (const field of ["manufacturer", "model", "capacity", "runtime"]) {
  assert.equal(power[field], null, `unresolved power field ${field} must stay null`);
}
assert.match(power.caveat, /must not be expanded/i);

for (const deployment of system.deployments) {
  assert.equal(deployment.scopeKind, "jurisdiction_deployment_observation");
  assert.deepEqual(deployment.componentsConfirmed, []);
  assert.match(deployment.caveat, /not DS200 use/i);
}

assert.deepEqual(
  system.configurationChanges.map((change) => change.changeId).sort(),
  ["ESS-1035", "ESS-1042", "ESS-1044", "ESS-1055", "ESS-1165", "ESS-983"],
);
for (const change of system.configurationChanges) {
  assert.equal(change.vstl, "Pro V&V, Inc.");
  assert.equal(change.fieldDeploymentStatus, "unknown");
  assert.ok(change.sourceIds.length >= 2);
}

assert.ok(system.findings.some((finding) => finding.publicStatus === "none_reported_in_test_campaign"));
assert.ok(system.findings.some((finding) => finding.publicStatus === "resolved_details_not_enumerated"));
assert.ok(system.findings.some((finding) => finding.publicStatus === "procedural_controls_recommended"));
assert.ok(system.findings.some((finding) => finding.publicStatus === "none_listed_on_selected_record"));
for (const finding of system.findings) {
  assert.match(finding.caveat, /(not a claim|do not infer|not evidence)/i);
}

const clearAccess = catalog.systems.find((entry) => entry.slug === "clear-ballot-clearvote-25-clearaccess");
assert.ok(clearAccess, "ClearAccess pilot must be in the generated catalog");
assert.equal(clearAccess.coverage.componentCount, 9);
assert.equal(clearAccess.coverage.sourcedComponentCount, 9);
assert.equal(clearAccess.coverage.configurationChangeCount, 3);
assert.equal(clearAccess.coverage.deploymentObservationCount, 0);
assert.equal(clearAccess.coverage.confirmedPowerRecordCount, 1);
assert.equal(clearAccess.coverage.technicalSpecificationCount, 8);
assert.equal(clearAccess.coverage.unknownTechnicalSpecificationCount, 2);
assert.equal(clearAccess.power[0].knowledgeStatus, "confirmed");
assert.match(clearAccess.power[0].model, /PR1500RT2U/);
assert.match(clearAccess.power[0].model, /SMT2200C/);
assert.equal(clearAccess.power[0].capacity, null);
assert.equal(clearAccess.power[0].runtime, null);
assert.ok(clearAccess.findings.some((finding) => finding.publicStatus === "resolved_in_clearaccess_2_5_6"));
assert.ok(clearAccess.findings.some((finding) => finding.publicStatus === "update_recorded_for_cve_2022_0778"));
assert.ok(clearAccess.findings.some((finding) => finding.publicStatus === "certified_after_documented_resolutions"));
assert.ok(clearAccess.findings.some((finding) => finding.publicStatus === "not_fielded_as_of_2024_08_02_test_plan"));

const imageCastX = catalog.systems.find((entry) => entry.slug === "dominion-democracy-suite-517-imagecast-x");
assert.ok(imageCastX, "ImageCast X pilot must be in the generated catalog");
assert.equal(imageCastX.coverage.componentCount, 12);
assert.equal(imageCastX.coverage.sourcedComponentCount, 12);
assert.equal(imageCastX.coverage.configurationChangeCount, 4);
assert.equal(imageCastX.coverage.deploymentObservationCount, 0);
assert.equal(imageCastX.coverage.confirmedPowerRecordCount, 2);
assert.equal(imageCastX.coverage.sourceCount, 10);
assert.equal(imageCastX.coverage.technicalSpecificationCount, 11);
const icxUps = imageCastX.power.find((record) => record.id === "icx-certified-ups-options");
assert.match(icxUps.model, /SMT-1500/);
assert.match(icxUps.model, /PR1500LCD-VTVM/);
assert.equal(icxUps.capacity, null);
assert.equal(icxUps.runtime, null);
assert.equal(
  imageCastX.components.find((component) => component.id === "icx-sid21-compute-board")
    ?.technicalSpecifications.find((record) => record.id === "icx-sid21-cpu")?.value,
  "Intel Atom Z3735F",
);
assert.equal(
  imageCastX.components.find((component) => component.id === "icx-sid21-io-panel")
    ?.technicalSpecifications.find((record) => record.id === "icx-sid21-usb")?.value,
  "4 × USB 2.0",
);
assert.equal(imageCastX.components.find((component) => component.id === "icx-prime-ssd")?.sceneNodeName, null);
assert.ok(imageCastX.findings.some((finding) => finding.publicStatus === "restart_procedure_documented"));
assert.ok(imageCastX.findings.some((finding) => finding.publicStatus === "documentation_and_ssd_firmware_update_path_recorded"));
assert.ok(imageCastX.findings.some((finding) => finding.publicStatus === "advisory_issued_review_guidance"));
assert.ok(imageCastX.findings.some((finding) => finding.publicStatus === "none_reported_in_test_campaign"));
assert.ok(imageCastX.versionObservations.some((observation) => observation.value === "5.17.17.1" && observation.assertionScope === "certified"));
assert.ok(imageCastX.versionObservations.some((observation) => observation.value === "5.17.13.1" && observation.assertionScope === "documented"));

const glb = await readFile("public/equipment/ess-evs-6400-ds200/orthographic-pilot.glb");
assert.equal(glb.readUInt32LE(0), 0x46546c67, "asset must use the glTF binary magic");
assert.equal(glb.readUInt32LE(4), 2, "asset must use glTF 2.0");
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name));
for (const mapping of system.scene.nodes) assert.ok(nodeNames.has(mapping.nodeName));
assert.equal(system.scene.geometryFidelity, "illustrative_not_to_scale");
assert.equal(system.scene.assetLicense, "Apache-2.0");
assert.ok(system.scene.referenceSourceIds.includes("ess-ds200-one-sheet"));
assert.match(system.scene.referenceNote, /internal board positions/i);

const clearAccessGlb = await readFile("public/equipment/clear-ballot-clearvote-25-clearaccess/orthographic-pilot.glb");
assert.equal(clearAccessGlb.readUInt32LE(0), 0x46546c67, "ClearAccess asset must use the glTF binary magic");
assert.equal(clearAccessGlb.readUInt32LE(4), 2, "ClearAccess asset must use glTF 2.0");
const clearAccessJsonLength = clearAccessGlb.readUInt32LE(12);
const clearAccessGltf = JSON.parse(clearAccessGlb.subarray(20, 20 + clearAccessJsonLength).toString("utf8").trimEnd());
const clearAccessNodeNames = new Set((clearAccessGltf.nodes ?? []).map((node) => node.name));
for (const mapping of clearAccess.scene.nodes) assert.ok(clearAccessNodeNames.has(mapping.nodeName));

const imageCastGlb = await readFile("public/equipment/dominion-democracy-suite-517-imagecast-x/orthographic-pilot.glb");
assert.equal(imageCastGlb.readUInt32LE(0), 0x46546c67, "ImageCast X asset must use the glTF binary magic");
assert.equal(imageCastGlb.readUInt32LE(4), 2, "ImageCast X asset must use glTF 2.0");
const imageCastJsonLength = imageCastGlb.readUInt32LE(12);
const imageCastGltf = JSON.parse(imageCastGlb.subarray(20, 20 + imageCastJsonLength).toString("utf8").trimEnd());
const imageCastNodeNames = new Set((imageCastGltf.nodes ?? []).map((node) => node.name));
for (const mapping of imageCastX.scene.nodes) assert.ok(imageCastNodeNames.has(mapping.nodeName));
assert.ok(!imageCastNodeNames.has("ICX_Prime_SSD"), "unsupported SSD geometry must remain absent");

assert.match(apiList, /listEquipmentSystems/);
assert.match(apiList, /equipment_catalog_disabled/);
assert.match(apiDetail, /sourcesForEquipmentSystem/);
assert.match(apiDetail, /equipment_system_not_found/);
assert.match(openApi, /\/api\/v1\/equipment-systems/);
assert.match(openApi, /EquipmentSystemDetailEnvelope/);
assert.match(openApi, /EquipmentSourceRevision/);
assert.match(openApi, /currentReviewedRevisionId/);
assert.match(indexPage, /export const dynamic = "force-dynamic"/);
assert.match(indexPage, /notFound\(\)/);
assert.match(indexPage, /Certified configuration/);
assert.match(detailPage, /export const dynamic = "force-dynamic"/);
assert.match(detailPage, /Do not collapse evidence scopes/);
assert.match(detailPage, /Archived source manifest/);
assert.match(detailPage, /system.deviceName/);
assert.match(detailPage, /deploymentSourceIds/);
assert.match(detailPage, /No reviewed deployment observation/);
assert.doesNotMatch(detailPage, /DS200 power \/ backup supply/);
assert.doesNotMatch(detailPage, /Washington system-level observations/);
assert.match(explorer, /dynamic\(/);
assert.match(explorer, /ssr: false/);
assert.match(explorer, /getContext\("webgl2"/);
assert.match(explorer, /aria-live="polite"/);
assert.match(explorer, /Explosion distance/);
assert.match(explorer, /technicalSpecifications/);
assert.match(scene, /frameloop="demand"/);
assert.match(scene, /orthographic/);
assert.match(scene, /webglcontextlost/);
assert.match(scene, /mappedEntryFor/);
assert.match(workspace, /equipmentExplorerEnabled &&/);
assert.match(workspace, /equipment-catalog-link/);
assert.match(workspace, /Component catalog/);

console.log("Equipment catalog contracts passed.");

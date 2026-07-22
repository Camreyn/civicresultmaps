import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  catalog,
  sourcePackage,
  claim,
  apiList,
  apiDetail,
  openApi,
  indexPage,
  detailPage,
  explorer,
  scene,
  gallery,
  lightbox,
  networkEvidence,
  workspace,
  vercelIgnore,
] = await Promise.all([
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
  readFile("src/app/equipment/[slug]/equipment-reference-gallery.client.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/equipment-reference-lightbox.client.tsx", "utf8"),
  readFile("src/app/equipment/[slug]/equipment-network-evidence.client.tsx", "utf8"),
  readFile("src/app/workspace-tabs.tsx", "utf8"),
  readFile(".vercelignore", "utf8"),
]);

assert.equal(catalog.schemaVersion, 2);
assert.equal(catalog.status, "reviewed_pilot");
assert.equal(catalog.editorialState, "staging_review");
assert.equal(catalog.productionRequirement, "published");
assert.equal(sourcePackage.schemaVersion, 2);
assert.equal(claim.schemaVersion, 2);
assert.equal(claim.editorial.state, "published");
assert.equal(claim.editorial.publicationId, "equipment-explorer-2026-07-22-r1");
assert.equal(claim.editorial.publishedOn, "2026-07-22");
assert.equal(catalog.systems.length, 6);
assert.equal(sourcePackage.sources.length, 68);
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
assert.equal(system.coverage.componentCount, 12);
assert.equal(system.coverage.sourcedComponentCount, 12);
assert.equal(system.coverage.configurationChangeCount, 6);
assert.equal(system.coverage.deploymentObservationCount, 4);
assert.equal(system.coverage.confirmedPowerRecordCount, 1);
assert.equal(system.coverage.technicalSpecificationCount, 13);
assert.equal(system.coverage.unknownTechnicalSpecificationCount, 3);
assert.equal(system.coverage.componentSecurityReviewCount, 3);
assert.equal(system.coverage.exactApplicableVulnerabilityCount, 0);
assert.equal(system.coverage.nonCveAdvisoryCount, 1);
assert.equal(system.coverage.sourceCount, 40);
assert.ok(sourceIds.has("eac-unity-3400-test-plan"));
assert.ok(sourceIds.has("mi-ess-voting-system-contract"));
const ds200NetworkConfigurationIds = new Set(system.networkEvidence.configurations.map((record) => record.id));
assert.ok(ds200NetworkConfigurationIds.has("ds200-unity-3400-landline-sftp-reference"));
assert.ok(ds200NetworkConfigurationIds.has("ds200-michigan-evs-5320-wireless-sftp-path"));
const ds200NetworkImageIds = new Set(system.networkEvidence.sourceImages.map((record) => record.id));
assert.ok(ds200NetworkImageIds.has("ds200-mi-wireless-results-network"));
assert.ok(ds200NetworkImageIds.has("ds200-multitech-developer-board-block-diagram"));
assert.match(system.certification.caveat, /certified configuration/i);
assert.equal(system.editorialState, "published");
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
  if (component.securityReview !== null) {
    assert.match(component.securityReview.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(component.securityReview.firmwareVersion, null);
    assert.equal(component.securityReview.firmwareStatus, "not_publicly_established");
    for (const reviewedSource of component.securityReview.sourcesReviewed) {
      assert.ok(reviewedSource.queryTerms.length > 0);
      assert.ok(reviewedSource.sourceIds.length > 0);
      assert.ok(reviewedSource.sourceRevisionIds.length > 0);
      assert.equal(reviewedSource.exactMatchCount, 0);
    }
  }
}

const ds200Modem = components.get("ds200-optional-cellular-modem");
assert.ok(ds200Modem, "DS200 optional cellular board must remain a distinct component");
assert.equal(ds200Modem.optionality, "optional");
assert.equal(ds200Modem.sceneNodeName, "Optional_Cellular_Modem");
assert.equal(ds200Modem.securityReview.overallStatus, "exact_product_review_not_possible");
const ds200Cellular = ds200Modem.technicalSpecifications
  .find((record) => record.id === "ds200-optional-cellular-capability");
assert.ok(ds200Cellular, "DS200 optional cellular capability must remain explicitly scoped");
assert.equal(ds200Cellular.assertionScope, "jurisdiction_deployment_observation");
assert.match(ds200Cellular.value, /optional|Rhode Island/i);
assert.ok(ds200Cellular.sourceIds.includes("ess-election-security-faqs"));
assert.ok(ds200Cellular.sourceIds.includes("ri-ds200-pollworker-manual-2021"));
assert.equal(
  components.get("ds200-scanner-tabulator").technicalSpecifications
    .some((record) => record.id === "ds200-cellular-jurisdiction-documented"),
  false,
  "optional cellular hardware must not be merged into the base scanner assembly",
);

const c2Modem = components.get("ds200-multitech-c2-modem");
assert.ok(c2Modem, "the historically approved C2 modem must be a separate component");
assert.deepEqual(c2Modem.modelNumbers, ["MTSMC-C2-N3-R.1"]);
assert.equal(c2Modem.optionality, "optional");
assert.equal(c2Modem.sceneNodeName, null);
assert.equal(c2Modem.securityReview.overallStatus, "no_exact_product_matches_found");
assert.equal(c2Modem.securityReview.vulnerabilities.length, 0);
assert.equal(c2Modem.securityReview.sourcesReviewed.length, 3);
assert.ok(c2Modem.sourceIds.includes("fl-evs-4500-v4-modem-report"));

const lteModem = components.get("ds200-multitech-lvw3-modem");
assert.ok(lteModem, "the historically tested LTE modem must be a separate component");
assert.deepEqual(lteModem.modelNumbers, ["MTSMC-LVW3"]);
assert.equal(lteModem.optionality, "optional");
assert.equal(lteModem.sceneNodeName, null);
assert.equal(lteModem.securityReview.overallStatus, "no_exact_product_matches_found");
assert.equal(lteModem.securityReview.vulnerabilities.length, 0);
assert.equal(lteModem.securityReview.nonCveAdvisories.length, 1);
assert.equal(lteModem.securityReview.nonCveAdvisories[0].cvssScore, null);
assert.equal(lteModem.securityReview.nonCveAdvisories[0].securitySeverity, null);
assert.ok(lteModem.sourceIds.includes("provv-evs-5341-modem-hardware-table"));
assert.ok(system.sourceIds.includes("nvd-modem-query-review"));
assert.ok(system.sourceIds.includes("cisa-kev-catalog"));

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
assert.equal(imageCastX.coverage.sourceCount, 12);
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

const clearCount = catalog.systems.find((entry) => entry.slug === "clear-ballot-clearvote-25-clearcount");
assert.ok(clearCount, "ClearCount must be a separate central-tabulation dossier");
assert.equal(clearCount.coverage.componentCount, 7);
assert.equal(clearCount.coverage.configurationChangeCount, 1);
assert.equal(clearCount.coverage.sourceCount, 7);
assert.ok(clearCount.components.some((component) => component.id === "clearcount-central-scanner"));
assert.ok(clearCount.components.some((component) => component.id === "clearcount-countserver"));
assert.ok(clearCount.components.some((component) => component.id === "clearcount-network-switch"));
assert.equal(clearCount.versionObservations[0].value, "ClearCount 2.5.8");

const imageCastCentral = catalog.systems.find((entry) => entry.slug === "dominion-democracy-suite-517-imagecast-central");
assert.ok(imageCastCentral, "ImageCast Central must be a separate central-tabulation dossier");
assert.equal(imageCastCentral.coverage.componentCount, 7);
assert.equal(imageCastCentral.coverage.sourceCount, 6);
const iccNetwork = imageCastCentral.components.find((component) => component.id === "icc-optional-isolated-lan");
assert.equal(iccNetwork.optionality, "optional");
assert.match(iccNetwork.technicalSpecifications[0].value, /100 Mbps/);
assert.equal(imageCastCentral.power[0].model, "SMC1500 Smart-UPS");
assert.match(imageCastCentral.power[0].runtime, /15 minutes/);
assert.ok(imageCastCentral.versionObservations.some((observation) => observation.value === "5.17.15.1"));
assert.ok(imageCastCentral.versionObservations.some((observation) => observation.value === "1.0.1074"));

const ds950 = catalog.systems.find((entry) => entry.slug === "ess-evs-6400-ds950");
assert.ok(ds950, "DS950 must be a separate central-tabulation dossier");
assert.equal(ds950.coverage.componentCount, 10);
assert.equal(ds950.coverage.configurationChangeCount, 2);
assert.equal(ds950.coverage.sourceCount, 5);
assert.ok(ds950.components.some((component) => component.id === "ds950-motherboard"));
assert.ok(ds950.components.some((component) => component.id === "ds950-m2-storage"));
assert.ok(ds950.components.some((component) => component.id === "ds950-smart-card-reader"));
assert.ok(ds950.configurationChanges.some((change) => change.changeId === "ECO 1151"));
assert.ok(ds950.versionObservations.some((observation) => observation.value === "4.3.0.0"));
assert.ok(ds950.versionObservations.some((observation) => observation.value === "C60_20221215_0300"));
assert.equal(ds950.power[0].model, "OR1500PFCLCD; CP1500PFCLCD");

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
assert.ok(system.scene.referenceSourceIds.includes("ess-election-security-faqs"));
assert.match(system.scene.referenceNote, /optional modem board/i);

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

for (const dossier of catalog.systems) {
  assert.equal(dossier.editorialState, "published", `${dossier.slug} must clear the production publication gate`);
  const dossierGlb = await readFile(`public${dossier.scene.assetUrl}`);
  assert.equal(dossierGlb.readUInt32LE(0), 0x46546c67, `${dossier.slug} must use the glTF binary magic`);
  assert.equal(dossierGlb.readUInt32LE(4), 2, `${dossier.slug} must use glTF 2.0`);
  const dossierJsonLength = dossierGlb.readUInt32LE(12);
  const dossierGltf = JSON.parse(dossierGlb.subarray(20, 20 + dossierJsonLength).toString("utf8").trimEnd());
  const dossierNodeNames = new Set((dossierGltf.nodes ?? []).map((node) => node.name));
  for (const mapping of dossier.scene.nodes) {
    assert.ok(dossierNodeNames.has(mapping.nodeName), `${dossier.slug} is missing ${mapping.nodeName}`);
  }
  assert.ok(dossier.scene.referenceImages.length > 0, `${dossier.slug} needs a sourced reference image`);
  assert.ok(dossier.networkEvidence.configurations.length > 0, `${dossier.slug} needs network configurations`);
  assert.ok(dossier.networkEvidence.sourceImages.length > 0, `${dossier.slug} needs network source images`);
  assert.equal(dossier.coverage.networkConfigurationCount, dossier.networkEvidence.configurations.length);
  assert.equal(dossier.coverage.networkSourceImageCount, dossier.networkEvidence.sourceImages.length);
  assert.equal(dossier.coverage.fieldObservedNetworkConfigurationCount, 0);
  assert.match(dossier.networkEvidence.publicationBoundary, /excludes|omits/i);
  for (const configuration of dossier.networkEvidence.configurations) {
    assert.ok(["expected", "documented", "observed"].includes(configuration.evidenceLayer));
    assert.ok(configuration.nodes.length > 0);
    assert.ok(configuration.sensitiveDetailsWithheld.length > 40);
    assert.ok(configuration.sourceIds.every((sourceId) => sourceIds.has(sourceId)));
    for (const link of configuration.links) {
      assert.ok(configuration.nodes.some((node) => node.id === link.from));
      assert.ok(configuration.nodes.some((node) => node.id === link.to));
    }
  }
  for (const sourceImage of dossier.networkEvidence.sourceImages) {
    assert.match(sourceImage.assetUrl, /^\/equipment\/.+\.png$/);
    assert.match(sourceImage.assetSha256, /^[a-f0-9]{64}$/);
    assert.ok(sourceImage.width > 0);
    assert.ok(sourceImage.height > 0);
    assert.ok(sourceImage.alt.length > 20);
    assert.ok(sourceImage.caption.length > 20);
    assert.ok(sourceImage.caveat.length > 20);
    assert.ok(sourceImage.derivativeNote.length > 20);
    assert.ok(sourceImage.sourceIds.every((sourceId) => sourceIds.has(sourceId)));
  }
  for (const referenceImage of dossier.scene.referenceImages) {
    assert.match(referenceImage.assetUrl, /^\/equipment\/.+\.png$/);
    assert.match(referenceImage.assetSha256, /^[a-f0-9]{64}$/);
    assert.ok(referenceImage.width > 0);
    assert.ok(referenceImage.height > 0);
    assert.ok(referenceImage.alt.length > 20);
    assert.ok(referenceImage.caption.length > 20);
    assert.ok(referenceImage.caveat.length > 20);
    assert.ok(referenceImage.derivativeNote.length > 20);
    for (const sourceId of referenceImage.sourceIds) {
      assert.ok(dossier.scene.referenceSourceIds.includes(sourceId));
      assert.ok(sourceIds.has(sourceId));
    }
  }
}

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
assert.match(indexPage, /listEquipmentSystemTiles/);
assert.match(indexPage, /data-equipment-preview="true"/);
assert.match(indexPage, /data-equipment-preview-source="true"/);
assert.match(detailPage, /export const dynamic = "force-dynamic"/);
assert.match(detailPage, /Do not collapse evidence scopes/);
assert.match(detailPage, /Archived source manifest/);
assert.match(detailPage, /system.deviceName/);
assert.match(detailPage, /deploymentSourceIds/);
assert.match(detailPage, /No reviewed deployment observation/);
assert.match(detailPage, /EquipmentNetworkEvidencePanel/);
assert.match(detailPage, /system\.networkEvidence/);
assert.doesNotMatch(detailPage, /DS200 power \/ backup supply/);
assert.doesNotMatch(detailPage, /Washington system-level observations/);
assert.match(explorer, /dynamic\(/);
assert.match(explorer, /ssr: false/);
assert.match(explorer, /getContext\("webgl2"/);
assert.match(explorer, /aria-live="polite"/);
assert.match(explorer, /Explosion distance/);
assert.match(explorer, /technicalSpecifications/);
assert.match(explorer, /issueCameraCommand/);
assert.match(explorer, /referenceImages\.length/);
assert.match(explorer, /EquipmentReferenceGallery/);
assert.match(explorer, /optionality/);
assert.match(explorer, /Optional component/);
assert.match(explorer, /Ranked vulnerabilities/);
assert.match(explorer, /No exact-product matches found/);
assert.match(scene, /frameloop="demand"/);
assert.match(scene, /orthographic/);
assert.match(scene, /webglcontextlost/);
assert.match(scene, /mappedEntryFor/);
assert.match(scene, /OrbitControls/);
assert.match(scene, /zoomToCursor/);
assert.match(scene, /wheel or pinch to zoom/);
assert.match(gallery, /unoptimized/);
assert.match(gallery, /EquipmentReferenceLightbox/);
assert.match(lightbox, /createPortal/);
assert.match(lightbox, /aria-modal="true"/);
assert.match(lightbox, /document\.body\.style\.overflow/);
assert.match(networkEvidence, /Network configuration evidence/);
assert.match(networkEvidence, /Physical port capability is not treated as an active connection/);
assert.match(networkEvidence, /Select a node/);
assert.match(networkEvidence, /Operational details withheld/);
assert.match(networkEvidence, /EquipmentReferenceLightbox/);
assert.match(networkEvidence, /No field-observed topology collected/);
assert.match(workspace, /equipmentExplorerEnabled &&/);
assert.match(workspace, /equipment-catalog-link/);
assert.match(workspace, /Component catalog/);
assert.match(vercelIgnore, /!data\/equipment-catalog\.json/);

console.log("Equipment catalog contracts passed.");

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const sourcePackage = JSON.parse(await readFile("data/equipment-source-packages.json", "utf8"));
const publicCatalog = JSON.parse(await readFile("data/equipment-catalog.public.json", "utf8"));
const stagingCatalog = JSON.parse(await readFile("data/equipment-catalog.staging.json", "utf8"));
const claimFiles = (await readdir("data/equipment-claims"))
  .filter((name) => name.endsWith(".json"))
  .sort();
const claims = await Promise.all(
  claimFiles.map(async (name) => JSON.parse(await readFile(`data/equipment-claims/${name}`, "utf8"))),
);
const errors = [];

function error(message) {
  errors.push(message);
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) error(`${label} must be a non-empty string.`);
}

function requireSourceIds(record, label, sourceById, revisionById) {
  if (!Array.isArray(record.sourceIds) || record.sourceIds.length === 0) {
    error(`${label} needs at least one source.`);
    return;
  }
  if (!Array.isArray(record.sourceRevisionIds) || record.sourceRevisionIds.length === 0) {
    error(`${label} needs at least one immutable source revision.`);
    return;
  }
  for (const sourceId of record.sourceIds) {
    if (!sourceById.has(sourceId)) error(`${label} references unknown source ${sourceId}.`);
    if (!record.sourceRevisionIds.some((revisionId) => revisionById.get(revisionId) === sourceId)) {
      error(`${label} does not pin a revision for source ${sourceId}.`);
    }
  }
  for (const revisionId of record.sourceRevisionIds) {
    if (!revisionById.has(revisionId)) error(`${label} references unknown source revision ${revisionId}.`);
  }
}

const vulnerabilitySeverityOrder = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
  ["unknown", 4],
]);

function compareVulnerabilities(left, right) {
  if (left.cisaKev !== right.cisaKev) return left.cisaKev ? -1 : 1;
  const leftScore = left.cvssScore ?? -1;
  const rightScore = right.cvssScore ?? -1;
  if (leftScore !== rightScore) return rightScore - leftScore;
  return (vulnerabilitySeverityOrder.get(left.severity) ?? 99)
    - (vulnerabilitySeverityOrder.get(right.severity) ?? 99);
}

async function validateArtifact(source) {
  try {
    const artifact = await readFile(source.localArtifact);
    const digest = createHash("sha256").update(artifact).digest("hex");
    if (digest !== source.sha256) error(`${source.id} SHA-256 does not match ${source.localArtifact}.`);
  } catch {
    error(`${source.id} local artifact does not exist: ${source.localArtifact}.`);
  }
}

async function validatePngEvidenceAsset(record, label) {
  if (!/^\/equipment\/.+\.png$/.test(record.assetUrl ?? "")) {
    error(`${label} must use a local PNG under /equipment/.`);
    return;
  }
  if (!Number.isInteger(record.width) || record.width <= 0) {
    error(`${label} width must be a positive integer.`);
  }
  if (!Number.isInteger(record.height) || record.height <= 0) {
    error(`${label} height must be a positive integer.`);
  }
  if (!/^[a-f0-9]{64}$/.test(record.assetSha256 ?? "")) {
    error(`${label} needs a SHA-256 digest.`);
  }
  const assetPath = `public${record.assetUrl}`;
  try {
    const asset = await readFile(assetPath);
    const digest = createHash("sha256").update(asset).digest("hex");
    if (digest !== record.assetSha256) error(`${label} SHA-256 does not match ${assetPath}.`);
    const pngSignature = "89504e470d0a1a0a";
    if (asset.subarray(0, 8).toString("hex") !== pngSignature || asset.length < 24) {
      error(`${label} is not a valid PNG asset.`);
    } else {
      const width = asset.readUInt32BE(16);
      const height = asset.readUInt32BE(20);
      if (width !== record.width || height !== record.height) {
        error(`${label} declared dimensions do not match ${assetPath}.`);
      }
    }
  } catch {
    error(`${label} asset does not exist: ${assetPath}.`);
  }
}

function readGlbNodeNames(buffer, label) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
    error(`${label} is not a glTF 2.0 binary asset.`);
    return [];
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || buffer.length < 20 + jsonLength) {
    error(`${label} is missing its JSON chunk.`);
    return [];
  }
  try {
    const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
    return (document.nodes ?? []).map((node) => node.name).filter(Boolean);
  } catch {
    error(`${label} contains invalid glTF JSON.`);
    return [];
  }
}

if (sourcePackage.schemaVersion !== 2) {
  error("Equipment source package must use schema version 2.");
}

const sourceById = new Map();
const revisionById = new Map();
for (const source of sourcePackage.sources ?? []) {
  requireNonEmpty(source.id, "source id");
  if (sourceById.has(source.id)) error(`Duplicate source id ${source.id}.`);
  sourceById.set(source.id, source);
  for (const revision of source.revisions ?? []) {
    if (revisionById.has(revision.id)) error(`Duplicate source revision ${revision.id}.`);
    revisionById.set(revision.id, source.id);
  }
  requireNonEmpty(source.publisher, `${source.id} publisher`);
  requireNonEmpty(source.title, `${source.id} title`);
  requireNonEmpty(source.localArtifact, `${source.id} localArtifact`);
  requireNonEmpty(source.caveat, `${source.id} caveat`);
  if (!/^https:\/\//.test(source.url ?? "")) error(`${source.id} must use an HTTPS source URL.`);
  if (!/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) error(`${source.id} needs a SHA-256 digest.`);
  await validateArtifact(source);
}

const slugSet = new Set();
for (const claim of claims) {
  const system = claim.system;
  const label = system?.slug ?? "unknown system";
  if (claim.schemaVersion !== 2) error(`${label} claim file must use schema version 2.`);
  if (!system || system.status !== "pilot") error(`${label} must be an explicit pilot system.`);
  if (slugSet.has(system.slug)) error(`Duplicate system slug ${system.slug}.`);
  slugSet.add(system.slug);
  requireNonEmpty(system.displayName, `${label} displayName`);
  requireNonEmpty(system.summary, `${label} summary`);
  requireSourceIds(system.certification, `${label} certification`, sourceById, revisionById);
  if (!/certified configuration/i.test(system.certification.caveat ?? "")) {
    error(`${label} certification caveat must distinguish the certified configuration.`);
  }

  if (!Array.isArray(system.components) || system.components.length === 0) {
    error(`${label} needs at least one source-linked component.`);
  }
  const componentById = new Map();
  const technicalSpecificationIds = new Set();
  for (const component of system.components ?? []) {
    if (componentById.has(component.id)) error(`${label} has duplicate component ${component.id}.`);
    componentById.set(component.id, component);
    if ("optionality" in component && component.optionality !== "optional") {
      error(`${label} component ${component.id} has an invalid optionality value.`);
    }
    requireSourceIds(component, `${label} component ${component.id}`, sourceById, revisionById);
    requireNonEmpty(component.caveat, `${label} component ${component.id} caveat`);
    if (component.evidenceStatus === "not_publicly_confirmed" && component.sceneNodeName !== null) {
      error(`${label} unknown component ${component.id} must not be placed in the 3D scene.`);
    }
    for (const specification of component.technicalSpecifications ?? []) {
      const specificationLabel = `${label} technical specification ${specification.id}`;
      if (technicalSpecificationIds.has(specification.id)) {
        error(`${label} has duplicate technical specification ${specification.id}.`);
      }
      technicalSpecificationIds.add(specification.id);
      requireNonEmpty(specification.id, `${specificationLabel} id`);
      requireNonEmpty(specification.category, `${specificationLabel} category`);
      requireNonEmpty(specification.label, `${specificationLabel} label`);
      requireNonEmpty(specification.modelContext, `${specificationLabel} modelContext`);
      requireNonEmpty(specification.caveat, `${specificationLabel} caveat`);
      requireSourceIds(specification, specificationLabel, sourceById, revisionById);
      if (!["confirmed", "documented_partial", "not_publicly_established"].includes(specification.knowledgeStatus)) {
        error(`${specificationLabel} has an invalid knowledgeStatus.`);
      }
      if (![
        "approved_change",
        "certified_configuration",
        "documented_model_family",
        "evidence_gap",
        "jurisdiction_deployment_observation",
        "manufacturer_product",
      ].includes(specification.assertionScope)) {
        error(`${specificationLabel} has an invalid assertionScope.`);
      }
      if (specification.knowledgeStatus === "not_publicly_established") {
        if (specification.value !== null) error(`${specificationLabel} must keep an unknown value null.`);
      } else {
        requireNonEmpty(specification.value, `${specificationLabel} value`);
      }
    }

    const securityReview = component.securityReview;
    if (securityReview) {
      const securityLabel = `${label} component ${component.id} security review`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(securityReview.reviewedOn ?? "")) {
        error(`${securityLabel} needs an ISO review date.`);
      }
      if (![
        "component_identity_unresolved",
        "exact_model_historical_scope",
        "exact_model_family_historical_scope",
      ].includes(securityReview.productIdentityStatus)) {
        error(`${securityLabel} has an invalid productIdentityStatus.`);
      }
      if (![
        "exact_product_review_not_possible",
        "no_exact_product_matches_found",
        "applicable_vulnerabilities_found",
      ].includes(securityReview.overallStatus)) {
        error(`${securityLabel} has an invalid overallStatus.`);
      }
      if (![
        "not_publicly_established",
        "documented",
        "certified",
        "fielded",
      ].includes(securityReview.firmwareStatus)) {
        error(`${securityLabel} has an invalid firmwareStatus.`);
      }
      if (securityReview.firmwareStatus === "not_publicly_established") {
        if (securityReview.firmwareVersion !== null) {
          error(`${securityLabel} must keep an unresolved firmware version null.`);
        }
      } else {
        requireNonEmpty(securityReview.firmwareVersion, `${securityLabel} firmwareVersion`);
      }
      requireNonEmpty(securityReview.coverageDefinition, `${securityLabel} coverageDefinition`);
      requireNonEmpty(securityReview.rankingMethod, `${securityLabel} rankingMethod`);
      requireNonEmpty(securityReview.caveat, `${securityLabel} caveat`);

      const reviewSources = securityReview.sourcesReviewed ?? [];
      if (securityReview.productIdentityStatus !== "component_identity_unresolved" && reviewSources.length === 0) {
        error(`${securityLabel} needs reviewed vulnerability sources for an identified product.`);
      }
      for (const reviewedSource of reviewSources) {
        const reviewedSourceLabel = `${securityLabel} source review ${reviewedSource.id}`;
        requireNonEmpty(reviewedSource.id, `${reviewedSourceLabel} id`);
        requireNonEmpty(reviewedSource.catalog, `${reviewedSourceLabel} catalog`);
        requireNonEmpty(reviewedSource.caveat, `${reviewedSourceLabel} caveat`);
        requireSourceIds(reviewedSource, reviewedSourceLabel, sourceById, revisionById);
        if (!Array.isArray(reviewedSource.queryTerms) || reviewedSource.queryTerms.length === 0) {
          error(`${reviewedSourceLabel} needs the exact reviewed query terms.`);
        }
        if (!Number.isInteger(reviewedSource.exactMatchCount) || reviewedSource.exactMatchCount < 0) {
          error(`${reviewedSourceLabel} needs a non-negative exactMatchCount.`);
        }
        if (![
          "no_applicable_product_matches",
          "no_catalog_matches",
          "no_exact_product_matches",
          "applicable_product_matches_found",
        ].includes(reviewedSource.resultStatus)) {
          error(`${reviewedSourceLabel} has an invalid resultStatus.`);
        }
      }

      const vulnerabilities = securityReview.vulnerabilities ?? [];
      const rankedVulnerabilities = [...vulnerabilities].sort(compareVulnerabilities);
      if (JSON.stringify(vulnerabilities) !== JSON.stringify(rankedVulnerabilities)) {
        error(`${securityLabel} vulnerabilities must be ranked by KEV status, CVSS score, then severity.`);
      }
      for (const vulnerability of vulnerabilities) {
        const vulnerabilityLabel = `${securityLabel} vulnerability ${vulnerability.id}`;
        requireNonEmpty(vulnerability.id, `${vulnerabilityLabel} id`);
        requireNonEmpty(vulnerability.title, `${vulnerabilityLabel} title`);
        requireNonEmpty(vulnerability.description, `${vulnerabilityLabel} description`);
        requireNonEmpty(vulnerability.caveat, `${vulnerabilityLabel} caveat`);
        requireSourceIds(vulnerability, vulnerabilityLabel, sourceById, revisionById);
        if (!vulnerabilitySeverityOrder.has(vulnerability.severity)) {
          error(`${vulnerabilityLabel} has an invalid severity.`);
        }
        if (vulnerability.cvssScore !== null
          && (typeof vulnerability.cvssScore !== "number" || vulnerability.cvssScore < 0 || vulnerability.cvssScore > 10)) {
          error(`${vulnerabilityLabel} CVSS score must be null or between 0 and 10.`);
        }
        if (typeof vulnerability.cisaKev !== "boolean") {
          error(`${vulnerabilityLabel} needs a boolean cisaKev value.`);
        }
      }
      if (securityReview.overallStatus === "no_exact_product_matches_found" && vulnerabilities.length !== 0) {
        error(`${securityLabel} cannot contain vulnerabilities while reporting no exact-product matches.`);
      }
      if (securityReview.overallStatus === "applicable_vulnerabilities_found" && vulnerabilities.length === 0) {
        error(`${securityLabel} must contain vulnerabilities when reporting applicable matches.`);
      }

      for (const advisory of securityReview.nonCveAdvisories ?? []) {
        const advisoryLabel = `${securityLabel} non-CVE advisory ${advisory.id}`;
        requireNonEmpty(advisory.id, `${advisoryLabel} id`);
        requireNonEmpty(advisory.kind, `${advisoryLabel} kind`);
        requireNonEmpty(advisory.title, `${advisoryLabel} title`);
        requireNonEmpty(advisory.description, `${advisoryLabel} description`);
        requireNonEmpty(advisory.caveat, `${advisoryLabel} caveat`);
        requireSourceIds(advisory, advisoryLabel, sourceById, revisionById);
        if (advisory.cvssScore !== null || advisory.securitySeverity !== null || advisory.cisaKev !== false) {
          error(`${advisoryLabel} must not be presented as a scored CVE or KEV record.`);
        }
      }
    }
  }

  const versionIds = new Set();
  for (const observation of system.versionObservations ?? []) {
    if (versionIds.has(observation.id)) error(`${label} has duplicate version observation ${observation.id}.`);
    versionIds.add(observation.id);
    if (!componentById.has(observation.componentId)) error(`${label} version ${observation.id} has unknown component.`);
    requireSourceIds(observation, `${label} version ${observation.id}`, sourceById, revisionById);
    if (!["certified", "documented", "fielded"].includes(observation.assertionScope)) {
      error(`${label} version ${observation.id} has an invalid assertionScope.`);
    }
    if (observation.assertionScope === "fielded") {
      if (observation.fieldStatus !== "established" || !observation.assertedFor?.jurisdiction) {
        error(`${label} fielded version ${observation.id} needs dated jurisdiction evidence.`);
      }
    } else if (observation.fieldStatus !== "not_established") {
      error(`${label} non-fielded version ${observation.id} cannot claim field establishment.`);
    }
    requireNonEmpty(observation.caveat, `${label} version ${observation.id} caveat`);
  }

  for (const component of system.components ?? []) {
    for (const versionId of component.versionObservationIds ?? []) {
      if (!versionIds.has(versionId)) error(`${label} component ${component.id} references unknown version ${versionId}.`);
    }
  }

  for (const change of system.configurationChanges ?? []) {
    requireSourceIds(change, `${label} change ${change.id}`, sourceById, revisionById);
    requireNonEmpty(change.vstl, `${label} change ${change.id} VSTL`);
    if (change.fieldDeploymentStatus !== "unknown") {
      error(`${label} change ${change.id} must not claim field deployment without deployment evidence.`);
    }
    for (const componentId of change.componentIds ?? []) {
      if (!componentById.has(componentId)) error(`${label} change ${change.id} has unknown component ${componentId}.`);
    }
  }

  for (const finding of system.findings ?? []) {
    requireSourceIds(finding, `${label} finding ${finding.id}`, sourceById, revisionById);
    requireNonEmpty(finding.caveat, `${label} finding ${finding.id} caveat`);
    for (const componentId of finding.componentIds ?? []) {
      if (!componentById.has(componentId)) error(`${label} finding ${finding.id} has unknown component ${componentId}.`);
    }
  }

  for (const power of system.power ?? []) {
    requireSourceIds(power, `${label} power ${power.id}`, sourceById, revisionById);
    if (!componentById.has(power.componentId)) error(`${label} power ${power.id} has unknown component.`);
    if (power.knowledgeStatus === "not_publicly_confirmed") {
      for (const field of ["supplyType", "manufacturer", "model", "capacity", "runtime"]) {
        if (power[field] !== null) error(`${label} power ${power.id} must keep unknown ${field} null.`);
      }
    } else if (power.knowledgeStatus === "confirmed") {
      for (const field of ["supplyType", "manufacturer", "model"]) {
        requireNonEmpty(power[field], `${label} power ${power.id} ${field}`);
      }
    } else if (power.knowledgeStatus === "documented_partial") {
      requireNonEmpty(power.supplyType, `${label} power ${power.id} supplyType`);
    } else {
      error(`${label} power ${power.id} has an invalid knowledgeStatus.`);
    }
  }

  for (const deployment of system.deployments ?? []) {
    requireSourceIds(deployment, `${label} deployment ${deployment.id}`, sourceById, revisionById);
    if (deployment.scopeKind !== "jurisdiction_deployment_observation") {
      error(`${label} deployment ${deployment.id} must retain deployment-observation scope.`);
    }
    if (!Array.isArray(deployment.componentsConfirmed) || deployment.componentsConfirmed.length !== 0) {
      error(`${label} deployment ${deployment.id} must not infer confirmed components.`);
    }
  }

  const networkEvidence = system.networkEvidence;
  if (!networkEvidence) {
    error(`${label} needs a network-evidence record.`);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(networkEvidence.reviewedOn ?? "")) {
      error(`${label} network evidence needs an ISO review date.`);
    }
    requireNonEmpty(networkEvidence.summary, `${label} network evidence summary`);
    requireNonEmpty(networkEvidence.publicationBoundary, `${label} network evidence publicationBoundary`);

    const configurationIds = new Set();
    if (!Array.isArray(networkEvidence.configurations) || networkEvidence.configurations.length === 0) {
      error(`${label} needs at least one network configuration.`);
    }
    for (const configuration of networkEvidence.configurations ?? []) {
      const configurationLabel = `${label} network configuration ${configuration.id ?? "unknown"}`;
      requireNonEmpty(configuration.id, `${configurationLabel} id`);
      if (configurationIds.has(configuration.id)) error(`${label} has duplicate network configuration ${configuration.id}.`);
      configurationIds.add(configuration.id);
      requireNonEmpty(configuration.title, `${configurationLabel} title`);
      requireNonEmpty(configuration.description, `${configurationLabel} description`);
      requireNonEmpty(configuration.topologyKind, `${configurationLabel} topologyKind`);
      requireNonEmpty(configuration.sensitiveDetailsWithheld, `${configurationLabel} sensitiveDetailsWithheld`);
      requireNonEmpty(configuration.caveat, `${configurationLabel} caveat`);
      requireSourceIds(configuration, configurationLabel, sourceById, revisionById);
      if (!["expected", "documented", "observed"].includes(configuration.evidenceLayer)) {
        error(`${configurationLabel} has an invalid evidenceLayer.`);
      }
      if (![
        "certified_configuration",
        "vstl_test_configuration",
        "manufacturer_product_policy",
        "state_certification_documentation",
        "documented_model_family",
        "jurisdiction_deployment_observation",
        "field_observation",
      ].includes(configuration.assertionScope)) {
        error(`${configurationLabel} has an invalid assertionScope.`);
      }
      if (!["confirmed", "documented_partial", "not_publicly_established", "conflicting"].includes(configuration.knowledgeStatus)) {
        error(`${configurationLabel} has an invalid knowledgeStatus.`);
      }
      if (![
        "standalone_local_peripherals",
        "closed_wired_lan",
        "conditional_closed_wired_lan",
        "results_transmission_service",
        "optional_cellular_hardware_context",
        "physical_network_capability_only",
      ].includes(configuration.topologyKind)) {
        error(`${configurationLabel} has an invalid topologyKind.`);
      }
      if (configuration.evidenceLayer === "observed") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(configuration.observedOn ?? "")) {
          error(`${configurationLabel} observed layer needs an ISO observation date.`);
        }
        requireNonEmpty(configuration.assertedFor?.jurisdiction, `${configurationLabel} observed jurisdiction`);
      } else if (configuration.observedOn !== null || configuration.assertedFor !== null) {
        error(`${configurationLabel} must keep observation fields null outside the observed layer.`);
      }

      const nodeIds = new Set();
      if (!Array.isArray(configuration.nodes) || configuration.nodes.length === 0) {
        error(`${configurationLabel} needs at least one topology node.`);
      }
      for (const node of configuration.nodes ?? []) {
        const nodeLabel = `${configurationLabel} node ${node.id ?? "unknown"}`;
        requireNonEmpty(node.id, `${nodeLabel} id`);
        if (nodeIds.has(node.id)) error(`${configurationLabel} has duplicate node ${node.id}.`);
        nodeIds.add(node.id);
        requireNonEmpty(node.label, `${nodeLabel} label`);
        requireNonEmpty(node.role, `${nodeLabel} role`);
        requireNonEmpty(node.details, `${nodeLabel} details`);
        if (typeof node.optional !== "boolean") error(`${nodeLabel} needs a boolean optional value.`);
        if (node.componentId !== null && !componentById.has(node.componentId)) {
          error(`${nodeLabel} references unknown component ${node.componentId}.`);
        }
      }

      const linkIds = new Set();
      for (const link of configuration.links ?? []) {
        const linkLabel = `${configurationLabel} link ${link.id ?? "unknown"}`;
        requireNonEmpty(link.id, `${linkLabel} id`);
        if (linkIds.has(link.id)) error(`${configurationLabel} has duplicate link ${link.id}.`);
        linkIds.add(link.id);
        if (!nodeIds.has(link.from)) error(`${linkLabel} has unknown from node ${link.from}.`);
        if (!nodeIds.has(link.to)) error(`${linkLabel} has unknown to node ${link.to}.`);
        requireNonEmpty(link.medium, `${linkLabel} medium`);
        requireNonEmpty(link.purpose, `${linkLabel} purpose`);
        if (!["one_way", "bidirectional", "not_specified"].includes(link.direction)) {
          error(`${linkLabel} has an invalid direction.`);
        }
        if (!["confirmed", "documented_partial", "not_publicly_established"].includes(link.knowledgeStatus)) {
          error(`${linkLabel} has an invalid knowledgeStatus.`);
        }
      }

      for (const control of configuration.controls ?? []) {
        const controlLabel = `${configurationLabel} control ${control.id ?? "unknown"}`;
        requireNonEmpty(control.id, `${controlLabel} id`);
        requireNonEmpty(control.label, `${controlLabel} label`);
        requireNonEmpty(control.description, `${controlLabel} description`);
        if (!["documented", "not_publicly_established"].includes(control.status)) {
          error(`${controlLabel} has an invalid status.`);
        }
      }
    }

    const networkImageIds = new Set();
    if (!Array.isArray(networkEvidence.sourceImages) || networkEvidence.sourceImages.length === 0) {
      error(`${label} needs at least one network source image.`);
    }
    for (const sourceImage of networkEvidence.sourceImages ?? []) {
      const sourceImageLabel = `${label} network source image ${sourceImage.id ?? "unknown"}`;
      requireNonEmpty(sourceImage.id, `${sourceImageLabel} id`);
      if (networkImageIds.has(sourceImage.id)) error(`${label} has duplicate network source image ${sourceImage.id}.`);
      networkImageIds.add(sourceImage.id);
      requireNonEmpty(sourceImage.alt, `${sourceImageLabel} alt`);
      requireNonEmpty(sourceImage.caption, `${sourceImageLabel} caption`);
      requireNonEmpty(sourceImage.kind, `${sourceImageLabel} kind`);
      requireNonEmpty(sourceImage.pageOrSection, `${sourceImageLabel} pageOrSection`);
      requireNonEmpty(sourceImage.derivativeNote, `${sourceImageLabel} derivativeNote`);
      requireNonEmpty(sourceImage.caveat, `${sourceImageLabel} caveat`);
      requireSourceIds(sourceImage, sourceImageLabel, sourceById, revisionById);
      await validatePngEvidenceAsset(sourceImage, sourceImageLabel);
    }

    const gapIds = new Set();
    for (const gap of networkEvidence.gaps ?? []) {
      const gapLabel = `${label} network gap ${gap.id ?? "unknown"}`;
      requireNonEmpty(gap.id, `${gapLabel} id`);
      if (gapIds.has(gap.id)) error(`${label} has duplicate network gap ${gap.id}.`);
      gapIds.add(gap.id);
      requireNonEmpty(gap.label, `${gapLabel} label`);
      requireNonEmpty(gap.description, `${gapLabel} description`);
      requireNonEmpty(gap.caveat, `${gapLabel} caveat`);
      requireSourceIds(gap, gapLabel, sourceById, revisionById);
    }
  }

  const scene = system.scene;
  if (scene.geometryFidelity !== "illustrative_not_to_scale") {
    error(`${label} scene must be labeled illustrative_not_to_scale.`);
  }
  if (scene.assetLicense !== "Apache-2.0") error(`${label} scene asset needs its Apache-2.0 license.`);
  requireSourceIds(
    {
      sourceIds: scene.referenceSourceIds,
      sourceRevisionIds: scene.referenceSourceRevisionIds,
    },
    `${label} scene reference`,
    sourceById,
    revisionById,
  );
  requireNonEmpty(scene.referenceConfiguration, `${label} scene referenceConfiguration`);
  requireNonEmpty(scene.referenceNote, `${label} scene referenceNote`);
  const referenceImageIds = new Set();
  const sceneReferenceSourceIds = new Set(scene.referenceSourceIds ?? []);
  for (const referenceImage of scene.referenceImages ?? []) {
    const referenceImageLabel = `${label} reference image ${referenceImage.id ?? "unknown"}`;
    requireNonEmpty(referenceImage.id, `${referenceImageLabel} id`);
    if (referenceImageIds.has(referenceImage.id)) {
      error(`${label} has duplicate reference image ${referenceImage.id}.`);
    }
    referenceImageIds.add(referenceImage.id);
    requireNonEmpty(referenceImage.alt, `${referenceImageLabel} alt`);
    requireNonEmpty(referenceImage.caption, `${referenceImageLabel} caption`);
    requireNonEmpty(referenceImage.kind, `${referenceImageLabel} kind`);
    requireNonEmpty(referenceImage.pageOrSection, `${referenceImageLabel} pageOrSection`);
    requireNonEmpty(referenceImage.derivativeNote, `${referenceImageLabel} derivativeNote`);
    requireNonEmpty(referenceImage.caveat, `${referenceImageLabel} caveat`);
    requireSourceIds(referenceImage, referenceImageLabel, sourceById, revisionById);
    for (const sourceId of referenceImage.sourceIds ?? []) {
      if (!sceneReferenceSourceIds.has(sourceId)) {
        error(`${referenceImageLabel} source ${sourceId} must also be included in the scene reference sources.`);
      }
    }
    if (!/^\/equipment\/.+\.png$/.test(referenceImage.assetUrl ?? "")) {
      error(`${referenceImageLabel} must use a local PNG under /equipment/.`);
      continue;
    }
    if (!Number.isInteger(referenceImage.width) || referenceImage.width <= 0) {
      error(`${referenceImageLabel} width must be a positive integer.`);
    }
    if (!Number.isInteger(referenceImage.height) || referenceImage.height <= 0) {
      error(`${referenceImageLabel} height must be a positive integer.`);
    }
    if (!/^[a-f0-9]{64}$/.test(referenceImage.assetSha256 ?? "")) {
      error(`${referenceImageLabel} needs a SHA-256 digest.`);
    }
    const referenceAssetPath = `public${referenceImage.assetUrl}`;
    try {
      const referenceAsset = await readFile(referenceAssetPath);
      const digest = createHash("sha256").update(referenceAsset).digest("hex");
      if (digest !== referenceImage.assetSha256) {
        error(`${referenceImageLabel} SHA-256 does not match ${referenceAssetPath}.`);
      }
      const pngSignature = "89504e470d0a1a0a";
      if (referenceAsset.subarray(0, 8).toString("hex") !== pngSignature || referenceAsset.length < 24) {
        error(`${referenceImageLabel} is not a valid PNG asset.`);
      } else {
        const width = referenceAsset.readUInt32BE(16);
        const height = referenceAsset.readUInt32BE(20);
        if (width !== referenceImage.width || height !== referenceImage.height) {
          error(`${referenceImageLabel} declared dimensions do not match ${referenceAssetPath}.`);
        }
      }
    } catch {
      error(`${referenceImageLabel} asset does not exist: ${referenceAssetPath}.`);
    }
  }
  if (referenceImageIds.size === 0) error(`${label} needs at least one sourced reference image.`);
  const assetPath = `public${scene.assetUrl}`;
  let glbNodeNames = [];
  try {
    glbNodeNames = readGlbNodeNames(await readFile(assetPath), assetPath);
  } catch {
    error(`${label} scene asset does not exist: ${assetPath}.`);
  }
  const sceneComponents = new Set();
  for (const node of scene.nodes ?? []) {
    if (sceneComponents.has(node.componentId)) error(`${label} scene maps component ${node.componentId} more than once.`);
    sceneComponents.add(node.componentId);
    if (!componentById.has(node.componentId)) error(`${label} scene has unknown component ${node.componentId}.`);
    if (
      !Array.isArray(node.explodedOffset)
      || node.explodedOffset.length !== 3
      || node.explodedOffset.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      error(`${label} scene node ${node.nodeName} needs a finite three-number explodedOffset.`);
    }
    const matches = glbNodeNames.filter((name) => name === node.nodeName).length;
    if (matches !== 1) error(`${label} scene node ${node.nodeName} must occur exactly once; found ${matches}.`);
  }
  const sceneNodeByComponent = new Map((scene.nodes ?? []).map((node) => [node.componentId, node.nodeName]));
  for (const component of system.components ?? []) {
    if (component.sceneNodeName === null) continue;
    const mappedNodeName = sceneNodeByComponent.get(component.id);
    if (!mappedNodeName) error(`${label} component ${component.id} is selectable in 3D but has no scene mapping.`);
    else if (mappedNodeName !== component.sceneNodeName) {
      error(`${label} component ${component.id} sceneNodeName does not match its scene mapping.`);
    }
  }
}

function validateGeneratedCatalog(catalog, {
  channel,
  eligibleStates,
  expectedEditorialState,
  expectedStatus,
}) {
  const label = `${channel} catalog`;
  if (catalog.schemaVersion !== 2) error(`${label} must use schema version 2.`);
  if (catalog.catalogChannel !== channel) error(`${label} has the wrong catalogChannel.`);
  if (catalog.status !== expectedStatus) error(`${label} has the wrong status.`);
  if (catalog.editorialState !== expectedEditorialState) error(`${label} has the wrong editorialState.`);
  if (catalog.productionRequirement !== sourcePackage.editorialPolicy.publicProductionState) {
    error(`${label} has a stale production requirement.`);
  }

  const eligibleClaims = claims.filter((claim) => eligibleStates.includes(claim.editorial?.state));
  const eligibleClaimBySlug = new Map(eligibleClaims.map((claim) => [claim.system?.slug, claim]));
  if (catalog.systems?.length !== eligibleClaims.length) {
    error(`${label} system count does not match its eligible claim inputs.`);
  }

  const expectedReleaseIds = [...new Set(eligibleClaims
    .filter((claim) => claim.editorial?.state === "published")
    .map((claim) => claim.editorial?.publicationId)
    .filter(Boolean))]
    .sort();
  if (JSON.stringify(catalog.releaseIds ?? []) !== JSON.stringify(expectedReleaseIds)) {
    error(`${label} release IDs are stale.`);
  }

  const expectedSourceIds = new Set([
    ...(sourcePackage.methodology?.changeControlSourceIds ?? []),
    ...(catalog.systems ?? []).flatMap((system) => system.sourceIds ?? []),
  ]);
  const catalogSourceIds = (catalog.sources ?? []).map((source) => source.id).sort();
  if (JSON.stringify(catalogSourceIds) !== JSON.stringify([...expectedSourceIds].sort())) {
    error(`${label} must contain exactly the sources used by its systems and methodology.`);
  }

  for (const system of catalog.systems ?? []) {
    const claim = eligibleClaimBySlug.get(system.slug);
    if (!claim) error(`${label} contains ineligible or unknown system ${system.slug}.`);
    else {
      if (system.editorialState !== claim.editorial.state) error(`${system.slug} ${label} editorial state is stale.`);
      if (system.claimRevision !== claim.editorial.revision) error(`${system.slug} ${label} claim revision is stale.`);
    }
    if (channel === "public" && system.editorialState !== "published") {
      error(`${system.slug} is not published and must not appear in the public catalog.`);
    }
    if (system.coverage?.sourcedComponentCount !== system.coverage?.componentCount) {
      error(`${system.slug} generated coverage reports an unsourced component.`);
    }
    const securityReviews = system.components.filter((component) => component.securityReview !== null);
    const vulnerabilityCount = securityReviews.reduce(
      (sum, component) => sum + component.securityReview.vulnerabilities.length,
      0,
    );
    const nonCveAdvisoryCount = securityReviews.reduce(
      (sum, component) => sum + component.securityReview.nonCveAdvisories.length,
      0,
    );
    if (system.coverage?.componentSecurityReviewCount !== securityReviews.length) {
      error(`${system.slug} generated security-review coverage is stale.`);
    }
    if (system.coverage?.exactApplicableVulnerabilityCount !== vulnerabilityCount) {
      error(`${system.slug} generated vulnerability coverage is stale.`);
    }
    if (system.coverage?.nonCveAdvisoryCount !== nonCveAdvisoryCount) {
      error(`${system.slug} generated non-CVE advisory coverage is stale.`);
    }
  }
}

validateGeneratedCatalog(publicCatalog, {
  channel: "public",
  eligibleStates: ["published"],
  expectedEditorialState: "public_release",
  expectedStatus: "published_catalog",
});
validateGeneratedCatalog(stagingCatalog, {
  channel: "staging",
  eligibleStates: ["approved", "published"],
  expectedEditorialState: "staging_review",
  expectedStatus: "reviewed_pilot",
});
if (errors.length) {
  console.error(`Equipment catalog validation failed with ${errors.length} error(s):`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  `Validated ${publicCatalog.systems.length} public and ${stagingCatalog.systems.length} staging equipment systems, ${sourcePackage.sources.length} archived sources, `
    + `${stagingCatalog.systems.reduce((sum, system) => sum + system.components.length, 0)} staging components, and `
    + `${stagingCatalog.systems.reduce((sum, system) => sum + system.coverage.technicalSpecificationCount, 0)} technical specifications, and `
    + `${stagingCatalog.systems.reduce((sum, system) => sum + system.configurationChanges.length, 0)} configuration changes.`,
);

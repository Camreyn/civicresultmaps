import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const sourcePackage = JSON.parse(await readFile("data/equipment-source-packages.json", "utf8"));
const catalog = JSON.parse(await readFile("data/equipment-catalog.json", "utf8"));
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

async function validateArtifact(source) {
  try {
    const artifact = await readFile(source.localArtifact);
    const digest = createHash("sha256").update(artifact).digest("hex");
    if (digest !== source.sha256) error(`${source.id} SHA-256 does not match ${source.localArtifact}.`);
  } catch {
    error(`${source.id} local artifact does not exist: ${source.localArtifact}.`);
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

if (sourcePackage.schemaVersion !== 2 || catalog.schemaVersion !== 2) {
  error("Equipment source package and catalog must use schema version 2.");
}
if (catalog.status !== "reviewed_pilot") error("Catalog must retain reviewed_pilot status.");

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

const eligibleClaims = claims.filter((claim) => ["approved", "published"].includes(claim.editorial?.state));
const eligibleClaimBySlug = new Map(eligibleClaims.map((claim) => [claim.system?.slug, claim]));
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

if (catalog.systems?.length !== eligibleClaims.length) {
  error("Generated catalog system count does not match approved and published claim inputs.");
}
for (const system of catalog.systems ?? []) {
  const claim = eligibleClaimBySlug.get(system.slug);
  if (!claim) error(`Generated catalog contains ineligible or unknown system ${system.slug}.`);
  else {
    if (system.editorialState !== claim.editorial.state) error(`${system.slug} catalog editorial state is stale.`);
    if (system.claimRevision !== claim.editorial.revision) error(`${system.slug} catalog claim revision is stale.`);
  }
  if (system.coverage?.sourcedComponentCount !== system.coverage?.componentCount) {
    error(`${system.slug} generated coverage reports an unsourced component.`);
  }
}

if (errors.length) {
  console.error(`Equipment catalog validation failed with ${errors.length} error(s):`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  `Validated ${catalog.systems.length} equipment system${catalog.systems.length === 1 ? "" : "s"}, ${sourcePackage.sources.length} archived sources, `
    + `${catalog.systems.reduce((sum, system) => sum + system.components.length, 0)} components, and `
    + `${catalog.systems.reduce((sum, system) => sum + system.coverage.technicalSpecificationCount, 0)} technical specifications, and `
    + `${catalog.systems.reduce((sum, system) => sum + system.configurationChanges.length, 0)} configuration changes.`,
);

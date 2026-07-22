import { readdir, readFile, stat, writeFile } from "node:fs/promises";

const sourcePackagePath = "data/equipment-source-packages.json";
const claimDirectory = "data/equipment-claims";

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function reviewedRevisionId(source, reviewedOn) {
  return source.currentReviewedRevisionId ?? `${source.id}@${source.retrievedOn ?? reviewedOn}`;
}

async function migrateSource(source, reviewedOn) {
  if (source.revisions?.length) {
    return {
      ...source,
      canonicalUrl: source.canonicalUrl ?? source.url,
      currentReviewedRevisionId: source.currentReviewedRevisionId ?? source.revisions.at(-1).id,
      latestRetrievedRevisionId: source.latestRetrievedRevisionId ?? source.revisions.at(-1).id,
      revisionComparisons: source.revisionComparisons ?? [],
    };
  }

  const revisionId = reviewedRevisionId(source, reviewedOn);
  const artifact = await stat(source.localArtifact);
  const revision = {
    id: revisionId,
    localArtifact: source.localArtifact,
    sha256: source.sha256,
    byteLength: artifact.size,
    publishedOn: source.publishedOn,
    retrievedOn: source.retrievedOn,
    retrievedAt: null,
    retrievalPrecision: "date",
    resolvedUrl: source.url,
    http: {
      etag: null,
      lastModified: null,
    },
    supersedesRevisionId: null,
    contentStatus: "baseline",
    pageOrSection: source.pageOrSection,
    archiveStatus: "verified",
  };

  return {
    ...source,
    canonicalUrl: source.url,
    currentReviewedRevisionId: revisionId,
    latestRetrievedRevisionId: revisionId,
    revisions: [revision],
    revisionComparisons: [],
  };
}

function addRevisionReferences(record, revisionBySourceId) {
  if (!record || !Array.isArray(record.sourceIds)) return record;
  return {
    ...record,
    sourceRevisionIds: unique(record.sourceIds.map((sourceId) => revisionBySourceId.get(sourceId))),
  };
}

function versionSemantics(observation, certificationId) {
  const assertionScope = observation.assertionScope
    ?? (observation.scopeKind === "certified_configuration" ? "certified" : "documented");
  return {
    ...observation,
    assertionScope,
    approvalScope: observation.approvalScope
      ?? (observation.scopeKind === "state_approved_configuration" ? observation.scopeKind : null),
    fieldStatus: observation.fieldStatus ?? "not_established",
    assertedFor: observation.assertedFor ?? {
      systemCertificationId: certificationId,
      jurisdiction: null,
      observedOn: observation.observedOn,
    },
  };
}

function migrateClaim(claim, revisionBySourceId) {
  const system = claim.system;
  const certification = addRevisionReferences(system.certification, revisionBySourceId);
  const components = system.components.map((record) => addRevisionReferences(record, revisionBySourceId));
  const versionObservations = system.versionObservations.map((record) => versionSemantics(
    addRevisionReferences(record, revisionBySourceId),
    certification.certificationId,
  ));
  const configurationChanges = system.configurationChanges.map((record) => addRevisionReferences(record, revisionBySourceId));
  const findings = system.findings.map((record) => addRevisionReferences(record, revisionBySourceId));
  const power = system.power.map((record) => addRevisionReferences(record, revisionBySourceId));
  const deployments = system.deployments.map((record) => addRevisionReferences(record, revisionBySourceId));
  const sourceRevisionIds = unique([
    ...certification.sourceRevisionIds,
    ...components.flatMap((record) => record.sourceRevisionIds),
    ...versionObservations.flatMap((record) => record.sourceRevisionIds),
    ...configurationChanges.flatMap((record) => record.sourceRevisionIds),
    ...findings.flatMap((record) => record.sourceRevisionIds),
    ...power.flatMap((record) => record.sourceRevisionIds),
    ...deployments.flatMap((record) => record.sourceRevisionIds),
  ]);

  return {
    ...claim,
    schemaVersion: 2,
    editorial: claim.editorial ?? {
      state: "approved",
      revision: 1,
      createdOn: claim.reviewedOn,
      updatedOn: claim.reviewedOn,
      reviewedOn: claim.reviewedOn,
      reviewedBy: "project_editorial_review",
      publishedOn: null,
      sourceRevisionIds,
      reviewNotes: [
        "Approved for feature-gated staging. Public production activation remains a separate review decision.",
      ],
    },
    system: {
      ...system,
      certification,
      components,
      versionObservations,
      configurationChanges,
      findings,
      power,
      deployments,
    },
  };
}

const sourcePackage = JSON.parse(await readFile(sourcePackagePath, "utf8"));
const sources = await Promise.all(
  sourcePackage.sources.map((source) => migrateSource(source, sourcePackage.reviewedOn)),
);
const revisionBySourceId = new Map(sources.map((source) => [source.id, source.currentReviewedRevisionId]));
const migratedSourcePackage = {
  ...sourcePackage,
  schemaVersion: 2,
  editorialPolicy: sourcePackage.editorialPolicy ?? {
    lifecycle: ["draft", "in_review", "approved", "published", "superseded", "withdrawn"],
    publicProductionState: "published",
    stagingStates: ["approved", "published"],
    changedSourceRule: "A changed archived artifact requires claim review; a hash change alone is not an equipment change.",
    fieldedVersionRule: "A fielded version requires a dated official jurisdiction inventory, acceptance, inspection, or equivalent direct record.",
  },
  sources,
};

await writeFile(sourcePackagePath, `${JSON.stringify(migratedSourcePackage, null, 2)}\n`, "utf8");

const claimFiles = (await readdir(claimDirectory)).filter((name) => name.endsWith(".json")).sort();
for (const name of claimFiles) {
  const path = `${claimDirectory}/${name}`;
  const claim = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify(migrateClaim(claim, revisionBySourceId), null, 2)}\n`, "utf8");
}

console.log(`Migrated ${sources.length} equipment sources and ${claimFiles.length} claim files to schema v2.`);

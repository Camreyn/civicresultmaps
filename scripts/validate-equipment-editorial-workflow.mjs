import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const sourcePackage = JSON.parse(await readFile("data/equipment-source-packages.json", "utf8"));
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

function dateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function utcTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.endsWith("Z");
}

function collectSystemRevisionIds(value, revisionIds = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectSystemRevisionIds(entry, revisionIds);
    return revisionIds;
  }
  if (!value || typeof value !== "object") return revisionIds;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "sourceRevisionIds" && Array.isArray(entry)) {
      for (const revisionId of entry) revisionIds.add(revisionId);
    } else {
      collectSystemRevisionIds(entry, revisionIds);
    }
  }
  return revisionIds;
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

if (sourcePackage.schemaVersion !== 2) error("Equipment source package must use schema version 2.");

const sourceById = new Map();
const revisionById = new Map();
const artifactPaths = new Set();
const pendingComparisons = [];

for (const source of sourcePackage.sources ?? []) {
  sourceById.set(source.id, source);
  if (source.canonicalUrl !== source.url) {
    error(`${source.id} compatibility URL must match canonicalUrl until a reviewed revision changes it.`);
  }
  const localRevisionIds = new Set();
  for (const revision of source.revisions ?? []) {
    if (revisionById.has(revision.id)) error(`Duplicate source revision ID ${revision.id}.`);
    revisionById.set(revision.id, { source, revision });
    localRevisionIds.add(revision.id);
    if (artifactPaths.has(revision.localArtifact)) error(`Source artifact path is reused: ${revision.localArtifact}.`);
    artifactPaths.add(revision.localArtifact);
    try {
      const artifact = await readFile(revision.localArtifact);
      const digest = createHash("sha256").update(artifact).digest("hex");
      if (digest !== revision.sha256) error(`${revision.id} SHA-256 does not match its archived artifact.`);
      if (artifact.length !== revision.byteLength) error(`${revision.id} byteLength does not match its archived artifact.`);
    } catch {
      error(`${revision.id} archived artifact is missing: ${revision.localArtifact}.`);
    }
    if (!dateOnly(revision.retrievedOn)) error(`${revision.id} needs a YYYY-MM-DD retrievedOn date.`);
    if (revision.retrievalPrecision === "timestamp" && !utcTimestamp(revision.retrievedAt)) {
      error(`${revision.id} timestamp-precision retrieval needs a UTC retrievedAt value.`);
    }
    if (revision.retrievalPrecision === "date" && revision.retrievedAt !== null) {
      error(`${revision.id} migrated date-only retrieval must not invent a timestamp.`);
    }
    if (dateOnly(revision.publishedOn) && dateOnly(revision.retrievedOn) && revision.publishedOn > revision.retrievedOn) {
      error(`${revision.id} retrievedOn predates its publishedOn date.`);
    }
  }
  if (!localRevisionIds.has(source.currentReviewedRevisionId)) {
    error(`${source.id} currentReviewedRevisionId does not resolve within the source.`);
  }
  if (!localRevisionIds.has(source.latestRetrievedRevisionId)) {
    error(`${source.id} latestRetrievedRevisionId does not resolve within the source.`);
  }
  const current = (source.revisions ?? []).find((revision) => revision.id === source.currentReviewedRevisionId);
  if (current) {
    if (current.archiveStatus !== "verified") error(`${current.id} current reviewed revision must be verified.`);
    for (const field of ["localArtifact", "sha256", "publishedOn", "retrievedOn", "pageOrSection"]) {
      if (source[field] !== current[field]) error(`${source.id} compatibility field ${field} must project the reviewed revision.`);
    }
  }
  for (const comparison of source.revisionComparisons ?? []) {
    if (!localRevisionIds.has(comparison.fromRevisionId) || !localRevisionIds.has(comparison.toRevisionId)) {
      error(`${source.id} comparison ${comparison.id} references a revision outside its source.`);
    }
    if (comparison.editorialImpact === "requires_claim_review" && comparison.reviewState === "pending") {
      pendingComparisons.push(comparison);
    }
  }
}

const allowedStates = new Set(sourcePackage.editorialPolicy?.lifecycle ?? []);
for (const claim of claims) {
  const label = claim.system?.slug ?? "unknown claim";
  if (claim.schemaVersion !== 2) error(`${label} must use claim schema version 2.`);
  const editorial = claim.editorial;
  if (!editorial || !allowedStates.has(editorial.state)) error(`${label} has an invalid editorial state.`);
  if (!Number.isInteger(editorial?.revision) || editorial.revision < 1) error(`${label} needs a positive editorial revision.`);
  if (["approved", "published"].includes(editorial?.state)) {
    if (!dateOnly(editorial.reviewedOn)) error(`${label} approved content needs reviewedOn.`);
    if (typeof editorial.reviewedBy !== "string" || !editorial.reviewedBy.trim()) error(`${label} approved content needs reviewedBy.`);
  }
  if (editorial?.state === "published" && !dateOnly(editorial.publishedOn)) {
    error(`${label} published content needs publishedOn.`);
  }
  const claimRevisionIds = new Set(editorial?.sourceRevisionIds ?? []);
  if (claimRevisionIds.size === 0) error(`${label} must pin its reviewed source revision set.`);
  const systemRevisionIds = collectSystemRevisionIds(claim.system);
  if (!sameSet(claimRevisionIds, systemRevisionIds)) {
    error(`${label} editorial sourceRevisionIds must exactly match the revisions used by its system records.`);
  }
  for (const revisionId of claimRevisionIds) {
    const entry = revisionById.get(revisionId);
    if (!entry) {
      error(`${label} references unknown source revision ${revisionId}.`);
      continue;
    }
    if (["approved", "published"].includes(editorial?.state) && entry.source.currentReviewedRevisionId !== revisionId) {
      error(`${label} must be re-reviewed against current source revision ${entry.source.currentReviewedRevisionId}; it still pins ${revisionId}.`);
    }
  }
  for (const comparison of pendingComparisons) {
    if (claimRevisionIds.has(comparison.fromRevisionId) && ["approved", "published"].includes(editorial?.state)) {
      error(`${label} needs renewed review because ${comparison.id} is pending.`);
    }
  }
}

if (errors.length) {
  console.error(`Equipment editorial workflow validation failed with ${errors.length} error(s):`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  `Validated ${sourcePackage.sources.length} source records, ${revisionById.size} immutable revisions, `
    + `${claims.length} claims, and ${pendingComparisons.length} pending substantive comparisons.`,
);

import { readFile, writeFile } from "node:fs/promises";

const manifestPath = "data/equipment-source-packages.json";
const args = new Map(
  process.argv.slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const index = arg.indexOf("=");
      return [arg.slice(2, index), arg.slice(index + 1)];
    }),
);
const writeChanges = process.argv.includes("--write");
const sourceId = args.get("source");
const revisionId = args.get("revision");
const decision = args.get("decision");
const reviewer = args.get("reviewer");
const note = args.get("note");

if (!sourceId || !revisionId || !["approve", "reject"].includes(decision ?? "") || !reviewer || !note) {
  throw new Error(
    "Usage: node scripts/review-equipment-source-revision.mjs --source=<id> --revision=<id> "
      + "--decision=approve|reject --reviewer=<role> --note=<review note> [--write]",
  );
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const source = manifest.sources.find((entry) => entry.id === sourceId);
if (!source) throw new Error(`Unknown equipment source: ${sourceId}`);
const revision = source.revisions.find((entry) => entry.id === revisionId);
if (!revision) throw new Error(`${revisionId} does not belong to ${sourceId}.`);
if (revision.id === source.currentReviewedRevisionId) {
  throw new Error(`${revisionId} is already the reviewed revision for ${sourceId}.`);
}
const comparison = source.revisionComparisons.find((entry) => entry.toRevisionId === revisionId);
if (!comparison) throw new Error(`${revisionId} has no revision comparison to review.`);
if (comparison.reviewState !== "pending") throw new Error(`${comparison.id} is already ${comparison.reviewState}.`);

const reviewedAt = new Date().toISOString();
const preview = {
  sourceId,
  revisionId,
  decision,
  reviewer,
  note,
  previousReviewedRevisionId: source.currentReviewedRevisionId,
  newReviewedRevisionId: decision === "approve" ? revisionId : source.currentReviewedRevisionId,
  warning: decision === "approve"
    ? "Claims remain pinned to their prior immutable source revisions until separately reviewed and revised."
    : "The rejected artifact remains archived for audit history and is not used by compatibility fields.",
};

if (!writeChanges) {
  console.log(JSON.stringify(preview, null, 2));
  console.log("Dry run only. Pass --write after completing editorial review.");
  process.exit(0);
}

comparison.reviewState = decision === "approve" ? "approved" : "rejected";
comparison.reviewNote = note;
comparison.reviewedAt = reviewedAt;
comparison.reviewedBy = reviewer;
revision.archiveStatus = decision === "approve" ? "verified" : "rejected";

if (decision === "approve") {
  source.currentReviewedRevisionId = revision.id;
  source.localArtifact = revision.localArtifact;
  source.sha256 = revision.sha256;
  source.publishedOn = revision.publishedOn;
  source.retrievedOn = revision.retrievedOn;
  source.pageOrSection = revision.pageOrSection;
}

manifest.reviewedOn = reviewedAt.slice(0, 10);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...preview, reviewedAt }, null, 2));

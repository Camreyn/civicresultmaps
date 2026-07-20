import { readdir, readFile, writeFile } from "node:fs/promises";

import { assertEquipmentClaimSourceRevisionsReady } from "./equipment-editorial-policy.mjs";

const args = new Map(
  process.argv.slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const index = arg.indexOf("=");
      return [arg.slice(2, index), arg.slice(index + 1)];
    }),
);
const writeChanges = process.argv.includes("--write");
const slug = args.get("slug");
const targetState = args.get("state");
const reviewer = args.get("reviewer");
const note = args.get("note");
const publicationId = args.get("publication");
const transitions = {
  draft: ["in_review", "withdrawn"],
  in_review: ["draft", "approved", "withdrawn"],
  approved: ["in_review", "published", "withdrawn"],
  published: ["superseded", "withdrawn"],
  superseded: [],
  withdrawn: [],
};

if (!slug || !targetState || !reviewer || !note) {
  throw new Error(
    "Usage: node scripts/set-equipment-claim-editorial-state.mjs --slug=<slug> --state=<state> "
      + "--reviewer=<role> --note=<review note> [--publication=<immutable release id>] [--write]",
  );
}

const claimFiles = (await readdir("data/equipment-claims"))
  .filter((name) => name.endsWith(".json"))
  .sort();
let claimPath = null;
let claim = null;
for (const name of claimFiles) {
  const candidatePath = `data/equipment-claims/${name}`;
  const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  if (candidate.system?.slug === slug) {
    claimPath = candidatePath;
    claim = candidate;
    break;
  }
}
if (!claim || !claimPath) throw new Error(`Unknown equipment claim slug: ${slug}`);

const currentState = claim.editorial?.state;
if (!transitions[currentState]?.includes(targetState)) {
  throw new Error(`Invalid equipment editorial transition: ${currentState} -> ${targetState}`);
}
if (targetState === "published" && !publicationId) {
  throw new Error("Publishing requires --publication=<immutable release id>.");
}

const manifest = JSON.parse(await readFile("data/equipment-source-packages.json", "utf8"));
assertEquipmentClaimSourceRevisionsReady({ claim, manifest, slug, targetState });
for (const source of manifest.sources) {
  for (const comparison of source.revisionComparisons ?? []) {
    if (
      comparison.reviewState === "pending"
      && comparison.editorialImpact === "requires_claim_review"
      && claim.editorial.sourceRevisionIds.includes(comparison.fromRevisionId)
    ) {
      throw new Error(`${slug} cannot advance while source comparison ${comparison.id} is pending.`);
    }
  }
}

const changedOn = new Date().toISOString().slice(0, 10);
const nextEditorial = {
  ...claim.editorial,
  state: targetState,
  revision: claim.editorial.revision + 1,
  updatedOn: changedOn,
  reviewNotes: [...claim.editorial.reviewNotes, `${reviewer}: ${note}`],
};
if (targetState === "approved") {
  nextEditorial.reviewedOn = changedOn;
  nextEditorial.reviewedBy = reviewer;
}
if (targetState === "published") {
  nextEditorial.publishedOn = changedOn;
  nextEditorial.publicationId = publicationId;
}
if (["superseded", "withdrawn"].includes(targetState)) nextEditorial.closedOn = changedOn;

const preview = {
  slug,
  from: currentState,
  to: targetState,
  claimRevision: nextEditorial.revision,
  publicationId: targetState === "published" ? publicationId : null,
  changedOn,
};
if (!writeChanges) {
  console.log(JSON.stringify(preview, null, 2));
  console.log("Dry run only. Pass --write after completing the stated review.");
  process.exit(0);
}

claim.editorial = nextEditorial;
await writeFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
console.log(JSON.stringify(preview, null, 2));

import assert from "node:assert/strict";
import test from "node:test";
import { inspectSouthCarolinaPrecinctBlobPublicationPlan } from "../../scripts/lib/sc-precinct-blob-publication.mjs";
import { buildSouthCarolinaTestReleaseFixture } from "./sc-precinct-release-fixture.mjs";

const { prepared } = await buildSouthCarolinaTestReleaseFixture({ write: true });
const plan = inspectSouthCarolinaPrecinctBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("South Carolina Blob plan pins all 138 county assets before three indexes", () => {
  assert.equal(plan.artifacts.length, 141);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 138);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 3);
  assert.ok(plan.artifacts.slice(0, 138).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(138).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/sc/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

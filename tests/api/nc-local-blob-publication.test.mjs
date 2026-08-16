import assert from "node:assert/strict";
import test from "node:test";
import { inspectNorthCarolinaLocalBlobPublicationPlan } from "../../scripts/lib/nc-local-blob-publication.mjs";
import { buildNorthCarolinaTestReleaseFixture } from "./nc-local-release-fixture.mjs";

const { prepared } = await buildNorthCarolinaTestReleaseFixture({ write: true });
const plan = inspectNorthCarolinaLocalBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("North Carolina Blob plan pins all 300 county assets before three indexes", () => {
  assert.equal(plan.artifacts.length, 303);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 300);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 3);
  assert.ok(plan.artifacts.slice(0, 300).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(300).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/nc/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

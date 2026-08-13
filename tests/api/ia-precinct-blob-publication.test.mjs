import assert from "node:assert/strict";
import test from "node:test";
import { inspectIowaPrecinctBlobPublicationPlan } from "../../scripts/lib/ia-precinct-blob-publication.mjs";
import { buildIowaTestReleaseFixture } from "./ia-precinct-release-fixture.mjs";

const { prepared } = await buildIowaTestReleaseFixture({ write: true });
const plan = inspectIowaPrecinctBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Iowa Blob plan pins all 297 parents before three indexes", () => {
  assert.equal(plan.artifacts.length, 300);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 297);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 3);
  assert.ok(plan.artifacts.slice(0, 297).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(297).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/ia/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

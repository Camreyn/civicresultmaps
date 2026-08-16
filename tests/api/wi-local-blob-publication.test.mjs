import assert from "node:assert/strict";
import test from "node:test";
import { inspectWisconsinLocalBlobPublicationPlan } from "../../scripts/lib/wi-local-blob-publication.mjs";
import { buildWisconsinTestReleaseFixture } from "./wi-local-release-fixture.mjs";

const { prepared } = await buildWisconsinTestReleaseFixture({ write: true });
const plan = inspectWisconsinLocalBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Wisconsin Blob plan pins all 216 parents before three indexes", () => {
  assert.equal(plan.artifacts.length, 219);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 216);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 3);
  assert.ok(plan.artifacts.slice(0, 216).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(216).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/wi/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

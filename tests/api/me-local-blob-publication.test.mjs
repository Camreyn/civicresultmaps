import assert from "node:assert/strict";
import test from "node:test";
import { inspectMaineLocalBlobPublicationPlan } from "../../scripts/lib/me-local-blob-publication.mjs";
import { buildMaineTestReleaseFixture } from "./me-local-release-fixture.mjs";

const { prepared } = await buildMaineTestReleaseFixture({ write: true });
const plan = inspectMaineLocalBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Maine Blob plan pins all 48 parents before three indexes", () => {
  assert.equal(plan.artifacts.length, 51);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 48);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 3);
  assert.ok(plan.artifacts.slice(0, 48).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(48).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/me/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

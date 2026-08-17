import assert from "node:assert/strict";
import test from "node:test";
import { inspectPennsylvaniaPrecinctBlobPublicationPlan } from "../../scripts/lib/pa-precinct-blob-publication.mjs";
import { buildPennsylvaniaTestReleaseFixture } from "./pa-precinct-release-fixture.mjs";

const { prepared } = await buildPennsylvaniaTestReleaseFixture({ write: true });
const plan = inspectPennsylvaniaPrecinctBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Pennsylvania Blob plan pins all 134 county assets before two indexes", () => {
  assert.equal(plan.artifacts.length, 136);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 134);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 2);
  assert.ok(plan.artifacts.slice(0, 134).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(134).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/pa/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

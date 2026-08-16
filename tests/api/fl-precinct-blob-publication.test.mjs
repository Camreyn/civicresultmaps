import assert from "node:assert/strict";
import test from "node:test";
import { inspectFloridaPrecinctBlobPublicationPlan } from "../../scripts/lib/fl-precinct-blob-publication.mjs";
import { buildFloridaTestReleaseFixture } from "./fl-precinct-release-fixture.mjs";

const { prepared } = await buildFloridaTestReleaseFixture({ write: true });
const plan = inspectFloridaPrecinctBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Florida Blob plan pins all 201 county assets before three indexes", () => {
  assert.equal(plan.artifacts.length, 204);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 201);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 3);
  assert.ok(plan.artifacts.slice(0, 201).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(201).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/fl/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

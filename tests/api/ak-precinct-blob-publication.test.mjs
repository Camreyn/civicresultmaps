import assert from "node:assert/strict";
import test from "node:test";
import { inspectAlaskaPrecinctBlobPublicationPlan } from "../../scripts/lib/ak-precinct-blob-publication.mjs";
import { buildAlaskaTestReleaseFixture } from "./ak-precinct-release-fixture.mjs";

const { prepared } = await buildAlaskaTestReleaseFixture({ write: true });
const plan = inspectAlaskaPrecinctBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Alaska Blob plan pins all 160 House District assets before four indexes", () => {
  assert.equal(plan.artifacts.length, 164);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "parent").length, 160);
  assert.equal(plan.artifacts.filter((artifact) => artifact.kind === "index").length, 4);
  assert.ok(plan.artifacts.slice(0, 160).every((artifact) => artifact.kind === "parent"));
  assert.ok(plan.artifacts.slice(160).every((artifact) => artifact.kind === "index"));
  assert.ok(plan.artifacts.every((artifact) => artifact.pathname.startsWith("data/geography/ak/")));
  assert.equal(plan.decision, "NO_GO_PUBLICATION");
  assert.equal(plan.canonicalManifestChanged, false);
  assert.equal(plan.publicEligibilityChanged, false);
});

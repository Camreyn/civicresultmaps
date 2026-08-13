import assert from "node:assert/strict";
import test from "node:test";
import { inspectIowaPrecinctBlobPublicationPlan } from "../../scripts/lib/ia-precinct-blob-publication.mjs";
import { validateIowaBlobPublicationEvidence } from "../../scripts/lib/ia-precinct-publication.mjs";
import { buildIowaTestReleaseFixture } from "./ia-precinct-release-fixture.mjs";

const { prepared } = await buildIowaTestReleaseFixture({ write: true });
const blobPlan = inspectIowaPrecinctBlobPublicationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});
const deliveryOrigin = "https://example.public.blob.vercel-storage.com";
const evidence = {
  schemaVersion: 1,
  state: "IA",
  purpose: "ia-precinct-parent-scoped-immutable-geometry-publication",
  releaseCandidate: blobPlan.releaseCandidate,
  authorizationId: "ia-blob-publication-1",
  publishedAtUtc: "2026-08-13T00:00:00.000Z",
  deliveryOrigin,
  assetCount: blobPlan.artifacts.length,
  canonicalManifestChanged: false,
  publicEligibilityChanged: false,
  artifacts: blobPlan.artifacts.map((artifact) => ({
    ...artifact,
    url: `${deliveryOrigin}/${artifact.pathname}`,
    disposition: "created",
  })),
};

test("Iowa Blob evidence requires all 300 immutable artifacts", () => {
  const result = validateIowaBlobPublicationEvidence(
    evidence,
    blobPlan,
    Date.parse("2026-08-13T00:01:00.000Z"),
  );
  assert.equal(result.assetCount, 300);
  assert.equal(result.deliveryOrigin, deliveryOrigin);
  const incomplete = { ...evidence, assetCount: 299 };
  assert.throws(
    () => validateIowaBlobPublicationEvidence(incomplete, blobPlan),
    /incomplete or incompatible/,
  );
});

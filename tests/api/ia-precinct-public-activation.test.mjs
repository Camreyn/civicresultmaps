import assert from "node:assert/strict";
import test from "node:test";
import { inspectIowaPublicActivationPlan } from "../../scripts/lib/ia-precinct-public-activation.mjs";
import { buildIowaTestReleaseFixture } from "./ia-precinct-release-fixture.mjs";

const { prepared } = await buildIowaTestReleaseFixture({ write: true });
const inspected = inspectIowaPublicActivationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Iowa static activation adds exactly three guarded manifests", () => {
  assert.equal(inspected.plan.manifests.length, 3);
  assert.deepEqual(inspected.plan.manifests.map((item) => item.year), [2016, 2020, 2024]);
  assert.equal(inspected.plan.trackedOutputs.length, 4);
  assert.ok(inspected.plan.trackedOutputs.every((output) => output.disposition === "activate"));
  assert.equal(inspected.plan.safety.productionMutationPerformed, false);
  assert.equal(inspected.plan.safety.publicEndpointsRemainDatabaseGated, true);
});

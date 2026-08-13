import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectIowaPublicActivationPlan } from "../../scripts/lib/ia-precinct-public-activation.mjs";
import { buildIowaTestReleaseFixture } from "./ia-precinct-release-fixture.mjs";

const coverage = JSON.parse(readFileSync(
  "data/precinct-geometry-coverage-inventory-2016.json",
  "utf8",
));
const existingIowaRow = coverage.states.find((row) => row.state === "IA");
const { prepared } = await buildIowaTestReleaseFixture({
  write: true,
  generatedAtUtc: existingIowaRow?.checkedAt,
});
const inspected = inspectIowaPublicActivationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Iowa static activation adds or verifies exactly three guarded manifests", () => {
  assert.equal(inspected.plan.manifests.length, 3);
  assert.deepEqual(inspected.plan.manifests.map((item) => item.year), [2016, 2020, 2024]);
  assert.equal(inspected.plan.trackedOutputs.length, 4);
  const dispositions = new Set(
    inspected.plan.trackedOutputs.map((output) => output.disposition),
  );
  assert.equal(dispositions.size, 1);
  assert.ok(["activate", "verified_existing"].includes([...dispositions][0]));
  assert.equal(inspected.plan.safety.productionMutationPerformed, false);
  assert.equal(inspected.plan.safety.publicEndpointsRemainDatabaseGated, true);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectWisconsinPublicActivationPlan } from "../../scripts/lib/wi-local-public-activation.mjs";
import { buildWisconsinTestReleaseFixture } from "./wi-local-release-fixture.mjs";

const coverage = JSON.parse(readFileSync(
  "data/precinct-geometry-coverage-inventory-2016.json",
  "utf8",
));
const existingWisconsinRow = coverage.states.find((row) => row.state === "WI");
const { prepared } = await buildWisconsinTestReleaseFixture({
  write: true,
  generatedAtUtc: existingWisconsinRow?.checkedAt,
});
const inspected = inspectWisconsinPublicActivationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Wisconsin static activation adds or verifies exactly three guarded manifests", () => {
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

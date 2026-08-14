import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectAlaskaPublicActivationPlan } from "../../scripts/lib/ak-precinct-public-activation.mjs";
import { buildAlaskaTestReleaseFixture } from "./ak-precinct-release-fixture.mjs";

const coverage = JSON.parse(readFileSync(
  "data/precinct-geometry-coverage-inventory-2016.json",
  "utf8",
));
const existingAlaskaRow = coverage.states.find((row) => row.state === "AK");
const { prepared } = await buildAlaskaTestReleaseFixture({
  write: true,
  generatedAtUtc: existingAlaskaRow?.checkedAt,
});
const inspected = inspectAlaskaPublicActivationPlan({
  packagePath: prepared.releaseCandidate.path,
  packageSha256: prepared.releaseCandidate.sha256,
});

test("Alaska static activation adds or verifies exactly four guarded manifests", () => {
  assert.equal(inspected.plan.manifests.length, 4);
  assert.deepEqual(inspected.plan.manifests.map((item) => item.year), [2012, 2016, 2020, 2024]);
  assert.equal(inspected.plan.trackedOutputs.length, 5);
  const dispositions = new Set(
    inspected.plan.trackedOutputs.map((output) => output.disposition),
  );
  assert.equal(dispositions.size, 1);
  assert.ok(["activate", "verified_existing"].includes([...dispositions][0]));
  assert.equal(inspected.plan.safety.productionMutationPerformed, false);
  assert.equal(inspected.plan.safety.publicEndpointsRemainDatabaseGated, true);
});

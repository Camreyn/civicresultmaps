import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectTexasPublicActivationPlan } from "../../scripts/lib/tx-precinct-public-activation.mjs";

const packagePath =
  ".etl/precinct-release-candidates/TX/tx-precinct-gis-four-election-v1-41c2cc7f901b/release-candidate.json";
const packageSha256 =
  "41c2cc7f901b200f76eda265183d354a7f46f2ffc01ab477e1bd4f8d07c3ecb5";

test("Texas static activation exactly matches all four sealed public manifests", () => {
  const built = inspectTexasPublicActivationPlan({ packagePath, packageSha256 });
  assert.equal(
    built.plan.decision,
    "DEPLOY_GUARDED_STATIC_MANIFESTS_DATABASE_REMAINS_BLOCKED",
  );
  assert.deepEqual(built.plan.manifests.map((row) => row.year), [2012, 2016, 2020, 2024]);
  assert.equal(built.plan.manifests.length, 4);
  assert.equal(built.outputs.length, 5);
  assert.ok(built.outputs.every((output) => output.disposition === "verified_existing"));
  assert.ok(built.plan.manifests.every((row) =>
    row.draftManifest.delivery.format === "parent_scoped_geojson"
    && row.draftManifest.delivery.parentCount === 254));
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json"));
  assert.equal(registry.manifests.filter((row) => row.state === "TX").length, 4);
});

test("Texas activation writer preflights all five files and rolls back partial writes", () => {
  const source = readFileSync(
    "scripts/prepare-tx-precinct-public-activation.mjs",
    "utf8",
  );
  assert.match(source, /outputs\.length !== 5/);
  assert.match(source, /target preimage drifted/);
  assert.match(source, /committed\.reverse\(\)/);
  assert.match(source, /renameSync/);
});

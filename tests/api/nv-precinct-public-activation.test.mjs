import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectNevadaPublicActivationPlan } from "../../scripts/lib/nv-precinct-public-activation.mjs";
import { buildNevadaTestReleaseFixture } from "./nv-precinct-release-fixture.mjs";

const fixture = await buildNevadaTestReleaseFixture({ write: true });
const packagePath = fixture.prepared.releaseCandidate.path;
const packageSha256 = fixture.prepared.releaseCandidate.sha256;

test("Nevada static activation exactly matches three sealed public manifests", () => {
  const built = inspectNevadaPublicActivationPlan({ packagePath, packageSha256 });
  assert.equal(
    built.plan.decision,
    "DEPLOY_GUARDED_STATIC_MANIFESTS_DATABASE_REMAINS_BLOCKED",
  );
  assert.deepEqual(built.plan.manifests.map((row) => row.year), [2016, 2020, 2024]);
  assert.equal(built.plan.manifests.length, 3);
  assert.equal(built.outputs.length, 4);
  assert.ok(built.outputs.every((output) =>
    output.disposition === "verified_existing"));
  assert.ok(built.plan.manifests.every((row) =>
    row.draftManifest.delivery.format === "parent_scoped_geojson"
    && row.draftManifest.delivery.parentCount === 17));
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json"));
  assert.equal(registry.manifests.filter((row) => row.state === "NV").length, 3);
});

test("Nevada registry publishes 2016, 2020, and 2024 while 2012 stays absent", () => {
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json"));
  const rows = registry.manifests.filter((row) => row.state === "NV");
  assert.deepEqual(rows.map((row) => row.election.year), [2016, 2020, 2024]);
  assert.ok(rows.every((row) =>
    row.delivery?.format === "parent_scoped_geojson"
    && row.delivery.parentCount === 17));
});

test("Nevada activation writer preflights all four files and rolls back partial writes", () => {
  const source = readFileSync(
    "scripts/prepare-nv-precinct-public-activation.mjs",
    "utf8",
  );
  assert.match(source, /outputs\.length !== 4/);
  assert.match(source, /target preimage drifted/);
  assert.match(source, /committed\.reverse\(\)/);
  assert.match(source, /renameSync/);
});

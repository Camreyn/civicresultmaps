import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const RETRIEVED_AT = "2026-08-12T23:00:00.000Z";
const YEARS = [
  { year: 2012, electionId: "2012-11-06-general", units: 1686, sourceUnits: 1687, manifestRelationships: 1, features: 0, total: 1582180 },
  { year: 2016, electionId: "2016-11-08-general", units: 1680, sourceUnits: 1680, manifestRelationships: 1680, features: 1680, total: 1566031 },
  { year: 2020, electionId: "2020-11-03-general", units: 1661, sourceUnits: 1661, manifestRelationships: 1661, features: 1661, total: 1690871 },
  { year: 2024, electionId: "2024-11-05-general", units: 1653, sourceUnits: 1653, manifestRelationships: 1653, features: 1653, total: 1663506 },
];

function base(spec) {
  return path.join("data", "precinct-geometry", "IA", spec.electionId);
}

test("Iowa official precinct-result artifacts replay byte-identically", { timeout: 120_000 }, () => {
  for (const spec of YEARS) {
    const output = execFileSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/collect-ia-precinct-results.mjs",
      `--year=${spec.year}`,
      `--retrieved-at=${RETRIEVED_AT}`,
      "--check",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const result = JSON.parse(output.trim());
    assert.equal(result.disposition, "verified_existing");
    assert.equal(result.rows, spec.units);
    assert.equal(result.totals.total, spec.total);
  }
});

test("Iowa manifests retain exact reviewed contracts and keep 2012 blocked", () => {
  for (const spec of YEARS) {
    const manifest = JSON.parse(readFileSync(path.join(base(spec), "manifest.json")));
    const schema = inspectPrecinctGeometryManifest(manifest);
    const artifacts = validateManifestArtifacts(manifest, {
      root: process.cwd(),
      skipDelivery: true,
    });
    assert.deepEqual(schema.errors, []);
    assert.deepEqual(artifacts.errors, []);
    assert.equal(manifest.state, "IA");
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.resultUnits, spec.sourceUnits);
    assert.equal(manifest.crosswalk.reviewedRelationshipRecords, spec.manifestRelationships);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, false);
  }
  const blocked = JSON.parse(readFileSync(path.join(base(YEARS[0]), "manifest.json")));
  assert.equal(blocked.crosswalk.status, "blocked");
  assert.match(blocked.validation.errors.join(" "), /complete election-effective 2012 precinct geometry/i);
});

test("Iowa reviewed geometry and crosswalks contain no election values", () => {
  for (const spec of YEARS.slice(1)) {
    const manifest = JSON.parse(readFileSync(path.join(base(spec), "manifest.json")));
    const geometry = JSON.parse(gunzipSync(readFileSync(manifest.normalization.artifact)));
    const crosswalk = JSON.parse(readFileSync(manifest.crosswalk.artifact));
    assert.equal(geometry.features.length, spec.features);
    assert.equal(crosswalk.rows.length, spec.units);
    assert.equal(new Set(geometry.features.map((feature) => feature.properties.CRM_PARENT_GEOID)).size, 99);
    assert.ok(geometry.features.every((feature) => /^19\d{3}$/.test(feature.properties.CRM_PARENT_GEOID)));
    assert.equal(/"(?:votes?|candidate|party|G\d{2}PRE)"/i.test(JSON.stringify(geometry)), false);
    assert.equal(/"(?:votes?|candidate|party|G\d{2}PRE)"/i.test(JSON.stringify(crosswalk)), false);
  }
});

test("Iowa secondary geometry retains exact redistribution evidence", () => {
  const evidence2020 = JSON.parse(readFileSync(path.join(base(YEARS[2]), "reviewed-source-evidence.json")));
  assert.equal(evidence2020.boundaryContext.derivationMethod, "secondary_reconstruction");
  assert.match(evidence2020.boundaryContext.licenseOrTerms, /Creative Commons Attribution 4\.0/);
  assert.ok(evidence2020.artifacts.some((artifact) => artifact.localArtifactPath.endsWith("dataverse-v24-license-evidence.json")));

  const evidence2024 = JSON.parse(readFileSync(path.join(base(YEARS[3]), "reviewed-source-evidence.json")));
  assert.match(evidence2024.boundaryContext.licenseOrTerms, /Non-Commercial/);
  assert.ok(evidence2024.artifacts.some((artifact) => artifact.localArtifactPath.endsWith("LICENSE")));
  assert.ok(evidence2024.artifacts.some((artifact) => artifact.localArtifactPath.endsWith("README.md")));
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";
import { assertMaine2024OfficialBoundaryFeatures } from "../../scripts/lib/me-local-geometry.mjs";

const RETRIEVED_AT = "2026-08-13T14:00:00Z";
const YEARS = [
  {
    year: 2012,
    electionId: "2012-11-06-general",
    sourceUnits: 545,
    units: 507,
    features: 507,
    excluded: 5,
    totalVotes: 710126,
    mappedVotes: 710118,
    vintageStatus: "unknown",
    reconciled: false,
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    sourceUnits: 532,
    units: 532,
    features: 532,
    excluded: 0,
    totalVotes: 743941,
    mappedVotes: 743941,
    vintageStatus: "election_date_confirmed",
    reconciled: true,
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    sourceUnits: 516,
    units: 516,
    features: 516,
    excluded: 0,
    totalVotes: 813742,
    mappedVotes: 813742,
    vintageStatus: "election_date_confirmed",
    reconciled: true,
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    sourceUnits: 512,
    units: 494,
    features: 494,
    excluded: 0,
    totalVotes: 824806,
    mappedVotes: 824806,
    vintageStatus: "election_date_confirmed",
    reconciled: true,
  },
];

function base(spec) {
  return `data/precinct-geometry/ME/${spec.electionId}`;
}

function paths(spec) {
  return [
    "source-evidence.json",
    "manifest.json",
    `normalized/me-${spec.year}-local-reporting-units.geojson.gz`,
    `normalized/me-${spec.year}-president-local-results.json.gz`,
    `crosswalk/me-${spec.year}-local-result-crosswalk.json`,
    `reports/me-${spec.year}-local-reporting-geometry-report.json`,
  ];
}

function bytes(spec) {
  return Object.fromEntries(paths(spec).map((entry) => [
    entry,
    readFileSync(path.join(base(spec), entry)),
  ]));
}

test("Maine four-election local-reporting artifacts replay byte-identically and stay fail-closed", { timeout: 180_000 }, () => {
  for (const spec of YEARS) {
    const before = bytes(spec);
    execFileSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/collect-me-local-reporting-geometry.mjs",
      `--year=${spec.year}`,
      `--retrieved-at=${RETRIEVED_AT}`,
    ], { stdio: "pipe" });
    const after = bytes(spec);
    for (const entry of paths(spec)) {
      assert.deepEqual(after[entry], before[entry], `${spec.year} ${entry} must replay byte-identically`);
    }

    const manifest = JSON.parse(after["manifest.json"]);
    const evidence = JSON.parse(after["source-evidence.json"]);
    const report = JSON.parse(after[`reports/me-${spec.year}-local-reporting-geometry-report.json`]);
    const geometry = JSON.parse(gunzipSync(after[`normalized/me-${spec.year}-local-reporting-units.geojson.gz`]));
    const results = JSON.parse(gunzipSync(after[`normalized/me-${spec.year}-president-local-results.json.gz`]));
    const crosswalk = JSON.parse(after[`crosswalk/me-${spec.year}-local-result-crosswalk.json`]);
    const artifactInspection = validateManifestArtifacts(manifest, { root: process.cwd() });
    const schemaInspection = inspectPrecinctGeometryManifest(manifest);

    assert.deepEqual(artifactInspection.errors, []);
    assert.deepEqual(schemaInspection.errors, []);
    assert.equal(artifactInspection.eligible, false);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.geography.level, "local_reporting_unit");
    assert.equal(manifest.geography.vintageStatus, spec.vintageStatus);
    assert.equal(manifest.validation.parentTotalsReconciled, spec.reconciled);
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.resultUnits, spec.units);
    assert.equal(manifest.crosswalk.matchedResultUnits, spec.units);
    assert.equal(report.source.sourceResultUnits, spec.sourceUnits);
    assert.equal(report.source.excludedResultUnits, spec.excluded);
    assert.equal(geometry.features.length, spec.features);
    assert.equal(results.rows.length, spec.units);
    assert.equal(results.exclusions.length, spec.excluded);
    assert.equal(crosswalk.rows.length, spec.units);
    assert.equal(evidence.resultIdentity.sourceTotals.totalVotes, spec.totalVotes);
    assert.equal(evidence.resultIdentity.mappedTotals.total, spec.mappedVotes);
    assert.ok(geometry.features.every((feature) =>
      /^23\d{3}$/.test(feature.properties.CRM_PARENT_GEOID)
      && !Object.keys(feature.properties).some((key) => /vote|candidate|party/i.test(key))));
    assert.equal(/"(?:votes?|candidate|party)"/i.test(JSON.stringify(crosswalk)), false);
    assert.ok(results.rows.every((row) =>
      row.total === row.democratic + row.republican + row.other));
  }
});

test("Maine uses official SOS votes without duplicating municipality totals across ward geometry", () => {
  for (const spec of YEARS.slice(1)) {
    const manifest = JSON.parse(readFileSync(path.join(base(spec), "manifest.json"), "utf8"));
    const results = JSON.parse(gunzipSync(readFileSync(
      path.join(base(spec), `normalized/me-${spec.year}-president-local-results.json.gz`),
    )));
    const crosswalk = JSON.parse(readFileSync(
      path.join(base(spec), `crosswalk/me-${spec.year}-local-result-crosswalk.json`),
      "utf8",
    ));
    assert.equal(manifest.source.authority.includes("Maine Secretary of State"), true);
    assert.equal(crosswalk.rows.length, results.rows.length);
    assert.ok(crosswalk.rows.every((row) =>
      row.relationships.length === 1
      && row.relationships[0].relationshipType === "one_to_one"
      && row.relationships[0].reviewStatus === "reviewed"));
    assert.equal(new Set(crosswalk.rows.map((row) => row.resultUnitCode)).size, crosswalk.rows.length);
  }

  const results2024 = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/ME/2024-11-05-general/normalized/me-2024-president-local-results.json.gz",
  )));
  assert.equal(results2024.rows.filter((row) => row.constituentSourceUnitIds.length > 1).length, 14);
  assert.equal(results2024.rows.flatMap((row) => row.constituentSourceUnitIds).length, 512);
});

test("Maine 2012 partial package exposes every omitted row and vote instead of claiming full reconciliation", () => {
  const results = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/ME/2012-11-06-general/normalized/me-2012-president-local-results.json.gz",
  )));
  const manifest = JSON.parse(readFileSync(
    "data/precinct-geometry/ME/2012-11-06-general/manifest.json",
    "utf8",
  ));
  const evidence = JSON.parse(readFileSync(
    "data/precinct-geometry/ME/2012-11-06-general/source-evidence.json",
    "utf8",
  ));
  const crosswalk = JSON.parse(readFileSync(
    "data/precinct-geometry/ME/2012-11-06-general/crosswalk/me-2012-local-result-crosswalk.json",
    "utf8",
  ));
  const geometry = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/ME/2012-11-06-general/normalized/me-2012-local-reporting-units.geojson.gz",
  )));
  const omittedVotes = results.exclusions.reduce((sum, row) => sum + row.total, 0);
  assert.equal(results.exclusions.length, 5);
  assert.equal(omittedVotes, 8);
  assert.equal(manifest.validation.rowLevelRenderingSafe, false);
  assert.equal(manifest.validation.parentTotalsReconciled, false);
  assert.match(manifest.validation.errors.join(" "), /lack uniquely attributable election geometry/i);
  assert.match(manifest.validation.errors.join(" "), /derivative.*redistribution permission/i);
  assert.match(manifest.source.licenseOrTerms, /no explicit derivative redistribution license/i);
  const artifactByPath = new Map(evidence.artifacts.map((artifact) => [artifact.localArtifactPath, artifact]));
  assert.equal(
    artifactByPath.get("data/precinct-geometry/ME/2012-11-06-general/raw/mggg/Maine.zip")?.sha256,
    "01d4e02c931f34598507348f3299730a955903b054dfd5cf62097ad47fb078eb",
  );
  assert.equal(
    artifactByPath.get("data/precinct-geometry/ME/2012-11-06-general/raw/mggg/README.md")?.sha256,
    "82cb8ecea985045d9be5d61f242802b39f6090d63da84da4b3d0b46ac6ee7594",
  );
  assert.ok(artifactByPath.has(
    "data/precinct-geometry/ME/2012-11-06-general/raw/maine-geolibrary/metwp24s-2015-archive.zip",
  ));
  assert.ok(artifactByPath.has(
    "data/precinct-geometry/ME/2012-11-06-general/raw/maine-geolibrary/reuse-statute.html",
  ));
  assert.ok(crosswalk.rows.every((row) => row.relationships[0].matchMethod === "reviewed_name"));
  assert.deepEqual(
    [...new Set(geometry.features.map((feature) => feature.properties.SOURCE_GEOMETRY_METHOD))].sort(),
    ["mggg_reviewed_aggregate_identity", "mggg_reviewed_name_identity"],
  );
});

test("Maine 2024 T22 MD gap is temporally bracketed and secondary vote values never enter normalized geometry", () => {
  const evidence = JSON.parse(readFileSync(
    "data/precinct-geometry/ME/2024-11-05-general/source-evidence.json",
    "utf8",
  ));
  const geometry = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/ME/2024-11-05-general/normalized/me-2024-local-reporting-units.geojson.gz",
  )));
  const nytSource = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/ME/2024-11-05-general/raw/nytimes/ME-precincts-with-results.geojson.gz",
  )));
  assert.equal(evidence.geometryContext.gapBoundaryComparison.disposition, "reviewed_unchanged_temporal_bracket");
  assert.ok(evidence.geometryContext.gapBoundaryComparison.relativeAreaDelta < 0.00001);
  assert.ok(evidence.geometryContext.gapBoundaryComparison.maximumBoundsDeltaDegrees < 0.00002);
  assert.equal(/votes_(?:dem|rep|total)/i.test(JSON.stringify(geometry)), false);
  assert.doesNotThrow(() => assertMaine2024OfficialBoundaryFeatures(nytSource));
  assert.throws(() => assertMaine2024OfficialBoundaryFeatures({
    ...nytSource,
    features: nytSource.features.map((feature, index) => index === 0
      ? { ...feature, properties: { ...feature.properties, official_boundary: false } }
      : feature),
  }), /official_boundary=true/);
});

test("Maine collector rejects an invalid or future retrieval timestamp before writing", () => {
  for (const retrievedAt of ["invalid", "2999-01-01T00:00:00Z"]) {
    assert.throws(() => execFileSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/collect-me-local-reporting-geometry.mjs",
      "--year=2024",
      `--retrieved-at=${retrievedAt}`,
    ], { stdio: "pipe" }), /Command failed/);
  }
});

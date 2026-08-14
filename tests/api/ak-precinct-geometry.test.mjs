import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const RETRIEVED_AT = "2026-08-14T04:30:00Z";
const YEARS = [
  { year: 2012, electionId: "2012-11-06-general", units: 558, features: 438, nonGeographic: 120, president: 300495, comparison: "us_house", comparisonVotes: 289804 },
  { year: 2016, electionId: "2016-11-08-general", units: 562, features: 441, nonGeographic: 121, president: 318608, comparison: "senate", comparisonVotes: 311441 },
  { year: 2020, electionId: "2020-11-03-general", units: 562, features: 441, nonGeographic: 121, president: 359530, comparison: "senate", comparisonVotes: 354587 },
  { year: 2024, electionId: "2024-11-05-general", units: 523, features: 402, nonGeographic: 121, president: 338177, comparison: "us_house", comparisonVotes: 328805 },
];

function base(spec) {
  return `data/precinct-geometry/AK/${spec.electionId}`;
}

function derivedPaths(spec) {
  return [
    "source-evidence.json",
    "manifest.json",
    `normalized/ak-${spec.year}-precincts.geojson.gz`,
    `normalized/ak-${spec.year}-official-precinct-results.json.gz`,
    `crosswalk/ak-${spec.year}-precinct-result-crosswalk.json`,
    `reports/ak-${spec.year}-precinct-geometry-report.json`,
  ];
}

function derivedBytes(spec) {
  return Object.fromEntries(derivedPaths(spec).map((entry) => [
    entry,
    readFileSync(path.join(base(spec), entry)),
  ]));
}

test("Alaska four-election precinct artifacts replay byte-identically and stay fail-closed", { timeout: 180_000 }, () => {
  for (const spec of YEARS) {
    const before = derivedBytes(spec);
    execFileSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/collect-ak-precinct-geometry.mjs",
      `--year=${spec.year}`,
      `--retrieved-at=${RETRIEVED_AT}`,
    ], { stdio: "pipe" });
    const after = derivedBytes(spec);
    for (const entry of derivedPaths(spec)) {
      assert.deepEqual(after[entry], before[entry], `${spec.year} ${entry} must replay byte-identically`);
    }

    const manifest = JSON.parse(after["manifest.json"]);
    const evidence = JSON.parse(after["source-evidence.json"]);
    const report = JSON.parse(after[`reports/ak-${spec.year}-precinct-geometry-report.json`]);
    const geometry = JSON.parse(gunzipSync(after[`normalized/ak-${spec.year}-precincts.geojson.gz`]));
    const results = JSON.parse(gunzipSync(after[`normalized/ak-${spec.year}-official-precinct-results.json.gz`]));
    const crosswalk = JSON.parse(after[`crosswalk/ak-${spec.year}-precinct-result-crosswalk.json`]);
    const artifactInspection = validateManifestArtifacts(manifest, { root: process.cwd() });
    const schemaInspection = inspectPrecinctGeometryManifest(manifest);

    assert.deepEqual(artifactInspection.errors, []);
    assert.deepEqual(schemaInspection.errors, []);
    assert.equal(artifactInspection.eligible, false);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, true);
    assert.equal(manifest.geography.level, "precinct");
    assert.equal(manifest.geography.parentLevel, "house_district");
    assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.resultUnits, spec.units);
    assert.equal(manifest.crosswalk.matchedResultUnits, spec.features);
    assert.equal(manifest.crosswalk.nonGeographicResultUnits, spec.nonGeographic);
    assert.equal(geometry.features.length, spec.features);
    assert.equal(crosswalk.rows.length, spec.units);
    assert.equal(results.sourceUnitCount, spec.units);
    assert.equal(results.contestTotals.president.totalVotes, spec.president);
    assert.equal(results.contestTotals[spec.comparison].totalVotes, spec.comparisonVotes);
    assert.equal(report.results.contestTotals.president.totalVotes, spec.president);
    assert.equal(evidence.crossYearComparison.directPrecinctComparisonSafe, false);
    assert.ok(geometry.features.every((feature) => (
      /^HD\d{2}$/.test(feature.properties.CRM_PARENT_GEOID)
      && /^\d{2}-\d{3}$/.test(feature.properties.CRM_FEATURE_ID)
      && !Object.keys(feature.properties).some((key) => /vote|candidate|party/i.test(key))
    )));
    assert.equal(/"(?:votes?|candidate|party)"/i.test(JSON.stringify(crosswalk)), false);
    assert.equal(
      new Set(crosswalk.rows.filter((row) => row.isGeographic).map((row) => row.resultUnitCode)).size,
      spec.features,
    );
    assert.ok(crosswalk.rows.filter((row) => !row.isGeographic).every((row) => (
      row.relationships.length === 1
      && row.relationships[0].sourceFeatureId === null
      && row.relationships[0].relationshipType === "non_geographic"
      && row.exclusionReason === "non_geographic_election_administration_bucket"
    )));
  }
});

test("Alaska 2012 source correction is explicit, topology-confirmed, and leaves no geographic result unmatched", () => {
  const spec = YEARS[0];
  const evidence = JSON.parse(readFileSync(path.join(base(spec), "source-evidence.json"), "utf8"));
  const crosswalk = JSON.parse(readFileSync(
    path.join(base(spec), "crosswalk/ak-2012-precinct-result-crosswalk.json"),
    "utf8",
  ));
  const geometry = JSON.parse(gunzipSync(readFileSync(
    path.join(base(spec), "normalized/ak-2012-precincts.geojson.gz"),
  )));
  assert.deepEqual(evidence.geometryContext.correction, {
    originalSourceId: "36-616",
    correctedSourceId: "36-040",
    official2012Name: "Lake Iliamna No.1",
    confirmationSourceId: "37-726",
    confirmationSourceName: "37-726 LAKE ILIAMNA NO. 1",
    confirmationMethod: "identical_area_population_and_topology_in_official_2013_plan",
  });
  assert.deepEqual(evidence.geometryContext.excludedSourceFeatures, [{
    sourceRecordId: 1,
    reason: "blank_zero_population_non_precinct_source_artifact",
  }]);
  const corrected = geometry.features.find((feature) => feature.properties.CRM_FEATURE_ID === "36-040");
  assert.ok(corrected);
  assert.equal(corrected.properties.SOURCE_ORIGINAL_PRECINCT_ID, "36-616");
  const correctedCrosswalk = crosswalk.rows.find((row) => row.sourceUnitId === "36-040");
  assert.equal(correctedCrosswalk.relationships[0].matchMethod, "official_crosswalk");
  assert.equal(crosswalk.rows.filter((row) => row.isGeographic && row.relationships.length !== 1).length, 0);
});

test("Alaska preserves every non-geographic bucket without assigning it to a polygon", () => {
  for (const spec of YEARS) {
    const results = JSON.parse(gunzipSync(readFileSync(
      path.join(base(spec), `normalized/ak-${spec.year}-official-precinct-results.json.gz`),
    )));
    const crosswalk = JSON.parse(readFileSync(
      path.join(base(spec), `crosswalk/ak-${spec.year}-precinct-result-crosswalk.json`),
      "utf8",
    ));
    const nonGeographicCodes = new Set(
      crosswalk.rows.filter((row) => !row.isGeographic).map((row) => row.resultUnitCode),
    );
    assert.equal(nonGeographicCodes.size, spec.nonGeographic);
    assert.equal(
      new Set(results.rows.filter((row) => nonGeographicCodes.has(row.resultUnitCode)).map((row) => row.resultUnitCode)).size,
      spec.nonGeographic,
    );
  }
});

test("Alaska election vintages are independent rather than treated as an apples-to-apples precinct series", () => {
  const manifests = YEARS.map((spec) => JSON.parse(readFileSync(path.join(base(spec), "manifest.json"), "utf8")));
  assert.equal(new Set(manifests.map((manifest) => manifest.geography.boundaryVintage)).size, 3);
  assert.deepEqual(manifests.map((manifest) => manifest.election.year), [2012, 2016, 2020, 2024]);
  for (const manifest of manifests) {
    assert.match(manifest.caveats.join(" "), /cross-year trend comparison requires a separate reviewed common-geography crosswalk/i);
  }
  assert.notEqual(manifests[0].normalization.sha256, manifests[1].normalization.sha256);
  assert.notEqual(manifests[2].normalization.sha256, manifests[3].normalization.sha256);
});

test("Alaska coverage ledgers activate all four reviewed packages", () => {
  const inventoryPaths = new Map([
    [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
    [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
    [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
    [2024, "data/precinct-geometry-coverage-inventory.json"],
  ]);
  for (const spec of YEARS) {
    const inventory = JSON.parse(readFileSync(inventoryPaths.get(spec.year), "utf8"));
    const row = inventory.states.find((candidate) => candidate.state === "AK");
    assert.ok(row, `${spec.year} Alaska coverage row is required`);
    assert.equal(row.electionId, spec.electionId);
    assert.equal(row.programStatus, "reviewed");
    assert.equal(row.disposition, "mapped");
    assert.deepEqual(row.geometry.manifestIds, [
      `ak-${spec.electionId}-precinct-geometry-candidate-v1`,
    ]);
    assert.equal(row.geometry.featureCount, spec.features);
    assert.equal(row.geometry.publicEligibleManifestCount, 1);
    assert.equal(row.crosswalk.resultUnits, spec.units);
    assert.equal(row.crosswalk.matchedResultUnits, spec.features);
    assert.equal(row.crosswalk.nonGeographicResultUnits, spec.nonGeographic);
    assert.deepEqual(row.blockers, []);
    assert.equal(
      inventory.summary.publicEligibleJurisdictions,
      inventory.states.filter((candidate) => (
        Number(candidate.geometry?.publicEligibleManifestCount ?? 0) > 0
      )).length,
    );
  }
});

test("Alaska 2020 restores all official write-ins while 2024 discloses its comparison-only write-in gap", () => {
  const results2020 = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/AK/2020-11-03-general/normalized/ak-2020-official-precinct-results.json.gz",
  )));
  const evidence2024 = JSON.parse(readFileSync(
    "data/precinct-geometry/AK/2024-11-05-general/source-evidence.json",
    "utf8",
  ));
  const presidentWriteIns = results2020.rows
    .filter((row) => row.office === "president" && row.partyCode === "WRI")
    .reduce((sum, row) => sum + row.votes, 0);
  const senateWriteIns = results2020.rows
    .filter((row) => row.office === "senate" && row.partyCode === "WRI")
    .reduce((sum, row) => sum + row.votes, 0);
  assert.equal(presidentWriteIns, 1961);
  assert.equal(senateWriteIns, 601);
  assert.equal(evidence2024.resultIdentity.comparisonContestComplete, false);
  assert.equal(evidence2024.resultIdentity.comparisonContestKnownStatewideWriteInGap, 750);
  assert.equal(evidence2024.resultIdentity.contestTotals.president.totalVotes, 338177);
});

test("Alaska collector rejects invalid year and retrieval timestamps before writing", () => {
  for (const args of [
    ["--year=2013", `--retrieved-at=${RETRIEVED_AT}`],
    ["--year=2024", "--retrieved-at=invalid"],
    ["--year=2024", "--retrieved-at=2999-01-01T00:00:00Z"],
  ]) {
    assert.throws(() => execFileSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/collect-ak-precinct-geometry.mjs",
      ...args,
    ], { stdio: "pipe" }), /Command failed/);
  }
});

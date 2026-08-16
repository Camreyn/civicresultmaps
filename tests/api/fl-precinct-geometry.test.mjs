import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";
import { FLORIDA_RAW_SOURCE_PINS, FLORIDA_REVIEWED_AT } from "../../scripts/lib/fl-precinct-geometry.mjs";

const YEARS = Object.freeze([
  { year: 2012, electionId: "2012-11-06-general", manifestId: "fl-2012-11-06-precinct-geometry-unavailable-v1", rawFeatures: 9435, features: 0, sourceUnits: 6319, mapped: 0, excluded: 6319, noData: 0, total: 8492336, mappedTotal: 0, excludedTotal: 8492336, safe: false },
  { year: 2016, electionId: "2016-11-08-general", manifestId: "fl-2016-11-08-reviewed-precinct-geometry-v1", rawFeatures: 5967, features: 5962, sourceUnits: 5870, mapped: 5852, excluded: 18, noData: 110, total: 9498093, mappedTotal: 9488349, excludedTotal: 9744, safe: true },
  { year: 2020, electionId: "2020-11-03-general", manifestId: "fl-2020-11-03-reviewed-precinct-geometry-v1", rawFeatures: 6010, features: 6010, sourceUnits: 6097, mapped: 5989, excluded: 17, noData: 21, total: 11090844, mappedTotal: 11088665, excludedTotal: 2179, safe: true },
  { year: 2024, electionId: "2024-11-05-general", manifestId: "fl-2024-11-05-reviewed-precinct-geometry-v1", rawFeatures: 5583, features: 5583, sourceUnits: 5712, mapped: 5583, excluded: 126, noData: 0, total: 10935466, mappedTotal: 10917518, excludedTotal: 17948, safe: true },
]);

const absolute = (root, relativePath) => path.join(root, ...relativePath.split("/"));
const base = (spec) => "data/precinct-geometry/FL/" + spec.electionId;
const paths = (spec) => ({
  manifest: base(spec) + "/manifest.json",
  evidence: base(spec) + "/source-evidence.json",
  report: base(spec) + "/reports/fl-" + spec.year + "-precinct-geometry-report.json",
  results: base(spec) + "/normalized/fl-" + spec.year + "-president-results.json.gz",
  geometry: base(spec) + "/normalized/fl-" + spec.year + (spec.year === 2012 ? "-no-approved-precinct-geometry.json" : "-reviewed-precinct-geometry.geojson.gz"),
  crosswalk: base(spec) + "/crosswalk/fl-" + spec.year + "-result-to-geometry-review.json",
});

function parse(root, spec) {
  const target = paths(spec);
  return {
    manifest: JSON.parse(readFileSync(absolute(root, target.manifest), "utf8")),
    evidence: JSON.parse(readFileSync(absolute(root, target.evidence), "utf8")),
    report: JSON.parse(readFileSync(absolute(root, target.report), "utf8")),
    results: JSON.parse(gunzipSync(readFileSync(absolute(root, target.results))).toString("utf8")),
    geometry: spec.year === 2012
      ? JSON.parse(readFileSync(absolute(root, target.geometry), "utf8"))
      : JSON.parse(gunzipSync(readFileSync(absolute(root, target.geometry))).toString("utf8")),
    crosswalk: JSON.parse(readFileSync(absolute(root, target.crosswalk), "utf8")),
  };
}

function copyIntoRoot(targetRoot, relativePath) {
  const target = absolute(targetRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(absolute(process.cwd(), relativePath), target);
}

function copyReplayInputs(targetRoot) {
  for (const relativePath of Object.keys(FLORIDA_RAW_SOURCE_PINS)) copyIntoRoot(targetRoot, relativePath);
  for (const relativePath of [
    "data/precinct-geometry/FL/2016-11-08-general/raw/vest/dataverse-license-evidence.json",
    "data/precinct-geometry/FL/2020-11-03-general/raw/vest/dataverse-license-evidence.json",
    "scripts/collect-fl-precinct-geometry.mjs",
    "scripts/lib/fl-precinct-geometry.mjs",
    "scripts/lib/precinct-geometry-validation.mjs",
    "src/lib/precinct-crosswalk.ts",
    "src/lib/precinct-geography.ts",
    "src/lib/precinct-source-package.ts",
  ]) copyIntoRoot(targetRoot, relativePath);
}

function replay(root, year) {
  return execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/collect-fl-precinct-geometry.mjs",
    "--year=" + year,
    "--retrieved-at=" + FLORIDA_REVIEWED_AT,
  ], { cwd: root, stdio: "pipe", timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
}

function assertVoteFreeProperties(value, context) {
  for (const [key, child] of Object.entries(value ?? {})) {
    assert.doesNotMatch(key, /^(?:G\d{2}|votes?|totalvotes?|candidate|party|pct_dem|pct_rep)/i, context + " contains election-value property " + key);
    if (child && typeof child === "object") assertVoteFreeProperties(child, context + "." + key);
  }
}

test("Florida four-year source packages replay byte-identically and reject raw tampering before writes", { timeout: 600_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "fl-replay-"));
  try {
    copyReplayInputs(alternateRoot);
    for (const spec of YEARS) replay(alternateRoot, spec.year);
    for (const spec of YEARS) {
      for (const relativePath of Object.values(paths(spec))) {
        assert.deepEqual(readFileSync(absolute(alternateRoot, relativePath)), readFileSync(absolute(process.cwd(), relativePath)), spec.year + " " + relativePath + " must replay byte-identically");
      }
    }
    const manifestPath = paths(YEARS[1]).manifest;
    const before = readFileSync(absolute(alternateRoot, manifestPath));
    const rawPath = YEARS[1].year === 2016 ? "data/precinct-geometry/FL/2016-11-08-general/raw/vest/fl_2016.zip" : "";
    writeFileSync(absolute(alternateRoot, rawPath), Buffer.concat([readFileSync(absolute(alternateRoot, rawPath)), Buffer.from("TAMPER")]));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/collect-fl-precinct-geometry.mjs", "--year=2016", "--retrieved-at=" + FLORIDA_REVIEWED_AT], { cwd: alternateRoot, encoding: "utf8", timeout: 300_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + "\n" + result.stderr, /raw source drifted before derived writes/i);
    assert.deepEqual(readFileSync(absolute(alternateRoot, manifestPath)), before);
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("Florida packages preserve the official result universe while keeping 2012 fail closed", () => {
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json", "utf8"));
  assert.deepEqual(registry.manifests.filter((manifest) => manifest.state === "FL"), []);
  for (const spec of YEARS) {
    const { manifest, evidence, report, results, geometry, crosswalk } = parse(process.cwd(), spec);
    assert.equal(manifest.id, spec.manifestId);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, spec.safe);
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.matchedResultUnits, spec.mapped);
    assert.equal(manifest.crosswalk.reviewedNoDataFeatures, spec.noData);
    assert.equal(results.sourceUnitCount, spec.sourceUnits);
    assert.equal(results.colorableUnitCount, spec.mapped);
    assert.equal(results.excludedUnitCount, spec.excluded);
    assert.equal(results.totals.total, spec.total);
    assert.equal(results.mappedTotals.total, spec.mappedTotal);
    assert.equal(results.excludedTotals.total, spec.excludedTotal);
    assert.equal(results.mappedTotals.total + results.excludedTotals.total, results.totals.total);
    assert.equal(results.rows.length, spec.mapped);
    assert.equal(results.exclusions.length, spec.excluded);
    assert.equal(evidence.resultUniverse.sourceUnits, spec.sourceUnits);
    assert.equal(evidence.geometryReview.rawFeatures, spec.rawFeatures);
    assert.equal(evidence.geometryReview.normalizedFeatures, spec.features);
    assert.equal(report.publicDeliveryAuthorized, false);
    assert.equal(crosswalk.rows.length, spec.safe ? spec.mapped : spec.sourceUnits);
    assert.equal(crosswalk.reconciliation.status, spec.safe ? "passed" : "not_run");
    const inspection = validateManifestArtifacts(manifest, { root: process.cwd(), skipDelivery: true });
    assert.deepEqual(inspection.errors, []);
    if (spec.safe) {
      assert.equal(geometry.features.length, spec.features);
      assert.equal(new Set(geometry.features.map((feature) => feature.properties.CRM_PARENT_GEOID + "|" + feature.properties.CRM_FEATURE_ID)).size, spec.features);
      for (const feature of geometry.features) {
        assert.match(feature.properties.CRM_PARENT_GEOID, /^12\d{3}$/);
        assertVoteFreeProperties(feature.properties, spec.year + " " + feature.properties.CRM_FEATURE_ID);
      }
    } else {
      assert.equal(geometry.normalizedFeatureCount, 0);
      assert.equal(geometry.diagnosticCandidateFeatureCount, 9435);
      assert.equal(manifest.crosswalk.pendingReview, undefined);
      assert.equal(manifest.crosswalk.relationships.pendingReview, spec.sourceUnits);
    }
  }
});

test("Florida coverage inventories expose reviewed candidates without public eligibility", () => {
  const inventories = new Map([
    [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
    [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
    [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
    [2024, "data/precinct-geometry-coverage-inventory.json"],
  ]);
  for (const spec of YEARS) {
    const inventory = JSON.parse(readFileSync(inventories.get(spec.year), "utf8"));
    const row = inventory.states.find((entry) => entry.state === "FL");
    assert.ok(row, "Florida " + spec.year + " inventory row is required");
    assert.equal(row.electionId, spec.electionId);
    assert.equal(row.programStatus, "reviewed");
    assert.equal(row.disposition, spec.safe ? "mapped" : "blocked");
    assert.deepEqual(row.geometry.manifestIds, [spec.manifestId]);
    assert.equal(row.geometry.featureCount, spec.features);
    assert.equal(row.geometry.publicEligibleManifestCount, 0);
    assert.equal(row.crosswalk.resultUnits, spec.safe ? spec.mapped : spec.sourceUnits);
    assert.equal(row.crosswalk.matchedResultUnits, spec.mapped);
  }
});

test("Florida reviewed joins use only exact identities, whole source-component sums, or unique official signatures", () => {
  const sixteen = parse(process.cwd(), YEARS[1]);
  assert.deepEqual(sixteen.evidence.geometryReview.methods, { exactOfficialId: 5841, reviewedVoteAlias: 6, reviewedSourceUnion: 5 });
  assert.equal(sixteen.evidence.resultUniverse.duplicateCandidateRowsDiscarded, 107);
  assert.equal(sixteen.geometry.features.filter((feature) => feature.properties.SOURCE_GEOMETRY_METHOD === "reviewed_no_data").length, 110);

  const twenty = parse(process.cwd(), YEARS[2]);
  assert.deepEqual(twenty.evidence.geometryReview.methods, { exactOfficialId: 5214, officialComponentAggregation: 775 });
  assert.equal(twenty.geometry.features.filter((feature) => feature.properties.SOURCE_GEOMETRY_METHOD === "reviewed_no_data").length, 21);
  assert.ok(twenty.results.rows.some((row) => row.parentGeoid === "12086" && row.sourceComponentUnitIds.length > 1));

  const twentyFour = parse(process.cwd(), YEARS[3]);
  assert.deepEqual(twentyFour.evidence.geometryReview.methods, { exactOfficialId: 5391, officialComponentAggregation: 3, uniqueFullSignature: 189, uniqueMajorSignature: 0 });
  assert.equal(twentyFour.evidence.geometryReview.officialBoundaryFeatures, 4319);
  assert.equal(twentyFour.evidence.geometryReview.generatedBoundaryFeatures, 1264);
  assert.equal(twentyFour.geometry.features.filter((feature) => feature.properties.SOURCE_OFFICIAL_BOUNDARY === true).length, 4319);
  assert.ok(twentyFour.results.rows.every((row) => row.total === row.democratic + row.republican + row.other));
});

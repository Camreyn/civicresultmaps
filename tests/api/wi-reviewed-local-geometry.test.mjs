import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildWisconsinReviewedModel,
  summarizeWisconsinModel,
  WISCONSIN_RAW_SOURCE_PINS,
} from "../../scripts/lib/wi-reviewed-local-geometry.mjs";
import {
  resolveWisconsinWardRelationships,
  wisconsinWardExpressionAlternatives,
} from "../../scripts/lib/wi-ward-reporting-units.mjs";

const EXPECTED = {
  2012: { sourceResultUnits: 3525, sourceGeometryFeatures: 0, normalizedFeatures: 0, mappedResultUnits: 0, excludedResultUnits: 3525, noDataFeatures: 0, officialVotes: 3047999, mappedVotes: 0 },
  2016: { sourceResultUnits: 3636, sourceGeometryFeatures: 6872, normalizedFeatures: 3648, mappedResultUnits: 3626, excludedResultUnits: 10, noDataFeatures: 22, officialVotes: 2976150, mappedVotes: 2976150 },
  2020: { sourceResultUnits: 3698, sourceGeometryFeatures: 7090, normalizedFeatures: 3705, mappedResultUnits: 3696, excludedResultUnits: 2, noDataFeatures: 9, officialVotes: 3298041, mappedVotes: 3298041 },
  2024: { sourceResultUnits: 3603, sourceGeometryFeatures: 3503, normalizedFeatures: 3503, mappedResultUnits: 3503, excludedResultUnits: 100, noDataFeatures: 0, officialVotes: 3422918, mappedVotes: 3422918 },
};

const YEAR_PATHS = new Map([
  [2012, "2012-11-06-general"],
  [2016, "2016-11-08-general"],
  [2020, "2020-11-03-general"],
  [2024, "2024-11-05-general"],
]);

function derivedPaths(year) {
  const base = `data/precinct-geometry/WI/${YEAR_PATHS.get(year)}`;
  return [
    `${base}/manifest.json`,
    `${base}/source-evidence.json`,
    `${base}/normalized/wi-${year}-reviewed-local-reporting-geometry.geojson.gz`,
    `${base}/normalized/wi-${year}-official-president-results.json.gz`,
    `${base}/crosswalk/wi-${year}-result-to-geometry-review.json`,
    `${base}/reports/wi-${year}-local-reporting-geometry-review.json`,
  ];
}

function copyFileToRoot(relativePath, targetRoot) {
  const target = path.join(targetRoot, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(relativePath, target);
}

function copyReplayInputs(targetRoot) {
  for (const relativePath of Object.keys(WISCONSIN_RAW_SOURCE_PINS)) copyFileToRoot(relativePath, targetRoot);
  for (const relativePath of [
    "scripts/build-wi-reviewed-local-geometry.mjs",
    "scripts/lib/wi-reviewed-local-geometry.mjs",
    "scripts/lib/wi-ward-reporting-units.mjs",
    "scripts/lib/precinct-geometry-validation.mjs",
    "src/lib/precinct-crosswalk.ts",
    "src/lib/precinct-geography.ts",
    "src/lib/precinct-source-package.ts",
  ]) copyFileToRoot(relativePath, targetRoot);
}

function runBuilder(root) {
  return execFileSync(process.execPath, ["--experimental-strip-types", "scripts/build-wi-reviewed-local-geometry.mjs"], {
    cwd: root,
    stdio: "pipe",
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

test("Wisconsin ward grammar preserves ranges, suffixes, and explicit chains", () => {
  assert.deepEqual(wisconsinWardExpressionAlternatives("1-3"), [["1", "3"], ["1", "2", "3"]]);
  assert.ok(wisconsinWardExpressionAlternatives("1-5A").some((value) => value.join(",") === "1,2,3,4,5A"));
  assert.deepEqual(wisconsinWardExpressionAlternatives("5-6-9-12"), [["5", "6", "9", "12"]]);
});

test("Wisconsin reviewed overrides are explicit and never duplicate a source feature", () => {
  const polygon = (x) => ({ type: "Polygon", coordinates: [[[x, 0], [x + 0.5, 0], [x + 0.5, 0.5], [x, 0.5], [x, 0]]] });
  const value = resolveWisconsinWardRelationships({
    resultRows: [{ countyName: "Kenosha", municipalityName: "CITY OF SAMPLE", reportingUnitLabel: "CITY OF SAMPLE Ward 16" }],
    sourceFeatures: [{ type: "Feature", properties: { county: "Kenosha", fips: "55059", ctv: "C", municipality: "Sample", ward: "5001", id: "malformed" }, geometry: polygon(0) }],
    fields: { countyName: "county", countyFips: "fips", ctv: "ctv", municipalityName: "municipality", wardId: "ward", featureId: "id" },
    sourceWardOverrides: { malformed: "16" },
    resultWardOverrides: { "Kenosha|CITY OF SAMPLE Ward 16": { wardIds: ["16"], note: "Reviewed test correction." } },
  });
  assert.equal(value.summary.resolvedResultRows, 1);
  assert.equal(value.resolved[0].method, "reviewed_explicit_ward_override");
});

test("all retained Wisconsin raw inputs are hash pinned", () => {
  const evidencedPaths = new Set();
  for (const yearPath of YEAR_PATHS.values()) {
    const evidence = JSON.parse(readFileSync(`data/precinct-geometry/WI/${yearPath}/source-evidence.json`, "utf8"));
    for (const artifact of evidence.artifacts) evidencedPaths.add(artifact.localArtifactPath);
  }
  for (const [file, [expectedBytes, expectedSha]] of Object.entries(WISCONSIN_RAW_SOURCE_PINS)) {
    const bytes = readFileSync(file);
    assert.equal(bytes.length, expectedBytes, file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha, file);
    if (file !== "data/wi-counties.geojson") assert.equal(evidencedPaths.has(file), true, `${file} must appear in source evidence`);
  }
});

test("Wisconsin four-year packages replay byte-identically", { timeout: 300_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "wi-replay-"));
  try {
    copyReplayInputs(alternateRoot);
    runBuilder(alternateRoot);
    for (const year of [2012, 2016, 2020, 2024]) {
      for (const relativePath of derivedPaths(year)) {
        assert.deepEqual(
          readFileSync(path.join(alternateRoot, ...relativePath.split("/"))),
          readFileSync(relativePath),
          `${year} ${relativePath} must replay byte-identically`,
        );
      }
    }
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

for (const year of [2012, 2016, 2020, 2024]) {
  test(`Wisconsin ${year} reviewed model is deterministic and vote-preserving`, async () => {
    const model = await buildWisconsinReviewedModel(year);
    assert.deepEqual(summarizeWisconsinModel(model), { year, ...EXPECTED[year] });
    assert.equal(model.rows.exclusions.every((row) => year === 2012 || row.total === 0), true);
    if (year !== 2012) {
      assert.equal(model.rows.resultRows.length + model.rows.exclusions.length, model.official.rows.length);
      assert.equal(model.geometry.features.every((feature) => /^55\d{3}$/.test(feature.properties.CRM_PARENT_GEOID)), true);
      for (const feature of model.geometry.features) {
        const keys = Object.keys(feature.properties);
        assert.equal(keys.some((key) => /VOTE|PREDEM|PREREP|PRETOT|CANDIDATE|PARTY/i.test(key)), false);
      }
    }
  });
}

test("Wisconsin manifests expose only reviewed candidates and keep 2012 blocked", () => {
  for (const year of [2012, 2016, 2020, 2024]) {
    const manifest = JSON.parse(readFileSync(`data/precinct-geometry/WI/${year}-${year === 2012 ? "11-06" : year === 2016 ? "11-08" : year === 2020 ? "11-03" : "11-05"}-general/manifest.json`, "utf8"));
    assert.equal(manifest.geography.level, "local_reporting_unit");
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.rowLevelRenderingSafe, year !== 2012);
    assert.equal(manifest.crosswalk.status, year === 2012 ? "blocked" : "reviewed");
  }

  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json", "utf8"));
  assert.equal(registry.manifests.some((manifest) => manifest.state === "WI"), false);

  const inventories = new Map([
    [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
    [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
    [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
    [2024, "data/precinct-geometry-coverage-inventory.json"],
  ]);
  for (const [year, inventoryPath] of inventories) {
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    const row = inventory.states.find((entry) => entry.state === "WI");
    assert.ok(row, `${year} inventory must contain Wisconsin`);
    assert.equal(row.geometry.publicEligibleManifestCount, 0);
    assert.equal(row.disposition, year === 2012 ? "blocked" : "mapped");
    assert.equal(row.geometry.featureCount, EXPECTED[year].normalizedFeatures);
    assert.equal(row.crosswalk.resultUnits, EXPECTED[year].sourceResultUnits);
    assert.equal(row.crosswalk.matchedResultUnits, EXPECTED[year].mappedResultUnits);
  }
});

test("Wisconsin raw pin failure happens before any derived write", { timeout: 60_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "wi-tamper-"));
  try {
    copyReplayInputs(alternateRoot);
    const relativePath = "data/precinct-geometry/WI/2016-11-08-general/raw/vest/documentation.txt";
    const target = path.join(alternateRoot, ...relativePath.split("/"));
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from("\ntampered\n")]));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/build-wi-reviewed-local-geometry.mjs"], {
      cwd: alternateRoot,
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /raw source pin validation failed before writes/i);
    for (const yearPath of YEAR_PATHS.values()) {
      assert.equal(existsSync(path.join(alternateRoot, "data", "precinct-geometry", "WI", yearPath, "manifest.json")), false);
    }
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

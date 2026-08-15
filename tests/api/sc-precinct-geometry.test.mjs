import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const YEARS = [
  {
    year: 2012,
    electionId: "2012-11-06-general",
    manifestId: "sc-2012-11-06-rfa-archive-precinct-candidate-v1",
    rawFeatures: 2155,
    features: 2155,
    sourceUnits: 2477,
    geographic: 2140,
    administrative: 337,
    crosswalkColorable: 2140,
    colorable: 0,
    mapped: 0,
    nonGeographic: 337,
    unmatched: 2140,
    pending: 2140,
    noData: 2155,
    officialVotes: 1964118,
    mappedVotes: 0,
    administrativeVotes: 407095,
    ballots: 1982420,
    reviewed: false,
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    manifestId: "sc-2016-11-08-reviewed-precinct-geometry-v1",
    rawFeatures: 2235,
    features: 2234,
    sourceUnits: 2551,
    geographic: 2233,
    administrative: 318,
    crosswalkColorable: 2232,
    colorable: 2232,
    mapped: 2232,
    nonGeographic: 319,
    unmatched: 0,
    pending: 0,
    noData: 2,
    officialVotes: 2103027,
    mappedVotes: 1589961,
    administrativeVotes: 513066,
    ballots: 2123629,
    reviewed: true,
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    manifestId: "sc-2020-11-03-reviewed-precinct-geometry-v1",
    rawFeatures: 2263,
    features: 2263,
    sourceUnits: 2399,
    geographic: 2261,
    administrative: 138,
    crosswalkColorable: 2261,
    colorable: 2261,
    mapped: 2261,
    nonGeographic: 138,
    unmatched: 0,
    pending: 0,
    noData: 2,
    officialVotes: 2513329,
    mappedVotes: 2504220,
    administrativeVotes: 9109,
    ballots: 2532830,
    reviewed: true,
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    manifestId: "sc-2024-11-05-reviewed-precinct-geometry-v1",
    rawFeatures: 2308,
    features: 2308,
    sourceUnits: 2446,
    geographic: 2308,
    administrative: 138,
    crosswalkColorable: 2308,
    colorable: 2308,
    mapped: 2308,
    nonGeographic: 138,
    unmatched: 0,
    pending: 0,
    noData: 0,
    officialVotes: 2548140,
    mappedVotes: 2541877,
    administrativeVotes: 6263,
    ballots: 2566404,
    reviewed: true,
  },
];

function base(spec) {
  return `data/precinct-geometry/SC/${spec.electionId}`;
}

function derivedPaths(spec) {
  return [
    "manifest.json",
    "source-evidence.json",
    `normalized/sc-${spec.year}-reviewed-precinct-geometry.geojson.gz`,
    `normalized/sc-${spec.year}-official-president-results.json.gz`,
    `crosswalk/sc-${spec.year}-result-to-geometry-review.json`,
    `reports/sc-${spec.year}-precinct-geometry-review.json`,
  ];
}

function readAt(root, relativePath) {
  return readFileSync(path.join(root, ...relativePath.split("/")));
}

function parseYear(root, spec) {
  const prefix = base(spec);
  return {
    manifest: JSON.parse(readAt(root, `${prefix}/manifest.json`)),
    evidence: JSON.parse(readAt(root, `${prefix}/source-evidence.json`)),
    report: JSON.parse(readAt(root, `${prefix}/reports/sc-${spec.year}-precinct-geometry-review.json`)),
    geometry: JSON.parse(gunzipSync(readAt(root, `${prefix}/normalized/sc-${spec.year}-reviewed-precinct-geometry.geojson.gz`))),
    results: JSON.parse(gunzipSync(readAt(root, `${prefix}/normalized/sc-${spec.year}-official-president-results.json.gz`))),
    crosswalk: JSON.parse(readAt(root, `${prefix}/crosswalk/sc-${spec.year}-result-to-geometry-review.json`)),
  };
}

function copyReplayInputs(targetRoot) {
  for (const spec of YEARS) {
    cpSync(`${base(spec)}/raw`, path.join(targetRoot, ...`${base(spec)}/raw`.split("/")), { recursive: true });
  }
  for (const relativePath of [
    "data/sc-counties.geojson",
    "scripts/build-sc-reviewed-precincts.mjs",
    "scripts/lib/sc-precinct-geometry.mjs",
    "scripts/lib/precinct-geometry-validation.mjs",
    "src/lib/precinct-crosswalk.ts",
    "src/lib/precinct-geography.ts",
    "src/lib/precinct-source-package.ts",
  ]) {
    const target = path.join(targetRoot, ...relativePath.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(relativePath, target);
  }
}

function runBuilder(root) {
  return execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/build-sc-reviewed-precincts.mjs",
  ], {
    cwd: root,
    stdio: "pipe",
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function assertVoteFreeGeometry(value, context = "geometry") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertVoteFreeGeometry(entry, `${context}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /(?:^|_)(?:votes?|candidate|party|pct_dem|official_boundary)|^g(?:16|20)/i,
      `${context} contains source election-value field ${key}`,
    );
    assertVoteFreeGeometry(child, `${context}.${key}`);
  }
}

test("South Carolina four-year precinct packages replay byte-identically", { timeout: 300_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "sc-replay-"));
  try {
    copyReplayInputs(alternateRoot);
    runBuilder(alternateRoot);
    for (const spec of YEARS) {
      for (const relativePath of derivedPaths(spec)) {
        assert.deepEqual(
          readAt(alternateRoot, `${base(spec)}/${relativePath}`),
          readAt(process.cwd(), `${base(spec)}/${relativePath}`),
          `${spec.year} ${relativePath} must replay byte-identically`,
        );
      }
    }
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("South Carolina packages preserve official totals and fail closed where review is incomplete", () => {
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json", "utf8"));
  const southCarolinaManifests = registry.manifests
    .filter((manifest) => manifest.state === "SC")
    .sort((left, right) => left.election.year - right.election.year);
  assert.deepEqual(
    southCarolinaManifests.map((manifest) => manifest.election.year),
    [2016, 2020, 2024],
  );
  for (const manifest of southCarolinaManifests) {
    assert.equal(manifest.validation.status, "reviewed");
    assert.equal(manifest.validation.rowLevelRenderingSafe, true);
    assert.equal(manifest.delivery?.format, "parent_scoped_geojson");
  }
  const inventoryPaths = new Map([
    [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
    [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
    [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
    [2024, "data/precinct-geometry-coverage-inventory.json"],
  ]);

  for (const spec of YEARS) {
    const { manifest, evidence, report, geometry, results, crosswalk } = parseYear(process.cwd(), spec);
    assert.equal(manifest.id, spec.manifestId);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.resultUnits, spec.sourceUnits);
    assert.equal(manifest.crosswalk.colorableResultUnits, spec.crosswalkColorable);
    assert.equal(manifest.crosswalk.matchedResultUnits, spec.mapped);
    assert.equal(manifest.crosswalk.unmatchedResultUnits, spec.unmatched);
    assert.equal(manifest.crosswalk.nonGeographicResultUnits, spec.nonGeographic);
    assert.equal(manifest.crosswalk.relationships.pendingReview, spec.pending);
    assert.equal(manifest.crosswalk.status, spec.reviewed ? "reviewed" : "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, spec.reviewed);
    assert.equal(manifest.validation.parentTotalsReconciled, spec.reviewed);

    assert.equal(geometry.features.length, spec.features);
    assert.equal(new Set(geometry.features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`)).size, spec.features);
    for (const feature of geometry.features) {
      assert.deepEqual(Object.keys(feature.properties).sort(), [
        "CRM_FEATURE_ID",
        "CRM_PARENT_GEOID",
        "CRM_SOURCE_UNIT_ID",
        "SOURCE_COUNTY_NAME",
        "SOURCE_GEOMETRY_ID",
        "SOURCE_NAME",
      ]);
      assert.match(feature.properties.CRM_PARENT_GEOID, /^45\d{3}$/);
      assertVoteFreeGeometry(feature.properties, `${spec.year} ${feature.properties.CRM_FEATURE_ID}`);
    }

    assert.equal(results.sourceUnitCount, spec.sourceUnits);
    assert.equal(results.geographicSourceUnitCount, spec.geographic);
    assert.equal(results.colorableUnitCount, spec.colorable);
    assert.equal(results.rows.length, spec.colorable);
    assert.equal(results.exclusions.length, spec.sourceUnits - spec.colorable);
    assert.equal(results.officialTotals.totalVotes, spec.officialVotes);
    assert.equal(results.officialTotals.ballotsCast, spec.ballots);
    assert.equal(results.mappedTotals.totalVotes, spec.mappedVotes);
    assert.equal(results.administrativeTotals.totalVotes, spec.administrativeVotes);
    assert.equal(
      results.rows.reduce((sum, row) => sum + row.total, 0),
      spec.mappedVotes,
    );
    assert.equal(
      results.rows.reduce((sum, row) => sum + row.total, 0)
        + results.exclusions.reduce((sum, row) => sum + row.total, 0),
      spec.officialVotes,
    );

    assert.equal(crosswalk.rows.length, spec.sourceUnits);
    assert.equal(report.summary.rawFeatures, spec.rawFeatures);
    assert.equal(report.summary.unlinkedGeometryUnits, spec.noData);
    assert.equal(evidence.joinReview.resultAllocationPerformed, false);
    assert.equal(evidence.joinReview.secondaryVoteFieldsUsedForDisplay, false);
    assert.equal(evidence.joinReview.reviewedForPublicRowRendering, spec.reviewed);
    assert.equal(evidence.resultIdentity.officialTotals.totalVotes, spec.officialVotes);
    assert.equal(evidence.resultIdentity.mappedTotals.totalVotes, spec.mappedVotes);

    const inventory = JSON.parse(readFileSync(inventoryPaths.get(spec.year), "utf8"));
    const inventoryRow = inventory.states.find((row) => row.state === "SC");
    assert.ok(inventoryRow);
    assert.deepEqual(inventoryRow.geometry.manifestIds, [spec.manifestId]);
    assert.equal(inventoryRow.geometry.featureCount, spec.features);
    assert.equal(inventoryRow.geometry.publicEligibleManifestCount, spec.reviewed ? 1 : 0);
    assert.equal(inventoryRow.crosswalk.resultUnits, spec.sourceUnits);
    assert.equal(inventoryRow.crosswalk.matchedResultUnits, spec.mapped);
    assert.equal(inventoryRow.disposition, spec.reviewed ? "mapped" : "blocked");

    const inspection = validateManifestArtifacts(manifest, {
      root: process.cwd(),
      skipDelivery: true,
    });
    assert.deepEqual(inspection.errors, []);
  }
});

test("South Carolina reviewed relationships do not allocate administrative or zero-vote rows", () => {
  const year2016 = parseYear(process.cwd(), YEARS[1]);
  const hallsStore = year2016.results.exclusions.find((row) => row.sourceDisplayName === "Hall's Store");
  assert.ok(hallsStore);
  assert.equal(hallsStore.total, 0);
  assert.match(hallsStore.reason, /zero-vote source unit/);
  const laurens = year2016.geometry.features.filter((feature) => (
    feature.properties.CRM_PARENT_GEOID === "45059"
    && feature.properties.CRM_FEATURE_ID.endsWith(":laurens6")
  ));
  assert.equal(laurens.length, 1);
  assert.equal(laurens[0].geometry.type, "MultiPolygon");

  for (const spec of YEARS.slice(1)) {
    const { results, crosswalk } = parseYear(process.cwd(), spec);
    const administrative = crosswalk.rows.filter((row) => !row.isGeographic);
    assert.equal(administrative.length, spec.nonGeographic);
    assert.ok(administrative.every((row) => (
      row.relationships.length === 1
      && row.relationships[0].relationshipType === "non_geographic"
      && row.relationships[0].sourceFeatureId === null
    )));
    assert.ok(results.exclusions.every((row) => !results.rows.some((mapped) => mapped.resultUnitCode === row.resultUnitCode)));
  }
});

test("South Carolina 2024 uses every official-boundary feature and an exact geographic vote signature", () => {
  const raw = JSON.parse(gunzipSync(readFileSync(
    "data/precinct-geometry/SC/2024-11-05-general/raw/nyt/SC-precincts-with-results.geojson.gz",
  )));
  assert.equal(raw.features.length, 2308);
  assert.ok(raw.features.every((feature) => feature.properties.official_boundary === true));
  assert.equal(new Set(raw.features.map((feature) => feature.properties.GEOID)).size, 2308);
  assert.equal(raw.features.reduce((sum, feature) => sum + feature.properties.votes_dem, 0), 1025831);
  assert.equal(raw.features.reduce((sum, feature) => sum + feature.properties.votes_rep, 0), 1480198);
  assert.equal(raw.features.reduce((sum, feature) => sum + feature.properties.votes_total, 0), 2541877);

  const { results } = parseYear(process.cwd(), YEARS[3]);
  assert.equal(results.rows.reduce((sum, row) => sum + row.democratic, 0), 1025831);
  assert.equal(results.rows.reduce((sum, row) => sum + row.republican, 0), 1480198);
  assert.equal(results.rows.reduce((sum, row) => sum + row.total, 0), 2541877);
});

test("South Carolina raw pin failure happens before any derived write", { timeout: 60_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "sc-tamper-"));
  try {
    copyReplayInputs(alternateRoot);
    const tampered = path.join(
      alternateRoot,
      "data",
      "precinct-geometry",
      "SC",
      "2020-11-03-general",
      "raw",
      "vest",
      "documentation.txt",
    );
    writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from("\ntampered\n")]));
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/build-sc-reviewed-precincts.mjs",
    ], { cwd: alternateRoot, encoding: "utf8", timeout: 60_000 });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /raw source pin validation failed before writes/);
    for (const spec of YEARS) {
      assert.equal(existsSync(path.join(alternateRoot, ...`${base(spec)}/manifest.json`.split("/"))), false);
      assert.equal(existsSync(path.join(alternateRoot, ...`${base(spec)}/normalized`.split("/"))), false);
    }
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

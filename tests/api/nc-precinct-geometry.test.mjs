import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
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
import { NORTH_CAROLINA_RAW_SOURCE_PINS } from "../../scripts/lib/nc-precinct-geometry.mjs";

const YEARS = [
  {
    year: 2012,
    electionId: "2012-11-06-general",
    manifestId: "nc-2012-11-06-reviewed-vtd-geometry-v1",
    level: "vtd",
    rawFeatures: 2692,
    features: 2692,
    sourceUnits: 3011,
    mapped: 2692,
    nonGeographic: 319,
    noData: 0,
    officialVotes: 4505372,
    mappedVotes: 4492613,
    administrativeVotes: 12759,
    rowLevelSafe: true,
    repairs: 0,
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    manifestId: "nc-2016-11-08-reviewed-precinct-geometry-v1",
    level: "precinct",
    rawFeatures: 2704,
    features: 2704,
    sourceUnits: 3209,
    mapped: 2704,
    nonGeographic: 505,
    noData: 0,
    officialVotes: 4741564,
    mappedVotes: 3177511,
    administrativeVotes: 1564053,
    rowLevelSafe: true,
    repairs: 0,
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    manifestId: "nc-2020-11-03-reviewed-precinct-geometry-v1",
    level: "precinct",
    rawFeatures: 2659,
    features: 2662,
    sourceUnits: 3065,
    mapped: 2662,
    nonGeographic: 403,
    noData: 0,
    officialVotes: 5524802,
    mappedVotes: 3201711,
    administrativeVotes: 2323091,
    rowLevelSafe: true,
    repairs: 4,
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    manifestId: "nc-2024-11-05-supplemented-precinct-candidate-v1",
    level: "precinct",
    rawFeatures: 2656,
    features: 2659,
    sourceUnits: 2908,
    mapped: 2658,
    nonGeographic: 250,
    noData: 1,
    officialVotes: 5699141,
    mappedVotes: 3923739,
    administrativeVotes: 1775402,
    rowLevelSafe: false,
    repairs: 3,
  },
];

function base(spec) {
  return `data/precinct-geometry/NC/${spec.electionId}`;
}

function derivedPaths(spec) {
  return [
    "manifest.json",
    "source-evidence.json",
    `normalized/nc-${spec.year}-reviewed-${spec.level}-geometry.geojson.gz`,
    `normalized/nc-${spec.year}-official-president-${spec.level}-results.json.gz`,
    `crosswalk/nc-${spec.year}-result-to-geometry-review.json`,
    `reports/nc-${spec.year}-${spec.level}-geometry-review.json`,
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
    report: JSON.parse(readAt(root, `${prefix}/reports/nc-${spec.year}-${spec.level}-geometry-review.json`)),
    geometry: JSON.parse(gunzipSync(readAt(root, `${prefix}/normalized/nc-${spec.year}-reviewed-${spec.level}-geometry.geojson.gz`))),
    results: JSON.parse(gunzipSync(readAt(root, `${prefix}/normalized/nc-${spec.year}-official-president-${spec.level}-results.json.gz`))),
    crosswalk: JSON.parse(readAt(root, `${prefix}/crosswalk/nc-${spec.year}-result-to-geometry-review.json`)),
  };
}

function copyFileIntoRoot(sourceRoot, targetRoot, relativePath) {
  const target = path.join(targetRoot, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(path.join(sourceRoot, ...relativePath.split("/")), target);
}

function copyReplayInputs(targetRoot) {
  for (const relativePath of Object.keys(NORTH_CAROLINA_RAW_SOURCE_PINS)) {
    copyFileIntoRoot(process.cwd(), targetRoot, relativePath);
  }
  for (const relativePath of [
    "scripts/build-nc-reviewed-precincts.mjs",
    "scripts/lib/nc-precinct-geometry.mjs",
    "scripts/lib/precinct-geometry-validation.mjs",
    "src/lib/precinct-crosswalk.ts",
    "src/lib/precinct-geography.ts",
    "src/lib/precinct-source-package.ts",
  ]) {
    copyFileIntoRoot(process.cwd(), targetRoot, relativePath);
  }
}

function runBuilder(root) {
  return execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/build-nc-reviewed-precincts.mjs",
  ], {
    cwd: root,
    stdio: "pipe",
    timeout: 300_000,
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
      /(?:^|_)(?:votes?|candidate|party|el\d|official_boundary)/i,
      `${context} contains election-value field ${key}`,
    );
    assertVoteFreeGeometry(child, `${context}.${key}`);
  }
}

test("North Carolina four-year local geometry packages replay byte-identically and reject raw tampering before writes", { timeout: 480_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "nc-replay-"));
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

    const manifestPath = `${base(YEARS[0])}/manifest.json`;
    const manifestBeforeTamper = readAt(alternateRoot, manifestPath);
    const indexPath = "data/precinct-geometry/NC/raw-shared/ncsbe/ncsbe-precinct-archive-index.xml";
    const indexTarget = path.join(alternateRoot, ...indexPath.split("/"));
    writeFileSync(indexTarget, Buffer.concat([readFileSync(indexTarget), Buffer.from("\nTAMPER\n")]));
    const tampered = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/build-nc-reviewed-precincts.mjs",
    ], {
      cwd: alternateRoot,
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.notEqual(tampered.status, 0);
    assert.match(`${tampered.stdout}\n${tampered.stderr}`, /raw source pin validation failed before writes/i);
    assert.deepEqual(readAt(alternateRoot, manifestPath), manifestBeforeTamper);
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("North Carolina packages preserve official totals and keep 2024 fail closed", () => {
  const registry = JSON.parse(readFileSync("data/precinct-geometry-manifests.json", "utf8"));
  assert.deepEqual(registry.manifests.filter((manifest) => manifest.state === "NC"), []);
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
    assert.equal(manifest.geography.level, spec.level);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.geometryValid, true);
    assert.equal(manifest.validation.rowLevelRenderingSafe, spec.rowLevelSafe);
    assert.equal(manifest.crosswalk.status, "reviewed");
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.resultUnits, spec.sourceUnits);
    assert.equal(manifest.crosswalk.colorableResultUnits, spec.mapped);
    assert.equal(manifest.crosswalk.matchedResultUnits, spec.mapped);
    assert.equal(manifest.crosswalk.unmatchedResultUnits, 0);
    assert.equal(manifest.crosswalk.nonGeographicResultUnits, spec.nonGeographic);
    assert.equal(manifest.crosswalk.relationships.oneToOne, spec.mapped);
    assert.equal(manifest.crosswalk.relationships.nonGeographic, spec.nonGeographic);
    assert.equal(manifest.crosswalk.relationships.pendingReview, 0);
    assert.equal(manifest.geography.vintageStatus, spec.rowLevelSafe ? "election_date_confirmed" : "unknown");

    assert.equal(geometry.features.length, spec.features);
    assert.equal(new Set(geometry.features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`)).size, spec.features);
    for (const feature of geometry.features) {
      assert.deepEqual(Object.keys(feature.properties).sort(), [
        "CRM_FEATURE_ID",
        "CRM_PARENT_GEOID",
        "CRM_SOURCE_UNIT_ID",
        "SOURCE_BOUNDARY_ORIGIN",
        "SOURCE_COUNTY_NAME",
        "SOURCE_GEOMETRY_ID",
        "SOURCE_NAME",
      ]);
      assert.match(feature.properties.CRM_PARENT_GEOID, /^37\d{3}$/);
      assertVoteFreeGeometry(feature.properties, `${spec.year} ${feature.properties.CRM_FEATURE_ID}`);
    }

    assert.equal(results.sourceUnitCount, spec.sourceUnits);
    assert.equal(results.geographicSourceUnitCount, spec.mapped);
    assert.equal(results.colorableUnitCount, spec.mapped);
    assert.equal(results.rows.length, spec.mapped);
    assert.equal(results.exclusions.length, spec.nonGeographic);
    assert.equal(results.officialTotals.totalVotes, spec.officialVotes);
    assert.equal(results.mappedTotals.totalVotes, spec.mappedVotes);
    assert.equal(results.administrativeTotals.totalVotes, spec.administrativeVotes);
    assert.equal(results.rows.reduce((sum, row) => sum + row.total, 0), spec.mappedVotes);
    assert.equal(results.exclusions.reduce((sum, row) => sum + row.total, 0), spec.administrativeVotes);
    assert.equal(spec.mappedVotes + spec.administrativeVotes, spec.officialVotes);

    assert.equal(crosswalk.rows.length, spec.sourceUnits);
    assert.equal(crosswalk.reconciliation.status, "passed");
    assert.equal(crosswalk.reconciliation.scopes.length, 101);
    assert.equal(report.summary.rawFeatures, spec.rawFeatures);
    assert.equal(report.summary.unlinkedGeometryUnits, spec.noData);
    assert.equal(report.topologyRepairs.length, spec.repairs);
    assert.equal(evidence.joinReview.resultAllocationPerformed, false);
    assert.equal(evidence.joinReview.secondaryVoteFieldsUsedForDisplay, false);
    assert.equal(evidence.joinReview.reviewedForPublicRowRendering, spec.rowLevelSafe);
    assert.equal(evidence.resultIdentity.officialTotals.totalVotes, spec.officialVotes);
    assert.equal(evidence.resultIdentity.mappedTotals.totalVotes, spec.mappedVotes);

    const inventory = JSON.parse(readFileSync(inventoryPaths.get(spec.year), "utf8"));
    const inventoryRow = inventory.states.find((row) => row.state === "NC");
    assert.ok(inventoryRow);
    assert.deepEqual(inventoryRow.geometry.manifestIds, [spec.manifestId]);
    assert.equal(inventoryRow.geometry.featureCount, spec.features);
    assert.equal(inventoryRow.geometry.publicEligibleManifestCount, 0);
    assert.equal(inventoryRow.crosswalk.resultUnits, spec.sourceUnits);
    assert.equal(inventoryRow.crosswalk.matchedResultUnits, spec.mapped);
    assert.equal(inventoryRow.disposition, spec.rowLevelSafe ? "mapped" : "blocked");

    const inspection = validateManifestArtifacts(manifest, { root: process.cwd(), skipDelivery: true });
    assert.deepEqual(inspection.errors, []);
  }
});

test("North Carolina 2012 uses a complete reviewed VTD crosswalk without secondary display votes", () => {
  const { evidence, geometry, results, crosswalk } = parseYear(process.cwd(), YEARS[0]);
  const relationships = crosswalk.rows.map((row) => row.relationships[0]);
  assert.equal(relationships.filter((row) => row.relationshipType === "one_to_one" && row.matchMethod === "exact_official_id").length, 2654);
  assert.equal(relationships.filter((row) => row.relationshipType === "one_to_one" && row.matchMethod === "official_crosswalk").length, 38);
  assert.equal(relationships.filter((row) => row.relationshipType === "non_geographic").length, 319);
  assert.equal(evidence.joinReview.directIdMatches, 2654);
  assert.equal(evidence.joinReview.voteSignatureMatches, 38);
  assert.match(evidence.caveats.join(" "), /statutory statistical noise/i);
  assert.match(evidence.boundaryContext.licenseOrTerms, /ODbL 1\.0/i);
  assert.equal(geometry.properties.geographyLevel, "vtd");
  assert.equal(results.reportingGrain, "vtd");
  assert.ok(results.rows.every((row) => row.candidateVotes.every((candidate) => candidate.votes >= 0)));
});

test("North Carolina supplemental topology work is explicit and 2024 retains one no-data feature", () => {
  const twenty = parseYear(process.cwd(), YEARS[2]);
  assert.deepEqual(
    twenty.evidence.topologyReview.repairs.map((row) => row.sourceUnitKey),
    ["37021|681", "37089|CV", "37183|1-07A", "37183|7-07A"],
  );
  assert.ok(twenty.evidence.topologyReview.repairs.every((row) => row.coverageRatio >= 0.97 && row.coverageRatio <= 1.00001));
  assert.equal(twenty.report.noDataFeatureIds.length, 0);

  const twentyFour = parseYear(process.cwd(), YEARS[3]);
  assert.deepEqual(
    twentyFour.evidence.topologyReview.repairs.map((row) => row.sourceUnitKey),
    ["37089|CV", "37183|1-07A", "37183|7-07A"],
  );
  assert.equal(twentyFour.report.noDataFeatureIds.length, 1);
  assert.match(twentyFour.report.noDataFeatureIds[0], /^37063\|nc:2024:37063:48$/);
  assert.match(twentyFour.manifest.validation.errors.join(" "), /November 5, 2024 applicability/i);
  assert.equal(twentyFour.manifest.validation.rowLevelRenderingSafe, false);
});

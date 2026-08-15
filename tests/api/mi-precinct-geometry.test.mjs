import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const YEARS = [
  {
    year: 2012,
    electionId: "2012-11-06-general",
    manifestId: "mi-2012-11-06-official-cycle-precinct-review-v2",
    features: 4874,
    sourceUnits: 5238,
    resultUnits: 5238,
    colorable: 4862,
    matched: 4862,
    unmatched: 0,
    nonGeographic: 371,
    aliases: 5,
    unlinked: 12,
    candidates: 9,
    resultRows: 47097,
    votes: 4730961,
    artifacts: 14,
    crossCounty: 5,
    reviewed: false,
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    manifestId: "mi-2016-11-08-official-cycle-precinct-review-v2",
    features: 4810,
    sourceUnits: 5077,
    resultUnits: 5077,
    colorable: 4809,
    matched: 4788,
    unmatched: 21,
    nonGeographic: 266,
    aliases: 2,
    unlinked: 22,
    candidates: 13,
    resultRows: 65975,
    votes: 4799284,
    artifacts: 13,
    crossCounty: 2,
    reviewed: false,
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    manifestId: "mi-2020-11-03-official-cycle-precinct-review-v2",
    features: 4752,
    sourceUnits: 4923,
    resultUnits: 4923,
    colorable: 4750,
    matched: 4699,
    unmatched: 51,
    nonGeographic: 168,
    aliases: 5,
    unlinked: 53,
    candidates: 11,
    resultRows: 54098,
    votes: 5536017,
    artifacts: 10,
    crossCounty: 5,
    reviewed: false,
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    manifestId: "mi-2024-11-05-official-precinct-review-v2",
    features: 4340,
    sourceUnits: 4434,
    resultUnits: 4434,
    colorable: 4340,
    matched: 4340,
    unmatched: 0,
    nonGeographic: 87,
    aliases: 7,
    unlinked: 0,
    candidates: 12,
    resultRows: 53124,
    votes: 5664186,
    artifacts: 11,
    crossCounty: 8,
    reviewed: true,
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function base(spec) {
  return `data/precinct-geometry/MI/${spec.electionId}`;
}

function derivedPaths(spec) {
  return [
    "manifest.json",
    "source-evidence.json",
    `normalized/mi-${spec.year}-official-precinct-geometry.geojson.gz`,
    `normalized/mi-${spec.year}-official-precinct-results.json.gz`,
    `crosswalk/mi-${spec.year}-result-to-geometry-review.json`,
    `reports/mi-${spec.year}-precinct-geometry-review.json`,
  ];
}

function readAt(root, relativePath) {
  return readFileSync(path.join(root, ...relativePath.split("/")));
}

function derivedBytes(root, spec) {
  return Object.fromEntries(derivedPaths(spec).map((relativePath) => [
    relativePath,
    readAt(root, `${base(spec)}/${relativePath}`),
  ]));
}

function copyReplayWorkspace(targetRoot) {
  for (const directory of ["data/precinct-geometry/MI", "scripts/lib"]) {
    cpSync(directory, path.join(targetRoot, ...directory.split("/")), {
      recursive: true,
    });
  }
  for (const relativePath of [
    "data/mi-counties.geojson",
    "scripts/audit-mi-official-precinct-joins.mjs",
    "scripts/build-mi-reviewed-precincts.mjs",
    "src/lib/precinct-crosswalk.ts",
    "src/lib/precinct-geography.ts",
    "src/lib/precinct-source-package.ts",
  ]) {
    const target = path.join(targetRoot, ...relativePath.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(relativePath, target);
  }
}

function runBuilder(root, extraArguments = []) {
  return execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/build-mi-reviewed-precincts.mjs",
    ...extraArguments,
  ], { cwd: root, stdio: "pipe", timeout: 180_000 });
}

function parseYear(root, spec) {
  const prefix = base(spec);
  return {
    manifest: JSON.parse(readAt(root, `${prefix}/manifest.json`)),
    evidence: JSON.parse(readAt(root, `${prefix}/source-evidence.json`)),
    report: JSON.parse(readAt(
      root,
      `${prefix}/reports/mi-${spec.year}-precinct-geometry-review.json`,
    )),
    geometry: JSON.parse(gunzipSync(readAt(
      root,
      `${prefix}/normalized/mi-${spec.year}-official-precinct-geometry.geojson.gz`,
    ))),
    results: JSON.parse(gunzipSync(readAt(
      root,
      `${prefix}/normalized/mi-${spec.year}-official-precinct-results.json.gz`,
    ))),
    crosswalk: JSON.parse(readAt(
      root,
      `${prefix}/crosswalk/mi-${spec.year}-result-to-geometry-review.json`,
    )),
  };
}

function assertNoElectionValueKeys(value, context) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoElectionValueKeys(entry, `${context}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /^(?:votes?|totalvotes?|candidate|party|g\d{2}pre)/i,
      `${context} contains election-value key ${key}`,
    );
    assertNoElectionValueKeys(child, `${context}.${key}`);
  }
}

test("Michigan four-election official artifacts replay byte-identically and preserve their review gates", { timeout: 180_000 }, () => {
  mkdirSync(".etl", { recursive: true });
  const alternateRoot = mkdtempSync(path.join(process.cwd(), ".etl", "mi-replay-"));
  try {
    copyReplayWorkspace(alternateRoot);
    const before = new Map(YEARS.map((spec) => [spec.year, derivedBytes(process.cwd(), spec)]));
    runBuilder(alternateRoot);

    for (const spec of YEARS) {
      const after = derivedBytes(alternateRoot, spec);
      for (const relativePath of derivedPaths(spec)) {
        assert.deepEqual(
          after[relativePath],
          before.get(spec.year)[relativePath],
          `${spec.year} ${relativePath} must replay byte-identically`,
        );
      }

      const { manifest, evidence, report, geometry, results, crosswalk } =
        parseYear(alternateRoot, spec);
      const artifactInspection = validateManifestArtifacts(manifest, {
        root: alternateRoot,
        skipDelivery: true,
      });
      const manifestInspection = inspectPrecinctGeometryManifest(manifest);
      assert.deepEqual(artifactInspection.errors, []);
      assert.deepEqual(manifestInspection.errors, []);
      assert.equal(artifactInspection.eligible, false);
      assert.equal(manifest.id, spec.manifestId);
      assert.equal(manifest.delivery, null);
      assert.equal(manifest.validation.status, "blocked");
      assert.equal(manifest.validation.rowLevelRenderingSafe, spec.reviewed);
      assert.equal(manifest.validation.parentTotalsReconciled, spec.reviewed);
      assert.equal(manifest.crosswalk.status, spec.reviewed ? "reviewed" : "blocked");
      assert.equal(manifest.normalization.featureCount, spec.features);
      assert.equal(manifest.crosswalk.resultUnits, spec.resultUnits);
      assert.equal(manifest.crosswalk.colorableResultUnits, spec.colorable);
      assert.equal(manifest.crosswalk.matchedResultUnits, spec.matched);
      assert.equal(manifest.crosswalk.unmatchedResultUnits, spec.unmatched);
      assert.equal(manifest.crosswalk.nonGeographicResultUnits, spec.nonGeographic);
      assert.equal(manifest.crosswalk.sourceAliasResultUnits, spec.aliases);
      assert.equal(geometry.features.length, spec.features);
      assert.equal(results.sourceUnitCount, spec.sourceUnits);
      assert.equal(results.matchedGeographicUnitCount, spec.matched);
      assert.equal(results.unmatchedGeographicUnitCount, spec.unmatched);
      assert.equal(results.nonGeographicUnitCount, spec.nonGeographic);
      assert.equal(results.sourceAliasUnitCount, spec.aliases);
      assert.equal(results.candidates.length, spec.candidates);
      assert.equal(results.rows.length, spec.resultRows);
      assert.equal(results.contestTotals.president.official.totalVotes, spec.votes);
      assert.equal(
        results.rows.reduce((sum, row) => sum + row.votes, 0),
        spec.votes,
      );
      assert.equal(crosswalk.rows.length, spec.resultUnits);
      assert.equal(crosswalk.reconciliation.status, spec.reviewed ? "passed" : "failed");
      assert.equal(crosswalk.reconciliation.scopes.length, 84);
      assert.equal(report.crosswalk.unlinkedGeometryUnits, spec.unlinked);
      assert.equal(report.source.officialResultVotes, spec.votes);
      assert.equal(evidence.artifacts.length, spec.artifacts);
      assert.equal(evidence.joinReview.crossCountyAssignments.length, spec.crossCounty);
      assert.ok(evidence.joinReview.crossCountyAssignments.every((row) =>
        /^26\d{3}$/.test(row.sourceParentGeoid)
        && /^26\d{3}$/.test(row.geometryParentGeoid)
        && row.sourceParentGeoid !== row.geometryParentGeoid));

      const featureKeys = new Set();
      for (const feature of geometry.features) {
        assert.match(feature.properties.CRM_PARENT_GEOID, /^26\d{3}$/);
        const featureKey =
          `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`;
        assert.equal(featureKeys.has(featureKey), false);
        featureKeys.add(featureKey);
        assertNoElectionValueKeys(feature.properties, `${spec.year} ${featureKey}`);
      }
      assert.equal(featureKeys.size, spec.features);

      for (const row of crosswalk.rows) {
        assert.equal(row.relationships.length, 1);
        const [relationship] = row.relationships;
        assertNoElectionValueKeys(
          relationship,
          `${spec.year} relationship ${row.resultUnitCode}`,
        );
        if (relationship.relationshipType === "one_to_one") {
          assert.equal(featureKeys.has(relationship.sourceFeatureId), true);
        } else {
          assert.equal(relationship.sourceFeatureId, null);
        }
      }

      for (const artifact of evidence.artifacts) {
        assert.match(artifact.sourceUrl, /^https:\/\//);
        const bytes = readAt(alternateRoot, artifact.localArtifactPath);
        assert.equal(bytes.length, artifact.byteCount);
        assert.equal(sha256(bytes), artifact.sha256);
      }
    }

    const beforeTamper = derivedBytes(alternateRoot, YEARS[3]);
    const rawResultPath = path.join(
      alternateRoot,
      "data",
      "precinct-geometry",
      "MI",
      "2024-11-05-general",
      "raw",
      "mi-sos-mvic",
      "2024GEN.zip",
    );
    const tampered = Buffer.from(readFileSync(rawResultPath));
    tampered[0] ^= 0xff;
    writeFileSync(rawResultPath, tampered);
    const rejected = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/build-mi-reviewed-precincts.mjs",
      "--year=2024",
    ], { cwd: alternateRoot, encoding: "utf8", timeout: 180_000 });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Michigan raw source drifted/);
    const afterTamper = derivedBytes(alternateRoot, YEARS[3]);
    for (const relativePath of derivedPaths(YEARS[3])) {
      assert.deepEqual(
        afterTamper[relativePath],
        beforeTamper[relativePath],
        `failed raw-source preflight must not change ${relativePath}`,
      );
    }
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("Michigan 2024 is a complete official row-level review without vote allocation", () => {
  const { manifest, evidence, report, results, crosswalk } = parseYear(
    process.cwd(),
    YEARS[3],
  );
  assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
  assert.deepEqual(report.crosswalk.matchMethodCounts, {
    parent_exact_composite: 3866,
    statewide_exact_composite: 8,
    parent_unique_municipality_precinct: 473,
  });
  assert.equal(manifest.crosswalk.relationships.oneToOne, 4340);
  assert.equal(manifest.crosswalk.relationships.sourceAlias, 7);
  assert.equal(manifest.crosswalk.reviewedRelationshipRecords, 4434);
  assert.equal(manifest.crosswalk.reviewedNoDataFeatures, 0);
  assert.equal(evidence.resultIdentity.geographicSourceUnitCount, 4347);
  assert.equal(evidence.resultIdentity.mappedGeographicUnitCount, 4340);
  assert.equal(evidence.resultIdentity.unmatchedGeographicUnitCount, 0);
  assert.deepEqual(evidence.resultIdentity.officialTotals, {
    democraticVotes: 2736533,
    republicanVotes: 2816636,
    otherVotes: 111017,
    totalVotes: 5664186,
  });
  assert.equal(
    crosswalk.rows.filter((row) =>
      row.relationships[0].relationshipType === "source_alias").length,
    7,
  );
  assert.equal(
    new Set(results.rows.map((row) => row.resultUnitCode)).size,
    4340 + 87,
  );
  assert.equal(
    new Set(results.rows.flatMap((row) => row.sourceUnits.map((unit) =>
      `${unit.sourceParentGeoid}|${unit.sourceUnitId}`))).size,
    4434,
  );
  assert.ok(results.rows.every((row) => row.sourceUnits.length >= 1));
  assert.match(evidence.caveats.join(" "), /no vote allocation is performed/i);
});

test("Michigan historical packages remain explicit, retained, and unavailable for public rendering", () => {
  for (const spec of YEARS.slice(0, 3)) {
    const { manifest, report } = parseYear(process.cwd(), spec);
    assert.equal(manifest.geography.vintageStatus, "unknown");
    assert.equal(manifest.validation.rowLevelRenderingSafe, false);
    assert.equal(manifest.validation.parentTotalsReconciled, false);
    assert.equal(manifest.delivery, null);
    assert.ok(manifest.validation.errors.length >= 3);
    assert.equal(report.disposition, "blocked_partial_official_crosswalk");
  }
  const { manifest: manifest2012, report: report2012 } = parseYear(
    process.cwd(),
    YEARS[0],
  );
  assert.match(manifest2012.validation.errors.join(" "), /4,874.*4,873/);
  assert.match(manifest2012.validation.errors.join(" "), /redistribution terms/i);
  assert.equal(report2012.crosswalk.unmatchedResultUnits, 0);
  assert.equal(report2012.crosswalk.unlinkedGeometryUnits, 12);
});

test("Michigan coverage ledgers include all four packages while the public registry remains closed", () => {
  const inventoryPaths = new Map([
    [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
    [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
    [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
    [2024, "data/precinct-geometry-coverage-inventory.json"],
  ]);
  for (const spec of YEARS) {
    const inventory = JSON.parse(readFileSync(inventoryPaths.get(spec.year)));
    const row = inventory.states.find((candidate) => candidate.state === "MI");
    assert.ok(row, `${spec.year} Michigan coverage row is required`);
    assert.equal(row.electionId, spec.electionId);
    assert.equal(row.programStatus, "reviewed");
    assert.equal(row.disposition, spec.reviewed ? "mapped" : "blocked");
    assert.deepEqual(row.geometry.manifestIds, [spec.manifestId]);
    assert.equal(row.geometry.featureCount, spec.features);
    assert.equal(row.geometry.publicEligibleManifestCount, 0);
    assert.equal(row.crosswalk.resultUnits, spec.resultUnits);
    assert.equal(row.crosswalk.colorableResultUnits, spec.colorable);
    assert.equal(row.crosswalk.matchedResultUnits, spec.matched);
    assert.equal(row.crosswalk.unmatchedResultUnits, spec.unmatched);
    assert.equal(row.crosswalk.nonGeographicResultUnits, spec.nonGeographic);
    assert.equal(row.crosswalk.sourceAliasResultUnits, spec.aliases);
    assert.equal(row.blockers.length > 0, true);
    assert.equal(
      inventory.summary.totalJurisdictions,
      inventory.states.length,
    );
    assert.equal(
      inventory.summary.publicEligibleJurisdictions,
      inventory.states.filter((candidate) =>
        Number(candidate.geometry?.publicEligibleManifestCount ?? 0) > 0).length,
    );
  }

  const registry = JSON.parse(readFileSync(
    "data/precinct-geometry-manifests.json",
  ));
  assert.equal(
    registry.manifests.some((manifest) => manifest.state === "MI"),
    false,
  );
});

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
import { validateManifestArtifacts } from
  "../../scripts/lib/precinct-geometry-validation.mjs";
import {
  PENNSYLVANIA_RAW_SOURCE_PINS,
  PENNSYLVANIA_REVIEWED_AT,
} from "../../scripts/lib/pa-precinct-geometry.mjs";

const YEARS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    manifestId: "pa-2012-11-06-precinct-geometry-unavailable-v1",
    rawFeatures: 9_256,
    features: 0,
    sourceUnits: 9_246,
    sourceRows: 40_295,
    mappedRows: 0,
    mappedSourceComponents: 0,
    mappedZeroVoteSourceComponents: 0,
    reconciledParentScopes: 0,
    excluded: 9_246,
    noData: 0,
    total: 5_734_022,
    mappedTotal: 0,
    excludedTotal: 5_734_022,
    safe: false,
    disposition: "blocked",
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    manifestId: "pa-2016-11-08-reviewed-precinct-geometry-v1",
    rawFeatures: 9_167,
    features: 9_167,
    sourceUnits: 9_176,
    sourceRows: 45_880,
    mappedRows: 8_014,
    mappedSourceComponents: 8_018,
    mappedZeroVoteSourceComponents: 4,
    reconciledParentScopes: 67,
    excluded: 1_158,
    noData: 1_153,
    total: 6_114_296,
    mappedTotal: 5_331_613,
    excludedTotal: 782_683,
    safe: true,
    disposition: "partial",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    manifestId: "pa-2020-11-03-reviewed-precinct-geometry-v1",
    rawFeatures: 9_150,
    features: 9_150,
    sourceUnits: 9_187,
    sourceRows: 27_561,
    mappedRows: 6_805,
    mappedSourceComponents: 6_827,
    mappedZeroVoteSourceComponents: 18,
    reconciledParentScopes: 66,
    excluded: 2_360,
    noData: 2_345,
    total: 6_916_044,
    mappedTotal: 5_370_341,
    excludedTotal: 1_545_703,
    safe: true,
    disposition: "partial",
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    manifestId: "pa-2024-11-05-precinct-geometry-unavailable-v1",
    rawFeatures: 9_178,
    features: 0,
    sourceUnits: 9_187,
    sourceRows: 36_748,
    mappedRows: 0,
    mappedSourceComponents: 0,
    mappedZeroVoteSourceComponents: 0,
    reconciledParentScopes: 0,
    excluded: 9_187,
    noData: 0,
    total: 7_031_737,
    mappedTotal: 0,
    excludedTotal: 7_031_737,
    safe: false,
    disposition: "blocked",
  },
]);

const absolute = (root, relativePath) =>
  path.join(root, ...relativePath.split("/"));
const base = (spec) =>
  "data/precinct-geometry/PA/" + spec.electionId;
const paths = (spec) => ({
  manifest: base(spec) + "/manifest.json",
  evidence: base(spec) + "/source-evidence.json",
  report:
    base(spec) + "/reports/pa-" + spec.year
      + "-precinct-geometry-report.json",
  results:
    base(spec) + "/normalized/pa-" + spec.year
      + "-president-results.json.gz",
  geometry:
    base(spec) + "/normalized/pa-" + spec.year
      + (spec.safe
        ? "-reviewed-precinct-geometry.geojson.gz"
        : "-no-approved-precinct-geometry.json"),
  crosswalk:
    base(spec) + "/crosswalk/pa-" + spec.year
      + "-result-to-geometry-review.json",
  ...(spec.safe
    ? {
      license:
        base(spec) + "/raw/vest/version-license-evidence.json",
    }
    : {}),
});

function parse(root, spec) {
  const target = paths(spec);
  return {
    manifest: JSON.parse(
      readFileSync(absolute(root, target.manifest), "utf8"),
    ),
    evidence: JSON.parse(
      readFileSync(absolute(root, target.evidence), "utf8"),
    ),
    report: JSON.parse(
      readFileSync(absolute(root, target.report), "utf8"),
    ),
    results: JSON.parse(
      gunzipSync(readFileSync(absolute(root, target.results))).toString("utf8"),
    ),
    geometry: spec.safe
      ? JSON.parse(
        gunzipSync(readFileSync(absolute(root, target.geometry)))
          .toString("utf8"),
      )
      : JSON.parse(
        readFileSync(absolute(root, target.geometry), "utf8"),
      ),
    crosswalk: JSON.parse(
      readFileSync(absolute(root, target.crosswalk), "utf8"),
    ),
  };
}

function copyIntoRoot(targetRoot, relativePath) {
  const target = absolute(targetRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(absolute(process.cwd(), relativePath), target);
}

function copyReplayInputs(targetRoot) {
  for (const relativePath of Object.keys(PENNSYLVANIA_RAW_SOURCE_PINS)) {
    copyIntoRoot(targetRoot, relativePath);
  }
  for (const relativePath of [
    "scripts/collect-pa-precinct-geometry.mjs",
    "scripts/lib/pa-precinct-geometry.mjs",
    "scripts/normalize-eac-turnout.mjs",
    "src/lib/precinct-geography.ts",
  ]) {
    copyIntoRoot(targetRoot, relativePath);
  }
}

function replay(root, year) {
  return execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/collect-pa-precinct-geometry.mjs",
    "--year=" + year,
    "--retrieved-at=" + PENNSYLVANIA_REVIEWED_AT,
  ], {
    cwd: root,
    stdio: "pipe",
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function assertVoteFreeProperties(value, context) {
  for (const [key, child] of Object.entries(value ?? {})) {
    assert.doesNotMatch(
      key,
      /^(?:G\d{2}|votes?|totalvotes?|candidate|party|pct_dem|pct_rep)/i,
      context + " contains election-value property " + key,
    );
    if (child && typeof child === "object") {
      assertVoteFreeProperties(child, context + "." + key);
    }
  }
}

test(
  "Pennsylvania four-year source packages replay byte-identically and reject raw tampering before writes",
  { timeout: 900_000 },
  () => {
    mkdirSync(".etl", { recursive: true });
    const alternateRoot = mkdtempSync(
      path.join(process.cwd(), ".etl", "pa-replay-"),
    );
    try {
      copyReplayInputs(alternateRoot);
      for (const spec of YEARS) replay(alternateRoot, spec.year);
      for (const spec of YEARS) {
        for (const relativePath of Object.values(paths(spec))) {
          assert.deepEqual(
            readFileSync(absolute(alternateRoot, relativePath)),
            readFileSync(absolute(process.cwd(), relativePath)),
            spec.year + " " + relativePath
              + " must replay byte-identically",
          );
        }
      }

      const sixteen = YEARS.find((spec) => spec.year === 2016);
      const manifestPath = paths(sixteen).manifest;
      const before = readFileSync(absolute(alternateRoot, manifestPath));
      const rawPath =
        "data/precinct-geometry/PA/2016-11-08-general/raw/vest/pa_2016.zip";
      writeFileSync(
        absolute(alternateRoot, rawPath),
        Buffer.concat([
          readFileSync(absolute(alternateRoot, rawPath)),
          Buffer.from("TAMPER"),
        ]),
      );
      const result = spawnSync(process.execPath, [
        "--experimental-strip-types",
        "scripts/collect-pa-precinct-geometry.mjs",
        "--year=2016",
        "--retrieved-at=" + PENNSYLVANIA_REVIEWED_AT,
      ], {
        cwd: alternateRoot,
        encoding: "utf8",
        timeout: 300_000,
      });
      assert.notEqual(result.status, 0);
      assert.match(
        result.stdout + "\n" + result.stderr,
        /raw source drifted before derived writes/i,
      );
      assert.deepEqual(
        readFileSync(absolute(alternateRoot, manifestPath)),
        before,
      );
    } finally {
      rmSync(alternateRoot, { recursive: true, force: true });
    }
  },
);

test(
  "Pennsylvania packages preserve the official result universe while only reviewed partial years are active",
  () => {
    const registry = JSON.parse(
      readFileSync("data/precinct-geometry-manifests.json", "utf8"),
    );
    assert.deepEqual(
      registry.manifests
        .filter((manifest) => manifest.state === "PA")
        .map((manifest) => manifest.id),
      YEARS.filter((spec) => spec.safe).map((spec) => spec.manifestId),
    );
    assert.equal(
      registry.manifests.some((manifest) =>
        manifest.id === YEARS[0].manifestId
        || manifest.id === YEARS[3].manifestId
      ),
      false,
    );

    for (const spec of YEARS) {
      const {
        manifest,
        evidence,
        report,
        results,
        geometry,
        crosswalk,
      } = parse(process.cwd(), spec);
      assert.equal(manifest.id, spec.manifestId);
      assert.equal(manifest.delivery, null);
      assert.equal(manifest.validation.status, "blocked");
      assert.equal(manifest.validation.rowLevelRenderingSafe, spec.safe);
      assert.equal(manifest.normalization.featureCount, spec.features);
      assert.equal(manifest.crosswalk.matchedResultUnits, spec.mappedRows);
      assert.equal(manifest.crosswalk.reviewedNoDataFeatures, spec.noData);
      assert.equal(results.sourceUnitCount, spec.sourceUnits);
      assert.equal(results.mappedSourceComponentCount, spec.mappedSourceComponents);
      assert.equal(
        results.mappedZeroVoteSourceComponentCount,
        spec.mappedZeroVoteSourceComponents,
      );
      assert.equal(results.colorableUnitCount, spec.mappedRows);
      assert.equal(results.excludedUnitCount, spec.excluded);
      assert.equal(results.totals.total, spec.total);
      assert.equal(results.mappedTotals.total, spec.mappedTotal);
      assert.equal(results.excludedTotals.total, spec.excludedTotal);
      assert.equal(
        results.mappedTotals.total + results.excludedTotals.total,
        results.totals.total,
      );
      assert.equal(results.rows.length, spec.mappedRows);
      assert.equal(results.exclusions.length, spec.excluded);
      assert.equal(evidence.resultUniverse.sourceUnits, spec.sourceUnits);
      assert.equal(
        evidence.resultUniverse.presidentialSourceRows,
        spec.sourceRows,
      );
      assert.equal(
        evidence.resultUniverse.mappedSourceComponents,
        spec.mappedSourceComponents,
      );
      assert.equal(
        evidence.resultUniverse.mappedZeroVoteSourceComponents,
        spec.mappedZeroVoteSourceComponents,
      );
      assert.equal(evidence.geometryReview.rawFeatures, spec.rawFeatures);
      assert.equal(evidence.geometryReview.normalizedFeatures, spec.features);
      assert.equal(report.publicDeliveryAuthorized, false);
      assert.equal(crosswalk.rows.length, spec.safe
        ? spec.mappedRows
        : spec.sourceUnits);
      assert.equal(
        crosswalk.reconciliation.status,
        spec.safe ? "passed" : "not_run",
      );
      assert.equal(report.parentScopeCount, spec.reconciledParentScopes);
      const inspection = validateManifestArtifacts(manifest, {
        root: process.cwd(),
        skipDelivery: true,
      });
      assert.deepEqual(inspection.errors, []);

      if (spec.safe) {
        assert.equal(geometry.features.length, spec.features);
        assert.equal(
          new Set(geometry.features.map((feature) =>
            feature.properties.CRM_PARENT_GEOID
              + "|" + feature.properties.CRM_FEATURE_ID
          )).size,
          spec.features,
        );
        for (const feature of geometry.features) {
          assert.match(feature.properties.CRM_PARENT_GEOID, /^42\d{3}$/);
          assertVoteFreeProperties(
            feature.properties,
            spec.year + " " + feature.properties.CRM_FEATURE_ID,
          );
        }
      } else {
        assert.equal(geometry.normalizedFeatureCount, 0);
        assert.equal(geometry.diagnosticCandidateFeatureCount, spec.rawFeatures);
        assert.equal(
          manifest.crosswalk.relationships.pendingReview,
          spec.sourceUnits,
        );
      }
    }
  },
);

test(
  "Pennsylvania reviewed joins use only exact county-qualified VTD and complete-vector matches",
  () => {
    const sixteen = parse(
      process.cwd(),
      YEARS.find((spec) => spec.year === 2016),
    );
    assert.deepEqual(sixteen.evidence.geometryReview.methods, {
      exactOfficialVtdAndCompleteVoteSignature: 8_014,
      officialSourceComponentAggregation: 4,
    });
    assert.equal(
      sixteen.geometry.features.filter((feature) =>
        feature.properties.SOURCE_GEOMETRY_METHOD === "reviewed_no_data"
      ).length,
      1_153,
    );
    assert.ok(
      sixteen.results.rows.some((row) =>
        row.sourceComponentUnitIds.length > 1
      ),
    );

    const twenty = parse(
      process.cwd(),
      YEARS.find((spec) => spec.year === 2020),
    );
    assert.deepEqual(twenty.evidence.geometryReview.methods, {
      exactOfficialVtdAndCompleteVoteSignature: 6_805,
      officialSourceComponentAggregation: 22,
    });
    assert.equal(
      twenty.geometry.features.filter((feature) =>
        feature.properties.SOURCE_GEOMETRY_METHOD === "reviewed_no_data"
      ).length,
      2_345,
    );
    assert.ok(
      twenty.results.rows.some((row) =>
        row.sourceComponentUnitIds.length > 1
      ),
    );
  },
);

test(
  "Pennsylvania coverage ledgers expose only reviewed partial years publicly while retaining fail-closed county candidates",
  () => {
    const inventories = new Map([
      [2012, "data/precinct-geometry-coverage-inventory-2012.json"],
      [2016, "data/precinct-geometry-coverage-inventory-2016.json"],
      [2020, "data/precinct-geometry-coverage-inventory-2020.json"],
      [2024, "data/precinct-geometry-coverage-inventory.json"],
    ]);
    for (const spec of YEARS) {
      const inventory = JSON.parse(
        readFileSync(inventories.get(spec.year), "utf8"),
      );
      const row = inventory.states.find((entry) => entry.state === "PA");
      assert.ok(row, "Pennsylvania " + spec.year + " inventory row is required");
      assert.equal(row.electionId, spec.electionId);
      assert.equal(row.programStatus, "reviewed");
      assert.equal(row.disposition, spec.disposition);
      const candidateManifestId = [2020, 2024].includes(spec.year)
        ? `pa-${spec.year}-union-county-official-precinct-geometry-candidate-v1`
        : null;
      assert.deepEqual(
        row.geometry.manifestIds,
        candidateManifestId
          ? [spec.manifestId, candidateManifestId]
          : [spec.manifestId],
      );
      assert.equal(row.geometry.featureCount, spec.features);
      assert.equal(
        row.geometry.publicEligibleManifestCount,
        spec.safe ? 1 : 0,
      );
      assert.equal(
        row.crosswalk.resultUnits,
        spec.safe ? spec.mappedRows : spec.sourceUnits,
      );
      assert.equal(row.crosswalk.matchedResultUnits, spec.mappedRows);
      if (candidateManifestId) {
        assert.equal(
          row.geometry.candidateFollowup.manifestId,
          candidateManifestId,
        );
        assert.equal(row.geometry.candidateFollowup.featureCount, 27);
        assert.equal(row.geometry.candidateFollowup.matchedResultUnits, 27);
        assert.equal(
          row.geometry.candidateFollowup.vintageStatus,
          spec.year === 2024 ? "unknown" : "election_date_confirmed",
        );
        assert.equal(row.geometry.candidateFollowup.validationStatus, "blocked");
        assert.equal(row.geometry.candidateFollowup.delivery, null);
      }
    }
  },
);

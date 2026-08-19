import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import {
  calculateDistrictGeometryMetrics,
  compareDistrictResolutions,
} from "../../src/lib/district-compactness-core.ts";

const square = {
  type: "Polygon",
  coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
};
const rectangle = {
  type: "Polygon",
  coordinates: [[[-2, -0.5], [2, -0.5], [2, 0.5], [-2, 0.5], [-2, -0.5]]],
};

test("compactness math is bounded and responds to shape", () => {
  const squareMetrics = calculateDistrictGeometryMetrics(square);
  const rectangleMetrics = calculateDistrictGeometryMetrics(rectangle);
  assert.ok(squareMetrics.areaSquareMeters > 0);
  assert.ok(squareMetrics.perimeterMeters > 0);
  assert.ok(squareMetrics.polsbyPopper > 0 && squareMetrics.polsbyPopper <= 1);
  assert.ok(squareMetrics.convexHullRatio > 0.999 && squareMetrics.convexHullRatio <= 1);
  assert.ok(rectangleMetrics.polsbyPopper < squareMetrics.polsbyPopper);
});

test("holes, multipart geometry, and the antimeridian remain explicit", () => {
  const withHole = calculateDistrictGeometryMetrics({
    type: "Polygon",
    coordinates: [
      [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]],
      [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]],
    ],
  });
  assert.equal(withHole.holeCount, 1);
  assert.equal(withHole.partCount, 1);
  const antimeridian = calculateDistrictGeometryMetrics({
    type: "Polygon",
    coordinates: [[[179, 10], [-179, 10], [-179, 12], [179, 12], [179, 10]]],
  });
  assert.ok(Number.isFinite(antimeridian.areaSquareMeters));
  assert.ok(antimeridian.areaSquareMeters > 1e9 && antimeridian.areaSquareMeters < 1e12);
  assert.ok(antimeridian.polsbyPopper > 0 && antimeridian.polsbyPopper <= 1);
});

test("resolution comparisons fail closed across incompatible plans", () => {
  const metrics = calculateDistrictGeometryMetrics(square);
  const detailed = {
    ...metrics,
    geoid: "0101",
    geographyType: "congressional",
    planVintage: "2024-01-01",
    resolution: "detailed",
  };
  const generalized = { ...detailed, resolution: "generalized_500k" };
  assert.equal(compareDistrictResolutions(detailed, generalized).resolutionStability, "stable");
  assert.throws(
    () => compareDistrictResolutions(detailed, { ...generalized, planVintage: "2022-01-01" }),
    /not comparable/,
  );
  assert.throws(
    () => compareDistrictResolutions({ ...detailed, resolution: "generalized_500k" }, generalized),
    /requires detailed/,
  );
});

test("official Census dataset has reviewed counts and bounded metrics", async () => {
  const [dataset, summary] = await Promise.all([
    readFile("data/district-compactness/district-compactness.json", "utf8").then(JSON.parse),
    readFile("data/district-compactness/summary.json", "utf8").then(JSON.parse),
  ]);
  assert.equal(dataset.schemaVersion, "district-compactness-v1");
  assert.equal(dataset.rows.length, 7_272);
  assert.deepEqual(summary.countsByGeography, {
    congressional: 441,
    state_upper: 1_958,
    state_lower: 4_873,
  });
  assert.equal(summary.excludedUndefinedDistrictCount, 15);
  assert.equal(summary.excludedUndefinedDistricts.every((row) => /Z+$/.test(row.geoid)), true);
  assert.equal(dataset.rows.some((row) => /Z+$/.test(row.geoid)), false);
  assert.equal(dataset.resultRelationship.status, "not_calculated");
  for (const row of dataset.rows) {
    assert.ok(row.polsbyPopper > 0 && row.polsbyPopper <= 1, row.geoid);
    assert.ok(row.convexHullRatio > 0 && row.convexHullRatio <= 1, row.geoid);
    assert.ok(["stable", "resolution_sensitive"].includes(row.resolutionStability));
    assert.equal(row.advisoryOnly, true);
  }
});

test("retained sources and generated outputs match their manifest hashes", async () => {
  const manifest = JSON.parse(await readFile("data/district-compactness/manifest.json", "utf8"));
  assert.equal(manifest.sources.length, 6);
  assert.equal(manifest.expectedRowCount, 7_272);
  for (const source of manifest.sources) {
    const compressed = await readFile(source.localPath);
    assert.equal(createHash("sha256").update(compressed).digest("hex"), source.compressedSha256);
    const raw = gunzipSync(compressed);
    assert.equal(createHash("sha256").update(raw).digest("hex"), source.rawSha256);
    assert.equal(JSON.parse(raw.toString("utf8")).features.length, source.featureCount);
  }
  for (const output of manifest.outputs) {
    const contents = await readFile(output.localPath);
    assert.equal(contents.length, output.bytes);
    assert.equal(createHash("sha256").update(contents).digest("hex"), output.sha256);
  }
});

test("public page and API keep the advisory and plan-vintage boundaries visible", async () => {
  const [page, route, parser, core] = await Promise.all([
    readFile("src/app/district-compactness/page.tsx", "utf8"),
    readFile("src/app/api/district-compactness/route.ts", "utf8"),
    readFile("scripts/collect-district-compactness.mjs", "utf8"),
    readFile("src/lib/district-compactness-core.ts", "utf8"),
  ]);
  assert.match(page, /not a gerrymandering severity score/i);
  assert.match(page, /Outcome relationships are not calculated yet/);
  assert.match(route, /advisoryOnly: true/);
  assert.match(route, /resultRelationship/);
  assert.match(parser, /--check/);
  assert.match(parser, /compareDistrictResolutions/);
  assert.match(core, /resolution_sensitive/);
  assert.match(parser, /districts not defined/);
});

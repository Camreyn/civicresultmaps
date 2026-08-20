import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const geometryPath = path.join(root, "public", "data", "national-counties.geojson");
const registryPath = path.join(root, "data", "canonical-jurisdictions.json");

const [geometryText, registryText, builderText, pageText, explorerText, cssText] = await Promise.all([
  readFile(geometryPath, "utf8"),
  readFile(registryPath, "utf8"),
  readFile(path.join(root, "scripts", "build-national-county-geometry.mjs"), "utf8"),
  readFile(path.join(root, "src", "app", "compare", "page.tsx"), "utf8"),
  readFile(path.join(root, "src", "app", "compare", "compare-explorer.tsx"), "utf8"),
  readFile(path.join(root, "src", "app", "compare", "compare.module.css"), "utf8"),
]);

const geometry = JSON.parse(geometryText);
const registry = JSON.parse(registryText);
const canonicalByFips = new Map(registry.jurisdictions.map((row) => [row.fips, row]));

assert.equal(geometry.type, "FeatureCollection");
assert.equal(geometry.features.length, 3144, "national geometry must preserve all canonical county equivalents");
assert.equal(geometry.metadata.featureCount, 3144);
assert.equal(geometry.metadata.includesAlaskaCountyEquivalents, 30);
assert.equal(canonicalByFips.size, 3144);
assert.equal((await stat(geometryPath)).size < 2_000_000, true, "national geometry should stay below 2 MB");

const seen = new Set();
let coordinateCount = 0;

function visitCoordinates(value, callback) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    callback(value);
    return;
  }
  for (const item of value) visitCoordinates(item, callback);
}

function visitRings(feature, callback) {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  assert.ok(polygons.length > 0, `${feature.properties.GEOID} must contain polygon geometry`);
  for (const polygon of polygons) {
    assert.ok(polygon.length > 0, `${feature.properties.GEOID} polygon must contain a ring`);
    for (const ring of polygon) callback(ring);
  }
}

for (const feature of geometry.features) {
  assert.equal(feature.type, "Feature");
  assert.deepEqual(Object.keys(feature.properties).sort(), ["GEOID", "NAME", "STATE"]);
  assert.match(feature.properties.GEOID, /^\d{5}$/);
  assert.match(feature.properties.STATE, /^[A-Z]{2}$/);
  assert.equal(seen.has(feature.properties.GEOID), false, `duplicate GEOID ${feature.properties.GEOID}`);
  seen.add(feature.properties.GEOID);

  const canonical = canonicalByFips.get(feature.properties.GEOID);
  assert.ok(canonical, `geometry GEOID ${feature.properties.GEOID} must exist in the canonical registry`);
  assert.equal(feature.properties.STATE, canonical.state);
  assert.equal(feature.properties.NAME, canonical.displayName);
  assert.ok(feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon");

  visitRings(feature, (ring) => {
    assert.ok(ring.length >= 4, `${feature.properties.GEOID} has a degenerate ring`);
    assert.deepEqual(ring[0], ring[ring.length - 1], `${feature.properties.GEOID} ring must be closed`);
  });
  visitCoordinates(feature.geometry.coordinates, ([longitude, latitude]) => {
    coordinateCount += 1;
    assert.ok(Number.isFinite(longitude) && Number.isFinite(latitude));
    assert.ok(longitude >= -180 && longitude <= 180, `${feature.properties.GEOID} longitude out of range`);
    assert.ok(latitude >= -90 && latitude <= 90, `${feature.properties.GEOID} latitude out of range`);
    assert.ok(Math.abs(longitude * 10_000 - Math.round(longitude * 10_000)) < 1e-6, "longitude exceeds four decimals");
    assert.ok(Math.abs(latitude * 10_000 - Math.round(latitude * 10_000)) < 1e-6, "latitude exceeds four decimals");
  });
}

assert.equal(seen.size, canonicalByFips.size);
assert.deepEqual([...seen].sort(), [...canonicalByFips.keys()].sort());
assert.ok(coordinateCount < 100_000, `simplified geometry should stay lightweight; found ${coordinateCount} coordinates`);

assert.match(builderText, /canonical-jurisdictions\.json/);
assert.match(builderText, /Expected 3,144 unique canonical county equivalents/);
assert.match(builderText, /simplificationToleranceDegrees/);
assert.match(pageText, /National Swing &amp; Flip Explorer/);
assert.match(explorerText, /\/api\/flips\?/);
assert.match(explorerText, /\/data\/national-counties\.geojson/);
assert.match(explorerText, /All 3,144 canonical counties and county equivalents are present/);
assert.match(explorerText, /arrow keys to move/);
assert.match(explorerText, /Start year/);
assert.match(explorerText, /End year/);
assert.match(explorerText, /disabled=\{year >= toYear\}/);
assert.match(explorerText, /disabled=\{year <= fromYear\}/);
assert.doesNotMatch(explorerText, /Election pair/);
assert.match(explorerText, /Export CSV/);
assert.match(explorerText, /Open county profile/);
assert.match(cssText, /@media \(max-width: 640px\)/);
assert.match(cssText, /prefers-reduced-motion/);

console.log(
  `National compare geometry contract passed: ${geometry.features.length.toLocaleString()} features, ${coordinateCount.toLocaleString()} coordinates, ${(geometryText.length / 1_000_000).toFixed(2)} MB.`,
);

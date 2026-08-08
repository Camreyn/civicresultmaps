import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildOpenStreetMapViewport,
  longitudeLatitudeToWebMercator,
  OPENSTREETMAP_ATTRIBUTION,
  OPENSTREETMAP_ATTRIBUTION_URL,
  OPENSTREETMAP_STANDARD_TILE_ORIGIN,
  projectLongitudeLatitude,
  visibleOpenStreetMapTiles,
  webMercatorBounds,
} from "../../src/lib/openstreetmap-basemap.ts";

const hennepinEnvelope = [
  [-93.78, 44.78],
  [-93.78, 45.25],
  [-93.17, 45.25],
  [-93.17, 44.78],
];

test("OpenStreetMap viewport uses aligned Web Mercator tiles without prefetch", () => {
  const bounds = webMercatorBounds(hennepinEnvelope);
  assert.ok(bounds);
  const viewport = buildOpenStreetMapViewport({
    bounds,
    height: 520,
    padding: 22,
    width: 960,
  });
  const tiles = visibleOpenStreetMapTiles(viewport);

  assert.ok(viewport.zoom >= 8 && viewport.zoom <= 12);
  assert.ok(tiles.length >= 4 && tiles.length <= 20);
  assert.equal(new Set(tiles.map((tile) => tile.href)).size, tiles.length);
  for (const tile of tiles) {
    assert.match(
      tile.href,
      /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/,
    );
    assert.equal(tile.zoom, viewport.zoom);
    assert.ok(tile.screenX < viewport.width);
    assert.ok(tile.screenX + tile.size > 0);
    assert.ok(tile.screenY < viewport.height);
    assert.ok(tile.screenY + tile.size > 0);
  }

  const northWest = projectLongitudeLatitude(hennepinEnvelope[1], viewport);
  const southEast = projectLongitudeLatitude(hennepinEnvelope[3], viewport);
  assert.ok(northWest.x >= 22 && northWest.x <= viewport.width - 22);
  assert.ok(northWest.y >= 22 && northWest.y <= viewport.height - 22);
  assert.ok(southEast.x >= 22 && southEast.x <= viewport.width - 22);
  assert.ok(southEast.y >= 22 && southEast.y <= viewport.height - 22);
  assert.ok(northWest.x < southEast.x);
  assert.ok(northWest.y < southEast.y);
});

test("OpenStreetMap constants and projection follow the standard tile contract", () => {
  assert.equal(
    OPENSTREETMAP_STANDARD_TILE_ORIGIN,
    "https://tile.openstreetmap.org",
  );
  assert.equal(
    OPENSTREETMAP_ATTRIBUTION_URL,
    "https://www.openstreetmap.org/copyright",
  );
  assert.equal(OPENSTREETMAP_ATTRIBUTION, "© OpenStreetMap contributors");
  assert.deepEqual(longitudeLatitudeToWebMercator([0, 0]), {
    x: 0.5,
    y: 0.5,
  });
});

test("precinct UI keeps official election layers above a visibly attributed OSM basemap", () => {
  const component = readFileSync("src/app/precinct-detail-map.tsx", "utf8");
  const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  assert.match(component, /visibleOpenStreetMapTiles/);
  assert.match(component, /data-openstreetmap-tile/);
  assert.match(component, /precinct-detail-basemap-attribution/);
  assert.match(component, /OPENSTREETMAP_ATTRIBUTION_URL/);
  assert.match(component, /currentManifestLoad\.manifest\.source\.url/);
  assert.match(component, /Boundary source terms/);
  assert.doesNotMatch(component, /no-referrer/);
  assert.match(styles, /\.precinct-detail-basemap-attribution\s*\{/);
  assert.match(styles, /position:\s*absolute/);
  assert.match(styles, /container-type:\s*inline-size/);
  assert.match(styles, /@container\s*\(max-width:\s*720px\)/);
  assert.match(styles, /aspect-ratio:\s*24\s*\/\s*13/);
  assert.match(styles, /\.precinct-detail-shape\s*\{[^}]*fill-opacity:/s);
  assert.match(privacy, /OpenStreetMap map tiles/);
  assert.match(privacy, /tile\.openstreetmap\.org/);
  assert.match(privacy, /https:\/\/osmfoundation\.org\/wiki\/Privacy_Policy/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { buildWorkspaceMapPreview } from "../../src/lib/workspace-map-preview.ts";
import { featureJurisdictionTag } from "../../src/lib/workspace-map-paint.ts";
import { buildVotePrisms } from "../../src/lib/county-vote-prisms.ts";

test("a known comparison contest controls the share identity, label and prism data", async () => {
  const senate = { id: "comparison:United States Senator", label: "United States Senator", basis: "County comparison",
    counties: { "04001": { total: 72, color: "dem", outcome: "Democratic lead", sourceId: "fixture" } } };
  const map = await buildWorkspaceMapPreview({ state: "AZ", year: "2024", mode: "votes-3d", race: senate.id, fips: "48201", token: "private" },
    async (state, year) => { assert.equal(state, "AZ"); assert.equal(year, 2024); return [senate]; });
  assert.equal(map.selectedRace, senate);
  assert.equal(new URL(map.imagePath, "https://example.test").searchParams.get("race"), senate.id);
  assert.equal(new URL(map.sharePath, "https://example.test").searchParams.get("race"), senate.id);
  assert.match(map.imageAlt, /Arizona 2024.*United States Senator/);
  assert.doesNotMatch(map.imagePath, /private|48201/);
  const features = JSON.parse(readFileSync("public/data/national-counties.geojson")).features.filter(f => f.properties.STATE === "AZ");
  const { peak } = buildVotePrisms(features, map.selectedRace.counties, -12);
  assert.equal(peak, 72);
});

test("default home stays national but shared implicit workspace and historical modes match the page", async () => {
  const unused = () => { throw new Error("Unexpected race lookup"); };
  assert.equal(await buildWorkspaceMapPreview({}, unused), null);
  assert.equal((await buildWorkspaceMapPreview({ mode: "votes-3d" }, unused)).state, "WA");
  assert.equal((await buildWorkspaceMapPreview({ state: "WI", year: "2012" }, unused)).mode, "winner");
  assert.equal((await buildWorkspaceMapPreview({ state: "WI", year: "2020", mode: "method" }, unused)).mode, "winner");
  assert.equal(await buildWorkspaceMapPreview({ state: "WI", tab: "exports", mode: "volume" }, unused), null);
});

test("five-digit district IDs never become county pins; equipment IDs require county grain", () => {
  const ak = JSON.parse(gunzipSync(readFileSync("data/map-thumbnail-paths/AK.json.gz")));
  assert.ok(ak.counties.some(f => featureJurisdictionTag(f) === "county:02020"));
  assert.ok(ak.districts.length > 0 && ak.districts.every(f => featureJurisdictionTag(f) === null));
  assert.equal(featureJurisdictionTag({ properties: { GEOID: "02020", SLDL: "020" } }), null);
  const props = { STATE: "55", COUNTY: "003" };
  assert.equal(featureJurisdictionTag({properties: {...props, sourceGranularity: "county"}}), "county:55003");
  assert.equal(featureJurisdictionTag({properties: {...props, sourceGranularity: "municipal"}}), null);
});

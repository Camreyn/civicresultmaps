// Preproject existing public boundaries for small, offline social-card renders.
// Run from the repository root. No result data or statewide-to-county allocation.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { usStateOptions } from "../src/lib/us-states.ts";
import { coordinateBounds, flattenPositions, makePath, mapCoordinate, polygonRings } from "../src/lib/social-map-geometry.ts";
import { featureJurisdictionTag, featureName } from "../src/lib/workspace-map-paint.ts";

const out = "data/map-thumbnail-paths";
const check = process.argv.includes("--check");
if (!check) await mkdir(out, {recursive: true});
async function project(state, name, optional = false) {
  let file;
  try { file = await readFile("data/" + name, "utf8"); }
  catch (err) { if (optional && err.code === "ENOENT") return []; throw err; }
  const { features } = JSON.parse(file);
  const bounds = coordinateBounds(features.flatMap(f => flattenPositions(f.geometry.coordinates).map(p => mapCoordinate(state, p))));
  return features.map(f => {
    const GEOID = featureJurisdictionTag(f)?.slice("county:".length);
    const { equipmentGroupLabel } = f.properties;
    return { properties: { NAME: featureName(f), GEOID, equipmentGroupLabel }, path: makePath(state, polygonRings(f), bounds) };
  });
}
let bytes = 0;
for (const [state] of usStateOptions) {
  const code = state.toLowerCase();
  const counties = await project(state, code + "-counties.geojson");
  const equipment = await project(state, `verifiedvoting-${code}-2024-equipment-areas.geojson`, true);
  const districts = state === "AK" ? await project(state, "ak-house-districts.geojson") : undefined;
  const json = JSON.stringify({ counties, equipment, districts });
  const target = `${out}/${state}.json.gz`;
  if (check) {
    if (gunzipSync(await readFile(target)).toString() !== json) throw new Error("Outdated thumbnail paths: " + state);
  } else await writeFile(target, gzipSync(json, { level: 9 }));
  bytes += (await readFile(target)).length;
}
console.log(`${check ? "Verified" : "Generated"} ${usStateOptions.length} state thumbnail assets (${bytes.toLocaleString("en-US")} bytes).`);

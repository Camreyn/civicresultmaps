import { writeFile } from "node:fs/promises";
import path from "node:path";
import { states as stateMetadata } from "./state-metadata.mjs";

const stateByCode = new Map(stateMetadata.map((state) => [state.code, state]));
const defaultOutDir = path.join(process.cwd(), "data");

const alaskaHouseDistricts = {
  fileName: "ak-house-districts.geojson",
  layerUrl: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/2/query",
  outFields: "GEOID,STATE,SLDL,NAME,BASENAME",
};

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function statesToCollect() {
  const explicit = argValue("--states", "");
  const positional = process.argv
    .slice(2)
    .filter((value) => !value.startsWith("--"))
    .flatMap((value) => value.split(/[,\s]+/))
    .filter((value) => /^[A-Za-z]{2}$/.test(value))
    .join(",");

  return String(explicit || positional)
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
}

function queryUrlForState(stateCode, fips) {
  const params = new URLSearchParams({
    where: `STATE='${fips}'`,
    outFields: stateCode === "AK" ? alaskaHouseDistricts.outFields : "GEOID,STATE,COUNTY,NAME,BASENAME",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  if (stateCode === "AK") {
    return `${alaskaHouseDistricts.layerUrl}?${params}`;
  }

  return `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?${params}`;
}

function normalizeFeature(feature) {
  const properties = feature.properties ?? {};
  const name = String(properties.NAME ?? properties.BASENAME ?? "").trim();
  return {
    ...feature,
    properties: {
      ...properties,
      BASENAME: String(properties.BASENAME ?? name).trim(),
      GEOID: String(properties.GEOID ?? "").trim(),
      NAME: name,
    },
  };
}

function fileNameForState(stateCode) {
  return stateCode === "AK" ? alaskaHouseDistricts.fileName : `${stateCode.toLowerCase()}-counties.geojson`;
}

async function collectState(stateCode) {
  const state = stateByCode.get(stateCode);
  if (!state) {
    throw new Error(`Unsupported state code: ${stateCode}`);
  }

  const response = await fetch(queryUrlForState(stateCode, state.fips));
  if (!response.ok) {
    throw new Error(`${stateCode} Census TIGERweb request failed: ${response.status} ${response.statusText}`);
  }

  const collection = await response.json();
  const features = Array.isArray(collection.features) ? collection.features.map(normalizeFeature) : [];
  if (features.length === 0) {
    throw new Error(`${stateCode} Census TIGERweb response had no geometry features.`);
  }

  const output = {
    type: "FeatureCollection",
    features,
  };
  const filePath = path.join(defaultOutDir, fileNameForState(stateCode));
  await writeFile(filePath, `${JSON.stringify(output)}\n`, "utf8");
  return {
    file: path.relative(process.cwd(), filePath),
    features: features.length,
    state: stateCode,
  };
}

async function main() {
  const states = statesToCollect();
  if (states.length === 0) {
    throw new Error("Pass at least one state code, for example: node scripts/collect-census-county-geometry.mjs CA");
  }

  const results = [];
  for (const state of states) {
    results.push(await collectState(state));
  }

  console.log(JSON.stringify({ collected: results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
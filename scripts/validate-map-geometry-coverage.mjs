import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import adminPackages from "../data/admin-source-packages.json" with { type: "json" };
import coverage from "../src/lib/map-geometry-coverage.json" with { type: "json" };

const dataDir = path.join(process.cwd(), "data");
const year = 2024;

function geoJsonPath(state) {
  return state === "AK" ? "ak-house-districts.geojson" : `${state.toLowerCase()}-counties.geojson`;
}

function equipmentAreaPath(state) {
  return `verifiedvoting-${state.toLowerCase()}-2024-equipment-areas.geojson`;
}

async function readGeoJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  return {
    fileName,
    featureCount: Array.isArray(parsed.features) ? parsed.features.length : 0,
    type: parsed.type,
  };
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const errors = [];
  const warnings = [];
  const stateStatuses = adminPackages.stateYearStatuses.filter((entry) => Number(entry.electionYear) === year);
  const states = uniqueSorted(stateStatuses.map((entry) => entry.state));
  const stateSet = new Set(states);
  const baseStates = uniqueSorted(coverage.baseResultGeometryStates.map((state) => state.toUpperCase()));
  const dataFiles = await readdir(dataDir);
  const localBaseGeometryFiles = dataFiles.filter((file) => /^(?:[a-z]{2}-counties|ak-house-districts)\.geojson$/.test(file));
  const localBaseStates = uniqueSorted(
    localBaseGeometryFiles.map((file) => (file === "ak-house-districts.geojson" ? "AK" : file.slice(0, 2).toUpperCase())),
  );

  for (const state of baseStates) {
    if (!stateSet.has(state)) {
      errors.push(`${state} is listed as base result geometry but is not in the admin source registry.`);
    }
  }

  for (const state of localBaseStates) {
    if (!baseStates.includes(state)) {
      errors.push(`${state} has a local base geometry file but is not listed in map-geometry-coverage.json.`);
    }
  }

  for (const state of baseStates) {
    try {
      const geometry = await readGeoJson(geoJsonPath(state));
      if (geometry.type !== "FeatureCollection") {
        errors.push(`${state} base geometry is ${geometry.type || "missing type"}, expected FeatureCollection.`);
      }
      if (geometry.featureCount <= 0) {
        errors.push(`${state} base geometry has no features.`);
      }
    } catch (error) {
      errors.push(`${state} base geometry missing or unreadable: ${error.message}`);
    }
  }

  const equipmentGeometry = [];
  for (const entry of stateStatuses) {
    const state = entry.state;
    try {
      const geometry = await readGeoJson(equipmentAreaPath(state));
      equipmentGeometry.push({ expected: entry.equipment?.expectedJurisdictions ?? null, state, ...geometry });
      if (geometry.type !== "FeatureCollection") {
        errors.push(`${state} equipment geometry is ${geometry.type || "missing type"}, expected FeatureCollection.`);
      }
      if (geometry.featureCount <= 0) {
        errors.push(`${state} equipment geometry has no features.`);
      }
      if (
        typeof entry.equipment?.expectedJurisdictions === "number" &&
        geometry.featureCount !== entry.equipment.expectedJurisdictions
      ) {
        warnings.push(
          `${state} equipment geometry has ${geometry.featureCount} GIS area features; registry expects ${entry.equipment.expectedJurisdictions} equipment rows.`,
        );
      }
    } catch (error) {
      errors.push(`${state} equipment geometry missing or unreadable: ${error.message}`);
    }
  }

  const report = {
    baseResultGeometryStates: baseStates.length,
    checkedStates: states.length,
    equipmentGeometryStates: equipmentGeometry.length,
    errors,
    localBaseStates,
    warnings,
  };

  console.log(JSON.stringify(report, null, 2));

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

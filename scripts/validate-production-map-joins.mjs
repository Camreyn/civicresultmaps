import coverage from "../src/lib/map-geometry-coverage.json" with { type: "json" };
import fs from "node:fs";
import path from "node:path";

const states = coverage.baseResultGeometryStates;

const appBaseUrl = process.env.CIVIC_MAPS_BASE_URL ?? "https://civicresultmaps.org";
const geoBaseUrl =
  process.env.CIVIC_MAPS_GEO_BASE_URL ??
  "https://raw.githubusercontent.com/Camreyn/civicresultmaps/main/data";

function stripBom(value) {
  return String(value ?? "").replace(/^\uFEFF/, "");
}

function readLocalStateConfig(state) {
  const configPath = path.join("etl", "state-configs", `${String(state).toLowerCase()}.json`);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  return JSON.parse(stripBom(fs.readFileSync(configPath, "utf8")));
}

function resultlessMapSkipReason(state, config, productionCoverage) {
  if (!config) {
    return null;
  }

  if (config.turnoutOnly === true) {
    return `${state} is configured as turnout-only; no production result-map join is expected yet.`;
  }

  if (config.capabilities?.certifiedResults === false || config.capabilities?.map === false) {
    return `${state} config does not enable certified result maps yet.`;
  }

  if (Number(config.expected?.resultRows ?? NaN) === 0) {
    return `${state} config expects zero 2024 result rows.`;
  }

  const productionCapabilities = productionCoverage?.data?.capabilities ?? productionCoverage?.capabilities ?? null;
  if (config.capabilities?.map === true && productionCapabilities?.map === false) {
    return `${state} local config enables result maps, but production coverage still reports map disabled pending data promotion.`;
  }

  return null;
}

function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bSaint\b/gi, "St")
    .replace(/\bMore\b.*$/i, "")
    .replace(/Â»/g, "")
    .replace(/\s+(County|Parish|Planning Region)$/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

function geoJsonPath(state) {
  return state === "AK" ? "ak-house-districts.geojson" : `${state.toLowerCase()}-counties.geojson`;
}

function featureName(feature) {
  const properties = feature.properties ?? {};
  return (
    properties.NAME ??
    properties.county_name ??
    properties.BASENAME ??
    properties.COUNTYNAME ??
    properties.COUNTY_NAME ??
    properties.CountyName ??
    properties.NAMELSAD ??
    properties.name ??
    ""
  );
}

function resultNameForFeature(state, name) {
  const normalized = normalizeName(name);
  if (state === "HI" && normalized === "KALAWAO") {
    return "Maui";
  }
  if (state === "MS" && normalized === "JEFFERSONDAVIS") {
    return "Jeff Davis County";
  }

  return name;
}

function isAllowedMissingBoundary(state, name) {
  const normalized = normalizeName(name);
  return state === "KY" && normalized === "ELLIOTT";
}

function isNonGeographicResultRow(state, name) {
  const normalized = normalizeName(name);
  return (state === "ME" && normalized === "STATEUOCAVA") || (state === "MO" && normalized === "KANSASCITY") || (state === "RI" && ["FEDERALPRECINCTS", "STATEWIDERECONCILIATIONDELTA"].includes(normalized));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

const report = [];

for (const state of states) {
  try {
    const config = readLocalStateConfig(state);
    const [results, geojson, productionCoverage] = await Promise.all([
      fetchJson(`${appBaseUrl}/api/results?state=${state}&year=2024&level=county`),
      fetchJson(`${geoBaseUrl}/${geoJsonPath(state)}`),
      fetchJson(`${appBaseUrl}/api/coverage?state=${state}&year=2024`).catch(() => null),
    ]);
    const skipReason = resultlessMapSkipReason(state, config, productionCoverage);
    if (skipReason) {
      report.push({
        state,
        resultRows: results.data?.length ?? 0,
        boundaries: geojson.features?.length ?? 0,
        blankNames: 0,
        unmatched: [],
        unmatchedCount: 0,
        unmappedRows: [],
        unmappedRowCount: 0,
        skipped: true,
        skipReason,
      });
      continue;
    }

    const resultKeys = new Set(results.data.map((row) => normalizeName(row.jurisdictionName)));
    const featureKeys = new Set();
    const unmatched = [];
    let blankNames = 0;

    for (const feature of geojson.features ?? []) {
      const name = featureName(feature);
      if (!String(name).trim()) {
        blankNames += 1;
        continue;
      }

      const resultName = resultNameForFeature(state, name);
      featureKeys.add(normalizeName(resultName));
      if (!resultKeys.has(normalizeName(resultName)) && !isAllowedMissingBoundary(state, name)) {
        unmatched.push(String(name));
      }
    }

    const unmappedRows = results.data
      .filter((row) => !isNonGeographicResultRow(state, row.jurisdictionName) && !featureKeys.has(normalizeName(row.jurisdictionName)))
      .map((row) => row.jurisdictionName)
      .sort((a, b) => a.localeCompare(b));

    report.push({
      state,
      resultRows: results.data.length,
      boundaries: geojson.features?.length ?? 0,
      blankNames,
      unmatched: unmatched.slice(0, 12),
      unmatchedCount: unmatched.length,
      unmappedRows: unmappedRows.slice(0, 12),
      unmappedRowCount: unmappedRows.length,
    });
  } catch (error) {
    report.push({
      state,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const failures = report.filter((row) => row.error || row.blankNames > 0 || row.unmatchedCount > 0 || row.unmappedRowCount > 0);
const skipped = report.filter((row) => row.skipped);
console.log(JSON.stringify({ checkedStates: report.length, skippedStates: skipped.length, failures, skipped, summary: report }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}

import coverage from "../src/lib/map-geometry-coverage.json" with { type: "json" };

const states = coverage.baseResultGeometryStates;

const appBaseUrl = process.env.CIVIC_MAPS_BASE_URL ?? "https://civicresultmaps.org";
const geoBaseUrl =
  process.env.CIVIC_MAPS_GEO_BASE_URL ??
  "https://raw.githubusercontent.com/Camreyn/civicresultmaps/main/data";

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
  return (state === "ME" && normalized === "STATEUOCAVA") || (state === "RI" && normalized === "FEDERALPRECINCTS");
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
    const [results, geojson] = await Promise.all([
      fetchJson(`${appBaseUrl}/api/results?state=${state}&year=2024&level=county`),
      fetchJson(`${geoBaseUrl}/${geoJsonPath(state)}`),
    ]);
    const resultKeys = new Set(results.data.map((row) => normalizeName(row.jurisdictionName)));
    const unmatched = [];
    let blankNames = 0;

    for (const feature of geojson.features ?? []) {
      const name = featureName(feature);
      if (!String(name).trim()) {
        blankNames += 1;
        continue;
      }

      if (!resultKeys.has(normalizeName(resultNameForFeature(state, name))) && !isAllowedMissingBoundary(state, name)) {
        unmatched.push(String(name));
      }
    }

    report.push({
      state,
      resultRows: results.data.length,
      boundaries: geojson.features?.length ?? 0,
      blankNames,
      unmatched: unmatched.slice(0, 12),
      unmatchedCount: unmatched.length,
    });
  } catch (error) {
    report.push({
      state,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const failures = report.filter((row) => row.error || row.blankNames > 0 || row.unmatchedCount > 0);
console.log(JSON.stringify({ checkedStates: report.length, failures, summary: report }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}


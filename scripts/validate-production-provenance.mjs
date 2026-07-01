import fs from "node:fs";
import path from "node:path";

const appBaseUrl = process.env.CIVIC_MAPS_BASE_URL ?? "https://civicresultmaps.org";
const year = Number(process.env.CIVIC_MAPS_YEAR ?? 2024);

async function fetchJson(path, options = {}) {
  const response = await fetch(`${appBaseUrl}${path}`);
  if (!response.ok) {
    if (options.optional) {
      return null;
    }

    throw new Error(`${response.status} ${response.statusText} for ${path}`);
  }

  return response.json();
}

const completeness = await fetchJson(`/api/completeness?year=${year}`, { optional: true });
const states = completeness?.data ?? (await fetchJson("/api/states")).data;
const failures = [];
const summary = [];

function stripBom(value) {
  return String(value ?? "").replace(/^\uFEFF/, "");
}

function sourceIdVariants(stateCode, year, sourceId) {
  const value = String(sourceId ?? "").trim();
  const lowerState = String(stateCode ?? "").toLowerCase();
  const prefix = lowerState + "-" + year + "-";
  const variants = new Set([value]);
  if (value.startsWith(prefix)) {
    const unprefixed = value.slice(prefix.length);
    variants.add(unprefixed);
    if (!unprefixed.startsWith(prefix)) variants.add(prefix + unprefixed);
  } else if (value) {
    variants.add(prefix + value);
  }
  return variants;
}

function addLocalConfigSourceIds(sourceIds, stateCode) {
  const configPath = path.join("etl", "state-configs", String(stateCode).toLowerCase() + ".json");
  if (!fs.existsSync(configPath)) return;
  const config = JSON.parse(stripBom(fs.readFileSync(configPath, "utf8")));
  for (const source of config.sources ?? []) {
    for (const variant of sourceIdVariants(stateCode, year, source.id)) sourceIds.add(variant);
  }
}

function hasSourceId(sourceIds, stateCode, sourceId) {
  for (const variant of sourceIdVariants(stateCode, year, sourceId)) {
    if (sourceIds.has(variant)) return true;
  }
  return false;
}

for (const state of states ?? []) {
  const stateCode = state.state ?? state.code;
  if (!stateCode) {
    continue;
  }

  const [results, sources] = await Promise.all([
    fetchJson(`/api/results?state=${stateCode}&year=${year}&level=county`),
    fetchJson(`/api/sources?state=${stateCode}&year=${year}`),
  ]);

  if ((results.data?.length ?? 0) === 0) {
    continue;
  }

  const sourceIds = new Set((sources.data ?? []).map((source) => source.id));
  addLocalConfigSourceIds(sourceIds, stateCode);
  const rowsMissingSourceIds = (results.data ?? []).filter((row) => !String(row.sourceId ?? "").trim());
  const sourceIdsWithoutRecords = (results.data ?? []).filter((row) => !hasSourceId(sourceIds, stateCode, row.sourceId));
  const sourcesMissingUrls = (sources.data ?? []).filter((source) => !String(source.sourceUrl ?? "").trim());

  const stateSummary = {
    state: stateCode,
    resultRows: results.data?.length ?? 0,
    sourceCount: sources.data?.length ?? 0,
    rowsMissingSourceIds: rowsMissingSourceIds.length,
    sourceIdsWithoutRecords: sourceIdsWithoutRecords.length,
    sourcesMissingUrls: sourcesMissingUrls.length,
  };
  summary.push(stateSummary);

  if (
    stateSummary.rowsMissingSourceIds > 0 ||
    stateSummary.sourceIdsWithoutRecords > 0 ||
    stateSummary.sourcesMissingUrls > 0
  ) {
    failures.push({
      ...stateSummary,
      sampleRowsMissingSourceIds: rowsMissingSourceIds.slice(0, 5).map((row) => row.jurisdictionName),
      sampleSourceIdsWithoutRecords: sourceIdsWithoutRecords.slice(0, 5).map((row) => row.sourceId),
      sampleSourcesMissingUrls: sourcesMissingUrls.slice(0, 5).map((source) => source.id),
    });
  }
}

console.log(JSON.stringify({ checkedStates: summary.length, failures, summary }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}

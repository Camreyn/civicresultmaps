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
  const rowsMissingSourceIds = (results.data ?? []).filter((row) => !String(row.sourceId ?? "").trim());
  const sourceIdsWithoutRecords = (results.data ?? []).filter((row) => !sourceIds.has(row.sourceId));
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

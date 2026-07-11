import { getCanonicalJurisdictionRegistry, resolveJurisdictionTag } from "../src/lib/jurisdiction-tags.ts";
import { loadStagingJurisdictionReportSource } from "./lib/staging-jurisdiction-report-source.mjs";

const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const stagingDir = process.argv.find((arg) => arg.startsWith("--staging-dir="))?.slice("--staging-dir=".length);
const overlayStatesArg = process.argv.find((arg) => arg.startsWith("--overlay-states="))?.slice("--overlay-states=".length);
const base = baseArg?.slice("--base=".length) ?? "https://www.civicresultmaps.org";
const year = Number(process.argv.find((arg) => arg.startsWith("--year="))?.slice("--year=".length) ?? 2024);
const family = process.argv.find((arg) => arg.startsWith("--family="))?.slice("--family=".length) ?? (year === 2024 ? "results" : "historical");
const failOnGaps = process.argv.includes("--fail-on-gaps");
const reportRun = Date.now().toString(36);

const overlayStates = new Set((overlayStatesArg ?? "").split(",").map((state) => state.trim().toUpperCase()).filter(Boolean));
const invalidOverlayState = Array.from(overlayStates).find((state) => !/^[A-Z]{2}$/.test(state));

if (
  !Number.isInteger(year)
  || !["results", "historical"].includes(family)
  || (baseArg && stagingDir && !overlayStates.size)
  || (overlayStatesArg != null && (!stagingDir || !overlayStates.size || invalidOverlayState))
) {
  throw new Error("Usage: report-2024-county-list-coverage.mjs [--year=2016] [--family=historical|results] [--base=https://...] [--staging-dir=.etl/staging [--overlay-states=CO,LA]] [--fail-on-gaps]");
}

const stagingSource = stagingDir ? await loadStagingJurisdictionReportSource(stagingDir) : null;
for (const state of overlayStates) {
  if (!stagingSource.states.includes(state)) {
    throw new Error(`No staging artifact found for overlay state ${state}`);
  }
}
const useStagingForState = (state) => stagingSource && (!overlayStates.size || overlayStates.has(state));

async function api(route) {
  const url = new URL(route, base);
  url.searchParams.set("reportRun", reportRun);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${route} returned ${response.status}`);
  }
  return response.json();
}

function resolutionFor(row, state) {
  if (row.jurisdictionTag) {
    return { jurisdictionTag: row.jurisdictionTag, reason: "persisted" };
  }
  return resolveJurisdictionTag({
    state,
    jurisdictionCode: row.jurisdictionCode,
    jurisdictionName: row.jurisdictionName,
    level: family === "historical" ? row.sourceLevel : row.level,
  });
}


async function rowsForState(state) {
  if (useStagingForState(state)) {
    return stagingSource.rowsForState(state, family, year);
  }

  if (family === "historical") {
    return (await api(`/api/historical-baselines?state=${state}&year=${year}&limit=5000`)).data;
  }
  return (await api(`/api/results?state=${state}&year=${year}&level=county`)).data;
}

const registryRows = getCanonicalJurisdictionRegistry().jurisdictions.filter(
  (row) => row.jurisdictionTag.startsWith("county:") && ["county", "county_equivalent"].includes(row.level),
);
const expectedByState = new Map();
for (const row of registryRows) {
  expectedByState.set(row.state, [...(expectedByState.get(row.state) ?? []), row]);
}

const states = stagingSource && !overlayStates.size
  ? stagingSource.states
  : (await api("/api/states")).data.map((state) => state.code).sort();
const unresolved = [];
const intentionalNonGeographic = [];
const duplicateTags = [];
const missingExpectedTags = [];
const summaries = [];

for (const state of states) {
  const rows = await rowsForState(state);
  const expectedRows = expectedByState.get(state) ?? [];
  const expectedTags = new Map(expectedRows.map((row) => [row.jurisdictionTag, row.displayName]));
  const seenTags = new Map();

  let unresolvedRowCount = 0;
  let intentionalNonGeographicRowCount = 0;

  for (const row of rows) {
    const resolution = resolutionFor(row, state);
    const tag = resolution.jurisdictionTag;
    const detail = {
      state,
      jurisdictionName: row.jurisdictionName,
      jurisdictionCode: row.jurisdictionCode,
      level: family === "historical" ? row.sourceLevel : row.level,
      totalVotes: row.totalVotes,
      reason: resolution.reason,
    };
    if (!tag) {
      if (resolution.reason === "non_geographic") {
        intentionalNonGeographic.push(detail);
        intentionalNonGeographicRowCount += 1;
      } else {
        unresolved.push(detail);
        unresolvedRowCount += 1;
      }
      continue;
    }
    if (!tag.startsWith("county:")) {
      unresolved.push({ ...detail, reason: "non_county_tag", tag });
      unresolvedRowCount += 1;
      continue;
    }
    seenTags.set(tag, [...(seenTags.get(tag) ?? []), row.jurisdictionName]);
  }

  for (const [tag, names] of seenTags) {
    if (names.length > 1) {
      duplicateTags.push({ state, tag, names });
    }
  }

  for (const [tag, displayName] of expectedTags) {
    if (!seenTags.has(tag)) {
      missingExpectedTags.push({ state, tag, displayName });
    }
  }

  summaries.push({
    state,
    expectedCountyEquivalentRows: expectedRows.length,
    rows: rows.length,
    resolvedCountyTags: Array.from(seenTags.keys()).filter((tag) => tag.startsWith("county:")).length,
    unresolvedRows: unresolvedRowCount,
    intentionalNonGeographicRows: intentionalNonGeographicRowCount,
    duplicateTags: Array.from(seenTags.values()).filter((names) => names.length > 1).length,
    missingExpectedTags: expectedRows.filter((row) => !seenTags.has(row.jurisdictionTag)).length,
  });
}

const output = {
  base: stagingSource && !overlayStates.size ? stagingSource.base : base,
  ...(overlayStates.size ? { stagingOverlay: { directory: stagingSource.base, states: Array.from(overlayStates).sort() } } : {}),
  generatedAt: new Date().toISOString(),
  year,
  family,
  totals: {
    states: states.length,
    expectedCountyEquivalentRows: summaries.reduce((sum, row) => sum + row.expectedCountyEquivalentRows, 0),
    rows: summaries.reduce((sum, row) => sum + row.rows, 0),
    resolvedCountyTags: summaries.reduce((sum, row) => sum + row.resolvedCountyTags, 0),
    unresolvedRows: unresolved.length,
    intentionalNonGeographicRows: intentionalNonGeographic.length,
    duplicateTags: duplicateTags.length,
    missingExpectedTags: missingExpectedTags.length,
  },
  stateProblems: summaries.filter(
    (row) => row.unresolvedRows || row.duplicateTags || row.missingExpectedTags,
  ),
  unresolved,
  intentionalNonGeographic,
  duplicateTags,
  missingExpectedTags,
  caveats: [
    "Alaska has 30 canonical current county-equivalent FIPS tags, but exact election-result allocation remains unavailable because official district-only ballots span multiple county equivalents.",
    "Connecticut expected rows are Census planning regions; older county-era historical rows need a reviewed county/planning-region treatment before they count as current county-equivalent rows.",
    "District of Columbia is represented by the single Census county-equivalent tag county:11001.",
    "Coverage is a tag-join audit only; missing historical rows require separate official baseline collection.",
  ],
};

console.log(JSON.stringify(output, null, 2));

if (failOnGaps && (unresolved.length || duplicateTags.length || missingExpectedTags.length)) {
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCoverageGaps } from "../../tools/civicresultmaps-mcp/coverage-gaps.ts";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";

test("reports DC per-family current and historical evidence without display claims", async () => fixture(async (root) => {
  const report = await buildCoverageGaps(createRuntimeContext({ repoRoot: root }), { states: ["dc"], years: [2016, 2024] });
  const historic = report.records.find((row) => row.year === 2016);
  const current = report.records.find((row) => row.year === 2024);
  assert.equal(historic.families.historical.status, "staged");
  assert.equal(historic.families.results.status, "not_applicable");
  assert.equal(current.families.results.status, "staged");
  assert.equal(current.families.comparison.status, "configured_not_staged");
  assert.equal(current.families.turnout.status, "configured_not_staged");
  assert.equal(current.displayStatus, "display_unverified");
  assert.ok(current.caveats.some((item) => item.includes("single Census county-equivalent")));
}));

test("rejects seed and wrong-year API results, accepts only exact database row evidence", async () => fixture(async (root) => {
  const context = createRuntimeContext({ repoRoot: root });
  const seed = await buildCoverageGaps(context, { states: ["DC"], target: "local" }, { readPublicApi: async () => ({ rows: [{ state: "DC", electionYear: 2024 }], complete: true, source: "seed", capturedAt: "now" }) });
  assert.equal(seed.records[0].families.results.api.reason, "non_database_source");
  const wrongYear = await buildCoverageGaps(context, { states: ["DC"], years: [2016], target: "production" }, { readPublicApi: async () => ({ rows: [{ state: "DC", electionYear: 2020 }], complete: true, source: "database", capturedAt: "now" }) });
  assert.equal(wrongYear.records[0].families.historical.api.reason, "complete_read_without_matching_state_year_rows");
  const observed = await buildCoverageGaps(context, { states: ["DC"], target: "production" }, { readPublicApi: async () => ({ rows: [{ state: "DC", electionYear: 2024 }], complete: true, source: "database", capturedAt: "now" }) });
  assert.equal(observed.records[0].families.results.status, "api_rows_observed");
  assert.equal(observed.records[0].displayStatus, "display_unverified");
}));

test("handles malformed staging, avoids incidental source text, and validates bounded input", async () => fixture(async (root) => {
  const context = createRuntimeContext({ repoRoot: root });
  await writeFile(path.join(root, ".etl", "staging", "dc-2024-staging.json"), "{ malformed", "utf8");
  const report = await buildCoverageGaps(context, { states: ["DC"] }, { readPublicApi: async () => ({ rows: [], complete: false, source: null, capturedAt: "now" }) });
  assert.equal(report.records[0].families.results.status, "configured_not_staged");
  assert.equal(report.records[0].families.results.staging.artifact, "malformed");
  await assert.rejects(() => buildCoverageGaps(context, { states: ["DC", "DC"] }), /unique/);
  await assert.rejects(() => buildCoverageGaps(context, { states: ["DC"], years: [2015] }), /years must/);
}));

test("uses supported fixed API families conservatively and separates a lead from a retained file", async () => fixture(async (root) => {
  const context = createRuntimeContext({ repoRoot: root });
  const calls = [];
  const report = await buildCoverageGaps(context, { states: ["DC"], target: "production" }, {
    readPublicApi: async (request) => {
      calls.push(request);
      const row = { state: "DC", electionYear: 2024 };
      if (request.family === "review") row.comparisonContest = "Senate";
      return { rows: [row], complete: true, source: "database", capturedAt: "now", endpoint: "/api/fixed", meta: {} };
    },
  });
  const families = report.records[0].families;
  assert.equal(families.results.status, "api_rows_observed");
  assert.equal(families.review.status, "api_rows_observed");
  assert.equal(families.comparison.status, "api_rows_observed");
  assert.equal(families.turnout.status, "api_rows_observed");
  assert.deepEqual([...new Set(calls.map((call) => call.family))].sort(), ["results", "review", "turnout"]);

  await rm(path.join(root, ".etl", "staging", "dc-2024-staging.json"));
  await writeFile(path.join(root, "data", "native-import-source-packages.json"), JSON.stringify({ states: [{ state: "DC", nativeReadiness: "candidate_lead" }], sourceDiscoveryQueue: [{ state: "DC" }] }), "utf8");
  const lead = await buildCoverageGaps(context, { states: ["DC"] });
  assert.equal(lead.records[0].families.results.status, "inventory_lead_unverified");
  assert.equal(lead.records[0].families.results.retention.status, "inventory_lead_unverified");

  await writeFile(path.join(root, "data", "dc-current.csv"), "proof\n", "utf8");
  await writeFile(path.join(root, "etl", "state-configs", "dc.json"), JSON.stringify({ code: "DC", sources: [{ id: "dc-current", localFile: "data/dc-current.csv" }], certifiedResults: { sourceId: "dc-current" }, comparisonContest: { sourceId: "dc-current" }, reviewCharts: { sourceId: "dc-current" }, turnout: { sourceId: "dc-current" }, historicalBaselines: { sourceId: "dc-current", expected: { years: [2016] } } }), "utf8");
  const retained = await buildCoverageGaps(context, { states: ["DC"] });
  assert.equal(retained.records[0].families.results.status, "retained_file_not_staged");
  assert.deepEqual(retained.records[0].families.results.retention.files, ["data/dc-current.csv"]);
}));

async function fixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-coverage-gaps-"));
  try {
    await Promise.all([mkdir(path.join(root, "scripts"), { recursive: true }), mkdir(path.join(root, "etl", "state-configs"), { recursive: true }), mkdir(path.join(root, "data"), { recursive: true }), mkdir(path.join(root, ".etl", "staging"), { recursive: true })]);
    await writeFile(path.join(root, "scripts", "state-metadata.mjs"), 'export const states = [{ code: "DC", name: "District of Columbia", fips: "11" }];\n');
    await writeFile(path.join(root, "etl", "state-configs", "dc.json"), JSON.stringify({ code: "DC", sources: [{ id: "contains-2024-only-in-title", status: "loaded" }], certifiedResults: { sourceId: "dc-current" }, comparisonContest: { sourceId: "dc-current" }, reviewCharts: { sourceId: "dc-current" }, turnout: { sourceId: "dc-current" }, historicalBaselines: { sourceId: "dc-history", expected: { years: [2016] } }, capabilities: { reviewGraphs: false } }), "utf8");
    await writeFile(path.join(root, "data", "source-acquisition-tiers.json"), JSON.stringify({ states: [{ state: "DC", electionYear: 2024, dataFamily: "results", reportingGrain: "county" }] }), "utf8");
    await writeFile(path.join(root, "data", "native-import-source-packages.json"), JSON.stringify({ states: [{ state: "DC", nativeReadiness: "complete" }], sourceDiscoveryQueue: [] }), "utf8");
    await writeFile(path.join(root, ".etl", "staging", "dc-2024-staging.json"), JSON.stringify({ state: { code: "DC" }, election: { year: 2024 }, native: { resultRows: [{}], reviewRows: [], turnoutRows: [], historicalRows: [{ electionYear: 2016 }] } }), "utf8");
    await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

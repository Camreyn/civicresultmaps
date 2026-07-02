import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readTsv(path) {
  const [headerLine, ...lines] = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [headers[index], value])));
}

const matrix = readTsv("data/nv-2024-county-source-request-matrix.tsv");
const config = readJson("etl/state-configs/nv.json");
const inventory = readJson("data/nv-2024-source-coverage-inventory.json");

const expectedRemaining = [
  "Carson City",
  "Churchill County",
  "Douglas County",
  "Elko County",
  "Esmeralda County",
  "Eureka County",
  "Lander County",
  "Lincoln County",
  "Lyon County",
  "Mineral County",
  "Nye County",
  "Pershing County",
  "Storey County",
  "White Pine County",
];

test("Nevada remaining jurisdiction matrix covers the 14 non-CVR jurisdictions", () => {
  assert.equal(matrix.length, 14);
  assert.deepEqual(matrix.map((row) => row.jurisdiction), expectedRemaining);
  for (const row of matrix) {
    assert.equal(row.state, "NV");
    assert.equal(row.election_year, "2024");
    assert.match(row.official_source_url, /^https:\/\//);
    assert.match(row.needed_result_artifacts, /President rows/);
    assert.match(row.needed_result_artifacts, /U\.S\. Senate rows/);
    assert.match(row.needed_turnout_artifacts, /registered-voter denominator/);
    assert.match(row.needed_geometry_artifacts, /crosswalks/);
    assert.match(row.needed_admin_artifacts, /CVR availability/);
    assert.match(row.needed_admin_artifacts, /tabulator\/EMS logs/);
    assert.match(row.request_path, /Request from/);
  }
});

test("Nevada config and source inventory expose the request matrix as provenance", () => {
  const source = config.sources.find((entry) => entry.id === "nv-2024-county-source-request-matrix");
  assert.equal(config.expected.sources, config.sources.length);
  assert.equal(source?.localFile, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(source?.parser, "countySourceRequestMatrixTsv");
  assert.match(source?.confidence ?? "", /14 Nevada jurisdictions outside Clark, Washoe, and Humboldt/);

  assert.equal(inventory.remainingLocalReviewGaps.missingJurisdictionCount, 14);
  assert.equal(inventory.remainingLocalReviewGaps.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.remainingLocalReviewGaps.sourceMatrixRows, 14);
  assert.equal(inventory.administrationContext.cvr.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.turnoutDenominatorStatus.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.geometryStatus.subcountyGeometry.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.historicalBaselineStatus.officialReplacementFeasibility.status, "needs_official_export_or_records_request");
});

test("Nevada public data note reflects Humboldt and the 14 remaining jurisdictions", () => {
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  assert.match(tabs, /Clark County, Washoe County, and Humboldt County official CVR precinct/);
  assert.match(tabs, /the other 14 Nevada jurisdictions remain county-only/);
});

test("Nevada Wave 13 source checks preserve high-ROI county blockers", () => {
  assert.equal(inventory.checkedAt, "2026-07-02");
  assert.match(inventory.status, /wave13_source_checks_refreshed/);

  const checks = new Map(inventory.sourceChecks.map((entry) => [entry.sourceAuthority, entry]));
  for (const authority of [
    "Nye County Clerk",
    "Lyon County Clerk/Treasurer",
    "Churchill County Clerk/Treasurer",
    "Carson City Clerk-Recorder",
  ]) {
    const check = checks.get(authority);
    assert.equal(check?.checkedAt, "2026-07-02");
    assert.match(check?.finding ?? "", /No official|did not surface|no parser-ready/i);
  }

  const refreshedRows = matrix.filter((row) => row.source_check_status.includes("wave13_confirmed"));
  assert.deepEqual(
    refreshedRows.map((row) => row.jurisdiction),
    ["Carson City", "Churchill County", "Douglas County", "Lyon County", "Nye County"],
  );
  for (const row of refreshedRows) {
    assert.match(row.notes, /Wave 13 recheck on July 2, 2026/);
  }
});

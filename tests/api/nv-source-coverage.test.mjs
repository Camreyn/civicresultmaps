import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log("ok - " + name);
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
const packets = readJson("data/nv-2024-non-clark-county-request-packets.json");

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

const wave23Jurisdictions = [
  "Douglas County",
  "Elko County",
  "Lander County",
  "Mineral County",
  "Storey County",
  "White Pine County",
];

const wave24Jurisdictions = ["Eureka County"];

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
    assert.match(row.request_path, /Request/);
  }
});

test("Nevada remaining jurisdiction matrix records contact, custodian, and expected request fields", () => {
  for (const row of matrix) {
    assert.ok(row.official_contact_path?.length > 20, row.jurisdiction + " missing official contact path");
    assert.ok(row.custodian?.length > 5, row.jurisdiction + " missing custodian");
    assert.match(row.expected_result_fields, /precinct_or_local_unit/);
    assert.match(row.expected_result_fields, /contest_name/);
    assert.match(row.expected_turnout_fields, /denominator_timing/);
    assert.match(row.expected_geometry_fields, /geometry_file_or_crosswalk/);
    assert.match(row.expected_admin_fields, /CVR_availability/);
    assert.match(row.expected_admin_fields, /tabulator_or_EMS_logs/);
  }
});

test("Nevada config and source inventory expose request matrix and packets as provenance", () => {
  const source = config.sources.find((entry) => entry.id === "nv-2024-county-source-request-matrix");
  const packetSource = config.sources.find((entry) => entry.id === "nv-2024-non-clark-county-request-packets");
  assert.equal(config.expected.sources, config.sources.length);
  assert.equal(source?.localFile, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(source?.parser, "countySourceRequestMatrixTsv");
  assert.match(source?.confidence ?? "", /contact\/custodian paths/);
  assert.equal(packetSource?.localFile, "data/nv-2024-non-clark-county-request-packets.json");
  assert.equal(packetSource?.parser, "coverageInventoryJson");
  assert.match(packetSource?.confidence ?? "", /Context-only packet JSON/);

  assert.equal(inventory.remainingLocalReviewGaps.missingJurisdictionCount, 14);
  assert.equal(inventory.remainingLocalReviewGaps.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.remainingLocalReviewGaps.sourceMatrixRows, 14);
  assert.equal(inventory.remainingLocalReviewGaps.sourceMatrixColumns, 18);
  assert.equal(inventory.remainingLocalReviewGaps.sourcePacketArtifact, "data/nv-2024-non-clark-county-request-packets.json");
  assert.equal(inventory.remainingLocalReviewGaps.sourcePacketRows, 14);
  assert.equal(inventory.administrationContext.cvr.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.administrationContext.cvr.sourcePacketArtifact, "data/nv-2024-non-clark-county-request-packets.json");
  assert.equal(inventory.turnoutDenominatorStatus.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.turnoutDenominatorStatus.sourcePacketArtifact, "data/nv-2024-non-clark-county-request-packets.json");
  assert.equal(inventory.geometryStatus.subcountyGeometry.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(inventory.geometryStatus.subcountyGeometry.sourcePacketArtifact, "data/nv-2024-non-clark-county-request-packets.json");
  assert.equal(inventory.historicalBaselineStatus.officialReplacementFeasibility.status, "needs_official_export_or_records_request");
});

test("Nevada public data note reflects Humboldt and the 14 remaining jurisdictions", () => {
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  assert.match(tabs, /Clark County, Washoe County, and Humboldt County official CVR precinct/);
  assert.match(tabs, /the other 14 Nevada jurisdictions remain county-only/);
});

test("Nevada Wave 24 source checks preserve and sharpen remaining-county blockers", () => {
  assert.equal(inventory.checkedAt, "2026-07-04");
  assert.match(inventory.status, /wave24_request_packets_added/);

  const checks = new Map(inventory.sourceChecks.map((entry) => [entry.sourceAuthority, entry]));
  for (const authority of [
    "Douglas County Clerk-Treasurer",
    "Elko County Clerk",
    "Lander County Clerk",
    "Mineral County Clerk-Treasurer",
    "Storey County public-records request path",
    "White Pine County public-records request form",
  ]) {
    const check = checks.get(authority);
    assert.equal(check?.checkedAt, "2026-07-03");
    assert.match(check?.status ?? "", /wave23/);
    assert.match(check?.finding ?? "", /no .*parser-ready/i);
  }

  const eureka = checks.get("Eureka County Clerk Recorder");
  assert.equal(eureka?.checkedAt, "2026-07-04");
  assert.match(eureka?.status ?? "", /wave24/);
  assert.match(eureka?.finding ?? "", /downloadable 2026 election documents/);

  const refreshedRows = matrix.filter((row) => row.source_check_status.includes("wave23"));
  assert.deepEqual(refreshedRows.map((row) => row.jurisdiction), wave23Jurisdictions);
  for (const row of refreshedRows) {
    assert.match(row.notes, /Wave 23 recheck on July 3, 2026/);
    assert.ok(row.official_contact_path.includes("http") || row.official_contact_path.includes("Nevada SOS"));
  }

  const wave24Rows = matrix.filter((row) => row.source_check_status.includes("wave24"));
  assert.deepEqual(wave24Rows.map((row) => row.jurisdiction), wave24Jurisdictions);
  assert.match(wave24Rows[0].notes, /Wave 24 recheck on July 4, 2026/);
});

test("Nevada generated county request packets mirror the remaining jurisdiction matrix", () => {
  assert.equal(packets.checkedAt, "2026-07-04");
  assert.equal(packets.sourceMatrixArtifact, "data/nv-2024-county-source-request-matrix.tsv");
  assert.equal(packets.packetCount, 14);
  assert.deepEqual(packets.packets.map((packet) => packet.jurisdiction), expectedRemaining);
  assert.equal(
    packets.packets.find((packet) => packet.jurisdiction === "Eureka County")?.status,
    "official_page_rechecked_wave24_packet_ready_no_loaded_rows",
  );
  for (const packet of packets.packets) {
    assert.match(packet.packetId, /^nv-2024-local-/);
    assert.match(packet.primaryRequest, /Request/);
    assert.match(packet.parserOrNormalizationPath, /localComparisonCsv/);
    assert.ok(packet.requestedArtifacts.result.some((field) => /President rows/.test(field)));
    assert.ok(packet.requestedArtifacts.result.some((field) => /U\.S\. Senate rows/.test(field)));
    assert.ok(packet.expectedFields.administration.includes("CVR_availability"));
  }
});

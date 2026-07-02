import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminInventory = JSON.parse(readFileSync("data/mo-2024-admin-source-inventory.json", "utf8"));
const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
const acquisitionTiers = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
const adminPackages = JSON.parse(readFileSync("data/admin-source-packages.json", "utf8"));
const moConfig = JSON.parse(readFileSync("etl/state-configs/mo.json", "utf8"));
const requestTracker = JSON.parse(readFileSync("data/mo-2024-source-request-tracker.json", "utf8"));

const nativeMo = nativePackages.states.find((entry) => entry.state === "MO");
const tierMo = acquisitionTiers.states.find((entry) => entry.state === "MO");
const adminMo = adminPackages.stateYearStatuses.find((entry) => entry.state === "MO" && entry.electionYear === 2024);

test("Missouri source inventory keeps precinct purchase and geometry blockers explicit", () => {
  assert.equal(adminInventory.requestTrackerArtifact, "data/mo-2024-source-request-tracker.json");
  assert.equal(adminInventory.precinctResults.status, "blocked_purchase_required");
  assert.match(adminInventory.precinctResults.checkedPageEvidence.officialStatement, /1996 to 2024/);
  assert.match(adminInventory.precinctResults.requestNeed, /President and U.S. Senate/);
  assert.match(adminInventory.precinctResults.requestNeed, /source-request-tracker/);

  assert.equal(adminInventory.precinctGeometryCrosswalks.status, "blocked_no_statewide_geometry_identified");
  assert.equal(adminInventory.precinctGeometryCrosswalks.loadedGeometry.localArtifact, "data/mo-counties.geojson");
  assert.match(adminInventory.precinctGeometryCrosswalks.scopeNote, /No official statewide precinct-boundary geometry/);
  assert.match(adminInventory.precinctGeometryCrosswalks.requestNeed, /Kansas City/);
  assert.ok(adminInventory.displayApiCaveats.advisoryUse.includes("county/reporting-jurisdiction grain only"));
});

test("Missouri request tracker records official request paths without loading rows", () => {
  assert.equal(requestTracker.requests.length, 6);
  const requests = new Map(requestTracker.requests.map((entry) => [entry.id, entry]));
  assert.equal(requests.get("mo-2024-precinct-results-file")?.status, "blocked_purchase_required");
  assert.match(requests.get("mo-2024-precinct-results-file")?.sourceEvidence ?? "", /1996 to 2024/);
  assert.match(requests.get("mo-2024-precinct-results-file")?.neededArtifacts.join("\n") ?? "", /U\.S\. Senate/);
  assert.match(requests.get("mo-2024-precinct-results-file")?.requestPath ?? "", /Elections Division/);

  assert.equal(requests.get("mo-2024-precinct-geometry-crosswalk")?.status, "request_required");
  assert.match(requests.get("mo-2024-precinct-geometry-crosswalk")?.sourceEvidence ?? "", /Kansas City within Jackson County/);
  assert.match(requests.get("mo-2024-precinct-geometry-crosswalk")?.neededArtifacts.join("\n") ?? "", /crosswalk/);

  assert.equal(requests.get("mo-2024-kansas-city-display-validation")?.status, "documented_display_caveat");
  assert.match(requests.get("mo-2024-kansas-city-display-validation")?.caveat ?? "", /separate reporting jurisdiction/);

  for (const id of [
    "mo-2024-post-election-verification",
    "mo-2024-cvr-availability",
    "mo-2024-incidents-corrections-recounts-litigation",
  ]) {
    assert.match(requests.get(id)?.localArtifactStatus ?? "", /not_collected/);
    assert.match(requests.get(id)?.caveat ?? "", /no .*loaded/i);
  }
});

test("Missouri registries preserve loaded turnout and historical baselines while caveating admin gaps", () => {
  assert.equal(moConfig.turnout.sourceId, "mo-2024-general-turnout");
  assert.equal(moConfig.historicalBaselines.sourceId, "mo-historical-presidential-baseline");
  assert.equal(moConfig.expected.turnoutRows, 116);
  assert.equal(moConfig.historicalBaselines.expected.rowCount, 348);
  assert.equal(moConfig.expected.sources, moConfig.sources.length);
  const requestSource = moConfig.sources.find((entry) => entry.id === "mo-2024-source-request-tracker");
  assert.equal(requestSource?.localFile, "data/mo-2024-source-request-tracker.json");
  assert.equal(requestSource?.parser, "sourceRequestTrackerJson");
  assert.match(requestSource?.confidence ?? "", /does not load vote, turnout, audit, CVR, or incident rows/);

  assert.ok(nativeMo, "MO native package entry is present");
  assert.match(nativeMo.nativeReadiness, /precinct_file_purchase_blocker/);
  assert.match(nativeMo.caveats.join("\n"), /source-request-tracker/);

  assert.ok(tierMo, "MO acquisition tier entry is present");
  assert.match(tierMo.missingFields.join("\n"), /precinct boundary geometry/);
  assert.match(tierMo.nextAction, /mo-2024-source-request-tracker/);

  assert.ok(adminMo, "MO admin source package entry is present");
  assert.equal(adminMo.audit.status, "candidate");
  assert.equal(adminMo.cvr.status, "candidate");
  assert.equal(adminMo.incidents.status, "candidate");
});

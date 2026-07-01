import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminInventory = JSON.parse(readFileSync("data/mo-2024-admin-source-inventory.json", "utf8"));
const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
const acquisitionTiers = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
const adminPackages = JSON.parse(readFileSync("data/admin-source-packages.json", "utf8"));
const moConfig = JSON.parse(readFileSync("etl/state-configs/mo.json", "utf8"));

const nativeMo = nativePackages.states.find((entry) => entry.state === "MO");
const tierMo = acquisitionTiers.states.find((entry) => entry.state === "MO");
const adminMo = adminPackages.stateYearStatuses.find((entry) => entry.state === "MO" && entry.electionYear === 2024);

test("Missouri source inventory keeps precinct purchase and geometry blockers explicit", () => {
  assert.equal(adminInventory.precinctResults.status, "blocked_purchase_required");
  assert.match(adminInventory.precinctResults.checkedPageEvidence.officialStatement, /1996 to 2024/);
  assert.match(adminInventory.precinctResults.requestNeed, /President and U.S. Senate/);

  assert.equal(adminInventory.precinctGeometryCrosswalks.status, "blocked_no_statewide_geometry_identified");
  assert.equal(adminInventory.precinctGeometryCrosswalks.loadedGeometry.localArtifact, "data/mo-counties.geojson");
  assert.match(adminInventory.precinctGeometryCrosswalks.scopeNote, /No official statewide precinct-boundary geometry/);
  assert.ok(adminInventory.displayApiCaveats.advisoryUse.includes("county/reporting-jurisdiction grain only"));
});

test("Missouri registries preserve loaded turnout and historical baselines while caveating admin gaps", () => {
  assert.equal(moConfig.turnout.sourceId, "mo-2024-general-turnout");
  assert.equal(moConfig.historicalBaselines.sourceId, "mo-historical-presidential-baseline");
  assert.equal(moConfig.expected.turnoutRows, 116);
  assert.equal(moConfig.historicalBaselines.expected.rowCount, 348);

  assert.ok(nativeMo, "MO native package entry is present");
  assert.match(nativeMo.nativeReadiness, /precinct_file_purchase_blocker/);
  assert.match(nativeMo.caveats.join("\n"), /Administration-source inventory/);

  assert.ok(tierMo, "MO acquisition tier entry is present");
  assert.match(tierMo.missingFields.join("\n"), /precinct boundary geometry/);
  assert.match(tierMo.nextAction, /Purchase or request Missouri SOS precinct-level/);

  assert.ok(adminMo, "MO admin source package entry is present");
  assert.equal(adminMo.audit.status, "candidate");
  assert.equal(adminMo.cvr.status, "candidate");
  assert.equal(adminMo.incidents.status, "candidate");
});

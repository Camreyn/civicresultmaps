import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminInventory = JSON.parse(readFileSync("data/mo-2024-admin-source-inventory.json", "utf8"));
const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
const acquisitionTiers = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
const adminPackages = JSON.parse(readFileSync("data/admin-source-packages.json", "utf8"));
const moConfig = JSON.parse(readFileSync("etl/state-configs/mo.json", "utf8"));
const requestTracker = JSON.parse(readFileSync("data/mo-2024-source-request-tracker.json", "utf8"));
const fipsReconciliation = JSON.parse(readFileSync("data/mo-county-fips-reconciliation.json", "utf8"));

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function readCsvRows(file) {
  const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift());
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

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
  assert.match(adminInventory.displayApiCaveats.advisoryUse, /canonical Census county grain/);
  assert.equal(adminInventory.countyFipsReconciliation.jacksonCountyJurisdictionTag, "county:29095");
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

  assert.equal(requests.get("mo-2024-kansas-city-display-validation")?.status, "resolved_county_fips_aggregation");
  assert.match(requests.get("mo-2024-kansas-city-display-validation")?.caveat ?? "", /county FIPS 29095/);
  assert.equal(requestTracker.countyFipsReconciliationArtifact, "data/mo-county-fips-reconciliation.json");

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
  assert.equal(moConfig.certifiedResults.sourceId, "mo-2024-general-president-county");
  assert.equal(moConfig.reviewCharts.sourceId, "mo-2024-general-senate-county");
  assert.equal(moConfig.turnout.sourceId, "mo-2024-general-turnout-county");
  assert.equal(moConfig.historicalBaselines.sourceId, "mo-historical-presidential-county-baseline");
  assert.equal(moConfig.expected.resultRows, 115);
  assert.equal(moConfig.expected.reviewRows, 115);
  assert.equal(moConfig.expected.turnoutRows, 115);
  assert.equal(moConfig.historicalBaselines.expected.rowCount, 345);
  assert.equal(moConfig.expected.sources, moConfig.sources.length);
  const requestSource = moConfig.sources.find((entry) => entry.id === "mo-2024-source-request-tracker");
  assert.equal(requestSource?.localFile, "data/mo-2024-source-request-tracker.json");
  assert.equal(requestSource?.parser, "sourceRequestTrackerJson");
  assert.match(requestSource?.confidence ?? "", /does not load vote, turnout, audit, CVR, or incident rows/);

  assert.ok(nativeMo, "MO native package entry is present");
  assert.match(nativeMo.nativeReadiness, /complete_115_county_fips/);
  assert.match(nativeMo.caveats.join("\n"), /purchasable\/request-only/);

  assert.ok(tierMo, "MO acquisition tier entry is present");
  assert.match(tierMo.missingFields.join("\n"), /precinct boundary geometry/);
  assert.match(tierMo.nextAction, /mo-2024-source-request-tracker/);

  assert.ok(adminMo, "MO admin source package entry is present");
  assert.equal(adminMo.audit.status, "candidate");
  assert.equal(adminMo.cvr.status, "candidate");
  assert.equal(adminMo.incidents.status, "candidate");
});

test("Missouri canonical county artifacts preserve statewide totals and pin Jackson County FIPS", () => {
  const presidentRows = readCsvRows("data/mo-2024-general-president-county.csv");
  const senateRows = readCsvRows("data/mo-2024-general-senate-county.csv");
  const turnoutRows = readCsvRows("data/mo-2024-general-turnout-county.csv");
  const historicalRows = readCsvRows("data/mo-historical-presidential-county-baseline.csv");

  for (const [label, rows] of [
    ["President", presidentRows],
    ["U.S. Senate", senateRows],
    ["turnout", turnoutRows],
  ]) {
    assert.equal(rows.length, 115, label + " canonical county row count");
    assert.equal(new Set(rows.map((row) => row.jurisdiction_tag)).size, 115);
    assert.ok(rows.every((row) => /^county:29\d{3}$/.test(row.jurisdiction_tag)));
    assert.ok(!rows.some((row) => row.jurisdiction_name === "Kansas City"));
  }
  assert.equal(historicalRows.length, 345);
  for (const year of [2012, 2016, 2020]) {
    const rows = historicalRows.filter((row) => Number(row.election_year) === year);
    assert.equal(rows.length, 115);
    assert.equal(new Set(rows.map((row) => row.jurisdiction_tag)).size, 115);
    assert.ok(rows.every((row) => /^county:29\d{3}$/.test(row.jurisdiction_tag)));
  }

  const jacksonPresident = presidentRows.find((row) => row.jurisdiction_tag === "county:29095");
  assert.deepEqual(
    {
      harris: Number(jacksonPresident.harris),
      trump: Number(jacksonPresident.trump),
      other: ["oliver", "stein", "sonski", "de_la_cruz", "ayyadurai", "potus"]
        .reduce((sum, column) => sum + Number(jacksonPresident[column]), 0),
    },
    { harris: 187026, trump: 125610, other: 5381 },
  );
  const jacksonSenate = senateRows.find((row) => row.jurisdiction_tag === "county:29095");
  assert.deepEqual(
    {
      dem: Number(jacksonSenate.comparison_dem),
      rep: Number(jacksonSenate.comparison_rep),
      other: Number(jacksonSenate.comparison_other),
    },
    { dem: 189008, rep: 117054, other: 9410 },
  );
  const jacksonTurnout = turnoutRows.find((row) => row.jurisdiction_tag === "county:29095");
  assert.deepEqual(
    {
      ballots: Number(jacksonTurnout.ballots_cast),
      registered: Number(jacksonTurnout.registered_voters),
      turnoutPct: jacksonTurnout.turnout_pct,
    },
    { ballots: 318017, registered: 507182, turnoutPct: "62.70" },
  );

  assert.deepEqual(fipsReconciliation.fipsCoverage.missingTags, []);
  assert.deepEqual(fipsReconciliation.fipsCoverage.duplicateTags, []);
  assert.equal(fipsReconciliation.gates.statewideDeltasAreZero, true);
  assert.equal(fipsReconciliation.gates.rawArtifactsPreservedByteForByte, true);
  for (const family of Object.values(fipsReconciliation.artifacts)) {
    assert.equal(sha256(family.raw.localArtifact), family.raw.sha256);
    assert.equal(sha256(family.canonical.localArtifact), family.canonical.sha256);
  }
});

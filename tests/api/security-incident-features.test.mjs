import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { securityIncidentApiSchemaVersion } from "../../src/lib/api-version.ts";
import { rowsToCsv } from "../../src/lib/csv.ts";
import { activeMapSelection } from "../../src/lib/map-selection.ts";
import {
  affectedLocationText,
  securityIncidentSummaryText,
  summarizeSecurityIncidents,
  threatCountText,
} from "../../src/lib/security-incident-summary.ts";

const registry = JSON.parse(readFileSync("data/election-security-incidents-2024.json", "utf8"));

test("security totals keep affected places separate from threat messages", () => {
  const totals = summarizeSecurityIncidents(registry.incidentRows);

  assert.equal(securityIncidentApiSchemaVersion, "2.0.0");
  assert.equal(totals.rowCount, 2);
  assert.equal(totals.stateCount, 1);
  assert.equal(totals.countyCount, 2);
  assert.equal(totals.knownAffectedLocations, null);
  assert.equal(totals.affectedLocations, null);
  assert.equal(totals.affectedLocationCountComplete, false);
  assert.deepEqual(totals.affectedLocationUnits, [
    { countComplete: true, documentedCount: 5, knownCount: 5, unit: "polling_location" },
    { countComplete: true, documentedCount: 6, knownCount: 6, unit: "voting_precinct" },
  ]);
  assert.equal(totals.documentedThreatCount, null);
  assert.equal(totals.threatCountComplete, false);
  assert.equal(affectedLocationText(totals), "5 polling locations affected; 6 voting precincts affected");
  assert.equal(threatCountText(totals), "Separate threat messages not specified by the official source");
  assert.match(securityIncidentSummaryText(registry.incidentRows), /5 polling locations affected; 6 voting precincts affected/);
  assert.doesNotMatch(securityIncidentSummaryText(registry.incidentRows), /11 polling places/);
  assert.match(securityIncidentSummaryText(registry.incidentRows), /separate threat messages not specified/i);
});

test("partial affected-place totals are labeled as a known minimum", () => {
  const rows = [
    registry.incidentRows[0],
    { ...registry.incidentRows[0], affectedLocations: null, id: "partial-second-row" },
  ];
  const totals = summarizeSecurityIncidents(rows);

  assert.equal(totals.affectedLocationCountComplete, false);
  assert.equal(totals.affectedLocations, null);
  assert.equal(totals.knownAffectedLocations, 5);
  assert.equal(affectedLocationText(totals), "At least 5 known polling locations affected");
});

test("a pinned map selection wins over hover previews", () => {
  assert.equal(activeMapSelection("Fulton County", "DeKalb County", null), "Fulton County");
  assert.equal(activeMapSelection(null, "DeKalb County", null), "DeKalb County");
  assert.equal(activeMapSelection(null, null, "Statewide"), "Statewide");
});

test("CSV exports use commas, CRLF rows, quoting, and empty null cells", () => {
  const csv = rowsToCsv(
    ["State", "County", "Note", "Count"],
    [
      ["GA", "DeKalb, County", 'Police said "clear"', null],
      ["GA", "Fulton County", "Line one\nline two", 5],
    ],
  );

  assert.equal(
    csv,
    '"State","County","Note","Count"\r\n'
      + '"GA","DeKalb, County","Police said ""clear""",""\r\n'
      + '"GA","Fulton County","Line one\nline two","5"\r\n',
  );
  assert.ok(!csv.includes(" - "));
});

test("national explorer is static, source-linked, and browser-only after load", () => {
  const page = readFileSync("src/app/security/page.tsx", "utf8");
  const explorer = readFileSync("src/app/security/security-explorer.tsx", "utf8");
  const sidebar = readFileSync("src/app/state-switcher.tsx", "utf8");
  const stateExplorer = readFileSync("src/app/results-explorer.tsx", "utf8");

  assert.match(page, /dynamic = "force-static"/);
  assert.match(page, /getNationalSecurityIncidentReport\(2024\)/);
  assert.match(explorer, /\/data\/national-counties\.geojson/);
  assert.match(explorer, /expectedCountyFeatureCount = 3144/);
  assert.match(explorer, /cache: "force-cache"/);
  assert.match(explorer, /Sources JSON/);
  assert.match(explorer, /Print \/ save PDF/);
  assert.match(explorer, /National context.+not county-mappable/);
  assert.match(explorer, /source\.sourceUrl/);
  assert.doesNotMatch(explorer, /\/api\/security-incidents/);
  assert.match(explorer, /No matching rows/);
  assert.match(explorer, /Affected locations \/ precincts/);
  assert.match(explorer, /reportRowsTruncated/);
  assert.match(explorer, /Nationwide registry coverage/);
  assert.match(sidebar, /has-security-incidents/);
  assert.match(sidebar, /Loaded bomb-threat records/);
  assert.match(sidebar, /securityOnlyStates/);
  assert.match(sidebar, /Official county security records/);
  assert.match(sidebar, /state-security-summary/);
  assert.match(stateExplorer, /if \(!pinnedMapName\) setSelectedMapName/);
  assert.match(stateExplorer, /drawer-clear-selection/);
});

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
  threatCountBasisText,
  threatCountText,
} from "../../src/lib/security-incident-summary.ts";

const registry = JSON.parse(readFileSync("data/election-security-incidents-2024.json", "utf8"));

test("security totals keep affected places separate from threat messages", () => {
  const totals = summarizeSecurityIncidents(registry.incidentRows);

  assert.equal(securityIncidentApiSchemaVersion, "3.0.0");
  assert.equal(totals.rowCount, 20);
  assert.equal(totals.stateCount, 5);
  assert.equal(totals.countyCount, 20);
  assert.equal(totals.knownAffectedLocations, null);
  assert.equal(totals.affectedLocations, null);
  assert.equal(totals.affectedLocationCountComplete, false);
  assert.deepEqual(totals.affectedLocationUnits, [
    { countComplete: true, documentedCount: 1, knownCount: 1, unit: "election_office" },
    { countComplete: false, documentedCount: null, knownCount: 7, unit: "polling_location" },
    { countComplete: true, documentedCount: 6, knownCount: 6, unit: "voting_precinct" },
  ]);
  assert.equal(totals.documentedThreatCount, null);
  assert.equal(totals.threatCountComplete, false);
  assert.equal(totals.knownThreatCount, 67);
  assert.equal(totals.unknownThreatCountRows, 1);
  assert.equal(totals.officialRowCount, 4);
  assert.equal(totals.supplementalRowCount, 16);
  assert.equal(affectedLocationText(totals), "1 election office affected; At least 7 known polling locations affected; 6 voting precincts affected");
  assert.equal(threatCountText(totals), "At least 67 reported threats; exact count not published for 1 mapped county row");
  assert.match(securityIncidentSummaryText(registry.incidentRows), /4 official and 16 supplemental records/);
  assert.doesNotMatch(securityIncidentSummaryText(registry.incidentRows), /11 polling places/);
  assert.match(securityIncidentSummaryText(registry.incidentRows), /exact count not published/i);
  assert.equal(
    threatCountBasisText("supplemental_national_compilation"),
    "Threat count source: supplemental nationwide compilation",
  );
});

test("partial affected-place totals are labeled as a known minimum", () => {
  const officialAffectedRow = registry.incidentRows.find((row) => row.id === "ga-2024-general-fulton-bomb-threat-disruptions");
  assert.ok(officialAffectedRow);
  const rows = [
    officialAffectedRow,
    { ...officialAffectedRow, affectedLocations: null, id: "partial-second-row" },
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
  assert.match(explorer, /National source context/);
  assert.match(explorer, /source\.sourceUrl/);
  assert.doesNotMatch(explorer, /\/api\/security-incidents/);
  assert.match(explorer, /No matching rows/);
  assert.match(explorer, /Published national compilation/);
  assert.match(explorer, /Source strength/);
  assert.match(explorer, /Supplemental compiled record/);
  assert.match(explorer, /Threat count source URL/);
  assert.match(explorer, /Open threat-count source/);
  assert.match(explorer, /threatCountBasisText/);
  assert.match(explorer, /reportRowsTruncated/);
  assert.match(explorer, /Mapped states/);
  assert.match(sidebar, /has-security-incidents/);
  assert.match(sidebar, /States with mapped bomb threats/);
  assert.match(sidebar, /securityOnlyStates/);
  assert.match(sidebar, /Source-linked county security records/);
  assert.match(sidebar, /state-security-summary/);
  assert.match(stateExplorer, /if \(!pinnedMapName\) setSelectedMapName/);
  assert.match(stateExplorer, /drawer-clear-selection/);
  assert.match(stateExplorer, /Loaded supplemental compiled record/);
  assert.match(stateExplorer, /Open threat-count source/);
  assert.match(stateExplorer, /threatCountBasisText/);
});

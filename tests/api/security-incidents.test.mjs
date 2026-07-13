import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync("data/election-security-incidents-2024.json", "utf8"));
const inventory = JSON.parse(readFileSync("data/election-security-incident-source-inventory-2024.json", "utf8"));

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("security incident registry contains official county-tagged rows", () => {
  assert.equal(registry.electionYear, 2024);
  assert.equal(registry.reportingGrain, "county");
  assert.equal(registry.incidentRows.length, 2);
  assert.equal(registry.expected.completeThreatCountRows, 0);
  assert.equal(registry.expected.knownThreatCountTotal, null);
  assert.deepEqual(new Set(registry.incidentRows.map((row) => row.state)), new Set(["GA"]));
  assert.ok(registry.incidentRows.every((row) => row.threatCount === null));

  for (const row of registry.incidentRows) {
    assert.match(row.jurisdictionTag, /^county:\d{5}$/);
    assert.equal(row.jurisdictionTag, `county:${row.jurisdictionCode}`);
    assert.equal(row.sourceStatus, "official_county_record");
    assert.match(new URL(row.sourceUrl).hostname, /\.gov$/);
    assert.ok(existsSync(row.localArtifact), `${row.localArtifact} should exist`);
    assert.match(row.caveat, /not evidence of fraud or misconduct/i);
  }
});

test("nationwide incident inventory is explicit about partial coverage", () => {
  assert.equal(inventory.stateCoverage.length, 51);
  assert.equal(new Set(inventory.stateCoverage.map((entry) => entry.state)).size, 51);
  assert.equal(inventory.stateCoverage.find((entry) => entry.state === "GA")?.status, "partial");
  assert.equal(inventory.stateCoverage.find((entry) => entry.state === "WI")?.status, "needs_data");
  assert.match(inventory.caveat, /does not establish that no incident occurred/i);
});

test("security incident API and server loader are wired", () => {
  const route = readFileSync("src/app/api/security-incidents/route.ts", "utf8");
  const loader = readFileSync("src/lib/security-incidents.ts", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  const page = readFileSync("src/app/page.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");

  assert.match(route, /listSecurityIncidents/);
  assert.match(route, /publicDataCacheHeaders/);
  assert.match(route, /not evidence of fraud or misconduct/);
  assert.match(route, /Number\.isInteger\(requestedLimit\)/);
  assert.match(route, /rows\.length > 0 && rows\.every/);
  assert.match(route, /documentedThreatCount = threatCountComplete/);
  assert.match(loader, /election-security-incidents-2024\.json/);
  assert.match(loader, /row\.state === requestedState/);
  assert.match(api, /"security-incidents"/);
  assert.match(page, /securityIncidents={securityIncidents}/);
  assert.match(tabs, /\/api\/security-incidents\?state=/);
});

test("security map layer remains separate from advisory indicators", () => {
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");

  assert.match(explorer, /if \(securityIncidents\.length\)/);
  assert.match(explorer, /options\.push\(\{ label: "Security", mode: "security" \}\)/);
  assert.match(explorer, /mapMode === "security" && securityIncidents\.length === 0/);
  assert.match(explorer, /featureJurisdictionTag/);
  assert.match(explorer, /securityIncidentsByTag/);
  assert.match(explorer, /securityIncidentsByCounty/);
  assert.match(explorer, /mapMode !== "equipment" && mapMode !== "security"/);
  assert.match(explorer, /Official security incident records/);
  assert.match(explorer, /Open incident source/);
  assert.match(explorer, /not evidence of fraud or misconduct/);
});

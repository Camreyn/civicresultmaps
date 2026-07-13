import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync("data/election-security-incidents-2024.json", "utf8"));
const inventory = JSON.parse(readFileSync("data/election-security-incident-source-inventory-2024.json", "utf8"));

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("security incident registry maps the full published county compilation plus Pima", () => {
  const compilation = JSON.parse(readFileSync("data/nbc-2024-election-day-bomb-threat-county-compilation.json", "utf8"));
  const compiledCounties = new Set([
    ...compilation.table.rows,
    ...compilation.additionalCountyMentions,
  ].map((row) => `${row.state}|${row.county}`));
  const mappedCounties = new Set(registry.incidentRows.map((row) => `${row.state}|${row.county}`));

  assert.equal(registry.schemaVersion, 3);
  assert.equal(registry.electionYear, 2024);
  assert.equal(registry.reportingGrain, "county");
  assert.equal(registry.incidentRows.length, 20);
  assert.equal(registry.expected.completeThreatCountRows, 19);
  assert.equal(registry.expected.unknownThreatCountRows, 1);
  assert.equal(registry.expected.knownThreatCountMinimum, 67);
  assert.equal(registry.expected.publishedCompilationLocationCount, 67);
  assert.equal(registry.expected.publishedCompilationCountyCount, 19);
  assert.deepEqual(new Set(registry.incidentRows.map((row) => row.state)), new Set(["AZ", "GA", "MI", "PA", "WI"]));
  assert.equal(compiledCounties.size, 19);
  assert.ok([...compiledCounties].every((county) => mappedCounties.has(county)));
  assert.ok(mappedCounties.has("AZ|Pima County"));
  assert.deepEqual(registry.expected.affectedLocationUnitTotals, { election_office: 1, polling_location: 7, voting_precinct: 6 });
  assert.equal(registry.incidentRows.filter((row) => row.sourceTier === "official").length, 4);
  assert.equal(registry.incidentRows.filter((row) => row.sourceTier === "supplemental").length, 16);

  const officialGeorgiaRows = registry.incidentRows.filter((row) => row.state === "GA" && row.sourceTier === "official");
  assert.equal(officialGeorgiaRows.length, 2);
  for (const row of officialGeorgiaRows) {
    assert.equal(row.threatCountBasis, "supplemental_national_compilation");
    assert.equal(row.normalizationPath, "scripts/build-security-incident-registry.mjs");
    assert.match(row.caveat, /separate nationwide compilation/i);
    assert.equal((row.caveat.match(/separate nationwide compilation/gi) ?? []).length, 1);
    assert.doesNotMatch(row.caveat, /threatCount remains null/);
  }

  for (const row of registry.incidentRows) {
    assert.match(row.jurisdictionTag, /^county:\d{5}$/);
    assert.equal(row.jurisdictionTag, `county:${row.jurisdictionCode}`);
    assert.equal(row.sourceStatus, row.sourceTier === "official" ? "official_county_record" : "supplemental_national_compilation");
    assert.match(row.affectedLocationUnit, /^(election_office|polling_location|voting_precinct)$/);
    assert.ok(Array.isArray(row.namedLocations));
    assert.ok(existsSync(row.localArtifact), `${row.localArtifact} should exist`);
    if (row.threatCount !== null) {
      assert.ok(row.threatCountSourceUrl);
      assert.ok(existsSync(row.threatCountLocalArtifact), `${row.threatCountLocalArtifact} should exist`);
    }
    assert.match(row.caveat, /not evidence of fraud or misconduct/i);
  }
});

test("nationwide incident inventory identifies the five mapped states and source limits", () => {
  assert.equal(inventory.stateCoverage.length, 51);
  assert.equal(new Set(inventory.stateCoverage.map((entry) => entry.state)).size, 51);
  assert.equal(inventory.stateCoverage.find((entry) => entry.state === "GA")?.status, "partial");
  assert.equal(inventory.stateCoverage.find((entry) => entry.state === "WI")?.status, "partial");
  assert.equal(inventory.expected.statesWithNormalizedRows, 5);
  assert.equal(inventory.expected.normalizedEventRows, 20);
  assert.equal(inventory.expected.mappedCompilationCountyCount, 19);
  assert.equal(inventory.expected.additionalOfficialCountyRows, 1);
  assert.match(inventory.caveat, /FBI did not publish a complete national county or site roster/i);
});

test("FBI national context has a verified local archive", () => {
  const context = inventory.nationalContext.find((entry) => entry.sourceAuthority === "Federal Bureau of Investigation");
  assert.ok(context);
  assert.equal(context.acquisitionStatus, "manual_browser_archive_complete");
  assert.ok(existsSync(context.localArtifact), `${context.localArtifact} should exist`);
  assert.match(context.sha256, /^[a-f0-9]{64}$/);

  const artifact = readFileSync(context.localArtifact);
  assert.equal(createHash("sha256").update(artifact).digest("hex"), context.sha256);
  const html = artifact.toString("utf8");
  assert.match(html, /bomb threats to polling locations in several states/i);
  assert.match(html, /None of the threats have been determined to be credible/i);
  assert.match(html, /https:\/\/www\.fbi\.gov\/news\/press-releases\/fbi-statement-on-bomb-threats-to-polling-locations/);
});

test("published nationwide compilation and Senate cross-check have verified local artifacts", () => {
  const contexts = inventory.nationalContext.filter((entry) => entry.reportedLocationCount === 67);
  assert.equal(contexts.length, 2);
  assert.deepEqual(new Set(contexts.map((entry) => entry.sourceTier)), new Set(["official", "supplemental"]));
  for (const context of contexts) {
    assert.equal(context.reportedCountyCount, 19);
    assert.ok(existsSync(context.localArtifact), `${context.localArtifact} should exist`);
    const artifact = readFileSync(context.localArtifact);
    assert.equal(createHash("sha256").update(artifact).digest("hex"), context.sha256);
  }
});

test("security incident API and server loader are wired", () => {
  const route = readFileSync("src/app/api/security-incidents/route.ts", "utf8");
  const loader = readFileSync("src/lib/security-incidents.ts", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  const page = readFileSync("src/app/page.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const vercelIgnore = readFileSync(".vercelignore", "utf8");
  const builder = readFileSync("scripts/build-security-incident-registry.mjs", "utf8");

  assert.match(route, /listSecurityIncidents/);
  assert.match(route, /securityIncidentCacheHeaders/);
  assert.match(route, /s-maxage=86400/);
  assert.match(route, /summarizeSecurityIncidents/);
  assert.match(route, /schemaVersion: securityIncidentApiSchemaVersion/);
  assert.match(route, /not evidence of fraud or misconduct/);
  assert.match(route, /Number\.isInteger\(requestedLimit\)/);
  assert.match(loader, /election-security-incidents-2024\.json/);
  assert.match(loader, /election-security-incident-source-inventory-2024\.json/);
  assert.match(loader, /!requestedState \|\| row\.state === requestedState/);
  assert.match(loader, /listSecurityIncidentStateSummaries/);
  assert.match(loader, /getNationalSecurityIncidentReport/);
  assert.match(builder, /nbc-2024-election-day-bomb-threat-county-compilation\.json/);
  assert.match(builder, /Pima County/);
  assert.match(builder, /normalizationPath: "scripts\/build-security-incident-registry\.mjs"/);
  assert.match(builder, /caveat: countyCaveat/);
  assert.match(api, /security-incidents-\$\{securityIncidentApiSchemaVersion\}/);
  assert.match(page, /securityIncidents={securityIncidents}/);
  assert.match(page, /href="\/security"/);
  assert.match(page, /securityIncidentStates={securityIncidentStateSummaries}/);
  assert.match(tabs, /\/api\/security-incidents\?state=/);
  assert.match(tabs, /import\("jszip"\)/);
  assert.match(vercelIgnore, /!data\/election-security-incident-source-inventory-2024\.json/);
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
  assert.match(explorer, /Source-linked security incident records/);
  assert.match(explorer, /Open incident source/);
  assert.match(explorer, /evidence of fraud or misconduct/);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync("data/election-security-incidents-2024.json", "utf8"));
const inventory = JSON.parse(readFileSync("data/election-security-incident-source-inventory-2024.json", "utf8"));
const tracker = JSON.parse(readFileSync("data/brennan-2024-election-bomb-threat-tracker.json", "utf8"));

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("later tracker is normalized without inventing county geography", () => {
  const trackerCountyRows = tracker.rows.filter((row) => row.reportingGrain === "county");
  const trackerStatewideRows = tracker.rows.filter((row) => row.reportingGrain === "statewide_unspecified");
  const trackerThreatCount = tracker.rows.reduce((sum, row) => sum + row.threatCount, 0);

  assert.equal(tracker.schemaVersion, 1);
  assert.deepEqual(tracker.reportingWindow, { start: "2024-11-05", end: "2024-11-09" });
  assert.equal(tracker.rows.length, 110);
  assert.equal(trackerCountyRows.length, 108);
  assert.equal(new Set(trackerCountyRows.map((row) => row.jurisdictionTag)).size, 108);
  assert.equal(trackerStatewideRows.length, 2);
  assert.equal(trackerThreatCount, 227);
  assert.deepEqual(new Set(tracker.rows.map((row) => row.state)), new Set(["AZ", "CA", "GA", "MD", "MI", "MN", "OR", "PA", "WI"]));
  assert.deepEqual(
    trackerStatewideRows.map((row) => [row.state, row.threatCount]),
    [["GA", 19], ["MN", 47]],
  );
  for (const row of trackerCountyRows) {
    assert.match(row.jurisdictionTag, /^county:\d{5}$/);
    assert.equal(row.jurisdictionTag, `county:${row.jurisdictionCode}`);
  }
  for (const row of trackerStatewideRows) {
    assert.equal(row.county, null);
    assert.equal(row.jurisdictionCode, null);
    assert.equal(row.jurisdictionTag, `state:${row.state}:unspecified`);
  }
  for (const row of tracker.rows) {
    assert.ok(row.sourceUrls.length > 0);
    assert.ok(row.sourceUrls.every((url) => url.startsWith("https://")));
  }
  assert.match(tracker.caveat, /not an official FBI roster/i);
  assert.match(tracker.caveat, /may not be exhaustive/i);
});

test("registry covers all tracker rows plus the earlier Milwaukee mention", () => {
  const countyRows = registry.incidentRows.filter((row) => row.reportingGrain === "county");
  const statewideRows = registry.incidentRows.filter((row) => row.reportingGrain === "statewide_unspecified");
  const knownThreatCount = registry.incidentRows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
  const registryTrackerKeys = new Set(
    registry.incidentRows
      .filter((row) => row.threatCountBasis === "research_tracker_compilation")
      .map((row) => [row.state, row.eventDate, row.jurisdictionTag, row.threatCount].join("|")),
  );

  assert.equal(registry.schemaVersion, 5);
  assert.equal(registry.electionYear, 2024);
  assert.equal(registry.reportingGrain, "mixed_county_and_statewide_unspecified");
  assert.deepEqual(registry.reportingWindow, { start: "2024-11-05", end: "2024-11-09" });
  assert.equal(registry.incidentRows.length, 111);
  assert.equal(countyRows.length, 109);
  assert.equal(new Set(countyRows.map((row) => row.jurisdictionTag)).size, 109);
  assert.equal(statewideRows.length, 2);
  assert.equal(statewideRows.reduce((sum, row) => sum + row.threatCount, 0), 66);
  assert.equal(knownThreatCount, 227);
  assert.equal(registry.incidentRows.filter((row) => row.threatCount === null).length, 1);
  assert.equal(registry.incidentRows.filter((row) => row.sourceTier === "official").length, 6);
  assert.equal(registry.incidentRows.filter((row) => row.sourceTier === "supplemental").length, 105);
  assert.equal(registry.incidentRows.filter((row) => row.sourceStatus === "research_compilation").length, 104);
  assert.deepEqual(registry.expected.affectedLocationUnitTotals, {
    election_office: 1,
    polling_location: 13,
    voting_precinct: 6,
  });

  for (const trackerRow of tracker.rows) {
    const key = [trackerRow.state, trackerRow.eventDate, trackerRow.jurisdictionTag, trackerRow.threatCount].join("|");
    assert.ok(registryTrackerKeys.has(key), `${key} should have a normalized registry row`);
  }

  const earlierRow = registry.incidentRows.find((row) => row.sourceStatus === "supplemental_earlier_compilation");
  assert.ok(earlierRow);
  assert.equal(earlierRow.state, "WI");
  assert.equal(earlierRow.county, "Milwaukee County");
  assert.equal(earlierRow.threatCount, null);
  assert.equal(earlierRow.threatCountBasis, "not_separately_published");

  const officialRows = registry.incidentRows.filter((row) => row.sourceTier === "official");
  const officialCountyRows = officialRows.filter((row) => row.reportingGrain === "county");
  const officialStateRows = officialRows.filter((row) => row.reportingGrain === "statewide_unspecified");
  assert.deepEqual(
    new Set(officialCountyRows.map((row) => row.county)),
    new Set(["Pima County", "DeKalb County", "Fulton County", "Chester County", "Philadelphia County"]),
  );
  assert.equal(officialStateRows.length, 1);
  assert.equal(officialStateRows[0].state, "MN");
  assert.equal(officialStateRows[0].threatCount, 47);
  assert.equal(officialStateRows[0].jurisdictionCode, null);
  assert.ok(officialCountyRows.every((row) => row.sourceStatus === "official_county_record"));
  assert.ok(officialStateRows.every((row) => row.sourceStatus === "official_state_record"));
  assert.ok(officialRows.every((row) => row.threatCountBasis === "research_tracker_compilation"));

  for (const row of registry.incidentRows) {
    if (row.reportingGrain === "county") {
      assert.match(row.jurisdictionTag, /^county:\d{5}$/);
      assert.equal(row.jurisdictionTag, `county:${row.jurisdictionCode}`);
    } else {
      assert.equal(row.jurisdictionCode, null);
      assert.match(row.jurisdictionTag, /^state:[A-Z]{2}:unspecified$/);
    }
    assert.match(row.affectedLocationUnit, /^(election_facility|election_office|polling_location|voting_precinct)$/);
    assert.ok(Array.isArray(row.namedLocations));
    assert.ok(Array.isArray(row.supportingSourceUrls));
    assert.ok(existsSync(row.localArtifact), `${row.localArtifact} should exist`);
    if (row.threatCount !== null) {
      assert.ok(row.threatCountSourceUrl);
      assert.ok(existsSync(row.threatCountLocalArtifact), `${row.threatCountLocalArtifact} should exist`);
    }
    assert.match(row.caveat, /not evidence of fraud or misconduct/i);
  }
  assert.match(registry.caveat, /not an official FBI roster/i);
  assert.match(registry.caveat, /66 threats whose counties were not specified/i);
});

test("nationwide inventory identifies nine states and mixed geography limits", () => {
  const partialStates = inventory.stateCoverage.filter((entry) => entry.status === "partial");
  const georgia = inventory.stateCoverage.find((entry) => entry.state === "GA");
  const minnesota = inventory.stateCoverage.find((entry) => entry.state === "MN");

  assert.equal(inventory.schemaVersion, 4);
  assert.equal(inventory.stateCoverage.length, 51);
  assert.equal(new Set(inventory.stateCoverage.map((entry) => entry.state)).size, 51);
  assert.equal(partialStates.length, 9);
  assert.deepEqual(
    new Set(partialStates.map((entry) => entry.state)),
    new Set(["AZ", "CA", "GA", "MD", "MI", "MN", "OR", "PA", "WI"]),
  );
  assert.equal(inventory.expected.statesWithNormalizedRows, 9);
  assert.equal(inventory.expected.normalizedEventRows, 111);
  assert.equal(inventory.expected.mappedCountyCount, 109);
  assert.equal(inventory.expected.statewideUnspecifiedRowCount, 2);
  assert.equal(inventory.expected.knownThreatCountMinimum, 227);
  assert.equal(georgia.statewideUnspecifiedThreatCount, 19);
  assert.equal(minnesota.mappedCountyCount, 0);
  assert.equal(minnesota.statewideUnspecifiedThreatCount, 47);
  assert.match(inventory.caveat, /not an official FBI roster/i);
  assert.match(inventory.caveat, /may not be exhaustive/i);
});

test("reviewed Minnesota and Philadelphia sources preserve their documented limits", () => {
  assert.equal(inventory.reviewedOfficialSources.length, 2);
  const minnesotaSource = inventory.reviewedOfficialSources.find(
    (source) => source.sourceAuthority === "Office of the Minnesota Secretary of State",
  );
  const philadelphiaSource = inventory.reviewedOfficialSources.find(
    (source) => source.sourceAuthority === "First Judicial District of Pennsylvania",
  );
  assert.ok(minnesotaSource);
  assert.ok(philadelphiaSource);
  assert.match(minnesotaSource.caveat, /does not publish an exact threat count or name the affected counties/i);
  assert.equal(philadelphiaSource.expectedAffectedLocationCount, 6);

  for (const source of inventory.reviewedOfficialSources) {
    assert.ok(existsSync(source.localArtifact), `${source.localArtifact} should exist`);
    const artifact = readFileSync(source.localArtifact);
    assert.equal(createHash("sha256").update(artifact).digest("hex"), source.sha256);
  }

  const minnesotaCoverage = inventory.stateCoverage.find((entry) => entry.state === "MN");
  assert.deepEqual(
    new Set(minnesotaCoverage.sourceAuthorities),
    new Set(["Office of the Minnesota Secretary of State", "Brennan Center for Justice"]),
  );

  const minnesotaRow = registry.incidentRows.find(
    (row) => row.state === "MN" && row.reportingGrain === "statewide_unspecified",
  );
  assert.equal(minnesotaRow.sourceStatus, "official_state_record");
  assert.equal(minnesotaRow.threatCount, 47);
  assert.equal(minnesotaRow.jurisdictionCode, null);
  assert.match(minnesotaRow.caveat, /all 47 remain at statewide-unspecified grain/i);

  const philadelphiaRow = registry.incidentRows.find((row) => row.county === "Philadelphia County");
  assert.equal(philadelphiaRow.sourceStatus, "official_county_record");
  assert.equal(philadelphiaRow.threatCount, 10);
  assert.equal(philadelphiaRow.affectedLocations, 6);
  assert.equal(philadelphiaRow.affectedLocationUnit, "polling_location");
  assert.equal(philadelphiaRow.namedLocations.length, 6);
  assert.equal(
    philadelphiaRow.supportingSourceUrls.filter((url) => url.includes("pacourts.us")).length,
    0,
  );

  const georgiaStatewide = registry.incidentRows.find(
    (row) => row.state === "GA" && row.reportingGrain === "statewide_unspecified",
  );
  assert.match(georgiaStatewide.caveat, /remainder of a reported statewide total/i);
  assert.equal(georgiaStatewide.jurisdictionCode, null);
});

test("FBI national context has a verified archive but claims no roster count", () => {
  const context = inventory.nationalContext.find((entry) => entry.sourceAuthority === "Federal Bureau of Investigation");
  assert.ok(context);
  assert.equal(context.acquisitionStatus, "manual_browser_archive_complete");
  assert.equal(context.reportedThreatCount, undefined);
  assert.equal(context.reportedCountyCount, undefined);
  assert.ok(existsSync(context.localArtifact), `${context.localArtifact} should exist`);
  assert.match(context.sha256, /^[a-f0-9]{64}$/);

  const artifact = readFileSync(context.localArtifact);
  assert.equal(createHash("sha256").update(artifact).digest("hex"), context.sha256);
  const html = artifact.toString("utf8");
  assert.match(html, /bomb threats to polling locations in several states/i);
  assert.match(html, /None of the threats have been determined to be credible/i);
  assert.match(html, /https:\/\/www\.fbi\.gov\/news\/press-releases\/fbi-statement-on-bomb-threats-to-polling-locations/);
});

test("later tracker and earlier 67-location snapshot have verified artifacts", () => {
  const trackerContext = inventory.nationalContext.find((entry) => entry.sourceUrl === tracker.sourceUrl);
  assert.ok(trackerContext);
  assert.equal(trackerContext.reportedThreatCount, 227);
  assert.equal(trackerContext.reportedCountyCount, 108);
  assert.equal(trackerContext.reportedStateCount, 9);
  assert.equal(trackerContext.statewideUnspecifiedThreatCount, 66);
  assert.equal(trackerContext.sha256, tracker.sha256);
  const trackerArtifact = readFileSync(trackerContext.localArtifact);
  assert.equal(createHash("sha256").update(trackerArtifact).digest("hex"), trackerContext.sha256);

  const earlierContexts = inventory.nationalContext.filter((entry) => entry.reportedLocationCount === 67);
  assert.equal(earlierContexts.length, 2);
  assert.deepEqual(new Set(earlierContexts.map((entry) => entry.sourceTier)), new Set(["official", "supplemental"]));
  for (const context of earlierContexts) {
    assert.equal(context.reportedCountyCount, 19);
    assert.equal(context.scopeLabel, "Earlier Election Day snapshot");
    const artifact = readFileSync(context.localArtifact);
    assert.equal(createHash("sha256").update(artifact).digest("hex"), context.sha256);
  }
});

test("security API, extractor, builder, and server loader are wired", () => {
  const route = readFileSync("src/app/api/security-incidents/route.ts", "utf8");
  const loader = readFileSync("src/lib/security-incidents.ts", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  const page = readFileSync("src/app/page.tsx", "utf8");
  const siteHeader = readFileSync("src/app/site-header.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const vercelIgnore = readFileSync(".vercelignore", "utf8");
  const builder = readFileSync("scripts/build-security-incident-registry.mjs", "utf8");
  const extractor = readFileSync("scripts/extract-brennan-security-tracker.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const productionSmoke = readFileSync(".github/workflows/security-production-smoke.yml", "utf8");
  const smokeScript = readFileSync("scripts/verify-security-incidents-deployment.mjs", "utf8");

  assert.match(route, /listSecurityIncidents/);
  assert.match(route, /securityIncidentCacheHeaders/);
  assert.match(route, /s-maxage=86400/);
  assert.match(route, /summarizeSecurityIncidents/);
  assert.match(route, /schemaVersion: securityIncidentApiSchemaVersion/);
  assert.match(route, /not evidence of fraud or misconduct/);
  assert.match(route, /Number\.isInteger\(requestedLimit\)/);
  assert.match(route, /stateQuery\.optional\(\)/);
  assert.match(route, /state: state\.data \?\? null/);
  assert.doesNotMatch(route, /searchParams\.get\("state"\) \?\? "GA"/);
  assert.match(loader, /election-security-incidents-2024\.json/);
  assert.match(loader, /election-security-incident-source-inventory-2024\.json/);
  assert.match(loader, /reportingWindow/);
  assert.match(loader, /listSecurityIncidentStateSummaries/);
  assert.match(loader, /getNationalSecurityIncidentReport/);
  assert.match(builder, /brennan-2024-election-bomb-threat-tracker\.json/);
  assert.match(builder, /supplemental_earlier_compilation/);
  assert.match(builder, /Pima County/);
  assert.match(builder, /Philadelphia County/);
  assert.match(builder, /official_state_record/);
  assert.match(extractor, /pdf-parse/);
  assert.match(extractor, /national-counties\.geojson/);
  assert.match(extractor, /reportedThreatCount !== 227/);
  assert.match(api, /security-incidents-\$\{securityIncidentApiSchemaVersion\}/);
  assert.match(page, /securityIncidents={securityIncidents}/);
  assert.match(page, /SiteHeader/);
  assert.match(siteHeader, /href: "\/security"/);
  assert.match(page, /securityIncidentStates={securityIncidentStateSummaries}/);
  assert.match(tabs, /\/api\/security-incidents\?state=/);
  assert.match(vercelIgnore, /!data\/election-security-incident-source-inventory-2024\.json/);
  assert.match(packageJson.scripts["security-incidents:build"], /security-incidents:extract/);
  assert.match(packageJson.scripts["smoke:security-incidents"], /verify-security-incidents-deployment/);
  assert.match(ci, /Smoke-test security incident preview/);
  assert.match(ci, /test:security-incidents/);
  assert.match(productionSmoke, /deployment_status/);
  assert.match(productionSmoke, /civicresultmaps\.org/);
  assert.match(smokeScript, /\/api\/security-incidents\?year=2024&limit=5000/);
  assert.match(smokeScript, /rowCount: 111/);
  assert.match(smokeScript, /state=GA/);
  assert.match(smokeScript, /state=MN/);
});

test("security map layer keeps statewide rows off county joins", () => {
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");

  assert.match(explorer, /if \(securityIncidents\.length\)/);
  assert.match(explorer, /options\.push\(\{ label: "Security", mode: "security" \}\)/);
  assert.match(explorer, /mapMode === "security" && securityIncidents\.length === 0/);
  assert.match(explorer, /featureJurisdictionTag/);
  assert.match(explorer, /securityIncidentsByTag/);
  assert.match(explorer, /securityIncidentsByCounty/);
  assert.match(explorer, /row\.reportingGrain !== "county"/);
  assert.match(explorer, /statewideSecurityIncidents/);
  assert.match(explorer, /Statewide count - county not specified/);
  assert.match(explorer, /Open statewide count source/);
  assert.match(explorer, /Open cited public report/);
  assert.match(explorer, /mapMode !== "equipment" && mapMode !== "security"/);
  assert.match(explorer, /Source-linked security incident records/);
  assert.match(explorer, /evidence of fraud or misconduct/);
});

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
import {
  buildSecurityElectionOverlay,
  securityElectionResultText,
  summarizeSecurityElectionWinner,
} from "../../src/lib/security-result-overlay.ts";

const registry = JSON.parse(readFileSync("data/election-security-incidents-2024.json", "utf8"));

test("security totals preserve county, statewide, affected-place, and threat-message units", () => {
  const totals = summarizeSecurityIncidents(registry.incidentRows);

  assert.equal(securityIncidentApiSchemaVersion, "4.1.0");
  assert.equal(totals.rowCount, 111);
  assert.equal(totals.stateCount, 9);
  assert.equal(totals.countyCount, 109);
  assert.equal(totals.countyRowCount, 109);
  assert.equal(totals.statewideUnspecifiedRowCount, 2);
  assert.equal(totals.statewideUnspecifiedThreatCount, 66);
  assert.equal(totals.knownAffectedLocations, null);
  assert.equal(totals.affectedLocations, null);
  assert.equal(totals.affectedLocationCountComplete, false);
  assert.deepEqual(totals.affectedLocationUnits, [
    { countComplete: false, documentedCount: null, knownCount: 0, unit: "election_facility" },
    { countComplete: true, documentedCount: 1, knownCount: 1, unit: "election_office" },
    { countComplete: false, documentedCount: null, knownCount: 13, unit: "polling_location" },
    { countComplete: true, documentedCount: 6, knownCount: 6, unit: "voting_precinct" },
  ]);
  assert.equal(totals.documentedThreatCount, null);
  assert.equal(totals.threatCountComplete, false);
  assert.equal(totals.knownThreatCount, 227);
  assert.equal(totals.unknownThreatCountRows, 1);
  assert.equal(totals.officialRowCount, 6);
  assert.equal(totals.supplementalRowCount, 105);
  assert.equal(
    affectedLocationText(totals),
    "Number of affected election facilities not specified; 1 election office affected; At least 13 known polling locations affected; 6 voting precincts affected",
  );
  assert.equal(
    threatCountText(totals),
    "At least 227 reported threats documented; 1 additional record has no published count",
  );
  assert.match(securityIncidentSummaryText(registry.incidentRows), /6 official and 105 supplemental records/);
  assert.match(securityIncidentSummaryText(registry.incidentRows), /1 additional record has no published count/i);
  assert.equal(
    threatCountBasisText("research_tracker_compilation"),
    "Threat count source: later public-source tracker",
  );
  assert.equal(
    threatCountBasisText("not_separately_published"),
    "Threat count source: exact county count not separately published",
  );
});

test("statewide-only threats remain totals without county tags", () => {
  const statewideRows = registry.incidentRows.filter((row) => row.reportingGrain === "statewide_unspecified");
  const totals = summarizeSecurityIncidents(statewideRows);

  assert.equal(totals.rowCount, 2);
  assert.equal(totals.countyCount, 0);
  assert.equal(totals.countyRowCount, 0);
  assert.equal(totals.stateCount, 2);
  assert.equal(totals.statewideUnspecifiedThreatCount, 66);
  assert.equal(totals.documentedThreatCount, 66);
  assert.equal(threatCountText(totals), "66 reported threats documented in loaded rows");
  assert.ok(statewideRows.every((row) => row.jurisdictionCode === null));
  assert.ok(statewideRows.every((row) => /^state:[A-Z]{2}:unspecified$/.test(row.jurisdictionTag)));
  assert.ok(statewideRows.every((row) => !row.jurisdictionTag.startsWith("county:")));
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

test("security election overlay joins only canonical incident county FIPS", () => {
  const fulton = registry.incidentRows.find((row) => row.jurisdictionTag === "county:13121");
  const pima = registry.incidentRows.find((row) => row.jurisdictionTag === "county:04019");
  const statewide = registry.incidentRows.find((row) => row.reportingGrain === "statewide_unspecified");
  assert.ok(fulton);
  assert.ok(pima);
  assert.ok(statewide);

  const coverage = {
    canonicalTaggedRows: 3,
    comparableRows: 2,
    duplicateTags: 0,
    invalidCanonicalTags: 0,
    nonGeographicRows: 0,
    rawJurisdictions: 3,
    unresolvedRows: 0,
  };
  const snapshot = ({ fips, state, winner }) => ({
    fips,
    jurisdictionTag: `county:${fips}`,
    state,
    snapshot: {
      caveat: winner === "unavailable" ? "Result is not loaded." : null,
      confidence: "exact",
      demCandidate: "Kamala Harris",
      demMarginPct: winner === "blue" ? 12.5 : null,
      demMarginVotes: winner === "blue" ? 125 : null,
      demSharePct: winner === "unavailable" ? null : 55,
      demVotes: winner === "unavailable" ? null : 550,
      otherVotes: winner === "unavailable" ? null : 50,
      repCandidate: "Donald Trump",
      repSharePct: winner === "unavailable" ? null : 42.5,
      repVotes: winner === "unavailable" ? null : 425,
      sourceAuthority: "Official election office",
      sourceConfidence: "certified",
      sourceId: `${state.toLowerCase()}-2024-president`,
      sourceUrl: `https://example.gov/${state.toLowerCase()}`,
      totalVotes: winner === "unavailable" ? null : 1025,
      turnout: null,
      winner,
      year: 2024,
    },
  });
  const dataset = {
    coverage,
    family: "results",
    snapshots: [
      snapshot({ fips: "13121", state: "GA", winner: "blue" }),
      snapshot({ fips: "04019", state: "AZ", winner: "unavailable" }),
      snapshot({ fips: "01001", state: "AL", winner: "red" }),
    ],
    source: "database",
    stateCoverage: {},
    year: 2024,
  };
  const malformedCounty = {
    ...fulton,
    id: "malformed-county-tag",
    jurisdictionCode: "1312",
    jurisdictionTag: "county:1312",
  };

  const overlay = buildSecurityElectionOverlay(
    [fulton, pima, statewide, malformedCounty],
    dataset,
  );

  assert.equal(overlay.year, 2024);
  assert.equal(overlay.dataSource, "database");
  assert.equal(overlay.incidentCountyCount, 2);
  assert.equal(overlay.rows.length, 2);
  assert.equal(overlay.matchedCountyCount, 1);
  assert.deepEqual(overlay.rows.map((row) => row.fips), ["04019", "13121"]);
  assert.ok(!overlay.rows.some((row) => row.fips === "01001"));

  const fultonResult = overlay.rows.find((row) => row.fips === "13121");
  const pimaResult = overlay.rows.find((row) => row.fips === "04019");
  assert.ok(fultonResult);
  assert.ok(pimaResult);
  assert.equal(fultonResult.sourceAuthority, "Official election office");
  assert.equal(fultonResult.sourceUrl, "https://example.gov/ga");
  assert.deepEqual(summarizeSecurityElectionWinner(fultonResult), {
    candidate: "Kamala Harris",
    marginPct: 12.5,
    marginVotes: 125,
    party: "Democratic",
    runnerUpCandidate: "Donald Trump",
    runnerUpVotes: 425,
    winnerVotes: 550,
  });
  assert.match(securityElectionResultText(fultonResult), /Kamala Harris won for the Democratic Party/);
  assert.equal(
    securityElectionResultText(pimaResult),
    "No joined 2024 presidential county result",
  );

  const redResult = {
    ...fultonResult,
    demMarginPct: -8,
    demMarginVotes: -80,
    winner: "red",
  };
  assert.equal(summarizeSecurityElectionWinner(redResult).party, "Republican");
  assert.match(securityElectionResultText(redResult), /Donald Trump won for the Republican Party/);

  const tiedResult = {
    ...fultonResult,
    demMarginPct: 0,
    demMarginVotes: 0,
    repVotes: 550,
    winner: "tie",
  };
  assert.equal(summarizeSecurityElectionWinner(tiedResult).party, "Tie");
  assert.match(securityElectionResultText(tiedResult), /tied at 550 votes/);
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

test("national explorer is static, source-linked, mixed-grain, and carries a compact election overlay", () => {
  const page = readFileSync("src/app/security/page.tsx", "utf8");
  const explorer = readFileSync("src/app/security/security-explorer.tsx", "utf8");
  const socialCard = readFileSync("src/app/api/social-card/route.tsx", "utf8");
  const sidebar = readFileSync("src/app/state-switcher.tsx", "utf8");
  const stateExplorer = readFileSync("src/app/results-explorer.tsx", "utf8");

  assert.match(page, /dynamic = "force-static"/);
  assert.match(page, /getNationalSecurityIncidentReport\(2024\)/);
  assert.match(page, /at least 227 threats/i);
  assert.match(page, /66 additional threats reported only at statewide/i);
  assert.match(page, /not an official FBI roster/i);
  assert.match(page, /loadNationalYearDataset\(2024\)/);
  assert.match(page, /buildSecurityElectionOverlay/);
  assert.match(page, /openGraph:/);
  assert.match(page, /twitter:/);
  assert.match(page, /summary_large_image/);
  assert.match(page, /view=security/);
  assert.match(page, /width: 1200/);
  assert.match(page, /height: 630/);
  assert.match(page, /separate datasets/i);
  assert.match(explorer, /\/data\/national-counties\.geojson/);
  assert.match(explorer, /expectedCountyFeatureCount = 3144/);
  assert.match(explorer, /cache: "force-cache"/);
  assert.match(explorer, /Sources JSON/);
  assert.match(explorer, /Print \/ save PDF/);
  assert.match(explorer, /National source context/);
  assert.match(explorer, /source\.sourceUrl/);
  assert.doesNotMatch(explorer, /\/api\/security-incidents/);
  assert.doesNotMatch(explorer, /\/api\/results/);
  assert.match(explorer, /aria-pressed=\{mapLayer === "winner"\}/);
  assert.match(explorer, /params\.set\("layer", mapLayer\)/);
  assert.match(explorer, /security-result-unavailable/);
  assert.match(explorer, /incidentOutlineStroke/);
  assert.match(explorer, /2024 presidential winners in mapped threat counties/);
  assert.match(explorer, /Open result source/);
  assert.match(explorer, /missing results are not treated as zero/i);
  assert.match(explorer, /electionOverlay\.matchedCountyCount/);
  assert.match(explorer, /resultRows: electionOverlay\.rows\.filter/);
  assert.match(explorer, /Shade thresholds: under 5, 5-14\.99, 15-29\.99, and 30\+ points/);
  assert.match(explorer, /Later public-source tracker/);
  assert.match(explorer, /At least \{trackerContext\?\.reportedThreatCount/);
  assert.match(explorer, /County not specified/);
  assert.match(explorer, /not drawn on counties/);
  assert.match(explorer, /row\.reportingGrain !== "county"/);
  assert.match(explorer, /incidentFips\(row\) \?\? ""/);
  assert.match(explorer, /Geography level/);
  assert.match(explorer, /Open cited public report/);
  assert.match(explorer, /Threat count source URL/);
  assert.match(explorer, /Open threat-count source/);
  assert.match(explorer, /threatCountBasisText/);
  assert.match(explorer, /reportRowsTruncated/);
  assert.match(explorer, /Copy report link/);
  assert.match(explorer, /window\.history\.replaceState/);
  assert.match(explorer, /params\.set\("report", "1"\)/);
  assert.match(explorer, /reportStateSummaries/);
  assert.match(explorer, /reportDateSummaries/);
  assert.match(explorer, /Summary by state/);
  assert.match(explorer, /Summary by report date/);
  assert.match(explorer, /Threats with no county named/);
  assert.match(explorer, /States with matching records/);
  assert.match(explorer, /Source strength/);
  assert.match(socialCard, /params\.get\("view"\) === "security"/);
  assert.match(socialCard, /buildSecuritySocialCard/);
  assert.match(socialCard, /Bomb-threat incident explorer/);
  assert.match(socialCard, /mapped counties/);
  assert.match(socialCard, /without county/);
  assert.match(socialCard, /Separate datasets/);
  assert.match(socialCard, /fraud, misconduct, altered votes, or an incorrect outcome/);
  assert.match(socialCard, /County-attributed incident record/);
  assert.match(sidebar, /has-security-incidents/);
  assert.match(sidebar, /States with bomb-threat records/);
  assert.match(sidebar, /nine states in the later 227-threat public-source tracker/);
  assert.match(sidebar, /statewideUnspecifiedThreatCount/);
  assert.match(sidebar, /Source-linked election security records/);
  assert.match(sidebar, /state-security-summary/);
  assert.match(stateExplorer, /if \(!pinnedMapName\) setSelectedMapName/);
  assert.match(stateExplorer, /drawer-clear-selection/);
  assert.match(stateExplorer, /Later public-source tracker/);
  assert.match(stateExplorer, /Statewide count - county not specified/);
  assert.match(stateExplorer, /Open statewide count source/);
  assert.match(stateExplorer, /Open threat-count source/);
  assert.match(stateExplorer, /threatCountBasisText/);
});

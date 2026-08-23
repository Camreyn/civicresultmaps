import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCountyProfile } from "../../src/lib/county-profile-core.ts";
import {
  findCanonicalCountyByFips,
  searchCanonicalCounties,
  searchCanonicalCountyPage,
} from "../../src/lib/county-search.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("county turnout display does not assume every denominator is all registered voters", () => {
  const countyPage = readFileSync("src/app/county/[fips]/page.tsx", "utf8");
  assert.match(countyPage, /<dt>Turnout denominator<\/dt>/);
  assert.doesNotMatch(countyPage, /<dt>Registered voters<\/dt>/);
});

test("canonical county search ranks exact FIPS, names, and explicit aliases", () => {
  assert.equal(searchCanonicalCounties({ query: "40079" })[0]?.displayName, "Le Flore County");
  assert.equal(searchCanonicalCounties({ query: "Leflore", state: "OK" })[0]?.fips, "40079");
  assert.equal(searchCanonicalCounties({ query: "Saint Louis", state: "MN" })[0]?.fips, "27137");

  const fairfield = searchCanonicalCounties({ query: "Fairfield", state: "SC" });
  assert.deepEqual(fairfield.map((row) => row.fips), ["45039"]);
  assert.equal(searchCanonicalCounties({ state: "DE", limit: 2 }).length, 2);

  const firstPage = searchCanonicalCountyPage({ state: "OK", limit: 1, offset: 0 });
  const secondPage = searchCanonicalCountyPage({ state: "OK", limit: 1, offset: 1 });
  assert.equal(firstPage.total, 77);
  assert.equal(firstPage.results.length, 1);
  assert.equal(secondPage.total, 77);
  assert.equal(secondPage.results.length, 1);
  assert.notEqual(firstPage.results[0]?.fips, secondPage.results[0]?.fips);
});

test("historical county names and retired FIPS resolve without inventing a one-to-one crosswalk", () => {
  assert.equal(searchCanonicalCounties({ query: "46113" })[0]?.fips, "46102");
  assert.equal(searchCanonicalCounties({ query: "Shannon County", state: "SD" })[0]?.fips, "46102");
  assert.equal(searchCanonicalCounties({ query: "02270" })[0]?.fips, "02158");

  const valdezCordova = searchCanonicalCounties({ query: "02261", state: "AK" });
  assert.deepEqual(valdezCordova.map((row) => row.fips), ["02063", "02066"]);
  assert.ok(valdezCordova.every((row) => row.historicalContext?.relationship === "split"));

  const fairfield = searchCanonicalCounties({ query: "09001", state: "CT" });
  assert.deepEqual(fairfield.map((row) => row.fips), ["09120", "09140", "09190"]);
  assert.ok(fairfield.every((row) => row.historicalContext?.relationship === "replaced_by_planning_regions"));
  assert.ok(fairfield.every((row) => row.historicalContext?.sourceUrl.includes("census.gov")));
});

test("FIPS lookup fails closed for malformed or non-registry identifiers", () => {
  assert.equal(findCanonicalCountyByFips("55025")?.displayName, "Dane County");
  assert.equal(findCanonicalCountyByFips("5502"), null);
  assert.equal(findCanonicalCountyByFips("99999"), null);
});

test("county profiles join every family on county jurisdictionTag", () => {
  const county = findCanonicalCountyByFips("55025");
  assert.ok(county);
  const source = {
    authority: "Wisconsin Elections Commission",
    category: "Presidential results",
    confidence: "Official reported result rows.",
    electionYear: 2024,
    id: "official-results",
    localArtifact: "data/results.csv",
    parser: "fixture",
    sourceUrl: "https://example.gov/results",
    state: "WI",
    status: "loaded",
    timestampBasis: "Certified canvass",
    title: "Official results",
  };

  const profile = buildCountyProfile({
    county,
    currentResults: [{
      jurisdictionCode: "WI-DANE",
      jurisdictionName: "Dane County",
      jurisdictionTag: "county:55025",
      level: "county",
      marginPct: 0,
      marginVotes: 0,
      office: "president",
      sourceId: "official-results",
      state: "WI",
      totalVotes: 390,
      votes: { Harris: 220, Other: 10, Trump: 160 },
      winner: "Harris",
      year: 2024,
    }],
    historicalRows: [
      {
        demVotes: 200,
        electionYear: 2016,
        id: "wi-2016-dane",
        jurisdictionCode: "WI-DANE",
        jurisdictionName: "Dane County",
        jurisdictionTag: "county:55025",
        localUnit: "Dane County",
        metrics: { sourceUrl: "https://example.gov/results/2016" },
        otherVotes: 20,
        repVotes: 120,
        rowMethod: "officialCountyAggregate",
        sourceDocumentId: "official-results",
        sourceId: "official-results",
        sourceLevel: "county",
        state: "WI",
        totalVotes: 340,
      },
      {
        demVotes: 240,
        electionYear: 2020,
        id: "wi-2020-dane",
        jurisdictionCode: "WI-DANE",
        jurisdictionName: "Dane County",
        jurisdictionTag: "county:55025",
        localUnit: "Dane County",
        metrics: {},
        otherVotes: 10,
        repVotes: 150,
        rowMethod: "officialCountyRow",
        sourceDocumentId: "official-results",
        sourceId: "official-results",
        sourceLevel: "county",
        state: "WI",
        totalVotes: 400,
      },
    ],
    turnoutRows: [{
      ballotsCast: 410,
      denominatorNote: "Registered voters on Election Day.",
      electionYear: 2024,
      id: "turnout-dane",
      jurisdictionCode: "WI-DANE",
      jurisdictionName: "Dane County",
      jurisdictionTag: "county:55025",
      level: "county",
      registeredVoters: 500,
      sourceId: "official-results",
      state: "WI",
      turnoutPct: 82,
      warningRequired: false,
    }],
    sources: [source],
    equipmentRows: [{
      absenteeSystem: "Central count",
      accessibleSystem: "Accessible ballot marker",
      configurationSignals: [],
      electionYear: 2024,
      equipmentType: "Optical scanner",
      id: "equipment-dane",
      jurisdictionCode: "WI-DANE",
      jurisdictionName: "Dane County",
      jurisdictionTag: "county:55025",
      level: "county",
      metrics: {},
      paperRecord: "Yes",
      pollingPlaces: 90,
      pollBookSystem: "Electronic poll book",
      precincts: 100,
      registeredVoters: 500,
      sourceGranularity: "county",
      sourceId: "equipment-source",
      sourceUrl: "https://example.org/equipment",
      standardSystem: "Scanner",
      state: "WI",
      systemName: "Example scanner",
      tabulation: "Precinct and central",
      uniformityNote: "County context; local configurations may differ.",
      uniformityWarningRequired: true,
      usage: "Standard",
      vendor: "Example vendor",
    }],
    voteMethodRows: [{
      county: "Dane County",
      electionYear: 2024,
      id: "method-dane-mail",
      jurisdictionCode: "WI-DANE",
      jurisdictionName: "Dane County",
      level: "county",
      localUnit: "Dane County",
      method: "mail",
      methodLabel: "By mail",
      methodSharePct: 25,
      sourceField: "EAVS F2a",
      sourceId: "EAC survey",
      sourceStatus: "loaded",
      sourceUrl: "https://eac.gov/data",
      state: "WI",
      totalVoters: 400,
      valueStatus: "reported",
      voters: 100,
    }, {
      county: "Dane County",
      electionYear: 2024,
      id: "method-madison-mail",
      jurisdictionCode: "WI-MADISON",
      jurisdictionName: "CITY OF MADISON - DANE COUNTY",
      level: "jurisdiction",
      localUnit: "CITY OF MADISON - DANE COUNTY",
      method: "mail",
      methodLabel: "By mail",
      methodSharePct: 25,
      sourceField: "EAVS F2a",
      sourceId: "EAC survey",
      sourceStatus: "loaded",
      sourceUrl: "https://eac.gov/data",
      state: "WI",
      totalVoters: 200,
      valueStatus: "reported",
      voters: 50,
    }],
    indicators: [{
      detail: "Fixture calculation detail.",
      electionYear: 2024,
      id: "indicator-dane",
      jurisdictionCode: "WI-DANE",
      jurisdictionName: "Dane County",
      jurisdictionTag: "county:55025",
      label: "Review fixture",
      level: "county",
      metrics: {},
      severity: 0.5,
      state: "WI",
      summary: "A source-review prompt, not a finding.",
      type: "vote_share_pattern",
    }],
  });

  assert.deepEqual(profile.history.map((row) => row.year), [2016, 2020, 2024]);
  assert.deepEqual(profile.history.map((row) => row.available), [true, true, true]);
  assert.equal(profile.history[0].candidateLabels.dem, "Hillary Clinton");
  assert.equal(profile.history[0].source?.sourceUrl, "https://example.gov/results/2016");
  assert.equal(profile.history[1].leader, "Democratic");
  assert.equal(profile.history[2].marginVotes, 60);
  assert.equal(profile.history[2].otherVotes, 10);
  assert.equal(profile.turnout.turnoutPct, 82);
  assert.equal(profile.equipment.length, 1);
  assert.equal(profile.voteMethods[0].jurisdictionTag, "county:55025");
  assert.equal(profile.voteMethods.length, 1);
  assert.equal(profile.voteMethods[0].voters, 150);
  assert.equal(profile.voteMethods[0].methodSharePct, 25);
  assert.equal(profile.voteMethods[0].confidence.level, "derived");
  assert.equal(profile.advisoryIndicators.length, 1);
  assert.equal(profile.confidence.level, "derived");
});

test("Alaska profiles remain unavailable without a reviewed reporting-unit crosswalk", () => {
  const county = findCanonicalCountyByFips("02020");
  assert.ok(county);
  const profile = buildCountyProfile({
    county,
    currentResults: [],
    equipmentRows: [],
    historicalRows: [],
    indicators: [],
    sources: [],
    turnoutRows: [],
    voteMethodRows: [],
  });

  assert.equal(profile.confidence.level, "unavailable");
  assert.equal(profile.history.every((row) => !row.available), true);
  assert.equal(profile.caveats.some((caveat) => /no county-equivalent vote allocation is inferred/i.test(caveat)), true);
});

test("Kalawao profiles preserve the official result assignment without inventing turnout", () => {
  const county = findCanonicalCountyByFips("15005");
  assert.ok(county);
  const profile = buildCountyProfile({
    county,
    currentResults: [],
    equipmentRows: [],
    historicalRows: [],
    indicators: [],
    sources: [],
    turnoutRows: [],
    voteMethodRows: [],
  });
  const caveats = profile.caveats.join(" ");

  assert.match(caveats, /official Hawaii precinct 13-09 assignment/i);
  assert.match(caveats, /does not report a separate Kalawao denominator/i);
  assert.doesNotMatch(caveats, /Kalawao County is not separately reported/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCountyVoteRaces } from "../../src/lib/county-vote-races.ts";
import { buildVotePrisms } from "../../src/lib/county-vote-prisms.ts";
import { workspaceNavigationHref, workspaceStateHref, workspaceNavigationContextFromSearchParams } from "../../src/lib/workspace-navigation.ts";

const features = JSON.parse(readFileSync("public/data/national-counties.geojson", "utf8")).features;
const state = "TX", year = 2024;
const row = { state, year, office:"president", level:"county", jurisdictionTag:"county:48201",
  winner:"Harris", votes:{Harris:60, Trump:40}, totalVotes:100, sourceId:"county-canvass" };
const review = { state, electionYear:year, jurisdictionTag:"county:48201", jurisdictionName:"Harris County",
  level:"local", localUnit:"Harris County", sourceId:"president-source", totalVotes:100,
  metrics:{ coverageMode:"presidentVsSenate", comparisonContest:"U.S. Senate (regular)",
    comparisonDemVotes:10, comparisonRepVotes:8, comparisonOtherVotes:1, comparisonSourceId:"senate-source" } };
const base = { state, electionYear:2012, jurisdictionTag:"county:48201", sourceLevel:"county", totalVotes:90,
  demVotes:50, repVotes:38, otherVotes:2, sourceDocumentId:"historical-source" };

test("offices, county comparison sources and election years stay separate", () => {
  const races = buildCountyVoteRaces(state, year,
    [row, {...row, level:"district"}, {...row, year:2016}, {...row, state:"CA"},
      {...row, resultStatus:"candidate_detail_suppressed"},
      {...row, office:"governor", winner:"Test candidate", winnerParty:"rep", totalVotes:85}],
    [base], [review, {...review, localUnit:"Precinct 1"}, {...review, electionYear:2020},
      {...review, jurisdictionTag:"county:48001", localUnit:"County total"},
      {...review, jurisdictionTag:"county:48113", metrics:{...review.metrics, comparisonOtherVotes:null}},
      {...review, metrics:{...review.metrics, coverageMode:"presidentVsUSHouse"}}]);
  assert.equal(races.length, 3);
  assert.equal(races[0].counties["48201"].total, 100);
  const senate = races.find(r => r.basis === "County comparison");
  assert.deepEqual(Object.keys(senate.counties).sort(), ["48001", "48201"]);
  assert.equal(senate.counties["48201"].total, 19);
  assert.equal(senate.counties["48201"].sourceId, "senate-source");
  assert.equal(races.find(r => r.id === "governor").counties["48201"].color, "rep");
});

test("historical totals preserve missing, zero, ties and ambiguous joins", () => {
  const votes = buildCountyVoteRaces(state,2012,[],[base,
    {...base, jurisdictionTag:"county:48113", demVotes:null, repVotes:null, totalVotes:null},
    {...base, jurisdictionTag:"county:48029", demVotes:0, repVotes:0, otherVotes:0, totalVotes:0},
    {...base, jurisdictionTag:"county:48001", demVotes:44, repVotes:44},
    {...base, jurisdictionTag:"county:48003"}, {...base, jurisdictionTag:"county:48003"},
    {...base, sourceLevel:"precinct", jurisdictionTag:"county:48005"},
    {...base, jurisdictionTag:"state:TX"}],[])[0].counties;
  assert.equal(votes["48201"].outcome, "Obama");
  assert.equal(votes["48113"], null);
  assert.equal(votes["48029"].total, 0);
  assert.equal(votes["48029"].outcome, "No votes reported");
  assert.equal(votes["48001"].outcome, "Tie");
  assert.equal(votes["48003"], null);
  assert.equal(Object.keys(votes).length, 5);
});

test("every state's county-equivalents project; only joined counties set the linear scale", () => {
  const states = new Set(features.map(f => f.properties.STATE));
  assert.equal(states.size, 51);
  for (const s of states) {
    const geometry = features.filter(f => f.properties.STATE === s);
    const { prisms } = buildVotePrisms(geometry, {}, -12);
    assert.equal(prisms.length, geometry.length);
    assert.ok(prisms.every(p => !p.height && !p.darkWall && !p.lightWall && p.roof.startsWith("M") && !/NaN|Infinity/.test(p.roof)));
  }
  const texas = features.filter(f => f.properties.STATE === state);
  const counties = {"48201":{total:100}, "48113":{total:50}, "48029":{total:0}, "99999":{total:10000}};
  const { peak, prisms } = buildVotePrisms(texas, counties, -12);
  assert.equal(peak, 100);
  const h = prisms.find(p => p.id === "48201"), d = prisms.find(p => p.id === "48113");
  assert.equal(h.height, d.height * 2);
  assert.ok(h.lightWall && h.darkWall);
  assert.equal(prisms.find(p => p.id === "48029").vote.total, 0);
  assert.equal(prisms.find(p => p.id === "48001").vote, null);
  assert.notEqual(buildVotePrisms(texas, counties, 45).prisms.find(p => p.id === h.id).roof, h.roof);
});

test("3D and a selected contest survive historical map links; changing state clears county and race", () => {
  for (const year of [2012,2016,2020,2024]) {
    const context = {state, year, mode:"votes-3d", tab:"map", fips:"48201", race:"comparison:U.S. Senate"};
    const url = new URL(workspaceNavigationHref(context), "http://localhost");
    assert.deepEqual(workspaceNavigationContextFromSearchParams(url.searchParams, context),context);
    assert.equal(workspaceStateHref(context,"CA"), `/?state=CA&year=${year}&tab=map&mode=votes-3d`);
  }
});

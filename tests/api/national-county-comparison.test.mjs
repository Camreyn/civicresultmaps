import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildNationalCountyComparison,
  dataConfidenceForPath,
  makeNationalCountySnapshot,
  nationalCountyComparisonsToCsv,
} from "../../src/lib/national-county-comparison.ts";

const zeroCoverage = {
  canonicalTaggedRows: 0,
  comparableRows: 0,
  duplicateTags: 0,
  invalidCanonicalTags: 0,
  nonGeographicRows: 0,
  rawJurisdictions: 0,
  unresolvedRows: 0,
};

function snapshot(year, demVotes, repVotes, totalVotes = demVotes + repVotes, confidence = "exact") {
  return makeNationalCountySnapshot({
    confidence,
    demVotes,
    otherVotes: totalVotes - demVotes - repVotes,
    repVotes,
    sourceId: `official-${year}`,
    totalVotes,
    year,
  });
}

function dataset(year, records, coverage = {}) {
  const byState = {};
  for (const record of records) {
    const current = byState[record.state] ?? { ...zeroCoverage };
    current.rawJurisdictions += 1;
    current.canonicalTaggedRows += 1;
    current.comparableRows += record.snapshot.winner === "unavailable" ? 0 : 1;
    byState[record.state] = current;
  }
  return {
    coverage: {
      ...zeroCoverage,
      rawJurisdictions: records.length,
      canonicalTaggedRows: records.length,
      comparableRows: records.filter((record) => record.snapshot.winner !== "unavailable").length,
      ...coverage,
    },
    family: year === 2024 ? "results" : "historical",
    snapshots: records,
    source: "database",
    stateCoverage: byState,
    year,
  };
}

const references = [
  {
    aliases: ["Alpha"],
    caveat: "",
    displayName: "Alpha County",
    fips: "01001",
    jurisdictionTag: "county:01001",
    state: "AL",
  },
  {
    aliases: ["Beta"],
    caveat: "",
    displayName: "Beta County",
    fips: "01003",
    jurisdictionTag: "county:01003",
    state: "AL",
  },
  {
    aliases: ["Aleutians East"],
    caveat: "",
    displayName: "Aleutians East Borough",
    fips: "02013",
    jurisdictionTag: "county:02013",
    state: "AK",
  },
];

test("national county comparison calculates both flip directions and signed Democratic margin swing", () => {
  const from = dataset(2020, [
    { fips: "01001", jurisdictionTag: "county:01001", snapshot: snapshot(2020, 40, 60), state: "AL" },
    { fips: "01003", jurisdictionTag: "county:01003", snapshot: snapshot(2020, 60, 40), state: "AL" },
  ]);
  const to = dataset(2024, [
    { fips: "01001", jurisdictionTag: "county:01001", snapshot: snapshot(2024, 55, 45), state: "AL" },
    { fips: "01003", jurisdictionTag: "county:01003", snapshot: snapshot(2024, 45, 55), state: "AL" },
  ]);

  const result = buildNationalCountyComparison({ from, references, to });
  assert.equal(result.summary.matchedCount, 2);
  assert.equal(result.summary.redToBlue, 1);
  assert.equal(result.summary.blueToRed, 1);
  assert.equal(result.summary.noFlip, 0);
  assert.equal(result.rows[0].direction, "red_to_blue");
  assert.equal(result.rows[0].marginSwingPct, 30);
  assert.equal(result.rows[0].from.demCandidate, "Joe Biden");
  assert.equal(result.rows[0].to.demCandidate, "Kamala Harris");
  assert.equal(result.coverage.canonicalRegistryRows, 3);
  assert.equal(result.coverage.missingBothRows, 1);
  assert.match(result.coverage.caveats.join(" "), /Alaska/);
  assert.match(result.coverage.caveats.join(" "), /not allocated/);
});

test("direction, state, FIPS, name, and alias filtering stay canonical", () => {
  const from = dataset(2016, [
    { fips: "01001", jurisdictionTag: "county:01001", snapshot: snapshot(2016, 40, 60), state: "AL" },
    { fips: "01003", jurisdictionTag: "county:01003", snapshot: snapshot(2016, 60, 40), state: "AL" },
  ]);
  const to = dataset(2020, [
    { fips: "01001", jurisdictionTag: "county:01001", snapshot: snapshot(2020, 55, 45), state: "AL" },
    { fips: "01003", jurisdictionTag: "county:01003", snapshot: snapshot(2020, 45, 55), state: "AL" },
  ]);

  const byDirection = buildNationalCountyComparison({ direction: "blue_to_red", from, references, to });
  assert.deepEqual(byDirection.rows.map((row) => row.fips), ["01003"]);
  assert.equal(byDirection.summary.selectedCount, 1);
  assert.equal(byDirection.summary.matchedCount, 2);

  const byAlias = buildNationalCountyComparison({ from, query: "alpha", references, state: "al", to });
  assert.deepEqual(byAlias.rows.map((row) => row.fips), ["01001"]);
  assert.equal(byAlias.coverage.matchedCanonicalRows, 2);
  assert.equal(byAlias.coverage.scope, "AL");

  const byFips = buildNationalCountyComparison({ fips: "01003", from, references, to });
  assert.deepEqual(byFips.rows.map((row) => row.jurisdictionTag), ["county:01003"]);
});

test("confidence classification distinguishes exact, derived, proxy, and partial paths", () => {
  const base = {
    demVotes: 50,
    otherVotes: 5,
    repVotes: 45,
    sourceLevel: "county",
    sourceStatus: "loaded",
    totalVotes: 100,
  };
  assert.equal(dataConfidenceForPath({ ...base, sourceParser: "officialCountyWorkbook" }), "exact");
  assert.equal(dataConfidenceForPath({ ...base, sourceParser: "officialPrecinctCountyAggregate" }), "derived");
  assert.equal(dataConfidenceForPath({ ...base, sourceParser: "wikipediaCountyPresidentialTable" }), "proxy");
  assert.equal(dataConfidenceForPath({ ...base, demVotes: null, sourceParser: "officialCountyWorkbook" }), "partial");
  assert.equal(snapshot(2024, 0, 0, 0).winner, "unavailable");
});

test("CSV output preserves stable vote fields and quotes caveats", () => {
  const from = dataset(2020, [
    { fips: "01001", jurisdictionTag: "county:01001", snapshot: snapshot(2020, 40, 60), state: "AL" },
  ]);
  const toSnapshot = makeNationalCountySnapshot({
    caveat: "Certified, reviewed",
    confidence: "derived",
    demVotes: 55,
    otherVotes: 0,
    repVotes: 45,
    sourceId: "official-2024",
    totalVotes: 100,
    year: 2024,
  });
  const to = dataset(2024, [
    { fips: "01001", jurisdictionTag: "county:01001", snapshot: toSnapshot, state: "AL" },
  ]);
  const result = buildNationalCountyComparison({ from, references: references.slice(0, 1), to });
  const csv = nationalCountyComparisonsToCsv(result.rows);

  assert.match(csv, /^state,fips,jurisdiction_tag,county,direction,/);
  assert.match(csv, /AL,01001,county:01001,Alpha County,red_to_blue/);
  assert.match(csv, /"Certified, reviewed"/);
  assert.match(csv, /Joe Biden,40,Donald Trump,60/);
});

test("public flip API exposes the canonical, paginated JSON and CSV contract", () => {
  const route = readFileSync("src/app/api/flips/route.ts", "utf8");
  const service = readFileSync("src/lib/national-county-comparison-data.ts", "utf8");
  const domain = readFileSync("src/lib/national-county-comparison.ts", "utf8");
  const registry = JSON.parse(readFileSync("data/canonical-jurisdictions.json", "utf8"));

  assert.equal(registry.jurisdictions.filter((row) => /^county:\d{5}$/.test(row.jurisdictionTag)).length, 3144);
  assert.match(route, /direction.*red_to_blue.*blue_to_red.*no_flip/);
  assert.match(route, /format.*json.*csv/);
  assert.match(route, /limit.*max\(5000\)/);
  assert.match(route, /X-Total-Count/);
  assert.match(route, /view.*full.*compact/);
  assert.match(route, /Full JSON responses are limited to 1,000 rows/);
  assert.doesNotMatch(route, /format === "csv" \? 5000/);
  assert.match(route, /apiEnvelope\(responseRows/);
  assert.match(route, /coverage: result\.coverage/);
  assert.match(route, /pagination: result\.pagination/);
  assert.match(route, /summary: result\.summary/);
  assert.match(service, /canonicalTagFor/);
  assert.match(service, /Resolution is diagnostic only/);
  assert.match(service, /Comparisons require a persisted canonical tag/);
  assert.match(domain, /Official election-district results are not allocated/);
  assert.match(service, /queryNationalCountyComparisons/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildShpilkinHistogram,
  listShpilkinCountyOptions,
  shpilkinBucketWidths,
} from "../../src/lib/shpilkin-histogram.ts";

function reviewRow(overrides = {}) {
  return {
    demCandidate: "Example Democrat",
    demShare: 40,
    demVotes: 40,
    electionYear: 2024,
    id: "review-a",
    jurisdictionCode: "EX-ALPHA",
    jurisdictionName: "Alpha County",
    jurisdictionTag: "county:01001",
    level: "precinct",
    localUnit: "Precinct 1",
    repCandidate: "Example Republican",
    repShare: 60,
    repVotes: 60,
    sourceId: "official-review",
    state: "EX",
    totalVotes: 100,
    ...overrides,
  };
}

function turnoutRow(overrides = {}) {
  return {
    ballotsCast: 80,
    denominatorNote: "Registered voters at the election close",
    electionYear: 2024,
    id: "turnout-a",
    jurisdictionCode: "reporting:EX:2024:precinct:01001:1",
    jurisdictionName: "Alpha County / Precinct 1",
    jurisdictionTag: "county:01001",
    level: "precinct",
    registeredVoters: 100,
    sourceId: "official-turnout",
    state: "EX",
    turnoutPct: 80,
    warningRequired: false,
    ...overrides,
  };
}

const reviewRows = [
  reviewRow(),
  reviewRow({
    demShare: 60,
    demVotes: 60,
    id: "review-b",
    localUnit: "Precinct 2",
    repShare: 40,
    repVotes: 40,
  }),
];
const turnoutRows = [
  turnoutRow(),
  turnoutRow({
    ballotsCast: 90,
    id: "turnout-b",
    jurisdictionCode: "reporting:EX:2024:precinct:01001:2",
    jurisdictionName: "Alpha County / Precinct 2",
    localUnit: "Precinct 2",
    registeredVoters: 120,
    turnoutPct: 75,
  }),
];

function histogram(overrides = {}) {
  return buildShpilkinHistogram({
    accumulation: "votes",
    bucketWidth: 10,
    candidate: "dem",
    countyTag: "county:01001",
    reviewRows,
    scope: "state_local",
    turnoutRows,
    xAxis: "candidate_share",
    ...overrides,
  });
}

test("implements all four requested vote/unit by share/turnout histogram modes", () => {
  const candidateVotes = histogram();
  const candidateUnits = histogram({ accumulation: "units" });
  const turnoutVotes = histogram({ xAxis: "turnout" });
  const turnoutUnits = histogram({ accumulation: "units", xAxis: "turnout" });

  assert.equal(candidateVotes.drawableObservationCount, 2);
  assert.equal(candidateVotes.totalValue, 200);
  assert.equal(candidateVotes.buckets.find((bucket) => bucket.low === 40).value, 100);
  assert.equal(candidateVotes.buckets.find((bucket) => bucket.low === 60).value, 100);
  assert.equal(candidateUnits.totalValue, 2);
  assert.equal(turnoutVotes.totalValue, 170);
  assert.equal(turnoutVotes.buckets.find((bucket) => bucket.low === 70).value, 90);
  assert.equal(turnoutVotes.buckets.find((bucket) => bucket.low === 80).value, 80);
  assert.equal(turnoutUnits.totalValue, 2);
});

test("supports 1, 2, 5, and 10 percentage-point buckets with an inclusive 100% endpoint", () => {
  assert.deepEqual(shpilkinBucketWidths, [1, 2, 5, 10]);
  const exactHundred = reviewRow({ demShare: 100, demVotes: 100, repShare: 0, repVotes: 0 });

  for (const bucketWidth of shpilkinBucketWidths) {
    const result = histogram({ bucketWidth, reviewRows: [exactHundred] });
    assert.equal(result.buckets.length, 100 / bucketWidth);
    assert.equal(result.buckets.at(-1).unitCount, 1);
    assert.equal(result.buckets.at(-1).high, 100);
  }
});

test("uses a fixed 0-100 comparison domain and a capped fitted domain", () => {
  const overHundred = turnoutRow({ ballotsCast: 125, registeredVoters: 100, turnoutPct: 125 });
  const extreme = turnoutRow({
    ballotsCast: 300,
    id: "turnout-extreme",
    jurisdictionCode: "reporting:EX:2024:precinct:01001:extreme",
    jurisdictionName: "Alpha County / Precinct Extreme",
    registeredVoters: 100,
    turnoutPct: 300,
  });
  const comparison = histogram({ bucketWidth: 5, turnoutRows: [overHundred, extreme], xAxis: "turnout" });
  const fitted = histogram({
    bucketWidth: 5,
    scaleMode: "fit",
    turnoutRows: [overHundred, extreme],
    xAxis: "turnout",
  });

  assert.equal(comparison.domainMin, 0);
  assert.equal(comparison.domainMax, 100);
  assert.equal(comparison.overflowObservationCount, 2);
  assert.equal(comparison.buckets.at(-1).label, "≥95%");
  assert.equal(comparison.buckets.at(-1).unitCount, 2);

  assert.equal(fitted.domainMin, 120);
  assert.equal(fitted.domainMax, 200);
  assert.equal(fitted.overflowObservationCount, 1);
  assert.equal(fitted.buckets.at(-1).label, "≥195%");
  assert.equal(fitted.buckets.at(-1).unitCount, 1);
  assert.equal(fitted.buckets.find((bucket) => bucket.low === 125).unitCount, 1);
});

test("fitted scaling removes empty tails while preserving bucket membership", () => {
  const comparison = histogram();
  const fitted = histogram({ scaleMode: "fit" });

  assert.deepEqual([comparison.domainMin, comparison.domainMax], [0, 100]);
  assert.equal(comparison.buckets.length, 10);
  assert.deepEqual([fitted.domainMin, fitted.domainMax], [30, 70]);
  assert.equal(fitted.buckets.length, 4);
  assert.equal(fitted.buckets.find((bucket) => bucket.low === 40).unitCount, 1);
  assert.equal(fitted.buckets.find((bucket) => bucket.low === 60).unitCount, 1);
});

test("statewide county rollups require canonical tags and retain contributing row ids", () => {
  const rows = [
    ...reviewRows,
    reviewRow({
      demVotes: 70,
      id: "review-beta",
      jurisdictionCode: "EX-BETA",
      jurisdictionName: "Beta County",
      jurisdictionTag: "county:01003",
      localUnit: "Precinct 1",
      repVotes: 30,
    }),
    reviewRow({
      id: "review-untagged",
      jurisdictionName: "Alpha County",
      jurisdictionTag: null,
      localUnit: "Looks Like Alpha But Is Untagged",
    }),
  ];
  const result = histogram({ accumulation: "units", reviewRows: rows, scope: "state_county" });

  assert.equal(result.drawableObservationCount, 2);
  assert.equal(result.totalValue, 2);
  assert.equal(result.untaggedSourceRowCount, 1);
  const alphaBucket = result.buckets.find((bucket) => bucket.observationIds.includes("review-a"));
  assert.deepEqual(alphaBucket.observationIds.sort(), ["review-a", "review-b"]);
  assert.ok(!result.buckets.some((bucket) => bucket.observationIds.includes("review-untagged")));
});

test("county-local scope filters on canonical parent identity rather than display names", () => {
  const sameNameWrongTag = reviewRow({
    id: "review-wrong-parent",
    jurisdictionTag: "county:01003",
    localUnit: "Precinct 9",
  });
  const result = histogram({
    accumulation: "units",
    countyTag: "county:01001",
    reviewRows: [...reviewRows, sameNameWrongTag],
    scope: "county_local",
  });

  assert.equal(result.drawableObservationCount, 2);
  assert.ok(result.observations.every((observation) => observation.parentTag === "county:01001"));
  assert.ok(!result.observations.some((observation) => observation.sourceRowIds.includes("review-wrong-parent")));
});

test("county turnout uses a direct county denominator when both county and local rows exist", () => {
  const direct = turnoutRow({
    ballotsCast: 175,
    id: "turnout-county",
    jurisdictionCode: "01001",
    jurisdictionName: "Alpha County",
    level: "county",
    registeredVoters: 250,
    turnoutPct: 70,
  });
  const result = histogram({
    scope: "state_county",
    turnoutRows: [...turnoutRows, direct],
    xAxis: "turnout",
  });

  assert.equal(result.drawableObservationCount, 1);
  assert.equal(result.totalValue, 175);
  assert.deepEqual(result.observations[0].sourceRowIds, ["turnout-county"]);
  assert.equal(result.observations[0].valuePct, 70);
});

test("county turnout rollups fail closed when a local denominator is missing", () => {
  const result = histogram({
    scope: "state_county",
    turnoutRows: [turnoutRows[0], { ...turnoutRows[1], registeredVoters: null, turnoutPct: 75 }],
    xAxis: "turnout",
  });

  assert.equal(result.drawableObservationCount, 0);
  assert.equal(result.omittedObservationCount, 1);
});

test("vote accumulation omits missing weights while unit accumulation can use a reported share", () => {
  const shareOnly = reviewRow({ demShare: 42, demVotes: null, id: "share-only", totalVotes: null });
  const voteWeighted = histogram({ reviewRows: [shareOnly] });
  const unitWeighted = histogram({ accumulation: "units", reviewRows: [shareOnly] });

  assert.equal(voteWeighted.drawableObservationCount, 0);
  assert.equal(voteWeighted.omittedObservationCount, 1);
  assert.equal(unitWeighted.drawableObservationCount, 1);
  assert.equal(unitWeighted.totalValue, 1);
  assert.equal(unitWeighted.observations[0].valuePct, 42);
});

test("county options include only local rows with canonical county tags", () => {
  const options = listShpilkinCountyOptions(
    [
      reviewRow(),
      reviewRow({ id: "untagged", jurisdictionTag: null, jurisdictionName: "Ignored County" }),
      reviewRow({ id: "county-row", jurisdictionTag: "county:01005", jurisdictionName: "County-Level Only", level: "county" }),
    ],
    turnoutRows,
  );

  assert.deepEqual(options, [{ name: "Alpha County", tag: "county:01001" }]);
});

test("history loads complete state review and turnout inputs within the supported 20,000-row bound", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  const access = readFileSync("src/lib/data-access.ts", "utf8");

  assert.match(page, /needsReviewRows = activeTab === "history" \|\| needsReview/u);
  assert.match(page, /limit: activeTab === "history" \|\| activeTab === "exports" \? 20000 : 5000/u);
  assert.match(page, /listTurnoutRows\(\{[^}]*limit: 20000/u);
  assert.equal(
    [...access.matchAll(/limit \$\{Math\.min\(Math\.max\(input\.limit \?\? 500, 1\), 20000\)\}/gu)].length,
    2,
  );
});

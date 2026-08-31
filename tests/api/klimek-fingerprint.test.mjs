import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKlimekFingerprint,
  klimekBucketWidths,
} from "../../src/lib/klimek-fingerprint.ts";

function reviewRow(overrides = {}) {
  return {
    demCandidate: "Example Democrat",
    demShare: 60,
    demVotes: 60,
    electionYear: 2024,
    harrisShare: 60,
    harrisVotes: 60,
    id: "review-a",
    jurisdictionCode: "EX-ALPHA",
    jurisdictionName: "Alpha County",
    jurisdictionTag: "county:01001",
    level: "precinct",
    localUnit: "Precinct 1",
    metrics: {},
    repCandidate: "Example Republican",
    repShare: 40,
    repVotes: 40,
    reportingUnitId: "unit-a",
    sourceId: "official-review",
    state: "EX",
    totalVotes: 100,
    trumpShare: 40,
    trumpVotes: 40,
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
    reportingUnitId: "unit-a",
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
    demShare: 55,
    demVotes: 110,
    harrisShare: 55,
    harrisVotes: 110,
    id: "review-b",
    localUnit: "Precinct 2",
    repShare: 45,
    repVotes: 90,
    reportingUnitId: "unit-b",
    totalVotes: 200,
    trumpShare: 45,
    trumpVotes: 90,
  }),
];
const turnoutRows = [
  turnoutRow(),
  turnoutRow({
    ballotsCast: 150,
    id: "turnout-b",
    jurisdictionCode: "reporting:EX:2024:precinct:01001:2",
    jurisdictionName: "Alpha County / Precinct 2",
    registeredVoters: 200,
    reportingUnitId: "unit-b",
    turnoutPct: 75,
  }),
];

function fingerprint(overrides = {}) {
  return buildKlimekFingerprint({
    accumulation: "votes",
    bucketWidth: 5,
    countyTag: "county:01001",
    pointSize: "total_votes",
    reviewRows,
    scope: "state_local",
    turnoutRows,
    ...overrides,
  });
}

test("plots turnout on x and the loaded scope winner share on y", () => {
  const result = fingerprint();

  assert.deepEqual(klimekBucketWidths, [1, 2, 5]);
  assert.equal(result.referenceCandidate, "dem");
  assert.equal(result.referenceCandidateLabel, "Example Democrat");
  assert.equal(result.loadedCandidateVotes.dem, 170);
  assert.equal(result.loadedCandidateVotes.rep, 130);
  assert.equal(result.points.length, 2);
  const alpha = result.points.find((point) => point.id === "reporting-unit:unit-a");
  assert.equal(alpha.turnoutPct, 80);
  assert.equal(alpha.winnerSharePct, 60);
  assert.equal(alpha.sizeValue, 100);
  assert.deepEqual(alpha.sourceIds.sort(), ["official-review", "official-turnout"]);
  assert.deepEqual([result.xDomainMin, result.xDomainMax], [0, 100]);
  assert.deepEqual([result.yDomainMin, result.yDomainMax], [0, 100]);
});

test("fitted scaling spreads clustered points with bucket-aligned axis domains", () => {
  const result = fingerprint({ scaleMode: "fit" });

  assert.deepEqual([result.xDomainMin, result.xDomainMax], [70, 85]);
  assert.deepEqual([result.yDomainMin, result.yDomainMax], [50, 65]);
  assert.equal(result.bottomBuckets.length, 3);
  assert.equal(result.sideBuckets.length, 3);
  assert.equal(result.bottomBuckets.find((bucket) => bucket.low === 75).unitCount, 1);
  assert.equal(result.sideBuckets.find((bucket) => bucket.low === 55).unitCount, 1);
});

test("supports both requested point-size encodings and aligned vote or unit marginals", () => {
  const totalSized = fingerprint();
  const winnerSized = fingerprint({ pointSize: "winner_votes" });
  const unitMarginals = fingerprint({ accumulation: "units" });

  assert.deepEqual(totalSized.points.map((point) => point.sizeValue), [200, 100]);
  assert.deepEqual(winnerSized.points.map((point) => point.sizeValue), [110, 60]);
  assert.equal(totalSized.totalBottomValue, 230);
  assert.equal(totalSized.totalSideValue, 300);
  assert.equal(unitMarginals.totalBottomValue, 2);
  assert.equal(unitMarginals.totalSideValue, 2);
  assert.equal(
    totalSized.bottomBuckets.find((bucket) => bucket.low === 75).unitCount,
    1,
  );
  assert.equal(
    totalSized.sideBuckets.find((bucket) => bucket.low === 55).unitCount,
    1,
  );
});

test("local scopes require the same exact reporting-unit identity", () => {
  const sameDisplayDifferentIdentity = fingerprint({
    reviewRows: [reviewRow({ reportingUnitId: "review-only" })],
    turnoutRows: [turnoutRow({ reportingUnitId: "turnout-only" })],
  });
  const sameDisplayNoIdentity = fingerprint({
    reviewRows: [reviewRow({ reportingUnitId: null })],
    turnoutRows: [turnoutRow({ reportingUnitId: null })],
  });

  assert.equal(sameDisplayDifferentIdentity.points.length, 0);
  assert.equal(sameDisplayDifferentIdentity.candidateUnmatchedObservationCount, 1);
  assert.equal(sameDisplayDifferentIdentity.turnoutUnmatchedObservationCount, 1);
  assert.equal(sameDisplayNoIdentity.points.length, 0);
  assert.equal(sameDisplayNoIdentity.candidateIdentityMissingCount, 1);
  assert.equal(sameDisplayNoIdentity.turnoutIdentityMissingCount, 1);
});

test("state-by-county scope pairs canonical county rollups without display-name inference", () => {
  const countyReviewRows = [
    reviewRow({ reportingUnitId: null }),
    reviewRow({
      demVotes: 45,
      harrisVotes: 45,
      id: "review-alpha-2",
      localUnit: "Precinct 2",
      repVotes: 55,
      reportingUnitId: null,
      trumpVotes: 55,
    }),
    reviewRow({
      demVotes: 70,
      harrisVotes: 70,
      id: "review-beta",
      jurisdictionCode: "EX-BETA",
      jurisdictionName: "Beta County",
      jurisdictionTag: "county:01003",
      localUnit: "Precinct 1",
      repVotes: 30,
      reportingUnitId: null,
      trumpVotes: 30,
    }),
  ];
  const countyTurnoutRows = [
    turnoutRow({ jurisdictionName: "Alpha County", level: "county", reportingUnitId: null, turnoutPct: 72 }),
    turnoutRow({
      id: "turnout-beta",
      jurisdictionCode: "01003",
      jurisdictionName: "Beta County",
      jurisdictionTag: "county:01003",
      level: "county",
      reportingUnitId: null,
      turnoutPct: 68,
    }),
    turnoutRow({
      id: "turnout-lookalike",
      jurisdictionName: "Alpha County",
      jurisdictionTag: null,
      level: "county",
      reportingUnitId: null,
      turnoutPct: 99,
    }),
  ];
  const result = fingerprint({
    accumulation: "units",
    reviewRows: countyReviewRows,
    scope: "state_county",
    turnoutRows: countyTurnoutRows,
  });

  assert.equal(result.points.length, 2);
  assert.deepEqual(result.points.map((point) => point.id).sort(), ["county:01001", "county:01003"]);
  assert.equal(result.untaggedSourceRowCount, 1);
});

test("uses 0-100 comparison axes and preserves extreme values in capped fitted axes", () => {
  const input = {
    reviewRows: [reviewRow({ demVotes: 250, harrisVotes: 250, repVotes: 10, totalVotes: 100, trumpVotes: 10 })],
    turnoutRows: [turnoutRow({ ballotsCast: 300, registeredVoters: 100, turnoutPct: 300 })],
  };
  const comparison = fingerprint(input);
  const fitted = fingerprint({ ...input, scaleMode: "fit" });

  assert.deepEqual([comparison.xDomainMin, comparison.xDomainMax], [0, 100]);
  assert.deepEqual([comparison.yDomainMin, comparison.yDomainMax], [0, 100]);
  assert.equal(comparison.bottomBuckets.at(-1).label, "≥95%");
  assert.equal(comparison.sideBuckets.at(-1).label, "≥95%");

  assert.deepEqual([fitted.xDomainMin, fitted.xDomainMax], [190, 200]);
  assert.deepEqual([fitted.yDomainMin, fitted.yDomainMax], [190, 200]);
  assert.equal(fitted.xOverflowPointCount, 1);
  assert.equal(fitted.yOverflowPointCount, 1);
  assert.equal(fitted.points[0].turnoutPct, 300);
  assert.equal(fitted.points[0].winnerSharePct, 250);
  assert.equal(fitted.bottomBuckets.at(-1).label, "≥195%");
  assert.equal(fitted.sideBuckets.at(-1).label, "≥195%");
  assert.ok(fitted.bottomBuckets.at(-1).sourceRowIds.includes("turnout-a"));
  assert.ok(fitted.sideBuckets.at(-1).sourceRowIds.includes("review-a"));
});

test("uses marginal bucket density for opacity without changing exact coordinates", () => {
  const result = fingerprint({
    accumulation: "units",
    reviewRows: [
      reviewRow(),
      reviewRow({ demVotes: 61, harrisVotes: 61, id: "review-b", localUnit: "Precinct 2", repVotes: 39, reportingUnitId: "unit-b", trumpVotes: 39 }),
      reviewRow({ demVotes: 20, harrisVotes: 20, id: "review-c", localUnit: "Precinct 3", repVotes: 10, reportingUnitId: "unit-c", trumpVotes: 10 }),
    ],
    turnoutRows: [
      turnoutRow(),
      turnoutRow({ id: "turnout-b", jurisdictionName: "Alpha County / Precinct 2", reportingUnitId: "unit-b", turnoutPct: 82 }),
      turnoutRow({ id: "turnout-c", jurisdictionName: "Alpha County / Precinct 3", reportingUnitId: "unit-c", turnoutPct: 10 }),
    ],
  });

  const dense = result.points.find((point) => point.id === "reporting-unit:unit-a");
  const sparse = result.points.find((point) => point.id === "reporting-unit:unit-c");
  assert.equal(dense.turnoutPct, 80);
  assert.equal(dense.winnerSharePct, 60);
  assert.equal(dense.densityScore, 1);
  assert.equal(sparse.densityScore, 0.5);
});

test("does not invent a winning candidate when loaded major-candidate totals tie", () => {
  const result = fingerprint({
    reviewRows: [reviewRow({ demVotes: 50, harrisVotes: 50, repVotes: 50, trumpVotes: 50 })],
  });

  assert.equal(result.referenceCandidate, null);
  assert.equal(result.points.length, 0);
});

test("does not treat a missing loaded candidate vote count as zero when selecting the winner", () => {
  const result = fingerprint({
    reviewRows: [reviewRow({ demShare: 60, demVotes: null, harrisShare: 60, harrisVotes: null })],
  });

  assert.equal(result.loadedCandidateVotes.dem, null);
  assert.equal(result.loadedCandidateVotes.rep, 40);
  assert.equal(result.referenceCandidate, null);
  assert.equal(result.points.length, 0);
});

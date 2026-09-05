import assert from "node:assert/strict";
import test from "node:test";
import { partitionReviewRowsForPromotion, validateNativeSourceReferences } from "../../src/db/native-import.ts";

function reviewRow({
  comparisonSourceId,
  electionYear,
  localUnit = "Example County",
  presidentialParticipationProxy,
  sourceId = "official-presidential-results",
} = {}) {
  return {
    comparisonSourceId,
    county: "Example County",
    electionYear,
    jurisdictionTag: "county:01001",
    localUnit,
    presidentialParticipationProxy,
    sourceId,
  };
}

const knownSourceIds = ["official-presidential-results", "official-senate-results"];

test("partitions current 2024 and historical 2016 review rows by election year", () => {
  const currentRow = reviewRow({ comparisonSourceId: "official-senate-results" });
  const historicalRow = reviewRow({
    comparisonSourceId: "official-senate-results",
    electionYear: 2016,
    localUnit: "Example County historical",
  });

  const result = partitionReviewRowsForPromotion({
    currentRows: [currentRow],
    electionYear: 2024,
    historicalRows: [historicalRow],
    knownSourceIds,
  });

  assert.deepEqual(result.historicalReviewYears, [2016]);
  assert.deepEqual(Array.from(result.reviewRowsByYear.keys()).sort(), [2016, 2024]);
  assert.equal(result.reviewRowsByYear.get(2024)?.[0].electionYear, 2024);
  assert.equal(result.reviewRowsByYear.get(2024)?.[0].demCandidate, "Kamala Harris");
  assert.equal(result.reviewRowsByYear.get(2016)?.[0].electionYear, 2016);
  assert.equal(result.reviewRowsByYear.get(2016)?.[0].demCandidate, "Hillary Clinton");
});

test("rejects a current review row carrying a historical election year", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [reviewRow({ electionYear: 2020 })],
      electionYear: 2024,
      knownSourceIds,
    }),
    /Current review row .* targets 2020; expected 2024/,
  );
});

test("rejects a historical review row carrying the current election year", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [],
      electionYear: 2024,
      historicalRows: [reviewRow({ electionYear: 2024 })],
      knownSourceIds,
    }),
    /Historical review row .* targets the current election year 2024/,
  );
});

test("rejects a historical review row carrying a future election year", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [],
      electionYear: 2024,
      historicalRows: [reviewRow({ electionYear: 2028 })],
      knownSourceIds,
    }),
    /targets future year 2028; expected a year before 2024/,
  );
});

test("rejects a missing primary source before promotion writes", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [reviewRow({ sourceId: "" })],
      electionYear: 2024,
      knownSourceIds,
    }),
    /is missing its primary source id/,
  );
});

test("rejects an unknown primary source", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [reviewRow({ sourceId: "unknown-presidential-source" })],
      electionYear: 2024,
      knownSourceIds,
    }),
    /references unknown source unknown-presidential-source/,
  );
});

test("rejects an unknown comparison source", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [reviewRow({ comparisonSourceId: "unknown-senate-source" })],
      electionYear: 2024,
      knownSourceIds,
    }),
    /references unknown source unknown-senate-source/,
  );
});

test("does not add an omitted historical year to the replacement set", () => {
  const result = partitionReviewRowsForPromotion({
    currentRows: [reviewRow()],
    electionYear: 2024,
    historicalRows: [reviewRow({ electionYear: 2016 })],
    knownSourceIds,
  });

  assert.deepEqual(result.historicalReviewYears, [2016]);
  assert.equal(result.reviewRowsByYear.has(2020), false);
});

test("produces no historical replacement years when historical rows are absent", () => {
  const result = partitionReviewRowsForPromotion({
    currentRows: [reviewRow()],
    electionYear: 2024,
    knownSourceIds,
  });

  assert.deepEqual(result.historicalReviewYears, []);
  assert.deepEqual(Array.from(result.reviewRowsByYear.keys()), [2024]);
});
test("rejects unknown non-review sources before promotion writes", () => {
  const cases = [
    [{ resultRows: [{ sourceId: "unknown-result" }] }, /Result row references unknown source unknown-result/],
    [{ turnoutRows: [{ sourceId: "unknown-turnout" }] }, /Turnout row references unknown source unknown-turnout/],
    [{ historicalRows: [{ sourceDocumentId: "unknown-history", sourceId: "raw-history" }] }, /Historical result row references unknown source unknown-history/],
  ];

  for (const [rows, expected] of cases) {
    assert.throws(
      () => validateNativeSourceReferences({ ...rows, knownSourceIds }),
      expected,
    );
  }
  assert.throws(
    () => validateNativeSourceReferences({ knownSourceIds: ["duplicate", "duplicate"] }),
    /duplicate source ids/,
  );
});

test("rejects an unknown presidential-participation proxy source", () => {
  assert.throws(
    () => partitionReviewRowsForPromotion({
      currentRows: [reviewRow({
        presidentialParticipationProxy: { sourceId: "unknown-registration-source" },
      })],
      electionYear: 2024,
      knownSourceIds,
    }),
    /references unknown source unknown-registration-source/,
  );
});

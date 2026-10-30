import assert from "node:assert/strict";
import test from "node:test";
import { compactWorkspaceReviewRows } from "../../src/lib/workspace-review-payload.ts";

const row = {
  id: "review-test",
  state: "WA",
  electionYear: 2024,
  jurisdictionCode: "53033",
  jurisdictionName: "King",
  jurisdictionTag: "county:53033",
  localUnit: "Example precinct",
  level: "precinct",
  demCandidate: "Candidate D",
  repCandidate: "Candidate R",
  demVotes: 60,
  repVotes: 40,
  demShare: 60,
  repShare: 40,
  harrisVotes: 60,
  trumpVotes: 40,
  totalVotes: 100,
  harrisShare: 60,
  trumpShare: 40,
  demDropoff: null,
  repDropoff: null,
  reportingUnitId: "unit-test",
  sourceId: "source-test",
  metrics: {
    coverageMode: "voteShareOnly",
    comparisonContest: "U.S. Senate",
    presidentialParticipationProxy: {
      numerator: 100,
      denominator: 125,
      valuePct: 80,
      sourceId: "source-test",
      note: "Advisory participation proxy, not registered-voter turnout.",
    },
    normalizedSourceRow: "x".repeat(4000),
    totalVotes: 100,
  },
};

test("public workspace tabs retain every review field and the consumed metric labels", () => {
  for (const tab of ["map", "review", "methodology", "exports", "data"]) {
    const [compact] = compactWorkspaceReviewRows([row], tab);
    assert.deepEqual({ ...compact, metrics: row.metrics }, row);
    assert.deepEqual(compact.metrics, {
      coverageMode: "voteShareOnly",
      comparisonContest: "U.S. Senate",
    });
    assert.notEqual(compact, row);
    assert.notEqual(compact.metrics, row.metrics);
  }
});

test("History retains participation calculations, source caveats, and reporting identity", () => {
  const [compact] = compactWorkspaceReviewRows([row], "history");
  assert.deepEqual(compact.metrics.presidentialParticipationProxy, row.metrics.presidentialParticipationProxy);
  assert.equal(compact.reportingUnitId, row.reportingUnitId);
  assert.equal(compact.sourceId, row.sourceId);
  assert.equal(compact.metrics.coverageMode, row.metrics.coverageMode);
});

test("compaction does not mutate cached API rows or add unsupported metric values", () => {
  const original = structuredClone(row);
  compactWorkspaceReviewRows([row], "map");
  assert.deepEqual(row, original);
  assert.deepEqual(compactWorkspaceReviewRows([], "map"), []);
  const [compact] = compactWorkspaceReviewRows([{ ...row, metrics: { coverageMode: 1 } }], "map");
  assert.deepEqual(compact.metrics, {});
});

test("large duplicated source metadata is not serialized into browser props", () => {
  const compact = compactWorkspaceReviewRows([row], "map");
  assert.ok(JSON.stringify(compact).length < JSON.stringify([row]).length / 4);
  assert.equal(JSON.stringify(compact).includes("normalizedSourceRow"), false);
});

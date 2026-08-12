import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeResultRowSummary,
  PRIVACY_SUPPRESSED_TOTAL_LABEL,
  resultOutcomeDescription,
  resultOutcomeKind,
  resultWinnerLabel,
} from "../../src/lib/result-row-summary.ts";
import {
  PRIVACY_SUPPRESSED_TOTAL_LABEL as PLAN_SUPPRESSED_TOTAL_LABEL,
} from "../../scripts/lib/nv-precinct-gis-plan.mjs";

function sourceRow(overrides = {}) {
  return {
    state: "NV",
    year: 2024,
    office: "president",
    level: "precinct",
    jurisdictionCode: "reporting:NV:2024-11-05-general:precinct:32003:1002",
    jurisdictionName: "1002",
    votes: { [PRIVACY_SUPPRESSED_TOTAL_LABEL]: 4 },
    totalVotes: 0,
    marginVotes: 0,
    marginPct: 0,
    winner: "",
    sourceId: "nv-2024-sos-president-precinct-results",
    resultStatus: "candidate_detail_suppressed",
    reportedRegistration: 0,
    reportedTurnout: 4,
    ...overrides,
  };
}

test("Nevada suppressed precinct keeps its exact total without inventing a winner", () => {
  assert.equal(PRIVACY_SUPPRESSED_TOTAL_LABEL, PLAN_SUPPRESSED_TOTAL_LABEL);
  const result = finalizeResultRowSummary(sourceRow());

  assert.equal(result.totalVotes, 4);
  assert.equal(result.winner, "");
  assert.equal(result.marginVotes, 0);
  assert.equal(result.marginPct, 0);
  assert.equal(resultOutcomeKind(result), "privacy_suppressed");
  assert.equal(
    resultOutcomeDescription(result),
    "4 total votes reported; candidate detail suppressed",
  );
  assert.equal(resultWinnerLabel(result), "Candidate detail suppressed");
});

test("Nevada suppressed precinct rejects a fabricated candidate allocation", () => {
  assert.throws(
    () => finalizeResultRowSummary(sourceRow({
      votes: { Harris: 2, Trump: 2 },
    })),
    /one exact reported-total row/,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import XLSX from "xlsx";
import {
  finalizeResultRowSummary,
  resultOutcomeDescription,
  resultOutcomeKind,
  resultWinnerLabel,
} from "../../src/lib/result-row-summary.ts";

const otherColumns = [
  "USPRSLIB",
  "USPRSWTP",
  "USPRSG",
  "USPRSSLP",
  "USPRSSWP",
  "USPRSJFA",
  "USPRSIND",
  "USPRSWI",
];

function number(value) {
  const parsed = Number(value ?? 0);
  assert.ok(Number.isFinite(parsed));
  return parsed;
}

test("all 28 official Minnesota zero-vote precincts remain no-vote outcomes", () => {
  const workbook = XLSX.read(
    readFileSync(
      "data/mn-2024-general-federal-state-results-by-precinct-official.xlsx",
    ),
    { type: "buffer" },
  );
  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets["Precinct-Results"],
    { defval: "", raw: true },
  );
  const zeroVoteRows = rows.filter(
    (row) =>
      /^27[0-9]{7}$/.test(String(row.VTDID))
      && number(row.USPRSTOTAL) === 0,
  );

  assert.equal(zeroVoteRows.length, 28);
  assert.equal(new Set(zeroVoteRows.map((row) => String(row.VTDID))).size, 28);

  for (const sourceRow of zeroVoteRows) {
    const votes = {
      Harris: number(sourceRow.USPRSDFL),
      Trump: number(sourceRow.USPRSR),
      Other: otherColumns.reduce(
        (sum, column) => sum + number(sourceRow[column]),
        0,
      ),
    };
    assert.equal(Object.values(votes).reduce((sum, value) => sum + value, 0), 0);

    const result = finalizeResultRowSummary({
      state: "MN",
      year: 2024,
      office: "president",
      level: "precinct",
      jurisdictionCode:
        "reporting:MN:2024-11-05-general:precinct:"
        + String(sourceRow.VTDID).slice(0, 5)
        + ":"
        + String(sourceRow.VTDID),
      jurisdictionName: String(sourceRow.PCTNAME),
      votes,
      totalVotes: 0,
      marginVotes: 0,
      marginPct: 0,
      winner: "Harris",
      sourceId: "mn-2024-precinct-results",
    });

    assert.equal(result.totalVotes, 0);
    assert.equal(result.winner, "");
    assert.equal(result.marginVotes, 0);
    assert.equal(result.marginPct, 0);
    assert.equal(resultOutcomeKind(result), "no_votes");
    assert.equal(resultOutcomeDescription(result), "no votes reported");
    assert.equal(resultWinnerLabel(result), "No votes reported");
  }
});

test("positive exact ties are not assigned to an alphabetic candidate", () => {
  const result = finalizeResultRowSummary({
    state: "MN",
    year: 2024,
    office: "president",
    level: "precinct",
    jurisdictionCode: "example-tie",
    jurisdictionName: "Example Tie",
    votes: { Alpha: 10, Zulu: 10 },
    totalVotes: 20,
    marginVotes: 0,
    marginPct: 0,
    winner: "Alpha",
    sourceId: "test",
  });

  assert.equal(result.winner, "Tie");
  assert.equal(resultOutcomeKind(result), "tie");
  assert.equal(resultOutcomeDescription(result), "tie");
});
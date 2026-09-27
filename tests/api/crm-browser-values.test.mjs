import assert from "node:assert/strict";
import test from "node:test";
import { compareDisplayedRows, expectedDisplayRows } from "../../tools/civicresultmaps-mcp/browser-values.ts";

const currentRows = [
  { state: "WI", year: 2024, level: "county", jurisdictionCode: "001", jurisdictionName: "Alpha County", jurisdictionTag: "county:55001", votes: { Harris: 100, Trump: 90, "Write-in": 10 }, totalVotes: 200, winner: "Harris", marginVotes: 10, marginPct: 5 },
  { state: "WI", year: 2024, level: "county", jurisdictionCode: "003", jurisdictionName: "Zero County", jurisdictionTag: "county:55003", votes: { Harris: 0, Trump: 0, "Write-in": 0 }, totalVotes: 0, winner: "", marginVotes: 0, marginPct: 0 },
  { state: "WI", year: 2024, level: "county", jurisdictionCode: "005", jurisdictionName: "Tie County", jurisdictionTag: "county:55005", votes: { Harris: 50, Trump: 50 }, totalVotes: 100, winner: "Tie", marginVotes: 0, marginPct: 0 },
];

test("expected browser rows use all-candidate totals, margins, zero votes, and ties", () => {
  const expected = expectedDisplayRows(currentRows, "WI", 2024);
  assert.deepEqual(expected.map((row) => row.cells), [
    { jurisdictionName: "Alpha County", winner: "Harris", demVotes: "100", repVotes: "90", totalVotes: "200", margin: "10 (5.00%)" },
    { jurisdictionName: "Zero County", winner: "", demVotes: "0", repVotes: "0", totalVotes: "0", margin: "0 (0.00%)" },
    { jurisdictionName: "Tie County", winner: "Tie", demVotes: "50", repVotes: "50", totalVotes: "100", margin: "0 (0.00%)" },
  ]);
  assert.equal(expected[0].tag, "county:55001");
});

test("expected historical rows map candidate names by year and preserve all-candidate denominator", () => {
  const historical = [
    { state: "WI", electionYear: 2012, sourceLevel: "county", jurisdictionCode: "001", jurisdictionName: "Alpha County", jurisdictionTag: "county:55001", localUnit: "Alpha County", demVotes: 40, repVotes: 60, otherVotes: 10, totalVotes: 110, sourceId: "source", sourceDocumentId: "source" },
    { state: "WI", electionYear: 2016, sourceLevel: "county", jurisdictionCode: "003", jurisdictionName: "Beta County", jurisdictionTag: "county:55003", localUnit: "Beta County", demVotes: 60, repVotes: 40, otherVotes: 0, totalVotes: 100, sourceId: "source", sourceDocumentId: "source" },
    { state: "WI", electionYear: 2020, sourceLevel: "county", jurisdictionCode: "005", jurisdictionName: "Gamma County", jurisdictionTag: "county:55005", localUnit: "Gamma County", demVotes: 55, repVotes: 45, otherVotes: 5, totalVotes: 105, sourceId: "source", sourceDocumentId: "source" },
  ];
  assert.equal(expectedDisplayRows(historical, "WI", 2012)[0].cells.winner, "Romney");
  assert.equal(expectedDisplayRows(historical, "WI", 2012)[0].cells.demVotes, "40");
  assert.equal(expectedDisplayRows(historical, "WI", 2012)[0].cells.repVotes, "60");
  assert.equal(expectedDisplayRows(historical, "WI", 2012)[0].cells.totalVotes, "110");
  assert.equal(expectedDisplayRows(historical, "WI", 2016)[0].cells.winner, "Clinton");
  assert.equal(expectedDisplayRows(historical, "WI", 2020)[0].cells.winner, "Biden");
});

test("expected browser rows reject wrong scope, duplicate identity, and inconsistent arithmetic", () => {
  assert.throws(() => expectedDisplayRows([{ ...currentRows[0], state: "MN" }], "WI", 2024), /ambiguous_expected_display_identity/);
  assert.throws(() => expectedDisplayRows([currentRows[0], { ...currentRows[0], jurisdictionCode: "001" }], "WI", 2024), /ambiguous_expected_display_identity/);
  assert.throws(() => expectedDisplayRows([{ ...currentRows[0], totalVotes: 199 }], "WI", 2024), /inconsistent_expected_total/);
  assert.throws(() => expectedDisplayRows([{ ...currentRows[0], marginVotes: 9 }], "WI", 2024), /inconsistent_expected_outcome/);
});

test("DOM comparison catches wrong numbers despite matching row counts and only trusts visible text cells", () => {
  const expected = expectedDisplayRows(currentRows, "WI", 2024);
  const actual = { state: "WI", year: "2024", rows: expected.map((row) => ({ code: row.code, tag: row.tag, cells: { ...row.cells, demVotes: row.code === "001" ? "99" : row.cells.demVotes }, hiddenNumericValue: row.cells.demVotes })) };
  const report = compareDisplayedRows(expected, actual, "WI", 2024);
  assert.equal(report.status, "fail");
  assert.equal(report.expectedRows, report.displayedRows);
  assert.ok(report.problems.some((problem) => problem.reason === "displayed_value_mismatch" && problem.field === "demVotes"));
  assert.equal(report.comparedCells, expected.length * Object.keys(expected[0].cells).length);
});

test("DOM comparison rejects wrong state/year/tag, missing, extra, and duplicate rows", () => {
  const expected = expectedDisplayRows(currentRows, "WI", 2024);
  const validCells = (code) => expected.find((row) => row.code === code).cells;
  const actual = {
    state: "MN", year: "2020", rows: [
      { code: "001", tag: "county:55099", cells: validCells("001") },
      { code: "001", tag: "county:55001", cells: validCells("001") },
      { code: "999", tag: "county:55999", cells: validCells("001") },
    ],
  };
  const report = compareDisplayedRows(expected, actual, "WI", 2024);
  assert.equal(report.status, "fail");
  assert.ok(report.problems.some((problem) => problem.reason === "displayed_state_year_mismatch"));
  assert.ok(report.problems.some((problem) => problem.reason === "displayed_tag_mismatch"));
  assert.ok(report.problems.some((problem) => problem.reason === "unexpected_or_duplicate_display_row" && problem.code === "001"));
  assert.ok(report.problems.some((problem) => problem.reason === "unexpected_or_duplicate_display_row" && problem.code === "999"));
  assert.ok(report.problems.some((problem) => problem.reason === "missing_display_rows"));
});

test("missing DOM evidence is inconclusive rather than a fake pass", () => {
  const expected = expectedDisplayRows(currentRows, "WI", 2024);
  const report = compareDisplayedRows(expected, { state: "WI", year: "2024", rows: [] }, "WI", 2024);
  assert.equal(report.status, "inconclusive");
  assert.equal(report.reason, "numeric_dom_contract_unavailable");
  assert.equal(report.expectedRows, expected.length);
});

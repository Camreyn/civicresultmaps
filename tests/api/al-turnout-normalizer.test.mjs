import assert from "node:assert/strict";
import test from "node:test";
import {
  activeVotersByCountyFromRows,
  buildTurnoutLeadRows,
} from "../../scripts/normalize-al-sos-results.mjs";

const headerRows = [["ALVR"], ["November"], ["County", "Active voters"]];

test("matches the ALVR ST_CLAIR key to the St. Clair result county", () => {
  const activeVoters = activeVotersByCountyFromRows([
    ...headerRows,
    ["ST_CLAIR", 72796],
    ["TOTAL", 72796],
  ]);
  const rows = buildTurnoutLeadRows([{ county: "St. Clair", ballotsCast: 43621 }], activeVoters);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].november_active_registered_voters, 72796);
});

test("rejects blank or malformed ALVR active-voter values", () => {
  for (const value of ["", "N/A", 0, -1, 72.5]) {
    assert.throws(
      () => activeVotersByCountyFromRows([...headerRows, ["ST_CLAIR", value]]),
      /must be a positive integer/,
    );
  }
});

test("rejects duplicate normalized county keys", () => {
  assert.throws(
    () =>
      activeVotersByCountyFromRows([
        ...headerRows,
        ["ST_CLAIR", 72796],
        ["St. Clair", 72796],
      ]),
    /Duplicate ALVR county key/,
  );
});

test("rejects result counties missing from the ALVR workbook", () => {
  const activeVoters = activeVotersByCountyFromRows([...headerRows, ["AUTAUGA", 42519]]);
  assert.throws(
    () => buildTurnoutLeadRows([{ county: "St. Clair", ballotsCast: 43621 }], activeVoters),
    /Missing November ALVR active-voter values for: St\. Clair/,
  );
});

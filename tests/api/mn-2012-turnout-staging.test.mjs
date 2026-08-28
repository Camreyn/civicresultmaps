import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MINNESOTA_2012_TURNOUT_EXPECTED,
  MINNESOTA_2012_TURNOUT_SOURCE,
  minnesota2012TurnoutFields,
  parseMinnesota2012TurnoutRows,
} from "../../scripts/lib/mn-2012-turnout.mjs";

test("Minnesota 2012 turnout uses 7AM plus EDR", () => {
  assert.deepEqual(
    minnesota2012TurnoutFields({ "7AM": "100", EDR: "20", TOTVOTING: "121" }),
    {
      registeredVotersPreElection: 100,
      electionDayRegistrations: 20,
      registeredVoters: 120,
      ballotsCast: 121,
      turnoutPct: 100.8333,
      warningRequired: true,
    },
  );
  assert.throws(
    () => minnesota2012TurnoutFields({ REG7AM: "100", EDR: "20", TOTVOTING: "90" }),
    /missing required turnout field 7AM/,
  );
});

test("Minnesota 2012 turnout rows preserve exact components and VTD identities", () => {
  const sourceRows = [
    {
      VTDID: "270010001",
      COUNTYNAME: "Aitkin",
      MCDNAME: "Aitkin City",
      PCTNAME: "Precinct 1",
      PCTCODE: "1",
      "7AM": "100",
      EDR: "20",
      TOTVOTING: "121",
    },
    {
      VTDID: "270030001",
      COUNTYNAME: "Anoka",
      MCDNAME: "Anoka City",
      PCTNAME: "Precinct 1",
      PCTCODE: "1",
      "7AM": "200",
      EDR: "0",
      TOTVOTING: "150",
    },
  ];
  const parsed = parseMinnesota2012TurnoutRows(sourceRows, {
    rows: 2,
    parentCount: 2,
    registeredVotersPreElection: 300,
    electionDayRegistrations: 20,
    registeredVoters: 320,
    ballotsCast: 271,
    warningRows: 1,
    turnoutPct: 84.6875,
  });

  assert.equal(parsed.parentCount, 2);
  assert.equal(parsed.rows[0].reportingUnit.sourceUnitId, "270010001");
  assert.equal(parsed.rows[0].reportingUnit.parentGeoid, "27001");
  assert.equal(parsed.rows[0].registeredVotersPreElection, 100);
  assert.equal(parsed.rows[0].electionDayRegistrations, 20);
  assert.equal(parsed.rows[0].registeredVoters, 120);
  assert.equal(parsed.rows[0].warningRequired, true);
  assert.match(parsed.rows[0].registrationDenominatorTiming, /7AM pre-election registration \(100\).*EDR election-day registrations \(20\)/);
});

test("Minnesota 2012 turnout source and statewide controls are pinned", () => {
  assert.equal(MINNESOTA_2012_TURNOUT_SOURCE.sheetName, "Results");
  assert.equal(
    MINNESOTA_2012_TURNOUT_SOURCE.sha256,
    "9a7530cfef9e44f8663c62bf5786418b4b078d81fd13e2d130fbd8ef305ee376",
  );
  assert.deepEqual(MINNESOTA_2012_TURNOUT_EXPECTED, {
    rows: 4_102,
    parentCount: 87,
    registeredVotersPreElection: 3_084_025,
    electionDayRegistrations: 527_867,
    registeredVoters: 3_611_892,
    ballotsCast: 2_950_780,
    warningRows: 20,
    turnoutPct: 81.6962,
  });

  const builder = readFileSync("scripts/lib/mn-2012-turnout.mjs", "utf8");
  assert.match(builder, /productionWriteAllowed: false/);
  assert.match(builder, /resultRows: \[\]/);
  assert.match(builder, /reviewRows: \[\]/);
  assert.match(builder, /historicalRows: \[\]/);
});

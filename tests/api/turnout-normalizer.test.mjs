import assert from "node:assert/strict";
import { normalizeEacTurnoutRows, parseCsv } from "../../scripts/normalize-eac-turnout.mjs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("EAC normalizer maps common turnout columns", () => {
  const rows = parseCsv("State,County,Total Ballots Cast,Registered Voters\nAZ,Maricopa,200,250\nWI,Dane,210,300\n");
  const normalized = normalizeEacTurnoutRows(rows, { state: "AZ", year: 2024 });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].state, "AZ");
  assert.equal(normalized[0].jurisdiction_name, "Maricopa");
  assert.equal(normalized[0].ballots_cast, "200");
  assert.equal(normalized[0].registered_voters, "250");
  assert.equal(normalized[0].turnout_pct, "80.0000");
  assert.equal(normalized[0].warning_required, "false");
});

test("EAC normalizer keeps Wisconsin jurisdiction metadata", () => {
  const rows = parseCsv("FIPSCode,Jurisdiction_Name,State_Abbr,A1a,F1a\n00100,CITY OF ADAMS - ADAMS COUNTY,WI,1200,900\n");
  const normalized = normalizeEacTurnoutRows(rows, { sourceStatus: "loaded", state: "WI", year: 2024 });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].jurisdiction_code, "00100");
  assert.equal(normalized[0].county, "ADAMS COUNTY");
  assert.equal(normalized[0].local_unit, "CITY OF ADAMS - ADAMS COUNTY");
  assert.equal(normalized[0].source_status, "loaded");
});

test("EAC normalizer warning-gates missing denominators", () => {
  const rows = parseCsv("State,Jurisdiction,Total Voters,Registered Voters\nNV,Clark County,10,0\n");
  const normalized = normalizeEacTurnoutRows(rows, { year: 2024 });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].registered_voters, "0");
  assert.equal(normalized[0].turnout_pct, "");
  assert.equal(normalized[0].warning_required, "true");
});
test("EAC normalizer warning-gates negative sentinel turnout values", () => {
  const rows = parseCsv("State,Jurisdiction,Total Voters,Registered Voters\nUT,Cache County,-99,81455\n");
  const normalized = normalizeEacTurnoutRows(rows, { year: 2024 });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].ballots_cast, "");
  assert.equal(normalized[0].registered_voters, "81455");
  assert.equal(normalized[0].turnout_pct, "");
  assert.equal(normalized[0].warning_required, "true");
});

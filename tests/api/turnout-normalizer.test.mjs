import assert from "node:assert/strict";
import { normalizeEacTurnoutRows, parseCsv } from "../../scripts/normalize-eac-turnout.mjs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("EAC normalizer maps common turnout columns", () => {
  const rows = parseCsv("State,County,Total Ballots Cast,Registered Voters\nAZ,Maricopa,200,250\n");
  const normalized = normalizeEacTurnoutRows(rows, { year: 2024 });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].state, "AZ");
  assert.equal(normalized[0].jurisdiction_name, "Maricopa");
  assert.equal(normalized[0].ballots_cast, "200");
  assert.equal(normalized[0].registered_voters, "250");
  assert.equal(normalized[0].turnout_pct, "80.0000");
  assert.equal(normalized[0].warning_required, "false");
});

test("EAC normalizer warning-gates missing denominators", () => {
  const rows = parseCsv("State,Jurisdiction,Total Voters\nNV,Clark County,10\n");
  const normalized = normalizeEacTurnoutRows(rows, { year: 2024 });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].registered_voters, "");
  assert.equal(normalized[0].turnout_pct, "");
  assert.equal(normalized[0].warning_required, "true");
});

import assert from "node:assert/strict";
import { normalizeEacVoteMethodRows } from "../../scripts/normalize-eac-vote-methods.mjs";
import { parseCsv } from "../../scripts/normalize-eac-turnout.mjs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("EAC vote method normalizer expands F1 fields to long rows", () => {
  const rows = parseCsv(
    [
      "FIPSCode,Jurisdiction_Name,State_Abbr,F1a,F1b,F1c,F1d,F1e,F1f,F1g,F1h",
      "001,Alpha County,AZ,100,50,5,30,-88,15,,0",
    ].join("\n"),
  );
  const normalized = normalizeEacVoteMethodRows(rows, { sourceStatus: "loaded", state: "AZ", year: 2024 });

  assert.equal(normalized.length, 7);
  assert.equal(normalized[0].method, "physical_polling_place");
  assert.equal(normalized[0].voters, "50");
  assert.equal(normalized[0].method_share_pct, "50.0000");
  assert.equal(normalized[0].source_status, "loaded");

  const provisional = normalized.find((row) => row.method === "provisional_ballot");
  assert.equal(provisional.value_status, "unavailable");
  assert.equal(provisional.voters, "");

  const other = normalized.find((row) => row.method === "other_participation");
  assert.equal(other.value_status, "reported");
  assert.equal(other.voters, "0");
});

test("EAC vote method normalizer filters to requested state", () => {
  const rows = parseCsv(
    [
      "FIPSCode,Jurisdiction_Name,State_Abbr,F1a,F1b,F1c,F1d,F1e,F1f,F1g,F1h",
      "001,Alpha County,AZ,100,50,5,30,0,15,,0",
      "002,Beta County,NV,200,100,10,50,0,40,,0",
    ].join("\n"),
  );
  const normalized = normalizeEacVoteMethodRows(rows, { state: "NV", year: 2024 });

  assert.equal(normalized.length, 7);
  assert.equal(normalized[0].state, "NV");
  assert.equal(normalized[0].jurisdiction_name, "Beta County");
});

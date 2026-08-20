import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Florida historical baseline records pinned official DOS precinct ZIP aggregates", () => {
  const rows = readFileSync("data/fl-historical-presidential-baseline.csv", "utf8").trim().split(/\r?\n/);
  assert.equal(rows.length, 202);
  assert.match(rows[1], /^FL,2012,Alachua County,/);
  assert.match(rows.at(-1), /^FL,2020,Washington County,/);

  const review = JSON.parse(readFileSync("data/fl-historical-precinct-source-review.json", "utf8"));
  assert.equal(review.sourceAuthority, "Florida Department of State, Division of Elections");
  assert.equal(review.rowCount, 201);
  assert.deepEqual(review.sources.map((source) => [source.year, source.expected.countyRows, source.expected.total]), [
    [2012, 67, 8492336],
    [2016, 67, 9498093],
    [2020, 67, 11090844],
  ]);
  assert.equal(review.sources[0].registrationContext.aggregate, 16377020);
  assert.equal(review.sources[1].registrationContext.aggregate, null);
  assert.equal(review.sources[1].registrationContext.ambiguousSourceUnitCount, 66);
  assert.equal(review.sources[1].duplicateCandidateRule.sourceUnitCount, 21);
  assert.equal(review.sources[1].duplicateCandidateRule.discardedRowCount, 107);
  assert.deepEqual(review.sources[1].duplicateCandidateRule.sourceUnitIds, [
    "1173", "1189", "1247", "2081", "2083", "2097", "2116", "2126", "4129", "5003", "5007",
    "5018", "5055", "5112", "5113", "5115", "5117", "5119", "6029", "6207", "7149",
  ]);
  assert.equal(review.sources[1].independentCertifiedReconciliation.status, "not_performed_no_separate_artifact_retained");
  assert.equal(review.sources[2].registrationContext.aggregate, 14069165);
});

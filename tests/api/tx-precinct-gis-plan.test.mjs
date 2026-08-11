import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTexasPrecinctGisPlan,
  summarizeTexasPrecinctGisPlan,
} from "../../scripts/lib/tx-precinct-gis-plan.mjs";

const plan = await buildTexasPrecinctGisPlan();
const summary = summarizeTexasPrecinctGisPlan(plan);

test("Texas plan joins every tracked VTD to a public precinct-grain identity", () => {
  assert.deepEqual(
    summary.years.map((year) => ({
      year: year.year,
      units: year.reportingUnits,
      rows: year.resultRows,
      zero: year.zeroVoteUnits,
      total: year.totals.Total,
    })),
    [
      { year: 2012, units: 8952, rows: 26856, zero: 278, total: 7997303 },
      { year: 2016, units: 8941, rows: 26823, zero: 285, total: 8981860 },
      { year: 2020, units: 9157, rows: 27471, zero: 353, total: 11317052 },
      { year: 2024, units: 9712, rows: 29136, zero: 364, total: 11404528 },
    ],
  );
  for (const year of plan.years) {
    assert.equal(year.manifest.geography.level, "precinct");
    assert.equal(year.manifest.geography.vintageStatus, "election_date_confirmed");
    assert.equal(year.reportingUnits.length, year.geometry.features.length);
    assert.equal(year.reportingUnits.length, year.geometry.crosswalks.length);
    assert.equal(new Set(year.reportingUnits.map((unit) => unit.parentGeoid)).size, 254);
    assert.ok(year.reportingUnits.every((unit) =>
      unit.code.startsWith(
        "reporting:TX:" + year.electionId + ":precinct:",
      )));
    assert.ok(year.geometry.crosswalks.every((row) =>
      row.relationshipType === "one_to_one"
      && row.matchMethod === "official_crosswalk"
      && row.reviewStatus === "reviewed"
      && row.confidence === "high"));
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = JSON.parse(readFileSync("data/wi-2024-review-reconciliation.json", "utf8"));

test("Wisconsin reconciliation preserves current county counts and explains the legacy 70", () => {
  assert.equal(report.state, "WI");
  assert.equal(report.year, 2024);
  assert.equal(report.summary.currentCountyIndicatorRows, 107);
  assert.equal(report.summary.currentUniqueFlaggedCounties, 67);
  assert.equal(report.summary.legacyUniqueFlaggedCounties, 70);
  assert.deepEqual(report.summary.oldOnlyCounties, ["Eau Claire", "Outagamie", "Ozaukee", "Walworth"]);
  assert.deepEqual(report.summary.currentOnlyCounties, ["Florence"]);
  assert.match(report.explanation.sourceRowNormalization, /normalized WEC ward rows/);
  assert.match(report.explanation.senateComparisonMath, /U\.S\. Senate/);
  assert.match(report.explanation.rowInclusion, /Florence/);
});

test("Wisconsin metric deltas cover the known reconciliation counties", () => {
  const deltas = new Map(report.metricDeltas.map((entry) => [entry.county, entry]));

  for (const county of ["Walworth", "Eau Claire", "Ozaukee", "Outagamie", "Florence"]) {
    assert.equal(deltas.has(county), true, `${county} should have a metric delta entry`);
  }

  assert.equal(deltas.get("Florence").current.flags.includes("average_down_ballot_difference"), true);
  assert.deepEqual(deltas.get("Florence").legacy.flags, []);
  assert.match(deltas.get("Florence").explanation, /minWardRows=8/);

  for (const county of ["Walworth", "Eau Claire", "Ozaukee", "Outagamie"]) {
    assert.deepEqual(deltas.get(county).current.flags, []);
    assert.deepEqual(deltas.get(county).legacy.flags, ["average_down_ballot_difference"]);
    assert.match(deltas.get(county).explanation, /source row normalization and Senate comparison math delta/);
  }
});
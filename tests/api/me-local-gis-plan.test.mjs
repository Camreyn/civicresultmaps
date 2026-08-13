import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMaineLocalGisPlan,
  summarizeMaineLocalGisPlan,
} from "../../scripts/lib/me-local-gis-plan.mjs";

const plan = await buildMaineLocalGisPlan();
const summary = summarizeMaineLocalGisPlan(plan);

test("Maine plan preserves three exact public-candidate universes", () => {
  assert.deepEqual(summary.years.map((year) => ({
    year: year.year,
    units: year.reportingUnits,
    rows: year.resultRows,
    features: year.geometryFeatures,
    relationships: year.reviewedCrosswalks,
    total: year.totals.Total,
    sourceGatePassed: year.sourceGatePassed,
  })), [
    { year: 2016, units: 532, rows: 1596, features: 532, relationships: 532, total: 743941, sourceGatePassed: true },
    { year: 2020, units: 516, rows: 1548, features: 516, relationships: 516, total: 813742, sourceGatePassed: true },
    { year: 2024, units: 494, rows: 1482, features: 494, relationships: 494, total: 824806, sourceGatePassed: true },
  ]);
});

test("Maine loadable years use exact county-scoped one-to-one relationships", () => {
  for (const year of plan.years) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 16);
    assert.ok(year.reportingUnits.every((unit) =>
      unit.reportingGrain === "local_reporting_unit"
      && /^23\d{3}$/.test(unit.parentGeoid)));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.relationshipType === "one_to_one"
      && relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"));
    assert.equal(year.resultRows.length, year.reportingUnits.length * 3);
  }
});

test("Maine plan rejects the separately blocked 2012 package", async () => {
  await assert.rejects(
    buildMaineLocalGisPlan({ years: [2012] }),
    /2012 remains blocked and cannot be loaded/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIowaPrecinctGisPlan,
  summarizeIowaPrecinctGisPlan,
} from "../../scripts/lib/ia-precinct-gis-plan.mjs";
import { buildIowaPrecinctReleaseReadiness } from "../../scripts/lib/ia-precinct-release-readiness.mjs";

const plan = await buildIowaPrecinctGisPlan();
const summary = summarizeIowaPrecinctGisPlan(plan);

test("Iowa plan preserves all four exact result and geometry universes", () => {
  assert.deepEqual(summary.years.map((year) => ({
    year: year.year,
    units: year.reportingUnits,
    rows: year.resultRows,
    features: year.geometryFeatures,
    relationships: year.reviewedCrosswalks,
    total: year.totals.Total,
    sourceGatePassed: year.sourceGatePassed,
  })), [
    { year: 2012, units: 1686, rows: 5058, features: 0, relationships: 0, total: 1582180, sourceGatePassed: false },
    { year: 2016, units: 1680, rows: 5040, features: 1680, relationships: 1680, total: 1566031, sourceGatePassed: true },
    { year: 2020, units: 1661, rows: 4983, features: 1661, relationships: 1661, total: 1690871, sourceGatePassed: true },
    { year: 2024, units: 1653, rows: 4959, features: 1653, relationships: 1653, total: 1663506, sourceGatePassed: true },
  ]);
});

test("Iowa loadable years use exact county-scoped one-to-one relationships", () => {
  for (const year of plan.years.slice(1)) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 99);
    assert.ok(year.reportingUnits.every((unit) => /^19\d{3}$/.test(unit.parentGeoid)));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.relationshipType === "one_to_one"
      && relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"));
    assert.equal(year.resultRows.length, year.reportingUnits.length * 3);
  }
});

test("Iowa readiness isolates only the incomplete 2012 boundary archive", async () => {
  const readiness = await buildIowaPrecinctReleaseReadiness({ plan });
  assert.equal(readiness.decision, "NO_GO_ALL_FOUR_PUBLIC_RELEASE");
  assert.deepEqual(readiness.years.filter((year) => !year.sourceGatePassed).map((year) => year.year), [2012]);
  assert.equal(readiness.years.find((year) => year.year === 2012).externalRequest.contact, null);
  assert.match(readiness.requiredNextActions.join(" "), /no-email archive/i);
  for (const year of [2016, 2020, 2024]) {
    assert.equal(readiness.years.find((entry) => entry.year === year).externalRequest, null);
  }
});

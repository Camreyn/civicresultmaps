import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNevadaPrecinctGisPlan,
  summarizeNevadaPrecinctGisPlan,
} from "../../scripts/lib/nv-precinct-gis-plan.mjs";
import { buildNevadaPrecinctReleaseReadiness } from "../../scripts/lib/nv-precinct-release-readiness.mjs";

const plan = await buildNevadaPrecinctGisPlan();
const summary = summarizeNevadaPrecinctGisPlan(plan);

test("Nevada plan preserves exact four-election result, geometry, and suppression counts", () => {
  assert.deepEqual(summary.years.map((year) => ({
    year: year.year,
    units: year.reportingUnits,
    rows: year.resultRows,
    zero: year.zeroVoteUnits,
    features: year.geometryFeatures,
    relationships: year.reviewedCrosswalks,
    noData: year.reviewedNoDataFeatures,
    total: year.totals.Total,
    sourceGatePassed: year.sourceGatePassed,
    eligible: year.publicReleaseEligible,
  })), [
    { year: 2012, units: 1760, rows: 5280, zero: 177, features: 2002, relationships: 1760, noData: 242, total: 1005652, sourceGatePassed: false, eligible: false },
    { year: 2016, units: 1843, rows: 5529, zero: 206, features: 2067, relationships: 1843, noData: 224, total: 1122216, sourceGatePassed: true, eligible: false },
    { year: 2020, units: 1869, rows: 5607, zero: 207, features: 2094, relationships: 1869, noData: 225, total: 1404657, sourceGatePassed: true, eligible: false },
    { year: 2024, units: 1518, rows: 4554, zero: 234, features: 1726, relationships: 1518, noData: 208, total: 1484382, sourceGatePassed: true, eligible: false },
  ]);
});

test("Nevada plan uses canonical county-scoped identities and reviewed relationships", () => {
  for (const year of plan.years) {
    assert.equal(year.manifest.state, "NV");
    assert.equal(year.manifest.geography.level, "precinct");
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 17);
    assert.ok(year.reportingUnits.every((unit) => unit.parentGeoid.startsWith("32")));
    assert.ok(year.reportingUnits.every((unit) => unit.code.startsWith(
      `reporting:NV:${year.electionId}:precinct:`,
    )));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.reviewStatus === "reviewed"
      && ["high", "medium"].includes(relationship.confidence)
      && relationship.relationshipType === "one_to_one"));
    assert.equal(year.resultRows.length, year.reportingUnits.length * 3);
  }
  assert.equal(plan.years.find((year) => year.year === 2012).geometry.crosswalks.length, 1760);
  assert.equal(plan.years.find((year) => year.year === 2024).geometry.features.length, 1726);
});

test("Nevada all-four release readiness isolates the only remaining external requirement", async () => {
  const readiness = await buildNevadaPrecinctReleaseReadiness({ plan });
  assert.equal(readiness.decision, "NO_GO_ALL_FOUR_PUBLIC_RELEASE");
  assert.equal(readiness.allFourSourceGatesPassed, false);
  assert.equal(readiness.productionMutationPerformed, false);
  assert.equal(readiness.publicDeliveryAuthorized, false);
  assert.deepEqual(
    readiness.years.filter((year) => !year.sourceGatePassed).map((year) => year.year),
    [2012],
  );
  assert.equal(readiness.years.find((year) => year.year === 2012).externalRequest.contact, "library@lcb.state.nv.us");
  for (const year of [2016, 2020, 2024]) {
    assert.equal(readiness.years.find((entry) => entry.year === year).externalRequest, null);
    assert.equal(readiness.years.find((entry) => entry.year === year).status, "source_and_crosswalk_gates_passed_delivery_pending");
  }
  assert.equal(readiness.years.find((year) => year.year === 2024).reviewedNoDataFeatures, 208);
});

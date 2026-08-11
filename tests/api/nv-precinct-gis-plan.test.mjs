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
    eligible: year.publicReleaseEligible,
  })), [
    { year: 2012, units: 1760, rows: 5280, zero: 177, features: 2020, relationships: 1778, noData: 242, total: 1005652, eligible: false },
    { year: 2016, units: 2067, rows: 6201, zero: 311, features: 2067, relationships: 2067, noData: 0, total: 1125385, eligible: false },
    { year: 2020, units: 2094, rows: 6282, zero: 310, features: 2094, relationships: 2094, noData: 0, total: 1405376, eligible: false },
    { year: 2024, units: 1518, rows: 4554, zero: 234, features: 1726, relationships: 1518, noData: 208, total: 1484382, eligible: false },
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
      && ["one_to_one", "one_to_many"].includes(relationship.relationshipType)));
    assert.equal(year.resultRows.length, year.reportingUnits.length * 3);
  }
  assert.equal(plan.years.find((year) => year.year === 2012).geometry.crosswalks.length, 1778);
  assert.equal(plan.years.find((year) => year.year === 2024).geometry.features.length, 1726);
});

test("Nevada all-four release readiness remains NO-GO for four explicit external requirements", async () => {
  const readiness = await buildNevadaPrecinctReleaseReadiness({ plan });
  assert.equal(readiness.decision, "NO_GO_ALL_FOUR_PUBLIC_RELEASE");
  assert.equal(readiness.allFourSourceGatesPassed, false);
  assert.equal(readiness.productionMutationPerformed, false);
  assert.equal(readiness.publicDeliveryAuthorized, false);
  assert.deepEqual(
    readiness.years.filter((year) => !year.sourceGatePassed).map((year) => year.year),
    [2012, 2016, 2020, 2024],
  );
  assert.equal(readiness.years.find((year) => year.year === 2012).externalRequest.contact, "library@lcb.state.nv.us");
  assert.equal(readiness.years.find((year) => year.year === 2016).externalRequest.contact, "library@lcb.state.nv.us");
  assert.equal(readiness.years.find((year) => year.year === 2020).externalRequest.contact, "election-lab@ufl.edu");
  assert.equal(readiness.years.find((year) => year.year === 2024).externalRequest.contact, "library@lcb.state.nv.us");
  assert.equal(readiness.years.find((year) => year.year === 2024).reviewedNoDataFeatures, 208);
});

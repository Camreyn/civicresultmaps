import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWisconsinLocalGisPlan,
  summarizeWisconsinLocalGisPlan,
} from "../../scripts/lib/wi-local-gis-plan.mjs";

const plan = await buildWisconsinLocalGisPlan();
const summary = summarizeWisconsinLocalGisPlan(plan);

test("Wisconsin plan preserves three exact public-candidate universes", () => {
  assert.deepEqual(summary.years.map((year) => ({
    year: year.year,
    units: year.reportingUnits,
    rows: year.resultRows,
    features: year.geometryFeatures,
    relationships: year.reviewedCrosswalks,
    zeroVoteUnits: year.zeroVoteUnits,
    total: year.totals.Total,
    sourceGatePassed: year.sourceGatePassed,
  })), [
    { year: 2016, units: 3636, rows: 10878, features: 3648, relationships: 3636, zeroVoteUnits: 126, total: 2976150, sourceGatePassed: true },
    { year: 2020, units: 3698, rows: 11088, features: 3705, relationships: 3698, zeroVoteUnits: 190, total: 3298041, sourceGatePassed: true },
    { year: 2024, units: 3603, rows: 10509, features: 3503, relationships: 3603, zeroVoteUnits: 0, total: 3422918, sourceGatePassed: true },
  ]);
});

test("Wisconsin loadable years preserve reviewed geographic and non-geographic relationships", () => {
  for (const year of plan.years) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 72);
    assert.ok(year.reportingUnits.every((unit) =>
      ["local_reporting_unit", "administrative_reporting_unit"].includes(unit.reportingGrain)
      && /^55\d{3}$/.test(unit.parentGeoid)));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && (
        relationship.relationshipType === "non_geographic"
        || (
          relationship.relationshipType === "one_to_one"
          && ["reviewed_name", "spatial_review"].includes(relationship.matchMethod)
        )
      )));
    assert.equal(
      year.resultRows.length,
      year.reportingUnits.filter((unit) => unit.isGeographic).length * 3,
    );
  }
});

test("Wisconsin plan rejects the separately blocked 2012 package", async () => {
  await assert.rejects(
    buildWisconsinLocalGisPlan({ years: [2012] }),
    /2012 remains blocked and cannot be loaded/,
  );
});

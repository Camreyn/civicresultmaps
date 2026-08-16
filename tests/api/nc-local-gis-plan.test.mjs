import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNorthCarolinaLocalGisPlan,
  summarizeNorthCarolinaLocalGisPlan,
} from "../../scripts/lib/nc-local-gis-plan.mjs";

const plan = await buildNorthCarolinaLocalGisPlan();
const summary = summarizeNorthCarolinaLocalGisPlan(plan);

test("North Carolina plan preserves three exact election-specific source universes", () => {
  assert.deepEqual(summary.years.map((year) => ({
    year: year.year,
    units: year.reportingUnits,
    rows: year.resultRows,
    features: year.geometryFeatures,
    relationships: year.reviewedCrosswalks,
    mappedVotes: year.totals.Total,
    officialVotes: year.officialTotals.Total,
    sourceGatePassed: year.sourceGatePassed,
  })), [
    { year: 2012, units: 3011, rows: 8076, features: 2692, relationships: 3011, mappedVotes: 4492613, officialVotes: 4505372, sourceGatePassed: true },
    { year: 2016, units: 3209, rows: 8112, features: 2704, relationships: 3209, mappedVotes: 3177511, officialVotes: 4741564, sourceGatePassed: true },
    { year: 2020, units: 3065, rows: 7986, features: 2662, relationships: 3065, mappedVotes: 3201711, officialVotes: 5524802, sourceGatePassed: true },
  ]);
});

test("North Carolina uses county parents and never maps administrative buckets", () => {
  for (const year of plan.years) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 100);
    const geographic = year.reportingUnits.filter((unit) => unit.isGeographic);
    const nonGeographic = year.reportingUnits.filter((unit) => !unit.isGeographic);
    assert.equal(
      year.geometry.features.length - geographic.length,
      year.manifest.crosswalk.reviewedNoDataFeatures,
    );
    assert.ok(geographic.every((unit) =>
      unit.reportingGrain === year.manifest.geography.level
      && /^37\d{3}$/.test(unit.parentGeoid)));
    assert.ok(nonGeographic.every((unit) =>
      unit.reportingGrain === "administrative_reporting_unit"
      && /^37\d{3}$/.test(unit.parentGeoid)));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && (relationship.sourceFeatureId === null
        ? relationship.relationshipType === "non_geographic"
        : relationship.relationshipType === "one_to_one")));
    assert.ok(year.resultRows.every((row) =>
      geographic.some((unit) => unit.code === row.jurisdictionCode)));
  }
});

test("North Carolina plan excludes blocked 2024 and rejects unsupported years", async () => {
  await assert.rejects(
    buildNorthCarolinaLocalGisPlan({ years: [2024] }),
    /2024 remains separately blocked/,
  );
  await assert.rejects(
    buildNorthCarolinaLocalGisPlan({ years: [2008] }),
    /Supported North Carolina public-release years/,
  );
});

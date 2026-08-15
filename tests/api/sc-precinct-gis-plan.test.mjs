import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSouthCarolinaPrecinctGisPlan,
  summarizeSouthCarolinaPrecinctGisPlan,
} from "../../scripts/lib/sc-precinct-gis-plan.mjs";

const plan = await buildSouthCarolinaPrecinctGisPlan();
const summary = summarizeSouthCarolinaPrecinctGisPlan(plan);

test("South Carolina plan preserves three exact election-specific source universes", () => {
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
    { year: 2016, units: 2551, rows: 6696, features: 2234, relationships: 2551, mappedVotes: 1589961, officialVotes: 2103027, sourceGatePassed: true },
    { year: 2020, units: 2399, rows: 6783, features: 2263, relationships: 2399, mappedVotes: 2504220, officialVotes: 2513329, sourceGatePassed: true },
    { year: 2024, units: 2446, rows: 6924, features: 2308, relationships: 2446, mappedVotes: 2541877, officialVotes: 2548140, sourceGatePassed: true },
  ]);
});

test("South Carolina uses county parents and never maps administrative buckets", () => {
  for (const year of plan.years) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 46);
    const geographic = year.reportingUnits.filter((unit) => unit.isGeographic);
    const nonGeographic = year.reportingUnits.filter((unit) => !unit.isGeographic);
    assert.equal(
      year.geometry.features.length - geographic.length,
      year.manifest.crosswalk.reviewedNoDataFeatures,
    );
    assert.ok(geographic.every((unit) =>
      unit.reportingGrain === "precinct"
      && /^45\d{3}$/.test(unit.parentGeoid)));
    assert.ok(nonGeographic.every((unit) =>
      unit.reportingGrain === "administrative_reporting_unit"
      && /^45\d{3}$/.test(unit.parentGeoid)));
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

test("South Carolina plan excludes blocked 2012 and rejects unsupported years", async () => {
  await assert.rejects(
    buildSouthCarolinaPrecinctGisPlan({ years: [2012] }),
    /2012 remains separately blocked/,
  );
  await assert.rejects(
    buildSouthCarolinaPrecinctGisPlan({ years: [2008] }),
    /Supported South Carolina public-release years/,
  );
});

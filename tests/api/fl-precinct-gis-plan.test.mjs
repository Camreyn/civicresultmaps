import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFloridaPrecinctGisPlan,
  summarizeFloridaPrecinctGisPlan,
} from "../../scripts/lib/fl-precinct-gis-plan.mjs";

const plan = await buildFloridaPrecinctGisPlan();
const summary = summarizeFloridaPrecinctGisPlan(plan);

test("Florida plan preserves three exact election-specific source universes", () => {
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
    { year: 2016, units: 5852, rows: 17556, features: 5962, relationships: 5852, mappedVotes: 9488349, officialVotes: 9498093, sourceGatePassed: true },
    { year: 2020, units: 5989, rows: 17967, features: 6010, relationships: 5989, mappedVotes: 11088665, officialVotes: 11090844, sourceGatePassed: true },
    { year: 2024, units: 5583, rows: 16749, features: 5583, relationships: 5583, mappedVotes: 10917518, officialVotes: 10935466, sourceGatePassed: true },
  ]);
});

test("Florida uses all county parents and never loads excluded source units", () => {
  for (const year of plan.years) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 67);
    const geographic = year.reportingUnits.filter((unit) => unit.isGeographic);
    const nonGeographic = year.reportingUnits.filter((unit) => !unit.isGeographic);
    assert.equal(
      year.geometry.features.length - geographic.length,
      year.manifest.crosswalk.reviewedNoDataFeatures,
    );
    assert.equal(nonGeographic.length, 0);
    assert.ok(geographic.every((unit) =>
      unit.reportingGrain === "precinct"
      && /^12\d{3}$/.test(unit.parentGeoid)));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && relationship.sourceFeatureId !== null
      && relationship.relationshipType === "one_to_one"));
    assert.ok(year.resultRows.every((row) =>
      geographic.some((unit) => unit.code === row.jurisdictionCode)));
  }
});

test("Florida plan excludes blocked 2012 and rejects unsupported years", async () => {
  await assert.rejects(
    buildFloridaPrecinctGisPlan({ years: [2012] }),
    /2012 remains separately blocked/,
  );
  await assert.rejects(
    buildFloridaPrecinctGisPlan({ years: [2008] }),
    /Supported Florida public-release years/,
  );
});

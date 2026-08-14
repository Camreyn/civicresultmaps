import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAlaskaPrecinctGisPlan,
  summarizeAlaskaPrecinctGisPlan,
} from "../../scripts/lib/ak-precinct-gis-plan.mjs";

const plan = await buildAlaskaPrecinctGisPlan();
const summary = summarizeAlaskaPrecinctGisPlan(plan);

test("Alaska plan preserves four exact election-specific source universes", () => {
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
    { year: 2012, units: 558, rows: 2190, features: 438, relationships: 558, mappedVotes: 203048, officialVotes: 300495, sourceGatePassed: true },
    { year: 2016, units: 562, rows: 3087, features: 441, relationships: 562, mappedVotes: 197924, officialVotes: 318608, sourceGatePassed: true },
    { year: 2020, units: 562, rows: 3528, features: 441, relationships: 562, mappedVotes: 156462, officialVotes: 359530, sourceGatePassed: true },
    { year: 2024, units: 523, rows: 3216, features: 402, relationships: 523, mappedVotes: 173953, officialVotes: 338177, sourceGatePassed: true },
  ]);
});

test("Alaska uses House District parents and never maps administrative buckets", () => {
  for (const year of plan.years) {
    assert.equal(new Set(year.geometry.features.map((feature) => feature.parentGeoid)).size, 40);
    const geographic = year.reportingUnits.filter((unit) => unit.isGeographic);
    const nonGeographic = year.reportingUnits.filter((unit) => !unit.isGeographic);
    assert.equal(geographic.length, year.geometry.features.length);
    assert.ok(geographic.every((unit) =>
      unit.reportingGrain === "precinct"
      && /^HD(?:0[1-9]|[1-3][0-9]|40)$/.test(unit.parentGeoid)));
    assert.ok(nonGeographic.every((unit) =>
      unit.reportingGrain === "administrative_reporting_unit"
      && /^HD(?:0[1-9]|[1-3][0-9]|40|99)$/.test(unit.parentGeoid)));
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

test("Alaska plan accepts 2012 and rejects unsupported years", async () => {
  assert.equal((await buildAlaskaPrecinctGisPlan({ years: [2012] })).years.length, 1);
  await assert.rejects(
    buildAlaskaPrecinctGisPlan({ years: [2008] }),
    /Supported Alaska precinct GIS years/,
  );
});

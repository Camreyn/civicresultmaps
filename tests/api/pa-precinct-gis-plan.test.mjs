import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPennsylvaniaPrecinctGisPlan,
  summarizePennsylvaniaPrecinctGisPlan,
} from "../../scripts/lib/pa-precinct-gis-plan.mjs";

const plan = await buildPennsylvaniaPrecinctGisPlan();
const summary = summarizePennsylvaniaPrecinctGisPlan(plan);

test("Pennsylvania plan preserves two exact partial election-specific source universes", () => {
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
    { year: 2016, units: 8014, rows: 24042, features: 9167, relationships: 8014, mappedVotes: 5331613, officialVotes: 6114296, sourceGatePassed: true },
    { year: 2020, units: 6805, rows: 20415, features: 9150, relationships: 6805, mappedVotes: 5370341, officialVotes: 6916044, sourceGatePassed: true },
  ]);
});

test("Pennsylvania uses all county parents and never loads excluded source units", () => {
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
      && /^42\d{3}$/.test(unit.parentGeoid)));
    assert.ok(year.geometry.crosswalks.every((relationship) =>
      relationship.reviewStatus === "reviewed"
      && relationship.confidence === "high"
      && relationship.sourceFeatureId !== null
      && relationship.relationshipType === "one_to_one"));
    assert.ok(year.resultRows.every((row) =>
      geographic.some((unit) => unit.code === row.jurisdictionCode)));
  }
});

test("Pennsylvania keeps 2020 Pike County geometry as reviewed no-data only", () => {
  const year = plan.years.find((candidate) => candidate.year === 2020);
  assert.equal(
    year.geometry.features.filter((feature) => feature.parentGeoid === "42103").length,
    18,
  );
  assert.equal(
    year.reportingUnits.filter((unit) => unit.parentGeoid === "42103").length,
    0,
  );
  assert.equal(
    year.geometry.crosswalks.filter((row) => row.sourceFeatureId.startsWith("42103|")).length,
    0,
  );
});

test("Pennsylvania plan excludes blocked 2012 and 2024 and rejects unsupported years", async () => {
  await assert.rejects(
    buildPennsylvaniaPrecinctGisPlan({ years: [2016, 2016, 2020] }),
    /years must be unique/,
  );
  await assert.rejects(
    buildPennsylvaniaPrecinctGisPlan({ years: [2012] }),
    /2012 and 2024 remain separately blocked/,
  );
  await assert.rejects(
    buildPennsylvaniaPrecinctGisPlan({ years: [2024] }),
    /2012 and 2024 remain separately blocked/,
  );
  await assert.rejects(
    buildPennsylvaniaPrecinctGisPlan({ years: [2008] }),
    /Supported Pennsylvania public-release years/,
  );
});

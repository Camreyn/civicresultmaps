import assert from "node:assert/strict";
import test from "node:test";
import {
  ALASKA_HOUSE_DISTRICT_PARENT_IDS,
  isSupportedLocalGeographyParentId,
  isValidLocalGeographyParentId,
  localGeographyParentDisplayName,
  localGeographyParentScope,
} from "../../src/lib/local-geography-parent.ts";
import {
  guardedLocalGeographyLevel,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

test("Alaska uses forty House District parent IDs and a guarded precinct release", () => {
  assert.equal(ALASKA_HOUSE_DISTRICT_PARENT_IDS.length, 40);
  assert.equal(ALASKA_HOUSE_DISTRICT_PARENT_IDS[0], "HD01");
  assert.equal(ALASKA_HOUSE_DISTRICT_PARENT_IDS.at(-1), "HD40");
  assert.equal(new Set(ALASKA_HOUSE_DISTRICT_PARENT_IDS).size, 40);
  assert.equal(localGeographyParentDisplayName("HD01"), "House District 1");
  assert.deepEqual(
    localGeographyParentScope({ state: "AK", geographyLevel: "precinct" }),
    {
      level: "house_district",
      singularLabel: "House District",
      pluralLabel: "House Districts",
    },
  );
  assert.equal(guardedLocalGeographyLevel("AK"), "precinct");
  assert.equal(requiresPrecinctResultPublicationGate({
    state: "AK",
    level: "precinct",
  }), true);
});

test("Alaska and county-scoped parent contracts remain mutually exclusive", () => {
  for (const parentGeoid of ["HD01", "HD09", "HD10", "HD39", "HD40"]) {
    assert.equal(isSupportedLocalGeographyParentId(parentGeoid), true);
    assert.equal(isValidLocalGeographyParentId({
      state: "AK",
      geographyLevel: "precinct",
      parentGeoid,
    }), true);
  }
  for (const parentGeoid of ["HD00", "HD41", "HD99", "02020", "HD1"]) {
    assert.equal(isValidLocalGeographyParentId({
      state: "AK",
      geographyLevel: "precinct",
      parentGeoid,
    }), false);
  }
  assert.equal(isValidLocalGeographyParentId({
    state: "IA",
    geographyLevel: "precinct",
    parentGeoid: "19001",
  }), true);
  assert.equal(isValidLocalGeographyParentId({
    state: "IA",
    geographyLevel: "precinct",
    parentGeoid: "HD01",
  }), false);
  assert.equal(isValidLocalGeographyParentId({
    state: "ME",
    geographyLevel: "local_reporting_unit",
    parentGeoid: "23001",
  }), true);
});

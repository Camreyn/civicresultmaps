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
import { states } from "../../scripts/state-metadata.mjs";

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

test("county parent contracts require each state's canonical FIPS prefix", () => {
  for (const state of states) {
    if (state.code === "AK") continue;
    assert.equal(isValidLocalGeographyParentId({
      state: state.code,
      geographyLevel: "precinct",
      parentGeoid: state.fips + "001",
    }), true, `${state.code} should accept its own state FIPS prefix`);
    assert.equal(isValidLocalGeographyParentId({
      state: state.code,
      geographyLevel: "precinct",
      parentGeoid: (state.fips === "01" ? "02" : "01") + "001",
    }), false, `${state.code} should reject another state's FIPS prefix`);
  }
});

test("Alaska county-parent local levels keep the Alaska FIPS prefix", () => {
  for (const geographyLevel of ["vtd", "local_reporting_unit"]) {
    assert.equal(isValidLocalGeographyParentId({
      state: "AK",
      geographyLevel,
      parentGeoid: "02020",
    }), true);
    assert.equal(isValidLocalGeographyParentId({
      state: "AK",
      geographyLevel,
      parentGeoid: "19001",
    }), false);
  }
});

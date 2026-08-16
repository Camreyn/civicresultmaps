import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertNorthCarolinaGeometryVersionPrecondition,
  canonicalJson,
} from "../../scripts/lib/nc-local-gis-db.mjs";
import {
  guardedLocalGeographyLevel,
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";
import {
  isValidLocalGeographyParentId,
  localGeographyParentScope,
} from "../../src/lib/local-geography-parent.ts";

test("North Carolina local geography GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-nc-local-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-nc-local-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/nc-local-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json"));
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /\["vtd", "precinct"\]/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["precinct-gis:plan:nc"], "node --experimental-strip-types scripts/setup-nc-local-gis-local.mjs");
  assert.equal(packageJson.scripts["precinct-gis:setup:nc:local"], "node --experimental-strip-types scripts/setup-nc-local-gis-local.mjs --apply");
});

test("North Carolina results and geometry require exact publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NC", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NC", level: "vtd" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ia", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NC", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "NC",
    geography: { level: "precinct" },
  }), true);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "NC",
    geography: { level: "vtd" },
  }), true);
  assert.equal(guardedLocalGeographyLevel("NC", 2012), "vtd");
  assert.equal(guardedLocalGeographyLevel("NC", 2016), "precinct");
  assert.equal(guardedLocalGeographyLevel("NC", 2024), "precinct");
});

test("North Carolina VTD API requests retain county parent scope", () => {
  const apiSource = readFileSync("src/lib/api.ts", "utf8");
  assert.match(apiSource, /"precinct", "vtd", "local_reporting_unit"/);
  assert.deepEqual(localGeographyParentScope({
    state: "NC",
    geographyLevel: "vtd",
  }), {
    level: "county",
    singularLabel: "county",
    pluralLabel: "counties",
  });
  assert.equal(isValidLocalGeographyParentId({
    state: "NC",
    geographyLevel: "vtd",
    parentGeoid: "37001",
  }), true);
  assert.equal(isValidLocalGeographyParentId({
    state: "NC",
    geographyLevel: "vtd",
    parentGeoid: "HD01",
  }), false);
});

test("North Carolina release precondition rejects duplicate or boundary-drifted versions", () => {
  const yearPlan = {
    year: 2012,
    manifest: {
      id: "nc-2012-11-06-reviewed-vtd-geometry-v1",
      geography: { boundaryVintage: "reviewed North Carolina 2012 VTD boundaries" },
    },
  };
  assert.doesNotThrow(() => assertNorthCarolinaGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertNorthCarolinaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
  }], yearPlan));
  assert.throws(() => assertNorthCarolinaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: "drifted",
  }], yearPlan), /boundary-drifted geography versions/);
});

test("North Carolina database validation compares nested JSON independent of key order", () => {
  const left = {
    z: [{ beta: 2, alpha: 1 }],
    a: { delta: 4, gamma: 3 },
  };
  const right = {
    a: { gamma: 3, delta: 4 },
    z: [{ alpha: 1, beta: 2 }],
  };
  assert.deepEqual(canonicalJson(left), canonicalJson(right));
});

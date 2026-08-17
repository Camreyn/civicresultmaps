import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertPennsylvaniaGeometryVersionPrecondition,
  canonicalJson,
} from "../../scripts/lib/pa-precinct-gis-db.mjs";
import {
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";
import {
  isValidLocalGeographyParentId,
  localGeographyParentValidationMessage,
} from "../../src/lib/local-geography-parent.ts";

test("Pennsylvania precinct GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-pa-precinct-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-pa-precinct-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/pa-precinct-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json"));
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /reporting_grain='precinct'/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["precinct-gis:plan:pa"], "node --max-old-space-size=4096 --experimental-strip-types scripts/setup-pa-precinct-gis-local.mjs");
  assert.equal(packageJson.scripts["precinct-gis:setup:pa:local"], "node --max-old-space-size=4096 --experimental-strip-types scripts/setup-pa-precinct-gis-local.mjs --apply");
});

test("Pennsylvania results and geometry require exact publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "PA", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ia", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "PA", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "PA",
    geography: { level: "precinct" },
  }), true);
});

test("Pennsylvania county parents require the Pennsylvania state FIPS prefix", () => {
  assert.equal(isValidLocalGeographyParentId({
    state: "PA",
    geographyLevel: "precinct",
    parentGeoid: "42001",
  }), true);
  assert.equal(isValidLocalGeographyParentId({
    state: "PA",
    geographyLevel: "precinct",
    parentGeoid: "12001",
  }), false);
  assert.match(localGeographyParentValidationMessage({
    state: "PA",
    geographyLevel: "precinct",
  }), /beginning with 42 for PA/);
});

test("Pennsylvania release precondition rejects duplicate or boundary-drifted versions", () => {
  const yearPlan = {
    year: 2020,
    manifest: {
      id: "pa-2020-11-03-reviewed-precinct-geometry-v1",
      geography: { boundaryVintage: "reviewed Pennsylvania 2020 precinct boundaries" },
    },
  };
  assert.doesNotThrow(() => assertPennsylvaniaGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertPennsylvaniaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
    release_attributed: 0,
    status: "blocked",
  }], yearPlan));
  assert.throws(() => assertPennsylvaniaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: "drifted",
    release_attributed: 0,
    status: "blocked",
  }], yearPlan), /boundary-drifted/);
  assert.throws(() => assertPennsylvaniaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
    release_attributed: 1,
    status: "blocked",
  }], yearPlan), /release-attributed/);
  assert.throws(() => assertPennsylvaniaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
    release_attributed: 0,
    status: "published",
  }], yearPlan), /non-blocked/);
});

test("Pennsylvania database validation compares nested JSON independent of key order", () => {
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

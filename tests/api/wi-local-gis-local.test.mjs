import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertWisconsinGeometryVersionPrecondition,
  canonicalJson,
} from "../../scripts/lib/wi-local-gis-db.mjs";
import {
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

test("Wisconsin local GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-wi-local-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-wi-local-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/wi-local-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json"));
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /reporting_grain in \('local_reporting_unit','administrative_reporting_unit'\)/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["local-gis:plan:wi"], "node --experimental-strip-types scripts/setup-wi-local-gis-local.mjs");
  assert.equal(packageJson.scripts["local-gis:setup:wi:local"], "node --experimental-strip-types scripts/setup-wi-local-gis-local.mjs --apply");
});

test("Wisconsin results and geometry require exact publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "WI", level: "local_reporting_unit" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "WI", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ia", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "WI", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "WI",
    geography: { level: "local_reporting_unit" },
  }), true);
});

test("Wisconsin release precondition rejects duplicate or boundary-drifted versions", () => {
  const yearPlan = {
    year: 2024,
    manifest: {
      id: "wi-2024-11-05-reviewed-local-reporting-geometry-v1",
      geography: { boundaryVintage: "reviewed Wisconsin 2024 local boundaries" },
    },
  };
  assert.doesNotThrow(() => assertWisconsinGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertWisconsinGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
  }], yearPlan));
  assert.throws(() => assertWisconsinGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: "drifted",
  }], yearPlan), /boundary-drifted geography versions/);
});

test("Wisconsin database validation compares nested JSON independent of key order", () => {
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

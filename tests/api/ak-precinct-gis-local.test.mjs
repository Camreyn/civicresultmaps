import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertAlaskaGeometryVersionPrecondition,
  canonicalJson,
} from "../../scripts/lib/ak-precinct-gis-db.mjs";
import {
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

test("Alaska precinct GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-ak-precinct-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-ak-precinct-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/ak-precinct-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json"));
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /reporting_grain='precinct'/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["precinct-gis:plan:ak"], "node --experimental-strip-types scripts/setup-ak-precinct-gis-local.mjs");
  assert.equal(packageJson.scripts["precinct-gis:setup:ak:local"], "node --experimental-strip-types scripts/setup-ak-precinct-gis-local.mjs --apply");
});

test("Alaska results and geometry require exact publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "AK", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ia", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "AK", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "AK",
    geography: { level: "precinct" },
  }), true);
});

test("Alaska release precondition rejects duplicate or boundary-drifted versions", () => {
  const yearPlan = {
    year: 2024,
    manifest: {
      id: "ak-2024-11-05-general-precinct-geometry-candidate-v1",
      geography: { boundaryVintage: "reviewed Alaska 2024 precinct boundaries" },
    },
  };
  assert.doesNotThrow(() => assertAlaskaGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertAlaskaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
  }], yearPlan));
  assert.throws(() => assertAlaskaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: "drifted",
  }], yearPlan), /boundary-drifted geography versions/);
});

test("Alaska database validation compares nested JSON independent of key order", () => {
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

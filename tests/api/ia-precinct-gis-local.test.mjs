import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertIowaGeometryVersionPrecondition,
  canonicalJson,
} from "../../scripts/lib/ia-precinct-gis-db.mjs";
import {
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

test("Iowa local GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-ia-precinct-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-ia-precinct-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/ia-precinct-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json"));
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /reporting_grain='precinct'/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["precinct-gis:plan:ia"], "node --experimental-strip-types scripts/setup-ia-precinct-gis-local.mjs");
  assert.equal(packageJson.scripts["precinct-gis:setup:ia:local"], "node --experimental-strip-types scripts/setup-ia-precinct-gis-local.mjs --apply");
});

test("Iowa results and geometry require exact publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "IA", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ia", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "IA", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "IA",
    geography: { level: "precinct" },
  }), true);
});

test("Iowa release precondition rejects duplicate or boundary-drifted versions", () => {
  const yearPlan = {
    year: 2024,
    manifest: {
      id: "ia-2024-2024-11-05-precinct-geometry-candidate-v1",
      geography: { boundaryVintage: "reviewed Iowa 2024 precinct boundaries" },
    },
  };
  assert.doesNotThrow(() => assertIowaGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertIowaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
  }], yearPlan));
  assert.throws(() => assertIowaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: "drifted",
  }], yearPlan), /boundary-drifted geography versions/);
});

test("Iowa database validation compares nested JSON independent of key order", () => {
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertMaineGeometryVersionPrecondition,
  canonicalJson,
} from "../../scripts/lib/me-local-gis-db.mjs";
import {
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

test("Maine local GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-me-local-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-me-local-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/me-local-gis-db.mjs", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json"));
  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /reporting_grain='local_reporting_unit'/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.equal(packageJson.scripts["local-gis:plan:me"], "node --experimental-strip-types scripts/setup-me-local-gis-local.mjs");
  assert.equal(packageJson.scripts["local-gis:setup:me:local"], "node --experimental-strip-types scripts/setup-me-local-gis-local.mjs --apply");
});

test("Maine results and geometry require exact publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "local_reporting_unit" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ia", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "ME",
    geography: { level: "local_reporting_unit" },
  }), true);
});

test("Maine release precondition rejects duplicate or boundary-drifted versions", () => {
  const yearPlan = {
    year: 2024,
    manifest: {
      id: "me-2024-11-05-general-local-reporting-geometry-candidate-v1",
      geography: { boundaryVintage: "reviewed Maine 2024 local boundaries" },
    },
  };
  assert.doesNotThrow(() => assertMaineGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertMaineGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
  }], yearPlan));
  assert.throws(() => assertMaineGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: "drifted",
  }], yearPlan), /boundary-drifted geography versions/);
});

test("Maine database validation compares nested JSON independent of key order", () => {
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

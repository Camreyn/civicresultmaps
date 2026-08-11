import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";
import {
  assertNevadaGeometryVersionPrecondition,
} from "../../scripts/lib/nv-precinct-gis-db.mjs";

test("Nevada local GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-nv-precinct-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-nv-precinct-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/nv-precinct-gis-db.mjs", "utf8");
  const migration = readFileSync("drizzle/0009_public_wolfpack.sql", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(setup, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.match(validate, /CRM_DATABASE_DRIVER = "postgres"/);
  assert.doesNotMatch(setup + validate, /--env-file|dotenv/);
  assert.match(database, /getLocalCloneDatabaseUrl\(\{ requireWriteOptIn: true \}\)/);
  assert.match(database, /reporting_grain='precinct'/);
  assert.match(database, /geography_type='precinct'/);
  assert.match(database, /status='blocked'| 'blocked'/);
  assert.match(database, /publicDeliveryAuthorized: false/);
  assert.doesNotMatch(database, /runNeonTransaction|@neondatabase/);
  assert.match(migration, /secondary_reconstruction/);
  assert.match(migration, /hybrid_reconstruction/);
  assert.equal(packageJson.scripts["precinct-gis:plan:nv"], "node --experimental-strip-types scripts/setup-nv-precinct-gis-local.mjs");
  assert.equal(packageJson.scripts["precinct-gis:setup:nv:local"], "node --experimental-strip-types scripts/setup-nv-precinct-gis-local.mjs --apply");
  assert.equal(packageJson.scripts["precinct-gis:validate:nv:local"], "node --experimental-strip-types scripts/validate-nv-precinct-gis-local.mjs");
});

test("Nevada precinct results and geometry require publication evidence", () => {
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NV", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "nv", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NV", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate({
    state: "NV",
    geography: { level: "precinct" },
  }), true);
});

test("Nevada local replay rejects duplicate or boundary-drifted geography versions before writing", () => {
  const yearPlan = {
    year: 2024,
    manifest: {
      id: "nv-2024-11-05-general-precinct-geometry-candidate-v1",
      geography: {
        boundaryVintage: "Nevada LCB 2024 Precincts snapshot published April 5, 2024",
      },
    },
  };
  assert.doesNotThrow(() => assertNevadaGeometryVersionPrecondition([], yearPlan));
  assert.doesNotThrow(() => assertNevadaGeometryVersionPrecondition([{
    manifest_id: yearPlan.manifest.id,
    boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
  }], yearPlan));
  assert.throws(
    () => assertNevadaGeometryVersionPrecondition([{
      manifest_id: yearPlan.manifest.id,
      boundary_vintage: "changed display label",
    }], yearPlan),
    /boundary-drifted geography versions/,
  );
  assert.throws(
    () => assertNevadaGeometryVersionPrecondition([
      {
        manifest_id: yearPlan.manifest.id,
        boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
      },
      {
        manifest_id: yearPlan.manifest.id,
        boundary_vintage: yearPlan.manifest.geography.boundaryVintage,
      },
    ], yearPlan),
    /multiple, foreign, or boundary-drifted geography versions/,
  );
});

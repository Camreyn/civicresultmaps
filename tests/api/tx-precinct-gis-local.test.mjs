import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Texas local GIS commands remain loopback-only and public-fail-closed", () => {
  const setup = readFileSync("scripts/setup-tx-precinct-gis-local.mjs", "utf8");
  const validate = readFileSync("scripts/validate-tx-precinct-gis-local.mjs", "utf8");
  const database = readFileSync("scripts/lib/tx-precinct-gis-db.mjs", "utf8");
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
  assert.equal(
    packageJson.scripts["precinct-gis:plan:tx"],
    "node --experimental-strip-types scripts/setup-tx-precinct-gis-local.mjs",
  );
  assert.equal(
    packageJson.scripts["precinct-gis:setup:tx:local"],
    "node --experimental-strip-types scripts/setup-tx-precinct-gis-local.mjs --apply",
  );
  assert.equal(
    packageJson.scripts["precinct-gis:validate:tx:local"],
    "node --experimental-strip-types scripts/validate-tx-precinct-gis-local.mjs",
  );
});

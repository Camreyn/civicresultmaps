import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import registry from "../../data/precinct-geometry-manifests.json" with {
  type: "json",
};
import {
  findMinnesotaPrecinctRehearsalManifest,
  listPrecinctGeometryManifestViewsWithMinnesotaRehearsal,
  MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES,
  resolveMinnesotaPrecinctRehearsal,
  verifyMinnesotaPrecinctRehearsalCandidateBytes,
} from "../../src/lib/mn-precinct-rehearsal-server.ts";

const ENVIRONMENT_VARIABLES = [
  "NODE_ENV",
  "CRM_PRECINCT_REHEARSAL",
  "CRM_DATABASE_DRIVER",
  "CRM_DATABASE_ENVIRONMENT",
  "CRM_DATABASE_STRICT",
  "DATABASE_URL",
];
const originalEnvironment = Object.fromEntries(
  ENVIRONMENT_VARIABLES.map((name) => [name, process.env[name]]),
);

function restoreEnvironment() {
  for (const name of ENVIRONMENT_VARIABLES) {
    const original = originalEnvironment[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}

function configureRehearsal() {
  process.env.NODE_ENV = "test";
  process.env.CRM_PRECINCT_REHEARSAL = "mn";
  process.env.CRM_DATABASE_DRIVER = "postgres";
  process.env.CRM_DATABASE_ENVIRONMENT = "local";
  process.env.CRM_DATABASE_STRICT = "true";
  process.env.DATABASE_URL =
    "postgres://postgres@127.0.0.1:54329/crm_clone_dev";
}

test.after(restoreEnvironment);
test.beforeEach(restoreEnvironment);

test("Minnesota rehearsal is absent unless the explicit local clone guard passes", () => {
  process.env.NODE_ENV = "test";
  assert.deepEqual(resolveMinnesotaPrecinctRehearsal(), { enabled: false });
  const publicViews = listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(
    registry,
    { state: "MN" },
  );
  assert.equal(publicViews.length, 4);
  assert.equal(publicViews.every((view) => view.eligible), true);
  assert.equal(
    publicViews.every((view) => !("localRehearsal" in view)),
    true,
  );

  configureRehearsal();
  assert.deepEqual(resolveMinnesotaPrecinctRehearsal(), {
    enabled: true,
    database: "crm_clone_dev",
    state: "MN",
  });

  process.env.NODE_ENV = "production";
  assert.throws(
    resolveMinnesotaPrecinctRehearsal,
    /NODE_ENV=development or test/,
  );
  configureRehearsal();
  process.env.CRM_DATABASE_DRIVER = "neon-http";
  assert.throws(resolveMinnesotaPrecinctRehearsal, /DRIVER=postgres/);
  configureRehearsal();
  process.env.CRM_DATABASE_STRICT = "false";
  assert.throws(resolveMinnesotaPrecinctRehearsal, /STRICT=true/);
  configureRehearsal();
  process.env.DATABASE_URL =
    "postgres://postgres@127.0.0.1:54329/crm_clone_snapshot";
  assert.throws(resolveMinnesotaPrecinctRehearsal, /crm_clone_dev/);
  configureRehearsal();
  process.env.DATABASE_URL =
    "postgres://postgres@database.example:54329/crm_clone_dev";
  assert.throws(resolveMinnesotaPrecinctRehearsal, /only permits localhost/);
});

test("the local rehearsal refuses to override activated canonical manifests", () => {
  configureRehearsal();
  const before = JSON.stringify(registry);
  assert.throws(
    () => listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(
      registry,
      { state: "MN" },
    ),
    /no longer matches its reviewed blocked contract/,
  );
  assert.equal(JSON.stringify(registry), before);
  assert.equal(existsSync("public/data/geography/mn"), false);
});

test("the API and UI use the marked rehearsal path without requesting blocked layers", () => {
  const manifestRoute = readFileSync(
    "src/app/api/geography-manifests/route.ts",
    "utf8",
  );
  const geometryRoute = readFileSync(
    "src/app/api/precinct-geography/route.ts",
    "utf8",
  );
  const component = readFileSync("src/app/precinct-detail-map.tsx", "utf8");
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  assert.match(
    manifestRoute,
    /listPrecinctGeometryManifestViewsWithMinnesotaRehearsal/,
  );
  assert.match(geometryRoute, /findMinnesotaPrecinctRehearsalManifest/);
  assert.match(geometryRoute, /readMinnesotaPrecinctRehearsalDelivery/);
  assert.match(geometryRoute, /publicEligible: selectedManifest\.eligible/);
  assert.doesNotMatch(geometryRoute, /includeBlocked/);
  assert.match(component, /localRehearsal\.publicEligible === false/);
  assert.match(component, /Local rehearsal - not public/);
  assert.doesNotMatch(component, /includeBlocked/);
  assert.match(dataAccess, /resolveMinnesotaPrecinctRehearsal/);
  assert.match(
    dataAccess,
    /requiresPrecinctResultPublicationGate\(input\)\s*&& !resolveMinnesotaPrecinctRehearsal\(\)\.enabled/,
  );
  assert.match(
    api,
    /persistent: process\.env\.CRM_PRECINCT_REHEARSAL !== "mn"/,
  );
});

test("all four activated manifests reject the obsolete local rehearsal lookup", () => {
  configureRehearsal();
  for (const candidate of MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES) {
    assert.throws(
      () => findMinnesotaPrecinctRehearsalManifest(
        registry,
        candidate.manifestId,
      ),
      /no longer matches its reviewed blocked contract/,
    );
  }
});

test("activated manifest bytes cannot be served through the local rehearsal path", () => {
  const candidate = MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES[3];
  const publicView = listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(
    registry,
    { state: "MN" },
  )
    .find((view) => view.id === candidate.manifestId);
  assert.ok(publicView);
  configureRehearsal();
  assert.throws(
    () => verifyMinnesotaPrecinctRehearsalCandidateBytes(
      { candidate, manifest: publicView },
      Buffer.from("not pinned"),
    ),
    /no longer matches its reviewed blocked contract/,
  );
});

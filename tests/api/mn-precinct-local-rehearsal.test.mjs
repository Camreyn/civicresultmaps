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
  readMinnesotaPrecinctRehearsalDelivery,
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
  assert.equal(
    listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(registry, {
      state: "MN",
    }).length,
    0,
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

test("the local manifest overlay preserves all canonical release blockers", () => {
  configureRehearsal();
  const before = JSON.stringify(registry);
  const views = listPrecinctGeometryManifestViewsWithMinnesotaRehearsal(
    registry,
    { state: "MN" },
  );

  assert.equal(views.length, 4);
  assert.deepEqual(
    views.map((view) => view.election.year),
    [2012, 2016, 2020, 2024],
  );
  for (const view of views) {
    const candidate = MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES.find(
      (entry) => entry.manifestId === view.id,
    );
    assert.ok(candidate);
    assert.equal(view.eligible, false);
    assert.equal(view.delivery, null);
    assert.equal(view.validation.status, "blocked");
    assert.equal(view.validation.rowLevelRenderingSafe, false);
    assert.deepEqual(view.publicEligibilityReasons, [
      "validation status is not reviewed",
      "row-level rendering is not safe",
      "validation errors remain",
      "no immutable delivery artifact is declared",
    ]);
    assert.equal(view.localRehearsal.active, true);
    assert.equal(view.localRehearsal.mode, "local_only");
    assert.equal(view.localRehearsal.publicEligible, false);
    assert.equal(view.localRehearsal.delivery.sha256, candidate.sha256);
    assert.equal(view.localRehearsal.delivery.byteCount, candidate.byteCount);
    assert.equal(
      view.localRehearsal.delivery.featureCount,
      candidate.featureCount,
    );
  }
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

test("all four pinned candidates can be read and county-filtered locally", {
  timeout: 120_000,
}, async () => {
  configureRehearsal();
  for (const candidate of MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES) {
    const lookup = findMinnesotaPrecinctRehearsalManifest(
      registry,
      candidate.manifestId,
    );
    assert.ok(lookup);
    const delivery = await readMinnesotaPrecinctRehearsalDelivery(
      lookup,
      "27053",
    );
    assert.equal(delivery.sourceByteCount, candidate.byteCount);
    assert.equal(delivery.sourceSha256, candidate.sha256);
    assert.ok(delivery.collection.features.length > 0);
    assert.equal(
      delivery.collection.features.every(
        (feature) => feature.properties.parentGeoid === "27053",
      ),
      true,
    );
    assert.equal(delivery.collection.metadata.manifestId, candidate.manifestId);
    assert.equal(delivery.collection.metadata.state, "MN");
  }
});

test("a wrong local candidate is rejected before it can be served", () => {
  configureRehearsal();
  const candidate = MINNESOTA_PRECINCT_REHEARSAL_CANDIDATES[3];
  const lookup = findMinnesotaPrecinctRehearsalManifest(
    registry,
    candidate.manifestId,
  );
  assert.ok(lookup);
  assert.throws(
    () => verifyMinnesotaPrecinctRehearsalCandidateBytes(
      lookup,
      Buffer.from("not pinned"),
    ),
    /byte count does not match its pin/,
  );
});

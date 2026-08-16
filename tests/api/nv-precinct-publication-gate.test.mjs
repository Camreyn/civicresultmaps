import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  guardedLocalGeographyMatchMethods,
  matchesPrecinctGeometryPublicationMetadata,
  precinctGeometryPublicManifestSha256,
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

function manifest() {
  return {
    schemaVersion: 1,
    id: "nv-2024-11-05-general-precinct-geometry-candidate-v1",
    state: "NV",
    election: {
      id: "2024-11-05-general",
      date: "2024-11-05",
      year: 2024,
      type: "general",
      office: "president",
    },
    geography: {
      level: "precinct",
      parentLevel: "county",
      boundaryVintage: "Nevada LCB 2024 Precincts snapshot published April 5, 2024",
      vintageStatus: "election_date_confirmed",
      derivationMethod: "official_service",
    },
    source: {},
    normalization: { featureCount: 2 },
    crosswalk: {},
    validation: {},
    delivery: {
      format: "parent_scoped_geojson",
      url: "/data/geography/nv/2024-11-05/precinct/candidate/index.json",
      sha256: "1".repeat(64),
      byteCount: 123,
      featureIdProperty: "geometryFeatureId",
      resultUnitProperty: "resultUnitCode",
      parentGeoidProperty: "parentGeoid",
      parentCount: 1,
      featureCount: 2,
    },
    caveats: [],
  };
}

function metadata(value) {
  const releaseSha256 = "2".repeat(64);
  return {
    manifestId: value.id,
    publicDeliveryAuthorized: true,
    normalization: { featureCount: value.delivery.featureCount },
    crosswalk: { reviewedRelationships: value.delivery.featureCount },
    releaseCandidate: {
      id: "nv-precinct-gis-three-election-v2",
      sha256: releaseSha256,
      publicDeliveryAuthorized: true,
    },
    publicActivation: {
      activationId: "nv-public-2024",
      activationCandidateSha256: "3".repeat(64),
      releasePackageSha256: releaseSha256,
      blobPublicationSha256: "4".repeat(64),
      deliveryOrigin: "https://example.public.blob.vercel-storage.com",
      authorizationSha256: "5".repeat(64),
      changedAtUtc: "2026-08-11T04:00:00.000Z",
      revision: 43,
      mode: "publish",
      year: value.election.year,
      manifestId: value.id,
      publicManifestSha256: precinctGeometryPublicManifestSha256(value),
      delivery: value.delivery,
      previousCaveat: "blocked pending release",
    },
  };
}

test("Nevada precinct results and geometry use the guarded publication path", () => {
  const value = manifest();
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "NV", level: "precinct" }),
    true,
  );
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "nv", level: "precinct" }),
    true,
  );
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "NV", level: "county" }),
    false,
  );
  assert.equal(requiresPrecinctGeometryPublicationGate(value), true);
  assert.equal(matchesPrecinctGeometryPublicationMetadata(value, metadata(value)), true);

  const foreignRelease = metadata(value);
  foreignRelease.releaseCandidate.id = "mn-precinct-gis-four-election-v1";
  assert.equal(
    matchesPrecinctGeometryPublicationMetadata(value, foreignRelease),
    false,
  );
});

test("Nevada exact reviewed rows are accepted only inside the full public gate", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  assert.deepEqual(guardedLocalGeographyMatchMethods("NV"), [
    "exact_official_id",
    "official_crosswalk",
  ]);
  assert.match(source, /reviewedMatchMethods/);
  assert.equal(
    (source.match(/gate_version\.status = 'published'/g) ?? []).length,
    2,
  );
  assert.match(source, /geography_versions\.status = 'published'/);
  assert.match(source, /authorizedLinkCount/);
  assert.match(source, /publicActivation'->>'publicManifestSha256'/);
});

test("Minnesota rehearsal cannot bypass the Nevada publication gate", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  assert.match(
    source,
    /input\.state\.toUpperCase\(\) === "MN"\s*\? resolveMinnesotaPrecinctRehearsal\(\)/,
  );
  assert.doesNotMatch(
    source,
    /requiresPrecinctResultPublicationGate\(input\)\s*&&\s*!resolveMinnesotaPrecinctRehearsal\(\)\.enabled/,
  );
});

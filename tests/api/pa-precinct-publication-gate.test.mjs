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
    id: "pa-2020-11-03-reviewed-precinct-geometry-v1",
    state: "PA",
    election: { id: "2020-11-03-general", date: "2020-11-03", year: 2020, type: "general", office: "president" },
    geography: { level: "precinct", parentLevel: "county", boundaryVintage: "reviewed", vintageStatus: "election_date_confirmed", derivationMethod: "secondary_reconstruction" },
    source: {},
    normalization: { featureCount: 2 },
    crosswalk: {},
    validation: {},
    delivery: {
      format: "parent_scoped_geojson",
      url: "/data/geography/pa/2020-11-03/precinct/candidate/index.json",
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
    normalization: { featureCount: 2 },
    crosswalk: { reviewedRelationships: 2 },
    releaseCandidate: { id: "pa-precinct-gis-two-election-v1", sha256: releaseSha256, publicDeliveryAuthorized: true },
    publicActivation: {
      activationId: "pa-precinct-public-2020",
      activationCandidateSha256: "3".repeat(64),
      releasePackageSha256: releaseSha256,
      blobPublicationSha256: "4".repeat(64),
      deliveryOrigin: "https://example.public.blob.vercel-storage.com",
      authorizationSha256: "5".repeat(64),
      changedAtUtc: "2026-08-12T23:59:00.000Z",
      revision: 50,
      mode: "publish",
      year: 2020,
      manifestId: value.id,
      publicManifestSha256: precinctGeometryPublicManifestSha256(value),
      delivery: value.delivery,
      previousCaveat: "blocked pending release",
    },
  };
}

test("Pennsylvania precinct unit results and geometry use the guarded publication path", () => {
  const value = manifest();
  assert.equal(requiresPrecinctResultPublicationGate({ state: "PA", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "PA", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate(value), true);
  assert.deepEqual(guardedLocalGeographyMatchMethods("PA"), [
    "exact_official_id",
    "official_crosswalk",
  ]);
  assert.deepEqual(guardedLocalGeographyMatchMethods("AK"), [
    "exact_official_id",
    "official_crosswalk",
  ]);
  assert.equal(matchesPrecinctGeometryPublicationMetadata(value, metadata(value)), true);
  const foreign = metadata(value);
  foreign.releaseCandidate.id = "nv-precinct-gis-three-election-v2";
  assert.equal(matchesPrecinctGeometryPublicationMetadata(value, foreign), false);
});

test("Minnesota rehearsal cannot bypass the Pennsylvania publication gate", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  assert.match(source, /input\.state\.toUpperCase\(\) === "MN"\s*\? resolveMinnesotaPrecinctRehearsal\(\)/);
  assert.doesNotMatch(source, /requiresPrecinctResultPublicationGate\(input\)\s*&&\s*!resolveMinnesotaPrecinctRehearsal\(\)\.enabled/);
});

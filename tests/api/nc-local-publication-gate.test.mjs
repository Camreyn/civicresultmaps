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
    id: "nc-2012-11-06-reviewed-vtd-geometry-v1",
    state: "NC",
    election: { id: "2012-11-06-general", date: "2012-11-06", year: 2012, type: "general", office: "president" },
    geography: { level: "vtd", parentLevel: "county", boundaryVintage: "reviewed", vintageStatus: "election_date_confirmed", derivationMethod: "secondary_reconstruction" },
    source: {},
    normalization: { featureCount: 2 },
    crosswalk: {},
    validation: {},
    delivery: {
      format: "parent_scoped_geojson",
      url: "/data/geography/nc/2012-11-06/vtd/candidate/index.json",
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
    releaseCandidate: { id: "nc-local-gis-three-election-v1", sha256: releaseSha256, publicDeliveryAuthorized: true },
    publicActivation: {
      activationId: "nc-local-public-2012",
      activationCandidateSha256: "3".repeat(64),
      releasePackageSha256: releaseSha256,
      blobPublicationSha256: "4".repeat(64),
      deliveryOrigin: "https://example.public.blob.vercel-storage.com",
      authorizationSha256: "5".repeat(64),
      changedAtUtc: "2026-08-12T23:59:00.000Z",
      revision: 50,
      mode: "publish",
      year: 2012,
      geographyLevel: "vtd",
      manifestId: value.id,
      publicManifestSha256: precinctGeometryPublicManifestSha256(value),
      delivery: value.delivery,
      previousCaveat: "blocked pending release",
    },
  };
}

test("North Carolina local geography unit results and geometry use the guarded publication path", () => {
  const value = manifest();
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NC", level: "precinct" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NC", level: "vtd" }), true);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "ME", level: "precinct" }), false);
  assert.equal(requiresPrecinctResultPublicationGate({ state: "NC", level: "county" }), false);
  assert.equal(requiresPrecinctGeometryPublicationGate(value), true);
  assert.deepEqual(guardedLocalGeographyMatchMethods("NC"), [
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

test("Minnesota rehearsal cannot bypass the North Carolina publication gate", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  assert.match(source, /input\.state\.toUpperCase\(\) === "MN"\s*\? resolveMinnesotaPrecinctRehearsal\(\)/);
  assert.doesNotMatch(source, /requiresPrecinctResultPublicationGate\(input\)\s*&&\s*!resolveMinnesotaPrecinctRehearsal\(\)\.enabled/);
});

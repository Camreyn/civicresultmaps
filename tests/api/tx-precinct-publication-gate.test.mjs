import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchesPrecinctGeometryPublicationMetadata,
  precinctGeometryPublicManifestSha256,
  requiresPrecinctGeometryPublicationGate,
  requiresPrecinctResultPublicationGate,
} from "../../src/lib/precinct-result-publication.ts";

function manifest() {
  return {
    schemaVersion: 1,
    id: "tx-2024-11-05-tlc-vtd-geometry-candidate-v2",
    state: "TX",
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
      boundaryVintage: "2024 Primary & General Elections VTDs",
      vintageStatus: "election_date_confirmed",
      derivationMethod: "official_export",
    },
    source: {},
    normalization: { featureCount: 2 },
    crosswalk: {},
    validation: {},
    delivery: {
      format: "parent_scoped_geojson",
      url: "/data/geography/tx/2024-11-05/precinct/candidate/index.json",
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
      id: "tx-precinct-gis-four-election-v1",
      sha256: releaseSha256,
      publicDeliveryAuthorized: true,
    },
    publicActivation: {
      activationId: "tx-public-2024",
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

test("Texas precinct results and geometry use the guarded publication path", () => {
  const value = manifest();
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "TX", level: "precinct" }),
    true,
  );
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "tx", level: "precinct" }),
    true,
  );
  assert.equal(
    requiresPrecinctResultPublicationGate({ state: "TX", level: "county" }),
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

test("Texas official_crosswalk rows are accepted only inside the full public gate", () => {
  const source = readFileSync("src/lib/data-access.ts", "utf8");
  assert.equal(
    (source.match(/'official_crosswalk'/g) ?? []).length,
    3,
  );
  assert.equal(
    (source.match(/gate_version\.status = 'published'/g) ?? []).length,
    2,
  );
  assert.match(source, /geography_versions\.status = 'published'/);
  assert.match(source, /authorizedLinkCount/);
  assert.match(source, /publicActivation'->>'publicManifestSha256'/);
});

test("Minnesota rehearsal cannot bypass the Texas publication gate", () => {
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

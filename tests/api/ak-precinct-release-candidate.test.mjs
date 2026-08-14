import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  ALASKA_DELIVERY_COORDINATE_DECIMALS,
  ALASKA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/ak-precinct-release-candidate.mjs";
import { buildAlaskaTestReleaseFixture } from "./ak-precinct-release-fixture.mjs";

const { built } = await buildAlaskaTestReleaseFixture();

test("Alaska release candidate freezes four complete House-District-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "ak-precinct-gis-four-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 4,
    houseDistrictParentsPerElection: 40,
    reportingUnits: 2205,
    candidateResultRows: 12021,
    zeroVoteUnits: 2,
    geometryFeatures: 1722,
    reviewedRelationships: 2205,
    deliveryIndexes: 4,
    parentDeliveryArtifacts: 160,
  });
  assert.equal(built.deliveryAssets.length, 164);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 40);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 40);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, ALASKA_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= ALASKA_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Alaska draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 4);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 40);
    assert.equal(value.geography.level, "precinct");
    assert.equal(value.crosswalk.reviewedNoDataFeatures, 0);
  }
});

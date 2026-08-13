import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  IOWA_DELIVERY_COORDINATE_DECIMALS,
  IOWA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/ia-precinct-release-candidate.mjs";
import { buildIowaTestReleaseFixture } from "./ia-precinct-release-fixture.mjs";

const { built } = await buildIowaTestReleaseFixture();

test("Iowa release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "ia-precinct-gis-three-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyEquivalentsPerElection: 99,
    reportingUnits: 4994,
    candidateResultRows: 14982,
    zeroVoteUnits: 0,
    geometryFeatures: 4994,
    reviewedExactCrosswalks: 4994,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 297,
  });
  assert.equal(built.deliveryAssets.length, 300);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 99);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 99);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, IOWA_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= IOWA_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Iowa draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 99);
    assert.equal(value.crosswalk.reviewedNoDataFeatures, 0);
  }
});

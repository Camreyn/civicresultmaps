import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  MAINE_DELIVERY_COORDINATE_DECIMALS,
  MAINE_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/me-local-release-candidate.mjs";
import { buildMaineTestReleaseFixture } from "./me-local-release-fixture.mjs";

const { built } = await buildMaineTestReleaseFixture();

test("Maine release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "me-local-reporting-gis-three-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyEquivalentsPerElection: 16,
    reportingUnits: 1542,
    candidateResultRows: 4626,
    zeroVoteUnits: 1,
    geometryFeatures: 1542,
    reviewedExactCrosswalks: 1542,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 48,
  });
  assert.equal(built.deliveryAssets.length, 51);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 16);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 16);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, MAINE_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= MAINE_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Maine draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 16);
    assert.equal(value.geography.level, "local_reporting_unit");
    assert.equal(value.crosswalk.reviewedNoDataFeatures, 0);
  }
});

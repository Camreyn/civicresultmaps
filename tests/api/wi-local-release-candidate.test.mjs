import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  WISCONSIN_DELIVERY_COORDINATE_DECIMALS,
  WISCONSIN_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/wi-local-release-candidate.mjs";
import { buildWisconsinTestReleaseFixture } from "./wi-local-release-fixture.mjs";

const { built } = await buildWisconsinTestReleaseFixture();

test("Wisconsin release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "wi-local-reporting-gis-three-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyParentsPerElection: 72,
    reportingUnits: 10937,
    candidateResultRows: 32475,
    zeroVoteUnits: 316,
    geometryFeatures: 10856,
    reviewedRelationships: 10937,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 216,
  });
  assert.equal(built.deliveryAssets.length, 219);
  for (const [index, year] of document.years.entries()) {
    assert.equal(year.parentScopedDelivery.parentCount, 72);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 72);
    assert.equal(year.parentScopedDelivery.featureCount, [3648, 3705, 3503][index]);
    assert.equal(year.parentScopedDelivery.deliveryIdentityCount, [3648, 3705, 3503][index]);
    assert.equal(year.parentScopedDelivery.colorableResultUnitCount, [3626, 3696, 3503][index]);
    assert.equal(year.parentScopedDelivery.nonGeographicResultUnitCount, [10, 2, 100][index]);
    assert.equal(year.parentScopedDelivery.reviewedNoDataFeatureCount, [22, 9, 0][index]);
    assert.equal(year.certifiedResults.zeroVoteUnits, [126, 190, 0][index]);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, WISCONSIN_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= WISCONSIN_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Wisconsin draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const [index, draft] of built.draftManifests.entries()) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 72);
    assert.equal(value.geography.level, "local_reporting_unit");
    assert.equal(value.crosswalk.reviewedNoDataFeatures, [22, 9, 0][index]);
  }
});

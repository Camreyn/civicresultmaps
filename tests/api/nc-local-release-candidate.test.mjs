import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  NORTH_CAROLINA_DELIVERY_COORDINATE_DECIMALS,
  NORTH_CAROLINA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/nc-local-release-candidate.mjs";
import { buildNorthCarolinaTestReleaseFixture } from "./nc-local-release-fixture.mjs";

const { built } = await buildNorthCarolinaTestReleaseFixture();

test("North Carolina release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "nc-local-gis-three-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyParentsPerElection: 100,
    reportingUnits: 9285,
    candidateResultRows: 24174,
    zeroVoteUnits: 0,
    geometryFeatures: 8058,
    reviewedRelationships: 9285,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 300,
  });
  assert.equal(built.deliveryAssets.length, 303);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 100);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 100);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, NORTH_CAROLINA_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= NORTH_CAROLINA_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("North Carolina draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 100);
    assert.ok(["vtd", "precinct"].includes(value.geography.level));
    assert.equal(value.crosswalk.reviewedNoDataFeatures, 0);
  }
});

test("North Carolina delivery preserves reviewed no-data shapes without election values", () => {
  const parentCollections = built.deliveryAssets
    .filter((artifact) => artifact.path.includes("/parents/"))
    .map((artifact) => JSON.parse(artifact.bytes.toString("utf8")));
  const noDataFeatures = parentCollections.flatMap((collection) =>
    collection.features.filter((feature) =>
      feature.properties.relationshipType === "no_data"));
  assert.equal(noDataFeatures.length, 0);
  assert.ok(noDataFeatures.every((feature) =>
    feature.properties.resultUnitCode.startsWith("no-data:")
    && !Object.keys(feature.properties).some((key) =>
      /candidate|party|vote/i.test(key))));
  assert.deepEqual(
    built.packageDocument.years.map((year) =>
      year.parentScopedDelivery.colorableResultUnitCount),
    [2692, 2704, 2662],
  );
});

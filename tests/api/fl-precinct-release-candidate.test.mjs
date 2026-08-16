import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  FLORIDA_DELIVERY_COORDINATE_DECIMALS,
  FLORIDA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/fl-precinct-release-candidate.mjs";
import { buildFloridaTestReleaseFixture } from "./fl-precinct-release-fixture.mjs";

const { built } = await buildFloridaTestReleaseFixture();

test("Florida release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "fl-precinct-gis-three-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyParentsPerElection: 67,
    reportingUnits: 17424,
    candidateResultRows: 52272,
    zeroVoteUnits: 140,
    geometryFeatures: 17555,
    reviewedRelationships: 17424,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 201,
  });
  assert.equal(built.deliveryAssets.length, 204);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 67);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 67);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, FLORIDA_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= FLORIDA_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Florida draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 67);
    assert.equal(value.geography.level, "precinct");
    assert.ok([0, 21, 110].includes(value.crosswalk.reviewedNoDataFeatures));
  }
});

test("Florida delivery preserves reviewed no-data shapes without election values", () => {
  const parentCollections = built.deliveryAssets
    .filter((artifact) => artifact.path.includes("/parents/"))
    .map((artifact) => JSON.parse(artifact.bytes.toString("utf8")));
  const noDataFeatures = parentCollections.flatMap((collection) =>
    collection.features.filter((feature) =>
      feature.properties.relationshipType === "no_data"));
  assert.equal(noDataFeatures.length, 131);
  assert.ok(noDataFeatures.every((feature) =>
    feature.properties.resultUnitCode.startsWith("no-data:")
    && !Object.keys(feature.properties).some((key) =>
      /candidate|party|vote/i.test(key))));
  assert.deepEqual(
    built.packageDocument.years.map((year) =>
      year.parentScopedDelivery.colorableResultUnitCount),
    [5852, 5989, 5583],
  );
});

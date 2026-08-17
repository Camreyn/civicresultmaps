import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  PENNSYLVANIA_DELIVERY_COORDINATE_DECIMALS,
  PENNSYLVANIA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/pa-precinct-release-candidate.mjs";
import { buildPennsylvaniaTestReleaseFixture } from "./pa-precinct-release-fixture.mjs";

const { built } = await buildPennsylvaniaTestReleaseFixture();

test("Pennsylvania release candidate freezes two partial county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "pa-precinct-gis-two-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 2,
    countyParentsPerElection: 67,
    reportingUnits: 14819,
    candidateResultRows: 44457,
    zeroVoteUnits: 0,
    geometryFeatures: 18317,
    reviewedRelationships: 14819,
    deliveryIndexes: 2,
    parentDeliveryArtifacts: 134,
  });
  assert.equal(built.deliveryAssets.length, 136);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 67);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 67);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, PENNSYLVANIA_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= PENNSYLVANIA_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Pennsylvania draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 2);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 67);
    assert.equal(value.geography.level, "precinct");
    assert.ok([1153, 2345].includes(value.crosswalk.reviewedNoDataFeatures));
  }
});

test("Pennsylvania delivery preserves reviewed no-data shapes without election values", () => {
  const parentCollections = built.deliveryAssets
    .filter((artifact) => artifact.path.includes("/parents/"))
    .map((artifact) => JSON.parse(artifact.bytes.toString("utf8")));
  const noDataFeatures = parentCollections.flatMap((collection) =>
    collection.features.filter((feature) =>
      feature.properties.relationshipType === "no_data"));
  assert.equal(noDataFeatures.length, 3498);
  assert.ok(noDataFeatures.every((feature) =>
    feature.properties.resultUnitCode.startsWith("no-data:")
    && !Object.keys(feature.properties).some((key) =>
      /candidate|party|vote/i.test(key))));
  assert.deepEqual(
    built.packageDocument.years.map((year) =>
      year.parentScopedDelivery.colorableResultUnitCount),
    [8014, 6805],
  );
});

test("Pennsylvania 2020 Pike County delivery contains only reviewed no-data shapes", () => {
  const year = built.packageDocument.years.find((candidate) => candidate.year === 2020);
  const pike = year.parentScopedDelivery.parentArtifacts.find(
    (artifact) => artifact.parentGeoid === "42103",
  );
  const asset = built.deliveryAssets.find(
    (artifact) => artifact.path === pike.packageRelativePath,
  );
  const collection = JSON.parse(asset.bytes.toString("utf8"));
  assert.equal(collection.features.length, 18);
  assert.ok(collection.features.every((feature) =>
    feature.properties.relationshipType === "no_data"
    && feature.properties.resultUnitCode.startsWith("no-data:")));
});

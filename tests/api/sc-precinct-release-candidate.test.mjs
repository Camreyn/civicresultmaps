import assert from "node:assert/strict";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  SOUTH_CAROLINA_DELIVERY_COORDINATE_DECIMALS,
  SOUTH_CAROLINA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/sc-precinct-release-candidate.mjs";
import { buildSouthCarolinaTestReleaseFixture } from "./sc-precinct-release-fixture.mjs";

const { built } = await buildSouthCarolinaTestReleaseFixture();

test("South Carolina release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "sc-precinct-gis-three-election-v1");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyParentsPerElection: 46,
    reportingUnits: 7396,
    candidateResultRows: 20403,
    zeroVoteUnits: 2,
    geometryFeatures: 6805,
    reviewedRelationships: 7396,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 138,
  });
  assert.equal(built.deliveryAssets.length, 141);
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 46);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 46);
    assert.equal(year.parentScopedDelivery.coordinatePrecisionDecimals, SOUTH_CAROLINA_DELIVERY_COORDINATE_DECIMALS);
    assert.ok(year.parentScopedDelivery.largestParentByteCount <= SOUTH_CAROLINA_MAX_PARENT_DELIVERY_BYTES);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("South Carolina draft manifests are eligible without changing canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes);
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 46);
    assert.equal(value.geography.level, "precinct");
    assert.ok([0, 2].includes(value.crosswalk.reviewedNoDataFeatures));
  }
});

test("South Carolina delivery preserves reviewed no-data shapes without election values", () => {
  const parentCollections = built.deliveryAssets
    .filter((artifact) => artifact.path.includes("/parents/"))
    .map((artifact) => JSON.parse(artifact.bytes.toString("utf8")));
  const noDataFeatures = parentCollections.flatMap((collection) =>
    collection.features.filter((feature) =>
      feature.properties.relationshipType === "no_data"));
  assert.equal(noDataFeatures.length, 4);
  assert.ok(noDataFeatures.every((feature) =>
    feature.properties.resultUnitCode.startsWith("no-data:")
    && !Object.keys(feature.properties).some((key) =>
      /candidate|party|vote/i.test(key))));
  assert.deepEqual(
    built.packageDocument.years.map((year) =>
      year.parentScopedDelivery.colorableResultUnitCount),
    [2232, 2261, 2308],
  );
});

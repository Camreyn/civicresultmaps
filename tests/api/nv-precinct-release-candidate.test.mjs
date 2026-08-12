import assert from "node:assert/strict";
import test from "node:test";
import {
  NEVADA_DELIVERY_COORDINATE_DECIMALS,
  NEVADA_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/nv-precinct-release-candidate.mjs";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { buildNevadaTestReleaseFixture } from "./nv-precinct-release-fixture.mjs";

const { built } = await buildNevadaTestReleaseFixture();

test("Nevada release candidate freezes three complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "nv-precinct-gis-three-election-v2");
  assert.equal(document.state, "NV");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 3,
    countyEquivalentsPerElection: 17,
    reportingUnits: 5288,
    candidateResultRows: 15748,
    zeroVoteUnits: 647,
    geometryFeatures: 5796,
    reviewedExactCrosswalks: 5288,
    deliveryIndexes: 3,
    parentDeliveryArtifacts: 51,
  });
  assert.equal(built.deliveryAssets.length, 54);
  assert.equal(
    built.deliveryAssets.filter((artifact) => artifact.path.endsWith("/index.json")).length,
    3,
  );
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 17);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 17);
    assert.equal(
      year.parentScopedDelivery.coordinatePrecisionDecimals,
      NEVADA_DELIVERY_COORDINATE_DECIMALS,
    );
    assert.ok(
      year.parentScopedDelivery.largestParentByteCount
        <= NEVADA_MAX_PARENT_DELIVERY_BYTES,
    );
    assert.equal(
      year.parentScopedDelivery.parentArtifacts.reduce(
        (count, artifact) => count + artifact.featureCount,
        0,
      ),
      year.reviewedGeometry.featureCount,
    );
    assert.match(year.reviewedGeometry.publicGeographyLabel, /precinct geometry/);
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Nevada public drafts are eligible without mutating canonical manifests", () => {
  assert.equal(built.draftManifests.length, 3);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes.toString("utf8"));
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.geography.level, "precinct");
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 17);
    assert.ok(value.crosswalk.reviewedNoDataFeatures > 0);
  }
});

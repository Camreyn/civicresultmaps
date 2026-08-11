import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTexasPrecinctReleaseCandidate,
  TEXAS_DELIVERY_COORDINATE_DECIMALS,
  TEXAS_MAX_PARENT_DELIVERY_BYTES,
} from "../../scripts/lib/tx-precinct-release-candidate.mjs";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";

const built = await buildTexasPrecinctReleaseCandidate();

test("Texas release candidate freezes four complete county-scoped deliveries", () => {
  const document = built.packageDocument;
  assert.equal(document.id, "tx-precinct-gis-four-election-v1");
  assert.equal(document.state, "TX");
  assert.equal(document.decision, "NO_GO_PRODUCTION");
  assert.deepEqual(document.totals, {
    elections: 4,
    countiesPerElection: 254,
    reportingUnits: 36762,
    candidateResultRows: 110286,
    zeroVoteUnits: 1280,
    geometryFeatures: 36762,
    reviewedExactCrosswalks: 36762,
    deliveryIndexes: 4,
    parentDeliveryArtifacts: 1016,
  });
  assert.equal(built.deliveryAssets.length, 1020);
  assert.equal(
    built.deliveryAssets.filter((artifact) => artifact.path.endsWith("/index.json")).length,
    4,
  );
  for (const year of document.years) {
    assert.equal(year.parentScopedDelivery.parentCount, 254);
    assert.equal(year.parentScopedDelivery.parentArtifacts.length, 254);
    assert.equal(
      year.parentScopedDelivery.coordinatePrecisionDecimals,
      TEXAS_DELIVERY_COORDINATE_DECIMALS,
    );
    assert.ok(
      year.parentScopedDelivery.largestParentByteCount
        <= TEXAS_MAX_PARENT_DELIVERY_BYTES,
    );
    assert.equal(
      year.parentScopedDelivery.parentArtifacts.reduce(
        (count, artifact) => count + artifact.featureCount,
        0,
      ),
      year.certifiedResults.reportingUnits,
    );
    assert.equal(year.reviewedGeometry.officialGeographyLabel, "VTD / precinct approximation");
    assert.equal(year.parentScopedDelivery.electionValuesInDelivery, false);
    assert.equal(year.canonicalManifest.validationStatus, "blocked");
    assert.equal(year.canonicalManifest.delivery, null);
  }
});

test("Texas public drafts are eligible without mutating canonical manifests", () => {
  assert.equal(built.draftManifests.length, 4);
  for (const draft of built.draftManifests) {
    const value = JSON.parse(draft.bytes.toString("utf8"));
    const inspection = inspectPrecinctGeometryManifest(value);
    assert.deepEqual(inspection.errors, []);
    assert.deepEqual(inspection.publicEligibilityReasons, []);
    assert.equal(value.geography.level, "precinct");
    assert.equal(value.delivery.format, "parent_scoped_geojson");
    assert.equal(value.delivery.parentCount, 254);
    assert.match(value.caveats.join(" "), /VTD\/precinct-approximation/i);
  }
});

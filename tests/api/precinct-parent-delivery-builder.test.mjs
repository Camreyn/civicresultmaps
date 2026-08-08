import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParentScopedPrecinctDeliveryPackage,
} from "../../scripts/lib/precinct-parent-delivery-builder.mjs";
import {
  selectPrecinctParentDeliveryArtifact,
} from "../../src/lib/precinct-map-delivery.ts";

function feature(id, parentGeoid) {
  return {
    type: "Feature",
    properties: {
      geometryFeatureId: parentGeoid + "|" + id,
      resultUnitCode:
        "reporting:IA:2024-11-05-general:precinct:"
        + parentGeoid
        + ":"
        + id,
      parentGeoid,
      sourceFeatureId: parentGeoid + "|" + id,
      displayName: "Precinct " + id,
      geographyType: "precinct",
      relationshipType: "one_to_one",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-93.7, 41.5],
        [-93.6, 41.5],
        [-93.6, 41.6],
        [-93.7, 41.5],
      ]],
    },
  };
}

function statewideCollection() {
  return {
    type: "FeatureCollection",
    metadata: {
      schemaVersion: 1,
      manifestId: "ia-2024-11-05-precinct-v1",
      state: "IA",
      electionId: "2024-11-05-general",
      boundaryVintage: "2024-11-05",
      sourceAuthority: "Iowa Secretary of State",
      sourceUrl: "https://example.gov/precincts",
      licenseOrTerms: "Retain this source notice.",
    },
    features: [
      feature("P2", "19001"),
      feature("P1", "19001"),
      feature("P3", "19003"),
    ],
  };
}

test("parent-scoped builder emits deterministic county assets and index", () => {
  const first = buildParentScopedPrecinctDeliveryPackage(
    statewideCollection(),
  );
  const second = buildParentScopedPrecinctDeliveryPackage(
    statewideCollection(),
  );
  assert.equal(first.indexSha256, second.indexSha256);
  assert.equal(first.indexBytes.equals(second.indexBytes), true);
  assert.equal(first.parentCount, 2);
  assert.equal(first.featureCount, 3);
  assert.equal(first.resultUnitCount, 3);
  assert.equal(first.parentArtifacts.length, 2);
  assert.deepEqual(
    first.parentArtifacts.map((artifact) => artifact.parentGeoid),
    ["19001", "19003"],
  );
  assert.equal(
    first.parentArtifacts.every((artifact) =>
      new RegExp(
        "^parents/" + artifact.parentGeoid + "-[a-f0-9]{12}\\.geojson$",
      ).test(artifact.path)),
    true,
  );
  const selected = selectPrecinctParentDeliveryArtifact(
    first.index,
    "19001",
  );
  assert.equal(selected.artifact.featureCount, 2);
  assert.equal(selected.index.metadata.licenseOrTerms, "Retain this source notice.");
});

test("parent-scoped builder rejects invalid parent and duplicate result identity", () => {
  const invalidParent = statewideCollection();
  invalidParent.features[0].properties.parentGeoid = "19";
  assert.throws(
    () => buildParentScopedPrecinctDeliveryPackage(invalidParent),
    /five-digit parentGeoid/,
  );

  const duplicate = statewideCollection();
  duplicate.features[1].properties.resultUnitCode =
    duplicate.features[0].properties.resultUnitCode;
  assert.throws(
    () => buildParentScopedPrecinctDeliveryPackage(duplicate),
    /result-unit identity is not one-to-one/,
  );
});

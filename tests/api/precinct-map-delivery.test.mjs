import assert from "node:assert/strict";
import test from "node:test";
import {
  geographyManifestApiPath,
  joinPrecinctDeliveryResults,
  parentScopedPrecinctDeliveryApiPath,
  selectPrecinctDeliveryFeatures,
} from "../../src/lib/precinct-map-delivery.ts";

function metadata() {
  return {
    schemaVersion: 1,
    manifestId: "ia-2024-11-05-precinct-v1",
    state: "IA",
    electionId: "2024-11-05-general",
    boundaryVintage: "2024-11-05",
    sourceAuthority: "Iowa Secretary of State",
    sourceUrl: "https://example.gov/precincts",
    licenseOrTerms: "Retain this source notice.",
  };
}

function feature(id, parentGeoid = "19001") {
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

function result(code, name = "Precinct P1") {
  return {
    state: "IA",
    year: 2024,
    office: "president",
    level: "precinct",
    jurisdictionCode: code,
    jurisdictionName: name,
    votes: { "Donald J. Trump": 60, "Kamala D. Harris": 40 },
    totalVotes: 100,
    marginVotes: 20,
    marginPct: 20,
    winner: "Donald J. Trump",
    sourceId: "official-results",
  };
}

test("manifest URL is event-scoped and does not request blocked layers", () => {
  assert.equal(
    geographyManifestApiPath({
      state: "ia",
      electionDate: "2024-11-05",
    }),
    "/api/geography-manifests?state=IA&level=precinct&electionDate=2024-11-05",
  );
  assert.doesNotMatch(
    geographyManifestApiPath({ state: "IA" }),
    /includeBlocked/,
  );
});

test("parent-scoped delivery URL requires an explicit manifest and county", () => {
  assert.equal(
    parentScopedPrecinctDeliveryApiPath({
      manifestId: "ia-2024-11-05-precinct-v1",
      parentGeoid: "19001",
    }),
    "/api/precinct-geography?manifestId=ia-2024-11-05-precinct-v1&parentGeoid=19001",
  );
  assert.throws(
    () => parentScopedPrecinctDeliveryApiPath({
      manifestId: "IA unsafe",
      parentGeoid: "19",
    }),
    /manifestId/,
  );
});

test("delivery selection is parent-qualified and bounded", () => {
  const selected = selectPrecinctDeliveryFeatures(
    {
      type: "FeatureCollection",
      metadata: metadata(),
      features: [feature("P1"), feature("P2", "19003")],
    },
    "19001",
  );
  assert.equal(selected.features.length, 1);
  assert.equal(selected.metadata.licenseOrTerms, "Retain this source notice.");
  assert.equal(selected.features[0].properties.parentGeoid, "19001");

  assert.throws(
    () =>
      selectPrecinctDeliveryFeatures(
        {
          type: "FeatureCollection",
          metadata: metadata(),
          features: [feature("P1"), feature("P2")],
        },
        "19001",
        1,
      ),
    /above the safe client limit/,
  );
});

test("delivery joins use explicit resultUnitCode rather than display name", () => {
  const mapFeature = feature("P1");
  const matching = result(
    mapFeature.properties.resultUnitCode,
    "A completely different display name",
  );
  const nonmatching = result(
    "reporting:IA:2024-11-05-general:precinct:19001:P2",
    mapFeature.properties.displayName,
  );
  const joined = joinPrecinctDeliveryResults(
    [mapFeature],
    [nonmatching, matching],
  );
  assert.equal(joined[0].result?.jurisdictionCode, matching.jurisdictionCode);

  assert.throws(
    () => joinPrecinctDeliveryResults([mapFeature], [matching, matching]),
    /duplicate precinct result code/,
  );
});

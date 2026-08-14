import assert from "node:assert/strict";
import test from "node:test";
import {
  geographyManifestApiPath,
  joinPrecinctDeliveryResults,
  parentScopedPrecinctDeliveryApiPath,
  selectPrecinctDeliveryFeatures,
  selectPrecinctParentDeliveryArtifact,
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
  assert.equal(
    parentScopedPrecinctDeliveryApiPath({
      manifestId: "ak-2024-11-05-general-precinct-geometry-candidate-v1",
      parentGeoid: "HD01",
    }),
    "/api/precinct-geography?manifestId=ak-2024-11-05-general-precinct-geometry-candidate-v1&parentGeoid=HD01",
  );
  assert.throws(
    () => parentScopedPrecinctDeliveryApiPath({
      manifestId: "ak-2024-11-05-general-precinct-geometry-candidate-v1",
      parentGeoid: "HD99",
    }),
    /supported county or House District identifier/,
  );
  assert.throws(
    () => parentScopedPrecinctDeliveryApiPath({
      manifestId: "IA unsafe",
      parentGeoid: "19",
    }),
    /manifestId/,
  );
});

test("Alaska delivery selection accepts only House District HD01 through HD40", () => {
  const alaskaMetadata = {
    ...metadata(),
    manifestId: "ak-2024-11-05-general-precinct-geometry-candidate-v1",
    state: "AK",
    sourceAuthority: "Alaska Division of Elections",
  };
  const alaskaFeature = feature("01-001", "HD01");
  alaskaFeature.properties.resultUnitCode =
    "reporting:AK:2024-11-05-general:precinct:HD01:01-001";
  const selected = selectPrecinctDeliveryFeatures({
    type: "FeatureCollection",
    metadata: alaskaMetadata,
    features: [alaskaFeature],
  }, "HD01");
  assert.equal(selected.features.length, 1);

  assert.throws(
    () => selectPrecinctDeliveryFeatures({
      type: "FeatureCollection",
      metadata: alaskaMetadata,
      features: [alaskaFeature],
    }, "02020"),
    /Alaska House District ID/,
  );
  assert.throws(
    () => selectPrecinctDeliveryFeatures({
      type: "FeatureCollection",
      metadata: alaskaMetadata,
      features: [{
        ...alaskaFeature,
        properties: {
          ...alaskaFeature.properties,
          parentGeoid: "HD99",
        },
      }],
    }, "HD01"),
    /Alaska House District ID/,
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

test("parent delivery index is hash-pinned, parent-qualified, and bounded", () => {
  const index = {
    schemaVersion: 1,
    format: "parent_scoped_geojson",
    metadata: metadata(),
    featureIdProperty: "geometryFeatureId",
    resultUnitProperty: "resultUnitCode",
    parentGeoidProperty: "parentGeoid",
    parentCount: 2,
    featureCount: 3,
    parents: [
      {
        parentGeoid: "19001",
        path: "parents/19001-aaaaaaaaaaaa.geojson",
        sha256: "a".repeat(64),
        byteCount: 100,
        featureCount: 2,
      },
      {
        parentGeoid: "19003",
        path: "parents/19003-bbbbbbbbbbbb.geojson",
        sha256: "b".repeat(64),
        byteCount: 80,
        featureCount: 1,
      },
    ],
  };
  const selected = selectPrecinctParentDeliveryArtifact(index, "19001");
  assert.equal(selected.artifact.featureCount, 2);
  assert.equal(selected.index.featureCount, 3);
  assert.throws(
    () => selectPrecinctParentDeliveryArtifact({
      ...index,
      parents: [{
        ...index.parents[0],
        path: "../private.geojson",
      }, index.parents[1]],
    }, "19001"),
    /safe content-addressed parent artifact/,
  );
  assert.throws(
    () => selectPrecinctParentDeliveryArtifact({
      ...index,
      featureCount: 4,
    }, "19001"),
    /feature counts must equal/,
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
    /duplicate local result code/,
  );
});

test("delivery joins accept Maine local reporting units explicitly", () => {
  const mapFeature = feature("ME1", "23001");
  mapFeature.properties.geographyType = "local_reporting_unit";
  mapFeature.properties.resultUnitCode =
    "reporting:ME:2024-11-05-general:local_reporting_unit:23001:ME1";
  const matching = {
    ...result(mapFeature.properties.resultUnitCode, "Auburn"),
    state: "ME",
    level: "local_reporting_unit",
  };
  const joined = joinPrecinctDeliveryResults(
    [mapFeature],
    [matching],
    "local_reporting_unit",
  );
  assert.equal(joined[0].result?.jurisdictionCode, matching.jurisdictionCode);
});

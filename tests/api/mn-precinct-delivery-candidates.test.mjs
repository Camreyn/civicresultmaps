import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  buildPrecinctDeliveryCandidateFeatureCollection,
} from "../../scripts/lib/precinct-delivery-builder.mjs";
import {
  buildMinnesotaPrecinctGisPlan,
} from "../../scripts/lib/mn-precinct-gis-plan.mjs";
import {
  joinPrecinctDeliveryResults,
  selectPrecinctDeliveryFeatures,
} from "../../src/lib/precinct-map-delivery.ts";

const EXPECTED = new Map([
  [2012, { features: 4_102, zeroVoteUnits: 33 }],
  [2016, { features: 4_120, zeroVoteUnits: 31 }],
  [2020, { features: 4_110, zeroVoteUnits: 33 }],
  [2024, { features: 4_103, zeroVoteUnits: 28 }],
]);
const DELIVERY_PROPERTY_KEYS = [
  "displayName",
  "geographyType",
  "geometryFeatureId",
  "parentGeoid",
  "relationshipType",
  "resultUnitCode",
  "sourceFeatureId",
];

function readJsonArtifact(relativePath) {
  const bytes = readFileSync(relativePath);
  const payload = relativePath.endsWith(".gz")
    ? gunzipSync(bytes)
    : bytes;
  return JSON.parse(payload.toString("utf8"));
}

function zeroVoteCodes(resultRows) {
  const totals = new Map();
  for (const row of resultRows) {
    totals.set(
      row.jurisdictionCode,
      (totals.get(row.jurisdictionCode) ?? 0) + row.votes,
    );
  }
  return [...totals]
    .filter(([, total]) => total === 0)
    .map(([code]) => code)
    .sort();
}

test("Minnesota candidate deliveries cover certified identities for all four years", () => {
  const plan = buildMinnesotaPrecinctGisPlan();
  const summaries = [];

  for (const year of plan.years) {
    const expected = EXPECTED.get(year.year);
    assert.ok(expected, "unexpected Minnesota year " + year.year);
    assert.equal(year.manifest.validation.status, "blocked");
    assert.equal(year.manifest.validation.rowLevelRenderingSafe, false);
    assert.equal(year.manifest.delivery, null);
    assert.equal(year.geometry.disposition, "loadable_reviewed");

    const normalized = readJsonArtifact(
      year.manifest.normalization.artifact,
    );
    const crosswalk = readJsonArtifact(year.manifest.crosswalk.artifact);
    const delivery = buildPrecinctDeliveryCandidateFeatureCollection(
      year.manifest,
      normalized,
      crosswalk,
    );

    assert.equal(delivery.features.length, expected.features);
    assert.equal(delivery.metadata.manifestId, year.manifest.id);
    assert.equal(delivery.metadata.state, "MN");
    assert.equal(delivery.metadata.electionId, year.electionId);
    assert.equal(
      delivery.metadata.licenseOrTerms,
      year.manifest.source.licenseOrTerms,
    );
    assert.ok(delivery.metadata.licenseOrTerms.length > 20);

    const actualCodes = delivery.features
      .map((feature) => feature.properties.resultUnitCode)
      .sort();
    const expectedCodes = year.reportingUnits.map((unit) => unit.code).sort();
    assert.deepEqual(actualCodes, expectedCodes);
    assert.equal(new Set(actualCodes).size, expected.features);
    assert.equal(
      new Set(
        delivery.features.map(
          (feature) => feature.properties.geometryFeatureId,
        ),
      ).size,
      expected.features,
    );
    assert.equal(
      new Set(
        delivery.features.map((feature) => feature.properties.parentGeoid),
      ).size,
      87,
    );

    const unitByCode = new Map(
      year.reportingUnits.map((unit) => [unit.code, unit]),
    );
    const mapResultRows = year.reportingUnits.map((unit) => ({
      level: "precinct",
      jurisdictionCode: unit.code,
    }));
    let selectedFeatureCount = 0;
    for (const parentGeoid of new Set(
      delivery.features.map((feature) => feature.properties.parentGeoid),
    )) {
      const selected = selectPrecinctDeliveryFeatures(
        delivery,
        parentGeoid,
      );
      const joined = joinPrecinctDeliveryResults(
        selected.features,
        mapResultRows,
      );
      assert.equal(joined.every((entry) => entry.result !== null), true);
      selectedFeatureCount += selected.features.length;
    }
    assert.equal(selectedFeatureCount, expected.features);
    for (const feature of delivery.features) {
      assert.deepEqual(
        Object.keys(feature.properties).sort(),
        DELIVERY_PROPERTY_KEYS,
      );
      assert.equal(
        feature.properties.displayName,
        unitByCode.get(feature.properties.resultUnitCode)?.sourceDisplayName,
      );
      assert.match(feature.properties.parentGeoid, /^27\d{3}$/);
      assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
      assert.doesNotMatch(
        JSON.stringify(feature.properties),
        /(?:USPRS|candidateName|party|totalVotes|votes)/i,
      );
    }

    const zeroCodes = zeroVoteCodes(year.resultRows);
    assert.equal(zeroCodes.length, expected.zeroVoteUnits);
    assert.equal(
      zeroCodes.every((code) => actualCodes.includes(code)),
      true,
    );

    const bytes = Buffer.from(JSON.stringify(delivery) + "\n", "utf8");
    summaries.push({
      year: year.year,
      featureCount: delivery.features.length,
      zeroVoteUnits: zeroCodes.length,
      byteCount: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  assert.deepEqual(
    summaries.map((summary) => summary.year),
    [2012, 2016, 2020, 2024],
  );
  assert.equal(
    summaries.reduce((sum, summary) => sum + summary.featureCount, 0),
    16_435,
  );
  assert.equal(
    summaries.reduce((sum, summary) => sum + summary.zeroVoteUnits, 0),
    125,
  );
  assert.equal(
    summaries.every((summary) => /^[a-f0-9]{64}$/.test(summary.sha256)),
    true,
  );
});

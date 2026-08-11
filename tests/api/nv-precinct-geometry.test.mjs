import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import {
  joinPrecinctDeliveryResults,
  selectPrecinctDeliveryFeatures,
} from "../../src/lib/precinct-map-delivery.ts";
import {
  buildPrecinctDeliveryCandidateFeatureCollection,
} from "../../scripts/lib/precinct-delivery-builder.mjs";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const RETRIEVED_AT = "2026-08-11T12:00:00.000Z";
const YEARS = [
  {
    year: 2012,
    electionId: "2012-11-06-general",
    features: 2020,
    units: 1760,
    relationships: 1778,
    noDataFeatures: 242,
    exclusions: 263,
    derivationMethod: "hybrid_reconstruction",
    vintageStatus: "unknown",
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    features: 2067,
    units: 2067,
    relationships: 2067,
    noDataFeatures: 0,
    exclusions: 0,
    derivationMethod: "secondary_reconstruction",
    vintageStatus: "election_date_confirmed",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    features: 2094,
    units: 2094,
    relationships: 2094,
    noDataFeatures: 0,
    exclusions: 0,
    derivationMethod: "secondary_reconstruction",
    vintageStatus: "election_date_confirmed",
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    features: 1726,
    units: 1518,
    relationships: 1518,
    noDataFeatures: 208,
    exclusions: 153,
    derivationMethod: "official_service",
    vintageStatus: "election_date_confirmed",
  },
];

function base(spec) {
  return `data/precinct-geometry/NV/${spec.electionId}`;
}

function derivedPaths(spec) {
  return [
    "source-evidence.json",
    "manifest.json",
    `normalized/nv-${spec.year}-precincts.geojson.gz`,
    `normalized/nv-${spec.year}-president-results.json.gz`,
    `crosswalk/nv-${spec.year}-precinct-result-crosswalk.json`,
    `reports/nv-${spec.year}-precinct-geometry-report.json`,
  ];
}

function derivedBytes(spec) {
  return Object.fromEntries(derivedPaths(spec).map((entry) => [
    entry,
    readFileSync(path.join(base(spec), entry)),
  ]));
}

function command(spec, retrievedAt = RETRIEVED_AT) {
  return [
    "--experimental-strip-types",
    "scripts/collect-nv-precinct-geometry.mjs",
    `--year=${spec.year}`,
    `--retrieved-at=${retrievedAt}`,
  ];
}

test("Nevada four-election precinct artifacts replay byte-identically and stay fail-closed", { timeout: 120_000 }, () => {
  for (const spec of YEARS) {
    const before = derivedBytes(spec);
    execFileSync(process.execPath, command(spec), { stdio: "pipe" });
    const after = derivedBytes(spec);
    for (const entry of derivedPaths(spec)) {
      assert.deepEqual(after[entry], before[entry], `${spec.year} ${entry} must replay byte-identically`);
    }

    const manifest = JSON.parse(after["manifest.json"]);
    const report = JSON.parse(after[`reports/nv-${spec.year}-precinct-geometry-report.json`]);
    const crosswalk = JSON.parse(after[`crosswalk/nv-${spec.year}-precinct-result-crosswalk.json`]);
    const geometry = JSON.parse(gunzipSync(after[`normalized/nv-${spec.year}-precincts.geojson.gz`]));
    const results = JSON.parse(gunzipSync(after[`normalized/nv-${spec.year}-president-results.json.gz`]));
    const artifactInspection = validateManifestArtifacts(manifest, { root: process.cwd() });
    const schemaInspection = inspectPrecinctGeometryManifest(manifest);

    assert.deepEqual(artifactInspection.errors, []);
    assert.deepEqual(schemaInspection.errors, []);
    assert.equal(artifactInspection.eligible, false);
    assert.equal(manifest.delivery, null);
    assert.equal(manifest.validation.status, "blocked");
    assert.equal(manifest.validation.rowLevelRenderingSafe, false);
    assert.equal(manifest.geography.derivationMethod, spec.derivationMethod);
    assert.equal(manifest.geography.vintageStatus, spec.vintageStatus);
    assert.equal(manifest.normalization.featureCount, spec.features);
    assert.equal(manifest.crosswalk.resultUnits, spec.units);
    assert.equal(manifest.crosswalk.colorableResultUnits, spec.units);
    assert.equal(manifest.crosswalk.reviewedRelationshipRecords, spec.relationships);
    assert.equal(manifest.crosswalk.reviewedNoDataFeatures, spec.noDataFeatures);
    assert.equal(report.crosswalk.reviewedNoDataFeatures, spec.noDataFeatures);
    assert.equal(report.source.parentCount, 17);
    assert.equal(report.exclusions.count, spec.exclusions);
    assert.equal(geometry.features.length, spec.features);
    assert.equal(results.rows.length, spec.units);
    assert.equal(crosswalk.rows.length, spec.units);
    assert.equal(new Set(geometry.features.map((feature) => feature.properties.CRM_PARENT_GEOID)).size, 17);
    assert.ok(geometry.features.every((feature) => /^32\d{3}$/.test(feature.properties.CRM_PARENT_GEOID)));
    assert.equal(/"(?:votes?|candidate|party|G\d{2}PRE)"/i.test(JSON.stringify(geometry)), false);
    assert.equal(/"(?:votes?|candidate|party|G\d{2}PRE)"/i.test(JSON.stringify(crosswalk)), false);
  }
});

test("Nevada source caveats preserve all four exact external release gates", () => {
  const manifests = Object.fromEntries(YEARS.map((spec) => [
    spec.year,
    JSON.parse(readFileSync(path.join(base(spec), "manifest.json"), "utf8")),
  ]));
  assert.match(manifests[2012].validation.errors.join(" "), /Washoe precinct archive/i);
  assert.match(
    inspectPrecinctGeometryManifest(manifests[2012]).publicEligibilityReasons.join(" "),
    /aggregate precinct rendering is not implemented/i,
  );
  assert.match(manifests[2016].validation.errors.join(" "), /VEST secondary reconstruction/i);
  assert.match(manifests[2020].validation.errors.join(" "), /version-21 custom redistribution terms/i);
  assert.match(manifests[2024].validation.errors.join(" "), /licenseInfo and copyrightText/i);
  assert.equal(manifests[2024].normalization.featureCount - manifests[2024].crosswalk.matchedResultUnits, 208);

  const evidence2016 = JSON.parse(readFileSync(
    path.join(base(YEARS[1]), "source-evidence.json"),
    "utf8",
  ));
  assert.equal(
    evidence2016.resultIdentity.officialStatewideReconciliation.status,
    "statewide_percentages_reconciled",
  );
  assert.deepEqual(
    evidence2016.resultIdentity.officialStatewideReconciliation.normalizedTotals,
    { democratic: 539260, republican: 512058, other: 74067, total: 1125385 },
  );

  const evidence2024 = JSON.parse(readFileSync(
    path.join(base(YEARS[3]), "source-evidence.json"),
    "utf8",
  ));
  assert.equal(
    evidence2024.artifacts.some((artifact) =>
      artifact.localArtifactPath.endsWith("2024-precincts-item-metadata.json")
      && artifact.sha256 === "72b5f30fc8eafb7e790c559858afe94c9f9419a9078ee09a9ee39ea849edef70"),
    true,
  );
});

test("Nevada 2024 delivery preserves all reviewed no-data polygons without inventing results", () => {
  const spec = YEARS[3];
  const manifest = JSON.parse(readFileSync(path.join(base(spec), "manifest.json"), "utf8"));
  const geometry = JSON.parse(gunzipSync(readFileSync(
    path.join(base(spec), `normalized/nv-${spec.year}-precincts.geojson.gz`),
  )));
  const crosswalk = JSON.parse(readFileSync(
    path.join(base(spec), `crosswalk/nv-${spec.year}-precinct-result-crosswalk.json`),
    "utf8",
  ));
  const delivery = buildPrecinctDeliveryCandidateFeatureCollection(
    manifest,
    geometry,
    crosswalk,
  );
  const noData = delivery.features.filter((feature) =>
    feature.properties.relationshipType === "no_data");
  const linked = delivery.features.filter((feature) =>
    feature.properties.relationshipType === "one_to_one");
  assert.equal(delivery.features.length, 1726);
  assert.equal(linked.length, 1518);
  assert.equal(noData.length, 208);
  assert.equal(new Set(noData.map((feature) => feature.properties.resultUnitCode)).size, 208);
  assert.ok(noData.every((feature) => feature.properties.resultUnitCode.startsWith(
    `no-data:${manifest.id}:`,
  )));
  assert.ok(joinPrecinctDeliveryResults(noData, []).every((entry) => entry.result === null));

  const selectedNoData = noData[0];
  const selected = selectPrecinctDeliveryFeatures(
    delivery,
    selectedNoData.properties.parentGeoid,
  );
  assert.ok(selected.features.some((feature) =>
    feature.properties.relationshipType === "no_data"));

  assert.throws(
    () => buildPrecinctDeliveryCandidateFeatureCollection(
      {
        ...manifest,
        crosswalk: { ...manifest.crosswalk, reviewedNoDataFeatures: 207 },
      },
      geometry,
      crosswalk,
    ),
    /no-data feature count 208 does not match manifest 207/,
  );
});

test("Nevada collector rejects an unreviewed retrieval timestamp before writes", () => {
  const spec = YEARS[3];
  const before = derivedBytes(spec);
  assert.throws(
    () => execFileSync(process.execPath, command(spec, "2026-08-10T12:00:00.000Z"), { stdio: "pipe" }),
    /Use --retrieved-at=2026-08-11T12:00:00.000Z/,
  );
  const after = derivedBytes(spec);
  for (const entry of derivedPaths(spec)) assert.deepEqual(after[entry], before[entry]);
});

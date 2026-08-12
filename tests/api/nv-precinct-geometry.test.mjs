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
    features: 2002,
    units: 1760,
    relationships: 1760,
    noDataFeatures: 242,
    exclusions: 263,
    derivationMethod: "hybrid_reconstruction",
    vintageStatus: "unknown",
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    features: 2067,
    units: 1843,
    relationships: 1843,
    noDataFeatures: 224,
    exclusions: 159,
    derivationMethod: "secondary_reconstruction",
    vintageStatus: "election_date_confirmed",
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    features: 2094,
    units: 1869,
    relationships: 1869,
    noDataFeatures: 225,
    exclusions: 143,
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

test("Nevada four-election precinct artifacts replay byte-identically and stay fail-closed", { timeout: 180_000 }, () => {
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

test("Nevada public alternatives resolve every external source gate except the 2012 Washoe vintage", () => {
  const manifests = Object.fromEntries(YEARS.map((spec) => [
    spec.year,
    JSON.parse(readFileSync(path.join(base(spec), "manifest.json"), "utf8")),
  ]));
  assert.match(manifests[2012].validation.errors.join(" "), /Washoe precinct archive/i);
  assert.doesNotMatch(
    inspectPrecinctGeometryManifest(manifests[2012]).publicEligibilityReasons.join(" "),
    /aggregate precinct rendering is not implemented/i,
  );
  for (const year of [2016, 2020, 2024]) {
    assert.deepEqual(manifests[year].validation.errors, [
      "An immutable parent-scoped public delivery package and production release review have not been completed.",
    ]);
  }
  assert.equal(manifests[2024].normalization.featureCount - manifests[2024].crosswalk.matchedResultUnits, 208);

  const evidence2016 = JSON.parse(readFileSync(
    path.join(base(YEARS[1]), "source-evidence.json"),
    "utf8",
  ));
  assert.equal(
    evidence2016.resultIdentity.officialStatewideReconciliation.status,
    "official_precinct_rows_reconciled_to_lcb_context",
  );
  assert.deepEqual(
    evidence2016.resultIdentity.officialStatewideReconciliation.normalizedKnownColorableTotals,
    { democratic: 537405, republican: 510920, other: 73891, total: 1122216 },
  );
  assert.equal(
    evidence2016.artifacts.some((artifact) =>
      artifact.localArtifactPath.endsWith("2016-general-precinct.csv")
      && artifact.authority === "Nevada Secretary of State"
      && artifact.sha256 === "17cf2360147e58211b29556303a2a29d5e2ba0f98d13df78e28a983c0b9dc184"),
    true,
  );
  assert.equal(
    evidence2016.artifacts.some((artifact) =>
      artifact.localArtifactPath.endsWith("dataverse-v89-license-evidence.json")
      && artifact.authority === "Harvard Dataverse / Voting and Election Science Team"
      && artifact.sha256 === "55f331209a2bd2913185b33e8da94ceb26b141bc597a40c424d98cdde134f7b4"),
    true,
  );

  const evidence2020 = JSON.parse(readFileSync(
    path.join(base(YEARS[2]), "source-evidence.json"),
    "utf8",
  ));
  assert.equal(
    evidence2020.artifacts.some((artifact) =>
      artifact.localArtifactPath.endsWith("dataverse-v21-license-evidence.json")
      && artifact.sha256 === "394a78723abad39926d99eb2c7b91a5d7260b6931a403e2217ca063a49497099"),
    true,
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
  assert.equal(
    evidence2024.artifacts.some((artifact) =>
      artifact.localArtifactPath.endsWith("arcgis-online-terms-of-use.html")
      && artifact.sha256 === "3360bbd0c1569c599451f2cccee5b3dc2d4c2fe8ff1c79056196fc663cc8d65b"),
    true,
  );
});

test("Nevada 2012 multipart precincts deliver as one-to-one MultiPolygon features", () => {
  const spec = YEARS[0];
  const manifest = JSON.parse(readFileSync(path.join(base(spec), "manifest.json"), "utf8"));
  const geometry = JSON.parse(gunzipSync(readFileSync(
    path.join(base(spec), `normalized/nv-${spec.year}-precincts.geojson.gz`),
  )));
  const crosswalk = JSON.parse(readFileSync(
    path.join(base(spec), `crosswalk/nv-${spec.year}-precinct-result-crosswalk.json`),
    "utf8",
  ));
  assert.ok(crosswalk.rows.every((row) =>
    row.relationships.length === 1
    && row.relationships[0].relationshipType === "one_to_one"));
  const multipart = geometry.features.filter((feature) =>
    Array.isArray(feature.properties.SOURCE_PART_IDS));
  assert.equal(multipart.length, 5);
  assert.ok(multipart.every((feature) =>
    feature.geometry.type === "MultiPolygon"
    && feature.properties.SOURCE_PART_IDS.length > 1));

  const delivery = buildPrecinctDeliveryCandidateFeatureCollection(
    {
      ...manifest,
      geography: { ...manifest.geography, vintageStatus: "election_date_confirmed" },
      validation: { ...manifest.validation, parentTotalsReconciled: true },
    },
    geometry,
    crosswalk,
  );
  assert.equal(delivery.features.length, 2002);
  assert.equal(delivery.features.filter((feature) =>
    feature.properties.relationshipType === "one_to_one").length, 1760);
  assert.equal(delivery.features.filter((feature) =>
    feature.properties.relationshipType === "no_data").length, 242);
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

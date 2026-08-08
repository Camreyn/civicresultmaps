import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const base = "data/precinct-geometry/MN/2012-11-06-general";
const collector = "scripts/collect-mn-2012-precinct-geometry-reviewed.mjs";
const reviewedAt = "2026-08-06T22:26:35.991Z";
const replayPaths = [
  "source-evidence.json",
  "manifest.json",
  "normalized/mn-2012-11-06-precincts.geojson.gz",
  "crosswalk/mn-2012-11-06-vtdid-to-geometry.json",
  "reports/mn-2012-11-06-precinct-geometry-report.json",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (relative) => JSON.parse(readFileSync(base + "/" + relative, "utf8"));
const runCollector = (extra = []) => execFileSync(
  process.execPath,
  ["--experimental-strip-types", collector, "--offline", "--retrieved-at=" + reviewedAt, ...extra],
  { stdio: "pipe" },
);

test("Minnesota 2012 reviewed package binds all official election polygons to certified VTDIDs", () => {
  const manifest = readJson("manifest.json");
  const evidence = readJson("source-evidence.json");
  const crosswalk = readJson("crosswalk/mn-2012-11-06-vtdid-to-geometry.json");
  const report = readJson("reports/mn-2012-11-06-precinct-geometry-report.json");
  const inspection = validateManifestArtifacts(manifest, { root: process.cwd() });

  assert.deepEqual(inspectPrecinctGeometryManifest(manifest).errors, []);
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.eligible, false);
  assert.equal(manifest.delivery, null);
  assert.equal(manifest.validation.status, "blocked");
  assert.equal(manifest.validation.geometryValid, true);
  assert.equal(manifest.validation.parentTotalsReconciled, true);
  assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
  assert.equal(manifest.normalization.featureCount, 4_102);
  assert.equal(manifest.crosswalk.status, "reviewed");
  assert.equal(manifest.crosswalk.relationships.oneToOne, 4_102);
  assert.equal(manifest.crosswalk.relationships.pendingReview, 0);

  assert.equal(evidence.artifacts.length, 6);
  assert.equal(evidence.sourceTerms.catalogArtifactId, "lcc-catalog");
  assert.equal(evidence.sourceTerms.metadataArtifactId, "lcc-election-metadata");
  assert.equal(
    manifest.source.licenseOrTerms,
    evidence.sourceTerms.catalogDisclaimer + " "
      + evidence.sourceTerms.datasetDisclaimer,
  );
  assert.match(
    manifest.source.licenseOrTerms,
    /Minnesota Government Data Practices Act/,
  );
  for (const artifact of evidence.artifacts) {
    const bytes = readFileSync(artifact.localArtifactPath);
    assert.equal(bytes.length, artifact.byteCount);
    assert.equal(sha256(bytes), artifact.sha256);
    assert.match(artifact.url, /^https:\/\//);
  }
  const archive = evidence.artifacts.find((artifact) => artifact.id === "lcc-election-results-archive");
  assert.equal(archive.byteCount, 10_597_465);
  assert.equal(archive.sha256, "da4d32bda959fe27f1da022c65919bc41cae58e3e3e2773f7cef2d1227dd369b");
  assert.equal(evidence.geometry.sourceFeatures, 4_102);
  assert.deepEqual(evidence.geometry.geometryKinds, { MultiPolygon: 356, Polygon: 3_746 });
  assert.equal(evidence.exactIdComparison.exactVtdidMatches, 4_102);
  assert.deepEqual(evidence.exactIdComparison.geometryOnly, []);
  assert.deepEqual(evidence.exactIdComparison.resultOnly, []);
  assert.deepEqual(evidence.exactIdComparison.nonbindingPCTNAMEMismatches, ["270532120", "270532125"]);
  assert.equal(evidence.certifiedResultTotals.USPRSTOTAL, 2_936_561);
  assert.equal(evidence.certifiedResultTotals.TOTVOTING, 2_950_780);

  assert.equal(crosswalk.rows.length, 4_102);
  assert.equal(crosswalk.reconciliation.status, "passed");
  assert.equal(crosswalk.reconciliation.scopes.length, 88);
  assert.ok(crosswalk.reconciliation.scopes.every((scope) =>
    Object.values(scope.deltas).every((value) => value === 0)));
  assert.ok(crosswalk.rows.every((row) =>
    row.relationships.length === 1
    && row.relationships[0].relationshipType === "one_to_one"
    && row.relationships[0].matchMethod === "exact_official_id"
    && row.relationships[0].reviewStatus === "reviewed"
    && row.relationships[0].confidence === "high"));

  const normalized = JSON.parse(gunzipSync(readFileSync(manifest.normalization.artifact)));
  assert.equal(normalized.features.length, 4_102);
  assert.equal(new Set(normalized.features.map((feature) => feature.properties.CRM_FEATURE_ID)).size, 4_102);
  assert.doesNotMatch(JSON.stringify(normalized.features.map((feature) => feature.properties)), /USPRS|TOTVOTING/);
  assert.equal(report.source.featureCount, 4_102);
  assert.equal(report.crosswalk.oneToOne, 4_102);
  assert.equal(report.blockers.length, 1);
});

test("Minnesota 2012 reviewed collector requires the fixed review timestamp", () => {
  for (const args of [
    ["--experimental-strip-types", collector, "--offline"],
    ["--experimental-strip-types", collector, "--offline", "--retrieved-at=2026-08-05T00:00:00.000Z"],
  ]) {
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }), /Use --retrieved-at=/);
  }
});

test("Minnesota 2012 reviewed collector rejects source tampering before derived writes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-2012-tamper-"));
  const copiedBase = path.join(root, base);
  try {
    mkdirSync(path.dirname(copiedBase), { recursive: true });
    cpSync(base, copiedBase, { recursive: true });
    const archive = path.join(copiedBase, "raw/lcc-gis/2012generalresults.zip");
    const beforeManifest = readFileSync(path.join(copiedBase, "manifest.json"));
    const tampered = Buffer.from(readFileSync(archive));
    tampered[0] ^= 0xff;
    writeFileSync(archive, tampered);
    assert.throws(() => runCollector(["--root=" + root]), /Pinned source mismatch/);
    assert.deepEqual(readFileSync(path.join(copiedBase, "manifest.json")), beforeManifest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Minnesota 2012 reviewed collector replays byte-identically from retained sources", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-2012-replay-"));
  const copiedBase = path.join(root, base);
  try {
    mkdirSync(path.dirname(copiedBase), { recursive: true });
    cpSync(base, copiedBase, { recursive: true });
    runCollector(["--root=" + root]);
    for (const relative of replayPaths) {
      assert.deepEqual(
        readFileSync(path.join(copiedBase, relative)),
        readFileSync(base + "/" + relative),
        relative + " must replay byte-identically",
      );
    }
    assert.ok(statSync(path.join(copiedBase, "manifest.json")).size > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

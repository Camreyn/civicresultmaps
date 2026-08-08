import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const base = "data/precinct-geometry/MN/2020-11-03-general";
const collector = "scripts/collect-mn-2020-precinct-geometry-reviewed.mjs";
const reviewedAt = "2026-08-06T22:26:35.991Z";
const replayPaths = [
  "source-evidence.json",
  "manifest.json",
  "normalized/mn-2020-11-03-precincts.geojson.gz",
  "crosswalk/mn-2020-11-03-vtdid-to-geometry.json",
  "reports/mn-2020-11-03-precinct-geometry-report.json",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (relative) => JSON.parse(readFileSync(base + "/" + relative, "utf8"));
const runCollector = (extra = []) => execFileSync(
  process.execPath,
  ["--experimental-strip-types", collector, "--offline", "--retrieved-at=" + reviewedAt, ...extra],
  { stdio: "pipe" },
);

test("Minnesota 2020 reviewed package uses LCC geometry identity and certified SOS votes only", () => {
  const manifest = readJson("manifest.json");
  const evidence = readJson("source-evidence.json");
  const crosswalk = readJson("crosswalk/mn-2020-11-03-vtdid-to-geometry.json");
  const report = readJson("reports/mn-2020-11-03-precinct-geometry-report.json");
  const inspection = validateManifestArtifacts(manifest, { root: process.cwd() });

  assert.deepEqual(inspectPrecinctGeometryManifest(manifest).errors, []);
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.eligible, false);
  assert.equal(manifest.delivery, null);
  assert.equal(manifest.validation.status, "blocked");
  assert.equal(manifest.validation.geometryValid, true);
  assert.equal(manifest.validation.parentTotalsReconciled, true);
  assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
  assert.equal(manifest.normalization.featureCount, 4_110);
  assert.equal(manifest.crosswalk.status, "reviewed");
  assert.equal(manifest.crosswalk.relationships.oneToOne, 4_110);
  assert.equal(manifest.crosswalk.relationships.pendingReview, 0);

  assert.equal(evidence.artifacts.length, 6);
  assert.equal(evidence.sourceTerms.catalogArtifactId, "lcc-catalog");
  assert.equal(
    manifest.source.licenseOrTerms,
    evidence.sourceTerms.catalogDisclaimer,
  );
  assert.match(
    manifest.source.licenseOrTerms,
    /not to transmit this data.*copy of this disclaimer/,
  );
  for (const artifact of evidence.artifacts) {
    const bytes = readFileSync(artifact.localArtifactPath);
    assert.equal(bytes.length, artifact.byteCount);
    assert.equal(sha256(bytes), artifact.sha256);
    assert.match(artifact.url, /^https:\/\//);
  }
  const archive = evidence.artifacts.find((artifact) => artifact.id === "lcc-preliminary-election-geometry");
  assert.equal(archive.byteCount, 7_154_860);
  assert.equal(archive.sha256, "46e499b0fabed602e09196c0aa15aa55bbce50c798e1238dffcbd39cddb14a3c");
  assert.equal(evidence.resultIdentity.resultUnits, 4_110);
  assert.equal(evidence.resultIdentity.zeroVoteResultUnits, 33);
  assert.equal(evidence.resultIdentity.presidentialVotes, 3_277_171);
  assert.equal(evidence.resultIdentity.voteAuthority, "Certified SOS workbook only");
  assert.deepEqual(evidence.preliminaryDiagnostic, {
    preliminaryPresidentVotes: 3_279_182,
    certifiedPresidentVotes: 3_277_171,
    totalDelta: 2_011,
    absoluteTotalDelta: 8_271,
    differingPresidentialVectorVtdids: 1_026,
    differingPresidentTotalVtdids: 1_021,
    voteUse: "Geometry/identity only; no preliminary vote field is emitted into normalized geometry, crosswalk, or reconciliation.",
  });

  assert.equal(crosswalk.rows.length, 4_110);
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
  assert.doesNotMatch(JSON.stringify(crosswalk), /"votes"\s*:/);

  const normalized = JSON.parse(gunzipSync(readFileSync(manifest.normalization.artifact)));
  assert.equal(normalized.features.length, 4_110);
  assert.equal(new Set(normalized.features.map((feature) => feature.properties.CRM_FEATURE_ID)).size, 4_110);
  assert.doesNotMatch(JSON.stringify(normalized.features.map((feature) => feature.properties)), /USPRS|TOTVOTING/);
  assert.deepEqual(report.geometryKinds, { Polygon: 3_693, MultiPolygon: 417 });
  assert.equal(report.sourceFeatureCount, 4_110);
  assert.equal(report.matchedResultUnits, 4_110);
  assert.equal(report.zeroVoteResultUnits, 33);
});

test("Minnesota 2020 reviewed collector requires the fixed review timestamp", () => {
  for (const args of [
    ["--experimental-strip-types", collector, "--offline"],
    ["--experimental-strip-types", collector, "--offline", "--retrieved-at=2026-08-05T00:00:00.000Z"],
  ]) {
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }), /Use --retrieved-at=/);
  }
});

test("Minnesota 2020 reviewed collector rejects source tampering before derived writes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-2020-tamper-"));
  const copiedBase = path.join(root, base);
  try {
    mkdirSync(path.dirname(copiedBase), { recursive: true });
    cpSync(base, copiedBase, { recursive: true });
    const archive = path.join(copiedBase, "raw/lcc-gis/PreliminaryElectionResults2020.zip");
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

test("Minnesota 2020 reviewed collector replays byte-identically from retained sources", () => {
  const root = mkdtempSync(path.join(tmpdir(), "crm-mn-2020-replay-"));
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

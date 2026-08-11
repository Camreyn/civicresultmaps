import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const base = "data/precinct-geometry/TX/2024-11-05-general";
const retrieval = "2026-08-11T02:49:35.000Z";
const derivedPaths = [
  "source-evidence.json",
  "manifest.json",
  "normalized/tx-2024-11-05-vtds-candidate.geojson.gz",
  "crosswalk/tx-2024-11-05-vtdkey-reviewed-evidence.json",
  "reports/tx-2024-11-05-vtd-geometry-report.json",
];
const requiredInputs = [
  `${base}/raw/texas-legislative-council/vtds_24pg.zip`,
  `${base}/raw/texas-legislative-council/vtds-package-metadata.json`,
  `${base}/raw/texas-legislative-council/election-data-package-metadata.json`,
  `${base}/raw/texas-legislative-council/precincts24g.zip`,
  "data/tx-2024-general-vtds-election-data.zip",
  "data/tx-2024-official-results/County.json",
];
const bytes = (root = process.cwd()) => Object.fromEntries(
  derivedPaths.map((file) => [file, readFileSync(path.join(root, base, file))]),
);
const command = (root, timestamp = retrieval) => [
  "--experimental-strip-types",
  "scripts/collect-tx-2024-precinct-geometry.mjs",
  `--root=${root}`,
  `--retrieved-at=${timestamp}`,
];

test("Texas 2024 TLC VTD package uses the exact official VTDKEY pairing", () => {
  const before = bytes();
  execFileSync(process.execPath, command(process.cwd()), { stdio: "pipe" });
  const after = bytes();
  for (const file of derivedPaths) assert.deepEqual(after[file], before[file], `${file} must replay byte-identically`);

  const evidence = JSON.parse(after["source-evidence.json"]);
  const manifest = JSON.parse(after["manifest.json"]);
  const report = JSON.parse(after["reports/tx-2024-11-05-vtd-geometry-report.json"]);
  const crosswalk = JSON.parse(after["crosswalk/tx-2024-11-05-vtdkey-reviewed-evidence.json"]);
  const inspection = validateManifestArtifacts(manifest, { root: process.cwd() });
  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(inspectPrecinctGeometryManifest(manifest).errors, []);
  assert.equal(inspection.eligible, false);
  assert.equal(manifest.delivery, null);
  assert.equal(manifest.geography.level, "precinct");
  assert.equal(manifest.geography.vintageStatus, "election_date_confirmed");
  assert.equal(manifest.crosswalk.status, "reviewed");
  assert.equal(manifest.validation.status, "blocked");
  assert.equal(manifest.crosswalk.colorableResultUnits, 9712);
  assert.deepEqual(manifest.crosswalk.relationships, {
    oneToOne: 9712,
    oneToMany: 0,
    manyToOne: 0,
    unmatched: 0,
    nonGeographic: 0,
    sourceAlias: 0,
    pendingReview: 0,
  });
  assert.equal(report.source.geometryFeatureCount, 9712);
  assert.equal(report.source.countyCount, 254);
  assert.equal(report.crosswalk.resultUnits, 9712);
  assert.deepEqual(report.crosswalk.missingGeometryKeys, []);
  assert.deepEqual(report.crosswalk.extraGeometryKeys, []);
  assert.equal(report.crosswalk.identityMismatches, 0);
  assert.equal(report.reconciliation.pairedVtd.scopes.length, 255);
  assert.ok(report.reconciliation.pairedVtd.scopes.every((scope) => scope.deltas.presidentVotes === 0));
  assert.equal(evidence.officialJoinDocumentation.status, "explicit_official_pairing");
  assert.equal(evidence.resultIdentity.presidentVotes, 11_404_528);
  assert.deepEqual(evidence.resultIdentity.candidateTotals, {
    Harris: 4_835_134,
    Oliver: 68_563,
    Stein: 82_698,
    Trump: 6_393_403,
    "Write-In": 24_730,
  });
  assert.equal(evidence.resultIdentity.certifiedComparison.totals.total, 11_388_674);
  assert.equal(evidence.resultIdentity.certifiedComparison.deltas.total, 15_854);
  assert.equal(crosswalk.rows.length, 9712);
  assert.ok(crosswalk.rows.every((row) => row.relationships[0].reviewStatus === "reviewed"));
  assert.ok(crosswalk.rows.every((row) => row.relationships[0].matchMethod === "official_crosswalk"));
  assert.equal(JSON.stringify(crosswalk).includes('"votes"'), false);

  const normalized = JSON.parse(gunzipSync(after["normalized/tx-2024-11-05-vtds-candidate.geojson.gz"]));
  assert.equal(normalized.features.length, 9712);
  assert.equal(new Set(normalized.features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`)).size, 9712);
  assert.ok(normalized.features.every((feature) => /^\d{5}$/.test(feature.properties.CRM_PARENT_GEOID)));
  assert.ok(normalized.features.every((feature) => /^\d+$/.test(feature.properties.CRM_FEATURE_ID)));
  assert.equal(JSON.stringify(normalized).toLowerCase().includes("votes"), false);

  for (const entry of evidence.artifacts) {
    assert.match(entry.sourceUrl, /^https:\/\//);
    const raw = readFileSync(entry.localArtifactPath);
    assert.equal(raw.length, entry.byteCount);
    assert.equal(createHash("sha256").update(raw).digest("hex"), entry.sha256);
  }
});

test("Texas 2024 rejects unreviewed timestamps before writes", () => {
  const before = bytes();
  for (const timestamp of [undefined, "2026-08-10T02:49:35.000Z", "2026-08-12T02:49:35.000Z"]) {
    const invocation = timestamp
      ? command(process.cwd(), timestamp)
      : command(process.cwd()).filter((value) => !value.startsWith("--retrieved-at="));
    assert.throws(
      () => execFileSync(process.execPath, invocation, { stdio: "pipe" }),
      /Use --retrieved-at=2026-08-11T02:49:35.000Z/,
    );
  }
  assert.deepEqual(bytes(), before);
});

test("Texas 2024 rejects copied source tampering before derived writes", () => {
  const alternateRoot = mkdtempSync(path.join(tmpdir(), "crm-tx-2024-tamper-"));
  const canonicalRaw = `${base}/raw/texas-legislative-council/vtds_24pg.zip`;
  const canonicalHash = createHash("sha256").update(readFileSync(canonicalRaw)).digest("hex");
  const canonicalStat = statSync(canonicalRaw);
  try {
    for (const input of requiredInputs) {
      const destination = path.join(alternateRoot, input);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(input, destination, { recursive: false });
    }
    for (const file of derivedPaths) {
      const destination = path.join(alternateRoot, base, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(path.join(base, file), destination, { recursive: false });
    }
    const copiedRaw = path.join(alternateRoot, canonicalRaw);
    const copiedManifest = path.join(alternateRoot, base, "manifest.json");
    const beforeManifest = readFileSync(copiedManifest);
    writeFileSync(copiedRaw, Buffer.concat([readFileSync(copiedRaw), Buffer.from("TAMPERED")]));
    assert.throws(
      () => execFileSync(process.execPath, command(alternateRoot), { stdio: "pipe" }),
      /Raw artifact tampering or upstream drift detected before derived write/,
    );
    assert.deepEqual(readFileSync(copiedManifest), beforeManifest);
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
  const after = statSync(canonicalRaw);
  assert.equal(createHash("sha256").update(readFileSync(canonicalRaw)).digest("hex"), canonicalHash);
  assert.equal(after.mtimeMs, canonicalStat.mtimeMs);
  assert.equal(after.ctimeMs, canonicalStat.ctimeMs);
});

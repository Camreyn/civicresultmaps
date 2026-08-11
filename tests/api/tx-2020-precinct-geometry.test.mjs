import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const base = "data/precinct-geometry/TX/2020-11-03-general";
const paths = ["source-evidence.json", "manifest.json", "normalized/tx-2020-11-03-vtds-candidate.geojson.gz", "crosswalk/tx-2020-11-03-vtdkey-reviewed-evidence.json", "reports/tx-2020-11-03-vtd-geometry-report.json"];
const bytes = () => Object.fromEntries(paths.map((file) => [file, readFileSync(`${base}/${file}`)]));

test("Texas 2020 VTD diagnostic is official-source-specific, replayable, and delivery-null", () => {
  const before = bytes();
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/collect-tx-2020-precinct-geometry-diagnostic.mjs", "--retrieved-at=2026-08-03T03:00:00.000Z"], { stdio: "pipe" });
  const after = bytes();
  for (const file of paths) assert.deepEqual(after[file], before[file], `${file} must replay byte-identically`);
  const evidence = JSON.parse(after["source-evidence.json"]); const manifest = JSON.parse(after["manifest.json"]); const report = JSON.parse(after["reports/tx-2020-11-03-vtd-geometry-report.json"]); const crosswalk = JSON.parse(after["crosswalk/tx-2020-11-03-vtdkey-reviewed-evidence.json"]);
  const inspection = validateManifestArtifacts(manifest, { root: process.cwd() });
  assert.deepEqual(inspection.errors, []); assert.deepEqual(inspectPrecinctGeometryManifest(manifest).errors, []); assert.equal(inspection.eligible, false);
  assert.equal(manifest.normalization.sourceCrs, "NAD_1983_Lambert_Conformal_Conic (NAD83; meters)"); assert.equal(manifest.normalization.servedCrs, "EPSG:4326"); assert.equal(evidence.sourceCrs, manifest.normalization.sourceCrs); assert.equal(evidence.servedCrs, manifest.normalization.servedCrs); assert.equal(report.source.sourceCrs, manifest.normalization.sourceCrs); assert.equal(report.source.servedCrs, manifest.normalization.servedCrs); assert.equal(manifest.delivery, null); assert.equal(manifest.geography.level, "precinct"); assert.equal(manifest.crosswalk.status, "reviewed"); assert.equal(manifest.validation.status, "blocked"); assert.equal(manifest.crosswalk.colorableResultUnits, 9157); assert.equal(report.crosswalk.unmatchedResultUnits, 0); assert.equal(report.crosswalk.nonGeographicResultUnits, 0); assert.equal(report.reconciliation.pairedVtd.scopes[0].deltas.presidentVotes, 0); assert.deepEqual(manifest.crosswalk.relationships, { oneToOne: 9157, oneToMany: 0, manyToOne: 0, unmatched: 0, nonGeographic: 0, sourceAlias: 0, pendingReview: 0 }); assert.equal(evidence.resultIdentity.zeroVoteResultUnits, 353); assert.deepEqual(evidence.resultIdentity.candidateTotals, { Biden: 5257513, Hawkins: 33378, Jorgensen: 126212, Trump: 5889022, "Write-In": 10927 }); assert.deepEqual(evidence.resultIdentity.certifiedComparison.totals, { Trump: 5890347, Biden: 5259126, Jorgensen: 126243, Hawkins: 33396, "Write-In": 5944, total: 11315056 }); assert.deepEqual(evidence.resultIdentity.certifiedComparison.deltas, { Trump: -1325, Biden: -1613, Jorgensen: -31, Hawkins: -18, "Write-In": 4983, total: 1996 }); const normalized = JSON.parse(gunzipSync(after["normalized/tx-2020-11-03-vtds-candidate.geojson.gz"])); assert.equal(normalized.features.length, 9157); assert.equal(new Set(normalized.features.map((feature) => `${feature.properties.CRM_PARENT_GEOID}|${feature.properties.CRM_FEATURE_ID}`)).size, 9157); assert.ok(normalized.features.every((feature) => /^\d{5}$/.test(feature.properties.CRM_PARENT_GEOID) && /^\d+$/.test(feature.properties.CRM_FEATURE_ID))); assert.ok(normalized.features.every((feature) => feature.geometry.bbox[0] >= -180 && feature.geometry.bbox[2] <= 180 && feature.geometry.bbox[1] >= -90 && feature.geometry.bbox[3] <= 90)); assert.equal(JSON.stringify(normalized).includes("votes"), false);
  assert.equal(evidence.officialJoinDocumentation.status, "explicit_official_pairing"); assert.equal(evidence.resultIdentity.certifiedComparison.status, "source_scope_caveat"); assert.equal(crosswalk.rows.length, report.crosswalk.resultUnits); assert.ok(crosswalk.rows.every((row) => row.relationships[0].reviewStatus === "reviewed")); assert.equal(crosswalk.reconciliation.scopes.length, 255); assert.ok(crosswalk.reconciliation.scopes.every((scope) => scope.deltas.presidentVotes === 0)); assert.equal(JSON.stringify(crosswalk).includes('"votes"'), false); assert.equal(crosswalk.rows.length, 9157);
  for (const entry of evidence.artifacts) { assert.match(entry.sourceUrl, /^https:\/\//); const raw = readFileSync(entry.localArtifactPath); assert.equal(raw.length, entry.byteCount); assert.equal(createHash("sha256").update(raw).digest("hex"), entry.sha256); }
});

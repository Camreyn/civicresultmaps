import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";
const base = "data/precinct-geometry/TX/2012-11-06-general", paths = ["source-evidence.json","manifest.json","normalized/tx-2012-11-06-vtds-candidate.geojson.gz","crosswalk/tx-2012-11-06-reviewed-evidence.json","reports/tx-2012-11-06-vtd-geometry-report.json"];
const bytes = (root = process.cwd()) => Object.fromEntries(paths.map((x) => [x, readFileSync(path.join(root, base, x))]));
const command = (root, timestamp = "2026-08-04T00:00:00.000Z") => ["--experimental-strip-types", "scripts/collect-tx-2012-precinct-geometry-diagnostic.mjs", "--offline", `--root=${root}`, `--retrieved-at=${timestamp}`];
test("Texas 2012 TLC VTD diagnostic is pinned, alternate-root replayable, and delivery-null", () => { const before = bytes(); const alternateRoot = mkdtempSync(path.join(tmpdir(), "crm-tx-2012-")); try { cpSync(base, path.join(alternateRoot, base), { recursive: true }); execFileSync(process.execPath, command(alternateRoot), { stdio: "pipe" }); const after = bytes(alternateRoot); for (const p of paths) assert.deepEqual(after[p], before[p], `${p} must replay byte-identically under an alternate root`); const evidence=JSON.parse(after["source-evidence.json"]), manifest=JSON.parse(after["manifest.json"]), report=JSON.parse(after["reports/tx-2012-11-06-vtd-geometry-report.json"]), crosswalk=JSON.parse(after["crosswalk/tx-2012-11-06-reviewed-evidence.json"]); assert.deepEqual(validateManifestArtifacts(manifest,{root:alternateRoot}).errors,[]); assert.deepEqual(inspectPrecinctGeometryManifest(manifest).errors,[]); assert.equal(manifest.delivery,null); assert.equal(manifest.validation.status,"blocked"); assert.equal(manifest.validation.parentTotalsReconciled,true); assert.equal(manifest.geography.level,"precinct"); assert.equal(manifest.geography.vintageStatus,"election_date_confirmed"); assert.equal(evidence.boundaryContext.electionDateApplicabilityEstablished,true); assert.equal(evidence.resultIdentity.certifiedComparison.status,"source_scope_caveat"); assert.equal(report.votesAssigned,0); assert.equal(new Set(crosswalk.rows.map((x)=>x.parentGeoid)).size,254); assert.equal(crosswalk.reconciliation.scopes.length,255); assert.ok(crosswalk.reconciliation.scopes.every((scope)=>scope.deltas.presidentVotes===0)); assert.ok(crosswalk.rows.every((x)=>!JSON.stringify(x).toLowerCase().includes("votes"))); const normalized=JSON.parse(gunzipSync(after["normalized/tx-2012-11-06-vtds-candidate.geojson.gz"])); assert.ok(normalized.features.every((x)=>!JSON.stringify(x.properties).toLowerCase().includes("votes"))); for (const a of evidence.artifacts) { assert.match(a.sourceUrl,/^https:\/\//); const raw=readFileSync(path.join(alternateRoot,a.localArtifactPath)); assert.equal(raw.length,a.byteCount); assert.equal(createHash("sha256").update(raw).digest("hex"),a.sha256); } } finally { rmSync(alternateRoot, { recursive: true, force: true }); } });
test("Texas 2012 rejects unreviewed timestamps before writes", () => { const before = bytes(); for (const timestamp of [undefined, "2026-08-03T00:00:00.000Z", "2026-08-05T00:00:00.000Z"]) assert.throws(() => execFileSync(process.execPath, timestamp ? command(process.cwd(), timestamp) : command(process.cwd()).filter((value) => !value.startsWith("--retrieved-at=")), { stdio: "pipe" }), /Use --retrieved-at=2026-08-04T00:00:00.000Z/); assert.deepEqual(bytes(), before); });
test("Texas 2012 rejects copied raw tampering before copied derived writes without touching canonical raw bytes", () => {
  const raw = `${base}/raw/texas-legislative-council/ftp_election_data_12g.zip`, canonical = readFileSync(raw), canonicalHash = createHash("sha256").update(canonical).digest("hex"), canonicalStat = statSync(raw), alternateRoot = mkdtempSync(path.join(tmpdir(), "crm-tx-2012-tamper-"));
  try {
    cpSync(base, path.join(alternateRoot, base), { recursive: true });
    const copiedRaw = path.join(alternateRoot, raw), copiedDerived = path.join(alternateRoot, base, "manifest.json"), beforeDerived = readFileSync(copiedDerived), original = readFileSync(copiedRaw);
    writeFileSync(copiedRaw, Buffer.concat([original, Buffer.from("TAMPERED")]));
    assert.throws(() => execFileSync(process.execPath, command(alternateRoot), { stdio: "pipe" }), /Raw artifact tampering or upstream drift detected before derived write/);
    assert.deepEqual(readFileSync(copiedDerived), beforeDerived);
  } finally { rmSync(alternateRoot, { recursive: true, force: true }); }
  const after = statSync(raw); assert.equal(createHash("sha256").update(readFileSync(raw)).digest("hex"), canonicalHash); assert.equal(after.mtimeMs, canonicalStat.mtimeMs); assert.equal(after.ctimeMs, canonicalStat.ctimeMs);
});

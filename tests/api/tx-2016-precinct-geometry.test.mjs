import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import JSZip from "jszip";
import shp from "shpjs";
import { inspectPrecinctGeometryManifest } from "../../src/lib/precinct-geography.ts";
import { validateManifestArtifacts } from "../../scripts/lib/precinct-geometry-validation.mjs";

const base = "data/precinct-geometry/TX/2016-11-08-general";
const generated = [
  "raw/texas-legislative-council/ftp_election_data_16g-readme.txt",
  "source-evidence.json",
  "normalized/tx-2016-11-08-vtds-candidate.geojson.gz",
  "crosswalk/tx-2016-11-08-cntyvtd-reviewed-evidence.json",
  "reports/tx-2016-11-08-precinct-geometry-report.json",
  "manifest.json",
];
const bytes = (file) => readFileSync(`${base}/${file}`);
const snapshot = () => Object.fromEntries(generated.map((file) => [file, bytes(file)]));

test("Texas 2016 retains the corrected official CNTYVTD join and source-scope caveat", async () => {
  const before = snapshot();
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/collect-tx-2016-precinct-geometry-diagnostic.mjs", "--offline"], { stdio: "pipe" });
  assert.deepEqual(snapshot(), before, "offline replay must be byte-identical");

  const evidence = JSON.parse(bytes("source-evidence.json").toString("utf8"));
  const manifest = JSON.parse(bytes("manifest.json").toString("utf8"));
  const report = JSON.parse(bytes("reports/tx-2016-11-08-precinct-geometry-report.json").toString("utf8"));
  const crosswalk = JSON.parse(bytes("crosswalk/tx-2016-11-08-cntyvtd-reviewed-evidence.json").toString("utf8"));
  const normalized = JSON.parse(gunzipSync(bytes("normalized/tx-2016-11-08-vtds-candidate.geojson.gz")).toString("utf8"));
  const inspection = validateManifestArtifacts(manifest, { root: process.cwd() });

  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(inspectPrecinctGeometryManifest(manifest).errors, []);
  assert.equal(inspection.eligible, false);
  assert.equal(manifest.delivery, null);
  assert.equal(manifest.validation.status, "blocked");
  assert.equal(manifest.crosswalk.status, "reviewed"); assert.equal(manifest.validation.geometryValid, true); assert.equal(manifest.validation.parentTotalsReconciled, true);
  assert.equal(evidence.retrievedAt, "2026-08-03T06:00:00.000Z");
  assert.deepEqual(evidence.officialJoinDocumentation, {
    status: "explicit_official_pairing",
    actualDocumentedJoin: "CNTYVTD (results cntyvtd field to geometry CNTYVTD field)",
    preliminaryVtdkeyLead: "not used: the retained 2016 readme documents CNTYVTD, not VTDKEY",
    evidenceArtifact: `${base}/raw/texas-legislative-council/ftp_election_data_16g-readme.txt`,
    rawReadmeStatement: "Use the\r\ncommon field name 'CNTYVTD' to join the data.", whitespaceNormalizedReadmeParaphrase: "Use the common field name 'CNTYVTD' to join the data.",
  });
  assert.equal(evidence.resultIdentity.candidateRows, 44705);
  assert.equal(evidence.resultIdentity.targetCandidateResultUnits, 8941);
  assert.equal(evidence.resultIdentity.zeroVoteResultUnits, 285);
  assert.deepEqual(evidence.resultIdentity.candidateTotals, { Clinton: 3877626, Trump: 4684288, Johnson: 283462, Stein: 71546, "Write-In": 64938 });
  assert.deepEqual(evidence.resultIdentity.certifiedComparison.totals, { Trump: 4685047, Clinton: 3877868, Johnson: 283492, Stein: 71558, "Write-In": 51261, total: 8969226 });
  assert.deepEqual(evidence.resultIdentity.certifiedComparison.deltas, { Trump: -759, Clinton: -242, Johnson: -30, Stein: -12, "Write-In": 13677, total: 12634 });
  assert.equal(evidence.resultIdentity.certifiedComparison.status, "source_scope_caveat");
  assert.equal(evidence.geometryCandidate.sourceFeatureCount, 8941);
  assert.deepEqual(evidence.geometryCandidate.geometryTypes, { Polygon: 8941 });
  assert.match(evidence.geometryCandidate.sourceCrs, /Lambert_Conformal_Conic/);
  assert.equal(evidence.exactIdCandidateComparison.exactOfficialCntyVtdPairs, 8941);
  assert.deepEqual(evidence.exactIdCandidateComparison.resultOnly, []);
  assert.deepEqual(evidence.exactIdCandidateComparison.geometryOnly, []);
  assert.equal(evidence.boundaryContext.electionDateApplicabilityEstablished, true);
  assert.equal(evidence.boundaryContext.vintageStatus, "election_date_confirmed");
  assert.equal(normalized.features.length, 8941);
  assert.equal(JSON.stringify(normalized).includes('"Votes"'), false);
  assert.equal(crosswalk.rows.length, 8941);
  assert.equal(JSON.stringify(crosswalk.rows).includes('"votes"'), false);
  assert.ok(crosswalk.rows.every((row) => row.reportingGrain === "precinct" && row.relationships[0].matchMethod === "official_crosswalk"));
  assert.equal(report.target.approvedGeometryFeatures, 8941);
  assert.equal(report.target.approvedMatchedResultUnits, 8941);
  assert.equal(report.target.approvedVoteAssignments, 0);
  assert.equal(report.votesAssigned, 0);
  assert.equal(crosswalk.reconciliation.scopes.length, 255);
  assert.ok(crosswalk.reconciliation.scopes.every((scope) => scope.deltas.presidentVotes === 0));
  for (const artifact of evidence.artifacts) {
    const raw = readFileSync(artifact.localArtifactPath);
    assert.equal(raw.length, artifact.byteCount, `${artifact.localArtifactPath} bytes`);
    assert.equal(createHash("sha256").update(raw).digest("hex"), artifact.sha256, `${artifact.localArtifactPath} SHA-256`);
  }

  const resultsArtifact = evidence.artifacts.find((artifact) => artifact.localArtifactPath.endsWith("ftp_election_data_16g.zip"));
  const geometryArtifact = evidence.artifacts.find((artifact) => artifact.localArtifactPath.endsWith("vtd16g.zip"));
  const resultArchive = await JSZip.loadAsync(readFileSync(resultsArtifact.localArtifactPath));
  const [header, ...lines] = (await resultArchive.file("2016_General_Election_Returns.csv").async("string")).trim().split(/\r?\n/);
  const columns = Object.fromEntries(header.split(",").map((field, index) => [field, index]));
  assert.ok("cntyvtd" in columns);
  const units = new Map(); let presidentRows = 0;
  for (const line of lines) { const row = line.split(","); if (row[columns.Office] !== "President") continue; presidentRows += 1; const key = row[columns.cntyvtd]; const unit = units.get(key) ?? { votes: 0 }; unit.votes += Number(row[columns.Votes]); units.set(key, unit); }
  const geometryCollection = await shp(readFileSync(geometryArtifact.localArtifactPath));
  const features = (Array.isArray(geometryCollection) ? geometryCollection[0] : geometryCollection).features;
  const keys = new Set(features.map((feature) => String(feature.properties.CNTYVTD)));
  assert.equal(presidentRows, 44705);
  assert.equal(units.size, 8941);
  assert.equal([...units.values()].filter((unit) => unit.votes === 0).length, 285);
  assert.equal(features.length, 8941);
  assert.equal(keys.size, 8941);
  assert.equal([...units.keys()].filter((key) => keys.has(key)).length, 8941);
});

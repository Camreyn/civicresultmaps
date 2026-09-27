import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildTraceValue } from "../../tools/civicresultmaps-mcp/trace-value.ts";
import { recordSourceRevision } from "../../tools/civicresultmaps-mcp/source-revisions.ts";
import { createRuntimeContext, McpToolError } from "../../tools/civicresultmaps-mcp/runtime.ts";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const config = {
  code: "ZZ",
  sources: [{ id: "official", authority: "ZZ Elections", url: "https://elections.example.gov/results", localFile: "data/raw.csv", sha256: hash("official bytes"), parser: "csvParser", page: "12", sheetName: "Results", cell: "A1", confidence: "Retained official export." }],
  certifiedResults: { sourceId: "official" },
  historicalBaselines: { sourceId: "official" },
};
const artifact = (overrides = {}) => ({ state: { code: "ZZ" }, election: { year: 2024 }, native: {
  resultRows: [{ jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "official", totalVotes: 11, votes: { A: 7, B: 4 } }],
  reviewRows: [{ county: "Alpha", localUnit: "One", sourceId: "official", totalVotes: 11 }],
  turnoutRows: [{ county: "Alpha", sourceId: "official", ballotsCast: 12 }],
  historicalRows: [{ jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "official", sourceDocumentId: "official", electionYear: 2020, totalVotes: 9 }],
  ...overrides,
} });

async function fixture({ source = true, artifactValue = artifact() } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-trace-"));
  await Promise.all([mkdir(path.join(root, ".etl", "staging"), { recursive: true }), mkdir(path.join(root, "etl", "state-configs"), { recursive: true }), mkdir(path.join(root, "data"), { recursive: true }), mkdir(path.join(root, "scripts"), { recursive: true })]);
  await writeFile(path.join(root, "etl", "state-configs", "zz.json"), JSON.stringify({ ...config, sources: source ? config.sources : [] }));
  await writeFile(path.join(root, ".etl", "staging", "zz-2024-staging.json"), JSON.stringify(artifactValue));
  await writeFile(path.join(root, "data", "raw.csv"), "official bytes");
  await writeFile(path.join(root, "scripts", "parser.py"), "# parser v1\n");
  return root;
}
async function traced(root, input) { return buildTraceValue(createRuntimeContext({ repoRoot: root }), { state: "ZZ", year: 2024, family: "results", field: "totalVotes", jurisdictionTag: "county:001", ...input }); }
async function rejects(work) { await assert.rejects(work, (error) => error instanceof McpToolError); }

test("crm trace value resolves a staged scalar through verified retained evidence", async () => {
  const root = await fixture(); try {
    const report = await traced(root);
    assert.equal(report.status, "resolved"); assert.equal(report.value, 11); assert.equal(report.lineage.status, "verified_retained_artifact");
    assert.equal(report.lineage.actualSha256, hash("official bytes")); assert.equal(report.lineage.declaredSha256, hash("official bytes")); assert.equal(report.publicDisplay.checked, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value reports a missing source without inventing lineage", async () => {
  const root = await fixture({ source: false }); try { const report = await traced(root); assert.equal(report.status, "missing_source"); assert.equal(report.lineage.status, "missing_source"); } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value rejects malformed artifact and reports missing retained artifacts", async () => {
  const root = await fixture(); try {
    await writeFile(path.join(root, ".etl", "staging", "zz-2024-staging.json"), "not json"); await rejects(() => traced(root));
    await writeFile(path.join(root, ".etl", "staging", "zz-2024-staging.json"), JSON.stringify(artifact()));
    await rm(path.join(root, "data", "raw.csv")); const report = await traced(root); assert.equal(report.lineage.status, "retained_artifact_unavailable");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value returns bounded ambiguity candidates and filters historical rows by year", async () => {
  const root = await fixture({ artifactValue: artifact({ resultRows: [{ jurisdictionName: "A", sourceId: "official", totalVotes: 1, votes: { A: 1 } }, { jurisdictionName: "B", sourceId: "official", totalVotes: 2, votes: { A: 2 } }] }) }); try {
    const ambiguous = await traced(root, { jurisdictionTag: undefined }); assert.equal(ambiguous.status, "ambiguous"); assert.equal(ambiguous.candidateCount, 2);
    const historical = await traced(root, { family: "historical", year: 2020, field: "totalVotes" }); assert.equal(historical.value, 9);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value fails closed for a stale digest, unsafe retained path, and unsupported candidate field", async () => {
  const root = await fixture(); try {
    await rejects(() => traced(root, { expectedArtifactDigest: "0".repeat(64) }));
    await rejects(() => traced(root, { field: "votes", candidate: "Missing" }));
    const configPath = path.join(root, "etl", "state-configs", "zz.json"); const changed = JSON.parse(await readFile(configPath)); changed.sources[0].localFile = "../outside.csv"; await writeFile(configPath, JSON.stringify(changed));
    const report = await traced(root); assert.equal(report.lineage.status, "retained_artifact_unavailable"); assert.match(report.lineage.caveats.at(-1), /escapes|repository-relative/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value distinguishes declared artifact hash mismatch from a verified retained artifact", async () => {
  const root = await fixture(); try {
    const configPath = path.join(root, "etl", "state-configs", "zz.json"); const changed = JSON.parse(await readFile(configPath)); changed.sources[0].sha256 = "0".repeat(64); await writeFile(configPath, JSON.stringify(changed));
    const report = await traced(root); assert.equal(report.lineage.status, "retained_artifact_digest_mismatch"); assert.equal(report.lineage.actualSha256, hash("official bytes")); assert.equal(report.lineage.declaredSha256, "0".repeat(64));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value labels observed retained bytes unverified when source metadata lacks a declared hash", async () => {
  const root = await fixture(); try {
    const configPath = path.join(root, "etl", "state-configs", "zz.json"); const changed = JSON.parse(await readFile(configPath)); delete changed.sources[0].sha256; await writeFile(configPath, JSON.stringify(changed));
    const report = await traced(root); assert.equal(report.lineage.status, "retained_artifact_present_digest_unverified"); assert.equal(report.lineage.actualSha256, hash("official bytes")); assert.equal(report.lineage.declaredSha256, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value rejects mismatched config, artifact, and selected-row identities", async () => {
  const root = await fixture(); try {
    const configPath = path.join(root, "etl", "state-configs", "zz.json"); const changed = JSON.parse(await readFile(configPath)); changed.code = "YY"; await writeFile(configPath, JSON.stringify(changed)); await rejects(() => traced(root));
    await writeFile(configPath, JSON.stringify(config)); const stagingPath = path.join(root, ".etl", "staging", "zz-2024-staging.json"); await writeFile(stagingPath, JSON.stringify({ ...artifact(), election: { year: 2020 } })); await rejects(() => traced(root));
    await writeFile(stagingPath, JSON.stringify(artifact({ resultRows: [{ jurisdictionTag: "county:001", stateCode: "YY", sourceId: "official", totalVotes: 1, votes: { A: 1 } }] }))); await rejects(() => traced(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value rejects escaped staging and config directory junctions before parsing", async () => {
  const root = await fixture(); const outside = await mkdtemp(path.join(os.tmpdir(), "crm-trace-junction-")); try {
    await mkdir(path.join(outside, "staging")); await writeFile(path.join(outside, "staging", "zz-2024-staging.json"), JSON.stringify(artifact()));
    await rm(path.join(root, ".etl", "staging"), { recursive: true }); await symlink(path.join(outside, "staging"), path.join(root, ".etl", "staging"), "junction");
    await rejects(() => traced(root));
    await rm(path.join(root, ".etl", "staging"), { recursive: true }); await mkdir(path.join(root, ".etl", "staging")); await writeFile(path.join(root, ".etl", "staging", "zz-2024-staging.json"), JSON.stringify(artifact()));
    const configOutside = path.join(outside, "state-configs"); await mkdir(configOutside); await writeFile(path.join(configOutside, "zz.json"), JSON.stringify(config));
    await rm(path.join(root, "etl", "state-configs"), { recursive: true }); await symlink(configOutside, path.join(root, "etl", "state-configs"), "junction");
    await rejects(() => traced(root));
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
test("crm trace value rejects retained symlink escapes", async (t) => {
  const root = await fixture(); const outside = path.join(os.tmpdir(), `crm-trace-outside-${Date.now()}.csv`); try {
    await writeFile(outside, "outside"); await rm(path.join(root, "data", "raw.csv"));
    try { await symlink(outside, path.join(root, "data", "raw.csv"), "file"); } catch { t.skip("symlink creation unavailable"); return; }
    const report = await traced(root); assert.equal(report.lineage.status, "retained_artifact_unavailable"); assert.match(report.lineage.caveats.at(-1), /outside/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { force: true }); }
});
test("crm trace value adds current immutable revision history without treating source lineage as row lineage", async () => {
  const root = await fixture(); try {
    const context = createRuntimeContext({ repoRoot: root });
    const recorded = await recordSourceRevision(context, { state: "ZZ", sourceId: "official", confirmation: "RECORD_SOURCE_REVISION" });
    const report = await traced(root, { sourceRevisionSha256: recorded.revision.contentSha256 });
    assert.equal(report.sourceRevision.status, "recorded_current"); assert.equal(report.sourceRevision.recordedArtifactIntegrity, "verified"); assert.equal(report.sourceRevision.declaredSourceDigest.status, "verified");
    assert.equal(report.sourceRevision.recordedLineage.page, "12"); assert.equal(report.selectedRowLineage.status, "missing");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value labels missing, corrupt, and stale immutable revisions explicitly", async () => {
  const root = await fixture(); try {
    const context = createRuntimeContext({ repoRoot: root }); const recorded = await recordSourceRevision(context, { state: "ZZ", sourceId: "official", confirmation: "RECORD_SOURCE_REVISION" });
    const missing = await traced(root, { sourceRevisionSha256: "0".repeat(64) }); assert.equal(missing.sourceRevision.status, "absent");
    await writeFile(path.join(root, ".etl", "source-revisions", "zz", "official", recorded.revision.contentSha256, "source.bin"), "tampered");
    const corrupt = await traced(root, { sourceRevisionSha256: recorded.revision.contentSha256 }); assert.equal(corrupt.sourceRevision.status, "integrity_mismatch");
    await writeFile(path.join(root, "data", "raw.csv"), "official bytes");
    await writeFile(path.join(root, ".etl", "source-revisions", "zz", "official", recorded.revision.contentSha256, "source.bin"), "official bytes");
    const configPath = path.join(root, "etl", "state-configs", "zz.json"); const changed = JSON.parse(await readFile(configPath)); changed.sources[0].parser = "newParser"; await writeFile(configPath, JSON.stringify(changed));
    const stale = await traced(root, { sourceRevisionSha256: recorded.revision.contentSha256 }); assert.equal(stale.sourceRevision.status, "recorded_stale"); assert.equal(stale.sourceRevision.stale.parser, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("crm trace value flags a changed observed parser implementation with unchanged parser name", async () => {
  const root = await fixture(); try { const context = createRuntimeContext({ repoRoot: root }); const recorded = await recordSourceRevision(context, { state: "ZZ", sourceId: "official", confirmation: "RECORD_SOURCE_REVISION" }); await writeFile(path.join(root, "scripts", "parser.py"), "# parser v2\n"); const report = await traced(root, { sourceRevisionSha256: recorded.revision.contentSha256 }); assert.equal(report.sourceRevision.status, "recorded_stale"); assert.equal(report.sourceRevision.stale.parser, true); } finally { await rm(root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, utimes, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { buildReleaseReadiness } from "../../tools/civicresultmaps-mcp/release-readiness.ts";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";
const NOW = new Date("2026-09-07T12:00:00.000Z");
test("reports changed values even when canonical row counts match", async () => withFixture(async (root) => {
    const report = await ready(root, { results: [{ state: "AA", year: 2024, level: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "r", votes: { A: 9 } }] });
    const result = report.states[0].checks.find((check) => check.family === "results");
    assert.equal(result.counts.staged, result.counts.live);
    assert.equal(result.counts.changed, 1);
    assert.equal(report.status, "pass");
}));
test("blocks all-historical replacement that loses a live historical year", async () => withFixture(async (root) => {
    const report = await ready(root, {}, { staged: { historical: [{ state: "AA", electionYear: 2020, sourceLevel: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "h", localUnit: "Alpha" }] } });
    assert.equal(report.status, "fail");
    assert.match(report.blockers.join("\n"), /would remove/i);
}));
test("empty current families preserve live rows rather than projecting deletion", async () => withFixture(async (root) => {
    const report = await ready(root, {}, { staged: { results: [], turnout: [] }, emptyCurrent: true });
    assert.equal(report.states[0].replacementSemantics.results, "preserve_live_when_empty");
    assert.equal(report.states[0].replacementSemantics.turnout, "preserve_live_when_empty");
}));
test("omitted optional historical review rows preserve prior historical-review years", async () => withFixture(async (root) => {
    const report = await ready(root, {}, { staged: { omitHistoricalReview: true } });
    assert.equal(report.states[0].replacementSemantics.historicalReview, "preserve_live_when_empty");
    assert.equal(report.states[0].checks.some((entry) => entry.family === "review" && entry.year !== 2024), false);
}));
test("source metadata election year scopes historical public-source reads", async () => withFixture(async (root) => {
    const seen = [];
    const sources = familyRows().sources.map((source) => source.id === "h" ? { ...source, metadata: { electionYear: 2016 } } : source);
    await ready(root, {}, { sources, seen });
    assert.ok(seen.some((request) => request.family === "sources" && request.year === 2016));
}));
test("keeps reporting grain distinct and blocks conflicting duplicate canonical identities", async () => withFixture(async (root) => {
    const grain = await ready(root, {}, { staged: { results: [{ state: "AA", level: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "r" }, { state: "AA", level: "precinct", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "r" }] } });
    assert.equal(grain.states[0].checks.filter((entry) => entry.family === "results").length, 9);
    const duplicate = await ready(root, {}, { staged: { results: [{ state: "AA", level: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "r", votes: { A: 1 } }, { state: "AA", level: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "r", votes: { A: 2 } }] } });
    assert.equal(duplicate.status, "fail");
    assert.match(duplicate.blockers.join("\n"), /duplicate identity/i);
}));
test("reads every result level because current-result replacement can remove a live-only level", async () => withFixture(async (root) => {
    const report = await ready(root, {}, { liveByLevel: { district: [{ state: "AA", year: 2024, level: "district", jurisdictionName: "District 1", sourceId: "r", votes: { A: 2 } }] } });
    assert.equal(report.status, "fail");
    assert.match(report.blockers.join("\n"), /results:2024:district would remove/i);
}));
test("fails closed when the staging directory is a junction outside the fixture repository", async () => withFixture(async (root) => {
    const staging = path.join(root, ".etl", "staging"), outside = await mkdtemp(path.join(os.tmpdir(), "crm-release-outside-"));
    try {
        await writeFile(path.join(outside, "aa-2024-staging.json"), "{}", "utf8");
        await rm(staging, { recursive: true, force: true });
        await symlink(outside, staging, "junction");
        const report = await buildReleaseReadiness(createRuntimeContext({ repoRoot: root }), { states: ["AA"] }, { readApi: async () => ({ rows: [], complete: true, source: "database", endpoint: "/api", capturedAt: NOW.toISOString() }) });
        assert.equal(report.status, "fail");
        assert.match(report.blockers.join("\n"), /outside the trusted repository/i);
    }
    finally {
        await rm(outside, { recursive: true, force: true });
    }
}));
test("fails closed for unavailable, seed, and capped public API reads", async () => withFixture(async (root) => {
    for (const mode of ["unavailable", "seed", "capped"]) {
        const report = await ready(root, {}, { mode });
        assert.notEqual(report.status, "pass", mode);
    }
}));
test("requires sources, clean working tree, fresh artifacts, and validation evidence", async () => withFixture(async (root, artifactPath) => {
    const noSources = await ready(root, {}, { sources: [] });
    assert.equal(noSources.status, "fail");
    assert.match(noSources.blockers.join("\n"), /no source/i);
    await utimes(artifactPath, new Date("2026-09-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z"));
    const stale = await ready(root);
    assert.match(stale.blockers.join("\n"), /stale/i);
}));
test("complete fixture passes only as a read-only readiness result", async () => withFixture(async (root) => {
    const report = await ready(root);
    assert.equal(report.status, "pass");
    assert.equal(report.publishAuthorization, false);
    assert.equal(report.candidateStates[0], "AA");
    assert.ok(report.unperformedChecks.length);
}));
test("mixed-case expected hash keys are enforced and case collisions are rejected", async () => withFixture(async (root) => {
    const context = createRuntimeContext({ repoRoot: root });
    const input = { states: ["AA"], expectedArtifactHashes: { Aa: "a".repeat(64) } };
    const report = await buildReleaseReadiness(context, input, { now: () => NOW });
    assert.ok(report.blockers.some((issue) => issue.includes("SHA-256 does not match")));
    await assert.rejects(buildReleaseReadiness(context, { states: ["AA"], expectedArtifactHashes: { AA: "a".repeat(64), aa: "b".repeat(64) } }), /case-colliding/);
}));
async function ready(root, rows = {}, options = {}) {
    const context = createRuntimeContext({ repoRoot: root });
    const defaultRows = familyRows();
    const readApi = async ({ family, level, year }) => {
        options.seen?.push({ family, level, year });
        if (options.mode === "unavailable")
            throw new Error("offline");
        if (options.mode === "capped")
            return { rows: [], complete: false, source: "database", endpoint: `/api/${family}`, capturedAt: NOW.toISOString(), error: "response cap reached" };
        const data = family === "results" && options.liveByLevel?.[level] ? options.liveByLevel[level] : family === "results" && level && level !== "county" ? [] : (options.emptyCurrent && (family === "results" || family === "turnout") ? defaultRows[family] : (rows[family] ?? defaultRows[family]));
        return { rows: data, complete: true, source: options.mode === "seed" ? "seed" : "database", endpoint: `/api/${family}`, capturedAt: NOW.toISOString() };
    };
    if (options.sources || options.staged) {
        await rewrite(root, { ...(options.sources ? { sources: options.sources } : {}), ...(options.staged ? { native: stagedNative(options.staged) } : {}) });
        await utimes(path.join(root, ".etl", "staging", "aa-2024-staging.json"), NOW, NOW);
    }
    return buildReleaseReadiness(context, { states: ["AA"], maxArtifactAgeHours: 48 }, { readApi, now: () => NOW });
}
function familyRows() { const current = { state: "AA", year: 2024, level: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "r", votes: { A: 1 } }; const source = (id) => ({ id, authority: "Alpha Elections", sourceUrl: `https://example.test/${id}`, localArtifact: `data/${id}.csv`, parser: "fixture" }); return { results: [current], review: [], turnout: [], historical: [{ state: "AA", electionYear: 2016, sourceLevel: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "h", localUnit: "Alpha" }, { state: "AA", electionYear: 2020, sourceLevel: "county", jurisdictionName: "Alpha", jurisdictionTag: "county:001", sourceId: "h", localUnit: "Alpha" }], sources: [source("r"), source("h")], indicators: [] }; }
async function withFixture(callback) { const root = await mkdtemp(path.join(os.tmpdir(), "crm-release-ready-")); const artifactPath = path.join(root, ".etl", "staging", "aa-2024-staging.json"); try {
    await Promise.all([mkdir(path.join(root, "scripts"), { recursive: true }), mkdir(path.join(root, "etl", "state-configs"), { recursive: true }), mkdir(path.dirname(artifactPath), { recursive: true })]);
    await writeFile(path.join(root, "scripts", "state-metadata.mjs"), 'export const states=[{code:"AA",name:"Alpha",fips:"01"}];');
    await writeFile(path.join(root, "etl", "state-configs", "aa.json"), JSON.stringify({ code: "AA" }));
    await rewrite(root);
    await utimes(artifactPath, NOW, NOW);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    await callback(root, artifactPath);
}
finally {
    await rm(root, { recursive: true, force: true });
} }
function stagedNative(overrides) { const rows = familyRows(); const native = { resultRows: overrides.results ?? rows.results, reviewRows: overrides.review ?? rows.review, turnoutRows: overrides.turnout ?? rows.turnout, historicalRows: overrides.historical ?? rows.historical, historicalReviewRows: overrides.historicalReview ?? [], metrics: { nativeReviewRows: 0 } }; if (overrides.omitHistoricalReview)
    delete native.historicalReviewRows; return native; }
async function rewrite(root, overrides = {}) { const rows = familyRows(); const native = stagedNative({}); const artifact = { state: { code: "AA" }, election: { year: 2024 }, native, sources: rows.sources, validation: { passed: true } }; Object.assign(artifact, overrides); await writeFile(path.join(root, ".etl", "staging", "aa-2024-staging.json"), JSON.stringify(artifact)); }

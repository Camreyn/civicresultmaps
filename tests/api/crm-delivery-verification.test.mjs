import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDeliveryVerification } from "../../tools/civicresultmaps-mcp/delivery-verification.ts";
import { verifyDeliveryBrowser } from "../../tools/civicresultmaps-mcp/delivery-browser.ts";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-delivery-"));
  await mkdir(path.join(root, ".etl", "staging"), { recursive: true });
  const sourceRows = ["results-source", "review-source", "turnout-source", "history-source"].map((id) => ({ id, authority: "Example authority", sourceUrl: `https://example.test/${id}`, localArtifact: `data/${id}.csv`, parser: "fixture", status: "loaded", category: "fixture", timestampBasis: "fixture", confidence: "fixture" }));
  const artifact = { state: { code: "AA" }, election: { year: 2024 }, validation: { passed: true }, sources: sourceRows, native: {
    resultRows: [{ level: "county", jurisdictionCode: "001", jurisdictionName: "Alpha County", votes: { Alpha: 60, Beta: 40 }, sourceId: "results-source" }],
    reviewRows: [{ county: "Alpha County", localUnit: "A-1", totalVotes: 100, harris: 60, trump: 40, sourceId: "review-source" }],
    turnoutRows: [{ level: "county", localUnit: "Alpha County", ballotsCast: 100, registeredVoters: 120, turnoutPct: 83.3333, warningRequired: false, sourceId: "turnout-source" }],
    historicalRows: [{ electionYear: 2020, jurisdictionName: "Alpha County", localUnit: "Alpha County", demVotes: 55, repVotes: 45, otherVotes: 0, totalVotes: 100, sourceId: "history-source" }],
  } };
  const bytes = Buffer.from(JSON.stringify(artifact));
  await writeFile(path.join(root, ".etl", "staging", "aa-2024-staging.json"), bytes);
  return { root, sha: createHash("sha256").update(bytes).digest("hex"), sourceRows };
}

function response(request, options = {}) {
  const slug = (id) => `aa-2024-${id}`;
  const rows = {
    results: request.level && request.level !== "county" ? [] : [{ state: "AA", year: 2024, level: "county", jurisdictionCode: "AA-ALPHA", jurisdictionName: "Alpha County", jurisdictionTag: "county:01001", votes: { Alpha: options.resultVote ?? 60, Beta: 40 }, totalVotes: 100, sourceId: slug("results-source") }],
    review: [{ state: "AA", electionYear: 2024, jurisdictionCode: "AA-ALPHA", jurisdictionName: "Alpha County", jurisdictionTag: "county:01001", localUnit: "A-1", totalVotes: 100, harrisVotes: 60, trumpVotes: 40, sourceId: slug("review-source") }],
    turnout: [{ state: "AA", electionYear: 2024, level: "county", jurisdictionName: "Alpha County", ballotsCast: 100, registeredVoters: 120, turnoutPct: 83.3333, warningRequired: false, sourceId: slug("turnout-source") }],
    historical: [{ state: "AA", electionYear: 2020, sourceLevel: "county", jurisdictionName: "Alpha County", localUnit: "Alpha County", demVotes: 55, repVotes: 45, otherVotes: 0, totalVotes: 100, sourceId: "history-source", sourceDocumentId: slug("history-source") }],
    sources: ["results-source", "review-source", "turnout-source", "history-source"].map((id) => ({ state: "AA", electionYear: 2024, id: slug(id), authority: "Example authority", sourceUrl: `https://example.test/${id}`, localArtifact: `data/${id}.csv`, parser: "fixture", status: "loaded", category: "fixture", timestampBasis: "fixture", confidence: "fixture" })),
    indicators: [], jurisdictions: [{ jurisdictionTag: "county:01001" }],
  }[request.family] ?? [];
  return Promise.resolve({ rows, complete: options.complete ?? true, source: options.source ?? "database", endpoint: `/api/${request.family}`, capturedAt: "2026-01-01T00:00:00.000Z", ...(options.error ? { error: options.error } : {}) });
}

test("delivery verification catches semantic result mismatches even when row counts agree", async () => {
  const item = await fixture();
  try {
    const report = await buildDeliveryVerification(createRuntimeContext({ repoRoot: item.root }), { state: "AA", year: 2024, target: "local", expectedStagingSha256: item.sha }, { readApi: (request) => response(request, { resultVote: 61 }) });
    const results = report.checks.find((check) => check.name === "results");
    assert.equal(results.status, "fail");
    assert.equal(results.stagedCount, results.apiCount);
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("supported 2024 fixture can pass as a complete year-scoped delivery check", async () => {
  const item = await fixture();
  try {
    const report = await buildDeliveryVerification(createRuntimeContext({ repoRoot: item.root }), { state: "AA", year: 2024, target: "local" }, { readApi: response });
    assert.equal(report.status, "pass");
    assert.equal(report.checks.find((check) => check.name === "historical").status, "inconclusive");
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("seeded, capped, unavailable, and stale staging responses are inconclusive", async () => {
  const item = await fixture();
  try {
    const context = createRuntimeContext({ repoRoot: item.root });
    for (const options of [{ source: "seed" }, { complete: false }, { error: "connection refused" }]) {
      const report = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local" }, { readApi: (request) => response(request, options) });
      assert.equal(report.status, "inconclusive");
    }
    const stale = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local", expectedStagingSha256: "a".repeat(64) }, { readApi: response });
    assert.equal(stale.checks[0].evidence.reason, "staging_digest_mismatch");
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("delivery verification reports source and map evidence failures and bounded browser outcomes", async () => {
  const item = await fixture();
  try {
    const context = createRuntimeContext({ repoRoot: item.root });
    const missing = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local" }, { readApi: (request) => request.family === "sources" ? response(request).then((x) => ({ ...x, rows: [] })) : request.family === "jurisdictions" ? response(request).then((x) => ({ ...x, rows: [] })) : response(request) });
    assert.equal(missing.checks.find((check) => check.name === "sources").status, "fail");
    assert.equal(missing.checks.find((check) => check.name === "countyMapJoin").status, "fail");
    const browserPass = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local", browser: true }, { readApi: response, browser: async () => ({ status: "pass", screenshotPath: ".etl/mcp-runs/screen.png", assertions: ["state/year visible"] }) });
    assert.equal(browserPass.checks.find((check) => check.name === "browser").status, "pass");
    const noBrowser = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local", browser: true }, { readApi: response });
    assert.equal(noBrowser.checks.find((check) => check.name === "browser").status, "inconclusive");
    const browserFailure = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local", browser: true }, { readApi: response, browser: async () => ({ status: "fail", reason: "fixed_ui_assertion_failed" }) });
    assert.equal(browserFailure.checks.find((check) => check.name === "browser").status, "fail");
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("real browser adapter explicitly leaves non-requested UI inspection unverified", async () => {
  const item = await fixture();
  try {
    const evidence = await verifyDeliveryBrowser(createRuntimeContext({ repoRoot: item.root }), { state: "AA", year: 2024, target: "local", browser: false });
    assert.deepEqual(evidence, { status: "unverified", reason: "browser_not_requested" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("empty staging for the selected year cannot pass; absent optional history and review are scoped omissions", async () => {
  const item = await fixture();
  try {
    const context = createRuntimeContext({ repoRoot: item.root });
    const missingYear = await buildDeliveryVerification(context, { state: "AA", year: 2012, target: "local" }, { readApi: async () => ({ rows: [], complete: true, source: "database", endpoint: "/fixture", capturedAt: "fixture" }) });
    assert.equal(missingYear.status, "inconclusive");
    assert.ok(missingYear.checks.some((entry) => entry.evidence.reason === "no_staged_data_for_requested_year"));
    const file = path.join(item.root, ".etl", "staging", "aa-2024-staging.json");
    const artifact = JSON.parse(await readFile(file, "utf8"));
    delete artifact.native.historicalRows;
    artifact.native.reviewRows = [];
    await writeFile(file, JSON.stringify(artifact));
    const scoped = await buildDeliveryVerification(context, { state: "AA", year: 2024, target: "local" }, { readApi: async (request) => request.family === "indicators" ? { rows: [{ type: "fixture" }], complete: true, source: "database", endpoint: "/fixture", capturedAt: "fixture" } : response(request) });
    assert.equal(scoped.status, "pass");
    assert.ok(scoped.omittedChecks.includes("advisoryIndicators"));
    assert.ok(scoped.omittedChecks.includes("historical"));
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyDeliveryBrowser } from "../../tools/civicresultmaps-mcp/delivery-browser.ts";
import { createRuntimeContext, ensureDirectoryInsideRepo } from "../../tools/civicresultmaps-mcp/runtime.ts";

test("browser smoke validates direct inputs before any browser dependency", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-browser-"));
  try {
    const context = createRuntimeContext({ repoRoot: root });
    assert.equal((await verifyDeliveryBrowser(context, { state: "x", year: 2024, target: "production", browser: true })).reason, "invalid_state");
    assert.equal((await verifyDeliveryBrowser(context, { state: "WI", year: 2014, target: "production", browser: true })).reason, "invalid_year");
    assert.equal((await verifyDeliveryBrowser(context, { state: "WI", year: 2024, target: "other", browser: true })).reason, "invalid_target");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("browser smoke reports cancellation and opt-out without launching a browser", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-browser-"));
  try {
    const context = createRuntimeContext({ repoRoot: root });
    const controller = new AbortController(); controller.abort();
    assert.equal((await verifyDeliveryBrowser(context, { state: "WI", year: 2024, target: "production", browser: true }, { signal: controller.signal })).reason, "cancelled");
    assert.equal((await verifyDeliveryBrowser(context, { state: "WI", year: 2024, target: "production", browser: false })).reason, "browser_not_requested");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("browser DOM contract rejects wrong selected year and runtime errors; screenshots are unique", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-browser-dom-"));
  const context = createRuntimeContext({ repoRoot: root });
  const input = { state: "WI", year: 2024, target: "production", browser: true, browserMode: "smoke" };
  try {
    const passed = await verifyDeliveryBrowser(context, input, { playwright: browserFixture() });
    assert.equal(passed.status, "pass");
    assert.equal(passed.assertions.selectedYearVisible, true);
    const second = await verifyDeliveryBrowser(context, input, { playwright: browserFixture() });
    assert.notEqual(passed.screenshotPath, second.screenshotPath);
    const wrongYear = await verifyDeliveryBrowser(context, input, { playwright: browserFixture({ selectedYear: "2020" }) });
    assert.equal(wrongYear.status, "unverified");
    assert.equal(wrongYear.assertions.selectedYearVisible, false);
    const errors = await verifyDeliveryBrowser(context, input, { playwright: browserFixture({ consoleError: true }) });
    assert.equal(errors.status, "fail");
    assert.equal(errors.reason, "browser_runtime_errors");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("browser and test audit writes reject escaped parent junctions before creating outside files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-browser-path-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "crm-browser-outside-"));
  try {
    await mkdir(path.join(root, ".etl"));
    await symlink(outside, path.join(root, ".etl", "mcp-runs"), process.platform === "win32" ? "junction" : "dir");
    const context = createRuntimeContext({ repoRoot: root });
    await assert.rejects(ensureDirectoryInsideRepo(context, ".etl/mcp-runs/denied"), /outside/);
    const result = await verifyDeliveryBrowser(context, { state: "WI", year: 2024, target: "production", browser: true, browserMode: "smoke" }, { playwright: browserFixture() });
    assert.equal(result.status, "unverified");
    assert.match(result.reason, /outside_repository/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

function browserFixture({ selectedYear = "2024", consoleError = false } = {}) {
  const visible = { offsetParent: {} };
  const page = {
    on(name, callback) { if (name === "console" && consoleError) callback({ type: () => "error", text: () => "fixture runtime error" }); },
    async goto() { return { ok: () => true }; },
    url: () => "https://www.civicresultmaps.org/?state=WI&year=2024&tab=map",
    async waitForLoadState() {},
    async evaluate(callback, input) {
      const original = globalThis.document;
      globalThis.document = { querySelector(selector) {
        if (selector.includes("Workspace state")) return { ...visible, value: "WI" };
        if (selector.includes("Workspace election year")) return { ...visible, value: selectedYear };
        if (selector.includes("dashboard-head")) return { ...visible, textContent: "2024 President" };
        return visible;
      } };
      try { return callback(input); } finally { globalThis.document = original; }
    },
    async screenshot({ path: file }) { await writeFile(file, "fixture screenshot"); },
  };
  return { chromium: { async launch() { return { async newContext() { return { async newPage() { return page; } }; }, async close() {} }; } } };
}

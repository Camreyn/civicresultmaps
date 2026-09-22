import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";
import { runTestProfile, sanitizedTestEnvironment } from "../../tools/civicresultmaps-mcp/test-profiles.ts";

const context = { nodeExecutable: process.execPath, pythonExecutable: "python", repoRoot: process.cwd() };
const passedStep = { exitCode: 0, outputLimitExceeded: false, spawnError: null, timedOut: false, wasCancelled: false, label: "fixture" };
const auditRoots = [];

function fixtureRun(step = passedStep, status = "passed") {
  return {
    reference: { auditPath: ".etl/mcp-runs/fixture/manifest.json", durationMs: 12, id: "fixture", status },
    steps: [step],
  };
}

let lastOptions;
async function auditedFixtureRun(run) {
  const auditDirectory = await mkdtemp(path.join(os.tmpdir(), "crm-profile-audit-"));
  auditRoots.push(auditDirectory);
  await writeFile(path.join(auditDirectory, "01-stdout.log"), "fixture stdout\n");
  await writeFile(path.join(auditDirectory, "01-stderr.log"), "fixture stderr\n");
  await writeFile(path.join(auditDirectory, "manifest.json"), JSON.stringify({ runId: run.reference.id, status: run.reference.status }, null, 2));
  return { ...run, auditDirectory, reference: { ...run.reference, auditPath: path.join(auditDirectory, "manifest.json") } };
}
function dependencies(run = fixtureRun(), scripts = { "test:mcp": "node --experimental-strip-types tests/api/civicresultmaps-local-mcp.test.mjs" }, mutate) {
  return { loadScripts: async () => scripts, runWorkflow: async (options) => { lastOptions = options; const audited = await auditedFixtureRun(run); if (mutate) await mutate(options.context); return audited; } };
}

test.after(async () => { await Promise.all(auditRoots.map((root) => rm(root, { recursive: true, force: true }))); });

test("test profile requires the fixed confirmation and enum", async () => {
  await assert.rejects(() => runTestProfile(context, { profile: "mcp-contract" }, undefined, dependencies()), /confirmation/);
  await assert.rejects(() => runTestProfile(context, { confirmation: "RUN_TEST_PROFILE", profile: "anything" }, undefined, dependencies()), /not approved/);
});

test("test profiles detect mapped package-script drift before executing", async () => {
  const result = await runTestProfile(context, { confirmation: "RUN_TEST_PROFILE", profile: "mcp-contract" }, undefined, dependencies(fixtureRun(), { "test:mcp": "node unsafe.mjs" }));
  assert.equal(result.report.status, "inconclusive");
  assert.equal(result.run, undefined);
});

test("test profile classifies fixture subprocess outcomes and uses sanitized environment", async () => {
  const root = await profileFixture();
  try {
    const fixtureContext = createRuntimeContext({ repoRoot: root });
    for (const [step, status, expected] of [
      [passedStep, "passed", "passed"],
      [{ ...passedStep, exitCode: 1 }, "failed", "failed"],
      [{ ...passedStep, wasCancelled: true }, "failed", "inconclusive"],
      [{ ...passedStep, timedOut: true }, "failed", "inconclusive"],
    ]) {
      const deps = dependencies(fixtureRun(step, status));
      const result = await runTestProfile(fixtureContext, { confirmation: "RUN_TEST_PROFILE", profile: "mcp-contract" }, undefined, deps);
      assert.equal(result.report.status, expected);
    }
    assert.equal(Object.hasOwn(lastOptions.environment, "DATABASE_URL"), false);
    assert.equal(Object.hasOwn(lastOptions.environment, "POSTGRES_URL"), false);
    assert.equal(Object.hasOwn(lastOptions.environment, "CLERK_SECRET_KEY"), false);
    assert.equal(Object.hasOwn(lastOptions.environment, "NODE_OPTIONS"), false);
    assert.equal(Object.hasOwn(sanitizedTestEnvironment(fixtureContext), "PYTHONPATH"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("api contract profile runs through the fixed direct argv", async () => {
  const root = await profileFixture();
  try {
    const fixtureContext = createRuntimeContext({ repoRoot: root });
    const result = await runTestProfile(fixtureContext, { confirmation: "RUN_TEST_PROFILE", profile: "api-contract" }, undefined, dependencies(fixtureRun({ ...passedStep, args: ["tests/api/api-contract.test.mjs"] })));
    assert.equal(result.report.status, "passed");
    assert.equal(result.run?.steps[0].args.at(-1), "tests/api/api-contract.test.mjs");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const execFile = promisify(execFileCallback);
async function git(root, args) { await execFile("git", args, { cwd: root, windowsHide: true }); }
async function profileFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-test-profile-"));
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, "drizzle"), { recursive: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"profile-fixture"}\n');
  await writeFile(path.join(root, "tools", "fixture.ts"), "export const fixture = 1;\n");
  await writeFile(path.join(root, "drizzle", "0001_fixture.sql"), "select 1;\n");
  await writeFile(path.join(root, "data", "runtime.json"), '{"revision":1}\n');
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
  await git(root, ["config", "user.name", "CRM test fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture"]);
  await mkdir(path.join(root, ".etl", "staging"), { recursive: true });
  await writeFile(path.join(root, ".etl", "staging", "wi-2024-staging.json"), '{"fixture":1}\n');
  return root;
}

test("changed-during-run evidence is inconclusive even when subprocess steps pass", async () => {
  const root = await profileFixture();
  try {
    const fixtureContext = createRuntimeContext({ repoRoot: root });
    const run = fixtureRun();
    const result = await runTestProfile(fixtureContext, { confirmation: "RUN_TEST_PROFILE", profile: "api-contract", states: ["WI"] }, undefined, dependencies(run, {}, async () => {
      await writeFile(path.join(root, "tools", "fixture.ts"), "export const fixture = 2;\n");
    }));
    assert.equal(result.report.status, "inconclusive");
    assert.match(result.report.inconclusiveReason, /identity is incomplete or changed/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed audit persistence is inconclusive rather than retained as a pass", async () => {
  const brokenRun = fixtureRun();
  const result = await runTestProfile(context, { confirmation: "RUN_TEST_PROFILE", profile: "api-contract" }, undefined, {
    loadScripts: async () => ({}),
    runWorkflow: async () => ({ ...brokenRun, auditDirectory: path.join(os.tmpdir(), "crm-audit-does-not-exist") }),
  });
  assert.equal(result.report.status, "inconclusive");
  assert.match(result.report.inconclusiveReason, /audit identities or log hashes could not be persisted/i);
});

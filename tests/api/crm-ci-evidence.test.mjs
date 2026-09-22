import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const scriptPath = await realpath(path.join(process.cwd(), "scripts", "record-ci-verification.mjs"));
const requiredGates = ["Public-API", "Validate-job", "Typecheck", "Analytics-contract", "MCP", "Layout", "API-contract", "Security", "Equipment-catalog", "ETL", "Native-ETL", "Sources", "Turnout", "Acquisition", "Integrity", "Integrity-requests", "Maps", "Build", "Equipment-browser", "Browser", "Analytics-browser", "Numeric-browser"];
const successfulOutcomes = requiredGates.map((name) => `${name}=success`);

async function git(root, args) {
  await execFile("git", args, { cwd: root, windowsHide: true });
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-ci-evidence-"));
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, "drizzle"), { recursive: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"ci-evidence-fixture"}\n');
  await writeFile(path.join(root, "tools", "fixture.ts"), "export const fixture = 1;\n");
  await writeFile(path.join(root, "drizzle", "0001_fixture.sql"), "select 1;\n");
  await writeFile(path.join(root, "data", "runtime.json"), '{"revision":1}\n');
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
  await git(root, ["config", "user.name", "CRM CI evidence fixture"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture"]);
  const { stdout: commit } = await execFile("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true });
  return { root, commit: commit.trim() };
}

async function runRecorder(root, outcomes, overrides = {}) {
  const env = { ...process.env, CRM_MCP_REPO_ROOT: await realpath(root) };
  for (const name of ["GITHUB_ACTIONS", "GITHUB_RUN_ID", "GITHUB_SHA"]) delete env[name];
  Object.assign(env, overrides);
  return await execFile(process.execPath, ["--experimental-strip-types", scriptPath, ...outcomes], {
    cwd: await realpath(root), env, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  });
}

async function readRecord(root) {
  return JSON.parse(await readFile(path.join(root, ".etl", "ci-verification", "verification-evidence.json"), "utf8"));
}

test("local caller-provided outcomes never become verified CI evidence", async () => {
  const { root } = await fixture();
  try {
    await runRecorder(root, successfulOutcomes);
    const record = await readRecord(root);
    assert.equal(record.source, "unverified_local_invocation");
    assert.equal(record.ciGateStatus, "unverified_or_failed");
    assert.equal(record.releaseReady, false);
    assert.equal(record.runId, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("matching GitHub run and commit with every fixed gate passing records passed CI gates only", async () => {
  const { root, commit } = await fixture();
  try {
    await runRecorder(root, successfulOutcomes, { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "424242", GITHUB_SHA: commit });
    const record = await readRecord(root);
    assert.equal(record.source, "github_actions_step_outcomes");
    assert.equal(record.runId, "424242");
    assert.equal(record.identity.commitSha, commit);
    assert.equal(record.identity.status, "complete");
    assert.equal(record.missingGates.length, 0);
    assert.equal(record.namedStepOutcomes.length, requiredGates.length);
    assert.ok(record.namedStepOutcomes.every((step) => step.outcome === "success" && /^[a-f0-9]{64}$/.test(step.outcomeRecordSha256)));
    assert.equal(record.ciGateStatus, "passed");
    assert.equal(record.releaseReady, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const [name, outcomes, overrides] of [
  ["missing gate", successfulOutcomes.filter((value) => !value.startsWith("Browser=")), { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "424242" }],
  ["failed gate", successfulOutcomes.map((value) => value.startsWith("Build=") ? "Build=failure" : value), { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "424242" }],
  ["stale commit", successfulOutcomes, { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "424242", GITHUB_SHA: "0".repeat(40) }],
]) {
  test(`CI evidence keeps ${name} out of passed status`, async () => {
    const { root, commit } = await fixture();
    try {
      await runRecorder(root, outcomes, { ...overrides, ...(name === "missing gate" || name === "failed gate" ? { GITHUB_SHA: commit } : {}) });
      const record = await readRecord(root);
      assert.notEqual(record.ciGateStatus, "passed");
      assert.equal(record.releaseReady, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const [name, outcomes] of [
  ["malformed", ["MCP=bogus"]],
  ["unknown", [...successfulOutcomes, "Unknown=success"]],
  ["duplicate", [...successfulOutcomes, "MCP=failure"]],
]) {
  test(`CI evidence rejects ${name} CLI outcomes`, async () => {
    const { root } = await fixture();
    try {
      await assert.rejects(() => runRecorder(root, outcomes), /Only fixed gate outcomes are accepted|Unknown or duplicate CI gate/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

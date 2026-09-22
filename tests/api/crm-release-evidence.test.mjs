import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import path from "node:path";
import { promisify } from "node:util";
import { captureReleaseEvidence } from "../../tools/civicresultmaps-mcp/release-evidence.ts";
import { createRuntimeContext, McpToolError } from "../../tools/civicresultmaps-mcp/runtime.ts";
import { buildVerificationIdentity } from "../../tools/civicresultmaps-mcp/verification-plan.ts";

const context = createRuntimeContext({ repoRoot: process.cwd() });
test("release evidence rejects malformed run IDs before any audit-path read", async () => {
  await assert.rejects(() => captureReleaseEvidence(context, { states: ["WI"], testRunIds: ["../escape"], confirmation: "CAPTURE_RELEASE_EVIDENCE" }), (error) => error instanceof McpToolError && error.code === "invalid_run_id");
});
test("release evidence records incomplete local evidence rather than caller-claimed success", async () => {
  const result = await captureReleaseEvidence(context, { states: ["WI"], testRunIds: ["missing-run"], confirmation: "CAPTURE_RELEASE_EVIDENCE" });
  assert.equal(result.status, "local_evidence_recorded_not_release_ready"); assert.equal(result.record.releaseReady, false); assert.match(result.record.blockers.join("\n"), /Audit manifest/);
});

const execFile = promisify(execFileCallback);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function git(root, args) {
  await execFile("git", args, { cwd: root, windowsHide: true });
}

async function temporaryGitFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-release-evidence-"));
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, "drizzle"), { recursive: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"evidence-fixture"}\n');
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

async function writeReviewedAudit(root, runId = "fixture-run", overrides = {}) {
  const context = createRuntimeContext({ repoRoot: root });
  const identity = await buildVerificationIdentity(context, ["WI"]);
  assert.equal(identity.status, "complete");
  const step = {
    args: ["tests/api/api-contract.test.mjs"],
    command: process.execPath,
    durationMs: 1,
    exitCode: 0,
    label: "Run read-only API contract tests",
    outputLimitExceeded: false,
    signal: null,
    spawnError: null,
    stderrTail: "",
    stdoutTail: "",
    timedOut: false,
    wasCancelled: false,
    ...overrides.step,
  };
  const logBytes = { stdout: Buffer.from("fixture stdout\n"), stderr: Buffer.from("fixture stderr\n") };
  const logs = [
    { path: "01-stdout.log", sha256: digest(logBytes.stdout) },
    { path: "01-stderr.log", sha256: digest(logBytes.stderr) },
  ];
  const manifest = {
    runId,
    name: "test-profile-api-contract",
    profile: "api-contract",
    status: "passed",
    steps: [step],
    verificationIdentityBefore: identity,
    verificationIdentityAfter: identity,
    logHashes: logs,
    ...overrides.manifest,
  };
  const runDir = path.join(root, ".etl", "mcp-runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "01-stdout.log"), logBytes.stdout);
  await writeFile(path.join(runDir, "01-stderr.log"), logBytes.stderr);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(runDir, "manifest.json"), manifestBytes);
  return { context, runId, manifestHash: digest(manifestBytes), identity, runDir };
}

test("release evidence verifies an exact reviewed run and remains local-only", async () => {
  const root = await temporaryGitFixture();
  try {
    const audit = await writeReviewedAudit(root);
    const result = await captureReleaseEvidence(audit.context, {
      states: ["WI"],
      testRunIds: [audit.runId],
      expectedAuditHashes: { [audit.runId]: audit.manifestHash },
      confirmation: "CAPTURE_RELEASE_EVIDENCE",
    });
    assert.equal(result.record.localEvidenceStatus, "verified");
    assert.equal(result.record.releaseReady, false);
    assert.match(result.record.blockers.join("\n"), /deployment identity.*database revision/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const [name, mutate] of [
  ["stale code", async (audit) => writeFile(path.join(audit.context.repoRoot, "tools", "fixture.ts"), "export const fixture = 2;\n")],
  ["stale staging", async (audit) => writeFile(path.join(audit.context.repoRoot, ".etl", "staging", "wi-2024-staging.json"), '{"fixture":2}\n')],
]) {
  test(`release evidence rejects ${name} identity`, async () => {
    const root = await temporaryGitFixture();
    try {
      const audit = await writeReviewedAudit(root);
      await mutate(audit);
      const result = await captureReleaseEvidence(audit.context, { states: ["WI"], testRunIds: [audit.runId], expectedAuditHashes: { [audit.runId]: audit.manifestHash }, confirmation: "CAPTURE_RELEASE_EVIDENCE" });
      assert.equal(result.record.localEvidenceStatus, "incomplete");
      assert.match(result.record.blockers.join("\n"), /exact candidate code and selected staging|identity changed/i);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

for (const [name, prepare, expected] of [
  ["missing expected manifest hash", async () => {}, /no externally retained expected manifest digest/i],
  ["failed step", async (audit) => {
    const file = path.join(audit.runDir, "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    manifest.status = "failed"; manifest.steps[0].exitCode = 1;
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }, /did not pass|exact reviewed steps/i],
  ["tampered log", async (audit) => writeFile(path.join(audit.runDir, "01-stdout.log"), "tampered\n"), /log hash mismatch/i],
  ["missing identity", async (audit) => {
    const file = path.join(audit.runDir, "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    delete manifest.verificationIdentityBefore;
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }, /incomplete identity|exact candidate code/i],
]) {
  test(`release evidence classifies ${name} as incomplete`, async () => {
    const root = await temporaryGitFixture();
    try {
      const audit = await writeReviewedAudit(root);
      await prepare(audit);
      const result = await captureReleaseEvidence(audit.context, {
        states: ["WI"], testRunIds: [audit.runId],
        ...(name === "missing expected manifest hash" ? {} : { expectedAuditHashes: { [audit.runId]: audit.manifestHash } }),
        confirmation: "CAPTURE_RELEASE_EVIDENCE",
      });
      assert.equal(result.record.localEvidenceStatus, "incomplete");
      assert.match(result.record.blockers.join("\n"), expected);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test("release evidence rejects a caller-supplied manifest digest that does not match the retained audit", async () => {
  const root = await temporaryGitFixture();
  try {
    const audit = await writeReviewedAudit(root);
    const result = await captureReleaseEvidence(audit.context, {
      states: ["WI"], testRunIds: [audit.runId], expectedAuditHashes: { [audit.runId]: "0".repeat(64) }, confirmation: "CAPTURE_RELEASE_EVIDENCE",
    });
    assert.equal(result.record.localEvidenceStatus, "incomplete");
    assert.match(result.record.blockers.join("\n"), /manifest digest does not match/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { buildVerificationIdentity, planVerification } from "../../tools/civicresultmaps-mcp/verification-plan.ts";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";

const context = createRuntimeContext({ repoRoot: process.cwd() });
test("verification identity includes commit, deterministic relevant contents, and candidate staging status", async () => {
  const first = await buildVerificationIdentity(context, ["WI"]); const second = await buildVerificationIdentity(context, ["WI"]);
  assert.equal(first.commitSha, second.commitSha); assert.equal(first.worktreeSha256, second.worktreeSha256); assert.ok(first.relevantFiles.every((file) => file.path && /^[a-f0-9]{64}$/.test(file.sha256))); assert.ok(first.staging.WI);
});
test("verification plans are deterministic and retain full gates for shared or unknown changes", async () => {
  const first = await planVerification(context, { states: ["WI"] }); const second = await planVerification(context, { states: ["WI"] });
  assert.deepEqual(first.changedPaths, second.changedPaths); assert.deepEqual(first.recommendations.requiredGlobalGates, ["typecheck", "test", "build", "validate:source-packages", "validate:turnout-packages", "validate:maps", "validate:provenance"]); assert.equal(typeof first.recommendations.fullTestRequired, "boolean");
});

const execFile = promisify(execFileCallback);
async function git(root, args) { await execFile("git", args, { cwd: root, windowsHide: true }); }
async function verificationFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "crm-verification-plan-"));
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, "drizzle"), { recursive: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"verification-fixture"}\n');
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

test("verification identity binds source, Drizzle/runtime data, rename/delete state, and staging bytes", async () => {
  const root = await verificationFixture();
  try {
    const fixtureContext = createRuntimeContext({ repoRoot: root });
    const baseline = await buildVerificationIdentity(fixtureContext, ["WI"]);
    assert.equal(baseline.status, "complete");
    assert.ok(baseline.relevantFiles.some((file) => file.path === "drizzle/0001_fixture.sql"));
    assert.ok(baseline.relevantFiles.some((file) => file.path === "data/runtime.json"));

    for (const [relative, contents, original] of [
      ["tools/fixture.ts", "export const fixture = 2;\n", "export const fixture = 1;\n"],
      ["drizzle/0001_fixture.sql", "select 2;\n", "select 1;\n"],
      ["data/runtime.json", '{"revision":2}\n', '{"revision":1}\n'],
    ]) {
      await writeFile(path.join(root, relative), contents);
      const changed = await buildVerificationIdentity(fixtureContext, ["WI"]);
      assert.notEqual(changed.worktreeSha256, baseline.worktreeSha256, `${relative} must affect worktree identity`);
      assert.equal(changed.status, "complete");
      await writeFile(path.join(root, relative), original);
    }

    await git(root, ["mv", "drizzle/0001_fixture.sql", "drizzle/0002_fixture.sql"]);
    const renamed = await buildVerificationIdentity(fixtureContext, ["WI"]);
    assert.notEqual(renamed.worktreeSha256, baseline.worktreeSha256);
    assert.ok(renamed.relevantFiles.some((file) => file.path === "drizzle/0002_fixture.sql"));
    assert.equal(renamed.relevantFiles.some((file) => file.path === "drizzle/0001_fixture.sql"), false);

    await rm(path.join(root, "data", "runtime.json"));
    const deleted = await buildVerificationIdentity(fixtureContext, ["WI"]);
    assert.notEqual(deleted.worktreeSha256, baseline.worktreeSha256);
    assert.equal(deleted.relevantFiles.some((file) => file.path === "data/runtime.json"), false);

    await writeFile(path.join(root, ".etl", "staging", "wi-2024-staging.json"), '{"fixture":2}\n');
    const changedStaging = await buildVerificationIdentity(fixtureContext, ["WI"]);
    assert.notEqual(changedStaging.staging.WI.sha256, baseline.staging.WI.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verification plan treats renamed and deleted paths as requiring the full gates", async () => {
  const root = await verificationFixture();
  try {
    const fixtureContext = createRuntimeContext({ repoRoot: root });
    await git(root, ["mv", "drizzle/0001_fixture.sql", "drizzle/0002_fixture.sql"]);
    await rm(path.join(root, "data", "runtime.json"));
    const plan = await planVerification(fixtureContext, { states: ["WI"] });
    assert.equal(plan.recommendations.fullTestRequired, true);
    assert.ok(plan.changedPaths.includes("drizzle/0001_fixture.sql"));
    assert.ok(plan.changedPaths.includes("drizzle/0002_fixture.sql"));
    assert.ok(plan.changedPaths.includes("data/runtime.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

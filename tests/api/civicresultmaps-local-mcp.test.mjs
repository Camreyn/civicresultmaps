import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import test from "node:test";
import "./crm-evidence.test.mjs";
import "./crm-projection.test.mjs";
import "./crm-coverage-gaps.test.mjs";
import "./crm-trace-value.test.mjs";
import "./crm-release-readiness.test.mjs";
import "./crm-delivery-verification.test.mjs";
import "./crm-delivery-browser.test.mjs";
import "./crm-test-profiles.test.mjs";
import "./crm-pagination.test.mjs";
import "./crm-browser-values.test.mjs";
import "./crm-source-revisions.test.mjs";
import "./crm-database-rehearsal.test.mjs";
import "./crm-verification-plan.test.mjs";
import "./crm-release-evidence.test.mjs";
import "./crm-ci-evidence.test.mjs";
import "./crm-model-validation.test.mjs";
import { TOOL_NAMES } from "../../tools/civicresultmaps-mcp/contracts.ts";
import { loadPackageScripts, loadStateCatalog } from "../../tools/civicresultmaps-mcp/catalog.ts";
import { createRuntimeContext, resolveInsideRepo } from "../../tools/civicresultmaps-mcp/runtime.ts";
import { verifyOverlay } from "../../tools/civicresultmaps-mcp/tools.ts";
import {
  collectWorkflowDrift,
  resolveStateWorkflow,
  resolveValidatorWorkflow,
  unregisteredWorkflowScripts,
} from "../../tools/civicresultmaps-mcp/workflows.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverPath = path.join(repoRoot, "tools", "civicresultmaps-mcp", "server.ts");

test("reviewed workflow registry matches the current package scripts", async () => {
  const context = createRuntimeContext({ repoRoot });
  const [scripts, catalog] = await Promise.all([loadPackageScripts(context), loadStateCatalog(context)]);
  assert.deepEqual(collectWorkflowDrift(scripts, catalog.states.map((state) => state.code)), []);
  const unregistered = unregisteredWorkflowScripts(scripts, catalog.states.map((state) => state.code));
  assert.ok(unregistered.includes("etl:validate:all"));
  assert.ok(unregistered.includes("etl:validate:wi:ward-geometry"));

  const changed = { ...scripts, "etl:prepare:ca": "node scripts/unreviewed-command.mjs" };
  const workflow = resolveStateWorkflow("import", "CA", "full", changed);
  assert.equal(workflow.drift.length, 1);
  assert.equal(workflow.drift[0].script, "etl:prepare:ca");
  assert.equal(workflow.steps.some((step) => step.args.includes("scripts/unreviewed-command.mjs")), false);

  const direct = resolveStateWorkflow("validate", "AK", "full", scripts);
  assert.equal(direct.drift.length, 0);
  assert.deepEqual(direct.steps[0].args, [
    "-m",
    "civic_etl.cli",
    "validate",
    "--config",
    "etl/state-configs/ak.json",
  ]);

  const unsafeValidator = resolveValidatorWorkflow("source-records-requests", scripts);
  assert.deepEqual(unsafeValidator.steps[0].args.slice(-1), ["--dry-run"]);
  assert.equal(unsafeValidator.steps.some((step) => step.args.includes("--apply")), false);
});

test("state discovery refreshes ordinary metadata and config additions", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "crm-mcp-catalog-"));
  try {
    await mkdir(path.join(temporaryRoot, "scripts"), { recursive: true });
    await mkdir(path.join(temporaryRoot, "etl", "state-configs"), { recursive: true });
    await writeFile(
      path.join(temporaryRoot, "scripts", "state-metadata.mjs"),
      'export const states = [{ code: "AA", name: "Alpha", fips: "01" }];\n',
      "utf8",
    );
    await writeFile(path.join(temporaryRoot, "etl", "state-configs", "aa.json"), '{}\n', "utf8");
    const context = createRuntimeContext({ repoRoot: temporaryRoot });
    const first = await loadStateCatalog(context);
    assert.deepEqual(first.states.map((state) => state.code), ["AA"]);

    await writeFile(
      path.join(temporaryRoot, "scripts", "state-metadata.mjs"),
      'export const states = [{ code: "AA", name: "Alpha", fips: "01" }, { code: "BB", name: "Beta", fips: "02" }];\n',
      "utf8",
    );
    await writeFile(path.join(temporaryRoot, "etl", "state-configs", "bb.json"), '{}\n', "utf8");
    const second = await loadStateCatalog(context);
    assert.deepEqual(second.states.map((state) => state.code), ["AA", "BB"]);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("repository path guards and staging-overlay verification fail closed", () => {
  const context = createRuntimeContext({ repoRoot });
  assert.throws(() => resolveInsideRepo(context, "../outside.json"), /escapes/);
  assert.throws(() => resolveInsideRepo(context, path.resolve(repoRoot, "package.json")), /repository-relative/);
  assert.doesNotThrow(() => verifyOverlay({ stagingOverlay: { states: ["WI", "MN"] } }, ["MN", "WI"]));
  assert.throws(() => verifyOverlay({}, ["WI"]), /did not confirm the exact staging overlay/);
  assert.throws(() => verifyOverlay({ stagingOverlay: { states: ["MN"] } }, ["WI"]), /did not confirm/);
});

test("the private connection and startup workflow remain guarded", async () => {
  const ignore = await readFile(path.join(repoRoot, ".gitignore"), "utf8");
  const template = await readFile(path.join(repoRoot, ".codex", "config.toml.example"), "utf8");
  const agentInstructions = await readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  const skill = await readFile(
    path.join(repoRoot, ".agents", "skills", "civicresultmaps-mcp", "SKILL.md"),
    "utf8",
  );
  const skillUi = await readFile(
    path.join(repoRoot, ".agents", "skills", "civicresultmaps-mcp", "agents", "openai.yaml"),
    "utf8",
  );

  assert.match(ignore, /^\.codex\/config\.toml$/m);
  assert.match(template, /^required = true$/m);
  assert.match(template, /default_tools_approval_mode = 'writes'/);
  for (const toolName of TOOL_NAMES) assert.match(template, new RegExp(`'${toolName}'`));
  assert.match(agentInstructions, /At the start of every task[\s\S]*call `crm_doctor` once/);
  assert.match(skill, /^name: civicresultmaps-mcp$/m);
  assert.match(skill, /call `crm_doctor` once before substantive code or data work\./i);
  assert.match(skill, /Never treat a[\s\S]*staging import as production promotion\./);
  assert.match(skillUi, /Use \$civicresultmaps-mcp to verify the local MCP server/);
});

for (const negotiationMode of ["legacy", "auto"]) {
  test(`STDIO server lists the guarded surface and answers inspection tools in ${negotiationMode} mode`, async () => {
    await withClient(negotiationMode, async (client) => {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      assert.deepEqual(names, [...TOOL_NAMES]);
      assert.equal(names.some((name) => /promote|publish|backfill|shell|sql|git/i.test(name)), false);

      const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));
      for (const name of ["crm_doctor", "crm_state_inventory", "crm_report_indicators", "crm_release_readiness", "crm_coverage_gaps", "crm_trace_value", "crm_plan_verification"]) {
        assert.equal(byName.get(name)?.annotations?.readOnlyHint, true);
      }
      for (const name of ["crm_validate_state", "crm_import_staging", "crm_compare_staging", "crm_run_validator", "crm_verify_state_delivery", "crm_run_test_profile", "crm_record_source_revision", "crm_rehearse_database", "crm_capture_release_evidence", "crm_validate_model"]) {
        assert.equal(byName.get(name)?.annotations?.readOnlyHint, false);
        assert.equal(byName.get(name)?.annotations?.destructiveHint, false);
      }

      const doctor = await client.callTool({ arguments: {}, name: "crm_doctor" });
      assert.equal(doctor.isError, undefined);
      assert.equal(doctor.structuredContent.ok, true);
      assert.equal(doctor.structuredContent.result.repository.supportedStateCount, 51);
      assert.deepEqual(doctor.structuredContent.result.workflowDrift, []);
      assert.equal(doctor.structuredContent.result.server.toolCount, TOOL_NAMES.length);

      const inventory = await client.callTool({ arguments: { state: "wi" }, name: "crm_state_inventory" });
      assert.equal(inventory.structuredContent.ok, true);
      assert.equal(inventory.structuredContent.result.metadata.code, "WI");
      assert.equal(inventory.structuredContent.result.workflows.validate.configOnly, true);

      const invalidState = await client.callTool({ arguments: { state: "../../" }, name: "crm_state_inventory" });
      assert.equal(invalidState.isError, true);
      const unsafeValidator = await client.callTool({ arguments: { validator: "native:promote" }, name: "crm_run_validator" });
      assert.equal(unsafeValidator.isError, true);

      for (const [name, args] of [
        ["crm_verify_state_delivery", { state: "WI", year: 2024, target: "https://unreviewed.example" }],
        ["crm_verify_state_delivery", { state: "WI", year: 2024, target: "production", url: "https://unreviewed.example" }],
        ["crm_release_readiness", { states: ["WI"], maxArtifactAgeHours: 169 }],
        ["crm_release_readiness", { states: ["WI"], expectedArtifactHashes: { WI: "not-a-digest" } }],
        ["crm_coverage_gaps", { states: ["WI"], years: [2028] }],
        ["crm_trace_value", { state: "../", year: 2024, family: "results", field: "votes" }],
        ["crm_trace_value", { state: "WI", year: 2024, family: "results", field: "arbitrary", path: ".env.local" }],
        ["crm_run_test_profile", { profile: "api-contract" }],
        ["crm_run_test_profile", { profile: "native:promote", confirmation: "RUN_TEST_PROFILE" }],
        ["crm_run_test_profile", { profile: "api-contract", confirmation: "RUN_TEST_PROFILE", environment: { DATABASE_URL: "denied" } }],
        ["crm_record_source_revision", { state: "WI", sourceId: "../outside", confirmation: "RECORD_SOURCE_REVISION" }],
        ["crm_rehearse_database", { profile: "native-import", confirmation: "REHEARSE_LOCAL_DATABASE", databaseUrl: "postgres://denied" }],
        ["crm_rehearse_database", { profile: "native-import" }],
        ["crm_plan_verification", { paths: [".env.local"] }],
        ["crm_capture_release_evidence", { states: ["WI"], confirmation: "CAPTURE_RELEASE_EVIDENCE", passed: true }],
        ["crm_validate_model", { states: ["WI"], confirmation: "VALIDATE_EXPERIMENTAL_MODEL", code: "denied" }],
        ["crm_validate_model", { states: ["WI"], confirmation: "VALIDATE_EXPERIMENTAL_MODEL", holdoutYear: 2024 }],
        ["crm_validate_model", { states: ["WI"], confirmation: "VALIDATE_EXPERIMENTAL_MODEL", seed: -1 }],
      ]) {
        const refused = await client.callTool({ arguments: args, name });
        assert.equal(refused.isError, true, `${name} must reject ${JSON.stringify(args)}`);
      }
      const coverage = await client.callTool({ arguments: { states: ["WI"], target: "none" }, name: "crm_coverage_gaps" });
      assert.equal(coverage.isError, undefined);
      assert.equal(coverage.structuredContent.ok, true);
      assert.match(coverage.structuredContent.result.reportSha256, /^[a-f0-9]{64}$/);
    });
  });
}

async function withClient(negotiationMode, callback) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry) => typeof entry[1] === "string"),
  );
  env.CRM_MCP_REPO_ROOT = repoRoot;
  env.CRM_MCP_PYTHON = process.env.CRM_MCP_PYTHON ?? (process.platform === "win32" ? "python.exe" : "python3");
  const transport = new StdioClientTransport({
    args: ["--experimental-strip-types", serverPath],
    command: process.execPath,
    cwd: repoRoot,
    env,
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const client = new Client(
    { name: "civicresultmaps-mcp-test", version: "1.0.0" },
    { versionNegotiation: { mode: negotiationMode, probe: { timeoutMs: 5_000 } } },
  );
  try {
    await client.connect(transport);
    await callback(client);
  } catch (error) {
    error.message = `${error.message}\nServer stderr:\n${stderr}`;
    throw error;
  } finally {
    await client.close();
  }
}

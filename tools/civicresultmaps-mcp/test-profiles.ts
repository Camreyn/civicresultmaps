import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadPackageScripts } from "./catalog.ts";
import { McpToolError, runAuditedWorkflow, stepPassed, type AuditedRun, type RuntimeContext } from "./runtime.ts";
import { buildVerificationIdentity, type VerificationIdentity } from "./verification-plan.ts";
import type { WorkflowStep } from "./workflows.ts";

export const TEST_PROFILE_NAMES = ["mcp-contract", "api-contract"] as const;
export type TestProfileName = (typeof TEST_PROFILE_NAMES)[number];

export type RunTestProfileInput = {
  confirmation: "RUN_TEST_PROFILE";
  profile: TestProfileName;
  states?: string[];
};

type TestProfile = {
  expectedScripts?: Record<string, string>;
  steps: WorkflowStep[];
  timeoutMs: number;
};

export type TestProfileReport = {
  auditPaths: string[];
  durationMs: number;
  failedSteps: Array<{ label: string; reason: "cancelled" | "failed" | "timeout" }>;
  inconclusiveReason: string | null;
  profile: TestProfileName;
  status: "failed" | "inconclusive" | "passed";
  verificationIdentityBefore?: VerificationIdentity;
  verificationIdentityAfter?: VerificationIdentity;
  auditManifestSha256?: string;
};

type Dependencies = {
  loadScripts: typeof loadPackageScripts;
  runWorkflow: typeof runAuditedWorkflow;
};

export const TEST_PROFILES: Record<TestProfileName, TestProfile> = {
  "mcp-contract": {
    expectedScripts: {
      "test:mcp": "node --experimental-strip-types tests/api/civicresultmaps-local-mcp.test.mjs",
    },
    steps: [{
      args: ["--experimental-strip-types", "tests/api/civicresultmaps-local-mcp.test.mjs"],
      label: "Run guarded MCP contract tests",
      runtime: "node",
    }],
    timeoutMs: 300_000,
  },
  "api-contract": {
    steps: [{
      args: ["tests/api/api-contract.test.mjs"],
      label: "Run read-only API contract tests",
      runtime: "node",
    }],
    timeoutMs: 120_000,
  },
};

const defaultDependencies: Dependencies = {
  loadScripts: loadPackageScripts,
  runWorkflow: runAuditedWorkflow,
};

/**
 * Executes only a reviewed, local contract-test profile. The caller must expose
 * this as an action and require the exact confirmation token; this function
 * repeats that check so direct internal callers cannot bypass it.
 */
export async function runTestProfile(
  context: RuntimeContext,
  input: RunTestProfileInput,
  signal?: AbortSignal,
  dependencies: Dependencies = defaultDependencies,
): Promise<{ report: TestProfileReport; run?: AuditedRun }> {
  const profile = requireProfile(input);
  const definition = TEST_PROFILES[profile];
  const scripts = await dependencies.loadScripts(context);
  const drift = scriptDrift(definition.expectedScripts, scripts);
  if (drift.length) {
    return {
      report: {
        auditPaths: [],
        durationMs: 0,
        failedSteps: [],
        inconclusiveReason: `Package-script drift: ${drift.join(", ")}.`,
        profile,
        status: "inconclusive",
      },
    };
  }

  const verificationIdentityBefore = await buildVerificationIdentity(context, input.states);
  const run = await dependencies.runWorkflow({
    context,
    // This trusted allowlist deliberately omits database/auth variables,
    // NODE_OPTIONS, PYTHONPATH, npm configuration, and user home directories.
    environment: sanitizedTestEnvironment(context),
    name: `test-profile-${profile}`,
    signal,
    steps: definition.steps,
    timeoutMs: definition.timeoutMs,
  });
  const verificationIdentityAfter = await buildVerificationIdentity(context, input.states);
  const report: TestProfileReport = { ...reportForRun(profile, run), verificationIdentityBefore, verificationIdentityAfter };
  try {
    const logHashes = await auditLogHashes(run);
    report.auditManifestSha256 = await attachVerificationAudit(run, profile, verificationIdentityBefore, verificationIdentityAfter, logHashes);
  } catch {
    if (report.status === "passed") report.status = "inconclusive";
    report.inconclusiveReason = "Verification audit identities or log hashes could not be persisted; subprocess success is not retained verification evidence.";
  }
  if (report.status === "passed" && (verificationIdentityBefore.status !== "complete" || verificationIdentityAfter.status !== "complete" || verificationIdentityBefore.commitSha !== verificationIdentityAfter.commitSha || verificationIdentityBefore.worktreeSha256 !== verificationIdentityAfter.worktreeSha256 || JSON.stringify(verificationIdentityBefore.staging) !== JSON.stringify(verificationIdentityAfter.staging))) {
    report.status = "inconclusive"; report.inconclusiveReason = "Code or selected staging identity is incomplete or changed during the test run.";
  }
  return { report, run };
}

async function auditLogHashes(run: AuditedRun) {
  return await Promise.all(run.steps.flatMap((_step, index) => ["stdout", "stderr"].map(async (stream) => {
    const name = `${String(index + 1).padStart(2, "0")}-${stream}.log`;
    const bytes = await readFile(`${run.auditDirectory}/${name}`);
    return { path: name, sha256: createHash("sha256").update(bytes).digest("hex") };
  })));
}
async function attachVerificationAudit(run: AuditedRun, profile: TestProfileName, before: VerificationIdentity, after: VerificationIdentity, logHashes: Array<{ path: string; sha256: string }>) {
  const file = `${run.auditDirectory}/manifest.json`; const manifest = JSON.parse(await readFile(file, "utf8"));
  const bytes = `${JSON.stringify({ ...manifest, profile, verificationIdentityBefore: before, verificationIdentityAfter: after, logHashes }, null, 2)}\n`;
  await writeFile(file, bytes, "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

export function reportForRun(profile: TestProfileName, run: AuditedRun): TestProfileReport {
  const failedSteps = run.steps
    .filter((step) => !stepPassed(step))
    .map((step) => ({
      label: step.label,
      reason: step.wasCancelled ? "cancelled" as const : step.timedOut ? "timeout" as const : "failed" as const,
    }));
  const inconclusive = run.steps.some((step) => step.wasCancelled || step.timedOut || step.spawnError !== null);
  return {
    auditPaths: [run.reference.auditPath, ...run.steps.flatMap((_step, index) => [
      `${run.reference.auditPath.replace(/manifest\.json$/, "")}${String(index + 1).padStart(2, "0")}-stdout.log`,
      `${run.reference.auditPath.replace(/manifest\.json$/, "")}${String(index + 1).padStart(2, "0")}-stderr.log`,
    ])],
    durationMs: run.reference.durationMs,
    failedSteps,
    inconclusiveReason: inconclusive ? "A test step was cancelled, timed out, or could not be started." : null,
    profile,
    status: inconclusive ? "inconclusive" : run.reference.status === "passed" ? "passed" : "failed",
  };
}

export function sanitizedTestEnvironment(context: RuntimeContext): NodeJS.ProcessEnv {
  const inherited = process.env;
  const pathValue = inherited.Path ?? inherited.PATH;
  return {
    ...(pathValue ? { [process.platform === "win32" ? "Path" : "PATH"]: pathValue } : {}),
    ...(inherited.SystemRoot ? { SystemRoot: inherited.SystemRoot } : {}),
    ...(inherited.TEMP ? { TEMP: inherited.TEMP } : {}),
    ...(inherited.TMP ? { TMP: inherited.TMP } : {}),
    NODE_ENV: "test",
    NO_COLOR: "1",
    PYTHONUNBUFFERED: "1",
    // The executable itself is fixed by RuntimeContext; this is an audit aid,
    // not a user-selectable path or environment escape hatch.
    CRM_TEST_PROFILE_RUNTIME: context.nodeExecutable,
  };
}

function requireProfile(input: RunTestProfileInput): TestProfileName {
  if (!input || typeof input !== "object" || input.confirmation !== "RUN_TEST_PROFILE") {
    throw new McpToolError(
      "test_profile_confirmation_required",
      "Running a test profile requires confirmation: RUN_TEST_PROFILE.",
      "Resubmit the fixed profile with confirmation set to RUN_TEST_PROFILE.",
    );
  }
  if (!TEST_PROFILE_NAMES.includes(input.profile)) {
    throw new McpToolError(
      "unsupported_test_profile",
      "The requested test profile is not approved.",
      `Choose one of: ${TEST_PROFILE_NAMES.join(", ")}.`,
    );
  }
  return input.profile;
}

function scriptDrift(expected: Record<string, string> | undefined, scripts: Record<string, string>): string[] {
  return Object.entries(expected ?? {}).flatMap(([name, value]) => scripts[name] === value ? [] : [name]);
}

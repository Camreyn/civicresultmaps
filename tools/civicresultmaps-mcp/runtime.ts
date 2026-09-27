import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoSnapshot, RunReference } from "./contracts.ts";
import type { WorkflowStep } from "./workflows.ts";

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export type RuntimeContext = {
  nodeExecutable: string;
  pythonExecutable: string;
  repoRoot: string;
};

export type StepExecution = {
  args: string[];
  command: string;
  durationMs: number;
  exitCode: number | null;
  label: string;
  outputLimitExceeded: boolean;
  signal: NodeJS.Signals | null;
  spawnError: string | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
  wasCancelled: boolean;
};

export type AuditedRun = {
  auditDirectory: string;
  postRunRepo: RepoSnapshot;
  preRunRepo: RepoSnapshot;
  reference: RunReference;
  steps: StepExecution[];
};

export class McpToolError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly remediation: string;

  constructor(code: string, message: string, remediation: string, details: unknown = null) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.details = details;
    this.remediation = remediation;
  }
}

export function createRuntimeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  const repoRoot = path.resolve(overrides.repoRoot ?? process.env.CRM_MCP_REPO_ROOT ?? DEFAULT_REPO_ROOT);
  return {
    nodeExecutable: overrides.nodeExecutable ?? process.execPath,
    pythonExecutable: overrides.pythonExecutable
      ?? process.env.CRM_MCP_PYTHON
      ?? (process.platform === "win32" ? "python.exe" : "python3"),
    repoRoot,
  };
}

export function resolveInsideRepo(context: RuntimeContext, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new McpToolError(
      "unsafe_path",
      `Path must be a non-empty repository-relative path: ${relativePath || "<empty>"}`,
      "Use a path selected by the MCP tool rather than supplying a filesystem path.",
    );
  }
  const resolved = path.resolve(context.repoRoot, relativePath);
  const relative = path.relative(context.repoRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (!relative) return resolved;
    throw new McpToolError(
      "unsafe_path",
      `Resolved path escapes the CivicResultMaps repository: ${relativePath}`,
      "Keep all MCP artifacts and inputs inside the repository.",
    );
  }
  return resolved;
}

export function relativeToRepo(context: RuntimeContext, absolutePath: string): string {
  const relative = path.relative(context.repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return absolutePath;
  return relative.split(path.sep).join("/");
}

export async function readJsonFile<T>(context: RuntimeContext, relativePath: string): Promise<T> {
  const filePath = await resolveReadableInsideRepo(context, relativePath);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

/** Verify symlinks and junction ancestors as well as the lexical path before reads. */
export async function resolveReadableInsideRepo(context: RuntimeContext, relativePath: string): Promise<string> {
  const lexical = resolveInsideRepo(context, relativePath);
  const [root, target] = await Promise.all([realpath(context.repoRoot), realpath(lexical)]);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new McpToolError("unsafe_path", "Repository input resolves outside the trusted checkout.", "Replace the external symlink or junction with a retained repository artifact.");
  }
  return target;
}

/** Create only beneath already-checked real parents; never traverse an external junction. */
export async function ensureDirectoryInsideRepo(context: RuntimeContext, relativePath: string): Promise<string> {
  const lexical = resolveInsideRepo(context, relativePath);
  const root = await realpath(context.repoRoot);
  const relative = path.relative(context.repoRoot, lexical);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    await mkdir(current).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const actual = await realpath(current);
    const resolvedRelative = path.relative(root, actual);
    if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) {
      throw new McpToolError("unsafe_path", "Audit directory resolves outside the trusted checkout.", "Replace the external symlink or junction before running local action tools.");
    }
    current = actual;
  }
  return current;
}

export async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function repoSnapshot(context: RuntimeContext): Promise<RepoSnapshot> {
  const fallback: RepoSnapshot = {
    changedFiles: null,
    commit: null,
    dirty: null,
    root: context.repoRoot,
  };
  const commit = await captureExecutable("git", ["rev-parse", "--short=12", "HEAD"], context, 10_000);
  const statusResult = await captureExecutable("git", ["status", "--porcelain"], context, 10_000);
  if (commit.exitCode !== 0 || statusResult.exitCode !== 0) return fallback;
  const changedFiles = statusResult.stdout.split(/\r?\n/).filter(Boolean).length;
  return {
    changedFiles,
    commit: commit.stdout.trim() || null,
    dirty: changedFiles > 0,
    root: context.repoRoot,
  };
}

export async function runtimeVersion(context: RuntimeContext, runtime: "node" | "python"): Promise<string | null> {
  const executable = runtime === "node" ? context.nodeExecutable : context.pythonExecutable;
  const result = await captureExecutable(executable, ["--version"], context, 10_000);
  if (result.exitCode !== 0) return null;
  return (result.stdout || result.stderr).trim() || null;
}

export async function runAuditedWorkflow(options: {
  context: RuntimeContext;
  // Trusted server code may replace (not merge) the inherited environment.
  // This is never accepted from MCP input; test profiles use an allowlist.
  environment?: NodeJS.ProcessEnv;
  name: string;
  signal?: AbortSignal;
  steps: WorkflowStep[];
  timeoutMs: number;
}): Promise<AuditedRun> {
  if (!options.steps.length) {
    throw new McpToolError("empty_workflow", "The selected workflow contains no steps.", "Review the MCP workflow registry.");
  }

  const startedAt = Date.now();
  const runId = `${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const auditRelative = `.etl/mcp-runs/${runId}`;
  const auditDirectory = await ensureDirectoryInsideRepo(options.context, auditRelative);
  const preRunRepo = await repoSnapshot(options.context);
  const executions: StepExecution[] = [];

  for (const [index, step] of options.steps.entries()) {
    const execution = await runWorkflowStep(options.context, step, {
      environment: options.environment,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    executions.push(execution);
    const prefix = String(index + 1).padStart(2, "0");
    await Promise.all([
      writeFile(path.join(auditDirectory, `${prefix}-stdout.log`), execution.stdout, "utf8"),
      writeFile(path.join(auditDirectory, `${prefix}-stderr.log`), execution.stderr, "utf8"),
    ]);
    if (!stepPassed(execution)) break;
  }

  const postRunRepo = await repoSnapshot(options.context);
  const passed = executions.length === options.steps.length && executions.every(stepPassed);
  const durationMs = Date.now() - startedAt;
  const reference: RunReference = {
    auditPath: `${auditRelative}/manifest.json`,
    durationMs,
    id: runId,
    status: passed ? "passed" : "failed",
  };
  const manifest = {
    durationMs,
    finishedAt: new Date().toISOString(),
    name: options.name,
    postRunRepo,
    preRunRepo,
    runId,
    startedAt: new Date(startedAt).toISOString(),
    status: reference.status,
    steps: executions.map((step) => ({
      args: step.args,
      command: step.command,
      durationMs: step.durationMs,
      exitCode: step.exitCode,
      label: step.label,
      outputLimitExceeded: step.outputLimitExceeded,
      signal: step.signal,
      spawnError: step.spawnError,
      timedOut: step.timedOut,
      wasCancelled: step.wasCancelled,
    })),
  };
  await writeFile(path.join(auditDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { auditDirectory, postRunRepo, preRunRepo, reference, steps: executions };
}

export async function writeAuditJson(run: AuditedRun, fileName: string, value: unknown): Promise<string> {
  if (!/^[a-z0-9][a-z0-9.-]*\.json$/i.test(fileName)) {
    throw new McpToolError("unsafe_audit_name", `Invalid audit filename: ${fileName}`, "Use a simple JSON audit filename.");
  }
  const filePath = path.join(run.auditDirectory, fileName);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

export function stepPassed(step: StepExecution): boolean {
  return step.exitCode === 0
    && !step.outputLimitExceeded
    && !step.spawnError
    && !step.timedOut
    && !step.wasCancelled;
}

export function parseJsonOutput(step: StepExecution): unknown {
  const value = step.stdout.trim();
  if (!value) {
    throw new McpToolError(
      "missing_json_output",
      `${step.label} did not emit JSON on stdout.`,
      "Inspect the run's stderr and audit logs.",
    );
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new McpToolError(
      "invalid_json_output",
      `${step.label} emitted invalid JSON on stdout.`,
      "Inspect the run audit and keep report scripts JSON-only on stdout.",
      { cause: error instanceof Error ? error.message : String(error), tail: tail(value) },
    );
  }
}

export function summarizeStep(step: StepExecution) {
  return {
    args: step.args,
    command: step.command,
    durationMs: step.durationMs,
    exitCode: step.exitCode,
    label: step.label,
    stderrTail: tail(step.stderr),
    stdoutTail: tail(step.stdout),
  };
}

async function runWorkflowStep(
  context: RuntimeContext,
  step: WorkflowStep,
  options: { environment?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs: number },
): Promise<StepExecution> {
  const executable = step.runtime === "node" ? context.nodeExecutable : context.pythonExecutable;
  const result = await captureExecutable(executable, step.args, context, options.timeoutMs, options.signal, options.environment);
  return { ...result, label: step.label };
}

async function captureExecutable(
  command: string,
  args: string[],
  context: RuntimeContext,
  timeoutMs: number,
  externalSignal?: AbortSignal,
  environment?: NodeJS.ProcessEnv,
): Promise<Omit<StepExecution, "label">> {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputLimitExceeded = false;
  let timedOut = false;
  let wasCancelled = false;

  return await new Promise((resolve) => {
    let settled = false;
    let child: ReturnType<typeof spawn> | null = null;
    let timer: NodeJS.Timeout | null = null;

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null, spawnError: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      resolve({
        args: [...args],
        command,
        durationMs: Date.now() - startedAt,
        exitCode,
        outputLimitExceeded,
        signal,
        spawnError,
        stderr: redact(stderr),
        stdout: redact(stdout),
        timedOut,
        wasCancelled,
      });
    };

    const terminate = () => {
      if (child && !child.killed) child.kill();
    };
    const onExternalAbort = () => {
      wasCancelled = true;
      terminate();
    };

    try {
      child = spawn(command, args, {
        cwd: context.repoRoot,
        env: { ...(environment ?? process.env), NO_COLOR: "1", PYTHONUNBUFFERED: "1" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      finish(null, null, error instanceof Error ? error.message : String(error));
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    if (externalSignal?.aborted) onExternalAbort();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= DEFAULT_MAX_OUTPUT_BYTES) stdout += chunk.toString("utf8");
      else {
        outputLimitExceeded = true;
        terminate();
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= DEFAULT_MAX_OUTPUT_BYTES) stderr += chunk.toString("utf8");
      else {
        outputLimitExceeded = true;
        terminate();
      }
    });
    child.on("error", (error) => finish(null, null, error.message));
    child.on("close", (code, signal) => finish(code, signal, null));
  });
}

function tail(value: string, limit = 32_768): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `[truncated]\n${trimmed.slice(-limit)}`;
}

function redact(value: string): string {
  return value
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret|password|database_url|postgres_url)\b\s*([:=])\s*([^\s,;]+)/gi, "$1$2[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

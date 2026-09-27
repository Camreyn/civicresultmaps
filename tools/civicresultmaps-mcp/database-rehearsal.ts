import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { McpToolError, ensureDirectoryInsideRepo, type RuntimeContext } from "./runtime.ts";
import { resolveDatabaseRehearsalTarget } from "../../src/db/database-driver.ts";
import { promoteNativeStagingArtifact } from "../../src/db/native-import.ts";
import { withRehearsalReadSql } from "../../src/db/read-sql.ts";
import { loadRehearsalDataAccess } from "./rehearsal-data-access.ts";

export const DATABASE_REHEARSAL_PROFILES = ["native-import"] as const;
export type DatabaseRehearsalProfile = (typeof DATABASE_REHEARSAL_PROFILES)[number];
export type RehearseDatabaseInput = { confirmation: "REHEARSE_LOCAL_DATABASE"; profile: DatabaseRehearsalProfile };
export type DatabaseRehearsalReport = {
  auditPath: string | null;
  blocker: string | null;
  profile: DatabaseRehearsalProfile;
  resourceLabel: string;
  runId: string;
  status: "failed" | "inconclusive" | "passed";
  warnings: string[];
  evidence?: Record<string, string>;
};

/**
 * This is deliberately not registered here: contracts/server registration is
 * coordinated separately. It is the narrow callable surface for that work.
 */
export async function rehearseDatabase(
  context: RuntimeContext,
  input: RehearseDatabaseInput,
  signal?: AbortSignal,
  dependencies: RehearsalDependencies = nodeDependencies,
): Promise<DatabaseRehearsalReport> {
  assertInput(input);
  const runId = `database-rehearsal-${randomUUID()}`;
  const resourceLabel = `com.civicresultmaps.rehearsal=${runId}`;
  const auditRelative = `.etl/mcp-runs/${runId}`;
  const auditPath = await ensureDirectoryInsideRepo(context, auditRelative);
  const reportBase = { auditPath: `${auditRelative}/database-rehearsal.json`, profile: input.profile, resourceLabel, runId };

  const suffix = runId.replace("database-rehearsal-", "");
  const databaseName = `crm_rehearsal_${suffix}`;
  const restoreName = `${databaseName}_restore`;
  const containerName = `crm-rehearsal-${suffix}`;
  const password = randomBytes(24).toString("base64url");
  const warnings: string[] = [];
  const evidence: Record<string, string> = {};
  let created = false;
  let report: DatabaseRehearsalReport = { ...reportBase, blocker: null, status: "failed", warnings, evidence };
  const commandRunner = dependencies.runCommand ?? run;
  const execute = (command: string, args: string[], cwd: string) => commandRunner(command, args, cwd, signal);
  const requireCommand = async (command: string, args: string[]) => { const result = await execute(command, args, context.repoRoot); if (result.code) throw new Error(`${command} ${args[0]} failed: ${result.stderr}`); };
  try {
    if (signal?.aborted) throw new Error("Database rehearsal cancelled.");
    const actualMigrations = (await readdir(path.join(context.repoRoot, "drizzle"))).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
    if (JSON.stringify(actualMigrations) !== JSON.stringify(migrations)) throw new Error("Migration registry drift: reviewed rehearsal list does not match drizzle SQL files.");
    if ((await execute("docker", ["info"], context.repoRoot)).code !== 0) throw new Error("Docker daemon is unavailable.");
    // Mark the generated name as a cleanup candidate even if creation times out.
    created = true;
    await requireCommand("docker", ["run", "-d", "--rm", "--name", containerName, "--label", resourceLabel, "-p", "127.0.0.1::5432", "-e", "POSTGRES_USER=crm_rehearsal", "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${databaseName}`, "postgres:17-alpine"]);
    const imageIdentity = await execute("docker", ["inspect", "-f", "{{.Image}}", containerName], context.repoRoot);
    if (imageIdentity.code || !/^sha256:[a-f0-9]{64}$/.test(imageIdentity.stdout.trim())) throw new Error("Container image content identity could not be confirmed.");
    evidence.imageContentId = imageIdentity.stdout.trim();
    const portOutput = (await execute("docker", ["port", containerName, "5432/tcp"], context.repoRoot)).stdout;
    const port = Number((portOutput.match(/127\.0\.0\.1:(\d+)/) ?? [])[1]);
    if (!port) throw new Error("Labelled rehearsal container has no loopback port mapping.");
    for (let attempt = 0; attempt < 30; attempt++) {
      if (signal?.aborted) throw new Error("Database rehearsal cancelled.");
      if ((await execute("docker", ["exec", containerName, "pg_isready", "-U", "crm_rehearsal", "-d", databaseName], context.repoRoot)).code === 0) break;
      if (attempt === 29) throw new Error("Rehearsal PostgreSQL did not become ready within 30 seconds.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    for (const file of migrations) {
      evidence[`migration:${file}`] = createHash("sha256").update(await readFile(path.join(context.repoRoot, "drizzle", file))).digest("hex");
      if (signal?.aborted) throw new Error("Database rehearsal cancelled.");
      await requireCommand("docker", ["cp", path.join(context.repoRoot, "drizzle", file), `${containerName}:/tmp/${file}`]);
      await requireCommand("docker", ["exec", containerName, "psql", "-U", "crm_rehearsal", "-d", databaseName, "-v", "ON_ERROR_STOP=1", "-f", `/tmp/${file}`]);
    }
    const fixture = path.join(auditPath, "synthetic-reviewed-fixture.json");
    await dependencies.writeFixture(fixture, false);
    evidence.fixtureSha256 = createHash("sha256").update(await readFile(fixture)).digest("hex");
    const url = `postgres://crm_rehearsal:${password}@127.0.0.1:${port}/${databaseName}`;
    const target = resolveDatabaseRehearsalTarget({ databaseUrl: url, mappedPort: port, runId });
    const before = await databaseHash(url, true);
    evidence.beforeSemanticHash = before;
    await promoteNativeStagingArtifact(fixture, { databaseTarget: target });
    const first = await databaseHash(url, true);
    await promoteNativeStagingArtifact(fixture, { databaseTarget: target });
    const second = await databaseHash(url, true);
    const secondFull = await databaseHash(url);
    evidence.secondImportFullHash = secondFull;
    evidence.idempotenceScope = "Serving table values, preserving foreign keys; excludes append-only import_runs/validation_reports/public_data_revisions and generated primary IDs, import_run_id, created_at/updated_at. Rollback and restore compare ALL rows and schema without these exclusions.";
    evidence.firstImportSemanticHash = first; evidence.secondImportSemanticHash = second;
    if (before === first || first !== second) throw new Error("Native importer failed semantic mutation or idempotence assertion.");
    const rollbackFixture = path.join(auditPath, "synthetic-reviewed-fixture-rollback.json");
    await dependencies.writeFixture(rollbackFixture, true);
    await assert.rejects(promoteNativeStagingArtifact(rollbackFixture, { databaseTarget: target, rehearsalFailBeforeCommit: true }), /Intentional database rehearsal rollback/);
    const rollback = await databaseHash(url); evidence.rollbackSemanticHash = rollback;
    if (rollback !== secondFull) throw new Error("Intentional transaction failure did not roll back.");
    if (signal?.aborted) throw new Error("Database rehearsal cancelled.");
    await requireCommand("docker", ["exec", containerName, "pg_dump", "-U", "crm_rehearsal", "-Fc", "-f", "/tmp/rehearsal.dump", databaseName]);
    await requireCommand("docker", ["exec", containerName, "createdb", "-U", "crm_rehearsal", restoreName]);
    await requireCommand("docker", ["exec", containerName, "pg_restore", "-U", "crm_rehearsal", "-d", restoreName, "/tmp/rehearsal.dump"]);
    const restoredHash = await databaseHash(url.replace(databaseName, restoreName)); evidence.restoreSemanticHash = restoredHash;
    if (restoredHash !== secondFull) throw new Error("Restored database semantic hash differs.");
    const dataAccess = await loadRehearsalDataAccess();
    await withRehearsalReadSql(target, async () => {
      const [results, review, turnout, history] = await Promise.all([
        dataAccess.listResults({ state: "ZZ", year: 2024, level: "county" }),
        dataAccess.listReviewRows({ state: "ZZ", year: 2024, limit: 10, strict: true }),
        dataAccess.listTurnoutRows({ state: "ZZ", year: 2024, limit: 10, strict: true }),
        dataAccess.listHistoricalResultRows({ state: "ZZ", year: 2020, limit: 10, strict: true }),
      ]);
      assert.equal(results.length, 1); assert.equal(results[0].totalVotes, 20);
      assert.equal(review.length, 1); assert.equal(review[0].totalVotes, 20);
      assert.equal(turnout.length, 1); assert.equal(turnout[0].ballotsCast, 20);
      assert.equal(history.length, 1); assert.equal(history[0].totalVotes, 16);
      evidence.applicationReadChecks = "Real listResults/listReviewRows/listTurnoutRows/listHistoricalResultRows returned the synthetic fixture values through scoped read-only SQL.";
    });
    report.status = "passed";
  } catch (error) {
    const blocker = (error instanceof Error ? error.message : String(error)).replaceAll(password, "[REDACTED]");
    const status = /Docker daemon is unavailable|Could not find image|pull access denied|cancelled|timed out/i.test(blocker) ? "inconclusive" : "failed";
    report = { ...reportBase, blocker, status, warnings, evidence };
  } finally {
    if (created) {
      // Cleanup uses its own bounded calls even when the original request was cancelled.
      try {
        const check = await commandRunner("docker", ["inspect", "-f", "{{ index .Config.Labels \"com.civicresultmaps.rehearsal\" }}", containerName], context.repoRoot);
        if (check.code === 0 && check.stdout.trim() === runId) {
          const removed = await commandRunner("docker", ["rm", "-f", "-v", containerName], context.repoRoot);
          if (removed.code) throw new Error("Removing the owned rehearsal container and anonymous volumes failed.");
          evidence.cleanup = "owned_container_and_anonymous_volumes_removed";
        } else throw new Error("Cleanup skipped: exact generated label was not confirmed (container may not have been created).");
      } catch (error) { warnings.push(error instanceof Error ? error.message : "Cleanup could not be confirmed."); evidence.cleanup = "unverified"; if (report.status === "passed") report.status = "inconclusive"; }
    }
  }
  await dependencies.writeAudit(path.join(auditPath, "database-rehearsal.json"), report);
  return report;
}

export function assertInput(input: RehearseDatabaseInput): void {
  if (!input || input.confirmation !== "REHEARSE_LOCAL_DATABASE") {
    throw new McpToolError("confirmation_required", "Database rehearsal requires the exact REHEARSE_LOCAL_DATABASE confirmation.", "Confirm the fixed local rehearsal profile explicitly.");
  }
  if (!DATABASE_REHEARSAL_PROFILES.includes(input.profile)) {
    throw new McpToolError("unknown_profile", "Database rehearsal profile is not reviewed.", "Use the fixed native-import profile.");
  }
}

/** A deterministic semantic hash helper for the later real-Postgres phase. */
export function semanticHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}

const migrations = ["0000_fancy_secret_warriors.sql", "0001_dry_luminals.sql", "0002_historical_review_candidates.sql", "0003_deep_landau.sql", "0004_uneven_hellcat.sql", "0005_lazy_human_torch.sql", "0006_broad_quicksilver.sql", "0007_sudden_agent_brand.sql", "0008_typical_thunderbolts.sql", "0009_public_wolfpack.sql"];
async function databaseHash(url: string, servingOnly = false) {
  const sql = postgres(url, { max: 1, connect_timeout: 10, connection: { statement_timeout: 30000 } });
  try {
    const tables = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
    const content: Record<string, unknown> = {};
    for (const row of tables) {
      if (servingOnly && ["import_runs", "validation_reports", "public_data_revisions"].includes(row.table_name)) continue;
      const name = row.table_name.replace(/"/g, '""');
      const rows = await sql.unsafe<{ row: Record<string, unknown> }[]>(`select to_jsonb(t) as row from public."${name}" t`);
      content[row.table_name] = rows.map(entry => servingOnly ? Object.fromEntries(Object.entries(entry.row).filter(([key]) => !["id", "import_run_id", "created_at", "updated_at"].includes(key))) : entry.row);
    }
    content.$schema = await sql`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`;
    content.$constraints = await sql`select c.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' order by c.relname, con.conname`;
    return semanticHash(content);
  } finally { await sql.end({ timeout: 5 }); }
}
/** Docker is pinned to this host; inherited DOCKER_HOST/context/config routing is never used. */
function localDockerArgs(args: string[]) {
  const host = process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
  return ["--host", host, ...args];
}
const MAX_COMMAND_OUTPUT = 256 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;
async function run(command: string, args: string[], cwd: string, signal?: AbortSignal): Promise<CommandResult> {
  if (signal?.aborted) return { code: 1, stdout: "", stderr: "Database rehearsal cancelled." };
  return new Promise(resolve => {
    const child = spawn(command, command === "docker" ? localDockerArgs(args) : args, { cwd, env: { PATH: process.env.Path ?? process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test" }, windowsHide: true });
    let stdout = "", stderr = "", forcedError: string | null = null;
    const stop = (reason: string) => { forcedError = reason; child.kill(); };
    const abort = () => stop("Database rehearsal cancelled."); signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop(`Command timed out after ${COMMAND_TIMEOUT_MS}ms.`), COMMAND_TIMEOUT_MS);
    const append = (stream: "stdout" | "stderr", bytes: Buffer) => {
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + bytes.length > MAX_COMMAND_OUTPUT) { stop("Command output limit exceeded."); return; }
      if (stream === "stdout") stdout += bytes.toString("utf8"); else stderr += bytes.toString("utf8");
    };
    child.stdout.on("data", (bytes: Buffer) => append("stdout", bytes)); child.stderr.on("data", (bytes: Buffer) => append("stderr", bytes));
    child.on("error", error => { forcedError = error.message; });
    child.on("close", code => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve({ code: forcedError ? 1 : code ?? 1, stdout, stderr: forcedError ?? stderr }); });
  });
}
type CommandResult = { code: number; stdout: string; stderr: string };
type RehearsalDependencies = { writeAudit: (absolutePath: string, report: DatabaseRehearsalReport) => Promise<void>; writeFixture: (absolutePath: string, changed: boolean) => Promise<void>; runCommand?: (command: string, args: string[], cwd: string, signal?: AbortSignal) => Promise<CommandResult> };
const nodeDependencies: RehearsalDependencies = {
  async writeAudit(absolutePath, report) {
    await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  },
  async writeFixture(absolutePath, changed) { await writeFile(absolutePath, `${JSON.stringify(fixture(changed))}\n`, { encoding: "utf8", flag: "wx" }); },
};
function fixture(changed = false) { const harris = changed ? 11 : 10; return { state: { code: "ZZ", name: "Synthetic Rehearsal", authority: "CivicResultMaps reviewed test fixture" }, election: { year: 2024, office: "president", date: "2024-11-05" }, sources: [{ id: "reviewed-synthetic", category: "synthetic fixture", sourceUrl: "https://example.invalid/rehearsal", authority: "CivicResultMaps", timestampBasis: "test", confidence: "reviewed", status: "loaded" }], capabilities: { certifiedResults: true, map: true, reviewGraphs: true, turnout: true, historicalBaseline: true, sourcePlanner: true }, validation: { passed: true, errors: [], warnings: [], metrics: {} }, promotion: { productionWriteAllowed: false }, native: { parser: "database-rehearsal", metrics: {}, resultRows: [{ jurisdictionName: "Example County", level: "county", votes: { Harris: harris, Trump: 9, Other: 1 }, sourceId: "reviewed-synthetic" }], reviewRows: [{ county: "Example County", localUnit: "Example", harris, trump: 9, totalVotes: 20 + Number(changed), harrisShare: 50, trumpShare: 45, sourceId: "reviewed-synthetic" }], turnoutRows: [{ county: "Example County", localUnit: "Example", ballotsCast: 20, registeredVoters: 25, sourceId: "reviewed-synthetic" }], historicalRows: [{ electionYear: 2020, sourceId: "reviewed-synthetic", sourceLevel: "county", rowMethod: "fixture", jurisdictionName: "Example County", localUnit: "Example", demVotes: 8, repVotes: 7, otherVotes: 1, totalVotes: 16 }] } }; }

export type DatabaseDriver = "neon-http" | "postgres";

const permittedLocalHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const localDatabaseName = "crm_clone_dev";
const rehearsalDatabasePrefix = "crm_rehearsal_";
const rehearsalTargetBrand = Symbol("crm.database-rehearsal-target");
const rehearsalTargets = new WeakSet<object>();
type DatabaseRehearsalTarget = {
  databaseUrl: string;
  driver: "postgres";
  rehearsalRunId: string;
  readonly [rehearsalTargetBrand]: true;
};
function configuredDatabaseUrl() {
  return [
    process.env.DATABASE_URL,
    process.env.POSTGRES_DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_DATABASE_URL_UNPOOLED,
    process.env.CRM_URL,
  ].find((value) => value && value.trim() && value.trim() !== '""') ?? "";
}


export function getDatabaseDriver(): DatabaseDriver {
  const driver = process.env.CRM_DATABASE_DRIVER ?? "neon-http";
  if (driver === "neon-http" || driver === "postgres") return driver;
  throw new Error("CRM_DATABASE_DRIVER must be either 'neon-http' or 'postgres'.");
}

/** Returns the deliberately narrow local clone URL. */
export function getLocalCloneDatabaseUrl(options: { requireWriteOptIn?: boolean } = {}) {
  if (process.env.CRM_DATABASE_ENVIRONMENT !== "local") {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires CRM_DATABASE_ENVIRONMENT=local.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires an explicit DATABASE_URL.");
  }
  let target: URL;
  try { target = new URL(databaseUrl); } catch {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires DATABASE_URL to be a valid PostgreSQL URL.");
  }
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires a PostgreSQL DATABASE_URL.");
  }
  if (!permittedLocalHosts.has(target.hostname)) {
    throw new Error("CRM_DATABASE_DRIVER=postgres only permits localhost, 127.0.0.1, or ::1.");
  }
  if (target.port !== "54329") {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires PostgreSQL port 54329.");
  }
  if (decodeURIComponent(target.pathname).replace(/^\//, "") !== localDatabaseName) {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires database crm_clone_dev.");
  }
  if (options.requireWriteOptIn && process.env.CRM_DATABASE_LOCAL_WRITES !== "true") {
    throw new Error("Local database writes require CRM_DATABASE_LOCAL_WRITES=true.");
  }
  return databaseUrl;
}

export function resolveNativeImportDatabaseTarget() {
  const driver = getDatabaseDriver();
  if (driver === "postgres") {
    return { databaseUrl: getLocalCloneDatabaseUrl({ requireWriteOptIn: true }), driver };
  }
  const databaseUrl = configuredDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL or POSTGRES_URL is required to promote native staging data.");
  return { databaseUrl, driver };
}

/**
 * Deliberately separate from the persistent clone resolver. This exists solely
 * for the disposable database rehearsal runner; ordinary promotion never calls
 * it. The run id is the resource identity checked by that runner before it
 * creates or removes a labelled Docker resource.
 */
export function resolveDatabaseRehearsalTarget(input: { databaseUrl: string; mappedPort: number; runId: string }): DatabaseRehearsalTarget {
  const { databaseUrl, mappedPort, runId } = input;
  if (!/^database-rehearsal-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(runId)) {
    throw new Error("Database rehearsal requires a generated rehearsal run id.");
  }
  if (!Number.isInteger(mappedPort) || mappedPort < 1024 || mappedPort > 65535 || mappedPort === 54329) {
    throw new Error("Database rehearsal requires the inspected non-clone mapped port.");
  }
  let target: URL;
  try { target = new URL(databaseUrl); } catch { throw new Error("Database rehearsal requires a valid PostgreSQL URL."); }
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") throw new Error("Database rehearsal requires PostgreSQL.");
  if (!permittedLocalHosts.has(target.hostname)) throw new Error("Database rehearsal only permits a loopback target.");
  if (target.search || target.hash) throw new Error("Database rehearsal URL cannot contain query or fragment overrides.");
  if (target.username !== "crm_rehearsal" || !target.password) throw new Error("Database rehearsal requires the runner's fixed local role and non-empty ephemeral password.");
  if (target.port !== String(mappedPort)) throw new Error("Database rehearsal URL port does not match the inspected container mapping.");
  const databaseName = target.pathname.replace(/^\//, "");
  const expectedDatabaseName = `${rehearsalDatabasePrefix}${runId.replace("database-rehearsal-", "")}`;
  if (databaseName !== expectedDatabaseName) {
    throw new Error("Database rehearsal target must use its exact generated disposable database name.");
  }
  if (databaseName === localDatabaseName || databaseName === "crm_clone_snapshot") throw new Error("Database rehearsal cannot target a clone database.");
  const resolved: DatabaseRehearsalTarget = Object.freeze({ databaseUrl, driver: "postgres" as const, rehearsalRunId: runId, [rehearsalTargetBrand]: true as const });
  rehearsalTargets.add(resolved);
  return resolved;
}

export function isDatabaseRehearsalTarget(value: unknown): value is DatabaseRehearsalTarget {
  return Boolean(value && typeof value === "object" && rehearsalTargets.has(value) && Object.isFrozen(value)
    && Object.prototype.hasOwnProperty.call(value, rehearsalTargetBrand)
    && (value as DatabaseRehearsalTarget)[rehearsalTargetBrand] === true);
}

export type DatabaseDriver = "neon-http" | "postgres";

const permittedLocalHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const localDatabaseName = "crm_clone_dev";
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

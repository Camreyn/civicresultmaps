import { neon } from "@neondatabase/serverless";
import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import { isDatabaseRehearsalTarget } from "./database-driver.ts";
import { getDatabaseUrl } from "./url.ts";

/** The small common surface used by public, read-only database queries. */
export type ReadSql = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<unknown[]>;

export type ReadDatabaseDriver = "neon-http" | "postgres";

const permittedLocalHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const permittedLocalDatabases = new Set(["crm_clone_dev", "crm_clone_snapshot"]);

let localPostgresClient: { url: string; sql: ReadSql } | null = null;
const rehearsalReadScope = new AsyncLocalStorage<ReadSql>();

/**
 * Runs repository data-access loaders against a branded disposable rehearsal
 * database. This scope is never inferred from process environment and cannot
 * alter ordinary reads outside its async callback.
 */
export async function withRehearsalReadSql<T>(target: unknown, callback: () => Promise<T>): Promise<T> {
  if (!isDatabaseRehearsalTarget(target)) {
    throw new Error("Rehearsal read scope requires a target created by the labelled rehearsal resolver.");
  }
  const client = postgres(target.databaseUrl, {
    max: 1, idle_timeout: 20, connect_timeout: 10,
    connection: { application_name: `civicresultmaps-rehearsal-read-${target.rehearsalRunId}`, default_transaction_read_only: true },
  });
  const sql = (strings: TemplateStringsArray, ...params: unknown[]) => (client as unknown as ReadSql)(strings, ...params);
  try {
    return await rehearsalReadScope.run(sql, callback);
  } finally {
    await client.end({ timeout: 5 });
  }
}

export function getReadDatabaseDriver(): ReadDatabaseDriver {
  const driver = process.env.CRM_DATABASE_DRIVER ?? "neon-http";
  if (driver === "neon-http" || driver === "postgres") return driver;
  throw new Error("CRM_DATABASE_DRIVER must be either 'neon-http' or 'postgres'.");
}

function localPostgresDatabaseUrl() {
  if (process.env.CRM_DATABASE_ENVIRONMENT !== "local") {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires CRM_DATABASE_ENVIRONMENT=local.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires an explicit DATABASE_URL.");
  }

  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
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

  const databaseName = decodeURIComponent(target.pathname).replace(/^\//, "");
  if (!permittedLocalDatabases.has(databaseName)) {
    throw new Error("CRM_DATABASE_DRIVER=postgres requires crm_clone_dev or crm_clone_snapshot.");
  }

  return databaseUrl;
}

function configuredReadDatabaseUrl() {
  if (getReadDatabaseDriver() === "postgres") return localPostgresDatabaseUrl();
  return getDatabaseUrl() || null;
}

/**
 * Local mode is validated eagerly so a missing or remote URL cannot silently use seed data.
 * The default deployed driver preserves the existing no-database seed fallback.
 */
export function hasReadableDatabase() {
  if (rehearsalReadScope.getStore()) return true;
  return Boolean(configuredReadDatabaseUrl());
}

export function rethrowReadErrorIfStrict(error: unknown): void {
  if (rehearsalReadScope.getStore()) throw error;
  if (process.env.CRM_DATABASE_STRICT === "true") throw error;
}

export function getReadSql(): ReadSql {
  const scoped = rehearsalReadScope.getStore();
  if (scoped) return scoped;
  const databaseUrl = configuredReadDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL or POSTGRES_URL is not configured.");

  if (getReadDatabaseDriver() === "neon-http") return neon(databaseUrl) as ReadSql;

  if (!localPostgresClient || localPostgresClient.url !== databaseUrl) {
    const sql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: {
        application_name: "civicresultmaps-local-read",
        default_transaction_read_only: true,
      },
    });
    localPostgresClient = {
      url: databaseUrl,
      sql: (strings, ...params) => (sql as unknown as ReadSql)(strings, ...params),
    };
  }
  return localPostgresClient.sql;
}

export function researchDatabaseTarget(env: Record<string, string | undefined>) {
  const value = env.CONNECTIONS_DATABASE_URL;
  if (!value) throw new Error("Research database is not configured");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("A PostgreSQL research database is required");
  if (url.hash) throw new Error("Research database addresses must not contain fragments");
  const environment = env.CONNECTIONS_DATABASE_ENVIRONMENT;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (local) {
    if (url.search) throw new Error("Local research database options cannot override its approved target");
    if (environment !== "local" || url.port !== "54329" || !["crm_clone_dev", "crm_connections_dev"].includes(name)) throw new Error("Local research requires an explicitly isolated database on loopback port 54329");
    return { url: value, driver: "postgres" as const, environment };
  }
  if (!["preview", "production"].includes(environment ?? "") || env.VERCEL_ENV !== environment) throw new Error("Remote research requires a matching approved deployment environment");
  if (url.port && url.port !== "5432") throw new Error("Remote research requires the supported PostgreSQL port");
  for (const [key, value] of url.searchParams) {
    if (!(key === "sslmode" && ["require", "verify-full"].includes(value)) && !(key === "channel_binding" && ["require", "prefer"].includes(value))) throw new Error("Research database options cannot override its approved identity or transport");
  }
  if (url.hostname !== env.CONNECTIONS_APPROVED_DATABASE_HOST || name !== env.CONNECTIONS_APPROVED_DATABASE_NAME) throw new Error("Research database does not match its approved identity");
  return { url: value, driver: "neon" as const, environment };
}
export function assertResearchWrites(env: Record<string, string | undefined>) {
  const target = researchDatabaseTarget(env);
  if (env.CONNECTIONS_WRITES_ENABLED !== "1") throw new Error("Research editing is disabled");
  if (target.environment === "local" && env.CRM_DATABASE_LOCAL_WRITES !== "true") throw new Error("Local research requires explicit local write opt-in");
  if (target.environment === "production" && env.CONNECTIONS_PRODUCTION_EDITORIAL_WRITES_APPROVED !== "1") throw new Error("Production editorial writes require separate approval");
  return target;
}

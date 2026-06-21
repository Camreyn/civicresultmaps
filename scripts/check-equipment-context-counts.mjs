import { neon } from "@neondatabase/serverless";

function getDatabaseUrl() {
  return (
    [
      process.env.DATABASE_URL,
      process.env.POSTGRES_DATABASE_URL,
      process.env.POSTGRES_URL,
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.POSTGRES_DATABASE_URL_UNPOOLED,
      process.env.CRM_URL,
    ].find((value) => value && value.trim() && value.trim() !== '""') ?? ""
  );
}

function argValue(name, fallback, positionalIndex) {
  const index = process.argv.indexOf(name);
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return index === -1
    ? process.env[envKey] ?? process.argv[2 + positionalIndex] ?? fallback
    : process.argv[index + 1];
}

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required to check equipment context counts.");
}

const state = String(argValue("--state", "WI", 0)).toUpperCase();
const year = Number(argValue("--year", "2024", 1));
const sql = neon(databaseUrl);
const rows = await sql.query(
  "select count(*)::int as count from equipment_rows where state_code = $1 and election_year = $2",
  [state, year],
);

console.log(JSON.stringify({ state, year, count: rows[0]?.count ?? 0 }));

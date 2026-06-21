import { neon } from "@neondatabase/serverless";
import { stateCodes } from "./state-metadata.mjs";

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
  const envValue = process.env[envKey] && process.env[envKey] !== "true" ? process.env[envKey] : undefined;
  return index === -1
    ? envValue ?? process.argv[2 + positionalIndex] ?? fallback
    : process.argv[index + 1];
}

function hasFlag(name) {
  const envKey = `npm_config_${name.replace(/^--/, "").replaceAll("-", "_")}`;
  return process.argv.includes(name) || process.env[envKey] === "true";
}

function statesToProcess() {
  if (hasFlag("--all")) {
    return stateCodes();
  }

  const stateIndex = process.argv.indexOf("--state");
  const envState = process.env.npm_config_state && process.env.npm_config_state !== "true" ? process.env.npm_config_state : "";
  const explicit = stateIndex === -1 ? envState : process.argv[stateIndex + 1];
  const positional = process.argv
    .slice(2)
    .flatMap((value) => value.split(/[,\s]+/))
    .filter((value) => /^[A-Za-z]{2}$/.test(value))
    .join(",");

  return String(explicit || positional || "WI")
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
}

function yearToProcess() {
  const yearIndex = process.argv.indexOf("--year");
  const envYear = process.env.npm_config_year && process.env.npm_config_year !== "true" ? process.env.npm_config_year : "";
  const positional = process.argv.slice(2).find((value) => /^\d{4}$/.test(value));
  return Number(yearIndex === -1 ? envYear || positional || "2024" : process.argv[yearIndex + 1]);
}

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required to check equipment context counts.");
}

const year = yearToProcess();
const requestedStates = statesToProcess();
const sql = neon(databaseUrl);
const rows = await sql.query(
  "select state_code, count(*)::int as count from equipment_rows where election_year = $1 and state_code = any($2) group by state_code order by state_code",
  [year, requestedStates],
);
const counts = new Map(rows.map((row) => [row.state_code, Number(row.count)]));

console.log(
  JSON.stringify({
    year,
    states: requestedStates.map((state) => ({ state, count: counts.get(state) ?? 0 })),
  }),
);

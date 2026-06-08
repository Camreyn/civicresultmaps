import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Database = ReturnType<typeof createDb>;

let db: Database | null = null;

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return drizzle(neon(databaseUrl), { schema });
}

export function getDb() {
  if (!db) {
    db = createDb();
  }

  return db;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

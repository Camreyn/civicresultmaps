import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import * as uiLayoutV3Schema from "./ui-layout-v3-schema";
import { getDatabaseUrl } from "./url";

type Database = ReturnType<typeof createDb>;

let db: Database | null = null;

function createDb() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not configured.");
  }

  return drizzle(neon(databaseUrl), { schema: { ...schema, ...uiLayoutV3Schema } });
}

export function getDb() {
  if (!db) {
    db = createDb();
  }

  return db;
}

export function hasDatabase() {
  return Boolean(getDatabaseUrl());
}

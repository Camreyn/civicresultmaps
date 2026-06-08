import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { seedStarterData } from "@/db/starter-seed";
import { getDatabaseUrl } from "@/db/url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const setupToken = process.env.SETUP_TOKEN;
  const authHeader = request.headers.get("authorization");

  if (!setupToken) {
    return NextResponse.json({ error: "SETUP_TOKEN is not configured." }, { status: 503 });
  }

  if (authHeader !== `Bearer ${setupToken}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return NextResponse.json({ error: "Database URL is not configured." }, { status: 503 });
  }

  const sql = neon(databaseUrl);
  const [schemaCheck] = await sql.query(
    "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'states') as exists",
  );

  if (!schemaCheck?.exists) {
    const migrationSql = readFileSync(
      join(process.cwd(), "drizzle", "0000_fancy_secret_warriors.sql"),
      "utf8",
    );
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.query(statement);
    }
  }

  await seedStarterData();

  return NextResponse.json({
    ok: true,
    migrated: !schemaCheck?.exists,
    seeded: true,
    generatedAt: new Date().toISOString(),
  });
}

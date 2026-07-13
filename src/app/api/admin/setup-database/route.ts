import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
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
    const migrationDirectory = join(process.cwd(), "drizzle");
    const migrationFiles = readdirSync(migrationDirectory)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();

    const statements = migrationFiles.flatMap((file) =>
      readFileSync(join(migrationDirectory, file), "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean),
    );

    await sql.transaction(statements.map((statement) => sql.query(statement)));
  }

  await seedStarterData();

  return NextResponse.json({
    ok: true,
    migrated: !schemaCheck?.exists,
    seeded: true,
    generatedAt: new Date().toISOString(),
  });
}

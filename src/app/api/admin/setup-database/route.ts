import { migrate } from "drizzle-orm/neon-http/migrator";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { seedStarterData } from "@/db/starter-seed";

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

  await migrate(getDb(), { migrationsFolder: "drizzle" });
  await seedStarterData();

  return NextResponse.json({
    ok: true,
    migrated: true,
    seeded: true,
    generatedAt: new Date().toISOString(),
  });
}

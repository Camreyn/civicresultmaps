import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "../src/db/url.ts";
import { jurisdictionTagForRow } from "../src/lib/jurisdiction-tags.ts";

const apply = process.argv.includes("--apply");
const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required for jurisdiction tag backfill.");
}

const sql = neon(databaseUrl);
const tables = [
  { table: "result_rows", id: "id", state: "state_code", code: "jurisdiction_code", name: "jurisdiction_name", level: "level" },
  { table: "review_rows", id: "id", state: "state_code", code: "jurisdiction_code", name: "jurisdiction_name", level: "level" },
  { table: "turnout_rows", id: "id", state: "state_code", code: "jurisdiction_code", name: "jurisdiction_name", level: "level" },
  { table: "historical_result_rows", id: "id", state: "state_code", code: "jurisdiction_code", name: "jurisdiction_name", level: "source_level" },
  { table: "analysis_indicators", id: "id", state: "state_code", code: "jurisdiction_code", name: "jurisdiction_name", level: "level" },
  { table: "equipment_rows", id: "id", state: "state_code", code: "jurisdiction_code", name: "jurisdiction_name", level: "level" },
];

const unmapped = [];
const summary = [];

for (const table of tables) {
  if (apply) {
    await sql.query(`alter table ${table.table} add column if not exists jurisdiction_tag text`);
  }
  const rows = await sql.query(`select ${table.id} as id, ${table.state} as state, ${table.code} as code, ${table.name} as name, ${table.level} as level from ${table.table}`);
  let resolved = 0;
  for (const row of rows) {
    const tag = jurisdictionTagForRow({ state: row.state, jurisdictionCode: row.code, jurisdictionName: row.name, level: row.level });
    if (!tag) {
      unmapped.push({ table: table.table, id: row.id, state: row.state, jurisdictionCode: row.code, jurisdictionName: row.name, level: row.level });
      continue;
    }
    resolved += 1;
    if (apply) {
      await sql.query(`update ${table.table} set jurisdiction_tag = $1 where id = $2`, [tag, row.id]);
    }
  }
  summary.push({ table: table.table, rows: rows.length, resolved, unresolved: rows.length - resolved });
}

mkdirSync(path.join(process.cwd(), ".etl", "jurisdiction-tags"), { recursive: true });
const reportPath = path.join(process.cwd(), ".etl", "jurisdiction-tags", apply ? "backfill-applied-unmapped.json" : "backfill-dry-run-unmapped.json");
writeFileSync(reportPath, `${JSON.stringify({ apply, generatedAt: new Date().toISOString(), summary, unmapped }, null, 2)}\n`);
console.log(JSON.stringify({ apply, reportPath, summary, unresolved: unmapped.length }, null, 2));


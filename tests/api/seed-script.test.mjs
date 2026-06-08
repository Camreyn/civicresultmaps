import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/seed-starter-data.mjs", "utf8");
const starterSeed = readFileSync("src/db/starter-seed.ts", "utf8");

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("starter seed script requires a database URL", () => {
  assert.match(script, /seedStarterData/);
  assert.match(starterSeed, /DATABASE_URL or POSTGRES_URL is required/);
});

test("starter seed script is idempotent", () => {
  assert.match(starterSeed, /on conflict \(code\)/);
  assert.match(starterSeed, /on conflict \(slug\)/);
  assert.match(starterSeed, /on conflict \(contest_id, level, jurisdiction_code, candidate_name, party\)/);
});

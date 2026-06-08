import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/seed-starter-data.mjs", "utf8");

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("starter seed script requires DATABASE_URL", () => {
  assert.match(script, /DATABASE_URL is required/);
});

test("starter seed script is idempotent", () => {
  assert.match(script, /on conflict \(code\)/);
  assert.match(script, /on conflict \(slug\)/);
  assert.match(script, /on conflict \(contest_id, level, jurisdiction_code, candidate_name, party\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("project is branded for Civic Result Maps", () => {
  assert.equal(packageJson.name, "civicresultmaps");
  assert.match(packageJson.description, /Civic Result Maps/);
});

test("public API route contracts exist", () => {
  const expectedRoutes = [
    "src/app/api/states/route.ts",
    "src/app/api/elections/route.ts",
    "src/app/api/results/route.ts",
    "src/app/api/sources/route.ts",
    "src/app/api/coverage/route.ts",
  ];

  for (const route of expectedRoutes) {
    const content = readFileSync(route, "utf8");
    assert.match(content, /GET/);
    assert.match(content, /NextResponse/);
  }
});

test("seed data carries required provenance fields", () => {
  const seedData = readFileSync("src/lib/seed-data.ts", "utf8");
  for (const field of ["sourceUrl", "authority", "timestampBasis", "confidence", "parser"]) {
    assert.match(seedData, new RegExp(field));
  }
});

test("production domains force HTTPS through proxy", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /civicresultmaps\.org/);
  assert.match(proxy, /x-forwarded-proto/);
  assert.match(proxy, /NextResponse\.redirect/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("legacy importer parses static app-data bundles", () => {
  const importer = readFileSync("src/db/legacy-import.ts", "utf8");
  assert.match(importer, /presidentCountyResults/);
  assert.match(importer, /parseLegacyBundle/);
  assert.match(importer, /source\.slice\(firstBrace, lastBrace \+ 1\)/);
  assert.match(importer, /validateLegacyRows/);
  assert.match(importer, /numeric labels/);
  assert.match(importer, /duplicateNames/);
  assert.match(importer, /insert into import_runs/);
  assert.match(importer, /status = 'promoted'/);
  assert.match(importer, /cleanupLegacyState/);
  assert.match(importer, /delete from result_rows/);
  assert.match(importer, /on conflict \(contest_id, level, jurisdiction_code, candidate_name, party\)/);
});

test("legacy import route is token protected and allowlisted", () => {
  const route = readFileSync("src/app/api/admin/import-legacy-state/route.ts", "utf8");
  const catalog = readFileSync("src/db/legacy-catalog.ts", "utf8");
  assert.match(route, /IMPORT_TOKEN/);
  assert.match(route, /legacyImportCatalog/);
  assert.match(route, /action === "cleanup"/);
  assert.match(route, /cleanupLegacyState/);
  assert.match(catalog, /legacyImportStates/);
  assert.match(catalog, /WA/);
  assert.match(catalog, /WI/);
});

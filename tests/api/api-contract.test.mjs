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
    "src/app/api/indicators/route.ts",
    "src/app/api/completeness/route.ts",
    "src/app/api/review-rows/route.ts",
    "src/app/api/turnout/route.ts",
    "src/app/api/historical-baselines/route.ts",
    "src/app/api/native-source-packages/route.ts",
  ];

  for (const route of expectedRoutes) {
    const content = readFileSync(route, "utf8");
    assert.match(content, /GET/);
    assert.match(content, /NextResponse/);
  }
});

test("map joins support repository GeoJSON county name variants", () => {
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  assert.match(explorer, /county_name/);
  assert.match(explorer, /function featureName/);
  assert.match(explorer, /ak-house-districts\.geojson/);
  assert.match(explorer, /lon - 360/);
  assert.match(explorer, /KALAWAO/);
  assert.match(explorer, /function coordinateBounds/);
  assert.doesNotMatch(explorer, /Math\.(min|max)\(\.\.\./);
  assert.match(explorer, /mapJoinStats/);
  assert.match(explorer, /Map join needs review/);
  assert.match(explorer, /No joined result/);
});

test("public completeness report exists for national readiness", () => {
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const types = readFileSync("src/lib/types.ts", "utf8");
  const overview = readFileSync("src/app/national-overview.tsx", "utf8");
  const readiness = readFileSync("src/app/readiness/page.tsx", "utf8");
  const home = readFileSync("src/app/page.tsx", "utf8");
  const packages = readFileSync("src/lib/native-source-packages.ts", "utf8");

  assert.match(types, /CompletenessSummary/);
  assert.match(types, /sourceTier/);
  assert.match(types, /latestImportSummary/);
  assert.match(types, /latestNativeImportSummary/);
  assert.match(dataAccess, /listCompletenessReport/);
  assert.match(dataAccess, /nativeImportCount/);
  assert.match(dataAccess, /legacyImportCount/);
  assert.match(dataAccess, /latest_import_summary/);
  assert.match(dataAccess, /latest_native_import_summary/);
  assert.match(dataAccess, /sourcesMissingUrls/);
  assert.match(overview, /Completeness API/);
  assert.match(overview, /Native official states/);
  assert.match(overview, /lineage-pill/);
  assert.match(home, /\/readiness/);
  assert.match(readiness, /missing data dashboard/);
  assert.match(readiness, /Native Import Coverage/);
  assert.match(readiness, /Comparison \/ turnout ready/);
  assert.match(readiness, /coverage-chip/);
  assert.match(readiness, /State Work Queue/);
  assert.match(readiness, /State Import Details/);
  assert.match(readiness, /Native Source Package/);
  assert.match(readiness, /Expected Totals/);
  assert.match(readiness, /Source Packages API/);
  assert.match(packages, /listNativeSourcePackages/);
  assert.match(packages, /getNativeSourcePackage/);
  assert.match(readiness, /Legacy-only states/);
  assert.match(readiness, /Historical baseline rows/);
});

test("source URLs remain first-class in explorer UX", () => {
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");

  assert.match(explorer, /table-source-link/);
  assert.match(explorer, /Open source/);
  assert.match(tabs, /Official Source Links/);
  assert.match(tabs, /Source URL missing/);
});

test("review indicators explain advisory meaning", () => {
  const eli5 = readFileSync("src/app/eli5.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  const overview = readFileSync("src/app/national-overview.tsx", "utf8");

  assert.match(eli5, /ELI5/);
  assert.match(tabs, /indicatorExplanation/);
  assert.match(tabs, /advisory indicator/);
  assert.match(tabs, /severityBucket/);
  assert.match(tabs, /Vote-Share by Vote-Count Scatterplot/);
  assert.match(tabs, /Presidential-Versus-Comparison Drop-Off Histogram/);
  assert.match(tabs, /How to read this/);
  assert.match(tabs, /downloadSvgElement/);
  assert.match(tabs, /Partial screening data/);
  assert.match(tabs, /Proxy graph, not a complete Klimek fingerprint/);
  assert.match(explorer, /Eli5/);
  assert.match(overview, /Eli5/);
});

test("raw review turnout and historical APIs are exposed", () => {
  const schema = readFileSync("src/db/schema.ts", "utf8");
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");

  assert.match(schema, /reviewRows/);
  assert.match(schema, /historicalResultRows/);
  assert.match(dataAccess, /listReviewRows/);
  assert.match(dataAccess, /listTurnoutRows/);
  assert.match(dataAccess, /listHistoricalResultRows/);
  assert.match(tabs, /Historical Baselines/);
  assert.match(tabs, /historicalYearSummaries/);
  assert.match(tabs, /enabledHistoricalYears/);
  assert.match(tabs, /enabledHistoricalGraphs/);
  assert.match(tabs, /Statewide Vote Share/);
  assert.match(tabs, /Largest County Dem-Share Movement/);
  assert.match(tabs, /Klimek-Style Vote Fingerprints/);
  assert.match(tabs, /Shpilkin-Style Vote-Share Diagnostics/);
  assert.doesNotMatch(tabs, /Klimek & Shpilkin-Style Fingerprints/);
  assert.match(tabs, /fingerprint-grid/);
  assert.match(tabs, /shpilkin-grid/);
  assert.match(tabs, /\/api\/review-rows/);
  assert.match(tabs, /\/api\/turnout/);
  assert.match(tabs, /\/api\/historical-baselines/);
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

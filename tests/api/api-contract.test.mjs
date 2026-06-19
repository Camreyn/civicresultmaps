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
    "src/app/api/vote-methods/route.ts",
    "src/app/api/turnout-sources/route.ts",
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
  assert.doesNotMatch(readiness, /Package Requests API/);
  assert.doesNotMatch(readiness, /Native Package Requests/);
  assert.match(packages, /listNativeSourcePackages/);
  assert.match(packages, /listNativeSourcePackageRequests/);
  assert.match(packages, /getNativeSourcePackage/);
  assert.doesNotMatch(readFileSync("src/lib/api.ts", "utf8"), /listNativeSourcePackageRequests/);
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

test("state switcher shows compact data availability", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  const switcher = readFileSync("src/app/state-switcher.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  assert.match(page, /completenessReport={completenessReport}/);
  assert.match(switcher, /CompletenessSummary/);
  assert.match(switcher, /stateDataBadges/);
  assert.match(switcher, /Loaded/);
  assert.match(switcher, /Partial/);
  assert.match(switcher, /Missing/);
  assert.match(switcher, /Results/);
  assert.match(switcher, /Sources/);
  assert.match(switcher, /Review/);
  assert.match(switcher, /Turnout/);
  assert.match(switcher, /History/);
  assert.match(styles, /state-data-grid/);
  assert.match(styles, /state-data-badge\.loaded/);
  assert.match(styles, /state-data-badge\.partial/);
  assert.match(styles, /state-data-badge\.missing/);
});

test("review indicators explain advisory meaning", () => {
  const eli5 = readFileSync("src/app/eli5.tsx", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  const overview = readFileSync("src/app/national-overview.tsx", "utf8");

  assert.match(eli5, /ELI5/);
  assert.match(tabs, /indicatorExplanation/);
  assert.match(tabs, /flagMethodologyGuides/);
  assert.match(tabs, /Flag Calculation Guide/);
  assert.match(tabs, /Alternative explanations/);
  assert.match(tabs, /Vote-share correlation/);
  assert.match(tabs, /advisory indicator/);
  assert.match(tabs, /severityBucket/);
  assert.match(tabs, /Vote-Share by Vote-Count Scatterplot/);
  assert.match(tabs, /Presidential-Versus-Comparison Drop-Off Histogram/);
  assert.match(tabs, /How to read this/);
  assert.match(tabs, /downloadSvgElement/);
  assert.match(tabs, /Partial screening data/);
  assert.match(tabs, /Proxy graph, not a complete Klimek fingerprint/);
  assert.match(tabs, /methodologyGuides/);
  assert.match(tabs, /methodology-card/);
  assert.match(tabs, /Read this carefully/);
  assert.match(tabs, /Official References/);
  assert.match(tabs, /Vote-share scatterplot/);
  assert.match(tabs, /Drop-off histogram/);
  assert.match(tabs, /Turnout and registration checks/);
  assert.match(tabs, /Klimek-style fingerprints/);
  assert.match(tabs, /Shpilkin-style diagnostics/);
  assert.match(tabs, /EAC Quality Monitoring Program/);
  assert.match(tabs, /EAC Voting System Reports Collection/);
  assert.match(tabs, /NIST Voting Program/);
  assert.doesNotMatch(tabs, /Sources API/);
  assert.match(explorer, /Eli5/);
  assert.match(explorer, /clickable-row/);
  assert.match(explorer, /Inspect \$\{row\.jurisdictionName\}/);
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
  assert.match(readFileSync("src/lib/api.ts", "utf8"), /listVoteMethodRows/);
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
  assert.match(tabs, /\/api\/vote-methods/);
  assert.match(tabs, /buildWorkspaceTourSteps/);
  assert.match(tabs, /candidate-method-note/);
  assert.match(tabs, /Candidate by Method/);
  assert.match(tabs, /Candidate-by-method needs an official source/);
  assert.match(tabs, /vote-method-summary/);
  assert.match(tabs, /vote-method-layer/);
  assert.match(tabs, /Vote Methods CSV/);
  assert.match(tabs, /\/api\/historical-baselines/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /Method layer/);
  assert.match(readFileSync("src/app/guided-tour.tsx", "utf8"), /Jump to tour step/);
  assert.match(readFileSync("src/app/guided-tour.tsx", "utf8"), /skipIfMissing/);
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

test("native source package handoff is validated in CI", () => {
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const validator = readFileSync("scripts/validate-native-source-packages.mjs", "utf8");

  assert.match(packageScripts["validate:source-packages"], /validate-native-source-packages/);
  assert.match(workflow, /validate:source-packages/);
  assert.match(validator, /native-import-source-packages\.json/);
  assert.match(validator, /expected trump \+ harris \+ other does not equal stateTotal/);
});

test("turnout collection inventory is available outside the app", () => {
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const inventoryScript = readFileSync("scripts/report-turnout-inventory.mjs", "utf8");
  const validator = readFileSync("scripts/validate-turnout-source-packages.mjs", "utf8");
  const inventoryDoc = readFileSync("docs/turnout-collection-inventory.md", "utf8");
  const turnoutPackages = readFileSync("data/turnout-source-packages.json", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  assert.match(packageScripts["turnout:inventory"], /report-turnout-inventory/);
  assert.match(packageScripts["turnout:collect"], /collect-turnout-sources/);
  assert.match(packageScripts["turnout:extract:eac-states"], /extract-eac-state-turnout/);
  assert.match(packageScripts["turnout:normalize:eac"], /normalize-eac-turnout/);
  assert.match(packageScripts["validate:turnout-packages"], /validate-turnout-source-packages/);
  assert.match(workflow, /validate:turnout-packages/);
  assert.match(inventoryScript, /needs_native_turnout_package/);
  assert.match(inventoryScript, /native_config_missing_turnout/);
  assert.match(inventoryScript, /registryStatus/);
  assert.match(validator, /turnout-source-packages\.json/);
  assert.match(turnoutPackages, /loadedPackages/);
  assert.match(turnoutPackages, /stateYearStatuses/);
  assert.match(turnoutPackages, /normalizedTurnoutContract/);
  assert.match(turnoutPackages, /verified-voting-verifier-context/);
  assert.match(turnoutPackages, /remainingStatesNeedingPackages/);
  assert.match(inventoryDoc, /Loaded Turnout/);
  assert.match(inventoryDoc, /Wisconsin-Specific Request/);
});

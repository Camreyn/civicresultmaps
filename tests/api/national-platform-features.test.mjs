import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function test(name, fn) {
  fn();
  console.log("ok - " + name);
}

test("national release catalog is versioned and coverage stays internally consistent", () => {
  const catalog = JSON.parse(readFileSync("data/national-data-releases.json", "utf8"));
  const current = catalog.releases.find((release) => release.id === catalog.currentReleaseId);
  assert.ok(current);
  assert.match(current.dataSha256, /^[a-f0-9]{64}$/);
  assert.match(current.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(current.geographyVintageYear, 2024);
  assert.match(current.historicalGeographyPolicy, /Connecticut/);
  const archivePath = "public" + current.archivePath;
  assert.equal(existsSync(archivePath), true);
  const archiveHash = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
  assert.equal(archiveHash, current.archiveSha256);
  assert.equal(current.coverage.registryCountyEquivalents, 3144);
  assert.equal(current.coverage.matchedCountyRowsByYear["2016"], 3114);
  assert.equal(current.coverage.matchedCountyRowsByYear["2020"], 3114);
  assert.equal(current.coverage.matchedCountyRowsByYear["2024"], 3114);
  assert.equal(current.coverage.unavailableCountyEquivalents, 30);
  assert.equal(current.comparisonSummary["2020-2024"].blueToRed, 87);
  assert.equal(current.comparisonSummary["2020-2024"].redToBlue, 0);
  assert.equal(
    current.comparisonSummary["2020-2024"].matched,
    current.comparisonSummary["2020-2024"].blueToRed
      + current.comparisonSummary["2020-2024"].redToBlue
      + current.comparisonSummary["2020-2024"].noFlip,
  );
});

test("formal API exposes OpenAPI, v1 aliases, pagination, CORS, and bulk release paths", () => {
  const expected = [
    "src/app/api/openapi/route.ts",
    "src/app/api/releases/route.ts",
    "src/app/api/releases/[releaseId]/route.ts",
    "src/app/api/releases/[releaseId]/download/route.ts",
    "src/app/api/v1/flips/route.ts",
    "src/app/api/v1/counties/[fips]/route.ts",
    "src/app/api/v1/confidence/route.ts",
    "src/app/api/v1/jurisdictions/route.ts",
    "src/app/api/v1/jurisdictions/search/route.ts",
    "src/app/api/v1/releases/route.ts",
    "src/app/api/v1/releases/[releaseId]/download/route.ts",
  ];
  expected.forEach((path) => assert.equal(existsSync(path), true, path));

  const openapi = readFileSync("src/lib/openapi.ts", "utf8");
  const api = readFileSync("src/lib/api.ts", "utf8");
  const bundle = readFileSync("src/app/api/releases/[releaseId]/download/route.ts", "utf8");
  const registry = readFileSync("src/app/api/jurisdictions/route.ts", "utf8");
  const searchRoute = readFileSync("src/app/api/jurisdictions/search/route.ts", "utf8");
  assert.match(openapi, /openapi: "3\.1\.0"/);
  assert.match(openapi, /\/api\/v1\/flips/);
  assert.match(openapi, /limit/);
  assert.match(openapi, /offset/);
  assert.match(openapi, /ComparisonEnvelope/);
  assert.match(openapi, /CountyProfileEnvelope/);
  assert.match(openapi, /CountySearchEnvelope/);
  assert.match(openapi, /JurisdictionEnvelope/);
  assert.match(openapi, /ConfidenceDefinitionEnvelope/);
  assert.match(openapi, /ErrorEnvelope/);
  assert.match(api, /schemaVersion: publicApiSchemaVersion/);
  assert.match(api, /apiErrorEnvelope/);
  assert.match(api, /Access-Control-Allow-Origin/);
  assert.match(registry, /matchingRows\.slice\(offset, offset \+ limit\)/);
  assert.match(searchRoute, /searchCanonicalCountyPage/);
  assert.match(searchRoute, /hasMore/);
  assert.match(bundle, /NextResponse\.redirect/);
  assert.match(bundle, /release\.archivePath/);
  assert.match(bundle, /X-Archive-Sha256/);
  assert.match(bundle, /immutable/);
  assert.match(bundle, /X-Data-Sha256/);
  assert.doesNotMatch(bundle, /JSZip|loadNationalYearDataset|queryNationalCountyComparisons/);
  assert.match(api, /releaseId: null/);
  assert.match(openapi, /"307"/);
});

test("comparison, county profile, global search, and confidence surfaces are wired", () => {
  const home = readFileSync("src/app/page.tsx", "utf8");
  const compare = readFileSync("src/app/compare/compare-explorer.tsx", "utf8");
  const county = readFileSync("src/app/county/[fips]/page.tsx", "utf8");
  const search = readFileSync("src/app/global-county-search.tsx", "utf8");
  const confidence = readFileSync("src/lib/data-confidence.ts", "utf8");
  const resultsExplorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  const guidedTour = readFileSync("src/app/guided-tour.tsx", "utf8");

  assert.match(home, /GlobalCountySearch/);
  assert.match(home, /supportedPresidentialYears/);
  assert.match(home, /initialMapMode/);
  assert.match(home, /needsReview/);
  assert.match(compare, /National geometry contains/);
  assert.match(compare, /selectedFips/);
  assert.match(compare, /Export CSV/);
  assert.match(county, /2016/);
  assert.match(county, /2020/);
  assert.match(county, /2024/);
  assert.match(county, /not evidence or findings of fraud/);
  assert.match(search, /role="combobox"/);
  for (const level of ["exact", "derived", "partial", "proxy", "non_geographic", "unavailable"]) {
    assert.match(confidence, new RegExp('"' + level + '"'));
  }
  assert.match(home, /selectedYear === 2024/);
  assert.match(resultsExplorer, /electionYear !== 2024 \|\| selectedState !== "AK"/);
  assert.match(resultsExplorer, /electionYear !== 2024 \|\| equipmentRows\.length/);
  assert.match(guidedTour, /window\.sessionStorage\.setItem/);
  assert.match(guidedTour, /stepId: activeStep\.id/);
  assert.match(guidedTour, /setIsOpen\(true\)/);
});

test("evidence timeline is neutral, canonical, and backwards compatible", () => {
  const evidencePage = readFileSync("src/app/evidence/page.tsx", "utf8");
  const timelineView = readFileSync("src/app/timeline/suspicious-timeline.tsx", "utf8");
  const evidenceEvents = readFileSync("src/lib/evidence-events.ts", "utf8");
  const redirect = readFileSync("src/app/timeline/page.tsx", "utf8");
  assert.match(evidencePage, /Evidence &amp; records timeline/);
  assert.match(evidencePage, /do not establish fraud or misconduct/);
  assert.match(timelineView, /Evidence &amp; Records Timeline/);
  assert.doesNotMatch(timelineView, /Suspicious Event Timeline/);
  assert.doesNotMatch(timelineView, /tampering_example|tamperingExample/);
  assert.match(timelineView, /event\.relevance/);
  assert.match(evidenceEvents, /tamperingExample: _legacyScenario/);
  assert.match(redirect, /permanentRedirect\("\/evidence"\)/);
});

test("county sitemap includes the canonical registry and platform routes", () => {
  const registry = JSON.parse(readFileSync("data/canonical-jurisdictions.json", "utf8"));
  const sitemap = readFileSync("src/app/sitemap.ts", "utf8");
  assert.equal(registry.jurisdictions.filter((row) => row.jurisdictionTag.startsWith("county:")).length, 3144);
  assert.match(sitemap, /\/county\//);
  assert.match(sitemap, /\/compare/);
  assert.match(sitemap, /\/evidence/);
  assert.match(sitemap, /\/releases/);
  assert.match(sitemap, /\/developers/);
});

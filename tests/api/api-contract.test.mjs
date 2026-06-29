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
    "src/app/api/equipment/route.ts",
    "src/app/api/admin-sources/route.ts",
    "src/app/api/source-acquisition-tiers/route.ts",
  ];

  for (const route of expectedRoutes) {
    const content = readFileSync(route, "utf8");
    assert.match(content, /GET/);
    assert.match(content, /NextResponse/);
    assert.match(content, /publicDataCacheHeaders/);
  }

  const api = readFileSync("src/lib/api.ts", "utf8");
  assert.match(api, /unstable_cache/);
  assert.match(api, /publicDataRevalidateSeconds/);
  assert.match(api, /Vercel-CDN-Cache-Control/);
});

test("map joins support repository GeoJSON county name variants", () => {
  const explorer = readFileSync("src/app/results-explorer.tsx", "utf8");
  assert.match(explorer, /county_name/);
  assert.match(explorer, /function featureName/);
  assert.match(explorer, /ak-house-districts\.geojson/);
  assert.match(explorer, /lon - 360/);
  assert.match(explorer, /KALAWAO/);
  assert.match(explorer, /function coordinateBounds/);
  assert.match(explorer, /function longitudeScale/);
  assert.match(explorer, /referenceLatitude/);
  assert.match(explorer, /projectedLongitude/);
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
  assert.match(types, /countyIndicatorCount/);
  assert.match(types, /flaggedCountyJurisdictions/);
  assert.match(types, /flaggedAreas/);
  assert.match(types, /rest_of_county/);
  assert.match(types, /sourceTier/);
  assert.match(types, /mapGeometrySourceCount/);
  assert.match(types, /latestImportSummary/);
  assert.match(types, /latestNativeImportSummary/);
  assert.match(dataAccess, /listCompletenessReport/);
  assert.match(dataAccess, /nativeImportCount/);
  assert.match(dataAccess, /legacyImportCount/);
  assert.match(dataAccess, /latest_import_summary/);
  assert.match(dataAccess, /latest_native_import_summary/);
  assert.match(dataAccess, /sourcesMissingUrls/);
  assert.match(dataAccess, /map_geometry_source_count/);
  assert.match(dataAccess, /county_indicator_count/);
  assert.match(dataAccess, /flagged_areas/);
  assert.match(dataAccess, /Map geometry source missing/);
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
  assert.match(readiness, /Source Acquisition Tiers/);
  assert.match(readiness, /Source Acquisition API/);
  assert.match(readiness, /sourceAcquisitionRows/);
  assert.match(readiness, /Subcounty review rows/);
  assert.match(readiness, /sourceAcquisitionReviewTask/);
  assert.doesNotMatch(readiness, /Package Requests API/);
  assert.doesNotMatch(readiness, /Native Package Requests/);
  assert.match(packages, /listNativeSourcePackages/);
  assert.match(packages, /listNativeSourcePackageRequests/);
  assert.match(packages, /sourceDiscoveryQueue/);
  assert.match(packages, /NativeSourceDiscoveryQueueEntry/);
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
  assert.match(switcher, /mapGeometrySourceCount/);
  assert.match(switcher, /Map capability is flagged, but no loaded geometry source is tracked/);
  assert.match(switcher, /Loaded/);
  assert.match(switcher, /Partial/);
  assert.match(switcher, /Missing/);
  assert.match(switcher, /stateFilterOptions/);
  assert.match(switcher, /Missing turnout/);
  assert.match(switcher, /Missing review/);
  assert.match(switcher, /Has turnout/);
  assert.match(switcher, /Results/);
  assert.match(switcher, /Sources/);
  assert.match(switcher, /Review/);
  assert.match(switcher, /county indicators/);
  assert.match(switcher, /total advisory indicators/);
  assert.match(switcher, /flagged areas total/);
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
  const dataReviewTemplate = readFileSync(".github/ISSUE_TEMPLATE/data-review.yml", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(eli5, /ELI5/);
  assert.equal(packageJson.dependencies.jszip.length > 0, true);
  assert.match(tabs, /Data Notes/);
  assert.match(tabs, /Why this is missing or limited/);
  assert.match(tabs, /Review Guide/);
  assert.match(tabs, /How to Review Responsibly/);
  assert.match(tabs, /Reviewer Checklist/);
  assert.match(tabs, /Glossary/);
  assert.match(tabs, /Report Data Issue/);
  assert.match(tabs, /githubIssueUrl/);
  assert.match(tabs, /githubDataReviewTemplate/);
  assert.match(tabs, /template: githubDataReviewTemplate/);
  assert.match(tabs, /issue_type/);
  assert.match(tabs, /what_looks_wrong/);
  assert.doesNotMatch(tabs, /## What looks wrong\?/);
  assert.match(tabs, /Source Manifest JSON/);
  assert.match(tabs, /Import Summary JSON/);
  assert.match(tabs, /All Files ZIP/);
  assert.match(tabs, /exportReviewPackage/);
  assert.match(tabs, /indicatorExplanation/);
  assert.match(tabs, /flagMethodologyGuides/);
  assert.match(tabs, /Flag Calculation Guide/);
  assert.match(tabs, /Alternative explanations/);
  assert.match(tabs, /Vote-share correlation/);
  assert.match(tabs, /advisory indicator/);
  assert.match(tabs, /Flagged counties/);
  assert.match(tabs, /Flagged areas/);
  assert.match(tabs, /auditContextSummary/);
  assert.match(tabs, /denominatorContextSummary/);
  assert.match(tabs, /severityBucket/);
  assert.match(tabs, /Vote-Share by Vote-Count Scatterplot/);
  assert.match(tabs, /Presidential-Versus-Comparison Drop-Off Histogram/);
  assert.match(tabs, /Ticket-Splitting Proxy/);
  assert.match(tabs, /buildTicketSplitSummary/);
  assert.match(tabs, /comparisonContestFromCoverageMode/);
  assert.match(tabs, /comparisonContestLabel/);
  assert.match(tabs, /comparison-contest proxy/);
  assert.match(tabs, /How to read this/);
  assert.match(tabs, /downloadSvgElement/);
  assert.match(tabs, /Partial screening data/);
  assert.match(tabs, /staticChartDiagnostic/);
  assert.match(tabs, /flagMixDiagnostic/);
  assert.match(tabs, /historicalContextDiagnostic/);
  assert.match(tabs, /klimekProxyDiagnostic/);
  assert.match(tabs, /shpilkinProxyDiagnostic/);
  assert.match(tabs, /voteMethodDiagnostic/);
  assert.match(tabs, /equipmentContextDiagnostic/);
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
  assert.match(tabs, /stateDataNoteOverrides/);
  assert.match(tabs, /Wisconsin native review rows/);
  assert.match(tabs, /WEC ward results workbook/);
  assert.match(tabs, /Washington participating-county precinct rows/);
  assert.match(tabs, /5,309 vote gap/);
  assert.match(tabs, /North Carolina uses official reporting-unit rows/);
  assert.match(tabs, /Arizona SOS signed statewide canvass county presidential rows are loaded/);
  assert.match(tabs, /PDF host still blocks scripted downloads/);
  assert.match(tabs, /Georgia SOS media export JSON/);
  assert.match(tabs, /county presidential candidate rows sum 19 votes higher/);
  assert.match(tabs, /17 zero-total precinct entries are omitted/);
  assert.match(tabs, /Nevada Secretary of State archived statewide general election results/);
  assert.match(tabs, /live NVSOS and Silver State hosts still return Incapsula/);
  assert.doesNotMatch(tabs, /Sources API/);
  assert.match(explorer, /Eli5/);
  assert.match(explorer, /clickable-row/);
  assert.match(explorer, /Inspect \$\{row\.jurisdictionName\}/);
  assert.match(overview, /Eli5/);
  assert.match(overview, /county advisory indicator/);
  assert.match(overview, /total advisory indicator/);
  assert.match(dataReviewTemplate, /Data review \/ source correction/);
  assert.match(dataReviewTemplate, /data-review/);
  assert.match(dataReviewTemplate, /I checked the Data Notes/);
  assert.match(dataReviewTemplate, /I understand advisory flags/);
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
  assert.match(dataAccess, /includeMetrics/);
  assert.match(dataAccess, /else '\{\}'::jsonb end as metrics/);
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
  assert.match(tabs, /includeMetrics=true/);
  assert.match(tabs, /\/api\/turnout/);
  assert.match(tabs, /\/api\/vote-methods/);
  assert.match(tabs, /\/api\/equipment/);
  assert.match(tabs, /buildWorkspaceTourSteps/);
  assert.match(tabs, /candidate-method-note/);
  assert.match(tabs, /Candidate by Method/);
  assert.match(tabs, /Candidate-by-method needs an official source/);
  assert.match(tabs, /vote-method-summary/);
  assert.match(tabs, /vote-method-layer/);
  assert.match(tabs, /Vote Methods CSV/);
  assert.match(tabs, /\/api\/historical-baselines/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /Method layer/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /Open equipment source/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /Equipment layer/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /equipmentGroupLabel/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /verifiedVotingAreaPath/);
  assert.match(readFileSync("src/app/results-explorer.tsx", "utf8"), /activeFeatures/);
  assert.match(readFileSync("src/app/guided-tour.tsx", "utf8"), /Jump to tour step/);
  assert.match(readFileSync("src/app/guided-tour.tsx", "utf8"), /skipIfMissing/);
});

test("equipment administration context is source-first and exportable", () => {
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const schema = readFileSync("src/db/schema.ts", "utf8");
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const tabs = readFileSync("src/app/workspace-tabs.tsx", "utf8");
  const api = readFileSync("src/app/api/equipment/route.ts", "utf8");
  const registry = readFileSync("data/admin-source-packages.json", "utf8");
  const normalizer = readFileSync("scripts/normalize-verifiedvoting-equipment.mjs", "utf8");
  const normalizedCsv = readFileSync("data/wi-2024-equipment-context.csv", "utf8");

  assert.match(packageScripts["equipment:collect"], /collect-equipment-sources/);
  assert.match(packageScripts["equipment:extract-areas"], /extract-verifiedvoting-equipment-areas/);
  assert.match(packageScripts["equipment:normalize:verifiedvoting"], /normalize-verifiedvoting-equipment/);
  assert.match(packageScripts["equipment:promote"], /promote-equipment-context/);
  assert.match(packageScripts["equipment:counts"], /check-equipment-context-counts/);
  assert.match(packageScripts["equipment:sync-registry"], /sync-admin-equipment-registry/);
  assert.match(packageScripts["equipment:sync-statuses"], /sync-admin-equipment-statuses/);
  assert.match(packageScripts["validate:equipment-production"], /validate-production-equipment/);
  assert.match(packageScripts["validate:admin-packages"], /validate-admin-source-packages/);
  assert.match(schema, /equipmentRows/);
  assert.match(dataAccess, /listEquipmentRows/);
  assert.match(dataAccess, /equipmentRowCount/);
  assert.match(api, /equipmentClusterDiagnostics/);
  assert.match(api, /jurisdiction-level election-administration context/);
  assert.match(readFileSync("src/app/api/admin-sources/route.ts", "utf8"), /listAdminSourceStatuses/);
  assert.match(tabs, /Equipment Context/);
  assert.match(tabs, /Equipment CSV/);
  assert.match(tabs, /equipment-context\.csv/);
  assert.match(tabs, /context only/);
  assert.match(tabs, /Uniformity notes/);
  assert.match(tabs, /Still missing/);
  assert.match(tabs, /Admin source statuses/);
  assert.match(registry, /Election administration context registry/);
  assert.match(registry, /verified-voting-verifier-wi-2024-equipment/);
  assert.match(registry, /verified-voting-verifier-ga-2024-equipment/);
  assert.match(registry, /uniformityWarningRequired/);
  assert.match(normalizer, /expectedJurisdictions/);
  assert.match(normalizer, /jurisdiction_type/);
  assert.match(normalizer, /configurationSignals/);
  assert.match(normalizer, /uniformityWarningRequired/);
  assert.match(normalizedCsv, /jurisdictionCode,jurisdictionName,level,vendor,systemName/);
  assert.match(normalizedCsv, /Adams County/);
  assert.match(readFileSync("data/verifiedvoting-wi-2024-equipment-areas.geojson", "utf8"), /FeatureCollection/);
  assert.match(readFileSync("src/app/readiness/page.tsx", "utf8"), /Administration Source Inventory/);
  assert.match(readFileSync("src/app/readiness/page.tsx", "utf8"), /Admin Sources API/);
  assert.match(readFileSync("src/lib/equipment-diagnostics.ts", "utf8"), /minimumUsefulJurisdictions/);
  assert.match(readFileSync("src/lib/equipment-diagnostics.ts", "utf8"), /demographic, geographic, contest/);
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
  assert.match(packageScripts["validate:source-acquisition-tiers"], /validate-source-acquisition-tiers/);
  assert.match(workflow, /validate:source-packages/);
  assert.match(workflow, /validate:source-acquisition-tiers/);
  assert.match(validator, /native-import-source-packages\.json/);
  assert.match(validator, /sourceDiscoveryQueue/);
  assert.match(validator, /officialSourcePages/);
  assert.match(validator, /expected trump \+ harris \+ other does not equal stateTotal/);

  const acquisitionValidator = readFileSync("scripts/validate-source-acquisition-tiers.mjs", "utf8");
  const acquisitionRegistry = readFileSync("data/source-acquisition-tiers.json", "utf8");
  assert.match(acquisitionValidator, /source-acquisition-tiers\.json/);
  assert.match(acquisitionValidator, /tier_8_scanned_handwritten/);
  assert.match(acquisitionValidator, /South Carolina official export database/);
  assert.match(acquisitionValidator, /Harris County tier 4/);
  assert.match(acquisitionValidator, /Mississippi OCR review-gated PDF/);
  assert.match(acquisitionRegistry, /electionhistory\.scvotes\.gov/);
  assert.match(acquisitionRegistry, /electionresults\.iowa\.gov/);
  assert.match(acquisitionRegistry, /data\.capitol\.texas\.gov/);
  assert.match(acquisitionRegistry, /does not replace loaded result or review data/);
  const msTextExtractor = readFileSync("scripts/extract-ms-recap-ocr-text-rows.mjs", "utf8");
  const msReconciler = readFileSync("scripts/reconcile-ms-ocr-grid-cells.mjs", "utf8");
  const msCorrectionTemplate = readFileSync("scripts/create-ms-ocr-correction-template.mjs", "utf8");
  const msOcrScript = readFileSync("scripts/ocr-ms-county-result-pdfs.mjs", "utf8");
  const msTextLayerScript = readFileSync("scripts/extract-ms-pdf-text-layer.mjs", "utf8");
  const msRecoveryPromotionScript = readFileSync("scripts/promote-ms-ocr-recovery-text.mjs", "utf8");
  const msCombinedReviewScript = readFileSync("scripts/combine-ms-ocr-review-artifacts.mjs", "utf8");
  const msReviewedCorrections = readFileSync("data/ms-2024-ocr-reviewed-corrections.csv", "utf8");
  const msVerifier = readFileSync("scripts/verify-ms-ocr-pipeline.mjs", "utf8");
  assert.match(packageScripts["etl:extract:ms:ocr-text-rows"], /extract-ms-recap-ocr-text-rows/);
  assert.match(packageScripts["etl:extract:ms:pdf-text-layer"], /extract-ms-pdf-text-layer/);
  assert.match(packageScripts["etl:promote:ms:ocr-recovery"], /promote-ms-ocr-recovery-text/);
  assert.match(packageScripts["etl:review:ms:ocr-combine"], /ms-2024-ocr-reviewed-corrections/);
  assert.match(packageScripts["etl:extract:ms:ocr-text-rows:sample"], /ms-sample-text-row-candidates/);
  assert.match(packageScripts["etl:template:ms:ocr-corrections"], /create-ms-ocr-correction-template/);
  assert.match(packageScripts["etl:template:ms:ocr-corrections:sample"], /ms-sample-ocr-correction-template/);
  assert.match(packageScripts["etl:verify:ms:ocr"], /verify-ms-ocr-pipeline/);
  assert.match(packageScripts["etl:verify:ms:ocr:sample"], /--skip-ocr/);
  assert.match(msTextExtractor, /text_row_fallback/);
  assert.match(msTextExtractor, /This is a fallback companion to grid-cell extraction/);
  assert.match(msTextExtractor, /partyPattern/);
  assert.match(msTextExtractor, /rowStartIndex/);
  assert.match(msTextLayerScript, /PDFParse/);
  assert.match(msTextLayerScript, /text-layer-manifest/);
  assert.match(msRecoveryPromotionScript, /requiredRows/);
  assert.match(msRecoveryPromotionScript, /Recovery text is missing required candidate row/);
  assert.match(msRecoveryPromotionScript, /ms-ocr-recovery-manifest/);
  assert.match(msCombinedReviewScript, /Grid rows are used only where grid reconciliation resolves a candidate/);
  assert.match(msCombinedReviewScript, /replacementKeys/);
  assert.match(msCombinedReviewScript, /--corrections/);
  assert.match(msCombinedReviewScript, /small_numeric_delta/);
  assert.match(msReviewedCorrections, /Visual review of Quitman page 3/);
  assert.match(msReviewedCorrections, /Visual review of Warren page 2/);
  assert.match(msReviewedCorrections, /Visual review of Tallahatchie page 2/);
  assert.match(msCorrectionTemplate, /correctedValue/);
  assert.match(msCorrectionTemplate, /exclude/);
  assert.match(msCorrectionTemplate, /Candidate total still needs review/);
  assert.match(msOcrScript, /--county/);
  assert.match(msOcrScript, /canonicalCountyName\(safeStem\(name\)\)/);
  assert.match(msVerifier, /listOfficialCounties/);
  assert.match(msVerifier, /canonicalCountyName/);
  assert.match(msVerifier, /Updated\$\/i/);
  assert.match(msVerifier, /--scale/);
  assert.match(msVerifier, /--rotate/);
  assert.match(msVerifier, /--psm/);
  assert.match(msVerifier, /failOnReview/);
  assert.match(msVerifier, /import_ready/);
  assert.match(msVerifier, /missing_ocr/);
  assert.match(msReconciler, /precinctExtractedTotal/);
  assert.match(msReconciler, /detected_total_column_cells/);
  assert.match(msReconciler, /--corrections/);
  assert.match(msReconciler, /manual_correction/);
  assert.match(msReconciler, /manual_addition/);
  assert.match(msReconciler, /Correction rows did not match candidate cells/);
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
  assert.match(packageScripts["turnout:configs:eac"], /create-eac-turnout-state-configs/);
  assert.match(packageScripts["turnout:extract:eac-states"], /extract-eac-state-turnout/);
  assert.match(packageScripts["turnout:normalize:eac"], /normalize-eac-turnout/);
  assert.match(packageScripts["turnout:sync-registry"], /sync-turnout-registry-from-configs/);
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

test("indicator-dependent public reads are uncached", () => {
  const api = readFileSync("src/lib/api.ts", "utf8");

  assert.match(api, /export const listIndicators = uncachedListIndicators/);
  assert.match(api, /export const listStates = uncachedListStates/);
  assert.match(api, /export const listCompletenessReport = uncachedListCompletenessReport/);
  assert.doesNotMatch(api, /\["public-data", "indicators"\]/);
});
import assert from "node:assert/strict";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("etl/state-configs/tn.json", "utf8"));
const inventory = JSON.parse(fs.readFileSync("data/tn-2024-data-coverage-inventory.json", "utf8"));
const sourcePackages = JSON.parse(fs.readFileSync("data/native-import-source-packages.json", "utf8"));
const acquisitionTiers = JSON.parse(fs.readFileSync("data/source-acquisition-tiers.json", "utf8"));
const reconciliation = JSON.parse(fs.readFileSync("data/tn-2024-result-review-reconciliation-summary.json", "utf8"));

assert.equal(config.code, "TN");
assert.equal(config.authority, "Tennessee Secretary of State");
assert.equal(config.turnoutOnly, undefined);
assert.equal(config.certifiedResults.format, "countyPresidentCsv");
assert.equal(config.reviewCharts.format, "localComparisonCsv");
assert.equal(config.reviewCharts.coverageMode, "presidentVsSenate");
assert.equal(config.expected.resultRows, 95);
assert.equal(config.expected.reviewRows, 1859);
assert.equal(config.expected.turnoutRows, 95);
assert.equal(config.expected.stateTotal, 3063942);
assert.equal(config.expected.trump, 1966865);
assert.equal(config.expected.harris, 1056265);
assert.equal(config.expected.other, 40812);
assert.equal(config.capabilities.certifiedResults, true);
assert.equal(config.capabilities.map, true);
assert.equal(config.capabilities.reviewGraphs, true);
assert.equal(config.capabilities.turnout, true);
assert.equal(config.capabilities.historicalBaseline, true);
assert.equal(config.expected.historicalBaselineRows, 190);
assert.equal(config.historicalBaselines.sourceId, "tn-historical-presidential-baseline");
assert.equal(config.historicalBaselines.expected.rowCount, 190);
assert.deepEqual(config.historicalBaselines.expected.years, [2016, 2020]);

assert.equal(inventory.currentConfigStatus.reviewRows, config.expected.reviewRows);
assert.equal(inventory.currentConfigStatus.turnoutOnly, false);
assert.equal(inventory.currentConfigStatus.historicalBaselineRows, 190);
assert.ok(inventory.remainingGaps.some((gap) => gap.id === "tn-state-native-turnout-denominator"));
assert.ok(inventory.remainingGaps.some((gap) => gap.id === "tn-historical-baseline-2012"));
assert.ok(inventory.displayCaveats.some((caveat) => caveat.includes("not findings")));

assert.equal(reconciliation.countyRows, 95);
assert.equal(reconciliation.precinctReviewRows, 1859);
assert.equal(reconciliation.presidentTotals.total, 3063942);
assert.equal(reconciliation.senateTotals.total, 3007608);
assert.equal(reconciliation.precinctKeyReconciliation.missingPresidentRows, 0);
assert.equal(reconciliation.precinctKeyReconciliation.missingSenateRows, 0);

assert.ok(sourcePackages.completedNativeStates.includes("TN"));
const tnPackage = sourcePackages.states.find((entry) => entry.state === "TN");
assert.equal(tnPackage.expected.localReviewRows, 1859);
assert.equal(tnPackage.expected.historicalBaselineRows, 190);
assert.equal(tnPackage.artifacts.historicalBaseline.level, "county");
assert.equal(tnPackage.artifacts.localReviewRows.comparisonContest, "U.S. Senate");
assert.match(tnPackage.caveats.join("\n"), /not findings/);

const tnTier = acquisitionTiers.states.find((entry) => entry.state === "TN" && entry.scope === "statewide");
assert.equal(tnTier.tier, "tier_6_official_pdf_hostile");
assert.ok(tnTier.availableFields.includes("official precinct U.S. Senate comparison rows"));
assert.ok(tnTier.availableFields.includes("official 2016 and 2020 county presidential historical baseline rows"));
assert.match(tnTier.parserStatus, /normalize-tn-sos-results/);

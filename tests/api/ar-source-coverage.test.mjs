import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync("etl/state-configs/ar.json", "utf8"));
const coverage = JSON.parse(readFileSync("data/ar-2024-data-coverage-inventory.json", "utf8"));
const sourcePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
const acquisition = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
const adminPackages = JSON.parse(readFileSync("data/admin-source-packages.json", "utf8"));
const manifest = JSON.parse(readFileSync("data/ar-2024-official-results/manifest.json", "utf8"));

test("Arkansas TotalResults coverage inventory matches native config", () => {
  const resultArtifact = coverage.loadedArtifacts.find((artifact) => artifact.id === "ar-2024-official-totalresults-federal");
  const turnoutArtifact = coverage.loadedArtifacts.find((artifact) => artifact.id === "ar-2024-eac-turnout");
  const countyFiles = readdirSync("data/ar-2024-official-results/federal-county-results").filter((file) => file.endsWith(".json"));

  assert.equal(config.certifiedResults.format, "arkansasTotalResultsFederalJson");
  assert.equal(config.certifiedResults.comparisonCoverageMode, "presidentVsUSHouse");
  assert.deepEqual(config.certifiedResults.comparisonContestIds, ["161", "227", "237", "645"]);
  assert.match(config.reviewCharts.warning, /reporting-unit IDs/);
  assert.equal(manifest.files.length, 75);
  assert.equal(countyFiles.length, 75);
  assert.equal(resultArtifact.expectedCounts.countyResultRows, config.expected.resultRows);
  assert.equal(resultArtifact.expectedCounts.reviewRows, config.expected.reviewRows);
  assert.equal(resultArtifact.expectedCounts.missingComparisonRows, 1);
  assert.equal(turnoutArtifact.expectedCounts.turnoutRows, config.expected.turnoutRows);
  assert.match(coverage.displayApiCaveats.reviewCenter, /President-versus-U\.S\.-House/);
});

test("Arkansas source package and acquisition tier are no longer stale", () => {
  const sourcePackage = sourcePackages.states.find((entry) => entry.state === "AR");
  const tier = acquisition.states.find((entry) => entry.state === "AR" && entry.scope === "statewide");
  const admin = adminPackages.stateYearStatuses.find((entry) => entry.state === "AR" && entry.electionYear === 2024);

  assert.ok(sourcePackages.completedNativeStates.includes("AR"));
  assert.equal(sourcePackage.expected.localReviewRows, config.expected.reviewRows);
  assert.equal(sourcePackage.artifacts.localReviewRows.level, "reporting_unit");
  assert.match(sourcePackage.caveats.join(" "), /not human-readable precinct names/);
  assert.equal(tier.tier, "tier_2_official_dashboard_endpoint");
  assert.equal(tier.confidence, "loaded_with_caveat");
  assert.ok(tier.availableFields.includes("official county-scoped reporting-unit U.S. House comparison rows"));
  assert.equal(admin.equipment.expectedJurisdictions, 75);
  assert.equal(admin.audit.status, "needs_data");
  assert.equal(admin.cvr.status, "needs_data");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("oklahoma source coverage inventory preserves loaded sources and caveats", () => {
  const config = JSON.parse(readFileSync("etl/state-configs/ok.json", "utf8"));
  const inventory = JSON.parse(readFileSync("data/ok-2024-data-coverage-inventory.json", "utf8"));
  const tiers = JSON.parse(readFileSync("data/source-acquisition-tiers.json", "utf8"));
  const nativePackages = JSON.parse(readFileSync("data/native-import-source-packages.json", "utf8"));
  const turnoutPackages = JSON.parse(readFileSync("data/turnout-source-packages.json", "utf8"));
  const vrSummary = JSON.parse(readFileSync("data/ok-2024-vrstats-denominator-summary.json", "utf8"));

  const tier = tiers.states.find((row) => row.state === "OK" && row.scope === "statewide");
  const sourceIds = new Set(config.sources.map((source) => source.id));
  const loadedIds = new Set(inventory.loadedArtifacts.map((artifact) => artifact.id));
  const nativePackage = nativePackages.states.find((row) => row.state === "OK");
  const turnoutPackage = turnoutPackages.stateYearStatuses.find((row) => row.state === "OK");

  assert.equal(tier.tier, "tier_1_official_export_database");
  assert.match(tier.parserStatus, /nativeOklahomaOfficialCsvZip/);
  assert.ok(sourceIds.has("ok-2024-race-level-results"));
  assert.ok(sourceIds.has("ok-2024-county-level-results"));
  assert.ok(sourceIds.has("ok-2024-precinct-level-results"));
  assert.ok(sourceIds.has("ok-2024-eac-turnout"));
  assert.ok(loadedIds.has("ok-2024-precinct-level-results"));
  assert.equal(inventory.officialSourceFindings.historicalBaselines.status, "official_source_pages_identified_not_loaded");
  assert.equal(inventory.officialSourceFindings.stateNativeTurnout.status, "denominator_lead_collected_eac_fallback_active");
  assert.ok(loadedIds.has("ok-2024-vrstats-registration-denominator-lead"));
  assert.match(inventory.officialSourceFindings.stateNativeTurnout.parserNormalizationPath, /collect-ok-vrstats-registration/);
  assert.equal(inventory.officialSourceFindings.postElectionAudit.status, "official_archive_path_identified_not_normalized");
  assert.match(inventory.advisoryUseCaveat, /not proof of fraud or misconduct/);
  assert.equal(nativePackage.expected.localReviewRows, 1977);
  assert.match(nativePackage.artifacts.turnoutDenominatorLead.parserHint, /collect-ok-vrstats-registration/);
  assert.equal(turnoutPackage.coverage.okVrRegisteredVoters, 2442211);
  assert.equal(turnoutPackage.coverage.okVrCountyRegisteredVoterMismatchCount, 0);
  assert.equal(vrSummary.voterRegistrationLead.rowCount, 77);
  assert.equal(vrSummary.voterRegistrationLead.registeredVoters, 2442211);
  assert.equal(vrSummary.denominatorComparison.countyRegisteredVoterMismatchCount, 0);
  assert.equal(vrSummary.replacementDecision.activeTurnoutReplacement, false);
  assert.match(nativePackage.caveats.join(" "), /vote-share-only/);
});

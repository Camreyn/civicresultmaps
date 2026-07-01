import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const report = JSON.parse(readFileSync("data/wi-2024-remaining-data-status.json", "utf8"));

test("Wisconsin remaining-data report records unavailable statewide sources without changing flag inputs", () => {
  assert.equal(report.state, "WI");
  assert.equal(report.electionYear, 2024);
  assert.equal(report.summary.countyFlagsRemainAuthoritative, true);
  assert.equal(report.summary.noRemainingItemIsCurrentlyUsedAsAFlagInput, true);
  assert.deepEqual(report.summary.hardMissingFamiliesStillRequireRecordsRequests, [
    "wardRegisteredVoterDenominators",
    "rowLevelBallotMode",
    "perAuditUnitOutcomes",
    "wardGeometryCrosswalk",
  ]);
  assert.equal(report.collectionPlan.hardMissingSourceEvidenceSummary.wecWardWorkbookProvidesHardMissingFields, false);
  assert.equal(report.collectionPlan.hardMissingSourceEvidenceSummary.geometryLayerProvidesHardMissingFields, false);

  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.status, "statewide_not_found_public");
  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.primaryFallback.status, "loaded_eac_fallback");
  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.primaryFallback.rowCount, 1851);
  assert.deepEqual(
    report.remainingItems.wardRegisteredVoterDenominators.partialWardSources.map((source) => source.county).sort(),
    ["Jefferson", "Milwaukee", "Oneida"],
  );

  assert.equal(report.remainingItems.municipalWardGeometry.status, "candidate_collected_jurisdiction_reconciled_ward_version_deltas");
  assert.equal(report.remainingItems.municipalWardGeometry.currentGeometry, "county_geometry_production_with_jurisdiction_reconciled_ward_candidate");
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.featureCount, 7086);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.countyCount, 72);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.status, "candidate_collected_jurisdiction_reconciled_ward_version_deltas");
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.reportPath, "data/wi-2024-ward-geometry-join-report.json");
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.matchedReviewRows, 3478);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.matchedPct, 99.29);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.affectedJurisdictions, 38);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.affectedJurisdictionsReconciled, 38);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.unresolvedJurisdictions, 0);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.rowLevelWardRenderingSafe, false);
  assert.equal(report.remainingItems.municipalWardGeometry.candidate.joinValidation.jurisdictionLevelRenderingSafe, true);
  assert.equal(report.remainingItems.wardRegisteredVoterDenominators.publicSourceEvidence.requestRequired, true);
  assert.equal(report.remainingItems.perAuditUnitOutcomes.publicSourceEvidence.requestRequired, true);
  assert.equal(report.remainingItems.municipalWardGeometry.publicSourceEvidence.crosswalk.requestRequired, true);
  assert.equal(report.remainingItems.rowLevelBallotMode.status, "not_available_from_wec_ward_workbook");
  assert.equal(report.remainingItems.rowLevelBallotMode.publicSourceEvidence.requestRequired, true);
  assert.equal(report.remainingItems.rowLevelBallotMode.cvrAvailabilityInventory.rowCount, 72);
  assert.equal(report.remainingItems.rowLevelBallotMode.cvrAvailabilityInventory.badCountyCountyNames, 0);
});

test("Wisconsin remaining-data report carries aggregate audit context but not per-unit outcomes", () => {
  const audit = report.remainingItems.perAuditUnitOutcomes;
  assert.equal(audit.status, "not_published_in_final_report");
  assert.equal(audit.selectedReportingUnits, 373);
  assert.equal(audit.countiesCovered, 72);
  assert.equal(audit.aggregateAuditResults.auditedBallots, 327230);
  assert.equal(audit.aggregateAuditResults.locallyReportedPotentialEquipmentIssueErrors, 5);
  assert.equal(audit.aggregateAuditResults.finalEquipmentErrorRate, "0%");
  assert.equal(audit.flagInputStatus, "context_only_not_clearance_or_confirmation");
});

test("Wisconsin CVR availability scaffold uses clean county names", () => {
  const csv = readFileSync("data/wi-2024-cvr-availability.csv", "utf8");
  assert.match(csv, /Adams County,not_inventoried/);
  assert.doesNotMatch(csv, /County County/);
});

test("Wisconsin admin context scopes audit, CVR, incidents, and equipment evidence", () => {
  const adminContext = JSON.parse(readFileSync("data/wi-2024-admin-context-sources.json", "utf8"));
  const cvrCsv = readFileSync(adminContext.cvr.localArtifact, "utf8").trim().split(/\r?\n/);

  assert.equal(adminContext.generatedAt, "2026-06-30");
  assert.equal(adminContext.equipment.status, "loaded_context");
  assert.equal(existsSync(adminContext.equipment.localArtifact), true);
  assert.equal(existsSync(adminContext.equipment.normalizedArtifact), true);
  assert.equal(existsSync(adminContext.equipment.officialAuditArtifact), true);
  assert.match(adminContext.equipment.scopeNote, /not vote or turnout data/);
  assert.match(adminContext.equipment.officialAuditSourceUrl, /post-election-voting-equipment-audit/);
  assert.equal(adminContext.audit.status, "partial");
  assert.equal(existsSync(adminContext.audit.localArtifact), true);
  assert.equal(existsSync(adminContext.audit.normalizedArtifact), true);
  assert.equal(existsSync(adminContext.audit.summaryArtifact), true);
  assert.match(adminContext.audit.scopeNote, /does not include a per-reporting-unit discrepancy outcome table/);
  assert.match(adminContext.audit.recordsRequestNeed, /Submitted local audit materials/);
  assert.equal(adminContext.cvr.status, "partial");
  assert.equal(existsSync(adminContext.cvr.localArtifact), true);
  assert.equal(cvrCsv.length - 1, 72);
  assert.equal(cvrCsv.every((line, index) => index === 0 || line.includes(",not_inventoried,")), true);
  assert.match(adminContext.cvr.scopeNote, /not a loaded CVR dataset/);
  assert.match(adminContext.cvr.recordsRequestNeed, /County-by-county CVR availability/);
  assert.equal(adminContext.incidents.status, "candidate");
  assert.equal(existsSync(adminContext.incidents.localArtifact), true);
  assert.match(adminContext.incidents.scopeNote, /not a normalized incident/);
  assert.match(adminContext.incidents.recordsRequestNeed, /recount filings\/outcomes/);
});

test("Wisconsin turnout source registry keeps EAC warning rows visible", () => {
  const turnoutPackages = JSON.parse(readFileSync("data/turnout-source-packages.json", "utf8"));
  const wisconsin = turnoutPackages.stateYearStatuses.find((entry) => entry.state === "WI" && entry.year === 2024);
  const turnoutCsv = readFileSync(wisconsin.localFile, "utf8").trim().split(/\r?\n/);
  const header = turnoutCsv[0].split(",");
  const warningIndex = header.indexOf("warning_required");
  const warningRows = turnoutCsv.slice(1).filter((line) => line.split(",")[warningIndex] === "true").length;

  assert.equal(wisconsin.coverage.warningRows, warningRows);
  assert.equal(wisconsin.coverage.warningRows, 2);
});
test("Wisconsin ETL config lists remaining admin context as non-flag provenance", () => {
  const config = JSON.parse(readFileSync("etl/state-configs/wi.json", "utf8"));
  const sources = new Map(config.sources.map((source) => [source.id, source]));

  for (const sourceId of [
    "wi-2024-audit-selections",
    "wi-2024-audit-summary",
    "wi-2024-cvr-availability",
    "wi-2024-incident-context",
    "wi-2024-equipment-context",
    "wi-2024-ward-geometry-candidate",
    "wi-2024-hard-missing-source-evidence",
  ]) {
    assert.equal(sources.has(sourceId), true, sourceId + " should be listed in Wisconsin config sources");
  }

  assert.equal(config.expected.sources, config.sources.length);
  assert.match(sources.get("wi-2024-cvr-availability").confidence, /Scaffold only/);
  assert.match(sources.get("wi-2024-incident-context").confidence, /Candidate source inventory only/);
  assert.match(sources.get("wi-2024-audit-summary").confidence, /not a per-reporting-unit audit outcome table/);
  assert.match(sources.get("wi-2024-ward-geometry-candidate").confidence, /production ward rendering remains disabled/);
  assert.match(sources.get("wi-2024-hard-missing-source-evidence").confidence, /Records requests remain required/);
});

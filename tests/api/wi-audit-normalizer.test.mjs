import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

test("Wisconsin audit selections are normalized from WEC final report", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["etl:normalize:wi:audit"], "node scripts/normalize-wi-audit-report.mjs");

  const csv = readFileSync("data/wi-2024-audit-selections.csv", "utf8").trimEnd().split(/\r?\n/);
  const header = parseCsvLine(csv[0]);
  const rows = csv.slice(1).map((line) => Object.fromEntries(parseCsvLine(line).map((cell, index) => [header[index], cell])));

  assert.equal(rows.length, 373);
  assert.equal(new Set(rows.map((row) => row.county)).size, 72);
  assert.equal(rows.filter((row) => row.ballotsAudited === "0").length, 12);
  assert.equal(rows.reduce((total, row) => total + Number(row.ballotsAudited), 0), 327230);

  const summary = JSON.parse(readFileSync("data/wi-2024-audit-summary.json", "utf8"));
  assert.equal(summary.selectedReportingUnits, 373);
  assert.equal(summary.countiesCovered, 72);
  assert.equal(summary.ballotsAudited, 327230);
  assert.equal(summary.aggregateAuditResults.auditedBallots, 327230);
  assert.equal(summary.aggregateAuditResults.ballotPositions, 5604670);
  assert.equal(summary.aggregateAuditResults.locallyReportedPotentialEquipmentIssueErrors, 5);
  assert.equal(summary.aggregateAuditResults.municipalitiesWithReportedPotentialIssues, 3);
  assert.equal(summary.aggregateAuditResults.finalEquipmentErrorRate, "0%");
  assert.equal(summary.aggregateAuditResults.perUnitOutcomeStatus, "not_published_in_final_report");
  assert.match(summary.caveat, /per-reporting-unit discrepancy outcome table/);
});

test("Wisconsin audit correction preserves printed percentages and calculates percentages from counts", () => {
  const report = JSON.parse(readFileSync("data/wi-2024-audit-summary.json", "utf8"));
  const audit = report.aggregateAuditResults;
  const correction = audit.percentageCorrection;
  assert.equal(audit.errorRateWithFiveReportedErrors, "0.0000009%");
  assert.equal(correction.fiveErrors.reportedPercent, audit.errorRateWithFiveReportedErrors);
  assert.equal(correction.fiveErrors.recalculatedPercent, (5 / 5604670) * 100);
  assert.equal(correction.fiveErrors.recalculatedDisplay, "0.0000892%");
  assert.equal(correction.fiveErrors.sourcePage, 10);
  assert.equal(correction.benchmark.recalculatedPercent, (1 / 500000) * 100);
  assert.equal(correction.benchmark.recalculatedDisplay, "0.0002%");
  assert.deepEqual(correction.benchmark.reportedPercentByPage, [
    { page: 9, percent: "0.00002%" }, { page: 10, percent: "0.000002%" },
  ]);
  assert.ok(correction.fiveErrors.recalculatedPercent < correction.benchmark.recalculatedPercent);
  assert.match(correction.authority, /not a WEC-issued correction/);
  assert.match(correction.note, /printed percentages are incorrect/);
  assert.match(correction.note, /not a newly discovered candidate-vote error/);
  assert.equal(audit.finalEquipmentErrorRate, "0%");
  assert.equal(audit.humanErrorCount, 593);
  assert.equal(audit.humanErrorRateAsPrinted, `${((593 / 5604670) * 100).toFixed(3)}%`);
  assert.match(audit.humanErrorCaveat, /audit-process mistakes/);
  assert.match(audit.humanErrorCaveat, /not a count of incorrectly tabulated presidential votes/);
  assert.deepEqual(audit.auditedContests, ["President and Vice President", "U.S. House", "Wisconsin Assembly", "District Attorney"]);
  assert.match(audit.comparisonContestCaveat, /U.S. Senate was not/);
  assert.equal(createHash("sha256").update(readFileSync(report.localPdf)).digest("hex"), report.sourcePdfSha256);
  const status = JSON.parse(readFileSync("data/wi-2024-remaining-data-status.json", "utf8"));
  assert.deepEqual(status.remainingItems.perAuditUnitOutcomes.aggregateAuditResults, audit);
});

test("Wisconsin audit normalization is reproducible without altering retained source files", () => {
  const files = [
    "data/wi-2024-audit/2024-post-election-voting-equipment-audit-final-report.pdf",
    "data/wi-2024-audit/2024-post-election-voting-equipment-audit-final-report.txt",
    "data/wi-2024-audit-selections.csv",
    "data/wi-2024-audit-summary.json",
  ];
  const before = files.map((file) => readFileSync(file));
  const result = spawnSync(process.execPath, ["scripts/normalize-wi-audit-report.mjs", "--check"], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  files.forEach((file, index) => assert.deepEqual(readFileSync(file), before[index], file));
});

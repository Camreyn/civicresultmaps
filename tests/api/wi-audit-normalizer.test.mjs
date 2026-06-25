import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.match(summary.caveat, /per-reporting-unit discrepancy outcome table/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const header = headerLine.split(",");
  return lines.map((line) => {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (character === "," && !quoted) {
        values.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    values.push(current);
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
  });
}

test("Nebraska canvass voting-statistics reconciliation documents EAC fallback delta", () => {
  const rows = parseCsv(readFileSync("data/ne-2024-canvass-voting-statistics-reconciliation.csv", "utf8"));
  const summary = JSON.parse(
    readFileSync("data/ne-2024-canvass-voting-statistics-reconciliation-summary.json", "utf8"),
  );

  assert.equal(rows.length, 93);
  assert.equal(summary.rowCount, 93);
  assert.equal(summary.canvassTotals.registeredVoters, 1263487);
  assert.equal(summary.canvassTotals.totalVoting, 965236);
  assert.equal(summary.eacTotals.registeredVoters, 1263487);
  assert.equal(summary.eacTotals.ballotsCast, 965145);
  assert.equal(summary.deltas.ballotsCastCanvassMinusEac, 91);
  assert.equal(summary.deltas.registeredVotersCanvassMinusEac, 0);
  assert.equal(summary.deltas.rowsWithBallotDelta, 34);
  assert.equal(summary.activeTurnoutDecision.includes("Keep EAC fallback turnout active"), true);

  const sarpy = rows.find((row) => row.jurisdiction_name === "Sarpy");
  assert.equal(sarpy.canvass_total_voting, "102438");
  assert.equal(sarpy.eac_ballots_cast, "102382");
  assert.equal(sarpy.ballots_cast_delta_canvass_minus_eac, "56");

  const redWillow = rows.find((row) => row.jurisdiction_name === "Red Willow");
  assert.equal(redWillow.canvass_total_voting, "5417");
  assert.equal(redWillow.eac_ballots_cast, "5429");
  assert.equal(redWillow.ballots_cast_delta_canvass_minus_eac, "-12");
});
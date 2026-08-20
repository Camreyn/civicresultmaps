import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const leadsPath = "data/ga-historical-registration-turnout-leads.csv";
const reviewPath = "data/ga-historical-archive-source-review.json";
const expectedTotals = new Map([
  [2012, { registeredVoters: 5428349, ballotsCast: 3919156, presidentVotes: 3897839 }],
  [2016, { registeredVoters: 5443046, ballotsCast: 4165405, presidentVotes: 4092373 }],
  [2020, { registeredVoters: 6995285, ballotsCast: 5026684, presidentVotes: 4998482 }],
]);

test("Georgia historical archive registration leads retain 159 county rows per year", async () => {
  const [csv, sourceReview] = await Promise.all([
    readFile(leadsPath, "utf8"),
    readFile(reviewPath, "utf8").then(JSON.parse),
  ]);
  const [header, ...rows] = csv.trim().split(/\r?\n/).map((line) => line.split(","));
  assert.deepEqual(header, ["state", "election_year", "county", "registered_voters", "ballots_cast", "president_votes", "source_url", "source_member"]);
  assert.equal(rows.length, 477);

  for (const year of expectedTotals.keys()) {
    const yearRows = rows.filter((row) => Number(row[1]) === year);
    assert.equal(yearRows.length, 159);
    assert.ok(yearRows.every((row) => row[0] === "GA" && row[2].endsWith(" County")));
    assert.ok(yearRows.every((row) => row.slice(3, 6).every((value) => /^\d+$/.test(value))));
  }

  assert.equal(sourceReview.rows, 477);
  assert.deepEqual(
    sourceReview.archives.map(({ year, countySummaryArchives, totals }) => [year, countySummaryArchives, {
      registeredVoters: totals.registeredVoters,
      ballotsCast: totals.ballotsCast,
      presidentVotes: totals.total,
    }]),
    [...expectedTotals].map(([year, totals]) => [year, 159, totals]),
  );
});

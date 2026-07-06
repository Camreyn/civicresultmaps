import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const REVIEW_PATH = "data/az-2024-source-confirmation-review.json";
const SUBMITTED_SOURCE_URL =
  "https://azsos.gov/elections/election-information/2024-election-info#collps_election_info_04";
const SIGNED_CANVASS_URL =
  "https://apps.azsos.gov/election/2024/ge/canvass/20241105_GeneralCanvass_Signed.pdf";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("Arizona submitted SOS source is represented by the signed canvass pipeline", async () => {
  await import("../../scripts/report-az-source-confirmation-review.mjs");

  const review = readJson(REVIEW_PATH);
  const config = readJson("etl/state-configs/az.json");
  const coverageInventory = readJson("data/az-2024-data-coverage-inventory.json");
  const adminInventory = readJson("data/az-2024-admin-source-inventory.json");

  assert.equal(review.state, "AZ");
  assert.equal(review.electionYear, 2024);
  assert.equal(review.submittedSourceUrl, SUBMITTED_SOURCE_URL);
  assert.equal(review.normalizedSubmittedSourceUrl, "https://azsos.gov/elections/election-information/2024-election-info");
  assert.equal(review.decision, "already_represented_by_signed_canvass_pipeline");
  assert.equal(review.productionPromotionPerformed, false);
  assert.equal(review.noNewResultSourceNeeded, true);
  assert.equal(review.submittedSourcePageObservation.signedCanvassUrl, SIGNED_CANVASS_URL);

  assert.equal(config.certifiedResults.sourceId, "az-2024-general-canvass-signed");
  assert.equal(config.reviewCharts.sourceId, "az-2024-general-canvass-senate");
  assert.equal(config.turnout.sourceId, "az-2024-general-canvass-signed");
  assert.equal(review.representedBy.certifiedResults.sourceUrl, SIGNED_CANVASS_URL);
  assert.equal(review.representedBy.reviewRows.sourceUrl, SIGNED_CANVASS_URL);
  assert.equal(review.representedBy.turnout.sourceUrl, SIGNED_CANVASS_URL);
  assert.equal(review.representedBy.certifiedResults.expectedRows, 15);
  assert.equal(review.representedBy.reviewRows.expectedRows, 15);
  assert.equal(review.representedBy.turnout.expectedRows, 15);
  assert.equal(review.representedBy.turnout.expectedBallotsCast, 3428011);
  assert.equal(review.representedBy.turnout.expectedRegisteredVoters, 4367593);

  assert.ok(
    coverageInventory.officialSourceSearchPath.some(
      (entry) =>
        entry.sourceUrl === "https://azsos.gov/elections/election-information/2024-election-info" &&
        /links the signed statewide canvass/i.test(entry.result),
    ),
  );
  assert.equal(
    adminInventory.resultCoverage.sourceUrl,
    "https://azsos.gov/elections/election-information/2024-election-info",
  );
  assert.ok(
    adminInventory.resultCoverage.loadedArtifacts.includes(
      "data/az-2024-general-canvass-president.csv",
    ),
  );
  assert.ok(
    review.caveats.some((caveat) =>
      /source confirmation only.*does not promote production data/i.test(caveat),
    ),
  );
  assert.ok(
    review.remainingGaps.some(
      (gap) => gap.artifact === "precinct_or_local_reporting_unit_results",
    ),
  );
});

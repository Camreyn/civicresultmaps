import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tracker = JSON.parse(readFileSync("data/wi-2024-remaining-data-collection-tracker.json", "utf8"));
const inventory = JSON.parse(readFileSync("data/wi-2024-public-source-inventory.json", "utf8"));
const requestSummary = JSON.parse(readFileSync("data/wi-2024-records-request-packet-summary.json", "utf8"));
const status = JSON.parse(readFileSync("data/wi-2024-remaining-data-status.json", "utf8"));

const requiredFamilies = [
  "wardRegisteredVoterDenominators",
  "perAuditUnitOutcomes",
  "municipalWardGeometry",
  "rowLevelBallotMode",
];

test("Wisconsin remaining-data collection tracker covers WEC and every county", () => {
  assert.equal(tracker.state, "WI");
  assert.equal(tracker.currentProductionFlagsRemainAuthoritative, true);
  assert.deepEqual(tracker.dataFamilies.map((family) => family.id), requiredFamilies);

  const targets = tracker.targets;
  assert.equal(targets.length, 73);
  assert.equal(targets.filter((target) => target.targetType === "state_agency").length, 1);
  assert.equal(targets.filter((target) => target.targetType === "county_clerk").length, 72);
  assert.equal(targets.some((target) => target.id === "WI-WEC"), true);
  assert.equal(targets.some((target) => target.county === "Milwaukee County"), true);
  assert.equal(targets.some((target) => target.county === "Dane County"), true);

  for (const target of targets) {
    for (const family of requiredFamilies) {
      assert.ok(target.families[family], `${target.id} should track ${family}`);
      assert.equal(target.families[family].parserStatus, "not_started");
    }
  }
});

test("Wisconsin public source inventory keeps loaded context separate from missing data", () => {
  assert.equal(inventory.state, "WI");
  assert.equal(inventory.probeEnabled, false);
  assert.equal(inventory.summary.sourceCandidateCount, 4);
  assert.equal(inventory.summary.requestPathCount, 1);
  assert.equal(inventory.summary.loadedContextCount, 2);

  const sourceIds = inventory.sources.map((source) => source.id).sort();
  assert.deepEqual(sourceIds, [
    "eac-2024-eavs-v2",
    "wec-2024-post-election-audit-report",
    "wec-election-results-2024-general",
    "wec-records-request",
  ]);
  assert.match(inventory.sources.find((source) => source.id === "wec-records-request").recommendation, /official request path/);
});

test("Wisconsin records request packet summary covers WEC, counties, and municipal audit fallback", () => {
  assert.equal(requestSummary.state, "WI");
  assert.equal(requestSummary.packetCount, 74);
  assert.deepEqual(requestSummary.byTargetType, {
    state_agency: 1,
    county_clerk: 72,
    municipal_clerk: 1,
  });
  assert.deepEqual(requestSummary.requiredFamilies, requiredFamilies);
  assert.equal(requestSummary.packets.some((packet) => packet.targetId === "WI-WEC"), true);
  assert.equal(requestSummary.packets.some((packet) => packet.targetId === "WI-MUNICIPAL-AUDIT-TEMPLATE"), true);
});

test("Wisconsin remaining-data status references collection artifacts", () => {
  assert.equal(status.summary.collectionTrackerTargets, 73);
  assert.equal(status.summary.collectionTrackerFamilies, 4);
  assert.equal(status.summary.publicSourceCandidateCount, 4);
  assert.equal(status.summary.requestPacketCount, 74);
  assert.equal(status.collectionPlan.countyTargetCount, 72);
  assert.equal(status.collectionPlan.stateAgencyTargetCount, 1);
  assert.deepEqual(status.collectionPlan.dataFamilies.map((family) => family.id), requiredFamilies);
});

test("Wisconsin remaining-data package exposes npm pipeline entrypoints", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["etl:collect:wi:remaining"], "node scripts/collect-wi-public-source-inventory.mjs");
  assert.equal(packageJson.scripts["etl:requests:wi:remaining"], "node scripts/create-wi-records-request-packets.mjs");
  assert.match(packageJson.scripts["test:api"], /wi-remaining-collection\.test\.mjs/);
});

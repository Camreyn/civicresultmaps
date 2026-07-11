import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { states } from "../../scripts/state-metadata.mjs";

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function csvRows(path) {
  const [header, ...lines] = readFileSync(path, "utf8").trim().split(/\r?\n/u);
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])));
}

test("D.C. certified presidential sources normalize to county-equivalent 11001", () => {
  const config = json("etl/state-configs/dc.json");
  const summary = json("data/dc-presidential-normalization-summary.json");
  const currentRows = csvRows("data/dc-2024-general-president-county-equivalent.csv");
  const historicalRows = csvRows("data/dc-historical-presidential-baseline.csv");
  const geometry = json("data/dc-counties.geojson");
  const registry = json("data/canonical-jurisdictions.json");
  const dcRegistry = registry.jurisdictions.find((row) => row.jurisdictionTag === "county:11001");

  assert.deepEqual(states.find((state) => state.code === "DC"), {
    code: "DC",
    name: "District of Columbia",
    fips: "11",
  });
  assert.equal(config.expected.sources, 7);
  assert.equal(config.expected.resultRows, 1);
  assert.equal(config.expected.historicalBaselineRows, 2);
  assert.equal(config.expected.stateTotal, 325869);
  assert.equal(config.capabilities.map, true);
  assert.equal(config.capabilities.reviewGraphs, false);
  assert.equal(config.capabilities.turnout, false);

  assert.deepEqual(currentRows, [{
    state: "DC",
    election_year: "2024",
    jurisdiction_name: "District of Columbia",
    jurisdiction_code: "11001",
    level: "county",
    trump: "21076",
    harris: "294185",
    other: "10608",
  }]);
  assert.deepEqual(historicalRows.map((row) => row.election_year), ["2016", "2020"]);
  assert.ok(historicalRows.every((row) => row.jurisdiction_tag === "county:11001"));
  assert.deepEqual(historicalRows.map((row) => row.total_votes), ["311268", "344356"]);

  assert.equal(summary.jurisdiction.geoid, "11001");
  assert.equal(summary.jurisdiction.tag, "county:11001");
  assert.deepEqual(summary.sources.map((source) => source.reportingUnits), [143, 144, 144]);
  assert.deepEqual(summary.sources.map((source) => source.candidateVotes.total), [311268, 344356, 325869]);
  assert.deepEqual(summary.sources.map((source) => source.excludedNonCandidateMarks), [
    { overvotes: 243, undervotes: 1064 },
    { overvotes: 0, undervotes: 0 },
    { overvotes: 460, undervotes: 2075 },
  ]);

  for (const source of summary.sources) assert.equal(sha256(source.localFile), source.sha256);
  assert.equal(sha256(summary.outputs.current.localFile), summary.outputs.current.sha256);
  assert.equal(sha256(summary.outputs.historical.localFile), summary.outputs.historical.sha256);
  assert.equal(sha256("data/dc-counties.geojson"), "b09ecc405e21e94b57c2386572ac0540f1431c2704e6f59de2e360a6e6f6ea9a");
  assert.equal(geometry.features.length, 1);
  assert.equal(geometry.features[0].properties.GEOID, "11001");
  assert.equal(dcRegistry?.displayName, "District of Columbia");
  assert.equal(dcRegistry?.level, "county_equivalent");
  assert.equal(dcRegistry?.source, "dc-counties.geojson");
  assert.ok(dcRegistry?.aliases.includes("Washington, D.C."));
});

test("Alaska county-equivalent registry geometry does not force election allocations", () => {
  const config = json("etl/state-configs/ak.json");
  const inventory = json("data/ak-2024-data-coverage-inventory.json");
  const geometry = json("data/ak-counties.geojson");
  const registry = json("data/canonical-jurisdictions.json");
  const alaskaRegistry = registry.jurisdictions.filter((row) => row.state === "AK");
  const currentRows = csvRows("data/ak-2024-general-president-statewide.csv");

  assert.equal(sha256("data/ak-counties.geojson"), "25633feb37dd8c8cce7483860c8af35fd88f9c08b252f84a4089b3681438bc10");
  assert.equal(geometry.features.length, 30);
  assert.equal(alaskaRegistry.length, 30);
  assert.ok(alaskaRegistry.every((row) => row.level === "county_equivalent"));
  assert.equal(alaskaRegistry.find((row) => row.geoid === "02020")?.displayName, "Anchorage Municipality");
  assert.equal(alaskaRegistry.find((row) => row.geoid === "02230")?.displayName, "Skagway Municipality");
  assert.equal(config.capabilities.map, false);
  assert.equal(config.expected.canonicalCountyEquivalentFeatures, 30);
  assert.ok(config.sources.some((source) => source.id === "ak-county-equivalent-boundary"));
  assert.deepEqual(currentRows.map((row) => ({ name: row.jurisdiction_name, level: row.level })), [
    { name: "Alaska", level: "state" },
  ]);
  assert.match(inventory.completionDecision.reason, /remains statewide and untagged/i);
  assert.ok(inventory.displayCaveats.some((caveat) => /registry geometry only/i.test(caveat)));
});

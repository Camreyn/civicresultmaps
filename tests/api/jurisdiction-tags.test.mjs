import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("canonical jurisdiction registry resolves known FIPS aliases", () => {
  const registry = JSON.parse(readFileSync("data/canonical-jurisdictions.json", "utf8"));
  const byTag = new Map(registry.jurisdictions.map((row) => [row.jurisdictionTag, row]));

  assert.equal(byTag.has("county:27137"), true);
  assert.equal(byTag.get("county:27137")?.aliases.includes("Saint Louis County"), true);
  assert.equal(byTag.get("county:28065")?.aliases.includes("Jeff Davis County"), true);
  assert.equal(byTag.get("county:48283")?.aliases.includes("Lasalle County"), true);
  assert.equal(byTag.get("county:51510")?.displayName, "Alexandria city");
  assert.match(byTag.get("reporting:MO:KANSAS-CITY")?.caveat ?? "", /separate election jurisdiction/);
});

test("jurisdiction tag schema and API surface are wired", () => {
  const schema = readFileSync("src/db/schema.ts", "utf8");
  const types = readFileSync("src/lib/types.ts", "utf8");
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const nativeImport = readFileSync("src/db/native-import.ts", "utf8");
  const legacyImport = readFileSync("src/db/legacy-import.ts", "utf8");
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

  assert.match(schema, /jurisdictionTag: text\("jurisdiction_tag"\)/);
  assert.match(types, /jurisdictionTag\?: string \| null/);
  assert.match(dataAccess, /jurisdiction_tag as "jurisdictionTag"/);
  assert.match(dataAccess, /jurisdictionTagForRow/);
  assert.match(nativeImport, /jurisdiction_tag/);
  assert.match(legacyImport, /add column if not exists jurisdiction_tag/);
  assert.match(packageScripts["jurisdictions:build"], /build-canonical-jurisdictions/);
  assert.match(packageScripts["jurisdictions:validate"], /validate-jurisdiction-tags/);
  assert.match(packageScripts["jurisdictions:flips"], /report-national-county-flips/);
});
test("jurisdiction flip wave coordination stays explicit", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const tracker = JSON.parse(readFileSync("data/jurisdiction-tag-coverage-waves.json", "utf8"));

  assert.match(agents, /Jurisdiction Tag And Historical Flip Waves/);
  assert.match(agents, /npm run jurisdictions:flips/);
  assert.match(agents, /Workers must not run production promotion/);
  assert.equal(tracker.currentCoverage.missingHistoricalRows, 699);
  assert.equal(tracker.currentCoverage.blueToRed, 66);
  assert.equal(tracker.currentCoverage.redToBlue, 0);

  const assignedStates = tracker.waves.flatMap((wave) => wave.states.map((state) => state.state));
  assert.equal(tracker.defaults.branchPattern, "state/<state>-data-coverage");
  assert.match(tracker.defaults.waveAdvanceGate, /Do not start the next wave/);
  assert.deepEqual(tracker.defaults.workerStatusValues, ["unassigned", "assigned", "ready_for_pr", "draft_pr_opened", "blocked", "deferred", "merged"]);
  assert.deepEqual(assignedStates.slice(0, 5), ["IL", "TN", "OK", "LA", "CO"]);
  assert.equal(new Set(assignedStates).size, assignedStates.length);
  assert.equal(tracker.waves.every((wave) => wave.states.length <= 5), true);
  assert.equal(tracker.waves.every((wave) => tracker.defaults.waveStatusValues.includes(wave.status)), true);
  assert.equal(tracker.waves.every((wave) => wave.states.every((state) => state.branch === `state/${state.state.toLowerCase()}-data-coverage`)), true);
  assert.equal(
    tracker.waves.reduce((sum, wave) => sum + wave.states.reduce((waveSum, state) => waveSum + state.missingHistoricalRows, 0), 0),
    tracker.currentCoverage.missingHistoricalRows,
  );
});




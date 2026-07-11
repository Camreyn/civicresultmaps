import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStagingJurisdictionReportSource } from "../../scripts/lib/staging-jurisdiction-report-source.mjs";
import { readFinalizedRootEntry } from "../../scripts/lib/ri-finalized-zip.mjs";
import { jurisdictionTagForRow } from "../../src/lib/jurisdiction-tags.ts";
import JSZip from "jszip";
import test from "node:test";

test("canonical jurisdiction registry resolves known FIPS aliases", () => {
  const registry = JSON.parse(readFileSync("data/canonical-jurisdictions.json", "utf8"));
  const byTag = new Map(registry.jurisdictions.map((row) => [row.jurisdictionTag, row]));

  assert.equal(byTag.has("county:27137"), true);
  assert.equal(byTag.get("county:27137")?.aliases.includes("Saint Louis County"), true);
  assert.equal(byTag.get("county:28065")?.aliases.includes("Jeff Davis County"), true);
  assert.equal(byTag.get("county:48283")?.aliases.includes("Lasalle County"), true);
  assert.equal(byTag.get("county:51510")?.displayName, "Alexandria city");
  assert.equal(byTag.get("county:09190")?.displayName, "Western Connecticut Planning Region");
  assert.match(byTag.get("reporting:MO:KANSAS-CITY")?.caveat ?? "", /separate election jurisdiction/);
});

test("jurisdiction tag resolver handles known city/county and spelling ambiguities", () => {
  const cases = [
    [{ state: "MD", jurisdictionName: "Baltimore City", jurisdictionCode: "MD-BALTIMORE-CITY", level: "county" }, "county:24510"],
    [{ state: "MD", jurisdictionName: "Baltimore County", jurisdictionCode: "MD-BALTIMORE", level: "county" }, "county:24005"],
    [{ state: "MO", jurisdictionName: "St. Louis City", jurisdictionCode: "MO-ST-LOUIS-CITY", level: "county" }, "county:29510"],
    [{ state: "MO", jurisdictionName: "St. Louis County", jurisdictionCode: "MO-ST-LOUIS", level: "county" }, "county:29189"],
    [{ state: "MO", jurisdictionName: "De Kalb County", jurisdictionCode: "MO-DE-KALB", level: "county" }, "county:29063"],
    [{ state: "OK", jurisdictionName: "Leflore County", jurisdictionCode: "OK-LEFLORE", level: "county" }, "county:40079"],
    [{ state: "VA", jurisdictionName: "Fairfax City", jurisdictionCode: "VA-FAIRFAX-CITY", level: "county" }, "county:51600"],
    [{ state: "VA", jurisdictionName: "Fairfax County", jurisdictionCode: "VA-FAIRFAX", level: "county" }, "county:51059"],
    [{ state: "IL", jurisdictionName: "DeWITT County", jurisdictionCode: "IL-DEWITT", level: "county" }, "county:17039"],
    [{ state: "IL", jurisdictionName: "JoDAVIESS County", jurisdictionCode: "IL-JODAVIESS", level: "county" }, "county:17085"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(jurisdictionTagForRow(input), expected);
  }
});

test("jurisdiction tag schema and API surface are wired", () => {
  const schema = readFileSync("src/db/schema.ts", "utf8");
  const types = readFileSync("src/lib/types.ts", "utf8");
  const dataAccess = readFileSync("src/lib/data-access.ts", "utf8");
  const nativeImport = readFileSync("src/db/native-import.ts", "utf8");
  const legacyImport = readFileSync("src/db/legacy-import.ts", "utf8");
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const flipReport = readFileSync("scripts/report-national-county-flips.mjs", "utf8");
  const coverageReport = readFileSync("scripts/report-2024-county-list-coverage.mjs", "utf8");

  assert.match(schema, /jurisdictionTag: text\("jurisdiction_tag"\)/);
  assert.match(types, /jurisdictionTag\?: string \| null/);
  assert.match(dataAccess, /jurisdiction_tag as "jurisdictionTag"/);
  assert.match(dataAccess, /jurisdictionTagForRow/);
  assert.match(nativeImport, /jurisdiction_tag/);
  assert.match(legacyImport, /add column if not exists jurisdiction_tag/);
  assert.match(packageScripts["jurisdictions:build"], /build-canonical-jurisdictions/);
  assert.match(packageScripts["jurisdictions:validate"], /validate-jurisdiction-tags/);
  assert.match(packageScripts["jurisdictions:flips"], /report-national-county-flips/);
  assert.match(packageScripts["jurisdictions:flips:2016-2020"], /--from=2016 --to=2020/);
  assert.match(packageScripts["jurisdictions:flips:2016-2024"], /--from=2016 --to=2024/);
  assert.match(packageScripts["jurisdictions:coverage"], /report-2024-county-list-coverage/);
  assert.match(packageScripts["jurisdictions:coverage:2016"], /--year=2016 --family=historical/);
  assert.match(flipReport, /--staging-dir=/);
  assert.match(flipReport, /--overlay-states=/);
  assert.match(flipReport, /stagingSource\.rowsForState/);
  assert.match(coverageReport, /--staging-dir=/);
  assert.match(coverageReport, /--overlay-states=/);
  assert.match(coverageReport, /stagingSource\.rowsForState/);
});

test("jurisdiction flip wave coordination stays explicit", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const tracker = JSON.parse(readFileSync("data/jurisdiction-tag-coverage-waves.json", "utf8"));
  const tracker2016 = JSON.parse(readFileSync("data/jurisdiction-tag-coverage-2016-waves.json", "utf8"));

  assert.match(agents, /Jurisdiction Tag And Historical Flip Waves/);
  assert.match(agents, /npm run jurisdictions:flips/);
  assert.match(agents, /jurisdictions:coverage:2016/);
  assert.match(agents, /jurisdictions:flips:2016-2020/);
  assert.match(agents, /jurisdiction-tag-coverage-2016-waves/);
  assert.match(agents, /Workers must not run production promotion/);
  assert.match(agents, /--overlay-states/);
  assert.match(agents, /npm\.cmd run jurisdictions:coverage:2016 -- --staging-dir/);
  assert.match(agents, /Require a `stagingOverlay` object/);
  assert.match(agents, /Native promotion replaces all historical rows/);
  assert.match(agents, /`gpt-5\.6-sol` with `max` reasoning/);
  assert.match(agents, /`gpt-5\.6-terra` with `medium` reasoning/);
  assert.match(agents, /`gpt-5\.6-luna` with `(?:high|xhigh)` reasoning/);
  assert.equal(tracker.currentCoverage.missingHistoricalRows, 699);
  assert.equal(tracker.currentCoverage.blueToRed, 66);
  assert.equal(tracker.currentCoverage.redToBlue, 0);
  assert.equal(tracker2016.currentCoverage.missingExpectedTags2016, 657);
  assert.equal(tracker2016.comparisonCoverage["2016To2024"].blueToRed, 57);
  assert.equal(tracker2016.waves.every((wave) => wave.states.length <= 5), true);

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

test("local staging report source validates artifacts and filters comparable rows", async () => {
  const stagingDir = mkdtempSync(join(tmpdir(), "civic-jurisdiction-report-"));
  try {
    const artifact = {
      state: { code: "AL", name: "Alabama" },
      election: { year: 2024, office: "president" },
      native: {
        resultRows: [
          {
            jurisdictionCode: "AUTAUGA",
            jurisdictionName: "Autauga County",
            level: "county",
            totalVotes: 100,
            votes: { Harris: 70, Other: 0, Trump: 30 },
          },
          {
            jurisdictionCode: "EXAMPLE-TOWN",
            jurisdictionName: "Example Town",
            level: "town",
            totalVotes: 100,
            votes: { Harris: 10, Other: 0, Trump: 90 },
          },
        ],
        historicalRows: [
          {
            electionYear: 2016,
            jurisdictionName: "Autauga County",
            sourceLevel: "county",
            demVotes: 60,
            repVotes: 40,
            totalVotes: 100,
          },
          {
            electionYear: 2020,
            jurisdictionName: "Autauga County",
            sourceLevel: "county",
            demVotes: 40,
            repVotes: 60,
            totalVotes: 100,
          },
        ],
      },
    };
    writeFileSync(join(stagingDir, "al-2024-staging.json"), JSON.stringify(artifact), "utf8");

    const source = await loadStagingJurisdictionReportSource(stagingDir);
    assert.equal(source.base, stagingDir);
    assert.deepEqual(source.states, ["AL"]);
    assert.equal(source.rowsForState("AL", "results", 2024).length, 1);
    assert.equal(source.rowsForState("AL", "results", 2016).length, 0);
    assert.equal(source.rowsForState("AL", "historical", 2016).length, 1);
    assert.equal(source.rowsForState("AL", "historical", 2020).length, 1);
    assert.equal(source.rowsForState("AL", "historical", 2012).length, 0);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
});

test("local staging report source rejects mismatched artifact state metadata", async () => {
  const stagingDir = mkdtempSync(join(tmpdir(), "civic-jurisdiction-report-invalid-"));
  try {
    writeFileSync(join(stagingDir, "al-2024-staging.json"), JSON.stringify({
      state: { code: "AZ" },
      election: { year: 2024 },
      native: { resultRows: [], historicalRows: [] },
    }), "utf8");

    await assert.rejects(
      loadStagingJurisdictionReportSource(stagingDir),
      /state\.code AZ does not match filename state AL/,
    );
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
});

test("RI finalized ZIP reader rejects sanitized traversal members", async () => {
  const unsafeZip = new JSZip();
  unsafeZip.file("../rigen2024l.txt", "unsafe");
  const unsafeBytes = await unsafeZip.generateAsync({ type: "uint8array" });
  await assert.rejects(
    readFinalizedRootEntry(unsafeBytes, "rigen2024l.txt", "crafted archive"),
    /safe finalized root result entry/,
  );

  const safeZip = new JSZip();
  safeZip.file("rigen2024l.txt", "safe");
  const safeBytes = await safeZip.generateAsync({ type: "uint8array" });
  assert.equal(await readFinalizedRootEntry(safeBytes, "rigen2024l.txt", "safe archive"), "safe");
});

test("jurisdiction tag resolver keeps county and city alias fixes explicit", () => {
  const registry = JSON.parse(readFileSync("data/canonical-jurisdictions.json", "utf8"));
  const byTag = new Map(registry.jurisdictions.map((row) => [row.jurisdictionTag, row]));
  const resolver = readFileSync("src/lib/jurisdiction-tags.ts", "utf8");

  assert.equal(byTag.get("county:29063")?.aliases.includes("De Kalb County"), true);
  assert.equal(byTag.get("county:40079")?.aliases.includes("Leflore County"), true);
  assert.match(resolver, /function hasCityMarker/);
  assert.match(resolver, /function hasCountyMarker/);
  assert.match(resolver, /disambiguateAdministrativeKind\(Array\.from\(candidates\.values\(\)\), name, code\)/);
});

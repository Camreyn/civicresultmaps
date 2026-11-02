import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildEquipmentPackage, replayEquipmentPackage, observationPath } from "../../scripts/build-ny-2026-equipment.mjs";
import { filterMidtermEquipment, midtermEquipment, midtermEquipmentCsv, midtermSource } from "../../src/lib/midterm-equipment.ts";
import { supportedPresidentialYears, isSupportedPresidentialYear } from "../../src/lib/api-version.ts";

const root = new URL("../../", import.meta.url);
const bytes = await readFile(new URL(observationPath, root));
const observations = JSON.parse(bytes);
const registry = JSON.parse(await readFile(new URL("data/canonical-jurisdictions.json", root)));

test("reviewed observation replays byte-identically with 62 unique canonical county tags", async () => {
  assert.deepEqual(await replayEquipmentPackage(), midtermEquipment);
  assert.equal(midtermEquipment.rows.length, 62);
  assert.equal(new Set(midtermEquipment.rows.map((row) => row.jurisdictionTag)).size, 62);
  assert.equal(midtermEquipment.evidence.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(midtermEquipment.evidence.byteLength, bytes.length);
  assert.equal(midtermEquipment.rows.filter((row) => row.additionalEquipment.length).length, 24);
  assert.match(midtermEquipment.evidence.captureMethod, /not a retained original HTML/);
});

test("every assertion resolves to a bounded official source and preserves unknown deployment fields", () => {
  for (const source of midtermEquipment.sources) {
    assert.equal(new URL(source.url).hostname, "elections.ny.gov");
    assert.equal(source.publicationDate, null);
    assert.equal(source.observedAt, "2026-11-02");
  }
  for (const row of midtermEquipment.rows) {
    assert.ok(midtermSource(row.sourceId));
    assert.ok(row.sourceSection.includes("Counties"));
    assert.equal(row.electionDeploymentConfirmed, false);
    assert.equal(row.exactModels, null);
    assert.equal(row.firmware, null);
    assert.equal(row.pollbook, null);
    for (const extra of row.additionalEquipment) {
      assert.equal(extra.sourceId, "clear-ballot");
      assert.equal(extra.role, "central_count_audit_only");
    }
  }
  const nassau = midtermEquipment.rows.find((row) => row.county === "Nassau");
  assert.equal(nassau.sourceId, "clear-ballot");
  assert.match(nassau.notes, /Legacy official ES&S/);
  assert.ok(nassau.conflictSourceIds.every(midtermSource));
  for (const county of ["Bronx", "Kings", "New York", "Queens", "Richmond"]) {
    assert.equal(midtermEquipment.rows.find((row) => row.county === county).sourceId, "ess");
  }
  assert.equal(midtermEquipment.resultsStatus, "not_loaded");
  assert.ok(!("results" in midtermEquipment) && !("indicators" in midtermEquipment));
});

test("normalizer rejects missing, duplicate, unmatched and role-confused input", () => {
  for (const mutate of [
    (input) => input.lists[0].counties.pop(),
    (input) => input.lists[0].counties.push("Broome"),
    (input) => { input.lists[0].counties[0] = "Unknown County"; },
    (input) => { input.lists[0].sourceId = "unregistered"; },
    (input) => { input.lists[0].role = "fielded"; },
    (input) => { input.lists[4].sourceId = "ess"; },
  ]) {
    const input = structuredClone(observations);
    mutate(input);
    assert.throws(() => buildEquipmentPackage(input, registry, bytes));
  }
});

test("table filters and CSV preserve sources, roles, dates and caveats", () => {
  assert.equal(filterMidtermEquipment("36059", "")[0].county, "Nassau");
  assert.equal(filterMidtermEquipment("  SuFfOlK  ", "")[0].sourceId, "ess");
  assert.equal(filterMidtermEquipment("", "Hart / Verity").length, 7);
  assert.equal(filterMidtermEquipment("Nassau", "Hart / Verity").length, 0);
  assert.equal(filterMidtermEquipment("<script>", "").length, 0);
  const csv = midtermEquipmentCsv();
  assert.equal(csv.trim().split("\r\n").length, 63);
  assert.match(csv, /source_url/);
  assert.match(csv, /https:\/\/elections.ny.gov\/clear-ballot/);
  assert.match(csv, /Not independently confirmed/);
  assert.match(csv, /Legacy official ES&S/);
  assert.match(csv, /Undated/);
});

test("2026 branch occurs before presidential data loading and keeps presidential year contract unchanged", async () => {
  const page = await readFile(new URL("src/app/page.tsx", root), "utf8");
  assert.ok(page.indexOf("return <MidtermWorkspace") < page.indexOf("const layoutResolution"));
  assert.deepEqual(supportedPresidentialYears, [2012, 2016, 2020, 2024]);
  assert.equal(isSupportedPresidentialYear(2026), false);
  const deploymentIgnore = await readFile(new URL(".vercelignore", root), "utf8");
  assert.match(deploymentIgnore, /^!data\/ny-2026-equipment\.json\r?$/m, "The runtime snapshot must survive Vercel's data upload exclusions");
});

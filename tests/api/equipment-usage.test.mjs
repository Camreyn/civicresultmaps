import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, matchers, registry, apiRoute, usageLibrary, detailPage, indexPage] = await Promise.all([
  readFile("data/equipment-usage-index.json", "utf8").then(JSON.parse),
  readFile("data/equipment-usage-matchers.json", "utf8").then(JSON.parse),
  readFile("data/admin-source-packages.json", "utf8").then(JSON.parse),
  readFile("src/app/api/equipment-systems/[slug]/jurisdictions/route.ts", "utf8"),
  readFile("src/lib/equipment-usage.ts", "utf8"),
  readFile("src/app/equipment/[slug]/page.tsx", "utf8"),
  readFile("src/app/equipment/page.tsx", "utf8"),
]);
const vercelIgnore = await readFile(".vercelignore", "utf8");

assert.equal(index.schemaVersion, 1);
assert.equal(index.coverage.registryStateOrDistrictCount, 51);
assert.equal(index.coverage.loadedPackageCount, 50);
assert.equal(index.coverage.missingPackageCount, 1);
assert.equal(index.coverage.normalizedRowCount, 3119);
assert.equal(index.coverage.dossierCount, 6);
assert.equal(index.summaries.length, matchers.systems.length);
assert.equal(index.sources.length, 50);
assert.equal(index.records.length, index.coverage.indexedObservationCount);
assert.ok(index.coverage.indexedRecordCount > index.coverage.indexedObservationCount);

const registrySourceIds = new Set(registry.stateYearStatuses
  .filter((entry) => entry.equipment?.status === "loaded")
  .map((entry) => entry.equipment.sourceDocumentId));
const sourceIds = new Set(index.sources.map((source) => source.id));
assert.deepEqual(sourceIds, registrySourceIds);

for (const record of index.records) {
  assert.ok(sourceIds.has(record.sourceId));
  assert.match(record.state, /^[A-Z]{2}$/);
  assert.equal(record.electionYear, 2024);
  assert.ok(record.jurisdictionName || record.jurisdictionCode);
  assert.ok(record.matches.length > 0);
  for (const match of record.matches) {
    assert.ok(["device_family", "manufacturer_context"].includes(match.evidenceKind));
    assert.ok(matchers.systems.some((matcher) => matcher.slug === match.slug));
    if (match.evidenceKind === "manufacturer_context") {
      assert.match(match.matchReason, /does not identify this dossier's exact model or configuration/i);
    }
  }
  if (record.map.scope === "jurisdiction") {
    assert.match(record.map.href, /mode=equipment&fips=\d{5}$/);
    assert.match(record.jurisdictionTag, /^county:\d{5}$/);
  }
}

const clearAccess = index.summaries.find((summary) => summary.slug === "clear-ballot-clearvote-25-clearaccess");
const imageCastX = index.summaries.find((summary) => summary.slug === "dominion-democracy-suite-517-imagecast-x");
const ds200 = index.summaries.find((summary) => summary.slug === "ess-evs-6400-ds200");
assert.equal(clearAccess.deviceFamilyRecords, 49);
assert.equal(clearAccess.deviceFamilyStates, 7);
assert.equal(imageCastX.deviceFamilyRecords, 382);
assert.equal(imageCastX.deviceFamilyStates, 15);
assert.equal(ds200.deviceFamilyRecords, 0);
assert.equal(ds200.manufacturerContextRecords, 1509);

assert.match(apiRoute, /device_family/);
assert.match(apiRoute, /manufacturer_context/);
assert.match(apiRoute, /queryEquipmentUsage/);
assert.match(usageLibrary, /safeLimit/);
assert.match(detailPage, /equipment-usage/);
assert.match(indexPage, /usageSummary/);
assert.match(vercelIgnore, /^!data\/equipment-usage-index\.json$/m);

console.log("equipment usage index tests passed");

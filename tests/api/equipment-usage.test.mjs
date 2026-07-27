import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  index,
  matchers,
  registry,
  jurisdictionApiRoute,
  stateApiRoute,
  compareApiRoute,
  usageLibrary,
  usagePage,
  statePage,
  comparePage,
  indexPage,
  apiVersion,
  openApi,
  sitemap,
  v1StateRoute,
  v1CompareRoute,
] = await Promise.all([
  readFile("data/equipment-usage-index.json", "utf8").then(JSON.parse),
  readFile("data/equipment-usage-matchers.json", "utf8").then(JSON.parse),
  readFile("data/admin-source-packages.json", "utf8").then(JSON.parse),
  readFile("src/app/api/equipment-systems/[slug]/jurisdictions/route.ts", "utf8"),
  readFile("src/app/api/equipment-states/[state]/route.ts", "utf8"),
  readFile("src/app/api/equipment-systems/compare/route.ts", "utf8"),
  readFile("src/lib/equipment-usage.ts", "utf8"),
  readFile("src/app/equipment/[slug]/usage/page.tsx", "utf8"),
  readFile("src/app/equipment/state/[state]/page.tsx", "utf8"),
  readFile("src/app/equipment/compare/page.tsx", "utf8"),
  readFile("src/app/equipment/page.tsx", "utf8"),
  readFile("src/lib/api-version.ts", "utf8"),
  readFile("src/lib/openapi.ts", "utf8"),
  readFile("src/app/sitemap.ts", "utf8"),
  readFile("src/app/api/v1/equipment-states/[state]/route.ts", "utf8"),
  readFile("src/app/api/v1/equipment-systems/compare/route.ts", "utf8"),
]);
const vercelIgnore = await readFile(".vercelignore", "utf8");

assert.equal(index.schemaVersion, 2);
assert.equal(matchers.schemaVersion, 2);
assert.equal(index.coverage.registryStateOrDistrictCount, 51);
assert.equal(index.coverage.loadedPackageCount, 50);
assert.equal(index.coverage.missingPackageCount, 1);
assert.equal(index.coverage.normalizedRowCount, 3119);
assert.equal(index.coverage.indexedObservationCount, 2190);
assert.equal(index.coverage.indexedRecordCount, 2190);
assert.equal(index.coverage.indexedRelationCount, 2190);
assert.equal(index.coverage.exactSystemRelationCount, 431);
assert.equal(index.coverage.manufacturerRelationCount, 1759);
assert.equal(index.coverage.dossierCount, 6);
assert.equal(index.coverage.manufacturerCount, 3);
assert.equal(index.summaries.length, matchers.systems.length);
assert.equal(index.systems.length, matchers.systems.length);
assert.equal(index.manufacturers.length, matchers.manufacturers.length);
assert.equal(index.sources.length, 50);
assert.equal(index.records.length, index.coverage.indexedObservationCount);

const registrySourceIds = new Set(registry.stateYearStatuses
  .filter((entry) => entry.equipment?.status === "loaded")
  .map((entry) => entry.equipment.sourceDocumentId));
const sourceIds = new Set(index.sources.map((source) => source.id));
const dossierSlugs = new Set(matchers.systems.map((matcher) => matcher.slug));
const manufacturerIds = new Set(matchers.manufacturers.map((manufacturer) => manufacturer.id));
assert.deepEqual(sourceIds, registrySourceIds);

let exactSystemRelations = 0;
let manufacturerRelations = 0;
for (const record of index.records) {
  assert.ok(sourceIds.has(record.sourceId));
  assert.match(record.state, /^[A-Z]{2}$/);
  assert.equal(record.electionYear, 2024);
  assert.ok(record.jurisdictionName || record.jurisdictionCode);
  assert.equal(
    record.relations.length,
    1,
    "each source observation must target one exact product family or one manufacturer, never fan out to sibling dossiers",
  );
  const [relation] = record.relations;
  if (relation.target.kind === "equipment_system") {
    exactSystemRelations += 1;
    assert.equal(relation.evidenceKind, "device_family");
    assert.ok(dossierSlugs.has(relation.target.slug));
    assert.match(relation.matchReason, /explicitly names/i);
  } else {
    manufacturerRelations += 1;
    assert.equal(relation.evidenceKind, "manufacturer_context");
    assert.ok(manufacturerIds.has(relation.target.id));
    assert.match(relation.matchReason, /does not identify an exact dossier model or configuration/i);
  }
  if (record.map.scope === "jurisdiction") {
    assert.match(record.map.href, /mode=equipment&fips=\d{5}$/);
    assert.match(record.jurisdictionTag, /^county:\d{5}$/);
  }
}
assert.equal(exactSystemRelations, index.coverage.exactSystemRelationCount);
assert.equal(manufacturerRelations, index.coverage.manufacturerRelationCount);

const clearAccess = index.summaries.find((summary) => summary.slug === "clear-ballot-clearvote-25-clearaccess");
const imageCastX = index.summaries.find((summary) => summary.slug === "dominion-democracy-suite-517-imagecast-x");
const ds200 = index.summaries.find((summary) => summary.slug === "ess-evs-6400-ds200");
assert.equal(clearAccess.deviceFamilyRecords, 49);
assert.equal(clearAccess.deviceFamilyStates, 7);
assert.equal(imageCastX.deviceFamilyRecords, 382);
assert.equal(imageCastX.deviceFamilyStates, 15);
assert.equal(ds200.deviceFamilyRecords, 0);
assert.equal(ds200.manufacturerContextRecords, 1509);
assert.equal(
  index.records
    .flatMap((record) => record.relations)
    .filter((relation) => relation.target.kind === "manufacturer" && relation.target.id === "ess").length,
  1509,
);

assert.match(jurisdictionApiRoute, /relation/);
assert.match(jurisdictionApiRoute, /requestedDossierContext/);
assert.match(jurisdictionApiRoute, /same_manufacturer_not_exact_deployment/);
assert.match(stateApiRoute, /exactProductFamilySystems/);
assert.match(stateApiRoute, /manufacturerContexts/);
assert.match(compareApiRoute, /validateEquipmentComparisonSlugs/);
assert.match(compareApiRoute, /buildEquipmentComparison/);
assert.match(usageLibrary, /target\.kind === "equipment_system"/);
assert.match(usageLibrary, /relatedDossierSlugs/);
assert.match(usagePage, /vendor-only rows target the manufacturer, not this machine/i);
assert.match(statePage, /Manufacturer context only/);
assert.match(statePage, /not deployment evidence/i);
assert.match(comparePage, /Compare two or three reviewed equipment dossiers/);
assert.match(comparePage, /name="slugs"/);
assert.match(indexPage, /placeholder="Machine, vendor, role, or system"/);
assert.match(indexPage, /Open comparison workspace/);
assert.match(apiVersion, /equipmentCatalogApiSchemaVersion = "2\.1\.0"/);
assert.match(openApi, /\/api\/v1\/equipment-systems\/compare/);
assert.match(openApi, /\/api\/v1\/equipment-states\/\{state\}/);
assert.match(openApi, /EquipmentUsageRelationTarget/);
assert.match(openApi, /EquipmentComparisonEnvelope/);
assert.match(openApi, /EquipmentStateEnvelope/);
assert.match(sitemap, /equipmentDossierSections/);
assert.match(sitemap, /\/equipment\/compare/);
assert.match(v1StateRoute, /equipment-states\/\[state\]\/route/);
assert.match(v1CompareRoute, /equipment-systems\/compare\/route/);
assert.match(vercelIgnore, /^!data\/equipment-usage-index\.json$/m);

console.log("equipment usage index and route tests passed");

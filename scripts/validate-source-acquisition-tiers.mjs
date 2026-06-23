import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repoRoot, "data", "source-acquisition-tiers.json");
const configDir = path.join(repoRoot, "etl", "state-configs");
const sourcePackage = JSON.parse(readFileSync(packagePath, "utf8"));

const failures = [];
const warnings = [];

function fail(state, message) {
  failures.push({ state, message });
}

function warn(state, message) {
  warnings.push({ state, message });
}

function assertHttpsUrl(state, label, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      fail(state, `${label} must use https: ${value}`);
    }
  } catch {
    fail(state, `${label} is not a valid URL: ${value}`);
  }
}

if (!sourcePackage.checkedAt) {
  fail("GLOBAL", "checkedAt is required");
}

if (!sourcePackage.description?.includes("does not replace loaded result or review data")) {
  fail("GLOBAL", "description must explain that this registry does not replace loaded data");
}

if (!Array.isArray(sourcePackage.tierDefinitions)) {
  fail("GLOBAL", "tierDefinitions must be an array");
}

if (!Array.isArray(sourcePackage.states)) {
  fail("GLOBAL", "states must be an array");
}

const tierDefinitions = new Map((sourcePackage.tierDefinitions ?? []).map((entry) => [entry.tier, entry]));
for (const requiredTier of [
  "tier_1_official_export_database",
  "tier_2_official_dashboard_endpoint",
  "tier_3_sanctioned_bulk_partial",
  "tier_4_local_scattershot",
  "tier_5_digital_inconsistent",
  "tier_6_official_pdf_hostile",
  "tier_7_scanned_system_printout",
  "tier_8_scanned_handwritten",
  "unknown",
]) {
  if (!tierDefinitions.has(requiredTier)) {
    fail("GLOBAL", `missing tier definition: ${requiredTier}`);
  }
}

for (const definition of sourcePackage.tierDefinitions ?? []) {
  if (!definition.tier || !definition.label || !definition.description) {
    fail("GLOBAL", `tier definition is incomplete: ${definition.tier ?? "UNKNOWN"}`);
  }
  if (!Number.isInteger(definition.roiRank)) {
    fail("GLOBAL", `tier definition roiRank must be an integer: ${definition.tier ?? "UNKNOWN"}`);
  }
}

const configuredStates = readdirSync(configDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => fileName.replace(/\.json$/, "").toUpperCase())
  .sort();

const statewideStates = new Set();
const seenRows = new Set();

for (const row of sourcePackage.states ?? []) {
  const state = row.state;
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "state must be a two-letter code");
    continue;
  }

  const rowKey = `${state}:${row.scope}:${row.jurisdictionName}:${row.dataFamily}`;
  if (seenRows.has(rowKey)) {
    fail(state, `duplicate acquisition tier row: ${rowKey}`);
  }
  seenRows.add(rowKey);

  if (!configuredStates.includes(state)) {
    warn(state, "acquisition tier row does not have a matching ETL state config");
  }

  if (row.scope === "statewide") {
    statewideStates.add(state);
  } else if (!row.jurisdictionName || row.jurisdictionName === "Statewide") {
    fail(state, "local or mixed-scope rows must name the jurisdiction");
  }

  if (!tierDefinitions.has(row.tier)) {
    fail(state, `unknown tier value: ${row.tier}`);
  }

  for (const field of ["stateName", "jurisdictionName", "scope", "dataFamily", "reportingGrain", "parserStatus", "manualReviewBurden", "confidence", "nextAction"]) {
    if (!row[field]) {
      fail(state, `${field} is required`);
    }
  }

  if (!Array.isArray(row.exportFormats) || row.exportFormats.length === 0) {
    fail(state, "exportFormats must list at least one format or fallback");
  }

  if (!Array.isArray(row.sourceUrls) || row.sourceUrls.length === 0) {
    fail(state, "sourceUrls must list at least one official or fallback source");
  }

  for (const [index, sourceUrl] of (row.sourceUrls ?? []).entries()) {
    assertHttpsUrl(state, `sourceUrls[${index}]`, sourceUrl);
  }

  for (const [index, exampleUrl] of (row.exampleUrls ?? []).entries()) {
    assertHttpsUrl(state, `exampleUrls[${index}]`, exampleUrl);
  }

  if (row.tier !== "unknown") {
    if (!Array.isArray(row.availableFields) || row.availableFields.length === 0) {
      fail(state, "classified rows must list availableFields");
    }
    if (!row.caveats) {
      fail(state, "classified rows must document caveats");
    }
  }

  if (row.tier === "unknown" && row.confidence !== "candidate") {
    fail(state, "unknown tier rows must use candidate confidence");
  }
}

for (const state of configuredStates) {
  if (!statewideStates.has(state)) {
    fail(state, "missing statewide acquisition tier row");
  }
}

function hasRow(state, predicate) {
  return (sourcePackage.states ?? []).some((row) => row.state === state && predicate(row));
}

if (!hasRow("SC", (row) => row.tier === "tier_1_official_export_database" && row.sourceUrls.some((url) => url.includes("electionhistory.scvotes.gov")))) {
  fail("SC", "South Carolina official export database example is required");
}

if (!hasRow("IA", (row) => row.tier === "tier_2_official_dashboard_endpoint" && row.sourceUrls.some((url) => url.includes("electionresults.iowa.gov")))) {
  fail("IA", "Iowa ENR dashboard example is required");
}

if (!hasRow("TX", (row) => row.tier === "tier_3_sanctioned_bulk_partial" && row.sourceUrls.some((url) => url.includes("data.capitol.texas.gov")))) {
  fail("TX", "Texas sanctioned bulk data example is required");
}

if (!hasRow("TX", (row) => row.tier === "tier_4_local_scattershot" && /Harris County/i.test(row.jurisdictionName))) {
  fail("TX", "Harris County tier 4 local example is required");
}

if (!hasRow("MS", (row) => row.tier === "tier_7_scanned_system_printout" && /recapitulation|OCR/i.test(`${row.parserStatus} ${row.nextAction} ${row.jurisdictionName}`))) {
  fail("MS", "Mississippi OCR review-gated PDF example is required");
}

const report = {
  checkedAt: sourcePackage.checkedAt,
  failures,
  rows: sourcePackage.states?.length ?? 0,
  states: configuredStates.length,
  warnings,
};

if (failures.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

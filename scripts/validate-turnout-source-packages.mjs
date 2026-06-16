import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repoRoot, "data", "turnout-source-packages.json");
const packages = JSON.parse(readFileSync(packagePath, "utf8"));

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

function assertLocalFile(state, label, filePath) {
  if (!filePath) {
    fail(state, `${label} localFile is required`);
    return;
  }

  if (!existsSync(path.join(repoRoot, filePath))) {
    fail(state, `${label} localFile missing: ${filePath}`);
  }
}

if (!packages.checkedAt) {
  fail("GLOBAL", "checkedAt is required");
}

if (!Array.isArray(packages.loadedPackages)) {
  fail("GLOBAL", "loadedPackages must be an array");
}

if (packages.partialPackages !== undefined && !Array.isArray(packages.partialPackages)) {
  fail("GLOBAL", "partialPackages must be an array when present");
}

if (!Array.isArray(packages.missingRequests)) {
  fail("GLOBAL", "missingRequests must be an array");
}

if (!Array.isArray(packages.remainingStatesNeedingPackages)) {
  fail("GLOBAL", "remainingStatesNeedingPackages must be an array");
}

if (!Array.isArray(packages.stateYearStatuses)) {
  fail("GLOBAL", "stateYearStatuses must be an array");
}

if (!Array.isArray(packages.fallbackSources)) {
  fail("GLOBAL", "fallbackSources must be an array");
}

if (!Array.isArray(packages.normalizedTurnoutContract?.requiredColumns)) {
  fail("GLOBAL", "normalizedTurnoutContract.requiredColumns must be an array");
}

const seenStates = new Set();

function validateTurnoutPackage(sourcePackage, collectionName) {
  const state = sourcePackage.state;
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", `${collectionName} state must be a two-letter code`);
    return;
  }

  if (collectionName === "loaded package" && seenStates.has(state)) {
    fail(state, "duplicate loaded turnout package");
  }
  if (collectionName === "loaded package") {
    seenStates.add(state);
  }

  for (const field of ["name", "authority", "sourceLevel"]) {
    if (!sourcePackage[field]) {
      fail(state, `${field} is required`);
    }
  }

  for (const [label, source] of [
    ["turnoutSource", sourcePackage.turnoutSource],
    ["denominatorSource", sourcePackage.denominatorSource],
  ]) {
    if (!source) {
      fail(state, `${label} is required`);
      continue;
    }

    for (const field of ["sourceTitle", "sourceUrl", "localFile", "parser"]) {
      if (!source[field]) {
        fail(state, `${label}.${field} is required`);
      }
    }

    assertHttpsUrl(state, `${label}.sourceUrl`, source.sourceUrl);
    assertLocalFile(state, label, source.localFile);
  }

  if (!sourcePackage.denominatorSource?.denominatorType) {
    fail(state, "denominatorSource.denominatorType is required");
  }

  if (!Number.isInteger(sourcePackage.expected?.turnoutRows) || sourcePackage.expected.turnoutRows <= 0) {
    fail(state, "expected.turnoutRows must be a positive integer");
  }

  if (!Array.isArray(sourcePackage.caveats)) {
    warn(state, "caveats should be an array");
  }
}

for (const sourcePackage of packages.loadedPackages ?? []) {
  validateTurnoutPackage(sourcePackage, "loaded package");
}

const partialSeenStates = new Set();

for (const sourcePackage of packages.partialPackages ?? []) {
  const state = sourcePackage.state;
  if (partialSeenStates.has(state)) {
    fail(state, "duplicate partial turnout package");
  }
  partialSeenStates.add(state);
  validateTurnoutPackage(sourcePackage, "partial package");

  if (sourcePackage.coverageStatus !== "partial") {
    fail(state, "partial package coverageStatus must be partial");
  }

  if (!Array.isArray(sourcePackage.coveredCounties) || sourcePackage.coveredCounties.length === 0) {
    fail(state, "partial package coveredCounties must list covered counties");
  }

  if (!Number.isInteger(sourcePackage.missingCountyCount) || sourcePackage.missingCountyCount <= 0) {
    fail(state, "partial package missingCountyCount must be a positive integer");
  }
}

for (const request of packages.missingRequests ?? []) {
  const state = request.state;
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "missing request state must be a two-letter code");
    continue;
  }

  if (seenStates.has(state)) {
    fail(state, "state cannot be both loaded and missing");
  }

  for (const field of ["name", "needed", "preferredLevel", "requiredFields", "notes"]) {
    if (!request[field]) {
      fail(state, `missing request ${field} is required`);
    }
  }

  for (const field of ["sourceTitle", "sourceUrl", "localFile", "reportingLevel", "ballotsCastField", "denominatorField", "denominatorTiming", "joinKeys", "expectedRowCount", "caveats"]) {
    if (!request.requiredFields?.includes(field)) {
      fail(state, `missing request requiredFields must include ${field}`);
    }
  }
}

for (const state of packages.remainingStatesNeedingPackages ?? []) {
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "remainingStatesNeedingPackages entries must be two-letter state codes");
  }

  if (seenStates.has(state)) {
    fail(state, "state cannot be loaded and remaining");
  }
}

const allowedStatuses = new Set(["loaded", "partial", "candidate", "needs_data", "blocked", "documented_exclusion"]);
const statusKeys = new Set();

for (const source of packages.fallbackSources ?? []) {
  const id = source.id ?? "UNKNOWN";
  for (const field of ["sourceTitle", "sourceUrl", "parser", "authority", "status"]) {
    if (!source[field]) {
      fail(id, `fallback source ${field} is required`);
    }
  }
  assertHttpsUrl(id, "fallbackSource.sourceUrl", source.sourceUrl);
  if (!Array.isArray(source.years) || source.years.length === 0) {
    fail(id, "fallback source years must be a non-empty array");
  }
  if (!allowedStatuses.has(source.status)) {
    fail(id, `fallback source status is invalid: ${source.status}`);
  }
}

for (const row of packages.stateYearStatuses ?? []) {
  const state = row.state;
  const key = `${state}-${row.year}`;
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "stateYearStatuses entries must use two-letter state codes");
    continue;
  }
  if (statusKeys.has(key)) {
    fail(state, `duplicate state/year turnout status: ${key}`);
  }
  statusKeys.add(key);
  if (!Number.isInteger(row.year) || row.year < 1788) {
    fail(state, "stateYearStatuses year must be an integer election year");
  }
  if (!Number.isInteger(row.priority) || row.priority <= 0) {
    fail(state, "stateYearStatuses priority must be a positive integer");
  }
  if (!allowedStatuses.has(row.status)) {
    fail(state, `stateYearStatuses status is invalid: ${row.status}`);
  }
  for (const field of ["name", "sourceLevel", "denominatorType", "denominatorTiming", "sourceTitle", "sourceUrl", "parser", "statusNote", "nextAction"]) {
    if (!row[field]) {
      fail(state, `stateYearStatuses ${field} is required`);
    }
  }
  assertHttpsUrl(state, "stateYearStatuses.sourceUrl", row.sourceUrl);
  if (["loaded", "partial"].includes(row.status)) {
    assertLocalFile(state, "stateYearStatuses", row.localFile);
    if (!Number.isInteger(row.expectedTurnoutRows) || row.expectedTurnoutRows <= 0) {
      fail(state, "loaded/partial stateYearStatuses expectedTurnoutRows must be a positive integer");
    }
  }
}

const states2024 = new Set((packages.stateYearStatuses ?? []).filter((row) => row.year === 2024).map((row) => row.state));
if (states2024.size !== 50) {
  fail("GLOBAL", `stateYearStatuses must include all 50 states for 2024; found ${states2024.size}`);
}

for (const requiredColumn of ["state", "election_year", "jurisdiction_name", "level", "ballots_cast", "registered_voters", "denominator_note", "warning_required", "source_url"]) {
  if (!packages.normalizedTurnoutContract?.requiredColumns?.includes(requiredColumn)) {
    fail("GLOBAL", `normalized turnout contract must include ${requiredColumn}`);
  }
}

console.log(
  JSON.stringify(
    {
      checkedLoadedPackages: packages.loadedPackages?.length ?? 0,
      checkedPartialPackages: packages.partialPackages?.length ?? 0,
      checkedMissingRequests: packages.missingRequests?.length ?? 0,
      checkedRemainingStates: packages.remainingStatesNeedingPackages?.length ?? 0,
      failures,
      warnings,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}

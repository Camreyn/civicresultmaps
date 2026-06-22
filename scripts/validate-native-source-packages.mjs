import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repoRoot, "data", "native-import-source-packages.json");
const sourcePackages = JSON.parse(readFileSync(packagePath, "utf8"));

const failures = [];
const warnings = [];
const summaries = [];

function fail(state, message) {
  failures.push({ state, message });
}

function warn(state, message) {
  warnings.push({ state, message });
}

function localFiles(value) {
  return String(value ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertLocalFile(state, label, filePath, options = {}) {
  const fullPath = path.join(repoRoot, filePath);
  if (existsSync(fullPath)) {
    return true;
  }

  const message = `${label} missing: ${filePath}`;
  if (options.warning) {
    warn(state, message);
  } else {
    fail(state, message);
  }
  return false;
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

function artifactEntries(sourcePackage) {
  return [
    ["presidentialCountyResults", sourcePackage.artifacts?.presidentialCountyResults],
    ["localReviewRows", sourcePackage.artifacts?.localReviewRows],
    ["turnout", sourcePackage.artifacts?.turnout],
    ["countyBoundary", sourcePackage.artifacts?.countyBoundary],
  ];
}

if (!sourcePackages.checkedAt) {
  fail("GLOBAL", "checkedAt is required");
}

if (!Array.isArray(sourcePackages.states) || sourcePackages.states.length === 0) {
  fail("GLOBAL", "states must be a non-empty array");
}

const seenStates = new Set();
const completedNativeStates = sourcePackages.completedNativeStates ?? [];
const sourceDiscoveryQueue = sourcePackages.sourceDiscoveryQueue ?? [];

if (!Array.isArray(sourceDiscoveryQueue)) {
  fail("GLOBAL", "sourceDiscoveryQueue must be an array when present");
}

for (const entry of Array.isArray(sourceDiscoveryQueue) ? sourceDiscoveryQueue : []) {
  const state = entry.state;

  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "sourceDiscoveryQueue entries must include a two-letter state code");
    continue;
  }

  if (!entry.name) {
    fail(state, "sourceDiscoveryQueue.name is required");
  }

  if (!entry.currentStatus) {
    fail(state, "sourceDiscoveryQueue.currentStatus is required");
  }

  if (!entry.parserNeeded) {
    fail(state, "sourceDiscoveryQueue.parserNeeded is required");
  }

  if (!Array.isArray(entry.officialSourcePages) || entry.officialSourcePages.length === 0) {
    fail(state, "sourceDiscoveryQueue.officialSourcePages must be non-empty");
  } else {
    for (const [index, sourceUrl] of entry.officialSourcePages.entries()) {
      assertHttpsUrl(state, `sourceDiscoveryQueue.officialSourcePages[${index}]`, sourceUrl);
    }
  }

  if (!Array.isArray(entry.requiredArtifacts) || entry.requiredArtifacts.length === 0) {
    fail(state, "sourceDiscoveryQueue.requiredArtifacts must be non-empty");
  }
}

for (const state of completedNativeStates) {
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "completedNativeStates entries must be two-letter state codes");
  }
}

for (const sourcePackage of sourcePackages.states ?? []) {
  const state = sourcePackage.state;
  if (!/^[A-Z]{2}$/.test(state ?? "")) {
    fail(state ?? "UNKNOWN", "state must be a two-letter code");
    continue;
  }

  if (seenStates.has(state)) {
    fail(state, "duplicate state package");
  }
  seenStates.add(state);

  if (!sourcePackage.name) {
    fail(state, "name is required");
  }

  if (!sourcePackage.authority) {
    fail(state, "authority is required");
  }

  assertLocalFile(state, "native config", sourcePackage.configFile);
  assertLocalFile(state, "legacy reference bundle", sourcePackage.legacyReferenceBundle, { warning: true });

  for (const [label, artifact] of artifactEntries(sourcePackage)) {
    if (!artifact) {
      fail(state, `${label} artifact is required`);
      continue;
    }

    if (!artifact.sourceTitle) {
      fail(state, `${label} sourceTitle is required`);
    }

    assertHttpsUrl(state, `${label} sourceUrl`, artifact.sourceUrl);

    for (const filePath of localFiles(artifact.localFile)) {
      assertLocalFile(state, `${label} local artifact`, filePath);
    }

    if (label === "countyBoundary" && artifact.appReadyFile) {
      assertLocalFile(state, `${label} app-ready file`, artifact.appReadyFile, { warning: true });
    }
  }

  const expected = sourcePackage.expected ?? {};
  const expectedNumbers = [
    "countyRows",
    "geometryFeatures",
    "stateTotal",
    "trump",
    "harris",
    "other",
    "localReviewRows",
    "turnoutRows",
  ];

  for (const key of expectedNumbers) {
    if (!Number.isInteger(expected[key]) || expected[key] < 0) {
      fail(state, `expected.${key} must be a non-negative integer`);
    }
  }

  if (
    Number.isInteger(expected.trump) &&
    Number.isInteger(expected.harris) &&
    Number.isInteger(expected.other) &&
    Number.isInteger(expected.stateTotal) &&
    expected.trump + expected.harris + expected.other !== expected.stateTotal
  ) {
    fail(state, "expected trump + harris + other does not equal stateTotal");
  }

  if (!sourcePackage.validationStatus?.localArtifactsPresent) {
    warn(state, "validationStatus.localArtifactsPresent is not true");
  }

  summaries.push({
    state,
    artifacts: artifactEntries(sourcePackage).length,
    countyRows: expected.countyRows ?? null,
    localReviewRows: expected.localReviewRows ?? null,
    turnoutRows: expected.turnoutRows ?? null,
  });
}

console.log(JSON.stringify({ checkedStates: summaries.length, failures, warnings, summaries }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}

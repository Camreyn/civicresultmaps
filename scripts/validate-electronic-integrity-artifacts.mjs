import { readFileSync } from "node:fs";

const registryPath = "data/electronic-integrity-artifacts.json";
const registry = JSON.parse(readFileSync(registryPath, "utf8").replace(/^\uFEFF/, ""));
const failures = [];
const warnings = [];
const requiredStates = ["AZ", "GA", "MI", "NV", "NC", "PA", "TX", "WI"];
const statusValues = new Set(["loaded", "partial", "candidate", "needs_data", "blocked", "documented_exclusion"]);
const overallStatusValues = new Set(["loaded", "partial", "needs_evidence", "blocked"]);
const requiredArtifactTypes = [
  "certified_results",
  "reporting_unit_results",
  "cast_vote_records",
  "ballot_images",
  "tabulator_logs",
  "logic_accuracy",
  "audit_results",
  "chain_of_custody",
];

function fail(state, message) {
  failures.push({ state, message });
}

function warn(state, message) {
  warnings.push({ state, message });
}

function assertHttpsUrl(state, label, value) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") fail(state, `${label} must use https: ${value}`);
  } catch {
    fail(state, `${label} is not a valid URL: ${value}`);
  }
}

if (!registry.description?.includes("does not allege or prove tampering")) {
  fail("GLOBAL", "description must state that the registry does not allege or prove tampering");
}

const typeDefinitions = new Set((registry.artifactTypes ?? []).map((entry) => entry.type));
for (const type of requiredArtifactTypes) {
  if (!typeDefinitions.has(type)) fail("GLOBAL", `missing artifact type definition: ${type}`);
}

if (!Array.isArray(registry.states)) fail("GLOBAL", "states must be an array");

const seenStates = new Set();
for (const state of registry.states ?? []) {
  if (!/^[A-Z]{2}$/.test(state.state ?? "")) fail(state.state ?? "UNKNOWN", "state must be a two-letter code");
  if (seenStates.has(state.state)) fail(state.state, "duplicate state row");
  seenStates.add(state.state);
  if (!requiredStates.includes(state.state)) warn(state.state, "state is outside the current swing-state electronic-integrity batch");
  if (!state.stateName) fail(state.state, "stateName is required");
  if (!overallStatusValues.has(state.overallStatus)) fail(state.state, `unknown overallStatus: ${state.overallStatus}`);
  for (const field of ["summary", "riskPosture", "nextAction"]) {
    if (!state[field]) fail(state.state, `${field} is required`);
  }
  if (!Array.isArray(state.artifacts) || state.artifacts.length === 0) fail(state.state, "artifacts must be a non-empty array");
  if (!state.artifacts?.some((artifact) => artifact.type === "certified_results" && artifact.status === "loaded")) {
    fail(state.state, "each tracked state must include loaded certified_results evidence");
  }

  const seenArtifactTypes = new Set();
  for (const artifact of state.artifacts ?? []) {
    if (seenArtifactTypes.has(artifact.type)) {
      // Multiple rows per type are valid only when they differ by granularity or status.
      warn(state.state, `multiple rows for artifact type ${artifact.type}`);
    }
    seenArtifactTypes.add(artifact.type);
    if (!typeDefinitions.has(artifact.type)) fail(state.state, `artifact type is not defined: ${artifact.type}`);
    if (!statusValues.has(artifact.status)) fail(state.state, `unknown artifact status: ${artifact.status}`);
    if (!artifact.granularity) fail(state.state, `${artifact.type} granularity is required`);
    if (!artifact.reconciliationStatus) fail(state.state, `${artifact.type} reconciliationStatus is required`);
    if (!artifact.tamperDetectionUse) fail(state.state, `${artifact.type} tamperDetectionUse is required`);
    if (typeof artifact.requestRequired !== "boolean") fail(state.state, `${artifact.type} requestRequired must be boolean`);
    assertHttpsUrl(state.state, `${artifact.type}.sourceUrl`, artifact.sourceUrl);
    if (artifact.status === "loaded" && !artifact.localArtifact) {
      fail(state.state, `${artifact.type} loaded rows must reference a localArtifact`);
    }
    if (["needs_data", "blocked"].includes(artifact.status) && artifact.requestRequired !== true) {
      fail(state.state, `${artifact.type} missing or blocked evidence should mark requestRequired true`);
    }
    if (artifact.requestRequired && !artifact.requestPath && !artifact.sourceUrl) {
      fail(state.state, `${artifact.type} requestRequired evidence should include requestPath or sourceUrl`);
    }
  }

  for (const type of requiredArtifactTypes) {
    if (!seenArtifactTypes.has(type)) {
      fail(state.state, `each tracked state must include every required artifact type; missing ${type}`);
    }
  }
}

for (const state of requiredStates) {
  if (!seenStates.has(state)) fail(state, "missing swing-state electronic-integrity row");
}

const report = {
  checkedAt: registry.checkedAt,
  failures,
  rows: registry.states?.length ?? 0,
  warnings,
};

if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

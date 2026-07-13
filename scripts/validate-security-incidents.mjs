import { access, readFile } from "node:fs/promises";
import { stateCodes } from "./state-metadata.mjs";

const registry = JSON.parse(await readFile("data/election-security-incidents-2024.json", "utf8"));
const inventory = JSON.parse(await readFile("data/election-security-incident-source-inventory-2024.json", "utf8"));
const errors = [];
const expectedStates = new Set(stateCodes());
const allowedCoverageStatuses = new Set(["loaded", "partial", "needs_data"]);
const officialHostPattern = /(^|\.)(gov|mil)$/i;

function addError(message) {
  errors.push(message);
}

function validateOfficialUrl(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      addError(`${label} must use HTTPS.`);
    }
    if (!officialHostPattern.test(url.hostname)) {
      addError(`${label} must use an official .gov or .mil host; received ${url.hostname}.`);
    }
  } catch {
    addError(`${label} is not a valid URL.`);
  }
}

if (registry.electionYear !== 2024 || registry.reportingGrain !== "county") {
  addError("Incident registry must describe county-grain 2024 rows.");
}
if (!Array.isArray(registry.incidentRows)) {
  addError("incidentRows must be an array.");
}
if (!/not evidence of fraud, misconduct/i.test(registry.caveat ?? "")) {
  addError("Registry caveat must keep incidents separate from fraud or misconduct claims.");
}

const ids = new Set();
for (const row of registry.incidentRows ?? []) {
  const label = row.id || `${row.state ?? "unknown"} incident`;
  if (ids.has(row.id)) {
    addError(`Duplicate incident id: ${row.id}.`);
  }
  ids.add(row.id);

  for (const field of [
    "id",
    "state",
    "stateName",
    "county",
    "jurisdictionCode",
    "jurisdictionTag",
    "eventDate",
    "eventType",
    "disruptionType",
    "sourceAuthority",
    "sourceTitle",
    "sourceUrl",
    "localArtifact",
    "normalizationPath",
    "confidence",
    "caveat"
  ]) {
    if (!row[field]) {
      addError(`${label} is missing ${field}.`);
    }
  }

  if (!expectedStates.has(row.state)) {
    addError(`${label} has unsupported state ${row.state}.`);
  }
  if (row.electionYear !== 2024 || row.reportingGrain !== "county") {
    addError(`${label} must be a county-grain 2024 row.`);
  }
  if (!/^county:\d{5}$/.test(row.jurisdictionTag ?? "")) {
    addError(`${label} must use a county:<GEOID> jurisdictionTag.`);
  }
  if (row.jurisdictionTag !== `county:${row.jurisdictionCode}`) {
    addError(`${label} jurisdictionCode and jurisdictionTag do not match.`);
  }
  if (!/^2024-11-\d{2}$/.test(row.eventDate ?? "")) {
    addError(`${label} eventDate must be in November 2024.`);
  }
  if (row.threatCount !== null && (!Number.isInteger(row.threatCount) || row.threatCount < 1)) {
    addError(`${label} threatCount must be null or a positive integer.`);
  }
  if (row.affectedLocations !== null && (!Number.isInteger(row.affectedLocations) || row.affectedLocations < 1)) {
    addError(`${label} affectedLocations must be null or a positive integer.`);
  }
  if (row.hoursExtended !== null && (!Number.isFinite(row.hoursExtended) || row.hoursExtended <= 0)) {
    addError(`${label} hoursExtended must be null or a positive number.`);
  }
  if (!/not evidence of fraud or misconduct/i.test(row.caveat ?? "")) {
    addError(`${label} caveat must say the row is not evidence of fraud or misconduct.`);
  }
  validateOfficialUrl(row.sourceUrl, `${label} sourceUrl`);
  for (const [index, url] of (row.supportingSourceUrls ?? []).entries()) {
    validateOfficialUrl(url, `${label} supportingSourceUrls[${index}]`);
  }
  for (const artifact of [row.localArtifact, ...(row.supportingLocalArtifacts ?? [])].filter(Boolean)) {
    try {
      await access(artifact);
    } catch {
      addError(`${label} local artifact does not exist: ${artifact}.`);
    }
  }
}

const rows = registry.incidentRows ?? [];
if (registry.expected?.rowCount !== rows.length) {
  addError(`Registry expected.rowCount is ${registry.expected?.rowCount}; found ${rows.length}.`);
}
if (registry.expected?.stateCount !== new Set(rows.map((row) => row.state)).size) {
  addError("Registry expected.stateCount does not match normalized rows.");
}
const completeThreatCountRows = rows.filter((row) => row.threatCount !== null).length;
if (registry.expected?.completeThreatCountRows !== completeThreatCountRows) {
  addError("Registry expected.completeThreatCountRows does not match normalized rows.");
}
const threatCountComplete = rows.length > 0 && completeThreatCountRows === rows.length;
const knownThreatCountTotal = threatCountComplete
  ? rows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0)
  : null;
if (registry.expected?.knownThreatCountTotal !== knownThreatCountTotal) {
  addError("Registry expected.knownThreatCountTotal must be null unless every row has an exact threat count.");
}
const affectedPollingLocationsTotal = rows.reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0);
if (registry.expected?.affectedPollingLocationsTotal !== affectedPollingLocationsTotal) {
  addError("Registry expected.affectedPollingLocationsTotal does not match normalized rows.");
}

if (!Array.isArray(inventory.stateCoverage)) {
  addError("Source inventory stateCoverage must be an array.");
}
const inventoryStates = new Set();
for (const entry of inventory.stateCoverage ?? []) {
  if (inventoryStates.has(entry.state)) {
    addError(`Duplicate source inventory state: ${entry.state}.`);
  }
  inventoryStates.add(entry.state);
  if (!expectedStates.has(entry.state)) {
    addError(`Unsupported source inventory state: ${entry.state}.`);
  }
  if (!allowedCoverageStatuses.has(entry.status)) {
    addError(`${entry.state} has invalid source inventory status ${entry.status}.`);
  }
  if (entry.status !== "needs_data") {
    for (const url of entry.sourceUrls ?? []) {
      validateOfficialUrl(url, `${entry.state} inventory sourceUrl`);
    }
    for (const artifact of entry.localArtifacts ?? []) {
      try {
        await access(artifact);
      } catch {
        addError(`${entry.state} inventory artifact does not exist: ${artifact}.`);
      }
    }
  }
}

for (const state of expectedStates) {
  if (!inventoryStates.has(state)) {
    addError(`Missing source inventory coverage entry for ${state}.`);
  }
}
if (inventoryStates.size !== expectedStates.size) {
  addError(`Source inventory must contain ${expectedStates.size} configured states; found ${inventoryStates.size}.`);
}
if (inventory.expected?.configuredStates !== expectedStates.size) {
  addError("Source inventory expected.configuredStates does not match state metadata.");
}
if (inventory.expected?.normalizedEventRows !== rows.length) {
  addError("Source inventory expected.normalizedEventRows does not match the registry.");
}

for (const context of inventory.nationalContext ?? []) {
  validateOfficialUrl(context.sourceUrl, `${context.sourceAuthority ?? "national context"} sourceUrl`);
  if (context.localArtifact === null && !/blocked/i.test(context.acquisitionStatus ?? "")) {
    addError(`${context.sourceAuthority ?? "National context"} needs a local artifact or an explicit blocked acquisition status.`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${rows.length} security incident rows and ${inventoryStates.size} state coverage entries.`);
}

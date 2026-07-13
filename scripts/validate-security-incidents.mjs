import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { stateCodes } from "./state-metadata.mjs";

const registry = JSON.parse(await readFile("data/election-security-incidents-2024.json", "utf8"));
const inventory = JSON.parse(await readFile("data/election-security-incident-source-inventory-2024.json", "utf8"));
const errors = [];
const expectedStates = new Set(stateCodes());
const allowedCoverageStatuses = new Set(["loaded", "partial", "needs_data"]);
const allowedAffectedLocationUnits = new Set(["election_office", "polling_location", "voting_precinct"]);
const allowedSourceTiers = new Set(["official", "supplemental"]);
const allowedSourceStatuses = new Set(["official_county_record", "supplemental_national_compilation"]);
const allowedThreatCountBases = new Set([
  "official_county_record",
  "supplemental_national_compilation",
  "not_separately_published",
]);
const officialHostPattern = /(^|\.)(gov|mil)$/i;
const officialNonGovHosts = new Set(["chesco.org", "www.chesco.org"]);
const supplementalHosts = new Set(["nbcnews.com", "www.nbcnews.com"]);

function addError(message) {
  errors.push(message);
}

function sourceHost(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      addError(`${label} must use HTTPS.`);
    }
    return url.hostname.toLowerCase();
  } catch {
    addError(`${label} is not a valid URL.`);
    return null;
  }
}

function isOfficialHost(host) {
  return officialHostPattern.test(host) || officialNonGovHosts.has(host);
}
function validatePrimarySourceUrl(value, tier, label) {
  const host = sourceHost(value, label);
  if (!host) return;
  if (tier === "official" && !isOfficialHost(host)) {
    addError(`${label} must use a reviewed official host; received ${host}.`);
  }
  if (tier === "supplemental" && !supplementalHosts.has(host)) {
    addError(`${label} must use a reviewed supplemental host; received ${host}.`);
  }
}

function validateKnownSourceUrl(value, label) {
  const host = sourceHost(value, label);
  if (host && !isOfficialHost(host) && !supplementalHosts.has(host)) {
    addError(`${label} must use a reviewed official or supplemental host; received ${host}.`);
  }
}

if (registry.schemaVersion !== 3 || registry.electionYear !== 2024 || registry.reportingGrain !== "county") {
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
    "affectedLocationUnit",
    "sourceAuthority",
    "sourceTitle",
    "sourceUrl",
    "localArtifact",
    "normalizationPath",
    "sourceTier",
    "sourceStatus",
    "threatCountBasis",
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
  if (!allowedThreatCountBases.has(row.threatCountBasis)) {
    addError(`${label} has unsupported threatCountBasis ${row.threatCountBasis}.`);
  }
  if (row.threatCount !== null && (!row.threatCountSourceUrl || !row.threatCountLocalArtifact)) {
    addError(`${label} needs a threat count source URL and local artifact when threatCount is known.`);
  }
  if (row.threatCount === null && row.threatCountBasis !== "not_separately_published") {
    addError(`${label} with an unknown threatCount must use not_separately_published.`);
  }
  if (row.affectedLocations !== null && (!Number.isInteger(row.affectedLocations) || row.affectedLocations < 1)) {
    addError(`${label} affectedLocations must be null or a positive integer.`);
  }
  if (!allowedAffectedLocationUnits.has(row.affectedLocationUnit)) {
    addError(`${label} has unsupported affectedLocationUnit ${row.affectedLocationUnit}.`);
  }
  if (!Array.isArray(row.namedLocations) || row.namedLocations.some((name) => typeof name !== "string" || !name.trim())) {
    addError(`${label} namedLocations must be an array of non-empty strings.`);
  }
  if (!allowedSourceTiers.has(row.sourceTier) || !allowedSourceStatuses.has(row.sourceStatus)) {
    addError(`${label} has unsupported source tier or status.`);
  }
  if (row.sourceTier === "official" && row.sourceStatus !== "official_county_record") {
    addError(`${label} official rows must use official_county_record status.`);
  }
  if (row.sourceTier === "supplemental" && row.sourceStatus !== "supplemental_national_compilation") {
    addError(`${label} supplemental rows must use supplemental_national_compilation status.`);
  }
  if (row.hoursExtended !== null && (!Number.isFinite(row.hoursExtended) || row.hoursExtended <= 0)) {
    addError(`${label} hoursExtended must be null or a positive number.`);
  }
  if (!/not evidence of fraud or misconduct/i.test(row.caveat ?? "")) {
    addError(`${label} caveat must say the row is not evidence of fraud or misconduct.`);
  }
  validatePrimarySourceUrl(row.sourceUrl, row.sourceTier, `${label} sourceUrl`);
  if (row.threatCountSourceUrl) validateKnownSourceUrl(row.threatCountSourceUrl, `${label} threatCountSourceUrl`);
  for (const [index, url] of (row.supportingSourceUrls ?? []).entries()) {
    validateKnownSourceUrl(url, `${label} supportingSourceUrls[${index}]`);
  }
  for (const artifact of [row.localArtifact, row.threatCountLocalArtifact, ...(row.supportingLocalArtifacts ?? [])].filter(Boolean)) {
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
if (registry.expected?.countyCount !== new Set(rows.map((row) => row.jurisdictionTag)).size) {
  addError("Registry expected.countyCount does not match normalized rows.");
}
const completeThreatCountRows = rows.filter((row) => row.threatCount !== null).length;
if (registry.expected?.completeThreatCountRows !== completeThreatCountRows) {
  addError("Registry expected.completeThreatCountRows does not match normalized rows.");
}
const unknownThreatCountRows = rows.length - completeThreatCountRows;
if (registry.expected?.unknownThreatCountRows !== unknownThreatCountRows) {
  addError("Registry expected.unknownThreatCountRows does not match normalized rows.");
}
const knownThreatCountMinimum = rows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
if (registry.expected?.knownThreatCountMinimum !== knownThreatCountMinimum) {
  addError("Registry expected.knownThreatCountMinimum does not match normalized rows.");
}
if (registry.expected?.publishedCompilationLocationCount !== 67 || registry.expected?.publishedCompilationCountyCount !== 19) {
  addError("Registry must preserve the sourced 67-location, 19-county published compilation headline.");
}
const affectedLocationUnitTotals = Object.fromEntries(
  Array.from(allowedAffectedLocationUnits)
    .map((unit) => [
      unit,
      rows
        .filter((row) => row.affectedLocationUnit === unit)
        .reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0),
    ])
    .filter(([, total]) => total > 0),
);
if (JSON.stringify(registry.expected?.affectedLocationUnitTotals) !== JSON.stringify(affectedLocationUnitTotals)) {
  addError("Registry expected.affectedLocationUnitTotals must preserve source-specific affected units.");
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
      validateKnownSourceUrl(url, `${entry.state} inventory sourceUrl`);
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
if (inventory.expected?.statesWithNormalizedRows !== new Set(rows.map((row) => row.state)).size) {
  addError("Source inventory expected.statesWithNormalizedRows does not match the registry.");
}
if (inventory.expected?.mappedCompilationCountyCount !== 19 || inventory.expected?.additionalOfficialCountyRows !== 1) {
  addError("Source inventory must distinguish 19 compiled counties from the additional official Pima row.");
}

for (const context of inventory.nationalContext ?? []) {
  const label = context.sourceAuthority ?? "National context";
  validatePrimarySourceUrl(context.sourceUrl, context.sourceTier ?? "official", `${label} sourceUrl`);
  if (context.localArtifact === null && !/blocked/i.test(context.acquisitionStatus ?? "")) {
    addError(`${label} needs a local artifact or an explicit blocked acquisition status.`);
  }
  if (context.localArtifact !== null) {
    if (!/^[a-f0-9]{64}$/i.test(context.sha256 ?? "")) {
      addError(`${label} local artifact needs a reviewed SHA-256.`);
    }
    try {
      const artifact = await readFile(context.localArtifact);
      const actualSha256 = createHash("sha256").update(artifact).digest("hex");
      if (actualSha256 !== context.sha256?.toLowerCase()) {
        addError(`${label} local artifact SHA-256 does not match ${context.localArtifact}.`);
      }
    } catch {
      addError(`${label} local artifact does not exist: ${context.localArtifact}.`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${rows.length} security incident rows and ${inventoryStates.size} state coverage entries.`);
}

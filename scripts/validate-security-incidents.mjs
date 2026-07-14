import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { stateCodes } from "./state-metadata.mjs";

const registry = JSON.parse(await readFile("data/election-security-incidents-2024.json", "utf8"));
const inventory = JSON.parse(await readFile("data/election-security-incident-source-inventory-2024.json", "utf8"));
const tracker = JSON.parse(await readFile("data/brennan-2024-election-bomb-threat-tracker.json", "utf8"));
const errors = [];
const expectedStates = new Set(stateCodes());
const allowedCoverageStatuses = new Set(["loaded", "partial", "needs_data"]);
const allowedAffectedLocationUnits = new Set([
  "election_facility",
  "election_office",
  "polling_location",
  "voting_precinct",
]);
const allowedSourceTiers = new Set(["official", "supplemental"]);
const allowedSourceStatuses = new Set([
  "official_county_record",
  "official_state_record",
  "research_compilation",
  "supplemental_earlier_compilation",
  "supplemental_national_compilation",
]);
const allowedThreatCountBases = new Set([
  "official_county_record",
  "research_tracker_compilation",
  "supplemental_national_compilation",
  "not_separately_published",
]);
const officialHostPattern = /(^|\.)(gov|mil)$/i;
const officialNonGovHosts = new Set([
  "chesco.org",
  "www.chesco.org",
  "pacourts.us",
  "www.pacourts.us",
]);
const supplementalHosts = new Set([
  "brennancenter.org",
  "www.brennancenter.org",
  "nbcnews.com",
  "www.nbcnews.com",
]);

function addError(message) {
  errors.push(message);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    addError(`${label}: expected ${expected}; found ${actual}.`);
  }
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

function validateReviewedSourceUrl(value, label) {
  const host = sourceHost(value, label);
  if (host && !isOfficialHost(host) && !supplementalHosts.has(host)) {
    addError(`${label} must use a reviewed official or supplemental host; received ${host}.`);
  }
}

async function validateArtifact(localArtifact, label, expectedSha256) {
  if (!localArtifact) {
    addError(`${label} needs a local artifact.`);
    return;
  }
  try {
    const artifact = await readFile(localArtifact);
    if (expectedSha256 !== undefined) {
      if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? "")) {
        addError(`${label} needs a reviewed SHA-256.`);
        return;
      }
      const actualSha256 = createHash("sha256").update(artifact).digest("hex");
      if (actualSha256 !== expectedSha256.toLowerCase()) {
        addError(`${label} SHA-256 does not match ${localArtifact}.`);
      }
    }
  } catch {
    addError(`${label} local artifact does not exist: ${localArtifact}.`);
  }
}

if (
  registry.schemaVersion !== 5
  || registry.electionYear !== 2024
  || registry.reportingGrain !== "mixed_county_and_statewide_unspecified"
) {
  addError("Incident registry must describe mixed county and statewide-unspecified 2024 rows.");
}
if (
  registry.reportingWindow?.start !== "2024-11-05"
  || registry.reportingWindow?.end !== "2024-11-09"
) {
  addError("Incident registry must preserve the November 5-9, 2024 reporting window.");
}
if (!Array.isArray(registry.incidentRows)) {
  addError("incidentRows must be an array.");
}
if (!/not an official FBI roster/i.test(registry.caveat ?? "") || !/may not be exhaustive/i.test(registry.caveat ?? "")) {
  addError("Registry caveat must identify the tracker as non-FBI and potentially non-exhaustive.");
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
    "jurisdictionTag",
    "reportingGrain",
    "eventDate",
    "eventType",
    "eventTypeLabel",
    "disruptionType",
    "disruptionLabel",
    "affectedLocationUnit",
    "sourceAuthority",
    "sourceTitle",
    "sourcePublishedAt",
    "sourceUrl",
    "localArtifact",
    "normalizationPath",
    "sourceTier",
    "sourceStatus",
    "threatCountBasis",
    "confidence",
    "caveat",
  ]) {
    if (!row[field]) {
      addError(`${label} is missing ${field}.`);
    }
  }

  if (!expectedStates.has(row.state)) {
    addError(`${label} has unsupported state ${row.state}.`);
  }
  if (row.electionYear !== 2024) {
    addError(`${label} must be a 2024 row.`);
  }
  if (row.reportingGrain === "county") {
    if (!/^\d{5}$/.test(row.jurisdictionCode ?? "")) {
      addError(`${label} county row needs a five-digit jurisdictionCode.`);
    }
    if (!/^county:\d{5}$/.test(row.jurisdictionTag ?? "")) {
      addError(`${label} county row must use a county:<GEOID> jurisdictionTag.`);
    }
    if (row.jurisdictionTag !== `county:${row.jurisdictionCode}`) {
      addError(`${label} jurisdictionCode and jurisdictionTag do not match.`);
    }
  } else if (row.reportingGrain === "statewide_unspecified") {
    if (row.jurisdictionCode !== null) {
      addError(`${label} statewide-unspecified row must have a null jurisdictionCode.`);
    }
    if (row.jurisdictionTag !== `state:${row.state}:unspecified`) {
      addError(`${label} statewide-unspecified row must use state:<STATE>:unspecified.`);
    }
    if (row.county !== "County not specified") {
      addError(`${label} statewide-unspecified row must not claim a county.`);
    }
  } else {
    addError(`${label} has unsupported reportingGrain ${row.reportingGrain}.`);
  }

  if (
    !/^2024-11-\d{2}$/.test(row.eventDate ?? "")
    || row.eventDate < registry.reportingWindow.start
    || row.eventDate > registry.reportingWindow.end
  ) {
    addError(`${label} eventDate must fall inside the reporting window.`);
  }
  if (row.threatCount !== null && (!Number.isInteger(row.threatCount) || row.threatCount < 1)) {
    addError(`${label} threatCount must be null or a positive integer.`);
  }
  if (!allowedThreatCountBases.has(row.threatCountBasis)) {
    addError(`${label} has unsupported threatCountBasis ${row.threatCountBasis}.`);
  }
  if (row.threatCount !== null && (!row.threatCountSourceUrl || !row.threatCountLocalArtifact)) {
    addError(`${label} needs a threat-count source URL and local artifact when threatCount is known.`);
  }
  if (row.threatCount === null && row.threatCountBasis !== "not_separately_published") {
    addError(`${label} with an unknown threatCount must use not_separately_published.`);
  }
  if (row.threatCountBasis === "research_tracker_compilation") {
    const host = sourceHost(row.threatCountSourceUrl, `${label} threatCountSourceUrl`);
    if (host && !supplementalHosts.has(host)) {
      addError(`${label} research tracker count must point to the reviewed tracker host.`);
    }
  } else if (row.threatCountSourceUrl) {
    validateReviewedSourceUrl(row.threatCountSourceUrl, `${label} threatCountSourceUrl`);
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
  if (!Array.isArray(row.supportingSourceUrls)) {
    addError(`${label} supportingSourceUrls must be an array.`);
  }
  if (!allowedSourceTiers.has(row.sourceTier) || !allowedSourceStatuses.has(row.sourceStatus)) {
    addError(`${label} has unsupported source tier or status.`);
  }
  if (row.sourceTier === "official") {
    const expectedOfficialStatus = row.reportingGrain === "county"
      ? "official_county_record"
      : "official_state_record";
    if (row.sourceStatus !== expectedOfficialStatus) {
      addError(`${label} official ${row.reportingGrain} row must use ${expectedOfficialStatus} status.`);
    }
  }
  if (
    row.sourceTier === "supplemental"
    && (row.sourceStatus === "official_county_record" || row.sourceStatus === "official_state_record")
  ) {
    addError(`${label} supplemental rows cannot use an official-record status.`);
  }
  if (row.sourceStatus === "research_compilation" && row.threatCountBasis !== "research_tracker_compilation") {
    addError(`${label} research compilation row must use research_tracker_compilation.`);
  }
  if (row.hoursExtended !== null && (!Number.isFinite(row.hoursExtended) || row.hoursExtended <= 0)) {
    addError(`${label} hoursExtended must be null or a positive number.`);
  }
  if (!/not evidence of fraud or misconduct/i.test(row.caveat ?? "")) {
    addError(`${label} caveat must say the row is not evidence of fraud or misconduct.`);
  }

  validatePrimarySourceUrl(row.sourceUrl, row.sourceTier, `${label} sourceUrl`);
  for (const [index, url] of (row.supportingSourceUrls ?? []).entries()) {
    sourceHost(url, `${label} supportingSourceUrls[${index}]`);
  }
  for (const artifact of new Set(
    [row.localArtifact, row.threatCountLocalArtifact, ...(row.supportingLocalArtifacts ?? [])].filter(Boolean),
  )) {
    try {
      await access(artifact);
    } catch {
      addError(`${label} local artifact does not exist: ${artifact}.`);
    }
  }
}

const rows = registry.incidentRows ?? [];
const countyRows = rows.filter((row) => row.reportingGrain === "county");
const statewideRows = rows.filter((row) => row.reportingGrain === "statewide_unspecified");
const completeThreatCountRows = rows.filter((row) => row.threatCount !== null).length;
const knownThreatCountMinimum = rows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
const statewideUnspecifiedThreatCount = statewideRows.reduce((sum, row) => sum + row.threatCount, 0);
expectEqual(rows.length, 111, "Normalized incident row count");
expectEqual(new Set(rows.map((row) => row.state)).size, 9, "Normalized state count");
expectEqual(countyRows.length, 109, "County row count");
expectEqual(new Set(countyRows.map((row) => row.jurisdictionTag)).size, 109, "Mapped county count");
expectEqual(statewideRows.length, 2, "Statewide-unspecified row count");
expectEqual(statewideUnspecifiedThreatCount, 66, "Statewide-unspecified threat count");
expectEqual(completeThreatCountRows, 110, "Rows with published threat counts");
expectEqual(rows.length - completeThreatCountRows, 1, "Rows without a published count");
expectEqual(knownThreatCountMinimum, 227, "Known threat-count minimum");

for (const [field, actual] of Object.entries({
  rowCount: rows.length,
  stateCount: new Set(rows.map((row) => row.state)).size,
  countyCount: new Set(countyRows.map((row) => row.jurisdictionTag)).size,
  countyRowCount: countyRows.length,
  statewideUnspecifiedRowCount: statewideRows.length,
  statewideUnspecifiedThreatCount,
  completeThreatCountRows,
  unknownThreatCountRows: rows.length - completeThreatCountRows,
  knownThreatCountMinimum,
  officialRowCount: rows.filter((row) => row.sourceTier === "official").length,
})) {
  expectEqual(registry.expected?.[field], actual, `Registry expected.${field}`);
}

const earlierRows = rows.filter((row) => row.sourceStatus === "supplemental_earlier_compilation");
expectEqual(earlierRows.length, 1, "Additional earlier-compilation county rows");
if (earlierRows[0]?.county !== "Milwaukee County" || earlierRows[0]?.threatCount !== null) {
  addError("The additional earlier-compilation row must retain Milwaukee with an unknown count.");
}
expectEqual(
  registry.expected?.additionalEarlierCompilationCountyRows,
  earlierRows.length,
  "Registry expected.additionalEarlierCompilationCountyRows",
);

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

if (
  tracker.schemaVersion !== 1
  || tracker.electionYear !== 2024
  || !Array.isArray(tracker.rows)
  || tracker.reportingWindow?.start !== "2024-11-05"
  || tracker.reportingWindow?.end !== "2024-11-09"
) {
  addError("Tracker capture must be a schema-1 November 5-9, 2024 artifact.");
}
if (!/not an official FBI roster/i.test(tracker.caveat ?? "") || !/may not be exhaustive/i.test(tracker.caveat ?? "")) {
  addError("Tracker caveat must identify the compilation as non-FBI and potentially non-exhaustive.");
}
const trackerRows = tracker.rows ?? [];
const trackerCountyRows = trackerRows.filter((row) => row.reportingGrain === "county");
const trackerStatewideRows = trackerRows.filter((row) => row.reportingGrain === "statewide_unspecified");
const trackerThreatCount = trackerRows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
expectEqual(trackerRows.length, 110, "Tracker row count");
expectEqual(new Set(trackerRows.map((row) => row.state)).size, 9, "Tracker state count");
expectEqual(trackerCountyRows.length, 108, "Tracker county row count");
expectEqual(new Set(trackerCountyRows.map((row) => row.jurisdictionTag)).size, 108, "Tracker county count");
expectEqual(trackerStatewideRows.length, 2, "Tracker statewide-unspecified row count");
expectEqual(trackerThreatCount, 227, "Tracker threat count");
for (const [field, actual] of Object.entries({
  rowCount: trackerRows.length,
  stateCount: new Set(trackerRows.map((row) => row.state)).size,
  countyRowCount: trackerCountyRows.length,
  countyCount: new Set(trackerCountyRows.map((row) => row.jurisdictionTag)).size,
  statewideUnspecifiedRowCount: trackerStatewideRows.length,
  reportedThreatCount: trackerThreatCount,
})) {
  expectEqual(tracker.expected?.[field], actual, `Tracker expected.${field}`);
}
validatePrimarySourceUrl(tracker.sourceUrl, "supplemental", "Tracker sourceUrl");
await validateArtifact(tracker.localArtifact, "Tracker", tracker.sha256);

const registryTrackerKeys = new Set(
  rows
    .filter((row) => row.threatCountBasis === "research_tracker_compilation")
    .map((row) => [row.state, row.eventDate, row.jurisdictionTag, row.threatCount].join("|")),
);
for (const trackerRow of trackerRows) {
  const label = `Tracker row ${trackerRow.state} ${trackerRow.sourceCounty}`;
  if (!expectedStates.has(trackerRow.state)) {
    addError(`${label} has unsupported state.`);
  }
  if (!Number.isInteger(trackerRow.threatCount) || trackerRow.threatCount < 1) {
    addError(`${label} must contain a positive threatCount.`);
  }
  if (!Array.isArray(trackerRow.sourceUrls) || trackerRow.sourceUrls.length === 0) {
    addError(`${label} must preserve at least one underlying public source URL.`);
  }
  for (const [index, url] of (trackerRow.sourceUrls ?? []).entries()) {
    sourceHost(url, `${label} sourceUrls[${index}]`);
  }
  if (trackerRow.reportingGrain === "county") {
    if (!/^county:\d{5}$/.test(trackerRow.jurisdictionTag ?? "")) {
      addError(`${label} must resolve to a canonical county tag.`);
    }
  } else if (
    trackerRow.reportingGrain !== "statewide_unspecified"
    || trackerRow.jurisdictionCode !== null
    || trackerRow.jurisdictionTag !== `state:${trackerRow.state}:unspecified`
  ) {
    addError(`${label} has invalid statewide-unspecified geography.`);
  }
  const key = [trackerRow.state, trackerRow.eventDate, trackerRow.jurisdictionTag, trackerRow.threatCount].join("|");
  if (!registryTrackerKeys.has(key)) {
    addError(`${label} does not have a matching normalized registry row.`);
  }
}

if (!Array.isArray(inventory.stateCoverage)) {
  addError("Source inventory stateCoverage must be an array.");
}
if (
  inventory.schemaVersion !== 4
  || inventory.reportingGrain !== "mixed_county_and_statewide_unspecified"
  || inventory.reportingWindow?.start !== "2024-11-05"
  || inventory.reportingWindow?.end !== "2024-11-09"
) {
  addError("Source inventory must describe the mixed-grain November 5-9 reporting window.");
}
if (!/not an official FBI roster/i.test(inventory.caveat ?? "") || !/may not be exhaustive/i.test(inventory.caveat ?? "")) {
  addError("Inventory caveat must identify the tracker as non-FBI and potentially non-exhaustive.");
}

const rowsByState = new Map();
for (const row of rows) {
  const stateRows = rowsByState.get(row.state) ?? [];
  stateRows.push(row);
  rowsByState.set(row.state, stateRows);
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
  const stateRows = rowsByState.get(entry.state) ?? [];
  if (stateRows.length > 0) {
    expectEqual(entry.expectedRowCount, stateRows.length, `${entry.state} inventory expectedRowCount`);
    expectEqual(
      entry.mappedCountyCount,
      new Set(stateRows.filter((row) => row.reportingGrain === "county").map((row) => row.jurisdictionTag)).size,
      `${entry.state} inventory mappedCountyCount`,
    );
    expectEqual(
      entry.statewideUnspecifiedThreatCount,
      stateRows
        .filter((row) => row.reportingGrain === "statewide_unspecified")
        .reduce((sum, row) => sum + row.threatCount, 0),
      `${entry.state} inventory statewideUnspecifiedThreatCount`,
    );
    const expectedSourceAuthorities = new Set(stateRows.flatMap((row) => [
      row.sourceAuthority,
      row.threatCountSourceUrl === tracker.sourceUrl ? tracker.sourceAuthority : null,
    ]).filter(Boolean));
    for (const authority of expectedSourceAuthorities) {
      if (!entry.sourceAuthorities?.includes(authority)) {
        addError(`${entry.state} inventory is missing source authority: ${authority}.`);
      }
    }
  }
  if (entry.status !== "needs_data") {
    for (const url of entry.sourceUrls ?? []) {
      validateReviewedSourceUrl(url, `${entry.state} inventory sourceUrl`);
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
expectEqual(inventoryStates.size, expectedStates.size, "Source inventory configured-state count");
for (const [field, actual] of Object.entries({
  configuredStates: expectedStates.size,
  statesWithNormalizedRows: rowsByState.size,
  normalizedEventRows: rows.length,
  mappedCountyCount: new Set(countyRows.map((row) => row.jurisdictionTag)).size,
  statewideUnspecifiedRowCount: statewideRows.length,
  knownThreatCountMinimum,
  officialRowCount: rows.filter((row) => row.sourceTier === "official").length,
  reviewedOfficialSourceCount: inventory.reviewedOfficialSources?.length ?? 0,
  trackerRowCount: trackerRows.length,
  trackerCountyCount: new Set(trackerCountyRows.map((row) => row.jurisdictionTag)).size,
  trackerThreatCount,
  additionalEarlierCompilationCountyRows: earlierRows.length,
})) {
  expectEqual(inventory.expected?.[field], actual, `Inventory expected.${field}`);
}

if (!Array.isArray(inventory.reviewedOfficialSources)) {
  addError("Source inventory reviewedOfficialSources must be an array.");
} else {
  expectEqual(inventory.reviewedOfficialSources.length, 2, "Reviewed official source count");
  for (const source of inventory.reviewedOfficialSources) {
    const label = source.sourceAuthority ?? "Reviewed official source";
    if (
      source.electionYear !== 2024
      || source.sourceTier !== "official"
      || source.expectedRowCount !== 1
      || !source.normalizationPath
      || !source.caveat
    ) {
      addError(`${label} needs complete official-source provenance metadata.`);
    }
    validatePrimarySourceUrl(source.sourceUrl, "official", `${label} sourceUrl`);
    await validateArtifact(source.localArtifact, label, source.sha256);
  }
}

const minnesotaStatewide = rows.find(
  (row) => row.state === "MN" && row.reportingGrain === "statewide_unspecified",
);
if (
  !minnesotaStatewide
  || minnesotaStatewide.threatCount !== 47
  || minnesotaStatewide.sourceStatus !== "official_state_record"
  || minnesotaStatewide.jurisdictionCode !== null
  || !/does not publish an exact count or name the counties/i.test(minnesotaStatewide.caveat)
) {
  addError("Minnesota must retain all 47 tracker threats at statewide-unspecified grain with the official state-source limitation.");
}

const philadelphia = rows.find((row) => row.county === "Philadelphia County");
if (
  !philadelphia
  || philadelphia.threatCount !== 10
  || philadelphia.affectedLocations !== 6
  || philadelphia.affectedLocationUnit !== "polling_location"
  || philadelphia.namedLocations?.length !== 6
  || philadelphia.sourceStatus !== "official_county_record"
) {
  addError("Philadelphia must preserve 10 tracker threats separately from six polling locations named in the official court record.");
}

for (const context of inventory.nationalContext ?? []) {
  const label = context.sourceAuthority ?? "National context";
  validatePrimarySourceUrl(context.sourceUrl, context.sourceTier ?? "official", `${label} sourceUrl`);
  if (context.localArtifact === null && !/blocked/i.test(context.acquisitionStatus ?? "")) {
    addError(`${label} needs a local artifact or an explicit blocked acquisition status.`);
  }
  if (context.localArtifact !== null) {
    await validateArtifact(context.localArtifact, label, context.sha256);
  }
}

const trackerContext = (inventory.nationalContext ?? []).find(
  (context) => context.sourceUrl === tracker.sourceUrl,
);
if (!trackerContext) {
  addError("Source inventory must include the Brennan Center tracker as national context.");
} else {
  expectEqual(trackerContext.reportedThreatCount, 227, "Tracker context reportedThreatCount");
  expectEqual(trackerContext.reportedCountyCount, 108, "Tracker context reportedCountyCount");
  expectEqual(trackerContext.reportedStateCount, 9, "Tracker context reportedStateCount");
  expectEqual(trackerContext.statewideUnspecifiedThreatCount, 66, "Tracker context statewideUnspecifiedThreatCount");
  if (trackerContext.sha256 !== tracker.sha256) {
    addError("Tracker context SHA-256 must match the extracted tracker capture.");
  }
}
const fbiContext = (inventory.nationalContext ?? []).find(
  (context) => context.sourceAuthority === "Federal Bureau of Investigation",
);
if (!fbiContext || fbiContext.reportedThreatCount !== undefined || fbiContext.reportedCountyCount !== undefined) {
  addError("FBI context must not claim a national count or county roster that the statement does not publish.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${rows.length} security incident rows, ${trackerThreatCount} tracker threats, and ${inventoryStates.size} state coverage entries.`,
  );
}

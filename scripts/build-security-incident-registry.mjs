import { readFile, writeFile } from "node:fs/promises";

const registryPath = "data/election-security-incidents-2024.json";
const inventoryPath = "data/election-security-incident-source-inventory-2024.json";
const trackerPath = "data/brennan-2024-election-bomb-threat-tracker.json";
const senateArtifact = "data/us-2024-election-day-bomb-threats-senate-letter.pdf";
const fbiArtifact = "data/fbi-2024-bomb-threats-polling-locations.html";

const senateUrl =
  "https://www.warnock.senate.gov/wp-content/uploads/2024/12/12.11.2024-Letter-to-ODNI-CISA-FBI-re-Election-Interference.pdf";
const fbiUrl =
  "https://www.fbi.gov/news/press-releases/fbi-statement-on-bomb-threats-to-polling-locations";

const officialRowIds = new Map([
  ["GA|DeKalb County", "ga-2024-general-dekalb-bomb-threat-disruptions"],
  ["GA|Fulton County", "ga-2024-general-fulton-bomb-threat-disruptions"],
  ["PA|Chester County", "pa-2024-general-chester-bomb-threat-disruption"],
  ["AZ|Pima County", "az-2024-general-pima-bomb-threat-response"],
]);

const namedLocations = {
  "GA|Fulton County": [
    "Etris-Darnell Community Center",
    "C.H. Gullatt Elementary School",
    "Southwest Arts Center",
    "Northwood Elementary School",
    "Lake Forest Elementary School",
  ],
  "GA|DeKalb County": [
    "New Bethel AME Church",
    "North DeKalb Senior Center",
    "Reid H. Cofer Library",
    "Wesley Chapel Library",
    "New Life Community Center",
    "Briarwood Recreation Center",
  ],
};

function slug(value) {
  return value
    .toLowerCase()
    .replace(/ county$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const tracker = JSON.parse(await readFile(trackerPath, "utf8"));
const retainedRows = new Map(registry.incidentRows.map((row) => [row.id, row]));

function officialCaveat(key, threatCount) {
  if (key === "GA|Fulton County") {
    return `The official county minutes document several threats and five polling locations whose hours were extended after evacuations. The later Brennan Center tracker attributes ${threatCount} threats to Fulton County. Threat messages and affected polling places are different measures and are not added together. The five locations received different extensions from 10 to 45 minutes, so hoursExtended remains null. The tracker is a public-source compilation, not an FBI roster, and may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`;
  }
  if (key === "GA|DeKalb County") {
    return `The official county update identifies six active voting precincts that received bomb threats and two additional locations that were not current polling places. The later Brennan Center tracker attributes ${threatCount} threats to DeKalb County. Those source units differ, so threat messages and affected precincts are preserved separately. Voting was temporarily suspended and resumed after police sweeps; the page says an extension was being sought but does not confirm a final order, so hoursExtended remains null. The tracker is a public-source compilation, not an FBI roster, and may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`;
  }
  if (key === "PA|Chester County") {
    return `The official county release documents one emailed threat to the Government Services Center, an evacuation and K-9 sweep, and the temporary redirection of two polling places located in the building. The later Brennan Center tracker attributes ${threatCount} threat to Chester County. Locations and threat messages are different measures and are not added together. The tracker is a public-source compilation, not an FBI roster, and may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`;
  }
  return `The official Pima County after-action report documents an Election Day email naming the 240 N. Stone location and says police checked and cleared the site without a reported polling-place closure. The later Brennan Center tracker attributes ${threatCount} threats to Pima County based on multiple public reports, so the tracker count is shown separately from the one event detailed in the official extract. The tracker is not an FBI roster and may not be exhaustive. Direct scripted acquisition of the county PDF remained blocked, so the repository retains a structured official-source extract with the canonical URL. This row is administration context only and is not evidence of fraud or misconduct.`;
}

function officialRow(sourceRow) {
  const key = `${sourceRow.state}|${sourceRow.county}`;
  const id = officialRowIds.get(key);
  const row = id ? retainedRows.get(id) : null;
  if (!row) throw new Error(`Missing retained official row for ${key}.`);

  return {
    ...row,
    reportingGrain: "county",
    threatCount: sourceRow.threatCount,
    threatCountBasis: "research_tracker_compilation",
    threatCountSourceUrl: tracker.sourceUrl,
    threatCountLocalArtifact: tracker.localArtifact,
    namedLocations: namedLocations[key] ?? row.namedLocations ?? [],
    supportingSourceUrls: unique([
      ...row.supportingSourceUrls,
      tracker.sourceUrl,
      ...sourceRow.sourceUrls,
    ]),
    supportingLocalArtifacts: unique([
      ...row.supportingLocalArtifacts,
      tracker.localArtifact,
    ]),
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    sourceTier: "official",
    sourceStatus: "official_county_record",
    caveat: officialCaveat(key, sourceRow.threatCount),
  };
}

function trackerRow(sourceRow) {
  const isCounty = sourceRow.reportingGrain === "county";
  const geography = isCounty ? sourceRow.county : "County not specified";
  const afterElectionDay = sourceRow.eventDate !== "2024-11-05";

  return {
    id: isCounty
      ? `${sourceRow.state.toLowerCase()}-2024-${sourceRow.eventDate.slice(5)}-${slug(sourceRow.county)}-bomb-threat-tracker`
      : `${sourceRow.state.toLowerCase()}-2024-${sourceRow.eventDate.slice(5)}-statewide-unspecified-bomb-threat-tracker`,
    state: sourceRow.state,
    stateName: sourceRow.stateName,
    electionYear: 2024,
    county: geography,
    jurisdictionCode: sourceRow.jurisdictionCode,
    jurisdictionTag: sourceRow.jurisdictionTag,
    reportingGrain: sourceRow.reportingGrain,
    eventDate: sourceRow.eventDate,
    eventType: "bomb_threat",
    eventTypeLabel: sourceRow.threatCount === 1 ? "Bomb threat" : "Bomb threats",
    threatCount: sourceRow.threatCount,
    threatCountBasis: "research_tracker_compilation",
    threatCountSourceUrl: tracker.sourceUrl,
    threatCountLocalArtifact: tracker.localArtifact,
    affectedLocations: null,
    affectedLocationUnit: "election_facility",
    namedLocations: [],
    disruptionType: isCounty
      ? afterElectionDay
        ? "post_election_counting_period_threat_disruption_detail_varies"
        : "election_day_threat_disruption_detail_varies"
      : "statewide_threats_counties_not_specified",
    disruptionLabel: isCounty
      ? afterElectionDay
        ? "Threat documented during post-election counting; facility-level disruption varies by cited source"
        : "Election Day threat documented; facility-level disruption varies by cited source"
      : "Threats documented statewide; counties and facilities not specified in the tracker",
    hoursExtended: null,
    sourceAuthority: tracker.sourceAuthority,
    sourceTitle: tracker.sourceTitle,
    sourcePublishedAt: tracker.lastUpdated,
    sourceUrl: tracker.sourceUrl,
    supportingSourceUrls: sourceRow.sourceUrls,
    localArtifact: tracker.localArtifact,
    supportingLocalArtifacts: [],
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    sourceTier: "supplemental",
    sourceStatus: "research_compilation",
    confidence: "medium",
    caveat: isCounty
      ? `The Brennan Center's later public-source tracker attributes ${sourceRow.threatCount} ${sourceRow.threatCount === 1 ? "threat" : "threats"} to ${sourceRow.county} on ${sourceRow.eventDate}. The tracker links its underlying public reports but does not provide a verified site-by-site federal roster for this row and says its data may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`
      : `The Brennan Center's later public-source tracker attributes ${sourceRow.threatCount} threats to ${sourceRow.stateName} on ${sourceRow.eventDate} without naming counties. The count is included in state and national totals but is not painted onto a county polygon. The tracker is not an FBI roster and says its data may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`,
  };
}

const incidentRows = tracker.rows.map((sourceRow) => {
  const key = sourceRow.county ? `${sourceRow.state}|${sourceRow.county}` : null;
  return key && officialRowIds.has(key) ? officialRow(sourceRow) : trackerRow(sourceRow);
});

const milwaukee = retainedRows.get("wi-2024-general-milwaukee-bomb-threat-compilation");
if (!milwaukee) throw new Error("Missing retained Milwaukee compilation row.");
incidentRows.push({
  ...milwaukee,
  threatCount: null,
  threatCountBasis: "not_separately_published",
  threatCountSourceUrl: null,
  threatCountLocalArtifact: null,
  reportingGrain: "county",
  sourceTier: "supplemental",
  sourceStatus: "supplemental_earlier_compilation",
  normalizationPath: "scripts/build-security-incident-registry.mjs",
  supportingSourceUrls: unique([...milwaukee.supportingSourceUrls, senateUrl, fbiUrl]),
  supportingLocalArtifacts: unique([
    ...milwaukee.supportingLocalArtifacts,
    senateArtifact,
    fbiArtifact,
  ]),
  caveat:
    "The earlier NBC News Election Day compilation names Milwaukee County but does not expose a separate Milwaukee threat count in its accessible table. Milwaukee is not a county row in the later Brennan Center 227-threat tracker, so it remains mapped as an additional published county mention with an unknown count rather than being silently dropped or counted as zero. This row is administration context only and is not evidence of fraud or misconduct.",
});

incidentRows.sort(
  (left, right) =>
    left.state.localeCompare(right.state)
    || left.eventDate.localeCompare(right.eventDate)
    || left.reportingGrain.localeCompare(right.reportingGrain)
    || left.county.localeCompare(right.county)
    || left.id.localeCompare(right.id),
);

const countyRows = incidentRows.filter((row) => row.reportingGrain === "county");
const statewideRows = incidentRows.filter((row) => row.reportingGrain === "statewide_unspecified");
const knownThreatCountMinimum = incidentRows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
const statewideUnspecifiedThreatCount = statewideRows.reduce(
  (sum, row) => sum + (row.threatCount ?? 0),
  0,
);
const affectedLocationUnitTotals = Object.fromEntries(
  ["election_facility", "election_office", "polling_location", "voting_precinct"]
    .map((unit) => [
      unit,
      incidentRows
        .filter((row) => row.affectedLocationUnit === unit)
        .reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0),
    ])
    .filter(([, total]) => total > 0),
);

const nextRegistry = {
  schemaVersion: 4,
  description:
    "November 2024 election-period bomb-threat records normalized from the Brennan Center's later 227-threat public-source tracker, enriched with reviewed official county records and one additional earlier county mention whose count was not published.",
  electionYear: 2024,
  reportingGrain: "mixed_county_and_statewide_unspecified",
  reportingWindow: tracker.reportingWindow,
  normalizationPath: "scripts/build-security-incident-registry.mjs",
  expected: {
    rowCount: incidentRows.length,
    stateCount: new Set(incidentRows.map((row) => row.state)).size,
    countyCount: new Set(countyRows.map((row) => row.jurisdictionTag)).size,
    countyRowCount: countyRows.length,
    statewideUnspecifiedRowCount: statewideRows.length,
    statewideUnspecifiedThreatCount,
    completeThreatCountRows: incidentRows.filter((row) => row.threatCount !== null).length,
    unknownThreatCountRows: incidentRows.filter((row) => row.threatCount === null).length,
    knownThreatCountMinimum,
    trackerRowCount: tracker.expected.rowCount,
    trackerCountyCount: tracker.expected.countyCount,
    trackerThreatCount: tracker.expected.reportedThreatCount,
    additionalEarlierCompilationCountyRows: 1,
    affectedLocationUnitTotals,
  },
  caveat:
    "The later Brennan Center tracker documents at least 227 threats from November 5 through November 9, 2024 using publicly available sources and says it may not be exhaustive. It is not an official FBI roster. Two tracker rows contain 66 threats whose counties were not specified; they remain in totals without being assigned to county polygons. Milwaukee is retained from an earlier published Election Day compilation with an unknown count. Incident records are not evidence of fraud, misconduct, altered votes, or an incorrect election outcome.",
  incidentRows,
};

const rowsByState = new Map();
for (const row of incidentRows) {
  const rows = rowsByState.get(row.state) ?? [];
  rows.push(row);
  rowsByState.set(row.state, rows);
}

const stateCoverage = inventory.stateCoverage.map((entry) => {
  const rows = rowsByState.get(entry.state);
  if (!rows) return { ...entry, status: "needs_data" };
  const mappedRows = rows.filter((row) => row.reportingGrain === "county");
  const unallocatedRows = rows.filter((row) => row.reportingGrain === "statewide_unspecified");
  return {
    state: entry.state,
    stateName: entry.stateName,
    status: "partial",
    sourceAuthorities: unique(rows.map((row) => row.sourceAuthority)),
    sourceUrls: unique(rows.flatMap((row) => [row.sourceUrl, row.threatCountSourceUrl])),
    localArtifacts: unique(
      rows.flatMap((row) => [row.localArtifact, row.threatCountLocalArtifact]),
    ),
    expectedRowCount: rows.length,
    mappedCountyCount: new Set(mappedRows.map((row) => row.jurisdictionTag)).size,
    statewideUnspecifiedThreatCount: unallocatedRows.reduce(
      (sum, row) => sum + (row.threatCount ?? 0),
      0,
    ),
    confidence: rows.some((row) => row.sourceTier === "official")
      ? "mixed_official_detail_and_public_source_tracker"
      : "public_source_tracker",
    caveat: `${mappedRows.length} county row(s) are mapped for ${entry.stateName}. ${unallocatedRows.length ? `${unallocatedRows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0)} additional threats are retained only at statewide-unspecified grain. ` : ""}The Brennan Center tracker is not an FBI roster and may not be exhaustive.`,
  };
});

const retainedNationalContext = inventory.nationalContext
  .filter((context) => context.sourceAuthority !== tracker.sourceAuthority)
  .map((context) => ({
    ...context,
    scopeLabel: context.reportedLocationCount === 67
      ? "Earlier Election Day snapshot"
      : context.scopeLabel,
  }));

const nextInventory = {
  schemaVersion: 3,
  description:
    "Nationwide source inventory for November 2024 election-period bomb threats, centered on the Brennan Center's later 227-threat tracker with official federal context and reviewed county detail.",
  electionYear: 2024,
  reportingGrain: "mixed_county_and_statewide_unspecified",
  reportingWindow: tracker.reportingWindow,
  normalizationPath: "scripts/build-security-incident-registry.mjs",
  expected: {
    configuredStates: stateCoverage.length,
    statesWithNormalizedRows: rowsByState.size,
    normalizedEventRows: incidentRows.length,
    mappedCountyCount: new Set(countyRows.map((row) => row.jurisdictionTag)).size,
    statewideUnspecifiedRowCount: statewideRows.length,
    knownThreatCountMinimum,
    trackerRowCount: tracker.expected.rowCount,
    trackerCountyCount: tracker.expected.countyCount,
    trackerThreatCount: tracker.expected.reportedThreatCount,
    additionalEarlierCompilationCountyRows: 1,
  },
  caveat: nextRegistry.caveat,
  nationalContext: [
    ...retainedNationalContext,
    {
      sourceAuthority: tracker.sourceAuthority,
      sourceTitle: tracker.sourceTitle,
      sourceUrl: tracker.sourceUrl,
      localArtifact: tracker.localArtifact,
      sha256: tracker.sha256,
      acquiredAt: tracker.acquiredAt,
      electionYear: 2024,
      reportingGrain: "multi-state county and statewide-unspecified tracker",
      reportingWindow: tracker.reportingWindow,
      normalizationPath: tracker.normalizationPath,
      expectedRowCount: tracker.expected.rowCount,
      acquisitionStatus: "download_complete_text_layer_normalized",
      sourceTier: "supplemental",
      confidence: "high_for_tracker_transcription_medium_for_underlying_completeness",
      reportedThreatCount: tracker.expected.reportedThreatCount,
      reportedCountyCount: tracker.expected.countyCount,
      reportedStateCount: tracker.expected.stateCount,
      statewideUnspecifiedThreatCount,
      scopeLabel: "Later election-period tracker",
      caveat: tracker.caveat,
    },
  ],
  stateCoverage,
};

await writeFile(registryPath, JSON.stringify(nextRegistry, null, 2) + "\n");
await writeFile(inventoryPath, JSON.stringify(nextInventory, null, 2) + "\n");
console.log(
  `Built ${incidentRows.length} rows across ${rowsByState.size} states: ${countyRows.length} county rows and ${statewideRows.length} statewide-unspecified rows, with at least ${knownThreatCountMinimum} documented threats.`,
);

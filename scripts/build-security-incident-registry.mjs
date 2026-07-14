import { readFile, writeFile } from "node:fs/promises";

const registryPath = "data/election-security-incidents-2024.json";
const inventoryPath = "data/election-security-incident-source-inventory-2024.json";
const trackerPath = "data/brennan-2024-election-bomb-threat-tracker.json";
const senateArtifact = "data/us-2024-election-day-bomb-threats-senate-letter.pdf";
const fbiArtifact = "data/fbi-2024-bomb-threats-polling-locations.html";
const minnesotaArtifact = "data/mn-sos-2024-bomb-threats-county-election-offices.html";
const philadelphiaArtifact = "data/pa-2024-election-day-security-philadelphia-order.pdf";

const senateUrl =
  "https://www.warnock.senate.gov/wp-content/uploads/2024/12/12.11.2024-Letter-to-ODNI-CISA-FBI-re-Election-Interference.pdf";
const fbiUrl =
  "https://www.fbi.gov/news/press-releases/fbi-statement-on-bomb-threats-to-polling-locations";
const minnesotaUrl =
  "https://www.sos.mn.gov/about-the-office/news-room/statement-on-bomb-threats-to-county-election-offices/";
const philadelphiaUrl =
  "https://www.pacourts.us/Storage/media/pdfs/20241107/153927-nov.5%2C2024-order.pdf";

const reviewedOfficialSources = [
  {
    sourceAuthority: "Office of the Minnesota Secretary of State",
    sourceTitle: "Statement on Bomb Threats to County Election Offices",
    sourceUrl: minnesotaUrl,
    localArtifact: minnesotaArtifact,
    sha256: "b62067e1caa2817e9d9627c9d30feefd8a2a129b78f41a54d14b60b27c44f9b1",
    acquiredAt: "2026-07-14",
    electionYear: 2024,
    reportingGrain: "statewide_unspecified",
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    expectedRowCount: 1,
    acquisitionStatus: "download_complete_html_archived",
    sourceTier: "official",
    confidence: "high_for_statewide_scope_count_not_published",
    caveat:
      "The official statement confirms that election offices in over half of Minnesota counties received emailed bomb threats beginning November 8, 2024, but it does not publish an exact threat count or name the affected counties. The later tracker remains the source for the 47-threat count, which stays at statewide-unspecified grain.",
  },
  {
    sourceAuthority: "First Judicial District of Pennsylvania",
    sourceTitle: "Election Day order concerning polling divisions at 1013 Ellsworth Street",
    sourceUrl: philadelphiaUrl,
    localArtifact: philadelphiaArtifact,
    sha256: "9c2ecf30622665c22bd1bdde4d1875cde6427e487006f5f1293703fcf764b413",
    acquiredAt: "2026-07-14",
    electionYear: 2024,
    reportingGrain: "county",
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    expectedRowCount: 1,
    expectedAffectedLocationCount: 6,
    acquisitionStatus: "download_complete_image_pdf_visually_reviewed",
    sourceTier: "official",
    confidence: "high_for_named_locations_tracker_supplies_threat_count",
    caveat:
      "The official court record and attached threat email identify six Philadelphia polling locations and document a court-ordered extension at one address. The record does not independently establish the later tracker's 10-threat count, so threats and affected locations remain separate measures.",
  },
];

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

const philadelphiaLocations = [
  "Ji's Cafe Dining Room",
  "Mummers Museum",
  "Capitolo Recreation Center",
  "St. Maron's Church",
  "Columbus Square Recreation Center",
  "Hawthorne Recreation Center",
];

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

function sameSourceUrl(left, right) {
  try {
    const normalize = (value) => {
      const url = new URL(value);
      return `${url.origin}${decodeURIComponent(url.pathname)}${url.search}`;
    };
    return normalize(left) === normalize(right);
  } catch {
    return left === right;
  }
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

function philadelphiaOfficialRow(sourceRow) {
  return {
    id: "pa-2024-general-philadelphia-bomb-threat-order",
    state: sourceRow.state,
    stateName: sourceRow.stateName,
    electionYear: 2024,
    county: sourceRow.county,
    jurisdictionCode: sourceRow.jurisdictionCode,
    jurisdictionTag: sourceRow.jurisdictionTag,
    reportingGrain: "county",
    eventDate: sourceRow.eventDate,
    eventType: "bomb_threat",
    eventTypeLabel: "Bomb threats",
    threatCount: sourceRow.threatCount,
    threatCountBasis: "research_tracker_compilation",
    threatCountSourceUrl: tracker.sourceUrl,
    threatCountLocalArtifact: tracker.localArtifact,
    affectedLocations: philadelphiaLocations.length,
    affectedLocationUnit: "polling_location",
    namedLocations: philadelphiaLocations,
    disruptionType: "election_day_threats_polling_hours_extended",
    disruptionLabel: "Six polling locations named; one address received a court-ordered voting extension",
    hoursExtended: null,
    sourceAuthority: "First Judicial District of Pennsylvania",
    sourceTitle: "Election Day order concerning polling divisions at 1013 Ellsworth Street",
    sourcePublishedAt: "2024-11-05",
    sourceUrl: philadelphiaUrl,
    supportingSourceUrls: unique([
      tracker.sourceUrl,
      ...sourceRow.sourceUrls.filter((url) => !sameSourceUrl(url, philadelphiaUrl)),
    ]),
    localArtifact: philadelphiaArtifact,
    supportingLocalArtifacts: [tracker.localArtifact],
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    sourceTier: "official",
    sourceStatus: "official_county_record",
    confidence: "medium",
    caveat:
      `The official Philadelphia court record and attached threat email name ${philadelphiaLocations.length} polling locations. The order kept polling divisions at 1013 Ellsworth Street open until 8:23 p.m.; it does not establish that every named location closed or independently establish the later Brennan Center tracker's ${sourceRow.threatCount}-threat count. Threat messages and affected locations are different measures and are not added together. The tracker is not an FBI roster and may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`,
  };
}

function trackerRow(sourceRow) {
  const isCounty = sourceRow.reportingGrain === "county";
  const geography = isCounty ? sourceRow.county : "County not specified";
  const afterElectionDay = sourceRow.eventDate !== "2024-11-05";
  const georgiaStatewide = sourceRow.state === "GA" && !isCounty;

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
      : georgiaStatewide
        ? `The Brennan Center's later public-source tracker derives this ${sourceRow.threatCount}-threat Georgia row as the remainder of a reported statewide total after subtracting threats assigned to Clayton, DeKalb, Fulton, and Gwinnett Counties. The underlying statewide report does not identify counties for the remainder, so it stays in state and national totals without being painted onto county polygons. The tracker is not an FBI roster and may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`
        : `The Brennan Center's later public-source tracker attributes ${sourceRow.threatCount} threats to ${sourceRow.stateName} on ${sourceRow.eventDate} without naming counties. The count is included in state and national totals but is not painted onto a county polygon. The tracker is not an FBI roster and says its data may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`,
  };
}

function minnesotaOfficialStatewideRow(sourceRow) {
  return {
    ...trackerRow(sourceRow),
    disruptionLabel:
      "Official state statement confirms emailed threats across more than half of Minnesota counties; exact counties not published",
    sourceAuthority: "Office of the Minnesota Secretary of State",
    sourceTitle: "Statement on Bomb Threats to County Election Offices",
    sourcePublishedAt: "2024-11-12",
    sourceUrl: minnesotaUrl,
    supportingSourceUrls: unique([tracker.sourceUrl, ...sourceRow.sourceUrls]),
    localArtifact: minnesotaArtifact,
    supportingLocalArtifacts: [tracker.localArtifact],
    sourceTier: "official",
    sourceStatus: "official_state_record",
    confidence: "medium",
    caveat:
      `The Minnesota Secretary of State confirms that election offices in over half of the state's counties received emailed bomb threats beginning November 8, but the official statement does not publish an exact count or name the counties. The ${sourceRow.threatCount}-threat count comes from the later Brennan Center public-source tracker. Because no authoritative county list is published, all ${sourceRow.threatCount} remain at statewide-unspecified grain and are not painted onto county polygons. The tracker is not an FBI roster and may not be exhaustive. This row is administration context only and is not evidence of fraud or misconduct.`,
  };
}

const incidentRows = tracker.rows.map((sourceRow) => {
  const key = sourceRow.county ? `${sourceRow.state}|${sourceRow.county}` : null;
  if (key === "PA|Philadelphia County") return philadelphiaOfficialRow(sourceRow);
  if (sourceRow.state === "MN" && sourceRow.reportingGrain === "statewide_unspecified") {
    return minnesotaOfficialStatewideRow(sourceRow);
  }
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
  schemaVersion: 5,
  description:
    "November 2024 election-period bomb-threat records normalized from the Brennan Center's later 227-threat public-source tracker, enriched with reviewed official state and county records and one additional earlier county mention whose count was not published.",
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
    officialRowCount: incidentRows.filter((row) => row.sourceTier === "official").length,
    trackerRowCount: tracker.expected.rowCount,
    trackerCountyCount: tracker.expected.countyCount,
    trackerThreatCount: tracker.expected.reportedThreatCount,
    additionalEarlierCompilationCountyRows: 1,
    affectedLocationUnitTotals,
  },
  caveat:
    "The later Brennan Center tracker documents at least 227 threats from November 5 through November 9, 2024 using publicly available sources and says it may not be exhaustive. It is not an official FBI roster. Two tracker rows contain 66 threats whose counties were not specified; they remain in totals without being assigned to county polygons. Reviewed official records confirm Minnesota's broad statewide scope but do not publish its county list, and add Philadelphia facility detail without changing tracker threat totals. Milwaukee is retained from an earlier published Election Day compilation with an unknown count. Incident records are not evidence of fraud, misconduct, altered votes, or an incorrect election outcome.",
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
  const statewideCount = unallocatedRows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
  const hasOfficialRecord = rows.some((row) => row.sourceTier === "official");
  return {
    state: entry.state,
    stateName: entry.stateName,
    status: "partial",
    sourceAuthorities: unique(rows.flatMap((row) => [
      row.sourceAuthority,
      row.threatCountSourceUrl === tracker.sourceUrl ? tracker.sourceAuthority : null,
    ])),
    sourceUrls: unique(rows.flatMap((row) => [row.sourceUrl, row.threatCountSourceUrl])),
    localArtifacts: unique(
      rows.flatMap((row) => [row.localArtifact, row.threatCountLocalArtifact]),
    ),
    expectedRowCount: rows.length,
    mappedCountyCount: new Set(mappedRows.map((row) => row.jurisdictionTag)).size,
    statewideUnspecifiedThreatCount: statewideCount,
    confidence: hasOfficialRecord
      ? "mixed_official_detail_and_public_source_tracker"
      : "public_source_tracker",
    caveat: `${mappedRows.length} county row(s) are mapped for ${entry.stateName}. ${statewideCount ? `${statewideCount} additional threats are retained only at statewide-unspecified grain because an authoritative county list was not published. ` : ""}${hasOfficialRecord ? "Reviewed official records supplement the tracker's scope or facility detail. " : ""}The Brennan Center tracker is not an FBI roster and may not be exhaustive.`,
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
  schemaVersion: 4,
  description:
    "Nationwide source inventory for November 2024 election-period bomb threats, centered on the Brennan Center's later 227-threat tracker with official federal, state, and county context.",
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
    officialRowCount: incidentRows.filter((row) => row.sourceTier === "official").length,
    reviewedOfficialSourceCount: reviewedOfficialSources.length,
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
  reviewedOfficialSources,
  stateCoverage,
};

await writeFile(registryPath, JSON.stringify(nextRegistry, null, 2) + "\n");
await writeFile(inventoryPath, JSON.stringify(nextInventory, null, 2) + "\n");
console.log(
  `Built ${incidentRows.length} rows across ${rowsByState.size} states: ${countyRows.length} county rows and ${statewideRows.length} statewide-unspecified rows, with at least ${knownThreatCountMinimum} documented threats.`,
);

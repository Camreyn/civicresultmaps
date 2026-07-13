import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const registryPath = "data/election-security-incidents-2024.json";
const inventoryPath = "data/election-security-incident-source-inventory-2024.json";
const compilationPath = "data/nbc-2024-election-day-bomb-threat-county-compilation.json";
const pimaExtractPath = "data/az-2024-election-day-security-pima-source-extract.json";
const senateArtifact = "data/us-2024-election-day-bomb-threats-senate-letter.pdf";
const chesterArtifact = "data/pa-2024-election-day-security-chester.pdf";
const fbiArtifact = "data/fbi-2024-bomb-threats-polling-locations.html";

const nbcUrl = "https://www.nbcnews.com/tech/security/election-day-bomb-threats-overwhelmingly-targeted-democrat-leaning-rcna179006";
const senateUrl = "https://www.warnock.senate.gov/wp-content/uploads/2024/12/12.11.2024-Letter-to-ODNI-CISA-FBI-re-Election-Interference.pdf";
const fbiUrl = "https://www.fbi.gov/news/press-releases/fbi-statement-on-bomb-threats-to-polling-locations";

const stateNames = {
  AZ: "Arizona",
  GA: "Georgia",
  MI: "Michigan",
  PA: "Pennsylvania",
  WI: "Wisconsin",
};

const countyFips = {
  "AZ|Cochise County": "04003",
  "AZ|Maricopa County": "04013",
  "AZ|Navajo County": "04017",
  "AZ|Pima County": "04019",
  "GA|DeKalb County": "13089",
  "GA|Fulton County": "13121",
  "GA|Gwinnett County": "13135",
  "MI|Genesee County": "26049",
  "MI|Saginaw County": "26145",
  "MI|Washtenaw County": "26161",
  "MI|Wayne County": "26163",
  "PA|Blair County": "42013",
  "PA|Centre County": "42027",
  "PA|Chester County": "42029",
  "PA|Clearfield County": "42033",
  "PA|Luzerne County": "42079",
  "PA|Philadelphia County": "42101",
  "PA|York County": "42133",
  "WI|Dane County": "55025",
  "WI|Milwaukee County": "55079",
};

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

const retainedOfficialIds = new Set([
  "ga-2024-general-fulton-bomb-threat-disruptions",
  "ga-2024-general-dekalb-bomb-threat-disruptions",
]);

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

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const compilation = JSON.parse(await readFile(compilationPath, "utf8"));
const pimaExtract = JSON.parse(await readFile(pimaExtractPath, "utf8"));
const retainedOfficialRows = new Map(
  registry.incidentRows
    .filter((row) => retainedOfficialIds.has(row.id))
    .map((row) => [row.id, row]),
);

function officialGeorgiaRow(id, threatCount) {
  const row = retainedOfficialRows.get(id);
  if (!row) throw new Error(`Missing retained official row ${id}.`);
  const key = `${row.state}|${row.county}`;
  const countyCaveat = row.county === "Fulton County"
    ? "The official county minutes document several threats and five polling locations whose hours were extended after evacuations, but they do not publish an exact threat-message count. The separate nationwide compilation reports 32 threats in Fulton County. The threat count and affected-location count describe different scopes and are not added together. The five locations received different extensions from 10 to 45 minutes, so hoursExtended remains null. This row is administration context only and is not evidence of fraud or misconduct."
    : "The official county update identifies six active voting precincts that received bomb threats and two additional locations that were not current polling places, but it does not publish an exact threat-message count for the county. The separate nationwide compilation reports five threats in DeKalb County. Those source scopes differ, so the threat and affected-precinct counts are preserved without forcing them to match. Voting was temporarily suspended and resumed after police sweeps; the page says an extension was being sought but does not confirm a final order, so hoursExtended remains null. This row is administration context only and is not evidence of fraud or misconduct.";

  return {
    ...row,
    threatCount,
    threatCountBasis: "supplemental_national_compilation",
    threatCountSourceUrl: nbcUrl,
    threatCountLocalArtifact: compilationPath,
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    sourceTier: "official",
    namedLocations: namedLocations[key] ?? [],
    supportingSourceUrls: unique([...row.supportingSourceUrls, nbcUrl, senateUrl]),
    supportingLocalArtifacts: unique([...row.supportingLocalArtifacts, compilationPath, senateArtifact]),
    caveat: countyCaveat,
  };
}

function chesterRow(threatCount) {
  return {
    id: "pa-2024-general-chester-bomb-threat-disruption",
    state: "PA",
    stateName: "Pennsylvania",
    electionYear: 2024,
    county: "Chester County",
    jurisdictionCode: "42029",
    jurisdictionTag: "county:42029",
    reportingGrain: "county",
    eventDate: "2024-11-05",
    eventType: "bomb_threat",
    eventTypeLabel: "Bomb threat",
    threatCount,
    threatCountBasis: "supplemental_national_compilation",
    threatCountSourceUrl: nbcUrl,
    threatCountLocalArtifact: compilationPath,
    affectedLocations: 2,
    affectedLocationUnit: "polling_location",
    namedLocations: [
      "Chester County Government Services Center",
      "Precinct 280 (West Goshen S-2)",
      "Precinct 286 (West Goshen S-4)",
    ],
    disruptionType: "temporary_evacuation_relocation_and_extended_polling_hours",
    disruptionLabel: "Building evacuated; two polling places redirected; voting extended to 10 p.m.",
    hoursExtended: 2,
    sourceAuthority: "Chester County District Attorney's Office",
    sourceTitle: "Bomb Threat Received at Chester County Government Services Center",
    sourcePublishedAt: "2024-11-05",
    sourceUrl: "https://www.chesco.org/DocumentCenter/View/77834/2024_1105-News-Release-Bomb-Threat-Received-At-Chester-County-Government-Services-Center",
    supportingSourceUrls: [nbcUrl, senateUrl],
    localArtifact: chesterArtifact,
    supportingLocalArtifacts: [compilationPath, senateArtifact],
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    sourceTier: "official",
    sourceStatus: "official_county_record",
    confidence: "high",
    caveat: "The county release documents one emailed threat to the Government Services Center, an evacuation and K-9 sweep, and the temporary redirection of two polling places located in the building. The nationwide compilation reports one threat for Chester County. The location and threat counts are different measures and are not added together. This row is administration context only and is not evidence of fraud or misconduct.",
  };
}

function supplementalRow(sourceRow) {
  const key = `${sourceRow.state}|${sourceRow.county}`;
  const jurisdictionCode = countyFips[key];
  if (!jurisdictionCode) throw new Error(`Missing reviewed county FIPS for ${key}.`);
  const philadelphia = key === "PA|Philadelphia County";
  const exactCountPublished = sourceRow.threatCount !== null;

  return {
    id: `${sourceRow.state.toLowerCase()}-2024-general-${slug(sourceRow.county)}-bomb-threat-compilation`,
    state: sourceRow.state,
    stateName: stateNames[sourceRow.state],
    electionYear: 2024,
    county: sourceRow.county,
    jurisdictionCode,
    jurisdictionTag: `county:${jurisdictionCode}`,
    reportingGrain: "county",
    eventDate: "2024-11-05",
    eventType: "bomb_threat",
    eventTypeLabel: sourceRow.threatCount === 1 ? "Bomb threat" : "Bomb threats",
    threatCount: sourceRow.threatCount,
    threatCountBasis: exactCountPublished
      ? "supplemental_national_compilation"
      : "not_separately_published",
    threatCountSourceUrl: exactCountPublished ? nbcUrl : null,
    threatCountLocalArtifact: exactCountPublished ? compilationPath : null,
    affectedLocations: null,
    affectedLocationUnit: "polling_location",
    namedLocations: [],
    disruptionType: philadelphia
      ? "temporary_closure_and_extended_polling_hours_reported"
      : "threat_reported_disruption_detail_not_separately_published",
    disruptionLabel: philadelphia
      ? "Temporary closure and extended polling hours reported; exact site count not published in the compilation"
      : "Threat reported; county-level disruption detail not separately published in the compilation",
    hoursExtended: null,
    sourceAuthority: "NBC News",
    sourceTitle: compilation.title,
    sourcePublishedAt: compilation.publishedAt,
    sourceUrl: nbcUrl,
    supportingSourceUrls: [senateUrl, fbiUrl],
    localArtifact: compilationPath,
    supportingLocalArtifacts: [senateArtifact, fbiArtifact],
    normalizationPath: "scripts/build-security-incident-registry.mjs",
    sourceTier: "supplemental",
    sourceStatus: "supplemental_national_compilation",
    confidence: "medium",
    caveat: exactCountPublished
      ? `NBC News' nationwide compilation lists ${sourceRow.threatCount} ${sourceRow.threatCount === 1 ? "threat" : "threats"} for ${sourceRow.county}. No qualifying county-level official incident artifact was found in this review, so the row is visibly labeled supplemental and does not claim an exact list of sites, closures, or unique emails. This row is administration context only and is not evidence of fraud or misconduct.`
      : `NBC News names voting locations in ${sourceRow.county} in its nationwide compilation, but the accessible embedded table does not expose a separate county count. The county is mapped without inferring a number of locations or messages. No qualifying county-level official incident artifact was found in this review. This row is administration context only and is not evidence of fraud or misconduct.`,
  };
}

const compilationRows = [
  ...compilation.table.rows,
  ...compilation.additionalCountyMentions,
];
const incidentRows = compilationRows.map((sourceRow) => {
  const key = `${sourceRow.state}|${sourceRow.county}`;
  if (key === "GA|Fulton County") {
    return officialGeorgiaRow("ga-2024-general-fulton-bomb-threat-disruptions", sourceRow.threatCount);
  }
  if (key === "GA|DeKalb County") {
    return officialGeorgiaRow("ga-2024-general-dekalb-bomb-threat-disruptions", sourceRow.threatCount);
  }
  if (key === "PA|Chester County") {
    return chesterRow(sourceRow.threatCount);
  }
  return supplementalRow(sourceRow);
});

incidentRows.push({
  id: "az-2024-general-pima-bomb-threat-response",
  state: "AZ",
  stateName: "Arizona",
  electionYear: 2024,
  county: "Pima County",
  jurisdictionCode: "04019",
  jurisdictionTag: "county:04019",
  reportingGrain: "county",
  eventDate: "2024-11-05",
  eventType: "bomb_threat",
  eventTypeLabel: "Bomb threat",
  threatCount: 1,
  threatCountBasis: "official_county_record",
  threatCountSourceUrl: pimaExtract.sourceUrl,
  threatCountLocalArtifact: pimaExtractPath,
  affectedLocations: 1,
  affectedLocationUnit: "election_office",
  namedLocations: pimaExtract.facts.namedLocations,
  disruptionType: "law_enforcement_sweep_no_closure_reported",
  disruptionLabel: "Bomb squad and K-9 sweep; location cleared; no closure reported",
  hoursExtended: null,
  sourceAuthority: pimaExtract.sourceAuthority,
  sourceTitle: pimaExtract.sourceTitle,
  sourcePublishedAt: pimaExtract.publishedAt,
  sourceUrl: pimaExtract.sourceUrl,
  supportingSourceUrls: [],
  localArtifact: pimaExtractPath,
  supportingLocalArtifacts: [],
  normalizationPath: "scripts/build-security-incident-registry.mjs",
  sourceTier: "official",
  sourceStatus: "official_county_record",
  confidence: "high",
  caveat: "The official after-action report documents one Election Day email threat specifically naming the 240 N. Stone location. Police checked and cleared the site; staff could leave but none did, and the report does not describe a polling-place closure. Direct scripted PDF acquisition was blocked by the county site's anti-bot challenge, so the repository retains a structured source extract with the canonical official URL. This row is administration context only and is not evidence of fraud or misconduct.",
});

incidentRows.sort((left, right) =>
  left.state.localeCompare(right.state)
  || left.county.localeCompare(right.county)
  || left.id.localeCompare(right.id),
);

const knownThreatCountMinimum = incidentRows.reduce((sum, row) => sum + (row.threatCount ?? 0), 0);
const affectedLocationUnitTotals = Object.fromEntries(
  ["election_office", "polling_location", "voting_precinct"]
    .map((unit) => [
      unit,
      incidentRows
        .filter((row) => row.affectedLocationUnit === unit)
        .reduce((sum, row) => sum + (row.affectedLocations ?? 0), 0),
    ])
    .filter(([, total]) => total > 0),
);

const nextRegistry = {
  schemaVersion: 3,
  description: "County-level November 5, 2024 election security incident rows combining official county records with a visibly labeled supplemental nationwide compilation where no county artifact was publicly available.",
  electionYear: 2024,
  reportingGrain: "county",
  normalizationPath: "scripts/build-security-incident-registry.mjs",
  expected: {
    rowCount: incidentRows.length,
    stateCount: new Set(incidentRows.map((row) => row.state)).size,
    countyCount: new Set(incidentRows.map((row) => row.jurisdictionTag)).size,
    completeThreatCountRows: incidentRows.filter((row) => row.threatCount !== null).length,
    unknownThreatCountRows: incidentRows.filter((row) => row.threatCount === null).length,
    knownThreatCountMinimum,
    publishedCompilationLocationCount: compilation.nationalSummary.reportedLocationCount,
    publishedCompilationCountyCount: compilation.nationalSummary.reportedCountyCount,
    affectedLocationUnitTotals,
  },
  caveat: "All 19 counties named in the published nationwide Election Day compilation are mapped, and Pima County is added from a separate official record. This is still not an official federal census or a complete site-by-site roster: the FBI did not publish one, supplemental county rows are labeled, and an unknown count is never treated as zero. Incident rows are not evidence of fraud, misconduct, altered votes, or an incorrect election outcome.",
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
  if (!rows) return entry;
  return {
    state: entry.state,
    stateName: entry.stateName,
    status: "partial",
    sourceAuthorities: unique(rows.map((row) => row.sourceAuthority)),
    sourceUrls: unique(rows.flatMap((row) => [row.sourceUrl, ...row.supportingSourceUrls])),
    localArtifacts: unique(rows.flatMap((row) => [row.localArtifact, ...row.supportingLocalArtifacts])),
    expectedRowCount: rows.length,
    confidence: "mixed_official_and_supplemental_national_compilation",
    caveat: `Every ${entry.state} county named in the published nationwide Election Day compilation is mapped. ${rows.filter((row) => row.sourceTier === "official").length} row(s) have a county-level official record; the remaining row(s) rely on the visibly labeled supplemental compilation. The FBI did not publish a complete county or site roster.`,
  };
});

const fbiContext = inventory.nationalContext.find(
  (context) => context.sourceAuthority === "Federal Bureau of Investigation",
);
if (!fbiContext) throw new Error("Missing retained FBI national context record.");

const nextInventory = {
  schemaVersion: 2,
  description: "Nationwide coverage inventory for November 5, 2024 general-election bomb-threat records, including official context, official county records, and a visibly labeled supplemental nationwide county compilation.",
  electionYear: 2024,
  reportingGrain: "county",
  normalizationPath: "scripts/build-security-incident-registry.mjs",
  expected: {
    configuredStates: stateCoverage.length,
    statesWithNormalizedRows: rowsByState.size,
    normalizedEventRows: incidentRows.length,
    publishedCompilationLocationCount: compilation.nationalSummary.reportedLocationCount,
    publishedCompilationCountyCount: compilation.nationalSummary.reportedCountyCount,
    mappedCompilationCountyCount: compilationRows.length,
    additionalOfficialCountyRows: 1,
  },
  caveat: "The map includes every county named by the published nationwide Election Day compilation plus one additional official Pima County record. Supplemental records remain visibly distinct from official county records. The FBI did not publish a complete national county or site roster, so this inventory cannot establish that no other incident occurred.",
  nationalContext: [
    { ...fbiContext, sourceTier: "official" },
    {
      sourceAuthority: "United States Senate",
      sourceTitle: "Letter to ODNI, CISA, and FBI Regarding Election Interference",
      sourceUrl: senateUrl,
      localArtifact: senateArtifact,
      sha256: await sha256(senateArtifact),
      acquiredAt: "2026-07-13",
      electionYear: 2024,
      reportingGrain: "multi-state",
      normalizationPath: "inventory_context_and_compilation_crosscheck",
      expectedRowCount: 19,
      acquisitionStatus: "download_complete",
      sourceTier: "official",
      confidence: "high_for_congressional_statement_medium_for_underlying_compilation",
      reportedLocationCount: 67,
      reportedCountyCount: 19,
      reportedStateCount: 5,
      caveat: "The congressional letter states that at least 67 polling locations in 19 counties across Arizona, Georgia, Michigan, Pennsylvania, and Wisconsin received threats. Its footnote attributes that figure to NBC News and Reuters rather than to a disclosed federal incident roster, so it is national context and a cross-check, not the county normalization source.",
    },
    {
      sourceAuthority: compilation.sourceAuthority,
      sourceTitle: compilation.title,
      sourceUrl: compilation.sourceUrl,
      localArtifact: compilationPath,
      sha256: await sha256(compilationPath),
      acquiredAt: compilation.acquiredAt,
      electionYear: 2024,
      reportingGrain: "multi-state county compilation",
      normalizationPath: "scripts/build-security-incident-registry.mjs",
      expectedRowCount: 19,
      acquisitionStatus: "manual_browser_structured_capture_complete",
      sourceTier: "supplemental",
      confidence: "medium",
      reportedLocationCount: compilation.nationalSummary.reportedLocationCount,
      reportedCountyCount: compilation.nationalSummary.reportedCountyCount,
      reportedStateCount: compilation.nationalSummary.reportedStateCount,
      caveat: compilation.caveat,
    },
  ],
  stateCoverage,
};

await writeFile(registryPath, JSON.stringify(nextRegistry, null, 2) + "\n");
await writeFile(inventoryPath, JSON.stringify(nextInventory, null, 2) + "\n");
console.log(`Built ${incidentRows.length} county rows across ${rowsByState.size} states.`);

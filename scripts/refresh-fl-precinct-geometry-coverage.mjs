import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const CHECKED_AT = "2026-08-16T12:00:00.000Z";
const SPECS = Object.freeze([
  {
    year: 2012,
    electionId: "2012-11-06-general",
    inventory: "data/precinct-geometry-coverage-inventory-2012.json",
    manifestId: "fl-2012-11-06-precinct-geometry-unavailable-v1",
    disposition: "blocked",
    sourceTiers: ["tier_1_official_export_database"],
    geometryLeads: [
      "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_12_vtd10.zip",
    ],
    blockers: [
      "No complete statewide precinct-boundary edition effective for the November 6, 2012 general election is publicly retained.",
      "The Census 2010 VTD layer is a diagnostic statistical geography and is not backcast as Florida election precincts.",
      "All 6,319 official source reporting units remain explicit and unassigned; no votes are spatially allocated.",
    ],
    nextAction: "Obtain a machine-readable statewide November 6, 2012 precinct boundary archive and an official county-qualified result-to-feature crosswalk; until then keep this year unavailable.",
    notes: [
      "The official Florida Department of State result export is retained and reconciles to 8,492,336 presidential candidate votes, including write-ins.",
      "The 9,435-feature Census 2010 VTD layer is retained only as evidence of an unsafe alternative and is not normalized for delivery.",
      "This election remains outside every guarded release candidate.",
    ],
  },
  {
    year: 2016,
    electionId: "2016-11-08-general",
    inventory: "data/precinct-geometry-coverage-inventory-2016.json",
    manifestId: "fl-2016-11-08-reviewed-precinct-geometry-v1",
    disposition: "mapped",
    sourceTiers: ["tier_1_official_export_database", "tier_2_public_secondary"],
    geometryLeads: ["https://doi.org/10.7910/DVN/NH5S2I/IAELIN"],
    blockers: ["Immutable parent-scoped delivery and the guarded production release have not been completed."],
    nextAction: "Build the hash-pinned parent-scoped delivery package and complete the guarded hidden-load, deployment, and atomic publication sequence.",
    notes: [
      "All displayed votes come only from the Florida Department of State export; VEST supplies attributed election-specific geometry only.",
      "Five Union County source-pairs are retained as multipart geometry, and six documented aliases are reviewed without allocating votes.",
      "Eighteen official source units totaling 9,744 votes remain excluded from geometry, and 110 unlinked polygons remain visible as reviewed no-data features.",
    ],
  },
  {
    year: 2020,
    electionId: "2020-11-03-general",
    inventory: "data/precinct-geometry-coverage-inventory-2020.json",
    manifestId: "fl-2020-11-03-reviewed-precinct-geometry-v1",
    disposition: "mapped",
    sourceTiers: ["tier_1_official_export_database", "tier_2_public_secondary"],
    geometryLeads: ["https://dataverse.harvard.edu/file.xhtml?fileId=4938250&version=24.0"],
    blockers: ["Immutable parent-scoped delivery and the guarded production release have not been completed."],
    nextAction: "Build the hash-pinned parent-scoped delivery package and complete the guarded hidden-load, deployment, and atomic publication sequence.",
    notes: [
      "All displayed votes come only from the Florida Department of State export; VEST supplies attributed election-specific geometry only.",
      "The 775 Miami-Dade relationships sum complete official source components belonging to one reviewed base precinct; no vote is estimated or proportionally allocated.",
      "Seventeen official source units totaling 2,179 votes remain excluded from geometry, and 21 unlinked polygons remain visible as reviewed no-data features.",
    ],
  },
  {
    year: 2024,
    electionId: "2024-11-05-general",
    inventory: "data/precinct-geometry-coverage-inventory.json",
    manifestId: "fl-2024-11-05-reviewed-precinct-geometry-v1",
    disposition: "mapped",
    sourceTiers: ["tier_1_official_export_database", "tier_2_public_secondary"],
    geometryLeads: ["https://int.nyt.com/newsgraphics/elections/map-data/2024/national/FL-precincts-with-results.geojson.gz"],
    blockers: ["Immutable parent-scoped delivery and the guarded production release have not been completed."],
    nextAction: "Build the hash-pinned parent-scoped delivery package and complete the guarded hidden-load, deployment, and atomic publication sequence.",
    notes: [
      "All displayed votes come only from the Florida Department of State export; every NYT election-value field is discarded before geometry normalization.",
      "The reviewed package contains 4,319 official-boundary features and 1,264 generated-boundary features under retained NYT C-UDA non-commercial attribution terms.",
      "Three Charlotte source-component sums and 189 unique complete official vote-signature joins are retained; 126 source units totaling 17,948 votes remain excluded and are never allocated.",
    ],
  },
]);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function resultDocument(spec) {
  return JSON.parse(gunzipSync(readFileSync(
    `data/precinct-geometry/FL/${spec.electionId}/normalized/fl-${spec.year}-president-results.json.gz`,
  )).toString("utf8"));
}

function buildRow(spec) {
  const manifest = readJson(`data/precinct-geometry/FL/${spec.electionId}/manifest.json`);
  const results = resultDocument(spec);
  const geometryArtifacts = [
    manifest.source.artifact,
    manifest.normalization.artifact,
    manifest.crosswalk.artifact,
  ];
  return {
    state: "FL",
    stateName: "Florida",
    electionId: spec.electionId,
    programStatus: "reviewed",
    wave: 13,
    disposition: spec.disposition,
    checkedAt: CHECKED_AT,
    sourceTiers: spec.sourceTiers,
    resultReportingGrains: ["precinct"],
    generalOfficialSourceLeads: [
      "https://dos.fl.gov/elections/data-statistics/elections-data/precinct-level-election-results/",
      ...spec.geometryLeads,
    ],
    geometry: {
      manifestIds: [spec.manifestId],
      officialSourceLeads: spec.geometryLeads,
      retainedArtifacts: geometryArtifacts,
      levels: ["precinct"],
      vintageStatuses: [manifest.geography.vintageStatus],
      featureCount: manifest.normalization.featureCount,
      publicEligibleManifestCount: 0,
    },
    crosswalk: {
      resultUnits: manifest.crosswalk.resultUnits,
      colorableResultUnits: manifest.crosswalk.colorableResultUnits,
      matchedResultUnits: manifest.crosswalk.matchedResultUnits,
      unmatchedResultUnits: manifest.crosswalk.unmatchedResultUnits,
      nonGeographicResultUnits: manifest.crosswalk.nonGeographicResultUnits,
      sourceAliasResultUnits: manifest.crosswalk.sourceAliasResultUnits,
    },
    blockers: spec.blockers,
    nextAction: spec.nextAction,
    notes: [
      ...spec.notes,
      `The retained official source universe contains ${results.sourceUnitCount.toLocaleString("en-US")} reporting units and ${results.totals.total.toLocaleString("en-US")} presidential candidate votes.`,
      "Each election retains its own boundary evidence and is not treated as a stable cross-election precinct geography.",
    ],
  };
}

function summarize(states) {
  const by = (field, values) => Object.fromEntries(values.map((value) => [
    value,
    states.filter((row) => row[field] === value).length,
  ]));
  return {
    totalJurisdictions: states.length,
    programStatus: by("programStatus", ["not_started", "in_progress", "reviewed"]),
    disposition: by("disposition", ["undecided", "mapped", "partial", "official_geometry_unavailable", "blocked"]),
    publicEligibleJurisdictions: states.filter((row) => row.geometry.publicEligibleManifestCount > 0).length,
  };
}

for (const spec of SPECS) {
  const inventory = readJson(spec.inventory);
  const row = buildRow(spec);
  const existingIndex = inventory.states.findIndex((entry) => entry.state === "FL");
  if (existingIndex >= 0) inventory.states[existingIndex] = row;
  else inventory.states.push(row);
  inventory.updatedAt = CHECKED_AT;
  inventory.summary = summarize(inventory.states);
  writeFileSync(spec.inventory, JSON.stringify(inventory, null, 2) + "\n");
}

console.log(JSON.stringify({ state: "FL", updatedAt: CHECKED_AT, years: SPECS.map((spec) => spec.year) }, null, 2));

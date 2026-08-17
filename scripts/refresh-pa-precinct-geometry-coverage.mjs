import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  PENNSYLVANIA_PRECINCT_YEAR_SPECS,
  PENNSYLVANIA_REVIEWED_AT,
} from "./lib/pa-precinct-geometry.mjs";

const SPECS = Object.freeze([
  {
    year: 2012,
    inventory: "data/precinct-geometry-coverage-inventory-2012.json",
    disposition: "blocked",
    sourceTiers: ["tier_1_official_export_database"],
    geometryLeads: [
      "https://www2.census.gov/geo/tiger/TIGER2012/VTD/tl_2012_42_vtd10.zip",
    ],
    blockers: [
      "No complete statewide precinct-boundary edition effective for the November 6, 2012 general election is retained.",
      "The Census 2010 VTD layer is a statistical availability diagnostic and is not backcast as Pennsylvania election precincts.",
      "All 9,246 official result units remain explicit and unassigned; no votes are spatially allocated.",
    ],
    nextAction:
      "Obtain an official or independently reviewable November 6, 2012 precinct boundary archive and a county-qualified result-to-feature crosswalk; until then keep the year unavailable.",
    notes: [
      "The retained official DOS source universe reconciles to 5,734,022 presidential candidate votes.",
      "The 9,256-feature Census 2010 VTD layer is retained only as evidence of an unsafe alternative and yields zero normalized delivery features.",
    ],
  },
  {
    year: 2016,
    inventory: "data/precinct-geometry-coverage-inventory-2016.json",
    disposition: "partial",
    sourceTiers: [
      "tier_1_official_export_database",
      "tier_2_public_secondary",
    ],
    geometryLeads: [
      "https://election.lab.ufl.edu/dataset/pa-2016-precinct-level-election-results/",
    ],
    blockers: [
      "Immutable parent-scoped delivery and the guarded production release have not been completed.",
    ],
    nextAction:
      "After source-package review and merge, build a hash-pinned parent-scoped delivery candidate and run the separate guarded release workflow without expanding the reviewed crosswalk.",
    notes: [
      "8,014 VEST polygons match 8,018 complete official DOS source units by unique county-qualified VTD identity and exact complete presidential candidate vector.",
      "1,158 official source units totaling 782,683 votes remain excluded, and 1,153 polygons remain reviewed no-data features.",
      "Every election-value attribute is stripped from geometry; only DOS votes can be displayed.",
    ],
  },
  {
    year: 2020,
    inventory: "data/precinct-geometry-coverage-inventory-2020.json",
    disposition: "partial",
    sourceTiers: [
      "tier_1_official_export_database",
      "tier_2_public_secondary",
    ],
    geometryLeads: [
      "https://election.lab.ufl.edu/dataset/pa-2020-precinct-level-election-results/",
    ],
    blockers: [
      "Immutable parent-scoped delivery and the guarded production release have not been completed.",
    ],
    nextAction:
      "After source-package review and merge, build a hash-pinned parent-scoped delivery candidate and run the separate guarded release workflow without expanding the reviewed crosswalk.",
    notes: [
      "6,805 VEST polygons match 6,827 complete official DOS source units by unique county-qualified VTD identity and exact complete presidential candidate vector.",
      "2,360 official source units totaling 1,545,703 votes remain excluded, and 2,345 polygons remain reviewed no-data features.",
      "Pike County (GEOID 42103) has no accepted relationship: all 18 official units totaling 32,554 votes remain excluded.",
      "Every election-value attribute is stripped from geometry; only DOS votes can be displayed.",
    ],
  },
  {
    year: 2024,
    inventory: "data/precinct-geometry-coverage-inventory.json",
    disposition: "blocked",
    sourceTiers: ["tier_1_official_export_database"],
    geometryLeads: [
      "https://www.redistricting.state.pa.us/maps/",
    ],
    blockers: [
      "No complete independently reviewable statewide precinct-boundary edition effective for November 5, 2024 is retained.",
      "The 2021 LRC corrected VTD layer reflects updates through December 31, 2020 and is neither backcast nor forward-cast to the 2024 election.",
      "All 9,187 official result units remain explicit and unassigned; no votes are spatially allocated.",
    ],
    nextAction:
      "Continue official county and state records requests for a November 5, 2024 boundary edition and crosswalk; do not substitute current VTDs or access-controlled edited voter-file geometry.",
    notes: [
      "The retained official DOS source universe reconciles to 7,031,737 presidential candidate votes.",
      "The deterministic 9,178-feature LRC VTD subset and its certification transcript are retained only as availability evidence and yield zero normalized delivery features.",
    ],
  },
]);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function resultDocument(spec) {
  const yearSpec = PENNSYLVANIA_PRECINCT_YEAR_SPECS[spec.year];
  return JSON.parse(gunzipSync(readFileSync(
    yearSpec.base + "/normalized/pa-" + spec.year
      + "-president-results.json.gz",
  )).toString("utf8"));
}

function buildRow(spec) {
  const yearSpec = PENNSYLVANIA_PRECINCT_YEAR_SPECS[spec.year];
  const manifest = readJson(yearSpec.base + "/manifest.json");
  const results = resultDocument(spec);
  const geometry = {
    manifestIds: [manifest.id],
    officialSourceLeads: spec.year === 2016 || spec.year === 2020
      ? []
      : spec.geometryLeads,
    ...(spec.year === 2016 || spec.year === 2020
      ? { secondarySourceLeads: spec.geometryLeads }
      : {}),
    retainedArtifacts: [
      manifest.source.artifact,
      manifest.normalization.artifact,
      manifest.crosswalk.artifact,
    ],
    levels: ["precinct"],
    vintageStatuses: [manifest.geography.vintageStatus],
    featureCount: manifest.normalization.featureCount,
    publicEligibleManifestCount: 0,
  };
  return {
    state: "PA",
    stateName: "Pennsylvania",
    electionId: yearSpec.electionId,
    programStatus: "reviewed",
    wave: 14,
    disposition: spec.disposition,
    checkedAt: PENNSYLVANIA_REVIEWED_AT,
    sourceTiers: spec.sourceTiers,
    resultReportingGrains: ["precinct"],
    generalOfficialSourceLeads: [
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
      ...(spec.year === 2016 || spec.year === 2020
        ? []
        : spec.geometryLeads),
    ],
    geometry,
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
      "The retained official source universe contains "
        + results.sourceUnitCount.toLocaleString("en-US")
        + " reporting units and "
        + results.totals.total.toLocaleString("en-US")
        + " presidential candidate votes.",
      "Each election retains its own boundary evidence and is not treated as stable cross-election precinct geography.",
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
    programStatus: by(
      "programStatus",
      ["not_started", "in_progress", "reviewed"],
    ),
    disposition: by(
      "disposition",
      [
        "undecided",
        "mapped",
        "partial",
        "official_geometry_unavailable",
        "blocked",
      ],
    ),
    publicEligibleJurisdictions: states.filter(
      (row) => row.geometry.publicEligibleManifestCount > 0,
    ).length,
  };
}

for (const spec of SPECS) {
  const inventory = readJson(spec.inventory);
  const row = buildRow(spec);
  const existingIndex = inventory.states.findIndex(
    (entry) => entry.state === "PA",
  );
  if (existingIndex >= 0) inventory.states[existingIndex] = row;
  else inventory.states.push(row);
  inventory.updatedAt = [
    inventory.updatedAt,
    PENNSYLVANIA_REVIEWED_AT,
  ].filter(Boolean).sort().at(-1);
  inventory.summary = summarize(inventory.states);
  writeFileSync(
    spec.inventory,
    JSON.stringify(inventory, null, 2) + "\n",
  );
}

console.log(JSON.stringify({
  state: "PA",
  reviewedAt: PENNSYLVANIA_REVIEWED_AT,
  years: SPECS.map((spec) => spec.year),
}, null, 2));

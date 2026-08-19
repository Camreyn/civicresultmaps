import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { inspectPrecinctGeometryManifest } from "../src/lib/precinct-geography.ts";
import {
  PENNSYLVANIA_PRECINCT_YEAR_SPECS,
} from "./lib/pa-precinct-geometry.mjs";

const PENNSYLVANIA_COVERAGE_REVIEWED_AT = "2026-08-18T00:00:00.000Z";
const UNION_DATASET_URL =
  "https://www.pasda.psu.edu/uci/DataSummary.aspx?dataset=1994";

const SPECS = Object.freeze([
  {
    year: 2012,
    inventory: "data/precinct-geometry-coverage-inventory-2012.json",
    disposition: "blocked",
    sourceTiers: ["tier_1_official_export_database"],
    officialGeometryLeads: [
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
    officialGeometryLeads: [],
    secondaryGeometryLeads: [
      "https://election.lab.ufl.edu/dataset/pa-2016-precinct-level-election-results/",
    ],
    blockers: [],
    nextAction:
      "Keep the published exact-vector subset immutable while collecting official county evidence for the 1,158 excluded source units; any expansion requires a separate source, terms, delivery, and guarded release review.",
    notes: [
      "8,014 VEST polygons match 8,018 complete official DOS source units by unique county-qualified VTD identity and exact complete presidential candidate vector.",
      "1,158 official source units totaling 782,683 votes remain excluded, and 1,153 polygons remain reviewed no-data features.",
      "Every election-value attribute is stripped from geometry; only DOS votes can be displayed.",
      "The reviewed partial package is public at revision 27 through immutable parent-scoped delivery.",
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
    officialGeometryLeads: [UNION_DATASET_URL],
    secondaryGeometryLeads: [
      "https://election.lab.ufl.edu/dataset/pa-2020-precinct-level-election-results/",
    ],
    followupManifest:
      "data/precinct-geometry/PA/2020-11-03-general/official-county-followups/union-county/manifest.json",
    blockers: [],
    nextAction:
      "Keep the published exact-vector subset immutable while reviewing official county expansions separately. The Union County candidate can add two source units and 1,038 votes only after PASDA terms and guarded release review.",
    notes: [
      "6,805 VEST polygons match 6,827 complete official DOS source units by unique county-qualified VTD identity and exact complete presidential candidate vector.",
      "2,360 official source units totaling 1,545,703 votes remain excluded, and 2,345 polygons remain reviewed no-data features.",
      "Pike County (GEOID 42103) has no accepted relationship: all 18 official units totaling 32,554 votes remain excluded.",
      "Every election-value attribute is stripped from geometry; only DOS votes can be displayed.",
      "The reviewed partial package is public at revision 27. A separate delivery-null official Union County candidate covers all 27 county units and identifies two units/1,038 votes beyond the live package.",
    ],
  },
  {
    year: 2024,
    inventory: "data/precinct-geometry-coverage-inventory.json",
    disposition: "blocked",
    sourceTiers: ["tier_1_official_export_database"],
    officialGeometryLeads: [
      "https://www.redistricting.state.pa.us/maps/",
      UNION_DATASET_URL,
    ],
    followupManifest:
      "data/precinct-geometry/PA/2024-11-05-general/official-county-followups/union-county/manifest.json",
    blockers: [
      "No complete independently reviewable statewide precinct-boundary edition effective for November 5, 2024 is retained.",
      "The 2021 LRC corrected VTD layer reflects updates through December 31, 2020 and is neither backcast nor forward-cast to the 2024 election.",
      "The official Union County candidate covers 27 source units and 21,188 votes only; the other 9,160 units and 7,010,549 votes remain without reviewed election-effective geometry.",
      "The Union County archive has a 2024-09-05 export lineage, but embedded feature SyncDate/ModDate values remain 2021-10-12; Election Day boundary effectiveness is not independently established.",
      "The Union County candidate remains delivery-null pending PASDA terms and guarded release review.",
    ],
    nextAction:
      "Continue official county and state collection for the remaining 9,160 source units, using the retained Union County candidate as the reviewed pattern; do not substitute current VTDs or release county packages without terms review.",
    notes: [
      "The retained official DOS source universe reconciles to 7,031,737 presidential candidate votes.",
      "The deterministic 9,178-feature LRC VTD subset and its certification transcript are retained only as availability evidence and yield zero normalized delivery features.",
      "The separate official Union County package contains 27 vote-free polygons, 27 reviewed one-to-one relationships, and 21,188 official DOS votes; it is not public.",
    ],
  },
]);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const registry = readJson("data/precinct-geometry-manifests.json");

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
  const followupManifest = spec.followupManifest
    ? readJson(spec.followupManifest)
    : null;
  const registryRows = registry.manifests.filter((row) =>
    row.state === "PA" && row.election.id === yearSpec.electionId
  );
  if (registryRows.length > 1) {
    throw new Error(`Pennsylvania ${spec.year} registry coverage is ambiguous.`);
  }
  const publicManifest = registryRows[0] ?? null;
  if (publicManifest) {
    const inspection = inspectPrecinctGeometryManifest(publicManifest);
    if (
      publicManifest.id !== manifest.id
      || inspection.errors.length
      || inspection.publicEligibilityReasons.length
    ) {
      throw new Error(
        `Pennsylvania ${spec.year} registry manifest is not the eligible canonical package.`,
      );
    }
  }
  const results = resultDocument(spec);
  const geometry = {
    manifestIds: [manifest.id, followupManifest?.id].filter(Boolean),
    officialSourceLeads: spec.officialGeometryLeads,
    ...(spec.secondaryGeometryLeads?.length
      ? { secondarySourceLeads: spec.secondaryGeometryLeads }
      : {}),
    retainedArtifacts: [
      manifest.source.artifact,
      manifest.normalization.artifact,
      manifest.crosswalk.artifact,
      ...(followupManifest
        ? [
          followupManifest.source.artifact,
          followupManifest.normalization.artifact,
          followupManifest.crosswalk.artifact,
        ]
        : []),
    ],
    levels: ["precinct"],
    vintageStatuses: [...new Set([
      manifest.geography.vintageStatus,
      followupManifest?.geography.vintageStatus,
    ].filter(Boolean))],
    featureCount: manifest.normalization.featureCount,
    publicEligibleManifestCount: publicManifest ? 1 : 0,
    ...(followupManifest
      ? {
        candidateFollowup: {
          manifestId: followupManifest.id,
          manifestPath: spec.followupManifest,
          featureCount: followupManifest.normalization.featureCount,
          matchedResultUnits: followupManifest.crosswalk.matchedResultUnits,
          vintageStatus: followupManifest.geography.vintageStatus,
          validationStatus: followupManifest.validation.status,
          delivery: followupManifest.delivery,
        },
      }
      : {}),
  };
  return {
    state: "PA",
    stateName: "Pennsylvania",
    electionId: yearSpec.electionId,
    programStatus: "reviewed",
    wave: 14,
    disposition: spec.disposition,
    checkedAt: PENNSYLVANIA_COVERAGE_REVIEWED_AT,
    sourceTiers: spec.sourceTiers,
    resultReportingGrains: ["precinct"],
    generalOfficialSourceLeads: [
      "https://www.pa.gov/agencies/dos/resources/voting-and-elections-resources/voting-and-election-statistics/election-data",
      ...spec.officialGeometryLeads,
    ],
    geometry,
    crosswalk: {
      resultUnits: manifest.crosswalk.resultUnits,
      colorableResultUnits: manifest.crosswalk.colorableResultUnits,
      matchedResultUnits: manifest.crosswalk.matchedResultUnits,
      unmatchedResultUnits: manifest.crosswalk.unmatchedResultUnits,
      nonGeographicResultUnits: manifest.crosswalk.nonGeographicResultUnits,
      sourceAliasResultUnits: manifest.crosswalk.sourceAliasResultUnits,
      ...(followupManifest
        ? {
          candidateFollowup: {
            resultUnits: followupManifest.crosswalk.resultUnits,
            matchedResultUnits: followupManifest.crosswalk.matchedResultUnits,
          },
        }
        : {}),
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
    PENNSYLVANIA_COVERAGE_REVIEWED_AT,
  ].filter(Boolean).sort().at(-1);
  inventory.summary = summarize(inventory.states);
  writeFileSync(
    spec.inventory,
    JSON.stringify(inventory, null, 2) + "\n",
  );
}

console.log(JSON.stringify({
  state: "PA",
  reviewedAt: PENNSYLVANIA_COVERAGE_REVIEWED_AT,
  years: SPECS.map((spec) => spec.year),
}, null, 2));

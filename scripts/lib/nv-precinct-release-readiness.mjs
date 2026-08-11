import { buildNevadaPrecinctGisPlan, summarizeNevadaPrecinctGisPlan } from "./nv-precinct-gis-plan.mjs";

const EXTERNAL_REQUIREMENTS = Object.freeze({
  2012: Object.freeze({
    status: "blocked_external_election_date_archive",
    request: {
      custodian: "Nevada Legislative Counsel Bureau Research Library",
      contact: "library@lcb.state.nv.us",
      sourceUrl: "https://www.leg.state.nv.us/Division/Research/Library/About/",
      authority: "NRS 293.206 biennial county precinct-map submission",
      ask: "The original electronic/GIS files, metadata, correction submissions, and precinct-change index for Washoe County precinct maps applicable to the November 6, 2012 general election.",
    },
  }),
  2016: Object.freeze({
    status: "blocked_external_official_row_level_provenance",
    request: {
      custodian: "Nevada Legislative Counsel Bureau Research Library",
      contact: "library@lcb.state.nv.us",
      sourceUrl: "https://www.leg.state.nv.us/Division/Research/Library/About/",
      authority: "Publisher of the official 2016 presidential precinct map using Nevada Secretary of State election data",
      ask: "The machine-readable precinct result table, boundary files, metadata, and any result-to-boundary crosswalk used to create ElectionResults2016USPres.pdf, or written confirmation that the cited VEST V1.2 reconstruction may serve as the supplemental row-level source when its statewide totals reconcile to the official map.",
    },
  }),
  2020: Object.freeze({
    status: "blocked_external_version_specific_terms",
    request: {
      custodian: "University of Florida Election Lab / VEST",
      contact: "election-lab@ufl.edu",
      sourceUrl: "https://election.lab.ufl.edu/what-we-do/",
      authority: "Publisher of Harvard Dataverse file 4863168, dataset version 21.0",
      ask: "The exact custom license or redistribution terms that applied to Nevada file nv_2020.zip, Harvard Dataverse file 4863168, dataset version 21.0, and confirmation that public web redistribution of derived parent-scoped GeoJSON is permitted with attribution.",
    },
  }),
  2024: Object.freeze({
    status: "blocked_external_affirmative_redistribution_review",
    request: {
      custodian: "Nevada Legislative Counsel Bureau Research Library",
      contact: "library@lcb.state.nv.us",
      sourceUrl: "https://www.leg.state.nv.us/Division/Research/Library/About/",
      authority: "Owner and publisher of ArcGIS item 6303f14785fb401c8e4c53e333f44472",
      ask: "Written confirmation of the reuse and public redistribution terms for derived, attributed GeoJSON produced from the public_authoritative 2024 Precincts FeatureServer. The retained item licenseInfo and layer copyrightText fields are empty.",
    },
  }),
});

export async function buildNevadaPrecinctReleaseReadiness(options = {}) {
  const plan = options.plan ?? await buildNevadaPrecinctGisPlan(options);
  const summary = summarizeNevadaPrecinctGisPlan(plan);
  const years = summary.years.map((year) => {
    const external = EXTERNAL_REQUIREMENTS[year.year] ?? null;
    return {
      year: year.year,
      electionId: year.electionId,
      manifestId: year.manifestId,
      manifestSha256: year.manifestSha256,
      reportingUnits: year.reportingUnits,
      geometryFeatures: year.geometryFeatures,
      reviewedCrosswalks: year.reviewedCrosswalks,
      reviewedNoDataFeatures: year.reviewedNoDataFeatures,
      sourceGatePassed: year.publicReleaseEligible,
      status: external?.status ?? "source_and_crosswalk_gates_passed_delivery_pending",
      blockers: year.blockers,
      externalRequest: external?.request ?? null,
    };
  });
  const allFourSourceGatesPassed = years.every((year) => year.sourceGatePassed);
  return {
    schemaVersion: 1,
    state: "NV",
    scope: "2012, 2016, 2020, and 2024 presidential precinct GIS public-release readiness",
    decision: allFourSourceGatesPassed
      ? "READY_FOR_IMMUTABLE_PACKAGING_REVIEW"
      : "NO_GO_ALL_FOUR_PUBLIC_RELEASE",
    allFourSourceGatesPassed,
    productionMutationPerformed: false,
    publicDeliveryAuthorized: false,
    years,
    requiredNextActions: [
      "Resolve every external source requirement recorded above without weakening the manifest gates.",
      "Design and review an aggregate-rendering contract before any 2012 one-to-many relationship can become public eligible.",
      "Regenerate and review the exact hash-pinned artifacts after any source replacement or terms decision.",
      "Build immutable parent-scoped delivery packages only for reviewed, redistribution-authorized years.",
      "Use a separately reviewed guarded production release; this readiness report performs no publication or database write.",
    ],
  };
}

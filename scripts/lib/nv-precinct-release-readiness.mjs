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
      sourceGatePassed: year.sourceGatePassed,
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
      "Obtain or locate the election-date Washoe County 2012 precinct archive recorded above without weakening the vintage gate.",
      "Review the regenerated exact hash-pinned artifacts and official-result/privacy exclusions.",
      "Build immutable parent-scoped delivery packages for 2016, 2020, and 2024 while the unresolved 2012 vintage remains blocked.",
      "Use a separately reviewed guarded production release; this readiness report performs no publication or database write.",
    ],
  };
}

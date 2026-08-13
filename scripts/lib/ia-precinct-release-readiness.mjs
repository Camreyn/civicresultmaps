import { buildIowaPrecinctGisPlan, summarizeIowaPrecinctGisPlan } from "./ia-precinct-gis-plan.mjs";

const EXTERNAL_REQUIREMENTS = Object.freeze({
  2012: Object.freeze({
    status: "blocked_external_election_date_archive",
    request: {
      custodian: "Iowa Secretary of State and Iowa Legislative Services Agency",
      contact: null,
      sourceUrl: "https://sos.iowa.gov/elections/",
      authority: "Iowa election administration and legislative redistricting precinct records",
      ask: "A complete statewide electronic/GIS export of the precinct boundaries effective for the November 6, 2012 general election, including stable county and precinct identifiers and any election-effective correction or consolidation crosswalk.",
    },
  }),
});

export async function buildIowaPrecinctReleaseReadiness(options = {}) {
  const plan = options.plan ?? await buildIowaPrecinctGisPlan(options);
  const summary = summarizeIowaPrecinctGisPlan(plan);
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
    state: "IA",
    scope: "2012, 2016, 2020, and 2024 presidential precinct GIS public-release readiness",
    decision: allFourSourceGatesPassed
      ? "READY_FOR_IMMUTABLE_PACKAGING_REVIEW"
      : "NO_GO_ALL_FOUR_PUBLIC_RELEASE",
    allFourSourceGatesPassed,
    productionMutationPerformed: false,
    publicDeliveryAuthorized: false,
    years,
    requiredNextActions: [
      "Continue no-email archive and official-download discovery for the complete election-effective Iowa 2012 precinct boundary set; retain the tracked blocker until it is found and reviewed.",
      "Review the regenerated exact hash-pinned artifacts, license terms, and official-result reconciliation.",
      "Build immutable parent-scoped delivery packages for 2016, 2020, and 2024 while the unresolved 2012 vintage remains blocked.",
      "Implement and review a receipt-bound atomic public rollback before any GO_PUBLIC authorization.",
      "Use a separately reviewed guarded production release; this readiness report performs no publication or database write.",
    ],
  };
}

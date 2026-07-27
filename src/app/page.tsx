import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { GlobalCountySearch } from "./global-county-search";
import { NationalOverview } from "./national-overview";
import { SiteHeader } from "./site-header";
import { StateRail } from "./state-rail";
import { StateSwitcher } from "./state-switcher";
import { WorkspaceTabs } from "./workspace-tabs";
import { equipmentCatalogMetadata } from "@/lib/equipment-catalog";
import { isEquipmentExplorerEnabled } from "@/lib/equipment-explorer-config";
import {
  toWorkspaceLayoutManifestV3,
  workspaceLayoutManifestAnyToV2,
} from "@/lib/workspace-layout-v3";
import { resolveVisibleWorkspaceTabV2 } from "@/lib/workspace-layout-v2-runtime";
import { resolveWorkspaceLayout } from "@/lib/workspace-layout-runtime";
import {
  getCoverageSummary,
  listAdminSourceStatuses,
  listCompletenessReport,
  listElectronicIntegrityArtifacts,
  listElectronicIntegrityRequests,
  listEquipmentRows,
  listSecurityIncidents,
  listHistoricalResultRows,
  listImportRuns,
  listIndicators,
  listReviewRows,
  listResults,
  listSourceRecordsRequests,
  listSources,
  listStates,
  listTurnoutRows,
  listVoteMethodRows,
} from "@/lib/api";
import { summarizeIndicatorEvaluation } from "@/lib/analysis-indicators";
import {
  isSupportedPresidentialYear,
  type SupportedPresidentialYear,
} from "@/lib/api-version";
import { buildStateSocialPreview } from "@/lib/social-preview";
import { listSecurityIncidentStateSummaries } from "@/lib/security-incidents";
import { historicalCountyRowsToResults } from "@/lib/state-year-results";

const mapModes = new Set(["winner", "margin", "volume", "method", "equipment", "security"]);
const securityIncidentStateSummaries = listSecurityIncidentStateSummaries(2024);

type HomeProps = {
  searchParams?: Promise<{
    fips?: string;
    mode?: string;
    state?: string;
    tab?: string;
    year?: string;
  }>;
};

function parseYear(value?: string): SupportedPresidentialYear {
  const parsed = Number(value);
  return isSupportedPresidentialYear(parsed) ? parsed : 2024;
}

async function loadDisplayResults(state: string, year: SupportedPresidentialYear) {
  if (year !== 2024) {
    const historicalRows = await listHistoricalResultRows({ state, year, limit: 5000 });
    return {
      countyResults: historicalCountyRowsToResults(historicalRows, year),
      cityResults: [],
      cityTownResults: [],
      townResults: [],
      stateResults: [],
      federalPrecinctResults: [],
      nonGeographicResults: [],
    };
  }

  const [
    countyResults,
    cityResults,
    cityTownResults,
    townResults,
    stateResults,
    federalPrecinctResults,
    nonGeographicResults,
  ] = await Promise.all([
    listResults({ state, year, level: "county" }),
    listResults({ state, year, level: "city" }),
    listResults({ state, year, level: "city_town" }),
    listResults({ state, year, level: "town" }),
    listResults({ state, year, level: "state" }),
    listResults({ state, year, level: "federal_precincts" }),
    listResults({ state, year, level: "non_geographic" }),
  ]);

  return {
    countyResults,
    cityResults,
    cityTownResults,
    townResults,
    stateResults,
    federalPrecinctResults,
    nonGeographicResults,
  };
}

async function loadDisplaySources(state: string, year: SupportedPresidentialYear) {
  const sources = await listSources({ state, year });
  if (sources.length || year === 2024) {
    return sources;
  }
  return listSources({ state, year: 2024 });
}

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const params = await searchParams;
  const year = parseYear(params?.year);
  const preview = await buildStateSocialPreview({ state: params?.state, year });

  return {
    title: preview.title,
    description: preview.description,
    alternates: {
      canonical: preview.urlPath,
    },
    openGraph: {
      type: "website",
      title: preview.title,
      description: preview.description,
      url: preview.socialUrlPath,
      siteName: "Civic Result Maps",
      images: [
        {
          url: preview.imagePath,
          width: 1200,
          height: 630,
          alt: preview.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: preview.title,
      description: preview.description,
      images: [
        {
          url: preview.imagePath,
          alt: preview.imageAlt,
        },
      ],
    },
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const layoutResolution = await resolveWorkspaceLayout();
  const layoutManifestV3 = toWorkspaceLayoutManifestV3(layoutResolution.envelope.manifest);
  const layoutManifest = workspaceLayoutManifestAnyToV2(layoutResolution.envelope.manifest);
  const selectedState = (params?.state ?? "WA").slice(0, 2).toUpperCase();
  const activeTab = resolveVisibleWorkspaceTabV2(layoutManifest, params?.tab);
  const requestedYear = parseYear(params?.year);
  const selectedYear = activeTab === "map" ? requestedYear : 2024;
  const requestedMapMode = mapModes.has(params?.mode ?? "")
    ? params?.mode as "winner" | "margin" | "volume" | "method" | "equipment" | "security"
    : undefined;
  const initialMapMode = selectedYear === 2024
    || requestedMapMode === "winner" || requestedMapMode === "margin" || requestedMapMode === "volume"
    ? requestedMapMode
    : undefined;
  const initialFips = /^\d{5}$/.test(params?.fips ?? "") ? params?.fips : undefined;

  const needsReview = ["map", "review", "methodology", "exports"].includes(activeTab);
  const needsIndicators = activeTab === "map" || needsReview;
  const needsTurnout = ["history", "data", "exports"].includes(activeTab);
  const needsHistory = ["history", "data", "exports"].includes(activeTab);
  const needsMethods = selectedYear === 2024 && ["map", "electronic", "data", "exports"].includes(activeTab);
  const needsSecurity = selectedYear === 2024 && ["map", "data", "exports"].includes(activeTab);
  const needsImports = ["review", "data", "exports", "imports"].includes(activeTab);

  const [
    states,
    completenessReport,
    resultBundle,
    sources,
    coverage,
    importRuns,
    indicators,
    reviewRows,
    turnoutRows,
    historicalRows,
    voteMethodRows,
    equipmentRows,
    securityIncidents,
    adminSourceStatuses,
    electronicIntegrityArtifacts,
    electronicIntegrityRequests,
    sourceRecordsRequests,
  ] = await Promise.all([
    listStates(),
    listCompletenessReport({ year: 2024 }),
    loadDisplayResults(selectedState, selectedYear),
    loadDisplaySources(selectedState, selectedYear),
    getCoverageSummary({ state: selectedState, year: selectedYear }),
    needsImports ? listImportRuns() : Promise.resolve([]),
    needsIndicators ? listIndicators({ state: selectedState, year: selectedYear }) : Promise.resolve([]),
    needsReview
      ? listReviewRows({ state: selectedState, year: selectedYear, includeMetrics: true, limit: 5000 })
      : Promise.resolve([]),
    needsTurnout ? listTurnoutRows({ state: selectedState, year: 2024, limit: 20000 }) : Promise.resolve([]),
    needsHistory ? listHistoricalResultRows({ state: selectedState, limit: 5000 }) : Promise.resolve([]),
    needsMethods ? listVoteMethodRows({ state: selectedState, year: 2024, limit: 20000 }) : Promise.resolve([]),
    needsMethods ? listEquipmentRows({ state: selectedState, year: 2024, limit: 20000 }) : Promise.resolve([]),
    needsSecurity ? listSecurityIncidents({ state: selectedState, year: 2024, limit: 5000 }) : Promise.resolve([]),
    listAdminSourceStatuses({ state: selectedState, year: 2024 }),
    listElectronicIntegrityArtifacts({ state: selectedState, year: 2024 }),
    listElectronicIntegrityRequests({ state: selectedState, year: 2024 }),
    listSourceRecordsRequests({ state: selectedState, year: 2024 }),
  ]);

  const {
    countyResults,
    cityResults,
    cityTownResults,
    townResults,
    stateResults,
    federalPrecinctResults,
    nonGeographicResults,
  } = resultBundle;
  const results = countyResults.length
    ? countyResults
    : cityResults.length
      ? cityResults
      : cityTownResults.length
        ? cityTownResults
        : townResults.length
          ? townResults
          : stateResults;
  const availableResultFips = new Set(results.flatMap((row) => {
    const taggedFips = row.jurisdictionTag?.match(/^county:(\d{5})$/)?.[1];
    const codeFips = row.level === "county" && /^\d{5}$/.test(row.jurisdictionCode)
      ? row.jurisdictionCode
      : undefined;
    const fips = taggedFips ?? codeFips;
    return fips ? [fips] : [];
  }));
  const validatedInitialFips = initialFips && availableResultFips.has(initialFips)
    ? initialFips
    : undefined;
  const statewideResultRows = results[0]?.level === "state"
    ? results
    : Array.from(
        new Map(
          [...results, ...federalPrecinctResults, ...nonGeographicResults].map((row) => [
            row.level + ":" + row.jurisdictionCode,
            row,
          ] as const),
        ).values(),
      );
  const resultLevelLabel =
    results[0]?.level === "city" || results[0]?.level === "city_town" || results[0]?.level === "town"
      ? "Municipality"
      : results[0]?.level === "state"
        ? "Statewide"
        : undefined;
  const selected = states.find((state) => state.code === selectedState);
  const selectedStateCode = selected?.code ?? selectedState;
  const selectedCompleteness = completenessReport.find((summary) => summary.state === selectedStateCode);
  const totalVotes = statewideResultRows.reduce((sum, row) => sum + row.totalVotes, 0);
  const historicalCoverageReady = selectedYear !== 2024 && results.length > 0;
  const indicatorsEvaluated = Boolean(coverage?.capabilities.reviewGraphs || indicators.length || reviewRows.length);
  const indicatorEvaluation = summarizeIndicatorEvaluation(
    reviewRows.map((row) => ({ jurisdictionName: row.jurisdictionName })),
    indicators,
  );
  const displayCoverage = selectedYear === 2024 || !coverage
    ? coverage
    : {
        ...coverage,
        expectedJurisdictions: Math.max(coverage.expectedJurisdictions, results.length),
        loadedJurisdictions: results.length,
        resultRows: results.length,
        validation: {
          passed: historicalCoverageReady,
          warnings: historicalCoverageReady
            ? [indicatorsEvaluated
                ? "Historical county rows use canonical county:<GEOID> joins. Same-year advisory indicators are overlaid; 2024 administration layers remain separate."
                : "Historical county rows use canonical county:<GEOID> joins. This state-year has not been evaluated for advisory indicators; 2024 administration layers remain separate."]
            : ["No comparable canonical county rows are available for this state and year."],
          errors: [],
        },
        capabilities: {
          ...coverage.capabilities,
          certifiedResults: historicalCoverageReady,
          historicalBaseline: historicalCoverageReady,
          map: historicalCoverageReady,
        },
      };
  const equipmentExplorerEnabled = isEquipmentExplorerEnabled({
    catalogChannel: equipmentCatalogMetadata.channel,
    productionReady: equipmentCatalogMetadata.productionReady,
  });

  return (
    <main className="app-shell">
      {layoutResolution.source === "draft" && (
        <aside className="layout-preview-banner" role="status">
          <span><strong>Draft layout preview</strong> Revision {layoutResolution.envelope.revisionId.slice(0, 8)} is visible only in this authenticated browser.</span>
          <form action="/admin/layout/preview/exit" method="post">
            <button type="submit">Exit preview</button>
          </form>
        </aside>
      )}
      <SiteHeader
        activePage="workspace"
        equipmentEnabled={equipmentExplorerEnabled}
        live
        subtitle="National election result data platform"
        tourId="workspace"
      />

      <div className="workspace">
        <StateRail loadedCount={states.length} selectedState={selectedStateCode}>
          <StateSwitcher
            completenessReport={completenessReport}
            navigationContext={{
              fips: validatedInitialFips,
              mode: initialMapMode,
              state: selectedStateCode,
              tab: activeTab,
              year: selectedYear,
            }}
            securityIncidentStates={securityIncidentStateSummaries}
            selectedState={selectedStateCode}
            states={states}
          />
        </StateRail>

        <section className="main-panel">
          <WorkspaceTabs
            adminSourceStatus={adminSourceStatuses.states[0]}
            coverage={displayCoverage}
            countyLabel={resultLevelLabel ?? selected?.countyLabel ?? "County"}
            electionYear={selectedYear}
            electronicIntegrityStatus={electronicIntegrityArtifacts.states[0]}
            electronicIntegrityRequests={electronicIntegrityRequests}
            equipmentExplorerEnabled={equipmentExplorerEnabled}
            equipmentRows={equipmentRows}
            historicalRows={historicalRows}
            historicalBroadSignalWarning={indicatorEvaluation.broadSignalWarning ?? undefined}
            importRuns={importRuns}
            indicators={indicators}
            indicatorsEvaluated={indicatorsEvaluated}
            layoutManifest={layoutManifest}
            layoutManifestV3={layoutResolution.runtimeV3Enabled ? layoutManifestV3 : undefined}
            initialFips={validatedInitialFips}
            initialMapMode={initialMapMode}
            initialTab={activeTab}
            reviewRows={reviewRows}
            results={results}
            selectedCompleteness={selectedCompleteness}
            selectedState={selected}
            selectedStateCode={selectedStateCode}
            sourceRecordsRequests={sourceRecordsRequests}
            sources={sources}
            states={states}
            statewideResultRows={statewideResultRows}
            totalVotes={totalVotes}
            turnoutRows={turnoutRows}
            voteMethodRows={voteMethodRows}
            securityIncidents={securityIncidents}
          />

          <section aria-label="Additional workspace tools" className="workspace-supporting-tools">
            <section aria-labelledby="county-profile-jump-title" className="workspace-county-jump">
              <div className="workspace-county-jump-copy">
                <span aria-hidden className="workspace-county-jump-icon"><MapPin size={18} /></span>
                <div>
                  <div className="workspace-county-jump-heading">
                    <p className="section-label">County profiles</p>
                    <span>Separate page</span>
                  </div>
                  <h2 id="county-profile-jump-title">Open a county profile</h2>
                  <p>Search nationwide by county name or five-digit FIPS. This opens a separate county history page and does not filter the state map.</p>
                </div>
              </div>
              <GlobalCountySearch
                className="workspace-county-search"
                defaultState={selectedStateCode}
                key={"county-profile-search-" + selectedStateCode}
                label="County or FIPS"
                placeholder="Enter county name, alias, or five-digit FIPS"
              />
            </section>

            <NationalOverview report={completenessReport} year={2024} />
          </section>
        </section>
      </div>
    </main>
  );
}

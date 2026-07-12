import type { Metadata } from "next";
import {
  Archive,
  Braces,
  CheckCircle2,
  CircleDashed,
  Database,
  GitCompareArrows,
  Radar,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { GlobalCountySearch } from "./global-county-search";
import { NationalOverview } from "./national-overview";
import { StateSwitcher } from "./state-switcher";
import { WorkspaceTabs } from "./workspace-tabs";
import {
  getCoverageSummary,
  listAdminSourceStatuses,
  listCompletenessReport,
  listElectronicIntegrityArtifacts,
  listElectronicIntegrityRequests,
  listEquipmentRows,
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
import {
  isSupportedPresidentialYear,
  supportedPresidentialYears,
  type SupportedPresidentialYear,
} from "@/lib/api-version";
import { buildStateSocialPreview } from "@/lib/social-preview";
import { historicalCountyRowsToResults } from "@/lib/state-year-results";

const workspaceTabs = new Set([
  "map",
  "review",
  "history",
  "electronic",
  "planner",
  "data",
  "methodology",
  "exports",
  "imports",
  "support",
  "contact",
]);
const mapModes = new Set(["winner", "margin", "volume", "method", "equipment"]);

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
  const selectedState = (params?.state ?? "WA").slice(0, 2).toUpperCase();
  const activeTab = workspaceTabs.has(params?.tab ?? "") ? params?.tab ?? "map" : "map";
  const requestedYear = parseYear(params?.year);
  const selectedYear = activeTab === "map" ? requestedYear : 2024;
  const requestedMapMode = mapModes.has(params?.mode ?? "")
    ? params?.mode as "winner" | "margin" | "volume" | "method" | "equipment"
    : undefined;
  const initialMapMode = selectedYear === 2024
    || requestedMapMode === "winner" || requestedMapMode === "margin" || requestedMapMode === "volume"
    ? requestedMapMode
    : undefined;
  const initialFips = /^\d{5}$/.test(params?.fips ?? "") ? params?.fips : undefined;

  const needsReview = selectedYear === 2024 && ["map", "review", "methodology", "exports"].includes(activeTab);
  const needsTurnout = ["history", "data", "exports"].includes(activeTab);
  const needsHistory = ["history", "data", "exports"].includes(activeTab);
  const needsMethods = selectedYear === 2024 && ["map", "electronic", "data", "exports"].includes(activeTab);
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
    needsReview ? listIndicators({ state: selectedState, year: 2024 }) : Promise.resolve([]),
    needsReview
      ? listReviewRows({ state: selectedState, year: 2024, includeMetrics: true, limit: 5000 })
      : Promise.resolve([]),
    needsTurnout ? listTurnoutRows({ state: selectedState, year: 2024, limit: 20000 }) : Promise.resolve([]),
    needsHistory ? listHistoricalResultRows({ state: selectedState, limit: 5000 }) : Promise.resolve([]),
    needsMethods ? listVoteMethodRows({ state: selectedState, year: 2024, limit: 20000 }) : Promise.resolve([]),
    needsMethods ? listEquipmentRows({ state: selectedState, year: 2024, limit: 20000 }) : Promise.resolve([]),
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
            ? ["Historical county rows use canonical county:<GEOID> joins; 2024 review and administration layers are intentionally not overlaid."]
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
  const coveragePassed = selectedYear === 2024
    ? Boolean(displayCoverage?.validation.passed)
    : historicalCoverageReady;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>Civic Result Maps</strong>
            <span>National election result data platform</span>
          </div>
        </div>
        <div className="topbar-actions">
          <a className="topbar-link" href="/compare">
            <GitCompareArrows aria-hidden size={15} />
            Compare
          </a>
          <a className="topbar-link" href="/evidence">
            <Radar aria-hidden size={15} />
            Evidence
          </a>
          <a className="topbar-link" href="/releases">
            <Archive aria-hidden size={15} />
            Releases
          </a>
          <a className="topbar-link" href="/developers">
            <Braces aria-hidden size={15} />
            API
          </a>
          <a className="topbar-link" data-tour="readiness-link" href="/readiness">
            <Database aria-hidden size={15} />
            Readiness
          </a>
          <span className="live-dot">Database live</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" data-tour="state-sidebar" aria-label="State coverage">
          <div className="sidebar-header">
            <p className="section-label">States</p>
            <span>{states.length} loaded</span>
          </div>
          <StateSwitcher completenessReport={completenessReport} selectedState={selectedStateCode} states={states} />
        </aside>

        <section className="main-panel">
          <NationalOverview report={completenessReport} year={2024} />

          <div className="workspace-search-row">
            <GlobalCountySearch defaultState={selectedStateCode} label="Jump to any county profile" />
          </div>

          <div className="dashboard-head">
            <div>
              <p className="section-label">{selectedYear} President</p>
              <h1>{selected?.name ?? selectedStateCode}</h1>
              <nav className="year-switcher" aria-label="Presidential result year">
                {supportedPresidentialYears.map((year) => (
                  <a
                    aria-current={year === selectedYear ? "page" : undefined}
                    href={"/?state=" + selectedStateCode + "&year=" + year + "&tab=map"}
                    key={year}
                  >
                    {year}
                  </a>
                ))}
              </nav>
            </div>
            <div className="head-status">
              {coveragePassed ? (
                <CheckCircle2 aria-hidden size={18} />
              ) : (
                <CircleDashed aria-hidden size={18} />
              )}
              <span>{coveragePassed ? "Validated canonical coverage" : "Coverage gap"}</span>
            </div>
          </div>

          {selectedYear !== 2024 && (
            <p className="historical-map-note">
              Historical mode shows canonical county presidential rows only. Review indicators, vote methods,
              equipment, and administration records remain 2024 context and are not overlaid on this map.
            </p>
          )}

          <section className="metrics-grid" aria-label="Platform metrics">
            <div className="metric">
              <span>Jurisdictions</span>
              <strong>{displayCoverage?.loadedJurisdictions ?? results.length}</strong>
            </div>
            <div className="metric">
              <span>Total votes</span>
              <strong>{totalVotes.toLocaleString()}</strong>
            </div>
            <div className="metric">
              <span>Sources</span>
              <strong>{sources.length}</strong>
            </div>
            <div className="metric">
              <span>Validation</span>
              <strong>{coveragePassed ? "Pass" : "Gap"}</strong>
            </div>
          </section>

          <WorkspaceTabs
            adminSourceStatus={adminSourceStatuses.states[0]}
            coverage={displayCoverage}
            countyLabel={resultLevelLabel ?? selected?.countyLabel ?? "County"}
            electionYear={selectedYear}
            electronicIntegrityStatus={electronicIntegrityArtifacts.states[0]}
            electronicIntegrityRequests={electronicIntegrityRequests}
            equipmentRows={equipmentRows}
            historicalRows={historicalRows}
            importRuns={importRuns}
            indicators={indicators}
            initialFips={initialFips}
            initialMapMode={initialMapMode}
            initialTab={activeTab}
            reviewRows={reviewRows}
            results={results}
            selectedCompleteness={selectedCompleteness}
            selectedState={selected}
            selectedStateCode={selectedStateCode}
            sourceRecordsRequests={sourceRecordsRequests}
            sources={sources}
            statewideResultRows={statewideResultRows}
            totalVotes={totalVotes}
            turnoutRows={turnoutRows}
            voteMethodRows={voteMethodRows}
          />
        </section>
      </div>
    </main>
  );
}

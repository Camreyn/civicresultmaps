import type { Metadata } from "next";
import {
  CheckCircle2,
  CircleDashed,
  Radar,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
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
import { buildStateSocialPreview } from "@/lib/social-preview";

const selectedYear = 2024;

type HomeProps = {
  searchParams?: Promise<{
    state?: string;
  }>;
};

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const params = await searchParams;
  const preview = await buildStateSocialPreview({ state: params?.state, year: selectedYear });

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
  const [
    states,
    completenessReport,
    countyResults,
    cityResults,
    cityTownResults,
    townResults,
    stateResults,
    federalPrecinctResults,
    nonGeographicResults,
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
    listCompletenessReport({ year: selectedYear }),
    listResults({ state: selectedState, year: selectedYear, level: "county" }),
    listResults({ state: selectedState, year: selectedYear, level: "city" }),
    listResults({ state: selectedState, year: selectedYear, level: "city_town" }),
    listResults({ state: selectedState, year: selectedYear, level: "town" }),
    listResults({ state: selectedState, year: selectedYear, level: "state" }),
    listResults({ state: selectedState, year: selectedYear, level: "federal_precincts" }),
    listResults({ state: selectedState, year: selectedYear, level: "non_geographic" }),
    listSources({ state: selectedState, year: selectedYear }),
    getCoverageSummary({ state: selectedState, year: selectedYear }),
    listImportRuns(),
    listIndicators({ state: selectedState, year: selectedYear }),
    listReviewRows({ state: selectedState, year: selectedYear, includeMetrics: true, limit: 5000 }),
    listTurnoutRows({ state: selectedState, year: selectedYear, limit: 20000 }),
    listHistoricalResultRows({ state: selectedState, limit: 5000 }),
    listVoteMethodRows({ state: selectedState, year: selectedYear, limit: 20000 }),
    listEquipmentRows({ state: selectedState, year: selectedYear, limit: 20000 }),
    listAdminSourceStatuses({ state: selectedState, year: selectedYear }),
    listElectronicIntegrityArtifacts({ state: selectedState, year: selectedYear }),
    listElectronicIntegrityRequests({ state: selectedState, year: selectedYear }),
    listSourceRecordsRequests({ state: selectedState, year: selectedYear }),
  ]);
  const results = countyResults.length ? countyResults : cityResults.length ? cityResults : cityTownResults.length ? cityTownResults : townResults.length ? townResults : stateResults;
  const statewideResultRows = results[0]?.level === "state"
    ? results
    : Array.from(
        new Map(
          [...results, ...federalPrecinctResults, ...nonGeographicResults].map((row) => [
            `${row.level}:${row.jurisdictionCode}`,
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
  const totalVotes = results.reduce((sum, row) => sum + row.totalVotes, 0);

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
          <a className="topbar-link" href="/?tab=support">
            Support
          </a>
          <a className="topbar-link" href="/timeline">
            <Radar aria-hidden size={15} />
            Timeline
          </a>
          <a className="topbar-link" data-tour="readiness-link" href="/readiness">
            Readiness
          </a>
          <span className="live-dot">Database live</span>
          <span className="domain">civicresultmaps.org</span>
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
          <NationalOverview report={completenessReport} year={selectedYear} />

          <div className="dashboard-head">
            <div>
              <p className="section-label">2024 President</p>
              <h1>{selected?.name ?? selectedStateCode}</h1>
            </div>
            <div className="head-status">
              {coverage?.validation.passed ? (
                <CheckCircle2 aria-hidden size={18} />
              ) : (
                <CircleDashed aria-hidden size={18} />
              )}
              <span>{coverage?.validation.passed ? "Validated coverage" : "Coverage gap"}</span>
            </div>
          </div>

          <section className="metrics-grid" aria-label="Platform metrics">
            <div className="metric">
              <span>Jurisdictions</span>
              <strong>{coverage?.loadedJurisdictions ?? results.length}</strong>
            </div>
            <div className="metric">
              <span>Total votes</span>
              <strong>{totalVotes.toLocaleString()}</strong>
            </div>
            <div className="metric">
              <span>Sources</span>
              <strong>{coverage?.sourceCount ?? 0}</strong>
            </div>
            <div className="metric">
              <span>Validation</span>
              <strong>{coverage?.validation.passed ? "Pass" : "Gap"}</strong>
            </div>
          </section>

          <WorkspaceTabs
            coverage={coverage}
            countyLabel={resultLevelLabel ?? selected?.countyLabel ?? "County"}
            historicalRows={historicalRows}
            importRuns={importRuns}
            indicators={indicators}
            reviewRows={reviewRows}
            results={results}
            statewideResultRows={statewideResultRows}
            selectedCompleteness={selectedCompleteness}
            selectedState={selected}
            selectedStateCode={selectedStateCode}
            sources={sources}
            totalVotes={totalVotes}
            turnoutRows={turnoutRows}
            voteMethodRows={voteMethodRows}
            equipmentRows={equipmentRows}
            adminSourceStatus={adminSourceStatuses.states[0]}
            electronicIntegrityStatus={electronicIntegrityArtifacts.states[0]}
            electronicIntegrityRequests={electronicIntegrityRequests}
            sourceRecordsRequests={sourceRecordsRequests}
          />
        </section>
      </div>
    </main>
  );
}

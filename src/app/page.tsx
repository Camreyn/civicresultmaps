import {
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import { StateSwitcher } from "./state-switcher";
import { WorkspaceTabs } from "./workspace-tabs";
import {
  getCoverageSummary,
  listImportRuns,
  listIndicators,
  listResults,
  listSources,
  listStates,
} from "@/lib/api";

const selectedYear = 2024;

type HomeProps = {
  searchParams?: Promise<{
    state?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const selectedState = (params?.state ?? "WA").slice(0, 2).toUpperCase();
  const [states, results, sources, coverage, importRuns, indicators] = await Promise.all([
    listStates(),
    listResults({ state: selectedState, year: selectedYear, level: "county" }),
    listSources({ state: selectedState, year: selectedYear }),
    getCoverageSummary({ state: selectedState, year: selectedYear }),
    listImportRuns(),
    listIndicators({ state: selectedState, year: selectedYear }),
  ]);
  const selected = states.find((state) => state.code === selectedState);
  const selectedStateCode = selected?.code ?? selectedState;
  const totalVotes = results.reduce((sum, row) => sum + row.totalVotes, 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            CRM
          </span>
          <div>
            <strong>Civic Result Maps</strong>
            <span>National election result data platform</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="live-dot">Database live</span>
          <span className="domain">civicresultmaps.org</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="State coverage">
          <div className="sidebar-header">
            <p className="section-label">States</p>
            <span>{states.length} loaded</span>
          </div>
          <StateSwitcher selectedState={selectedStateCode} states={states} />
        </aside>

        <section className="main-panel">
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
            countyLabel={selected?.countyLabel ?? "County"}
            importRuns={importRuns}
            indicators={indicators}
            results={results}
            selectedState={selected}
            selectedStateCode={selectedStateCode}
            sources={sources}
            totalVotes={totalVotes}
          />
        </section>
      </div>
    </main>
  );
}

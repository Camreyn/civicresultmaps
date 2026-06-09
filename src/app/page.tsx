import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Database,
  FileCheck2,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { ResultsExplorer } from "./results-explorer";
import { StateSwitcher } from "./state-switcher";
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

function formatCapability(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

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

          <div className="content-grid">
            <ResultsExplorer
              countyLabel={selected?.countyLabel ?? "County"}
              indicators={indicators}
              results={results}
              selectedState={selectedStateCode}
            />
            <div className="detail-stack">
              <section className="panel" aria-label="Provenance">
                <div className="panel-header">
                  <div>
                    <h2>Source Provenance</h2>
                    <span>Authority, parser, and confidence</span>
                  </div>
                  <FileCheck2 aria-hidden size={18} />
                </div>
                <ul className="source-list">
                  {sources.map((source) => (
                    <li key={source.id}>
                      <strong>{source.title}</strong>
                      <span>{source.confidence}</span>
                      <span className="mono">{source.parser}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="panel" aria-label="Coverage flags">
                <div className="panel-header">
                  <div>
                    <h2>Coverage</h2>
                    <span>Loaded platform capabilities</span>
                  </div>
                  <ShieldCheck aria-hidden size={18} />
                </div>
                <ul className="flag-list">
                  {coverage &&
                    Object.entries(coverage.capabilities)
                      .filter(([key]) => key !== "notes")
                      .map(([key, value]) => (
                        <li key={key}>
                          <strong>{formatCapability(key)}</strong>
                          <span className={value ? "available" : "pending"}>
                            {value ? "Available" : "Pending"}
                          </span>
                        </li>
                      ))}
                </ul>
              </section>
            </div>
          </div>

          <div className="content-grid" style={{ marginTop: 18 }}>
            <section className="panel" aria-label="Public API">
              <div className="panel-header">
                <div>
                  <h2>Public API</h2>
                  <span>Read endpoints for the selected view</span>
                </div>
                <Database aria-hidden size={18} />
              </div>
              <ul className="api-list">
                <li>
                  <strong>States</strong>
                  <code>/api/states</code>
                </li>
                <li>
                  <strong>Results</strong>
                  <code>/api/results?state={selectedStateCode}&amp;year=2024&amp;level=county</code>
                </li>
                <li>
                  <strong>Sources</strong>
                  <code>/api/sources?state={selectedStateCode}&amp;year=2024</code>
                </li>
                <li>
                  <strong>Coverage</strong>
                  <code>/api/coverage?state={selectedStateCode}&amp;year=2024</code>
                </li>
              </ul>
            </section>

            <section className="panel" aria-label="Import runs">
              <div className="panel-header">
                <div>
                  <h2>Import Runs</h2>
                  <span>ETL status and parser history</span>
                </div>
                {importRuns.length ? <GitBranch aria-hidden size={18} /> : <Activity aria-hidden size={18} />}
              </div>
              <ul className="source-list">
                {importRuns.length ? (
                  importRuns.map((run) => (
                    <li key={run.id}>
                      <strong>{run.id}</strong>
                      <span>
                        {run.state} {run.electionYear} through {run.parser}
                      </span>
                      <span className="mono">{run.status}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <strong>No import run records yet</strong>
                    <span>Promotion records will appear here as the ETL pipeline expands.</span>
                  </li>
                )}
              </ul>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

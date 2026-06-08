import { Database, FileCheck2, GitBranch, ShieldCheck } from "lucide-react";
import { getCoverageSummary, listImportRuns, listResults, listSources, listStates } from "@/lib/api";

const selectedState = "WI";
const selectedYear = 2024;

export default async function Home() {
  const [states, results, sources, coverage, importRuns] = await Promise.all([
    listStates(),
    listResults({ state: selectedState, year: selectedYear, level: "county" }),
    listSources({ state: selectedState, year: selectedYear }),
    getCoverageSummary({ state: selectedState, year: selectedYear }),
    listImportRuns(),
  ]);
  const selected = states.find((state) => state.code === selectedState);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>Civic Result Maps</strong>
          <span>Election data platform and public API</span>
        </div>
        <span className="domain">civicresultmaps.org</span>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="State coverage">
          <p className="section-label">Loaded states</p>
          <div className="state-list">
            {states.map((state) => (
              <button
                aria-pressed={state.code === selectedState}
                className="state-button"
                key={state.code}
                type="button"
              >
                <strong>
                  {state.name} <span className="mono">{state.code}</span>
                </strong>
                <span>{state.authority}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="main-panel">
          <div className="hero">
            <h1>Public election results, normalized with provenance.</h1>
            <p>
              Civic Result Maps is moving the legacy static result explorer into a database-backed
              national platform with reviewed ETL, public read APIs, and source-aware coverage
              reporting.
            </p>
          </div>

          <section className="metrics-grid" aria-label="Platform metrics">
            <div className="metric">
              <span>Selected state</span>
              <strong>{selected?.code ?? selectedState}</strong>
            </div>
            <div className="metric">
              <span>Result rows</span>
              <strong>{coverage?.resultRows ?? 0}</strong>
            </div>
            <div className="metric">
              <span>Sources</span>
              <strong>{coverage?.sourceCount ?? 0}</strong>
            </div>
            <div className="metric">
              <span>Validation</span>
              <strong>{coverage?.validation.passed ? "PASS" : "GAP"}</strong>
            </div>
          </section>

          <div className="content-grid">
            <section className="panel" aria-label="County results">
              <div className="panel-header">
                <h2>{selected?.name} county results</h2>
                <span className="status-pill">Seed API contract</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Jurisdiction</th>
                      <th>Winner</th>
                      <th>Total</th>
                      <th>Margin</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.jurisdictionCode}>
                        <td>{row.jurisdictionName}</td>
                        <td className={row.winner === "Harris" ? "winner-harris" : "winner-trump"}>
                          {row.winner}
                        </td>
                        <td className="mono">{row.totalVotes.toLocaleString()}</td>
                        <td className="mono">
                          {row.marginVotes.toLocaleString()} ({row.marginPct.toFixed(2)}%)
                        </td>
                        <td className="mono">{row.sourceId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="detail-stack">
              <section className="panel" aria-label="Provenance">
                <div className="panel-header">
                  <h2>Source provenance</h2>
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
                  <h2>Coverage</h2>
                  <ShieldCheck aria-hidden size={18} />
                </div>
                <ul className="flag-list">
                  {coverage &&
                    Object.entries(coverage.capabilities)
                      .filter(([key]) => key !== "notes")
                      .map(([key, value]) => (
                        <li key={key}>
                          <strong>{key}</strong>
                          <span>{value ? "Available" : "Not loaded yet"}</span>
                        </li>
                      ))}
                </ul>
              </section>
            </div>
          </div>

          <div className="content-grid" style={{ marginTop: 18 }}>
            <section className="panel" aria-label="Public API">
              <div className="panel-header">
                <h2>Public API</h2>
                <Database aria-hidden size={18} />
              </div>
              <ul className="api-list">
                <li>
                  <strong>States</strong>
                  <code>/api/states</code>
                </li>
                <li>
                  <strong>Results</strong>
                  <code>/api/results?state=WI&amp;year=2024&amp;level=county</code>
                </li>
                <li>
                  <strong>Sources</strong>
                  <code>/api/sources?state=WI&amp;year=2024</code>
                </li>
                <li>
                  <strong>Coverage</strong>
                  <code>/api/coverage?state=WI&amp;year=2024</code>
                </li>
              </ul>
            </section>

            <section className="panel" aria-label="Import runs">
              <div className="panel-header">
                <h2>Import runs</h2>
                <GitBranch aria-hidden size={18} />
              </div>
              <ul className="source-list">
                {importRuns.map((run) => (
                  <li key={run.id}>
                    <strong>{run.id}</strong>
                    <span>
                      {run.state} {run.electionYear} through {run.parser}
                    </span>
                    <span className="mono">{run.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

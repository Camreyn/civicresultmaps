import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Database,
  ExternalLink,
  MapPinned,
  Search,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { BrandMark } from "@/app/brand-mark";
import { GlobalCountySearch } from "@/app/global-county-search";
import { findCanonicalCountyByFips } from "@/lib/county-search";
import { loadCountyProfile, type CountyProfile } from "@/lib/county-profile";
import {
  formatIndicatorScopeSummary,
  presentIndicatorScope,
  summarizeIndicatorScopes,
} from "@/lib/indicator-presentation";
import type { DataConfidence } from "@/lib/data-confidence";
import styles from "./county-profile.module.css";

type CountyPageProps = { params: Promise<{ fips: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CountyPageProps): Promise<Metadata> {
  const { fips } = await params;
  const county = findCanonicalCountyByFips(fips);
  if (!county) {
    return {
      title: "County profile not found",
      robots: { follow: false, index: false },
    };
  }
  return {
    title: `${county.displayName}, ${county.state} election profile`,
    description: `Presidential vote history, turnout, provenance, equipment context, and advisory review context for ${county.displayName}, FIPS ${county.fips}.`,
    alternates: { canonical: `/county/${county.fips}` },
  };
}

function formatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function formatPct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function confidenceClass(confidence: DataConfidence) {
  return `${styles.confidence} ${styles[`confidence_${confidence.level}`] ?? ""}`;
}

function ConfidenceBadge({ confidence }: { confidence: DataConfidence }) {
  return (
    <span className={confidenceClass(confidence)} title={[confidence.description, confidence.caveat].filter(Boolean).join(" ")}>
      {confidence.shortLabel}
    </span>
  );
}

function SourceLink({ profile, sourceId }: { profile: CountyProfile; sourceId: string }) {
  const source = profile.sources.find((candidate) => candidate.id === sourceId);
  if (!source?.sourceUrl) return <span className={styles.muted}>{source?.title ?? sourceId}</span>;
  return (
    <a className={styles.sourceLink} href={source.sourceUrl} rel="noreferrer" target="_blank">
      {source.title}
      <ExternalLink aria-hidden size={12} />
    </a>
  );
}

export default async function CountyPage({ params }: CountyPageProps) {
  const { fips } = await params;
  if (!/^\d{5}$/.test(fips)) notFound();
  const profile = await loadCountyProfile(fips);
  if (!profile) notFound();

  const availableYears = profile.history.filter((row) => row.available).length;
  const advisorySummary = summarizeIndicatorScopes(profile.advisoryIndicators);
  const compareHref = `/compare?from=2020&to=2024&fips=${profile.fips}`;
  const stateHref = `/?state=${profile.state}&tab=map&fips=${profile.fips}`;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <span>
            <strong>Civic Result Maps</strong>
            <small>County election profile</small>
          </span>
        </a>
        <nav aria-label="County profile navigation">
          <a href="/"><ArrowLeft aria-hidden size={15} /> Workspace</a>
          <a href="/compare"><BarChart3 aria-hidden size={15} /> Compare</a>
          <a href="/developers"><Database aria-hidden size={15} /> API</a>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{profile.stateName} · {profile.geographyLevel.replaceAll("_", " ")}</p>
            <h1>{profile.displayName}</h1>
            <div className={styles.identity}>
              <code>FIPS {profile.fips}</code>
              <code>{profile.jurisdictionTag}</code>
              <ConfidenceBadge confidence={profile.confidence} />
            </div>
            {profile.aliases.length ? (
              <p className={styles.aliases}><strong>Also indexed as:</strong> {profile.aliases.join(", ")}</p>
            ) : null}
            <p className={styles.lede}>
              A permanent, source-linked view of the county&apos;s 2016, 2020, and 2024 presidential history,
              turnout, election-administration context, and non-conclusive review signals.
            </p>
            <div className={styles.actions}>
              <a className={styles.primaryAction} href={stateHref}>
                <MapPinned aria-hidden size={16} /> Open state map <ArrowUpRight aria-hidden size={14} />
              </a>
              <a href={compareHref}>
                <BarChart3 aria-hidden size={16} /> Compare 2020–2024
              </a>
            </div>
          </div>
          <aside className={styles.heroSearch}>
            <Search aria-hidden size={20} />
            <div>
              <h2>Find another county</h2>
              <p>Search the current canonical registry by name, alias, state, or FIPS.</p>
            </div>
            <GlobalCountySearch defaultState={profile.state} key={"county-profile-search-" + profile.state} label="County search" />
          </aside>
        </section>

        {profile.caveats.length ? (
          <section aria-labelledby="geography-notes" className={styles.notice}>
            <ShieldCheck aria-hidden size={20} />
            <div>
              <h2 id="geography-notes">Coverage and geography notes</h2>
              <ul>{profile.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="presidential-history" className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Presidential results</p>
              <h2 id="presidential-history">2016–2024 county history</h2>
            </div>
            <span>{availableYears} of 3 years available</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.resultsTable}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Democratic</th>
                  <th>Republican</th>
                  <th>Other</th>
                  <th>Total</th>
                  <th>Winner / margin</th>
                  <th>Confidence</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {profile.history.map((row) => (
                  <tr key={row.year}>
                    <th scope="row">{row.year}</th>
                    <td className={styles.demCell}>
                      <strong>{formatNumber(row.demVotes)}</strong>
                      <small>{row.candidateLabels.dem} · {formatPct(row.demSharePct)}</small>
                    </td>
                    <td className={styles.repCell}>
                      <strong>{formatNumber(row.repVotes)}</strong>
                      <small>{row.candidateLabels.rep} · {formatPct(row.repSharePct)}</small>
                    </td>
                    <td>{formatNumber(row.otherVotes)}</td>
                    <td><strong>{formatNumber(row.totalVotes)}</strong></td>
                    <td>
                      {row.available ? (
                        <span className={row.leader === "Democratic" ? styles.demText : row.leader === "Republican" ? styles.repText : ""}>
                          {row.leader} +{formatNumber(row.marginVotes)} ({formatPct(row.marginPct)})
                        </span>
                      ) : <span className={styles.muted}>No canonical row</span>}
                    </td>
                    <td><ConfidenceBadge confidence={row.confidence} /></td>
                    <td>
                      {row.source ? <SourceLink profile={profile} sourceId={row.source.id} /> : <span className={styles.muted}>Unavailable</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.footnote}>
            “Other” includes all other loaded presidential candidates and write-ins. Margin is the absolute gap between the
            Democratic and Republican vote buckets, divided by all loaded presidential votes.
          </p>
        </section>

        <div className={styles.twoColumn}>
          <section aria-labelledby="turnout-context" className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Participation</p>
                <h2 id="turnout-context">2024 turnout context</h2>
              </div>
              <ConfidenceBadge confidence={profile.turnout.confidence} />
            </div>
            {profile.turnout.available ? (
              <>
                <dl className={styles.metricGrid}>
                  <div><dt>Ballots cast</dt><dd>{formatNumber(profile.turnout.ballotsCast)}</dd></div>
                  <div><dt>Turnout denominator</dt><dd>{formatNumber(profile.turnout.registeredVoters)}</dd></div>
                  <div><dt>Reported/calculated rate</dt><dd>{formatPct(profile.turnout.turnoutPct)}</dd></div>
                  <div><dt>Reporting grain</dt><dd>{profile.turnout.level}</dd></div>
                </dl>
                {profile.turnout.denominatorNotes.map((note) => <p className={styles.contextNote} key={note}>{note}</p>)}
                {profile.turnout.source ? <SourceLink profile={profile} sourceId={profile.turnout.source.id} /> : null}
              </>
            ) : <p className={styles.empty}>No canonical county turnout row is available.</p>}
          </section>

          <section aria-labelledby="vote-method-context" className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Administration context</p>
                <h2 id="vote-method-context">Vote methods</h2>
              </div>
              <Vote aria-hidden size={20} />
            </div>
            {profile.voteMethods.length ? (
              <div className={styles.contextList}>
                {profile.voteMethods.map((row) => (
                  <article key={row.id}>
                    <span><strong>{row.methodLabel}</strong><ConfidenceBadge confidence={row.confidence} /></span>
                    <dl>
                      <div><dt>Voters</dt><dd>{formatNumber(row.voters)}</dd></div>
                      <div><dt>Share</dt><dd>{formatPct(row.methodSharePct)}</dd></div>
                    </dl>
                    <small>{[row.sourceField, row.confidence.caveat || row.valueStatus].filter(Boolean).join(" ? ")}</small>
                    {row.sourceUrl ? <a href={row.sourceUrl} rel="noreferrer" target="_blank">Open source <ExternalLink aria-hidden size={11} /></a> : null}
                  </article>
                ))}
              </div>
            ) : <p className={styles.empty}>No county-tagged vote-method rows are available.</p>}
          </section>
        </div>

        <section aria-labelledby="equipment-context" className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Administration context</p>
              <h2 id="equipment-context">Voting equipment</h2>
            </div>
            <span>{profile.equipment.length} source-linked {profile.equipment.length === 1 ? "row" : "rows"}</span>
          </div>
          <p className={styles.contextNote}>
            Equipment metadata is jurisdiction context only. It is not a vote or turnout row, does not prove or disprove an
            advisory signal, and does not guarantee every precinct or ballot mode used one identical setup.
          </p>
          {profile.equipment.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.compactTable}>
                <thead><tr><th>Vendor</th><th>System</th><th>Type / use</th><th>Paper record</th><th>Tabulation</th><th>Confidence</th><th>Source</th></tr></thead>
                <tbody>
                  {profile.equipment.map((row) => (
                    <tr key={row.id}>
                      <td>{row.vendor || "—"}</td>
                      <td>{row.systemName || "—"}</td>
                      <td>{[row.equipmentType, row.usage].filter(Boolean).join(" · ") || "—"}</td>
                      <td>{row.paperRecord || "—"}</td>
                      <td>{row.tabulation || "—"}</td>
                      <td><ConfidenceBadge confidence={row.confidence} /></td>
                      <td>{row.sourceUrl ? <a className={styles.iconLink} href={row.sourceUrl} rel="noreferrer" target="_blank">Source <ExternalLink aria-hidden size={11} /></a> : <span className={styles.muted}>{row.sourceId}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.empty}>No county-tagged equipment context is available.</p>}
        </section>

        <section aria-labelledby="advisory-context" className={`${styles.panel} ${styles.advisoryPanel}`}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Review context</p>
              <h2 id="advisory-context">Advisory indicators</h2>
            </div>
            <span>{formatIndicatorScopeSummary(advisorySummary)}</span>
          </div>
          <p className={styles.advisoryCaveat}>
            These calculated indicators are prompts for checking source data, reporting grain, denominators, and local context.
            They are not evidence or findings of fraud, misconduct, or an incorrect election outcome.
          </p>
          {profile.advisoryIndicators.length ? (
            <div className={styles.advisoryGrid}>
              {profile.advisoryIndicators.map((indicator) => (
                <article key={indicator.id}>
                  <span className={styles.scopeKind}>{presentIndicatorScope(indicator).kind}</span>
                  <strong className={styles.scopeName}>Scope: {presentIndicatorScope(indicator).name}</strong>
                  <span>{indicator.type.replaceAll("_", " ")} · severity {indicator.severity.toFixed(2)}</span>
                  <h3>{indicator.label}</h3>
                  <p>{indicator.summary}</p>
                  {indicator.detail ? <details><summary>Calculation detail</summary><p>{indicator.detail}</p></details> : null}
                </article>
              ))}
            </div>
          ) : <p className={styles.empty}>No county-tagged advisory indicators are currently published for this profile.</p>}
        </section>

        <section aria-labelledby="profile-provenance" className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Traceability</p>
              <h2 id="profile-provenance">Sources and provenance</h2>
            </div>
            <span>{profile.sources.length} referenced {profile.sources.length === 1 ? "source" : "sources"}</span>
          </div>
          <div className={styles.provenanceGrid}>
            <article>
              <span>Canonical geography</span>
              <h3>{profile.displayName} · {profile.jurisdictionTag}</h3>
              <p>Geometry registry artifact: <code>{profile.geometrySource}</code></p>
            </article>
            {profile.sources.map((source) => (
              <article key={source.id}>
                <span>{source.category}</span>
                <h3>{source.title}</h3>
                <p>{source.authority}</p>
                <small>{source.confidence}</small>
                {source.sourceUrl ? <a href={source.sourceUrl} rel="noreferrer" target="_blank">Open source <ExternalLink aria-hidden size={12} /></a> : <code>{source.id}</code>}
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <a href="/"><ArrowLeft aria-hidden size={14} /> Civic Result Maps workspace</a>
          <a href={`/api/counties/${profile.fips}`}>County profile JSON <Database aria-hidden size={14} /></a>
        </footer>
      </div>
    </main>
  );
}

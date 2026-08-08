import type { Metadata } from "next";
import { Archive, ArrowLeft, Braces, Download, GitCompareArrows } from "lucide-react";
import { BrandMark } from "../brand-mark";
import {
  getCurrentNationalDataRelease,
  listNationalDataReleases,
  type NationalDataRelease,
} from "@/lib/national-releases";
import styles from "../platform-pages.module.css";

export const metadata: Metadata = {
  title: "Public Data Releases",
  description: "Versioned Civic Result Maps election-result, equipment, and security datasets with coverage notes and bulk downloads.",
  alternates: { canonical: "/releases" },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function releaseProductLabel(release: NationalDataRelease) {
  switch (release.product) {
    case "election_equipment":
      return "Election equipment";
    case "election_security_incidents":
      return "Security incidents";
    case "historical_presidential_results":
      return "Historical results";
    case "national_county_results":
      return "National county results";
  }
}

export default function ReleasesPage() {
  const current = getCurrentNationalDataRelease();
  const releases = listNationalDataReleases();
  if (!current) {
    throw new Error("The current national county data release is missing from the catalog.");
  }

  const comparison = current.comparisonSummary["2020-2024"];

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <div>
            <strong>Civic Result Maps</strong>
            <span>Versioned public election data</span>
          </div>
        </a>
        <nav className={styles.nav} aria-label="Primary">
          <a href="/"><ArrowLeft aria-hidden size={14} /> State explorer</a>
          <a href="/compare"><GitCompareArrows aria-hidden size={14} /> Compare</a>
          <a href="/developers"><Braces aria-hidden size={14} /> API</a>
        </nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Public data releases</p>
            <h1>Source-linked data, frozen in time.</h1>
            <p className={styles.lede}>
              Download immutable election-result, equipment-context, and security-incident snapshots.
              Each release has a stable identifier, coverage statement, known limitations, manifest, and bulk archive.
            </p>
            <div className={styles.actions}>
              <a className={styles.button} download href={current.archivePath}>
                <Download aria-hidden size={15} /> Download current county ZIP
              </a>
              <a className={styles.secondaryButton} href={"/api/releases/" + current.id}>
                View current manifest
              </a>
            </div>
          </div>
          <aside className={styles.heroCard}>
            <span>Current national county release</span>
            <strong>{current.id}</strong>
            <p>Published {new Date(current.publishedAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}</p>
            <p>{current.geographyVintage}</p>
            <span className={styles.fingerprintLabel}>Data SHA-256</span>
            <code className={styles.fingerprint}>{current.dataSha256}</code>
            <span className={styles.fingerprintLabel}>Archive SHA-256</span>
            <code className={styles.fingerprint}>{current.archiveSha256}</code>
            <div className={styles.badges}>
              <span className={styles.status}>Current</span>
              {current.electionYears.map((year) => <span className={styles.badge} key={year}>{year}</span>)}
            </div>
          </aside>
        </section>

        <section className={styles.metrics} aria-label="Current county release coverage">
          <article className={styles.metric}><span>Registry geographies</span><strong>{formatNumber(current.coverage.registryCountyEquivalents)}</strong></article>
          <article className={styles.metric}><span>Matched per year</span><strong>{formatNumber(current.coverage.matchedCountyRowsByYear["2024"])}</strong></article>
          <article className={styles.metric}><span>2020-2024 blue to red</span><strong>{formatNumber(comparison.blueToRed)}</strong></article>
          <article className={styles.metric}><span>2020-2024 red to blue</span><strong>{formatNumber(comparison.redToBlue)}</strong></article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Available data products</h2>
            <p>Result, equipment, and security releases retain their own reporting grains and interpretation limits.</p>
          </div>
          <div className={styles.grid}>
            {releases.map((release) => (
              <article className={styles.card} key={release.id}>
                <span className={styles.cardLabel}>{releaseProductLabel(release)}</span>
                <h3>{release.title}</h3>
                <p>{release.summary}</p>
                <div className={styles.badges}>
                  <span className={styles.status}>{release.status}</span>
                  {release.electionYears.map((year) => <span className={styles.badge} key={year}>{year}</span>)}
                </div>
                <ul>
                  {release.coverageHighlights.map((highlight) => (
                    <li key={highlight.label}><strong>{highlight.label}:</strong> {highlight.value}</li>
                  ))}
                </ul>
                <p><code>{release.id}</code></p>
                <div className={styles.actions}>
                  <a className={styles.button} download href={release.archivePath}>
                    <Download aria-hidden size={15} /> Download ZIP
                  </a>
                  <a className={styles.secondaryButton} href={"/api/releases/" + release.id}>JSON manifest</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.callout}>
          <strong>2012 coverage:</strong> the historical snapshot contains source-linked rows for 28 states.
          It is intentionally separate from the complete available 2016/2020/2024 county product because most 2012
          rows do not yet carry reviewed canonical county tags. Missing states and untagged rows are not zeroes.
        </section>

        <section className={styles.callout}>
          <strong>Current county coverage boundary:</strong> Alaska&apos;s 30 Census county equivalents are present in the geography
          registry but unavailable as comparable county election totals. The platform does not manufacture a county
          crosswalk from Alaska election districts or precinct reporting units.
        </section>

        <section className={styles.callout}>
          <strong>Historical geography:</strong> {current.historicalGeographyPolicy}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Current county release changes</h2>
            <p>The release log describes user-visible data and contract changes, not just code changes.</p>
          </div>
          <div className={styles.grid}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Change log</span>
              <ol>{current.changes.map((change) => <li key={change}>{change}</li>)}</ol>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Known limitations</span>
              <ul>{current.knownLimitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Current county release contents</h2>
            <p>The ZIP is designed to be useful without the website and includes its own caveats and dictionary.</p>
          </div>
          <div className={styles.grid}>
            <article className={styles.card}>
              <Archive aria-hidden size={20} />
              <h3>National CSVs</h3>
              <p>Canonical jurisdiction registry, 2016/2020/2024 county snapshots, all supported comparisons, and source-aware confidence columns.</p>
            </article>
            <article className={styles.card}>
              <Braces aria-hidden size={20} />
              <h3>Machine-readable documentation</h3>
              <p>Release manifest, OpenAPI document, data dictionary, coverage summary, source artifact list, and limitations.</p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Release history</h2></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Release</th><th>Product</th><th>Published</th><th>Status</th><th>Years</th><th>Files</th></tr></thead>
              <tbody>
                {releases.map((release) => (
                  <tr key={release.id}>
                    <td>{release.title}<br /><code>{release.id}</code></td>
                    <td>{releaseProductLabel(release)}</td>
                    <td>{release.publishedAt.slice(0, 10)}</td>
                    <td>{release.status}</td>
                    <td>{release.electionYears.join(", ")}</td>
                    <td><a download href={release.archivePath}>ZIP</a> · <a href={"/api/releases/" + release.id}>JSON</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className={styles.footer}>
          County comparisons are descriptive election-result summaries. Equipment and security records are source-linked
          administration context. Advisory records and data gaps are not findings of fraud or misconduct.
        </footer>
      </div>
    </main>
  );
}

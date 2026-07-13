import type { Metadata } from "next";
import { Archive, ArrowLeft, Braces, Download, GitCompareArrows } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { getCurrentNationalDataRelease, listNationalDataReleases } from "@/lib/national-releases";
import styles from "../platform-pages.module.css";

export const metadata: Metadata = {
  title: "National Data Releases",
  description: "Versioned Civic Result Maps county election datasets, coverage notes, change logs, and bulk downloads.",
  alternates: { canonical: "/releases" },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function ReleasesPage() {
  const current = getCurrentNationalDataRelease();
  const releases = listNationalDataReleases();
  if (!current) {
    throw new Error("The current national data release is missing from the catalog.");
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
            <p className={styles.eyebrow}>National data releases</p>
            <h1>Reproducible county data, frozen in time.</h1>
            <p className={styles.lede}>
              Each release has a stable identifier, coverage statement, change log, known limitations,
              machine-readable manifest, and one bulk archive. Live APIs can evolve; release files do not.
            </p>
            <div className={styles.actions}>
              <a className={styles.button} download href={current.archivePath}>
                <Download aria-hidden size={15} /> Download national ZIP
              </a>
              <a className={styles.secondaryButton} href={"/api/releases/" + current.id}>
                View JSON manifest
              </a>
            </div>
          </div>
          <aside className={styles.heroCard}>
            <span>Current release</span>
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

        <section className={styles.metrics} aria-label="Release coverage">
          <article className={styles.metric}><span>Registry geographies</span><strong>{formatNumber(current.coverage.registryCountyEquivalents)}</strong></article>
          <article className={styles.metric}><span>Matched per year</span><strong>{formatNumber(current.coverage.matchedCountyRowsByYear["2024"])}</strong></article>
          <article className={styles.metric}><span>2020-2024 blue to red</span><strong>{formatNumber(comparison.blueToRed)}</strong></article>
          <article className={styles.metric}><span>2020-2024 red to blue</span><strong>{formatNumber(comparison.redToBlue)}</strong></article>
        </section>

        <section className={styles.callout}>
          <strong>Coverage boundary:</strong> Alaska&apos;s 30 Census county equivalents are present in the geography
          registry but unavailable as comparable county election totals. The platform does not manufacture a county
          crosswalk from Alaska election districts or precinct reporting units.
        </section>

        <section className={styles.callout}>
          <strong>Historical geography:</strong> {current.historicalGeographyPolicy}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>What changed</h2>
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
            <h2>Release contents</h2>
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
              <thead><tr><th>Release</th><th>Published</th><th>Status</th><th>Years</th><th>Manifest</th></tr></thead>
              <tbody>
                {releases.map((release) => (
                  <tr key={release.id}>
                    <td>{release.title}<br /><code>{release.id}</code></td>
                    <td>{release.publishedAt.slice(0, 10)}</td>
                    <td>{release.status}</td>
                    <td>{release.electionYears.join(", ")}</td>
                    <td><a href={"/api/releases/" + release.id}>JSON</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className={styles.footer}>County comparisons are descriptive election-result summaries. Advisory records and data gaps are not findings of fraud or misconduct.</footer>
      </div>
    </main>
  );
}

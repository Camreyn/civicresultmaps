import type { Metadata } from "next";
import { ArrowLeft, Braces, Download, ExternalLink, GitCompareArrows } from "lucide-react";
import { BrandMark } from "../brand-mark";
import { currentNationalReleaseId, publicApiSchemaVersion } from "@/lib/api-version";
import { dataConfidenceDefinitions } from "@/lib/data-confidence";
import styles from "../platform-pages.module.css";

export const metadata: Metadata = {
  title: "Public API",
  description: "Civic Result Maps API documentation for county search, profiles, election comparisons, releases, and bulk downloads.",
  alternates: { canonical: "/developers" },
};

const endpoints = [
  ["GET", "/api/v1/flips", "Paginated county comparisons and CSV export"],
  ["GET", "/api/v1/counties/{fips}", "One permanent county profile"],
  ["GET", "/api/v1/jurisdictions", "Paginated canonical county registry"],
  ["GET", "/api/v1/jurisdictions/search", "FIPS, county-name, and alias search"],
  ["GET", "/api/v1/confidence", "Shared confidence vocabulary"],
  ["GET", "/api/v1/releases", "Versioned public data release catalog"],
  ["GET", "/api/v1/releases/{releaseId}/download", "Product-specific immutable ZIP"],
  ["GET", "/api/v1/equipment-systems", "Feature-gated equipment catalog summaries"],
  ["GET", "/api/v1/equipment-systems/{slug}", "One source-linked equipment dossier"],
] as const;

export default function DevelopersPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <div><strong>Civic Result Maps</strong><span>Public API</span></div>
        </a>
        <nav className={styles.nav} aria-label="Primary">
          <a href="/"><ArrowLeft aria-hidden size={14} /> State explorer</a>
          <a href="/compare"><GitCompareArrows aria-hidden size={14} /> Compare</a>
          <a href="/releases"><Download aria-hidden size={14} /> Releases</a>
        </nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>API schema {publicApiSchemaVersion}</p>
            <h1>Build against a public, documented county-data contract.</h1>
            <p className={styles.lede}>
              The v1 API uses canonical five-digit FIPS geography, explicit confidence labels, stable envelopes,
              pagination metadata, release identifiers, and CSV or ZIP bulk paths.
            </p>
            <div className={styles.actions}>
              <a className={styles.button} href="/api/openapi">OpenAPI JSON <ExternalLink aria-hidden size={14} /></a>
              <a className={styles.secondaryButton} href={"/api/releases/" + currentNationalReleaseId}>Current manifest</a>
            </div>
          </div>
          <aside className={styles.heroCard}>
            <span>Stability promise</span>
            <strong>/api/v1</strong>
            <p>Breaking field or semantic changes require a new major API path. Additive fields may appear within v1.</p>
            <div className={styles.badges}><span className={styles.status}>CORS enabled</span><span className={styles.badge}>JSON</span><span className={styles.badge}>CSV</span></div>
          </aside>
        </section>

        <section className={styles.callout}>
          <strong>Envelope:</strong> JSON responses return <code>{"{ data, meta }"}</code>. Metadata includes
          <code> generatedAt</code>, <code>source</code>, <code>schemaVersion</code>, and <code>releaseId</code>.
          Live endpoints return <code>releaseId: null</code>; frozen manifests carry their dated ID. Collections also include <code>total</code>, <code>limit</code>, and <code>offset</code>.
          Errors use <code>{"{ data: null, error, meta }"}</code> with the same schema metadata.
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Core endpoints</h2><p>Legacy unversioned endpoints remain available; new integrations should prefer v1.</p></div>
          <div className={styles.endpointGrid}>
            {endpoints.map(([method, path, description]) => (
              <article className={styles.endpoint} key={path}>
                <div className={styles.endpointTitle}><span className={styles.method}>{method}</span><code>{path}</code></div>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Quick start</h2></div>
          <div className={styles.grid}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>2020 to 2024 flips</span>
              <pre className={styles.codeBlock}>curl &quot;https://www.civicresultmaps.org/api/v1/flips?from=2020&amp;to=2024&amp;direction=blue_to_red&amp;limit=100&quot;</pre>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>County profile</span>
              <pre className={styles.codeBlock}>curl &quot;https://www.civicresultmaps.org/api/v1/counties/40019&quot;</pre>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Confidence vocabulary</h2><p>Confidence describes the geography/source relationship, not whether a political outcome is credible.</p></div>
          <div className={styles.grid}>
            {Object.entries(dataConfidenceDefinitions).map(([level, definition]) => (
              <article className={styles.card} key={level}>
                <span className={styles.cardLabel}>{level}</span>
                <h3>{definition.label}</h3>
                <p>{definition.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Pagination and bulk use</h2></div>
          <div className={styles.grid}>
            <article className={styles.card}>
              <Braces aria-hidden size={20} />
              <h3>Interactive queries</h3>
              <p>Use <code>limit</code> and <code>offset</code>. Add <code>view=compact</code> for a national visualization payload; full JSON is capped at 1,000 rows. Filter server-side by year pair, direction, state, FIPS, or name.</p>
            </article>
            <article className={styles.card}>
              <Download aria-hidden size={20} />
              <h3>Full-dataset workflows</h3>
              <p>Use a dated release ZIP instead of paging through live endpoints. Every archive includes caveats, a data dictionary, and the exact release manifest.</p>
            </article>
          </div>
        </section>

        <footer className={styles.footer}>Please retain source, confidence, and caveat fields when redistributing Civic Result Maps data.</footer>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "../brand-mark";
import styles from "../platform-pages.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Civic Result Maps handles the minimal browser data used to operate the public explorer.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <BrandMark />
          <div><strong>Civic Result Maps</strong><span>Privacy</span></div>
        </a>
        <nav className={styles.nav} aria-label="Primary">
          <a href="/"><ArrowLeft aria-hidden size={14} /> State explorer</a>
        </nav>
      </header>
      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Site policy</p>
            <h1>Minimal data, explained plainly.</h1>
            <p className={styles.lede}>How Civic Result Maps handles the browser data used for safe layout rollouts and private administration.</p>
          </div>
          <article className={styles.heroCard}>
            <span>Last updated</span>
            <strong>August 7, 2026</strong>
            <p>The public election data remains source-linked and reviewable.</p>
          </article>
        </section>
        <section className={styles.grid}>
          <article className={styles.card}>
            <h3>Public workspace layout cookie</h3>
            <p>
              Civic Result Maps sets an HTTP-only cookie named <code>crm_layout_visitor</code>. It contains a random UUID,
              expires after one year, and is used only to keep staged workspace-layout rollouts consistent for a browser.
              It does not contain a name, email address, election preference, or selected state.
            </p>
            <p>
              The identifier is sent to the configured feature-flag provider for rollout evaluation. Civic Result Maps does
              not store the raw identifier in its application database or include it in application logs.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Private administration</h3>
            <p>
              The private layout editor uses Clerk authentication. Only accounts with a verified email address in the
              operator-maintained allowlist can read or change layout revisions. Revision and publication audit records keep
              the authorized account ID and email so changes remain reviewable.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Analytics and public records</h3>
            <p>
              The site uses Vercel Web Analytics for aggregate site-usage measurement. Election sources and normalized data
              published by this project are public records or public-interest datasets; source authority, caveats, and
              provenance remain visible throughout the product.
            </p>
          </article>
          <article className={styles.card}>
            <h3>OpenStreetMap map tiles</h3>
            <p>
              When a precinct-detail map is visible, the browser requests only the map tiles needed for that county view
              from <code>tile.openstreetmap.org</code>. Like other direct web requests, those requests provide the tile
              service with the browser&apos;s IP address, user-agent information, referring site, and requested tile coordinates.
              Civic Result Maps does not add names, email addresses, layout identifiers, or election-result data to them.
            </p>
            <p>
              The OpenStreetMap Foundation processes those requests under its{" "}
              <a href="https://osmfoundation.org/wiki/Privacy_Policy" rel="noreferrer" target="_blank">
                privacy policy
              </a>.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Questions</h3>
            <p>For a privacy question, use the project contact information in the public workspace.</p>
            <a className={styles.secondaryButton} href="/?state=WA&tab=contact">Open contact options</a>
          </article>
        </section>
      </div>
    </main>
  );
}

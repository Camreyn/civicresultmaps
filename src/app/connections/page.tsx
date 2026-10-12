import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { connectionSources } from "@/lib/election-connections";
import { BrandMark } from "../brand-mark";
import { ResearchExplorer } from "./research-explorer";
import { legacyExplorerDocument } from "@/lib/connection-explorer-data";
import { readPublishedConnections, readPublishedConnectionComparisons } from "@/lib/connection-research-repository";
import { ReleaseComparison } from "./release-comparison";
import type { ConnectionComparisons } from "@/lib/connection-release-comparison";
import styles from "./connections.module.css";
import { sourceDescriptions } from "./connection-descriptors";

export const metadata: Metadata = pageMetadata({
  title: "Election Connections",
  description: "Trace AP's election-data agreements with TV networks, OpenAI and Kalshi, plus source-linked corporate roles, ownership and technology partnerships.",
  path: "/connections",
  image: {
    path: "/api/connections-social-card?v=2",
    alt: "Election Connections: AP's announced election-data agreements with ABC, CBS, CNN, NBC, Fox, OpenAI and Kalshi; separate Oracle–OpenAI AI-capacity partnership and Donald Trump Jr.–Kalshi advisor appointment. Dates mark announcements, not control of votes or race calls.",
  },
});

export const dynamic = "force-dynamic";
export default async function ConnectionsPage() {
  let document;
  try {
    document = await readPublishedConnections() ?? legacyExplorerDocument();
  } catch {
    return <main className={styles.shell}><h1>Election connections</h1><p role="alert">Reviewed connections release unavailable.</p><a href="/">State workspace</a></main>;
  }
  let comparisons: ConnectionComparisons;
  try { comparisons = await readPublishedConnectionComparisons(document); }
  catch { comparisons = { status: "unavailable", comparisons: [] }; }
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Civic Result Maps home"><BrandMark /><span>Civic Result Maps</span></a>
        <nav aria-label="Connections navigation"><a href="/">State workspace</a><a href="/evidence">Evidence tools</a><a href="#source-library">Sources</a></nav>
      </header>
      <section className={styles.pageHeading} aria-labelledby="connections-title">
        <h1 id="connections-title">Election connections</h1>
        <span>Updated {document.reviewedOn}</span>
      </section>
      <section className={styles.intro} aria-label="About this page">
        <p>Explore election-reporting networks, company ownership, and technology relationships. Each box is a person, organization, product or public system. Select a box or line to see its sources, dates and evidence limits.</p>
        <p className={styles.credit}>Inspired by <a href="https://www.tiktok.com/@thedreydossier/video/7695387832902241567" target="_blank" rel="noopener noreferrer">Drey Dossier&apos;s TikTok video</a>. The cited records—not the video—support the relationships shown.</p>
        <details className={styles.readingGuide} id="connections-reading-guide">
          <summary>How to read this map</summary>
          <dl className={styles.guideGrid}>
            <div><dt>Boxes (nodes)</dt><dd>Select a box to learn what that person, organization or system does. Use the search to find a name; “Focus selected node” keeps only its direct connections.</dd></div>
            <div><dt>Lines &amp; arrows</dt><dd>A line represents a specific relationship described in a source. Its color identifies the relationship type. Arrows follow the relationship wording, not necessarily a flow of votes or data. Select a line—or its entry in Connections—to read it.</dd></div>
            <div><dt>Dates &amp; unknowns</dt><dd>A publication or observation date is not necessarily the start of a relationship. “Known active on” requires both a documented start and end date. Missing dates do not prove that a relationship was inactive.</dd></div>
            <div><dt>Sources &amp; limits</dt><dd>“What the sources support” describes the evidence; “What is not established” identifies its limits. Source types describe where a statement came from, not a certainty score. “Content check only” means the source was read, but no saved source version is linked here.</dd></div>
          </dl>
        </details>
      </section>
      <ResearchExplorer document={document} />
      <section className={styles.comparisonSection} aria-label="Reviewed release comparison"><ReleaseComparison data={comparisons} /></section>
      <details className={styles.library} id="source-library">
        <summary><h2>Sources <span>{document.sources.length}</span></h2></summary>
        <div className={styles.sourceGrid}>{document.sources.map((source) => (
          <article key={source.id} id={`source-${source.id}`}>
            <small>{source.authority}</small>
            <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></h3>
            <p>{source.publishedOn ? `Dated ${source.publishedOn}` : source.eventOn ? `Event ${source.eventOn} · Publication date unconfirmed` : "Undated"}</p>
            <details className={styles.sourceCheck}><summary>{sourceDescriptions[source.sourceClass].label} · Source details</summary><p>{sourceDescriptions[source.sourceClass].description}</p>{document.releaseId === "legacy-documentary-catalog" ? <><p>{connectionSources.find((item) => item.id === source.id)?.review.locator}</p><p>{connectionSources.find((item) => item.id === source.id)?.review.note}</p><p>Content checked {connectionSources.find((item) => item.id === source.id)?.review.checkedOn}; retained revision unavailable.</p></> : document.evidence.filter((item) => item.sourceId === source.id).map((item) => <p key={item.id}>{item.locator.page ? `Page ${item.locator.page}: ` : ""}{item.locator.section}</p>)}</details>
          </article>
        ))}</div>
      </details>
    </div>
  );
}

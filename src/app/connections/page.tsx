import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { connectionSources, connectionsReviewedOn } from "@/lib/election-connections";
import { BrandMark } from "../brand-mark";
import { ResearchExplorer } from "./research-explorer";
import { legacyExplorerDocument } from "@/lib/connection-explorer-data";
import { readPublishedConnections } from "@/lib/connection-research-repository";
import styles from "./connections.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Election Connections",
  description: "Explore dated election-reporting, corporate and technology relationships, with primary sources and visible evidence limits.",
  path: "/connections",
});

export const dynamic = "force-dynamic";
export default async function ConnectionsPage() {
  let document;
  try {
    document = await readPublishedConnections() ?? legacyExplorerDocument();
  } catch {
    return <main className={styles.shell}><h1>Election connections</h1><p role="alert">Reviewed connections release unavailable.</p><a href="/">State workspace</a></main>;
  }
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
        <p>Explore election-reporting networks, company ownership, and technology relationships. Select a node or connection to see its sources, dates, and evidence limits.</p>
        <p className={styles.credit}>Inspired by <a href="https://www.tiktok.com/@thedreydossier/video/7695387832902241567" target="_blank" rel="noopener noreferrer">Drey Dossier&apos;s TikTok video</a>. The cited records—not the video—support the relationships shown.</p>
      </section>
      <ResearchExplorer document={document} />
      <details className={styles.library} id="source-library">
        <summary><h2>Sources <span>{document.sources.length}</span></h2></summary>
        <div className={styles.sourceGrid}>{document.sources.map((source) => (
          <article key={source.id} id={`source-${source.id}`}>
            <small>{source.authority}</small>
            <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></h3>
            <p>{source.publishedOn ? `Dated ${source.publishedOn}` : source.eventOn ? `Event ${source.eventOn} · Publication date unconfirmed` : "Undated"}</p>
            <details className={styles.sourceCheck}><summary>{source.sourceClass} · Source details</summary>{document.releaseId === "legacy-documentary-catalog" ? <><p>{connectionSources.find((item) => item.id === source.id)?.review.locator}</p><p>{connectionSources.find((item) => item.id === source.id)?.review.note}</p><p>Content checked {connectionsReviewedOn}; retained revision unavailable.</p></> : document.evidence.filter((item) => item.sourceId === source.id).map((item) => <p key={item.id}>{item.locator.page ? `Page ${item.locator.page}: ` : ""}{item.locator.section}</p>)}</details>
          </article>
        ))}</div>
      </details>
    </div>
  );
}

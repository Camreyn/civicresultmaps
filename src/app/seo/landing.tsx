import type { ReactNode } from "react";
import { BrandMark } from "@/app/brand-mark";
import { absoluteUrl, publicSourceUrl, serializeJsonLd } from "@/lib/seo";
import { breadcrumbJsonLd, type Breadcrumb } from "@/lib/seo-structured-data";
import { countyByTag, countyElectionPath } from "@/lib/seo-geography";
import { resultSources, type SeoCandidateRow } from "@/lib/seo-data";
import styles from "./landing.module.css";

export function JsonLd({ value }: { value: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }} />;
}

export function Landing({ title, description, breadcrumbs, children, structuredData }: {
  title: string; description: string; breadcrumbs: Breadcrumb[]; children: ReactNode; structuredData?: unknown;
}) {
  return <main className={styles.shell}>
    <header className={styles.header}>
      <a className={styles.brand} href="/"><BrandMark /><span>Civic Result Maps</span></a>
      <nav aria-label="Primary"><a href="/elections">Elections</a><a href="/states">States</a><a href="/counties">Counties</a><a href="/datasets">Datasets</a><a href="/developers">Developers</a></nav>
    </header>
    <div className={styles.content}>
      <nav aria-label="Breadcrumb"><ol className={styles.breadcrumbs}>{breadcrumbs.map((item, index) =>
        <li key={item.path}>{index === breadcrumbs.length - 1 ? <span aria-current="page">{item.name}</span> : <a href={item.path}>{item.name}</a>}</li>)}</ol></nav>
      <h1>{title}</h1><p className={styles.lede}>{description}</p>
      {children}
      <aside className={styles.note}>These pages describe published source records and their limitations. Missing records are not zero votes. Advisory indicators elsewhere on the site are source-review prompts, not findings of misconduct.</aside>
    </div>
    <JsonLd value={breadcrumbJsonLd(breadcrumbs)} />
    {structuredData ? <JsonLd value={structuredData} /> : null}
  </main>;
}

export function LinkDirectory({ items }: { items: Array<{ path: string; name: string; detail?: string }> }) {
  return <ul className={styles.directory}>{items.map((item) => <li key={item.path}>
    <a href={item.path}>{item.name}</a>{item.detail ? <p>{item.detail}</p> : null}
  </li>)}</ul>;
}

export function ResultTable({ rows }: { rows: SeoCandidateRow[] }) {
  return <div className={styles.tableScroll}><table>
    <caption>2024 presidential candidate votes as stored in the normalized source records. Reporting grains are separate; do not add overlapping grains together.</caption>
    <thead><tr><th scope="col">Reporting area</th><th scope="col">Grain</th><th scope="col">Candidate / source label</th><th scope="col">Votes</th><th scope="col">Source</th></tr></thead>
    <tbody>{rows.map((row) => {
      const county = row.level === "county" ? countyByTag(row.jurisdictionTag) : undefined;
      const url = publicSourceUrl(row.sourceUrl);
      return <tr key={row.id}>
        <th scope="row">{county?.state === row.state ? <a href={countyElectionPath(county)}>{row.jurisdictionName}</a> : row.jurisdictionName}</th>
        <td>{row.level.replaceAll("_", " ")}</td><td>{row.candidate}</td><td>{Number(row.votes).toLocaleString("en-US")}</td>
        <td>{url ? <a href={url}>{row.authority || row.sourceTitle || "Source record"}</a> : "Source link unavailable"}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export function SourceNotes({ rows }: { rows: SeoCandidateRow[] }) {
  const sources = resultSources(rows);
  return <section><h2>Sources and provenance</h2>
    <p>Values retain the source reporting grain and candidate labels. A loaded source is not a claim of complete geographic coverage. Normalized compilations are published by Civic Result Maps; the linked authorities publish the underlying records.</p>
    <ul className={styles.sources}>{sources.map((source) => {
      const url = publicSourceUrl(source.sourceUrl);
      return <li key={source.sourceId}>
        <h3>{url ? <a href={url}>{source.sourceTitle}</a> : source.sourceTitle}</h3>
        <p>{source.authority} · Source status: {source.sourceStatus}</p>
        {source.confidence ? <p>{source.confidence}</p> : null}
        {source.timestampBasis ? <p>Source timing: {source.timestampBasis}</p> : null}
        {source.parser ? <p>Normalization: <code>{source.parser}</code></p> : null}
      </li>;
    })}</ul>
    <p>See <a href={absoluteUrl(`/api/sources?state=${rows[0]?.state ?? ""}&year=2024`)}>the source inventory</a> for related records and lifecycle statuses.</p>
  </section>;
}

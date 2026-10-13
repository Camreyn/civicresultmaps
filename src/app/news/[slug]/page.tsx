import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl, pageMetadata, serializeJsonLd, siteName, siteOrigin } from "@/lib/seo";
import { newsBySlug, newsEntries, newsKinds, newsSources, relatedNewsLinks } from "@/lib/news";
import { formatSourceDate, sourceDateLabel } from "@/lib/source-dates";
import styles from "../news.module.css";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return newsEntries.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = newsBySlug((await params).slug);
  if (!entry) return { title: "Brief not found", robots: { index: false, follow: true } };
  return pageMetadata({ title: entry.title, description: entry.summary, path: `/news/${entry.slug}`,
    image: { path: `/api/news-social-card?slug=${entry.slug}`, alt: entry.title } });
}
export default async function NewsArticle({ params }: Props) {
  const entry = newsBySlug((await params).slug);
  if (!entry) notFound();
  const sources = newsSources(entry);
  const replacement = entry.supersededBy ? newsEntries.find((item) => item.id === entry.supersededBy) : undefined;
  return (
    <main className={styles.shell}>
      <nav aria-label="Breadcrumb"><a href="/news">News &amp; site updates</a><span aria-hidden> / </span><span aria-current="page">Brief</span></nav>
      <article className={styles.article}>
        <p className={styles.eyebrow}>{newsKinds[entry.kind]}</p>
        <h1>{entry.title}</h1><p className={styles.lede}>{entry.summary}</p>
        <dl className={styles.dates}>
          <div><dt>{entry.eventLabel}</dt><dd><time dateTime={entry.eventOn}>{formatSourceDate(entry.eventOn)}</time></dd></div>
          <div><dt>Brief reviewed</dt><dd><time dateTime={entry.coverageReviewedOn}>{formatSourceDate(entry.coverageReviewedOn)}</time></dd></div>
          {entry.updatedOn ? <div><dt>Brief updated</dt><dd><time dateTime={entry.updatedOn}>{formatSourceDate(entry.updatedOn)}</time></dd></div> : null}
        </dl>
        {replacement ? <aside className={styles.notice}>This brief is superseded. <a href={`/news/${replacement.slug}`}>Read {replacement.title}</a>. The original remains available for context.</aside> : null}
        {entry.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <aside className={styles.notice}><h2>What this does not establish</h2><ul>{entry.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul></aside>
        <section aria-labelledby="brief-sources"><h2 id="brief-sources">Sources</h2>
          <ul className={styles.sources}>{sources.map((source) => <li key={source.id}>
            <span>{source.authority} · {source.attribution}</span>
            <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden>↗</span></a></h3>
            <small>{sourceDateLabel(source)}</small>
          </li>)}</ul>
        </section>
        <section><h2>Related tools</h2><ul>{relatedNewsLinks(entry).map((link) => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul></section>
        {entry.corrections.length ? <section aria-label="Correction history"><h2>Corrections</h2><ul>{entry.corrections.map((correction, index) => <li key={index}><time dateTime={correction.on}>{formatSourceDate(correction.on)}</time>: {correction.description}</li>)}</ul></section> : null}
        <p><a href="/news#standards">Coverage and correction standards</a></p>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        "@context": "https://schema.org", "@type": "Article", headline: entry.title, description: entry.summary,
        url: absoluteUrl(`/news/${entry.slug}`), ...(entry.updatedOn ? { dateModified: entry.updatedOn } : {}),
        // An editorial publication timestamp is not recorded; don't substitute the source's date.
        publisher: { "@type": "Organization", name: siteName, "@id": `${siteOrigin}/#organization` },
        citation: sources.map((source) => source.url),
      }) }} />
    </main>
  );
}

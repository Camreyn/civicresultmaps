import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { filterNews, newsEntries, newsKinds, newsSources, newsTopics } from "@/lib/news";
import { formatSourceDate } from "@/lib/source-dates";
import { usStateOptions } from "@/lib/us-states";
import styles from "./news.module.css";

export const metadata: Metadata = {
  ...pageMetadata({ title: "News & Site Updates", path: "/news",
    description: "Source-linked election-reporting briefs and Civic Result Maps updates, with original dates, evidence limits and links to related tools.",
    image: { path: "/api/news-social-card", alt: "Civic Result Maps News: election reporting, source records and site updates" } }),
  alternates: { canonical: "/news", types: { "application/rss+xml": "/news/feed.xml" } },
};
type Params = Record<string, string | string[] | undefined>;
function first(value: Params[string]) { return (Array.isArray(value) ? value[0] : value)?.slice(0, 200) ?? ""; }

export default async function NewsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filters = { kind: first(params.kind), topic: first(params.topic), state: first(params.state), year: first(params.year), q: first(params.q) };
  const entries = filterNews(filters);
  const years = [...new Set(newsEntries.map((entry) => entry.eventOn.slice(0, 4)))].sort().reverse();
  const stateCodes = new Set(newsEntries.flatMap((entry) => entry.states));
  return (
    <main className={styles.shell}>
      <section className={styles.heading}>
        <p className={styles.eyebrow}>Reporting &amp; project updates</p>
        <h1>News &amp; site updates</h1>
        <p>Short, source-linked briefs on election reporting and changes to Civic Result Maps. Read the original record, see what it supports, and open the related tools.</p>
        <div className={styles.links}><a href="#standards">Coverage standards</a><a href="/news/feed.xml">RSS feed</a></div>
      </section>
      <aside className={styles.notice}>Curated coverage, not a live or comprehensive news feed. Cards are ordered by the original event date, not the date we reviewed them. Announced plans are not proof of implementation.</aside>
      <form className={styles.filters} action="/news" method="get" aria-label="Filter news">
        <div className={styles.field}><label htmlFor="news-search">Search</label><input id="news-search" name="q" type="search" maxLength={200} defaultValue={filters.q} placeholder="Search briefs and sources" /></div>
        <div className={styles.field}><label htmlFor="news-kind">Type</label><select id="news-kind" name="kind" defaultValue={filters.kind || "all"}><option value="all">All types</option>{Object.entries(newsKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="news-topic">Topic</label><select id="news-topic" name="topic" defaultValue={filters.topic || "all"}><option value="all">All topics</option>{Object.entries(newsTopics).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="news-state">Geography</label><select id="news-state" name="state" defaultValue={filters.state || "all"}><option value="all">All places</option>{stateCodes.has("US") ? <option value="US">U.S. / national</option> : null}{usStateOptions.filter(([code]) => stateCodes.has(code)).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="news-year">Event year</label><select id="news-year" name="year" defaultValue={filters.year || "all"}><option value="all">All years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></div>
        <button type="submit">Apply filters</button><a href="/news">Reset</a>
      </form>
      <section aria-label="News archive">
        <h2 className={styles.archiveTitle}>{entries.length} {entries.length === 1 ? "brief" : "briefs"}</h2>
        {entries.length ? <div className={styles.cards}>{entries.map((entry) => (
          <article className={styles.card} key={entry.id}>
            <div className={styles.meta}><span>{newsKinds[entry.kind]}</span><span>{entry.eventLabel} <time dateTime={entry.eventOn}>{formatSourceDate(entry.eventOn)}</time></span></div>
            <h3><a href={`/news/${entry.slug}`}>{entry.title}</a></h3>
            <p>{entry.summary}</p>
            <p className={styles.sourceLine}>Source: {newsSources(entry).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{source.authority}</a>)}</p>
            <div className={styles.tags}>{entry.topics.map((topic) => <a href={`/news?topic=${topic}`} key={topic}>{newsTopics[topic as keyof typeof newsTopics]}</a>)}</div>
            {entry.supersededBy ? <p className={styles.notice}>Superseded — see the brief for its replacement.</p> : null}
            <small>Brief reviewed <time dateTime={entry.coverageReviewedOn}>{formatSourceDate(entry.coverageReviewedOn)}</time>{entry.updatedOn ? ` · Updated ${formatSourceDate(entry.updatedOn)}` : ""}</small>
          </article>
        ))}</div> : <div className={styles.empty}><h3>No briefs match these filters</h3><p>Coverage is selective. A missing brief is not evidence that an event did not occur.</p><a href="/news">View all briefs</a></div>}
      </section>
      <section id="standards" className={styles.standards}>
        <h2>Coverage standards</h2>
        <p>Election briefs link primary records first. An organization's announcement is attributed to that organization; it is not independent confirmation of every operational detail. Site updates link the code or release they describe.</p>
        <p>Event and source-publication dates are separate from when we review a brief. We do not invent missing publication times, automatically turn research leads into news, or treat data gaps as findings of misconduct.</p>
        <p>Corrections are dated on the original brief. A superseded brief stays accessible and links to its replacement. Propose a correction through <a href="https://github.com/Camreyn/civicresultmaps/issues" target="_blank" rel="noopener noreferrer">the project issue tracker</a>, including a source link and the specific statement.</p>
      </section>
    </main>
  );
}

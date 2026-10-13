import { z } from "zod";
import registry from "../../data/news.json" with { type: "json" };
import { connectionSources, connectionEdges, connectionNodes, connectionSourceClass } from "./election-connections.ts";
import { siteNavigation } from "./site-navigation.ts";
import { absoluteUrl, siteName } from "./seo.ts";
import { usStateOptions } from "./us-states.ts";

export const newsKinds = { election_news: "Election news", site_update: "Site update" } as const;
export const newsTopics = {
  "election-reporting": "Election reporting", technology: "Technology",
  "prediction-markets": "Prediction markets", "public-records": "Public records",
  "site-development": "Site development",
} as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const entrySchema = z.object({
  id, slug: id, kind: z.enum(["election_news", "site_update"]),
  title: text.max(140), summary: text.max(400),
  eventOn: date, eventLabel: z.enum(["Announced", "Code merged", "Published record"]),
  coverageReviewedOn: date, updatedOn: date.optional(),
  topics: z.array(text).min(1), states: z.array(text).min(1),
  sourceIds: z.array(id).min(1), connectionClaimIds: z.array(id),
  relatedPageIds: z.array(text), body: z.array(text).min(1),
  limitations: z.array(text).min(1),
  corrections: z.array(z.object({ on: date, description: text }).strict()),
  supersededBy: id.optional(),
}).strict();
export type NewsEntry = z.infer<typeof entrySchema>;
export type NewsSource = { id: string; authority: string; title: string; url: string; publishedOn?: string; eventOn?: string; attribution: string };

// Reuse the Connections source catalog; never duplicate its URLs, dates or claims.
const sources: NewsSource[] = [
  ...connectionSources.map((source) => ({
    id: source.id, authority: source.authority, title: source.title, url: source.url,
    publishedOn: source.publishedOn, eventOn: source.eventOn,
    attribution: ({ official: "Official record", independent: "Independent reporting", supplemental: "Supplemental lead", issuer: "Issuer statement" })[connectionSourceClass(source)],
  })),
  { id: "connections-update-064abf6", authority: siteName, title: "Merged Connections update (commit 064abf6)",
    url: "https://github.com/Camreyn/civicresultmaps/commit/064abf6f7cfa4634db7c77475f15eb3f51fbea2d",
    publishedOn: "2026-10-12", attribution: "Site code record" },
];
function isPublicHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && !url.search && !url.hash && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
      && !/\.(?:local|localhost|internal)$/i.test(url.hostname);
  } catch { return false; }
}
function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}
export function validateNews(input: unknown, catalog: readonly NewsSource[] = sources): NewsEntry[] {
  const entries = z.array(entrySchema).parse(input);
  assertUnique(entries.map((entry) => entry.id), "news id");
  assertUnique(entries.map((entry) => entry.slug), "news slug");
  assertUnique(catalog.map((source) => source.id), "source id");
  const stateCodes = new Set<string>(["US", ...usStateOptions.map(([code]) => code)]);
  for (const entry of entries) {
    if (entry.coverageReviewedOn < entry.eventOn) throw new Error(`Review predates event: ${entry.id}`);
    if (entry.updatedOn && entry.updatedOn < entry.coverageReviewedOn) throw new Error("Update predates review");
    for (const field of ["sourceIds", "topics", "states", "connectionClaimIds", "relatedPageIds"] as const) assertUnique(entry[field], field);
    if (entry.topics.some((topic) => !Object.hasOwn(newsTopics, topic))) throw new Error("Unknown topic");
    if (entry.states.some((state) => !stateCodes.has(state))) throw new Error("Unknown state");
    for (const sourceId of entry.sourceIds) {
      const source = catalog.find((item) => item.id === sourceId);
      if (!source || !isPublicHttps(source.url)) throw new Error(`Invalid public source: ${sourceId}`);
      if (source.publishedOn) date.parse(source.publishedOn);
      if (source.eventOn) date.parse(source.eventOn);
    }
    if (entry.eventLabel === "Announced" && !entry.sourceIds.some((sourceId) => catalog.find((source) => source.id === sourceId)?.publishedOn === entry.eventOn)) throw new Error("Announcement date is not supported by a source");
    for (const claimId of entry.connectionClaimIds) {
      const claim = connectionEdges.find((item) => item.id === claimId);
      if (!claim || !claim.sourceIds.some((sourceId) => entry.sourceIds.includes(sourceId))) throw new Error(`Unresolved claim: ${claimId}`);
    }
    if (entry.relatedPageIds.some((pageId) => !siteNavigation.some((page) => page.id === pageId))) throw new Error("Unknown related page");
    if (entry.supersededBy && (entry.supersededBy === entry.id || !entries.some((item) => item.id === entry.supersededBy))) throw new Error("Invalid superseding entry");
    let previous = entry.coverageReviewedOn;
    for (const correction of entry.corrections) {
      if (correction.on < previous || correction.on > (entry.updatedOn ?? entry.coverageReviewedOn)) throw new Error("Invalid correction chronology");
      previous = correction.on;
    }
  }
  // One brief per source announcement; updates use a new source/code revision.
  assertUnique(entries.map((entry) => entry.sourceIds.map((sourceId) => catalog.find((source) => source.id === sourceId)!.url).sort().join("|")), "source package");
  for (const entry of entries) {
    const visited = new Set([entry.id]);
    let next = entry.supersededBy;
    while (next) {
      if (visited.has(next)) throw new Error("Supersession cycle");
      visited.add(next);
      next = entries.find((item) => item.id === next)?.supersededBy;
    }
  }
  return entries.sort((a, b) => b.eventOn.localeCompare(a.eventOn) || a.slug.localeCompare(b.slug));
}

export const newsEntries = validateNews(registry);
export function newsBySlug(slug: string) { return newsEntries.find((entry) => entry.slug === slug); }
export function newsSources(entry: NewsEntry) { return entry.sourceIds.map((id) => sources.find((source) => source.id === id)!); }
export function relatedNewsLinks(entry: NewsEntry) {
  return [
    ...entry.connectionClaimIds.map((id) => {
      const claim = connectionEdges.find((item) => item.id === id)!;
      const from = connectionNodes.find((node) => node.id === claim.from)!.label;
      const to = connectionNodes.find((node) => node.id === claim.to)!.label;
      return { label: `Explore: ${from} → ${to}`, href: `/connections?view=${claim.view}&edge=${claim.id}` };
    }),
    ...entry.relatedPageIds.map((id) => {
      const page = siteNavigation.find((item) => item.id === id)!;
      return { label: page.label, href: page.href };
    }),
  ];
}
export function filterNews(filters: { kind?: string; topic?: string; state?: string; year?: string; q?: string }) {
  const query = filters.q?.trim().toLocaleLowerCase("en-US").slice(0, 200) ?? "";
  return newsEntries.filter((entry) =>
    (!filters.kind || filters.kind === "all" || entry.kind === filters.kind) &&
    (!filters.topic || filters.topic === "all" || entry.topics.includes(filters.topic)) &&
    (!filters.state || filters.state === "all" || entry.states.includes(filters.state)) &&
    (!filters.year || filters.year === "all" || entry.eventOn.startsWith(`${filters.year}-`)) &&
    (!query || [entry.title, entry.summary, ...entry.body, ...newsSources(entry).map((source) => source.authority)].join(" ").toLocaleLowerCase("en-US").includes(query))
  );
}
export function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}
export function newsRss() {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${siteName} News</title><link>${absoluteUrl("/news")}</link><description>Source-linked election briefs and site updates. Event and review dates are distinct.</description><language>en-us</language><atom:link href="${absoluteUrl("/news/feed.xml")}" rel="self" type="application/rss+xml"/>${newsEntries.map((entry) => {
    const url = xmlEscape(absoluteUrl(`/news/${entry.slug}`));
    const attribution = newsSources(entry).map((source) => `${source.authority}: ${source.url}`).join("; ");
    // Records have date-only timestamps; do not invent publication times for RSS.
    return `<item><title>${xmlEscape(entry.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><category>${newsKinds[entry.kind]}</category><description>${xmlEscape(`${entry.summary} ${entry.eventLabel}: ${entry.eventOn}. Brief reviewed: ${entry.coverageReviewedOn}. ${entry.supersededBy ? "Superseded; see article for replacement. " : ""}Sources: ${attribution}`)}</description></item>`;
  }).join("")}</channel></rss>`;
}

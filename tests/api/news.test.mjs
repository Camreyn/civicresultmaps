import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { filterNews, newsBySlug, newsEntries, newsRss, newsSources, relatedNewsLinks, validateNews, xmlEscape } from "../../src/lib/news.ts";
import { activeSitePage, siteNavigation, visibleSiteNavigation } from "../../src/lib/site-navigation.ts";
import { formatSourceDate, sourceDateLabel } from "../../src/lib/source-dates.ts";

const clone = () => structuredClone(newsEntries);
test("registry has both requested kinds, deterministic dates and resolvable canonical references", () => {
  assert.deepEqual(new Set(newsEntries.map((entry) => entry.kind)), new Set(["election_news", "site_update"]));
  assert.deepEqual(newsEntries.map((entry) => entry.eventOn), ["2026-10-12", "2026-05-27", "2026-03-02", "2025-10-15"]);
  for (const entry of newsEntries) {
    assert.equal(newsBySlug(entry.slug), entry);
    assert.ok(newsSources(entry).every((source) => source.url.startsWith("https://")));
    assert.ok(relatedNewsLinks(entry).every((link) => link.href.startsWith("/") && !link.href.startsWith("//")));
  }
  assert.equal(newsBySlug("constructor"), undefined);
  assert.match(newsEntries[0].body.join(" "), /gated off/);
});
test("date-only presentation retains evidence timing and unknowns", () => {
  assert.equal(formatSourceDate("2026-05-27"), "May 27, 2026");
  assert.equal(sourceDateLabel({ publishedOn: null, eventOn: "2022-11-08" }), "Event 2022-11-08 · Publication date unconfirmed");
  assert.equal(sourceDateLabel({ publishedOn: null, eventOn: null }), "Undated");
  const [eventOnly] = newsSources({ ...newsEntries[0], sourceIds: ["harris-audit-2022"] });
  assert.equal(eventOnly.attribution, "Official record");
  assert.equal(sourceDateLabel(eventOnly), "Event 2022-11-08 · Publication date unconfirmed");
});
test("duplicates, unresolved references, invalid dates and private fields fail closed", () => {
  for (const mutate of [
    (entries) => entries.push(entries[0]),
    (entries) => { entries[1].slug = entries[0].slug; },
    (entries) => { entries[1].sourceIds = ["unknown"]; },
    (entries) => { entries[1].connectionClaimIds = ["ap-kalshi"]; },
    (entries) => { entries[0].relatedPageIds = ["admin"]; },
    (entries) => { entries[1].eventOn = "2026-02-30"; },
    (entries) => { entries[1].eventOn = "2026-05-26"; },
    (entries) => { entries[1].coverageReviewedOn = "2020-01-01"; },
    (entries) => { entries[0].topics = ["constructor"]; },
    (entries) => { entries[0].states = ["ZZ"]; },
    (entries) => { entries[0].privateNotes = "secret"; },
    (entries) => { entries[0].status = "draft"; },
    (entries) => { entries[0].sourceIds = [...entries[0].sourceIds, ...entries[0].sourceIds]; },
  ]) {
    const entries = clone(); mutate(entries);
    assert.throws(() => validateNews(entries));
  }
});
test("source URLs cannot carry credentials, queries, local targets or unsafe schemes", () => {
  const catalog = newsEntries.flatMap(newsSources);
  for (const url of ["javascript:alert(1)", "http://www.ap.org/", "https://localhost/", "https://127.0.0.1/", "https://records.internal/", "https://user:pass@www.ap.org/", "https://www.ap.org/?token=secret"]) {
    const unsafe = catalog.map((source, index) => index === 0 ? { ...source, url } : source);
    assert.throws(() => validateNews(clone(), unsafe), url);
  }
});
test("corrections and supersession preserve history and reject cycles", () => {
  const entries = clone();
  entries[0].updatedOn = "2026-10-13";
  entries[0].corrections = [{ on: "2026-10-13", description: "Clarified the code-change scope." }];
  entries[0].supersededBy = entries[1].id;
  assert.equal(validateNews(entries)[0].corrections.length, 1);
  entries[1].supersededBy = entries[0].id;
  assert.throws(() => validateNews(entries), /cycle/);
  delete entries[1].supersededBy;
  entries[0].corrections[0].on = "2026-10-14";
  assert.throws(() => validateNews(entries), /chronology/);
});
test("archive filters combine type, topic, state, original year and literal query", () => {
  assert.equal(filterNews({ kind: "site_update" }).length, 1);
  assert.equal(filterNews({ state: "TX", kind: "election_news" }).length, 0);
  assert.equal(filterNews({ year: "2025" })[0].eventOn, "2025-10-15");
  assert.equal(filterNews({ kind: "election_news", topic: "technology", q: "OPENAI" })[0].id, "ap-openai-2026");
  assert.equal(filterNews({ q: "<script>" }).length, 0);
  assert.equal(filterNews({ topic: "constructor" }).length, 0);
});
test("RSS has unique canonical identities, source attribution, escaped text and no invented pubDate", () => {
  const rss = newsRss();
  assert.equal((rss.match(/<item>/g) ?? []).length, newsEntries.length);
  assert.equal((rss.match(/<guid /g) ?? []).length, newsEntries.length);
  assert.match(rss, /2025-10-15/);
  assert.match(rss, /Brief reviewed: 2026-10-12/);
  assert.match(rss, /Sources: Associated Press/);
  assert.doesNotMatch(rss, /<pubDate>|privateNotes|artifactPath|CLERK/);
  assert.equal(xmlEscape('<>&"\''), "&lt;&gt;&amp;&quot;&apos;");
});
test("toolbar registry selects the longest whole-segment match and respects the equipment gate", () => {
  assertUnique(siteNavigation.map((link) => link.href));
  for (const [path, id] of [["/", "workspace"], ["/connections", "connections"], ["/news/ap-openai-election-data-agreement", "news"], ["/equipment/state/TX", "equipment"], ["/county/55087", "counties"], ["/timeline", "evidence"], ["/states/wisconsin", "states"]]) assert.equal(activeSitePage(path), id);
  for (const path of ["/newsroom", "/admin/connections", "/sign-in", "/missing"]) assert.equal(activeSitePage(path), null);
  assert.ok(visibleSiteNavigation(true).some((link) => link.id === "equipment"));
  assert.ok(!visibleSiteNavigation(false).some((link) => link.id === "equipment"));
  assert.ok(!siteNavigation.some((link) => link.href.startsWith("/admin")));
});
function assertUnique(values) { assert.equal(new Set(values).size, values.length); }
test("public shell is single-owned, deploy packaging includes registry and no data/auth/write dependency enters news", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.equal((layout.match(/<SiteHeader /g) ?? []).length, 1);
  assert.match(readFileSync(".vercelignore", "utf8"), /!data\/news\.json/);
  const news = readFileSync("src/lib/news.ts", "utf8");
  assert.doesNotMatch(news, /connection-research-repository|DATABASE_URL|clerk|fetch\(/i);
  for (const path of ["page.tsx", "connections/page.tsx", "compare/page.tsx", "evidence/page.tsx", "readiness/page.tsx", "seo/landing.tsx"]) assert.doesNotMatch(readFileSync(`src/app/${path}`, "utf8"), /<SiteHeader|<header className=(?:\{styles\.(?:topbar|header)\}|"topbar")/);
});

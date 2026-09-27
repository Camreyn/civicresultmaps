import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { absoluteUrl, pageMetadata, publicSourceUrl, serializeJsonLd, identityJsonLd, siteOrigin } from "../../src/lib/seo.ts";
import { seoStates, seoCounties, stateBySlug, stateByDatasetSlug, countyBySlug, countyByTag, stateElectionPath, countyElectionPath, datasetPath } from "../../src/lib/seo-geography.ts";
import { appSeoPolicy, appQueryPath } from "../../src/lib/seo-query-policy.ts";
import { breadcrumbJsonLd, catalogJsonLd, datasetJsonLd } from "../../src/lib/seo-structured-data.ts";

test("canonical state and county paths round-trip without collisions", () => {
  assert.equal(seoStates.length, 51);
  assert.equal(new Set(seoCounties.map((county) => county.path)).size, seoCounties.length);
  for (const state of seoStates) {
    assert.equal(stateBySlug(state.slug)?.code, state.code);
    assert.equal(stateByDatasetSlug(datasetPath(state).split("/").at(-1))?.code, state.code);
  }
  for (const county of seoCounties) assert.equal(countyBySlug(county.state, county.slug)?.fips, county.fips);
  assert.equal(countyBySlug("WI", "outagamie")?.fips, "55087");
  assert.equal(countyBySlug("WI", "made-up"), undefined);
  assert.equal(stateBySlug("WI"), undefined);
});
test("county-equivalent labels retain disambiguating administrative names", () => {
  const county = seoCounties.find((row) => row.state === "VA" && row.displayName === "Richmond County");
  const city = seoCounties.find((row) => row.state === "VA" && /Richmond city/i.test(row.displayName));
  assert.ok(county && city);
  assert.notEqual(county.slug, city.slug);
  assert.ok(city.slug.includes("city"));
});
test("only equivalent 2024 result map views consolidate to semantic pages", () => {
  const wi = stateBySlug("wisconsin");
  assert.deepEqual(appSeoPolicy({}), { path: "/", index: true, semantic: false });
  for (const mode of [undefined, "winner", "margin", "volume"]) {
    const policy = appSeoPolicy({ state: "WI", year: "2024", tab: "map", mode });
    assert.equal(policy.path, stateElectionPath(wi)); assert.equal(policy.index, true);
  }
  assert.equal(appSeoPolicy({ state: "WI", fips: "55087" }).path, countyElectionPath(countyByTag("county:55087")));
});
test("filters, exports, equipment, history, unknowns, and repeated parameters are noindex", () => {
  for (const params of [
    { state: "WI", tab: "exports" }, { state: "MN", mode: "equipment" },
    { state: "WI", tab: "review" }, { state: "WI", year: "2020" },
    { state: "WI", year: "nonsense" }, { state: "ZZ" }, { state: ["WI", "MN"] },
    { state: "WI", fips: "27001" }, { state: "WI", sort: "votes" }, { q: "county" },
  ]) { const policy = appSeoPolicy(params); assert.equal(policy.index, false); assert.equal(policy.semantic, false); }
  assert.equal(appSeoPolicy({ tab: "exports", state: "WI" }).path, "/?state=WI&tab=exports");
});
test("metadata has one absolute canonical and matching social identity", () => {
  const meta = pageMetadata({ title: "Wisconsin results", description: "Source-linked records.", path: "/states/wisconsin", index: false });
  assert.equal(meta.alternates.canonical, `${siteOrigin}/states/wisconsin`);
  assert.equal(meta.openGraph.url, meta.alternates.canonical);
  assert.equal(meta.robots.index, false); assert.equal(meta.robots.follow, true);
  assert.equal(meta.title.absolute, "Wisconsin results | Civic Result Maps");
});

test("excluded application queries do not echo arbitrary values into canonical or social URLs", () => {
  const meta = pageMetadata({ title: "Explorer", description: "Source records.", path: "/?token=synthetic-private-value", index: false, canonical: false });
  assert.equal(meta.alternates, undefined);
  assert.equal(meta.openGraph.url, undefined);
  assert.equal(JSON.stringify(meta).includes("synthetic-private-value"), false);
  assert.match(readFileSync(new URL("../../src/proxy.ts", import.meta.url), "utf8"), /process\.env\.VERCEL_ENV === "preview"/);
});
test("structured data cannot break out of its script element", () => {
  const text = '</script><script>alert("x")</script>\u2028';
  const serialized = serializeJsonLd({ text });
  assert.equal(serialized.includes("<"), false);
  assert.equal(JSON.parse(serialized).text, text);
});
test("shared metadata preserves large social-card images", () => {
  const meta = pageMetadata({ title: "State explorer", description: "Source records.", path: "/", image: { path: "/api/social-card?state=WI&year=2024", alt: "State data overview" } });
  assert.equal(meta.twitter.card, "summary_large_image");
  assert.equal(meta.openGraph.images[0].url, `${siteOrigin}/api/social-card?state=WI&year=2024`);
  assert.equal(meta.openGraph.images[0].width, 1200);
  assert.equal(meta.openGraph.images[0].height, 630);
});
test("source URLs reject executable and credential-bearing links", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "/relative", "https://user:pass@example.com", "nonsense"]) assert.equal(publicSourceUrl(url), null);
  assert.equal(publicSourceUrl("https://example.gov/results"), "https://example.gov/results");
  for (const path of ["https://example.com", "//example.com", "/\\example.com"]) assert.throws(() => absoluteUrl(path));
});
test("Dataset declares only actual distributions, not invented licenses, dates or equivalences", () => {
  const wi = stateBySlug("wisconsin");
  const json = datasetJsonLd(wi, ["county", "county", "state"], ["https://example.gov/results", "javascript:alert(1)"]);
  assert.equal(json["@type"], "Dataset"); assert.equal(json.temporalCoverage, "2024");
  assert.equal(json.distribution.length, 2);
  assert.deepEqual(json.isBasedOn, ["https://example.gov/results"]);
  for (const field of ["license", "sameAs", "datePublished", "dateModified"]) assert.equal(field in json, false);
  for (const download of json.distribution) {
    const url = new URL(download.contentUrl);
    assert.equal(download["@type"], "DataDownload"); assert.equal(download.encodingFormat, "application/json");
    assert.equal(url.origin, siteOrigin); assert.equal(url.searchParams.get("office"), "president");
  }
  assert.equal(catalogJsonLd([wi]).dataset[0]["@id"], json["@id"]);
});
test("identity graph and breadcrumbs have stable absolute identifiers", () => {
  assert.deepEqual(identityJsonLd["@graph"].map((node) => node["@type"]), ["Organization", "WebSite"]);
  const list = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "States", path: "/states" }]);
  assert.deepEqual(list.itemListElement.map((item) => item.position), [1, 2]);
  assert.equal(list.itemListElement[1].item, `${siteOrigin}/states`);
});
test("new data reader has no seeded fallback or write path", () => {
  const source = readFileSync(new URL("../../src/lib/seo-data.ts", import.meta.url), "utf8");
  assert.match(source, /getReadSql/); assert.match(source, /if \(!hasReadableDatabase\(\)\) return \[\]/);
  assert.doesNotMatch(source, /seedResults|seedSources|catch\s*\(|\b(?:insert into|update result_rows|delete from)\b/i);
  assert.match(source, /row\.level === "county" && row\.jurisdictionTag === tag/);
});
test("sitemap omits fabricated timestamps and redirects while retaining eligible equipment routes", () => {
  const source = readFileSync(new URL("../../src/app/sitemap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new Date|lastModified:|\/timeline|\/admin/);
  assert.match(source, /sourceLinked/); assert.match(source, /loadSeoAvailability/);
  assert.match(source, /isEquipmentExplorerEnabled/);
  assert.match(source, /equipmentCatalogMetadata\.productionReady/);
  assert.match(source, /equipmentDossierSections/);
  assert.match(source, /listTrackedEquipmentStates/);
  assert.match(source, /indexableStateCodes/);
});

test("unavailable semantic destinations retain the complete normalized application query", () => {
  assert.equal(appQueryPath({ state: "WI", fips: "55087", year: "2024", tab: "map" }), "/?fips=55087&state=WI&tab=map&year=2024");
  assert.equal(appQueryPath({ state: ["WI", "MN"] }), "/?state=WI&state=MN");
  assert.equal(appQueryPath({}), "/");
});

import { test, expect } from "@playwright/test";

const origin = "https://www.civicresultmaps.org";
const statePath = "/states/wisconsin/elections/2024/president";
const countyPath = "/counties/wisconsin/outagamie/elections/2024/president";
const datasetPath = "/datasets/wisconsin-2024-presidential-results";

test("semantic directories render without JavaScript and expose canonical crawl links", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  for (const path of ["/states", "/states/wisconsin", "/counties", "/counties/wisconsin", "/counties/wisconsin/outagamie", "/elections", "/elections/2024/president", "/datasets", "/developers", "/readiness", "/privacy"]) {
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + path);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('a[href="/states"]')).not.toHaveCount(0);
  }
  await page.goto("/counties/wisconsin");
  await page.getByRole("link", { name: "Outagamie County", exact: true }).click();
  await expect(page).toHaveURL(/\/counties\/wisconsin\/outagamie$/);
  await context.close();
});

test("result and dataset initial HTML reconcile with the existing API", async ({ browser, request, baseURL }) => {
  const response = await request.get("/api/results?state=WI&year=2024&office=president&level=county");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  test.skip(payload.meta.source !== "database", "Requires an existing published-data connection; seed data is intentionally not indexed.");
  const county = payload.data.find((row: { jurisdictionTag?: string }) => row.jurisdictionTag === "county:55087");
  expect(county).toBeTruthy();
  const queryPage = await request.get("/?state=WI");
  expect(await queryPage.text()).toContain(`rel="canonical" href="${origin}${statePath}"`);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  for (const path of [statePath, countyPath, datasetPath]) {
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + path);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).not.toContain("noindex");
  }
  const datasets = await page.locator('script[type="application/ld+json"]').allTextContents();
  const dataset = datasets.map((value) => JSON.parse(value)).find((value) => value["@type"] === "Dataset");
  expect(dataset.name).toContain("Wisconsin");
  expect(dataset.license).toBeUndefined(); expect(dataset.dateModified).toBeUndefined();
  for (const distribution of dataset.distribution) {
    const url = new URL(distribution.contentUrl);
    const download = await request.get(url.pathname + url.search);
    expect(download.status()).toBe(200); expect(download.headers()["content-type"]).toContain("application/json");
    expect((await download.json()).data.length).toBeGreaterThan(0);
  }
  await page.goto(countyPath);
  for (const [candidate, votes] of Object.entries(county.votes)) {
    const row = page.locator("tbody tr").filter({ has: page.getByRole("cell", { name: candidate, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell", { name: Number(votes).toLocaleString("en-US"), exact: true })).toHaveCount(1);
    await expect(row.locator('a[href^="https://"]')).not.toHaveCount(0);
  }
  await context.close();
});

test("invalid semantic routes are real 404s", async ({ request }) => {
  for (const path of ["/states/not-a-state", "/states/wisconsin/elections/2023/president", "/counties/wisconsin/not-a-county", "/counties/minnesota/outagamie", "/datasets/not-a-dataset"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("query filters are excluded without breaking deep links", async ({ request }) => {
  for (const path of ["/?state=WI&tab=exports&year=2024", "/?state=MN&mode=equipment&tab=map&year=2024", "/?state=WI&year=2020", "/?state=WI&sort=votes"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const robots = html.match(/<meta[^>]*name="robots"[^>]*>/g) ?? [];
    expect(robots, path).toEqual([expect.stringContaining('content="noindex, follow"')]);
    expect(html.match(/<link[^>]*rel="canonical"[^>]*>/g) ?? [], path).toEqual([]);
  }
  expect((await request.get("/readiness?filter=review-ready")).headers()["x-robots-tag"]).toBe("noindex, follow");
});

test("homepage metadata and versioned social images reach HTML-only crawlers", async ({ request }) => {
  for (const path of ["/", "/?state=WI&tab=exports&year=2024", "/?state=WI&token=synthetic-private-value"]) {
    const response = await request.get(path, { headers: { "user-agent": "Twitterbot" } });
    expect(response.status(), path).toBe(200);
    const head = (await response.text()).split("</head>")[0];
    expect(head.match(/<title>[^<]+<\/title>/g) ?? [], path).toHaveLength(1);
    const image = head.match(/<meta[^>]*property="og:image"[^>]*>/g) ?? [];
    expect(image, path).toEqual([expect.stringContaining(`${origin}/api/social-card?`)]);
    expect(image[0]).toContain("v=map-");
    expect(head).not.toContain("synthetic-private-value");
  }
});

test("sitemap uses canonical 200 routes without artificial modification dates", async ({ request }) => {
  const robots = await request.get("/robots.txt"); expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  const response = await request.get("/sitemap.xml"); expect(response.status()).toBe(200);
  const xml = await response.text(); expect(xml).not.toContain("<lastmod>");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls.filter((url) => !url.startsWith(origin + "/") || url.includes("?"))).toEqual([]);
  for (const path of ["/states", "/datasets", "/counties/wisconsin/outagamie"]) {
    expect(urls).toContain(origin + path); expect((await request.get(path)).status()).toBe(200);
  }
});

test("alternate production host redirects permanently while preserving the deep link", async ({ request }) => {
  const response = await request.get("/?state=WI&tab=exports", { headers: { host: "civicresultmaps.org", "x-forwarded-proto": "https" }, maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe(`${origin}/?state=WI&tab=exports`);
});

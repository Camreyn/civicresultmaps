import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const routes = [
  ["/", "Results"], ["/compare", "Compare"], ["/connections", "Connections"],
  ["/equipment", "Equipment"], ["/equipment/dominion-democracy-suite-517-imagecast-x/components", "Equipment"],
  ["/evidence", "Evidence"], ["/news", "News"], ["/news/ap-openai-election-data-agreement", "News"],
  ["/security", "Security"], ["/readiness", "Readiness"], ["/releases", "Releases"],
  ["/developers", "API"], ["/privacy", "Privacy"], ["/district-compactness", "District compactness"],
  ["/elections", "Elections"], ["/states/wisconsin", "States"], ["/counties", "Counties"], ["/datasets", "Datasets"],
] as const;

for (const width of [390, 900, 1440]) {
  test(`one consistent toolbar and active destination across routes at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(45_000);
    await page.setViewportSize({ width, height: 900 });
    for (const [path, active] of routes) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const header = page.locator("[data-site-header]");
      await expect(header).toHaveCount(1);
      await expect(header).toHaveCSS("position", "sticky");
      await expect(header.getByRole("link", { name: "Civic Result Maps home" })).toBeVisible();
      if (width <= 1100) await header.getByRole("button", { name: "Primary navigation menu" }).click();
      else if (!["Results", "Compare", "Connections", "Equipment", "Evidence", "News"].includes(active)) await header.getByRole("button", { name: "More navigation menu" }).click();
      await expect(header.getByRole("link", { name: active, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(header.getByRole("link", { name: active, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
      await expect(header).not.toContainText("Database live");
    }
  });
}
test("mobile and More menus support keyboard, escape, outside click and active nested routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/news/ap-openai-election-data-agreement");
  const header = page.locator("[data-site-header]");
  const trigger = header.getByRole("button", { name: "Primary navigation menu" });
  await trigger.press("Enter");
  const nav = header.getByRole("navigation", { name: "Mobile primary navigation" });
  await expect(nav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  // The menu overlays the right side of the heading; click its exposed left edge.
  await page.getByRole("heading", { level: 1 }).click({ position: { x: 8, y: 8 } });
  await expect(nav).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await header.getByRole("button", { name: "More navigation menu" }).press("Enter");
  await expect(header.getByRole("link", { name: "API", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(header.getByRole("button", { name: "More navigation menu" })).toBeFocused();
});
test("unknown and admin routes receive only public chrome", async ({ page }) => {
  for (const path of ["/news/missing-brief", "/missing-public-page", "/admin/connections"]) {
    const response = await page.goto(path);
    if (!path.startsWith("/admin")) expect(response?.status()).toBe(404);
    const header = page.locator("[data-site-header]");
    await expect(header).toHaveCount(1);
    await expect(header.locator('a[href^="/admin"]')).toHaveCount(0);
    if (path.startsWith("/news")) await expect(header.getByRole("link", { name: "News", exact: true })).toHaveAttribute("aria-current", "page");
    else await expect(header.locator('a[aria-current="page"]')).toHaveCount(0);
  }
});
test("editor test-harness controls stay below the public toolbar when scrolling", async ({ page }) => {
  await page.goto("/layout-test-harness");
  await expect(page.getByRole("heading", { name: "Workspace builder v4", exact: true })).toBeVisible();
  const editorToolbar = page.locator('header[class*="layout-editor-v3-module"][class*="toolbar"]');
  await expect(editorToolbar).toHaveCount(1);
  await page.evaluate(() => scrollTo(0, 450));
  const publicBottom = await page.locator("[data-site-header]").evaluate((element) => element.getBoundingClientRect().bottom);
  const editorTop = await editorToolbar.evaluate((element) => element.getBoundingClientRect().top);
  expect(editorTop).toBeGreaterThanOrEqual(publicBottom);
});
test("news archive filters, details, original dates, sources and related graph flow", async ({ page }) => {
  await page.goto("/news");
  const archive = page.getByRole("region", { name: "News archive" });
  await expect(archive.getByRole("article")).toHaveCount(4);
  const form = page.getByRole("form", { name: "Filter news" });
  await form.getByLabel("Type", { exact: true }).selectOption("election_news");
  await form.getByLabel("Event year").selectOption("2025");
  await form.getByRole("button", { name: "Apply filters" }).click();
  await expect(archive.getByRole("article")).toHaveCount(1);
  await archive.getByRole("link", { name: "AP announces U.S. network election-results customers" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AP announces U.S. network election-results customers");
  await expect(page.locator("dl")).toContainText("Oct 15, 2025");
  await expect(page.locator("dl")).toContainText("Oct 12, 2026");
  await expect(page.getByRole("heading", { name: "What this does not establish" })).toBeVisible();
  const structured = JSON.parse((await page.locator('main script[type="application/ld+json"]').textContent())!);
  expect(structured.datePublished).toBeUndefined();
  expect(structured.dateModified).toBeUndefined();
  await expect(page.getByRole("link", { name: /AP announces U.S. networks as elections customers/ })).toHaveAttribute("href", /^https:\/\/www.ap.org\//);
  await page.getByRole("link", { name: "Explore: Associated Press → CNN", exact: true }).click();
  await expect(page).toHaveURL(/edge=ap-cnn/);
  await expect(page.getByRole("complementary", { name: "Selected connection evidence" })).toContainText("Networks retain independent race calls");
  await page.goto("/news?q=no-matching-brief");
  await expect(page.getByRole("heading", { name: "No briefs match these filters" })).toBeVisible();
});
test("news and native mobile navigation remain usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/news");
  await page.getByRole("button", { name: "Primary navigation menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile primary navigation" }).getByRole("link", { name: "News", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Primary navigation menu" }).click();
  await page.getByLabel("Type", { exact: true }).selectOption("site_update");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("region", { name: "News archive" }).getByRole("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Connections adds guided examples and local evidence scopes" }).click();
  await expect(page.getByRole("heading", { name: "Sources", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Merged Connections update/ })).toHaveAttribute("href", /commit\/064abf6/);
  await context.close();
});
test("News is accessible, canonical, feed-linked, indexed and has working 1200x630 social images", async ({ page, request }, testInfo) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/news");
    await page.screenshot({ path: testInfo.outputPath(`news-archive-${width}.png`), fullPage: true, caret: "initial" });
    await page.goto("/news?topic=technology");
    if (width === 390) await page.getByRole("button", { name: "Primary navigation menu" }).click();
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`news-${width}.png`), fullPage: true, caret: "initial" });
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.civicresultmaps.org/news");
  await expect(page.locator('link[type="application/rss+xml"]')).toHaveAttribute("href", "https://www.civicresultmaps.org/news/feed.xml");
  const feed = await request.get("/news/feed.xml");
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  const xml = await feed.text();
  expect(await page.evaluate((text) => new DOMParser().parseFromString(text, "application/xml").querySelector("parsererror") === null, xml)).toBe(true);
  expect((xml.match(/<item>/g) ?? []).length).toBe(4);
  expect(xml).not.toContain("<pubDate>");
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("/news/ap-openai-election-data-agreement");
  for (const path of ["/api/news-social-card", "/api/news-social-card?slug=ap-openai-election-data-agreement"]) {
    const image = await request.get(path);
    expect(image.status()).toBe(200);
    const metadata = await sharp(await image.body()).metadata();
    expect([metadata.width, metadata.height, metadata.format]).toEqual([1200, 630, "png"]);
    await writeFile(testInfo.outputPath(path.includes("?") ? "news-article-social.png" : "news-social.png"), await image.body());
  }
  expect((await request.get("/api/news-social-card?slug=missing")).status()).toBe(404);
});

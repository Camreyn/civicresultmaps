import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

test("renders the graph, inspects a source, focuses neighbors and restores a shared URL", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/connections");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Election connections");
  const about = page.getByRole("region", { name: "About this page" });
  await expect(about).toContainText("Explore election-reporting networks, company ownership, and technology relationships.");
  await expect(about.getByRole("link", { name: "Drey Dossier's TikTok video" })).toHaveAttribute("href", "https://www.tiktok.com/@thedreydossier/video/7695387832902241567");
  for (const removedCopy of ["Follow the connections.", "Keep the evidence in view.", "Research pilot", "The documentary layer", "Room to expand", "Connections are not conclusions.", "Documented relationship"]) {
    await expect(page.getByText(removedCopy, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator("[data-connection-node='ap']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-connection-select='ap-cnn']").click();
  const inspector = page.getByRole("complementary", { name: "Selected connection evidence" });
  await expect(inspector.getByText(/Networks retain independent race calls/)).toBeVisible();
  await inspector.locator("summary").filter({ hasText: "AP announces U.S. networks" }).click();
  await expect(inspector.getByRole("link", { name: /Original source/ })).toHaveAttribute("href", /^https:\/\/www.ap.org\//);
  await expect(page).toHaveURL(/edge=ap-cnn/);
  await page.reload();
  await expect(inspector.getByText(/Networks retain independent race calls/)).toBeVisible();
  await page.getByLabel("Focus selected node").check();
  await expect(page.locator("[data-connection-node='ssrs']")).toHaveCount(0);
  await expect(page.locator("[data-connection-node='cnn']")).toHaveCount(1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  expect(errors).toEqual([]);
});

test("switches historical reporting without conflating vote counts and surveys", async ({ page }) => {
  await page.goto("/connections");
  await page.getByLabel("Evidence date").fill("2024-11-05");
  await expect(page.locator("[data-connection-node='nep']")).toBeVisible();
  await expect(page.locator("[data-connection-select='nep-cnn']")).toHaveCount(1);
  await expect(page.locator("[data-connection-select='ap-cnn']")).toHaveCount(0);
  await page.locator("[data-connection-select='norc-votecast']").click();
  await expect(page.getByRole("complementary").getByText(/not a second certified ballot count/)).toBeVisible();
});

test("search crosses views and technology deployment questions remain unresolved", async ({ page }) => {
  await page.goto("/connections");
  await page.getByRole("searchbox").fill("Texas TEAM");
  await page.getByRole("button", { name: "Texas TEAM Election management", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.locator("[data-connection-node='team']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-connection-select='texas-team']").click();
  await expect(page.getByRole("complementary").getByText(/does not identify the current database engine/)).toBeVisible();
  await page.locator("summary").filter({ hasText: "Research questions" }).click();
  await page.locator("summary").filter({ hasText: "Does AP's core results database use Oracle?" }).click();
  await expect(page.getByText("An AP-specific architecture statement, contract or independently reviewable deployment record.")).toBeVisible();
  await page.getByRole("button", { name: /Ownership & roles/ }).click();
  await expect(page.locator("[data-connection-node='paramount']")).toBeVisible();
});

test("downloads a reproducible evidence registry", async ({ page }) => {
  await page.goto("/connections");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download evidence/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("election-connections-evidence.json");
  const path = await download.path();
  const evidence = JSON.parse(await readFile(path!, "utf8"));
  expect(evidence.schemaVersion).toBe(2);
  expect(evidence.sources.length).toBeGreaterThan(20);
  expect(evidence.evidence.every((item: { locator: { section: string } }) => Boolean(item.locator.section))).toBe(true);
  expect(evidence.claims.every((claim: { id: string }) => evidence.evidence.some((item: { claimId: string }) => item.claimId === claim.id))).toBe(true);
  expect(evidence.questions.some((lead: { id: string }) => lead.id === "save-oracle")).toBe(true);
  expect(evidence.revisions).toEqual([]);
  expect(JSON.stringify(evidence)).not.toContain("artifactPath");
});

test("has an accessible desktop and mobile flow without page-level overflow", async ({ page }) => {
  await page.goto("/connections");
  await page.locator("#connections-reading-guide > summary").click();
  let scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Inspect Associated Press", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("[data-connection-select='ap-cnn']").click();
  await expect(page.getByRole("complementary").getByText(/Networks retain independent race calls/)).toBeVisible();
  scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("source library and canonical metadata are available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/connections");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.civicresultmaps.org/connections");
  await expect(page.getByRole("region", { name: "About this page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Drey Dossier's TikTok video" })).toHaveAttribute("rel", "noopener noreferrer");
  await page.locator("#connections-reading-guide > summary").click();
  await expect(page.locator("#connections-reading-guide")).toContainText("Arrows follow the relationship wording, not necessarily a flow of votes or data.");
  await expect(page.getByRole("heading", { name: "Sources 28", exact: true })).toBeVisible();
  await expect(page.locator("#source-library")).not.toHaveAttribute("open", "");
  await page.locator("#source-library > summary").click();
  await expect(page.locator("#source-library article")).toHaveCount(28);
  await page.locator("#source-dhs-oracle summary").click();
  await expect(page.locator("#source-dhs-oracle")).toContainText("Exact record read in the browser");
  await context.close();
});

test("explains views, dates, evidence types and paths without changing their meaning", async ({ page }) => {
  await page.goto("/connections");
  await expect(page.getByLabel("Evidence date")).toBeEnabled();
  await expect(page.locator("#connection-view-description")).toContainText("surveys are not ballot counts");
  await page.getByLabel("Time filter").selectOption("active");
  await expect(page.locator("#connection-date-help")).toContainText("both a documented start and end date");
  await expect(page.getByText("No connections match these filters. Known active on requires documented start and end dates covering this day; missing results do not prove a relationship was inactive.")).toBeVisible();
  await page.getByLabel("Time filter").selectOption("documented");
  await page.getByRole("combobox", { name: "Relationship", exact: true }).selectOption("results");
  await expect(page.getByRole("combobox", { name: "Relationship", exact: true })).toHaveAttribute("aria-describedby", "connection-kind-help");
  await page.getByLabel("Evidence classification").selectOption("issuer_statement");
  await expect(page.getByLabel("Evidence classification")).toHaveAttribute("aria-describedby", "connection-attribution-help");
  await expect(page.getByRole("group", { name: "Connection map", exact: true })).toHaveAttribute("aria-describedby", "connection-map-guide");
  await expect(page.locator("#connection-attribution-help")).toContainText("This is not independent corroboration.");
  await page.locator("[data-connection-select='ap-cnn']").click();
  const inspector = page.getByRole("complementary", { name: "Selected connection evidence" });
  await expect(inspector.getByRole("heading", { name: "What the sources support", exact: true })).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "What is not established", exact: true })).toBeVisible();
  await inspector.locator("summary").filter({ hasText: "Find connections" }).click();
  await expect(inspector.getByLabel("Follow only directed results relationships")).toBeVisible();
  await expect(inspector.locator("#connection-path-help")).toContainText("does not prove a live technical feed");
  await page.getByRole("button", { name: "Ownership & roles", exact: true }).click();
  await expect(page.locator("#connection-view-description")).toContainText("Company holdings, acquisitions");
  await page.getByRole("button", { name: "Technology & public systems", exact: true }).click();
  await expect(page.locator("#connection-view-description")).toContainText("department-wide contract");
  await page.getByRole("combobox", { name: "Relationship", exact: true }).selectOption("all");
  await page.getByLabel("Evidence classification").selectOption("all");
  await page.getByRole("button", { name: "timeline", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Publication/observation date unknown" }).click();
  await expect(page.getByText("An event date may still be listed in Sources; it is not used here as a publication or observation date.")).toBeVisible();
});

test("social crawlers receive a dedicated, publicly readable PNG thumbnail", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: "Twitterbot/1.0" });
  const page = await context.newPage();
  await page.goto("/connections?view=ownership&node=paramount");
  const imageUrl = "https://www.civicresultmaps.org/api/connections-social-card?v=2";
  await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute("content", imageUrl);
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", /AP's announced election-data agreements/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('head meta[name="twitter:image"]')).toHaveAttribute("content", imageUrl);
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute("content", /separate Oracle–OpenAI AI-capacity partnership/);
  const imagePath = new URL(imageUrl).pathname + new URL(imageUrl).search;
  const response = await context.request.get(imagePath);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect(response.headers()["cache-control"]).toBe("public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
  const png = await response.body();
  const image = await sharp(png).metadata();
  expect(image.format).toBe("png");
  expect(image.width).toBe(1200);
  expect(image.height).toBe(630);
  await mkdir("outputs", { recursive: true });
  await writeFile("outputs/connections-social-thumbnail-v2.png", png);
  await test.info().attach("connections-social-thumbnail", { body: png, contentType: "image/png" });
  await context.close();
});

test("captures a source-linked preview", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.goto("/connections?view=reporting&year=2026&node=ap&edge=ap-cnn");
  await expect(page.locator("[data-connection-node='ap']")).toBeVisible();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.getByRole("complementary").getByText(/Networks retain independent race calls/)).toBeVisible();
  await page.screenshot({ path: "outputs/election-connections-preview.png", fullPage: false });
});

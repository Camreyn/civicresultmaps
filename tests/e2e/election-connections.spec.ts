import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("renders the graph, inspects a source, focuses neighbors and restores a shared URL", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/connections");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Election connections");
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
  await expect(page.getByRole("heading", { name: "Sources 28", exact: true })).toBeVisible();
  await expect(page.locator("#source-library")).not.toHaveAttribute("open", "");
  await page.locator("#source-library > summary").click();
  await expect(page.locator("#source-library article")).toHaveCount(28);
  await page.locator("#source-dhs-oracle summary").click();
  await expect(page.locator("#source-dhs-oracle")).toContainText("Exact record read in the browser");
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

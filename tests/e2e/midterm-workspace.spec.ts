import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("main page offers a separate 2026 cycle and a source-backed equipment table", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?state=WA&year=2024&tab=map");
  await page.getByRole("navigation", { name: "Election cycle" }).getByRole("link", { name: /2026 midterms/ }).click();
  await expect(page.getByRole("heading", { name: "New York election workspace" })).toBeVisible();
  await expect(page).toHaveTitle(/New York 2026 Midterms/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const response = await request.get("/api/midterms/equipment?state=NY&year=2026");
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.rows).toHaveLength(62);
  const bodyRows = page.locator("table tbody tr");
  await expect(bodyRows).toHaveCount(62);
  // Reconcile every displayed county family and source, not just a sample.
  for (let index = 0; index < data.rows.length; index++) {
    const row = data.rows[index];
    await expect(bodyRows.nth(index)).toContainText(row.county);
    await expect(bodyRows.nth(index).locator("td").first()).toContainText(row.family);
    await expect(bodyRows.nth(index).locator("td").first().getByRole("link")).toHaveAttribute("href", data.sources.find((source: { id: string }) => source.id === row.sourceId).url);
  }
  await page.getByRole("searchbox").fill("Nassau");
  await expect(bodyRows).toHaveCount(1);
  await expect(bodyRows.first()).toContainText("Clear Ballot");
  await expect(bodyRows.first()).toContainText("Legacy official ES&S");
  await expect(bodyRows.first().getByRole("link", { name: "Legacy ES&S source" })).toHaveAttribute("href", "https://elections.ny.gov/node/276");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Listed system family", { exact: true }).selectOption("Hart / Verity");
  await expect(bodyRows).toHaveCount(7);
  await page.getByRole("searchbox").fill("no such county");
  await expect(page.getByText(/No counties match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  const csv = await request.get("/api/midterms/equipment?state=NY&year=2026&format=csv");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).trim().split("\r\n")).toHaveLength(63);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole("searchbox").fill("Nassau");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("ny-2026-equipment-desktop.png"), fullPage: true });
});

test("2026 views never borrow presidential results or unsupported state data", async ({ page, request }) => {
  await page.goto("/?state=NY&year=2026&tab=results");
  await expect(page.getByRole("heading", { name: "Equipment information is not election results" })).toBeVisible();
  await expect(page.getByText(/No 2024 presidential results are carried/)).toBeVisible();
  await page.getByRole("navigation", { name: "2026 workspace sections" }).getByRole("link", { name: "Sources & limits" }).click();
  await expect(page.getByRole("heading", { name: "Sources & evidence boundaries" })).toBeVisible();
  await page.goto("/?state=WA&year=2026&tab=equipment");
  await expect(page.getByRole("heading", { name: "2026 coverage is starting with New York" })).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
  await page.goto("/?state=WA&state=NY&year=2026");
  await expect(page).toHaveTitle(/Washington 2026 Midterms/);
  await expect(page.getByRole("heading", { name: "2026 coverage is starting with New York" })).toBeVisible();
  expect((await request.get("/api/midterms/equipment?state=WA&year=2026")).status()).toBe(404);
  expect((await request.get("/api/midterms/equipment?state=NY&year=2024")).status()).toBe(400);
  expect((await request.get("/api/midterms/equipment?state=NY&format=xml")).status()).toBe(400);
  await page.goto("/?year=2026&fips=36103");
  await expect(page.getByRole("searchbox")).toHaveValue("36103");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr")).toContainText("Suffolk");
});

test("mobile workspace keeps table overflow inside its own region", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?state=NY&year=2026&tab=equipment");
  await expect(page.getByRole("heading", { name: "County election equipment" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("searchbox").fill("Monroe");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr")).toContainText("Election Systems & Software");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("ny-2026-equipment-mobile.png"), fullPage: true });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const clearAccessPath = "/equipment/clear-ballot-clearvote-25-clearaccess";
const ds200Path = "/equipment/ess-evs-6400-ds200";
const imageCastXPath = "/equipment/dominion-democracy-suite-517-imagecast-x";

test("lists three source-linked equipment dossiers", async ({ page }) => {
  await page.goto("/equipment");
  await expect(page.getByRole("link", { name: /Open source-linked dossier/ })).toHaveCount(3);
  await expect(page.getByText("3 reviewed dossiers")).toBeVisible();
  await expect(page.getByText("Clear Ballot ClearVote 2.5 / ClearAccess")).toBeVisible();
  await expect(page.getByText("ES&S EVS 6.4.0.0 / DS200")).toBeVisible();
  await expect(page.getByText("Dominion Democracy Suite 5.17 / ImageCast X")).toBeVisible();
});

test("renders confirmed ClearAccess UPS options without inventing runtime", async ({ page, request }) => {
  await page.goto(clearAccessPath);
  await expect(page.getByRole("heading", { name: "Clear Ballot ClearVote 2.5 / ClearAccess" })).toBeVisible();
  await expect(page.getByText("CyberPower; APC", { exact: true })).toBeVisible();
  await expect(page.getByText("PR1500RT2U; SMT2200C; SRT1500RMXLA", { exact: true })).toBeVisible();
  await expect(page.getByText("Not specified in reviewed source", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "No reviewed deployment observation in this dossier" })).toBeVisible();
  await expect(page.locator("[aria-label='Equipment components'] button")).toHaveCount(9);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);

  const response = await request.get("/api/v1/equipment-systems/clear-ballot-clearvote-25-clearaccess");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.data.system.coverage.confirmedPowerRecordCount).toBe(1);
  expect(payload.data.sources).toHaveLength(4);
});

test("keeps the ClearAccess 3D view lazy, optional, and selectable", async ({ page }) => {
  await page.goto(clearAccessPath);
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(initialResources.filter((url) => url.endsWith(".glb"))).toHaveLength(0);
  const initialChunkCount = initialResources.filter((url) => url.includes("/_next/static/chunks/")).length;

  await page.getByRole("button", { name: /External uninterruptible power supply/ }).click();
  await page.getByRole("button", { name: /Open 3D view/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "External uninterruptible power supply", level: 3 })).toBeVisible();

  await expect.poll(() => page.evaluate(() =>
    performance.getEntriesByType("resource").some((entry) => entry.name.includes(".glb")),
  )).toBe(true);
  const viewerResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(viewerResources.filter((url) => url.includes("/_next/static/chunks/")).length).toBeGreaterThan(initialChunkCount);

  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByRole("button", { name: "Assembled" })).toBeVisible();
});

test("preserves the source-linked fallback when WebGL 2 is unavailable", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.goto(clearAccessPath);
  await page.getByRole("button", { name: /Open 3D view/ }).click();
  await expect(page.getByText("3D view unavailable")).toBeVisible();
  await expect(page.locator("[aria-label='Equipment components'] button")).toHaveCount(9);
  await context.close();
});

test("renders ImageCast X advisory and internal-component evidence boundaries", async ({ page, request }) => {
  await page.goto(imageCastXPath);
  await expect(page.getByRole("heading", { name: "Dominion Democracy Suite 5.17 / ImageCast X" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ICX Prime solid-state drive", level: 3 })).toHaveCount(0);
  const ssdButton = page.getByRole("button", { name: /ICX Prime solid-state drive/ });
  await ssdButton.press("Enter");
  await expect(ssdButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "ICX Prime solid-state drive", level: 3 })).toBeVisible();
  await expect(page.getByText(/not placed in the 3D scene/)).toBeVisible();
  await expect(page.getByText("SMT-1500; SMT-1500C; PR1500LCD; PR1500LCD-VTVM", { exact: true })).toBeVisible();
  await expect(page.getByText("Not specified in reviewed source", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Straight-party and split-ticket selection review advisory" })).toBeVisible();
  const response = await request.get("/api/v1/equipment-systems/dominion-democracy-suite-517-imagecast-x");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.data.system.coverage.sourceCount).toBe(8);
  expect(payload.data.sources).toHaveLength(8);
});

test("retains DS200 unknown-power and deployment evidence boundaries", async ({ page }) => {
  await page.goto(ds200Path);
  await expect(page.getByRole("heading", { name: "DS200 power / backup supply" })).toBeVisible();
  await expect(page.getByText("Jefferson County, Washington", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});


test("keeps the equipment evidence layout within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(imageCastXPath);
  await expect(page.getByRole("heading", { name: "Dominion Democracy Suite 5.17 / ImageCast X" })).toBeVisible();
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
  await expect(page.getByRole("button", { name: /Open 3D view/ })).toBeVisible();
});

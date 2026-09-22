import { expect, test, type Page } from "@playwright/test";

async function stateLoadEvents(page: Page) {
  return page.evaluate(() => (window.vaq ?? [])
    .filter(([kind, event]) => kind === "event" && (event as { name?: string })?.name === "state_loaded")
    .map(([, event]) => event));
}

test.beforeEach(async ({ page }) => {
  // Leave the SDK's real queue in place, including when the tracker mounts before
  // root Analytics. Never deliver local test pageviews or custom events to Vercel.
  await page.route(/(?:va\.vercel-scripts\.com\/|\/_vercel\/insights\/|\/[a-f0-9]{16}\/(?:script\.js|event|view|session)(?:\?|$))/, (route) =>
    route.fulfill({ contentType: "application/javascript", body: "/* local analytics test */" }));
});

test.afterEach(async ({ page }) => {
  await expect(page.locator("[data-nextjs-dialog], .nextjs-error-overlay, #webpack-dev-server-client-overlay"))
    .toHaveCount(0);
});

test("default state is queued once despite late analytics and local rerenders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("region", { name: /Washington workspace/i })).toBeVisible();
  const expected = [{ name: "state_loaded", data: { state: "WA", year: 2024, selection: "default" } }];
  await expect.poll(() => stateLoadEvents(page)).toEqual(expected);
  await expect(page.locator('script[data-sdkn="@vercel/analytics/next"]')).toHaveCount(1);

  await page.locator(".state-rail-collapse-button").click();
  await expect(page.getByRole("complementary", { name: "State coverage" })).toHaveClass(/is-collapsed/);
  await page.locator(".state-rail-collapse-button").click();
  await page.getByRole("button", { name: "Winner", exact: true }).click();
  await expect(page.getByLabel("Workspace map layer", { exact: true })).toHaveValue("winner");
  expect(await stateLoadEvents(page)).toEqual(expected);
  expect(errors).toEqual([]);
});

test("URL state/year loads and state navigation use only resolved properties", async ({ page }) => {
  await page.goto("/?state=WA&year=2020&tab=map&fips=53033&search=not-an-event-property");
  await expect(page.getByLabel("Workspace election year", { exact: true })).toHaveValue("2020");
  await expect.poll(() => stateLoadEvents(page)).toEqual([
    { name: "state_loaded", data: { state: "WA", year: 2020, selection: "explicit" } },
  ]);

  await page.getByLabel("Workspace state", { exact: true }).selectOption("WI");
  await expect(page.getByLabel("Workspace state", { exact: true })).toHaveValue("WI");
  await expect.poll(() => stateLoadEvents(page)).toEqual([
    { name: "state_loaded", data: { state: "WI", year: 2020, selection: "explicit" } },
  ]);

  // The History workspace resolves to 2024 even if an earlier year was requested.
  await page.goto("/?state=WI&year=2016&tab=history");
  await expect(page.getByLabel("Workspace election year", { exact: true })).toHaveValue("2024");
  await expect.poll(() => stateLoadEvents(page)).toEqual([
    { name: "state_loaded", data: { state: "WI", year: 2024, selection: "explicit" } },
  ]);
});

test("unrecognized states and other site pages do not emit state loads", async ({ page }) => {
  await page.goto("/?state=ZZ");
  await expect(page.getByRole("region", { name: "ZZ workspace", exact: true })).toBeVisible();
  await expect(page.locator('script[data-sdkn="@vercel/analytics/next"]')).toHaveCount(1);
  expect(await stateLoadEvents(page)).toEqual([]);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Analytics and public records" })).toBeVisible();
  await expect(page.getByText(/we record aggregate state-load events/)).toBeVisible();
  await expect(page.locator('script[data-sdkn="@vercel/analytics/next"]')).toHaveCount(1);
  expect(await stateLoadEvents(page)).toEqual([]);
});

test("a failing analytics sink does not prevent workspace access", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.va = (kind) => {
      if (kind === "event") throw new Error("Intentional test analytics failure");
    };
  });
  await page.goto("/?state=WA");
  await expect(page.getByRole("region", { name: /Washington workspace/i })).toBeVisible();
  await page.locator(".state-rail-collapse-button").click();
  await expect(page.getByRole("complementary", { name: "State coverage" })).toHaveClass(/is-collapsed/);
  expect(errors).toEqual([]);
});

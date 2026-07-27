import { expect, test } from "@playwright/test";

const browserErrors = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  await expect(page.locator("body")).not.toHaveText("");
  await expect(page.locator("[data-nextjs-dialog], .nextjs-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  expect(browserErrors.get(page) ?? []).toEqual([]);
});
test("public workspace uses the safe embedded layout and durable visitor cookie", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);
  await context.addCookies([{ name: "crm_layout_visitor", value: "malformed", url: baseURL! }]);
  await page.goto("/?state=WA&year=2024&tab=map&mode=margin&fips=53033");

  const workspace = page.getByRole("region", { name: /Washington workspace/i });
  await expect(workspace).toBeVisible();
  const workspaceContext = page.getByRole("region", { name: "Election workspace context" });
  await expect(workspaceContext).toBeVisible();
  await expect(workspaceContext.getByLabel("Workspace state")).toHaveValue("WA");
  await expect(workspaceContext.getByLabel("Workspace election year")).toHaveValue("2024");
  await expect(workspaceContext.getByText("President", { exact: true })).toBeVisible();
  await expect(workspaceContext.getByLabel("Workspace geography")).toHaveValue("53033");
  await expect(workspaceContext.getByLabel("Workspace map layer")).toHaveValue("margin");
  await expect(workspaceContext.getByRole("heading", { level: 1, name: /Washington/i })).toBeVisible();
  await expect(workspaceContext.locator(".workspace-context-control")).toHaveCount(5);
  await expect(workspaceContext.locator(".workspace-context-readonly")).toHaveText("President");

  const mapPanel = page.locator('[aria-label="WA county map"]');
  const supportingTools = page.getByRole("region", { name: "Additional workspace tools" });
  await expect(mapPanel).toBeVisible();
  await expect(supportingTools).toBeVisible();
  const [contextBounds, mapBounds, supportingBounds] = await Promise.all([
    workspaceContext.boundingBox(),
    mapPanel.boundingBox(),
    supportingTools.boundingBox(),
  ]);
  if (!contextBounds || !mapBounds || !supportingBounds) {
    throw new Error("Expected workspace priority surfaces to have measurable bounds.");
  }
  expect(contextBounds.y).toBeLessThan(mapBounds.y);
  expect(mapBounds.y).toBeLessThan(supportingBounds.y);
  expect(mapBounds.y).toBeLessThan(page.viewportSize()?.height ?? 720);

  await expect(workspace.getByRole("tab", { name: "Map", exact: true })).toBeVisible();
  await expect(workspace.getByRole("tab", { name: "Review Center", exact: true })).toBeVisible();
  await expect(workspace.getByRole("tab", { name: "Data & Sources", exact: true })).toBeVisible();
  const moreSections = workspace.locator('summary[aria-label="More workspace sections"]');
  await expect(moreSections).toBeVisible();
  await moreSections.click();
  await expect(workspace.getByRole("button", { name: "Support", exact: true })).toBeVisible();
  await moreSections.click();

  const stateRail = page.getByRole("complementary", { name: "State coverage" });
  const firstStateLink = stateRail.locator("a.state-button").first();
  await expect(firstStateLink).toHaveAttribute("href", /^\/\?state=[A-Z]{2}&year=2024&tab=map&mode=margin$/);
  await workspace.getByRole("button", { name: "Winner", exact: true }).click();
  await expect(page).toHaveURL(/mode=winner/);
  await expect(workspaceContext.getByLabel("Workspace map layer")).toHaveValue("winner");
  await expect(firstStateLink).toHaveAttribute("href", /^\/\?state=[A-Z]{2}&year=2024&tab=map&mode=winner$/);

  await page.locator(".state-rail-collapse-button").click();
  await expect(stateRail).toHaveClass(/is-collapsed/);
  await page.locator(".state-rail-collapse-button").click();
  await expect(stateRail).not.toHaveClass(/is-collapsed/);

  await expect(page.getByLabel("Sort results")).toHaveValue("jurisdiction");
  const jurisdictionNames = await page
    .getByRole("region", { name: "WA county results table" })
    .locator("tbody tr td:first-child")
    .allTextContents();
  expect(jurisdictionNames.length).toBeGreaterThan(0);
  expect(jurisdictionNames).toEqual([...jurisdictionNames].sort((left, right) => left.localeCompare(right)));
  const dataNotes = page.getByRole("complementary", { name: "Washington data notes" });
  await workspace.getByRole("button", { name: /^Data Notes/ }).click();
  await expect(dataNotes.getByRole("heading", { name: "Data Notes", exact: true })).toBeVisible();
  await dataNotes.getByRole("button", { name: "Collapse", exact: true }).press("Enter");
  await expect(dataNotes).toHaveClass(/is-collapsed/);

  await workspace.getByRole("tab", { name: "History", exact: true }).press("Enter");
  await expect(page).toHaveURL(/tab=history/);
  await expect(page.getByRole("heading", { name: "Historical Baselines", exact: true })).toBeVisible();

  const cookie = (await context.cookies()).find((item) => item.name === "crm_layout_visitor");
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("workspace navigation and state selector adapt on small screens", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/?state=WA&year=2024&tab=map&mode=margin&fips=53033");
  await expect(page.getByRole("region", { name: "Election workspace context" })).toBeVisible();
  await expect(page.getByLabel("Workspace state")).toHaveValue("WA");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("[data-tour='site-header']")).toHaveCSS("position", "sticky");
  await expect(page.getByRole("button", { name: "Open primary navigation" })).toBeVisible();

  const stateTrigger = page.getByRole("button", { name: /Choose a state/i });
  await expect(stateTrigger).toBeVisible();
  await stateTrigger.click();

  const stateRail = page.getByRole("complementary", { name: "State coverage" });
  await expect(stateRail).toHaveClass(/is-mobile-open/);
  await stateRail.getByRole("button", { name: "Close state selector" }).click();
  await expect(stateRail).not.toHaveClass(/is-mobile-open/);

  const electionYear = page.getByLabel("Workspace election year", { exact: true });
  await electionYear.selectOption("2020");
  await expect(page).toHaveURL(/state=WA&year=2020&tab=map&mode=margin/);
  await expect(page).not.toHaveURL(/fips=/);
  await page.waitForLoadState("networkidle");
  await expect(electionYear).toHaveValue("2020");
  await expect(page.getByLabel("Workspace geography", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Workspace map layer", { exact: true })).toHaveValue("margin");

  const workspaceSection = page.getByLabel("Workspace section", { exact: true });
  await expect(workspaceSection).toBeVisible();
  await workspaceSection.selectOption("support");
  await expect(page).toHaveURL(/tab=support/);
  await page.waitForLoadState("networkidle");
  await expect(workspaceSection).toHaveValue("support");

  await workspaceSection.selectOption("review");
  await expect(page).toHaveURL(/tab=review/);
  await page.waitForLoadState("networkidle");
  const reviewView = page.getByLabel("Review Center view", { exact: true });
  await expect(reviewView).toBeVisible();
  await reviewView.selectOption("indicators");
  await expect(reviewView).toHaveValue("indicators");
});

test("workspace removes an unmatched deep-link geography", async ({ page }) => {
  await page.goto("/?state=WA&year=2024&tab=map&fips=99999");

  await expect(page.getByLabel("Workspace geography", { exact: true })).toHaveValue("");
  await expect(page).not.toHaveURL(/fips=/);
  await expect(page.getByRole("region", { name: /Washington workspace/i })).toBeVisible();
});

test("workspace synchronizes automatic map-layer fallbacks", async ({ page }) => {
  await page.goto("/?state=WA&year=2024&tab=map&mode=security");

  const workspaceContext = page.getByRole("region", { name: "Election workspace context" });
  await expect(page).toHaveURL(/mode=winner/);
  await expect(workspaceContext.getByLabel("Workspace map layer")).toHaveValue("winner");
  await expect(page.getByRole("complementary", { name: "State coverage" }).locator("a.state-button").first())
    .toHaveAttribute("href", /^\/\?state=[A-Z]{2}&year=2024&tab=map&mode=winner$/);
});

test("layout administration fails safely when Clerk is not configured", async ({ page }) => {
  await page.goto("/admin/layout");
  await expect(page.getByRole("heading", { name: "Layout editor setup required" })).toBeVisible();
  await expect(page.getByText(/public workspace remains on the embedded default/i)).toBeVisible();
});

test("privacy page discloses rollout and private-admin data use", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Minimal data, explained plainly." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public workspace layout cookie" })).toBeVisible();
  await expect(page.getByText("crm_layout_visitor", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Private administration" })).toBeVisible();
});

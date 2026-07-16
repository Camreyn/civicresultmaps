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
  await context.addCookies([{ name: "crm_layout_visitor", value: "malformed", url: baseURL! }]);
  await page.goto("/?state=WA&tab=map");

  const workspace = page.getByRole("region", { name: /Washington workspace/i });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("tab", { name: "Map", exact: true })).toBeVisible();
  await expect(workspace.getByRole("tab", { name: "Review Center", exact: true })).toBeVisible();
  await expect(workspace.getByRole("tab", { name: "Data & Sources", exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: /^Data Notes/ }).click();
  await expect(page.getByRole("heading", { name: "Data Notes", exact: true })).toBeVisible();

  await workspace.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(page.getByRole("heading", { name: "Historical Baselines", exact: true })).toBeVisible();

  const cookie = (await context.cookies()).find((item) => item.name === "crm_layout_visitor");
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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

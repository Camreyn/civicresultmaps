import { expect, test } from "@playwright/test";

test("runs the pinned browser R calculation inside the isolated frame", async ({ page }) => {
  const consoleErrors: string[] = [];
  const runtimeResponses = new Map<string, Record<string, string>>();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", async (response) => {
    if (!response.url().includes("/vendor/webr/v0.6.0/")) return;
    runtimeResponses.set(new URL(response.url()).pathname, await response.allHeaders());
  });

  await page.goto("/layout-test-harness?fips=53033&mode=margin", { waitUntil: "domcontentloaded" });
  const harness = page.getByRole("region", { name: "Browser R runtime harness" });
  await expect(harness.getByRole("heading", { name: "Browser R calculation test" })).toBeVisible();
  await expect(harness.getByRole("button", { name: "Run calculation" })).toBeEnabled();

  await harness.getByRole("button", { name: "Run calculation" }).click();
  const frame = harness.locator("iframe[title='Isolated R calculation runtime']");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  const sourceDocument = await frame.getAttribute("srcdoc");
  expect(sourceDocument).toContain(`${new URL(page.url()).origin}/vendor/webr/v0.6.0/webr.js`);
  expect(sourceDocument).not.toContain("webr.r-wasm.org");

  await expect(harness.locator(".workspace-r-metric strong")).toHaveText("100", { timeout: 120_000 });
  await expect(frame).toHaveCount(0);
  await harness.getByText("Proof-check formula and current variables").click();
  await expect(harness.getByText("harness-revision")).toBeVisible();
  await expect(harness.locator(".workspace-r-proof pre")).toContainText("Current-view vote total");

  expect(runtimeResponses.has("/vendor/webr/v0.6.0/webr.js")).toBe(true);
  expect(runtimeResponses.has("/vendor/webr/v0.6.0/R.wasm")).toBe(true);
  for (const headers of runtimeResponses.values()) {
    expect(headers["access-control-allow-origin"]).toBe("*");
    expect(headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  }
  expect(consoleErrors).toEqual([]);
});

test("destroys a busy R worker at the formula timeout", async ({ page }) => {
  await page.goto("/layout-test-harness?fips=53033&mode=margin", { waitUntil: "domcontentloaded" });
  const harness = page.getByRole("region", { name: "Browser R timeout harness" });
  await harness.getByRole("button", { name: "Run calculation" }).click();
  await expect(harness.getByText(/exceeded its 1,000 ms limit/)).toBeVisible({ timeout: 120_000 });
  await expect(harness.locator("iframe[title='Isolated R calculation runtime']")).toHaveCount(0);
});

test("blocks admin-authored R from reaching same-origin application APIs", async ({ page }) => {
  let applicationApiReached = false;
  await page.route("**/api/states", async (route) => {
    applicationApiReached = true;
    await route.fulfill({
      body: "[]",
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      status: 200,
    });
  });

  await page.goto("/layout-test-harness?fips=53033&mode=margin", { waitUntil: "domcontentloaded" });
  const harness = page.getByRole("region", { name: "Browser R network isolation harness" });
  await expect(
    harness.locator(".workspace-r-integrity div").filter({ hasText: "Formula SHA-256" }).locator("dd code"),
  ).toHaveText(/^[a-f0-9]{64}$/);
  await harness.getByRole("button", { name: "Run calculation" }).click();
  await expect(harness.locator(".workspace-r-metric strong")).toHaveText("1", { timeout: 120_000 });
  await expect(harness.getByText("1 means the isolated runtime could not reach /api.", { exact: true })).toBeVisible();
  expect(applicationApiReached).toBe(false);
  await expect(harness.locator("iframe[title='Isolated R calculation runtime']")).toHaveCount(0);
});

test("keeps the runner unavailable when its deployment flag is false", async ({ page }) => {
  await page.goto("/layout-test-harness?fips=53033&mode=margin", { waitUntil: "domcontentloaded" });
  const harness = page.getByRole("region", { name: "Browser R disabled harness" });
  await expect(harness.getByText("Browser R calculations are disabled for this deployment.")).toBeVisible();
  await expect(harness.getByRole("button", { name: "Run calculation" })).toHaveCount(0);
  await expect(harness.getByText("Proof-check formula and current variables")).toBeVisible();
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("schema-v2 design tokens reach the public workspace at desktop and mobile widths", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?state=WA&tab=map");
  const workspace = page.getByRole("region", { name: /Washington workspace/i });
  await expect(workspace).toBeVisible();
  await expect(workspace).toHaveAttribute("data-layout-theme", "civic");
  await expect(workspace).toHaveAttribute("data-layout-radius", "subtle");
  await expect(workspace).toHaveAttribute("data-layout-shadow", "subtle");
  await expect(workspace).toHaveAttribute("data-layout-spacing", "standard");
  await expect(workspace).toHaveAttribute("data-layout-type-scale", "standard");
  await expect(workspace.getByRole("tab", { name: "Map", exact: true })).toBeVisible();

  const productionNodes = workspace.locator('[data-layout-node-kind="production"]');
  await expect(productionNodes).toHaveCount(4);
  await expect(page.locator('[data-layout-section="map:results-map"]')).toHaveCount(1);
  expect(await productionNodes.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-layout-component"))))
    .toEqual(["results-map", "source-provenance", "coverage-context", "state-snapshot"]);

  const accessibility = await new AxeBuilder({ page }).include(".workspace-tabs").analyze();
  expect(accessibility.violations
    .filter((violation) => violation.impact === "critical")
    .map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) })))
    .toEqual([]);

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(workspace).toBeVisible();
  const box = await workspace.boundingBox();
  expect(box?.width ?? 999).toBeLessThanOrEqual(390);
  await expect(page.locator("[data-nextjs-dialog], .nextjs-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("schema-v3 renderer keeps multi-segment production content in one manifest slot", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?state=WA&tab=data");
  const workspace = page.getByRole("region", { name: /Washington workspace/i });
  const productionNodes = workspace.locator('[data-layout-node-kind="production"]');
  await expect(productionNodes).toHaveCount(3);
  await expect(productionNodes.nth(0)).toHaveAttribute("data-layout-component", "source-provenance");
  await expect(productionNodes.nth(0).locator('[data-layout-section="data:source-provenance"]')).toHaveCount(2);
  const catalog = workspace.getByRole("region", { name: /Washington source catalog/i });
  await expect(catalog.getByLabel("Search sources")).toBeVisible();
  await catalog.getByLabel("Search sources").fill("no-source-can-match-this-query");
  await expect(catalog.getByText("No source records match these filters")).toBeVisible();
  await catalog.getByRole("button", { name: "Show all sources" }).click();
  await expect(catalog.locator(".source-catalog-record").first()).toBeVisible();
  const reviewLink = workspace.getByRole("link", { name: /Open the Review Center/i });
  await expect(reviewLink).toHaveAttribute("href", /state=WA.*year=2024.*tab=review/);
  expect(errors).toEqual([]);
});

test("schema-v3 renderer preserves the Electronic layout when source requests are empty", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?state=WA&tab=electronic");
  const workspace = page.getByRole("region", { name: /Washington workspace/i });
  const productionNodes = workspace.locator('[data-layout-node-kind="production"]');
  await expect(productionNodes).toHaveCount(3);
  await expect(workspace.locator('[data-layout-component="source-records-request"]')).toBeVisible();
  await expect(workspace.locator('[data-layout-empty-state="source-records-request"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("Review Center renders configured navigation and selection", async ({ page }) => {
  await page.goto("/?state=WA&tab=review");
  const subnav = page.getByRole("tablist", { name: "Review Center views" });
  await expect(subnav).toBeVisible();
  await expect(subnav.getByRole("tab")).toHaveCount(5);
  await expect(subnav.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  await subnav.getByRole("tab", { name: /Indicators/i }).click();
  await expect(subnav.getByRole("tab", { name: /Indicators/i })).toHaveAttribute("aria-selected", "true");
});

test("layout media upload tokens fail closed without an authenticated admin", async ({ request }) => {
  const response = await request.post("/api/admin/layout-assets/upload", {
    data: {
      payload: {
        clientPayload: JSON.stringify({
          assetId: "aee694fd-a7fe-4895-b2e7-80d8b47466ee",
          alt: "Test image",
          contentType: "image/png",
          height: 10,
          sizeBytes: 100,
          width: 10,
        }),
        multipart: false,
        pathname: "layout-media/test.png",
      },
      type: "blob.generate-client-token",
    },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/sign in|required/i) });
});

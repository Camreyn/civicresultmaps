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

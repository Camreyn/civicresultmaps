import { expect, test } from "@playwright/test";

test("workspace builder v4 supports live tokens, finite undo, responsive comparison, and recovery", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/layout-test-harness");
  await expect(page.getByRole("heading", { name: "Workspace builder v4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Before", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "After", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Compare/ })).toBeVisible();

  const accent = page.locator('input[aria-label="Accent and focus"]');
  const after = page.getByRole("region", { name: /After - current draft/i });
  await expect(accent).toHaveValue("#35c7a3");
  await accent.fill("#00cc99");
  await expect(accent).toHaveValue("#00cc99");
  await expect.poll(() => after.evaluate((element) => getComputedStyle(element).getPropertyValue("--preview-accent").trim())).toBe("#00cc99");

  const undo = page.getByRole("button", { name: /Undo/ }).first();
  await undo.click();
  await expect(accent).toHaveValue("#35c7a3");
  await expect(undo).toBeDisabled();

  await page.getByRole("button", { name: /Add group/ }).click();
  await expect(page.getByRole("button", { name: /New group/ }).first()).toBeVisible();
  await expect(undo).toBeEnabled();

  await page.getByRole("button", { name: /mobile/i }).first().click();
  await expect.poll(async () => (await after.boundingBox())?.width ?? 999).toBeLessThanOrEqual(392);

  await page.getByRole("button", { name: /Compare/ }).click();
  await expect(page.getByRole("region", { name: /^Before/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /^After/i })).toBeVisible();

  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("civicresultmaps:workspace-builder-v4:recovery")))).toBe(true);
  await expect(page.locator("[data-nextjs-dialog], .nextjs-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("workspace builder harness remains explicitly opt-in", async ({ page }) => {
  const response = await page.goto("/layout-test-harness");
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

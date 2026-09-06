import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("histogram appearance preserves points, warning gates, tooltips and standalone SVG", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/chart-test-harness");
  const chart = page.locator('[data-tour="history-klimek"]');
  await expect(chart).toHaveAttribute("data-appearance", "winner_density");
  await chart.getByRole("button", { name: "State · local units", exact: true }).click();
  await expect(chart.getByRole("button", { name: "Download SVG" })).toBeDisabled();
  await chart.getByRole("button", { name: "I acknowledge these limits" }).click();
  const pointGeometry = () => chart.locator("circle.klimek-point").evaluateAll((points) =>
    points.map((point) => [point.getAttribute("cx"), point.getAttribute("cy"), point.getAttribute("r")]),
  );
  const original = await pointGeometry();
  expect(original).toHaveLength(12);
  await chart.getByRole("button", { name: "Histogram peaks / valleys", exact: true }).press("Enter");
  await expect(chart).toHaveAttribute("data-appearance", "histogram_context");
  await expect(chart.getByRole("button", { name: "Download SVG" })).toBeDisabled();
  await chart.getByRole("button", { name: "I acknowledge these limits" }).click();
  expect(await pointGeometry()).toEqual(original);
  await expect(chart.locator("circle.klimek-point title").first()).toContainText("adjacent-bin mean");
  const fills = await chart.locator("circle.klimek-point").evaluateAll((points) => points.map((point) => getComputedStyle(point).fill));
  expect(fills.every((fill) => ["rgb(244, 163, 64)", "rgb(255, 255, 255)", "rgb(66, 186, 131)", "rgb(156, 163, 175)"].includes(fill))).toBe(true);
  await chart.screenshot({ path: testInfo.outputPath("histogram-context.png") });
  const downloadPromise = page.waitForEvent("download");
  await chart.getByRole("button", { name: "Download SVG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("histogram_context");
  const filename = await download.path();
  expect(filename).not.toBeNull();
  const svg = await readFile(filename!, "utf8");
  expect(svg).toContain("adjacent-bin mean");
  expect(svg).toContain("Not a normality test or evidence of misconduct");
  expect(svg).toContain("fill-opacity:");
  expect(svg).toContain("font-family:");
  expect(svg.match(/class="klimek-point /g)).toHaveLength(12);
  await chart.getByRole("button", { name: "Winner color · density", exact: true }).click();
  expect(await pointGeometry()).toEqual(original);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chart.getByRole("button", { name: "Histogram peaks / valleys", exact: true })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

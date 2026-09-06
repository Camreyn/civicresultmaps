import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const participation of ["turnout", "proxy"] as const) {
  test(`${participation}: histogram appearance preserves points, warning gates, tooltips and standalone SVG`, async ({ page }, testInfo) => {
    const usesParticipationProxy = participation === "proxy";
    const participationLabel = usesParticipationProxy ? "presidential participation proxy" : "turnout";
    const weightLabel = usesParticipationProxy ? "presidential votes" : "ballots cast";
    const encodingLabel = usesParticipationProxy ? "Proxy-bin" : "Turnout-bin";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`/chart-test-harness?participation=${participation}`);
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
    const firstPointTitle = chart.locator("circle.klimek-point title").first();
    await expect(firstPointTitle).toContainText(`${participationLabel} ${usesParticipationProxy ? "50.00" : "55.00"}%`);
    await expect(chart.locator("svg > title")).toContainText(`vote share by ${participationLabel}`);
    await expect(chart.locator("svg > desc")).toContainText(`exact ${participationLabel}`);
    await chart.getByRole("button", { name: "Histogram peaks / valleys", exact: true }).press("Enter");
    await expect(chart).toHaveAttribute("data-appearance", "histogram_context");
    await expect(chart.getByRole("button", { name: "Download SVG" })).toBeDisabled();
    await chart.getByRole("button", { name: "I acknowledge these limits" }).click();
    expect(await pointGeometry()).toEqual(original);
    await expect(firstPointTitle).toContainText("adjacent-bin mean");
    await expect(firstPointTitle).toContainText(`${participationLabel} bin:`);
    await expect(chart.locator("svg > title")).toContainText(encodingLabel);
    await expect(chart.locator("svg > desc")).toContainText(encodingLabel);
    await expect(chart.locator(".klimek-legend")).toContainText(`Opacity: ${usesParticipationProxy ? "proxy" : "turnout"}-bin`);
    await expect(chart.locator("rect.klimek-marginal-bar.turnout title").first()).toContainText(weightLabel);
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
    expect(svg).toContain(`vote share by ${participationLabel}`);
    expect(svg).toContain(encodingLabel);
    expect(svg).toContain(weightLabel);
    if (usesParticipationProxy) {
      expect(svg).not.toMatch(/turnout-bin|turnout bin:|Turnout marginal|ballots cast/i);
      await expect(chart).toContainText("This is a participation proxy, not election-level turnout or ballots cast.");
    }
    await chart.getByRole("button", { name: "Winner color · density", exact: true }).click();
    expect(await pointGeometry()).toEqual(original);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(chart.getByRole("button", { name: "Histogram peaks / valleys", exact: true })).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

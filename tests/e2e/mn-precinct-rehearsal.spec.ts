import { expect, test } from "@playwright/test";

const expectedHennepinFeatures = new Map([
  [2012, 405],
  [2016, 422],
  [2020, 425],
  [2024, 396],
]);

test.skip(
  process.env.CRM_RUN_MN_PRECINCT_REHEARSAL_E2E !== "true",
  "requires the explicitly guarded crm_clone_dev rehearsal server",
);

test("renders all four Minnesota precinct years from the guarded local rehearsal", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  const failedApiResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) {
      failedApiResponses.push(response.status() + " " + response.url());
    }
  });

  for (const [year, featureCount] of expectedHennepinFeatures) {
    await page.goto(
      `/?state=MN&year=${year}&tab=map&mode=winner&fips=27053`,
      { waitUntil: "domcontentloaded" },
    );
    const panel = page.getByRole("region", {
      name: "MN precinct detail map",
    });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Local rehearsal - not public", { exact: true }),
    ).toBeVisible();
    await expect(panel).toContainText(
      `${featureCount} boundaries; ${featureCount} joined result rows`,
      { timeout: 60_000 },
    );
    const precinctSelection = panel.getByLabel("Precinct to inspect");
    await expect(precinctSelection).toBeVisible();
    await expect(precinctSelection.locator("option")).toHaveCount(featureCount);
    await expect(panel.locator("[data-openstreetmap-tile]").first()).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "© OpenStreetMap contributors" }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    await expect(panel).toContainText(
      "Local rehearsal only. The canonical manifest remains blocked",
    );
    await expect(panel.locator('.precinct-detail-meta a[target="_blank"]')).toHaveAttribute(
      "href",
      /^https:\/\//,
    );
    await expect(
      page.locator(
        "[data-nextjs-dialog], .nextjs-error-overlay, #webpack-dev-server-client-overlay",
      ),
    ).toHaveCount(0);

    if (year === 2024) {
      await panel.locator(".precinct-detail-map-stage").screenshot({
        path: ".etl/mn-precinct-rehearsal-2024-osm-map.png",
      });
      await page.screenshot({
        fullPage: true,
        path: ".etl/mn-precinct-rehearsal-2024.png",
      });
    }
  }

  expect(failedApiResponses).toEqual([]);
  expect(browserErrors).toEqual([]);
  await expect(page.locator("body")).not.toHaveText("");
});

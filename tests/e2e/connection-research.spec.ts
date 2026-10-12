import { test, expect } from "@playwright/test";

test("guided examples isolate public evidence, restore sharing and exit cleanly", async ({ page }) => {
  await page.goto("/connections");
  await expect(page.getByLabel("Evidence date")).toBeEnabled();
  await page.locator("summary").filter({ hasText: "Guided examples:" }).click();
  await page.getByRole("button", { name: "AP election services retained (2024)", exact: true }).first().click();
  await expect(page.locator("[data-connection-select]")).toHaveCount(1);
  await expect(page.locator('.react-flow__edge[data-id="ap-usatodayco-2024"]')).toBeVisible();
  await expect(page.getByRole("complementary").getByText(/not confirmation of renewal in 2026/)).toBeVisible();
  await expect(page.getByLabel("Evidence date")).toHaveValue("2024-11-05");
  await expect(page).toHaveURL(/example=ap-usatodayco-2024/);
  await page.reload();
  await expect(page.getByLabel("Evidence date")).toBeEnabled();
  await expect(page.locator("[data-connection-select]")).toHaveCount(1);
  await page.getByRole("button", { name: "Next example", exact: true }).click();
  await expect(page.getByRole("complementary").getByRole("heading", { name: "2020 VoteCast survey partner note", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show surrounding connections", exact: true }).click();
  await expect(page.locator("[data-connection-select]")).not.toHaveCount(1);
  await expect(page).not.toHaveURL(/example=/);
});

test("local records preserve dates, evidence scopes and missing contract details", async ({ page }) => {
  await page.goto("/connections");
  await expect(page.getByLabel("Evidence date")).toBeEnabled();
  await page.getByRole("button", { name: "local records", exact: true }).click();
  const records = page.getByLabel("Local evidence records");
  await expect(records.getByText(/No Harris County contract amount or award ID/)).toBeVisible();
  for (const label of ["2021 acquisition reported", "2021 certification reported", "2022 election use reported", "September 2026 inventory"]) await expect(records.getByRole("button", { name: label, exact: true })).toBeVisible();
  await records.getByRole("button", { name: "2022 election use reported", exact: true }).click();
  await expect(page.getByRole("complementary").getByText("Dated local use", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByText(/not a 2024\/2026 version inventory/)).toBeVisible();
  await page.getByRole("combobox", { name: "Geography", exact: true }).selectOption("county:48201");
  await expect(records.getByRole("button")).toHaveCount(3);
});

test("USA TODAY recruitment and disabled release comparison remain source-qualified", async ({ page }) => {
  await page.goto("/connections");
  await page.locator("summary").filter({ hasText: "USA TODAY: historical AP" }).click();
  await expect(page.getByText(/Recruitment is not evidence of hires or deployment/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /North Carolina election-night stringer recruitment/ }).first()).toHaveAttribute("href", /careerservices.jjc.edu/);
  await expect(page.getByText("Syndicated recruitment lead, not employer-hosted verification", { exact: false })).toHaveCount(2);
  await page.locator("summary").filter({ hasText: "What changed between reviewed releases?" }).click();
  await expect(page.getByText(/2024\/2026 views are not release versions/)).toBeVisible();
});

test("selects edges with the keyboard and keeps active-date uncertainty explicit", async ({ page }) => {
  await page.goto("/connections");
  const edge = page.locator('.react-flow__edge[data-id="ap-cnn"]');
  await edge.focus(); await edge.press("Enter");
  await expect(page.getByRole("complementary").getByText(/Networks retain independent race calls/)).toBeVisible();
  await page.getByLabel("Time filter").selectOption("active");
  await expect(page.getByText("No connections match these filters. Known active on requires documented start and end dates covering this day; missing results do not prove a relationship was inactive.")).toBeVisible();
  await expect(page.locator("[data-connection-select]")).toHaveCount(0);
  await page.getByLabel("Time filter").selectOption("documented");
  await expect(page.locator('[data-connection-select="ap-cnn"]')).toBeVisible();
});

test("saves a personal pinned view locally and restores shareable filters", async ({ page }) => {
  await page.goto("/connections");
  const node = page.locator('.react-flow__node[data-id="ap"]');
  await node.focus(); await node.press("ArrowRight");
  await page.getByRole("button", { name: "Pin node", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Saved views" }).click();
  await page.getByLabel("View name").fill("Reporting review");
  await page.getByRole("button", { name: "Save in this browser", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("View saved in this browser.");
  await page.getByLabel("Evidence classification", { exact: true }).selectOption("official_record");
  await expect(page).toHaveURL(/attribution=official_record/);
  await page.getByRole("button", { name: "Reporting review", exact: true }).click();
  await expect(page.getByLabel("Evidence classification", { exact: true })).toHaveValue("all");
  await expect(page.getByRole("button", { name: "Unpin node", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("crm-connections-views-v2") ?? "[]")[0].pinned)).toContain("ap");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("crm-connections-views-v2") ?? "[]")[0].positions.ap.x)).toBeGreaterThan(0);
});

test("timeline and connection paths do not create new inferred data routes", async ({ page }) => {
  await page.goto("/connections?view=technology&node=oracle");
  await page.locator("summary").filter({ hasText: "Find connections" }).click();
  await page.getByLabel("Destination").selectOption("team");
  await page.getByLabel("Follow only directed results relationships").check();
  await expect(page.getByText("No documented path within six relationships and the selected filters.")).toBeVisible();
  await page.getByRole("button", { name: "timeline", exact: true }).click();
  await expect(page.getByText("Recorded document or content-observation date; not an effective date.").first()).toBeVisible();
});

test("private APIs and document routes fail closed without exposing drafts or artifacts", async ({ request, page }) => {
  const responses = await Promise.all([
    request.get("/api/admin/connections"),
    request.get("/api/admin/connections/artifacts/unknown"),
    request.get("/api/admin/connections/artifacts/unknown/text"),
  ]);
  for (const response of responses) {
    expect([401, 403, 503]).toContain(response.status());
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.text();
    for (const secret of ["workingNotes", "artifactPath", "connection-sources/", "revisions", "oracle-america"]) expect(body).not.toContain(secret);
  }
  const post = await request.post("/api/admin/connections", { data: { operation: "publish", expectedVersion: 0, note: "Not authorized" } });
  expect(post.status()).toBe(403);
  await page.goto("/admin/connections");
  await expect(page.getByRole("heading", { name: "Connections research" })).toBeVisible();
  await expect(page.getByText("Research sign-in is not configured.")).toBeVisible();
});

test("public release and result lineage APIs never substitute draft or seed data", async ({ request }) => {
  const specification = await request.get("/api/v1/openapi");
  expect(specification.status()).toBe(200);
  const contract = await specification.json();
  for (const path of ["/api/v1/connections", "/api/v1/connections/sources/{id}", "/api/v1/result-lineage"]) expect(contract.paths[path]).toBeTruthy();
  const release = await request.get("/api/v1/connections");
  expect(release.status()).toBe(503);
  expect((await release.json()).error.code).toBe("CONNECTIONS_RELEASES_DISABLED");
  const lineage = await request.get("/api/v1/result-lineage?state=TX&year=2024&office=president&level=county&jurisdictionCode=48001");
  expect(lineage.status()).toBe(503);
  expect((await lineage.json()).error.code).toBe("LINEAGE_DISABLED");
  const unsupported = await request.get("/api/v1/result-lineage?state=TX&year=2024&office=president&level=precinct&jurisdictionCode=48001");
  expect(unsupported.status()).toBe(400);
});

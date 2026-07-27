import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const clearAccessPath = "/equipment/clear-ballot-clearvote-25-clearaccess";
const ds200Path = "/equipment/ess-evs-6400-ds200";
const imageCastXPath = "/equipment/dominion-democracy-suite-517-imagecast-x";
const clearCountPath = "/equipment/clear-ballot-clearvote-25-clearcount";
const imageCastCentralPath = "/equipment/dominion-democracy-suite-517-imagecast-central";
const ds950Path = "/equipment/ess-evs-6400-ds950";

test.describe.configure({ mode: "serial" });

test("lists six source-linked equipment dossiers", async ({ page }) => {
  await page.goto("/equipment");
  await expect(page.getByRole("link", { name: "Open dossier" })).toHaveCount(6);
  await expect(page.getByText("6 reviewed dossiers")).toBeVisible();
  await expect(page.getByText("Clear Ballot ClearVote 2.5 / ClearAccess")).toBeVisible();
  await expect(page.getByText("Clear Ballot ClearVote 2.5 / ClearCount")).toBeVisible();
  await expect(page.getByText("ES&S EVS 6.4.0.0 / DS200")).toBeVisible();
  await expect(page.getByText("ES&S EVS 6.4.0.0 / DS950")).toBeVisible();
  await expect(page.getByText("Dominion Democracy Suite 5.17 / ImageCast X")).toBeVisible();
  await expect(page.getByText("Dominion Democracy Suite 5.17 / ImageCast Central")).toBeVisible();
  await expect(page.locator("[data-equipment-preview='true']")).toHaveCount(6);
  await expect(page.locator("[data-equipment-preview='true'] img")).toHaveCount(6);
  const previewSources = page.locator("[data-equipment-preview-source='true']");
  await expect(previewSources).toHaveCount(6);
  for (const previewSource of await previewSources.all()) {
    await expect(previewSource).toHaveAttribute("href", /^https:\/\//);
  }
  await expect(page.getByAltText("Front view of an open ES&S DS200 scanner and ballot container on casters")).toBeVisible();
});

test("filters the catalog with shareable search parameters", async ({ page }) => {
  await page.goto("/equipment?q=DS200");
  await expect(page).toHaveURL(/\/equipment\?q=DS200(?:&|$)/);
  await expect(page.locator("[data-equipment-preview='true']")).toHaveCount(1);
  await expect(page.getByText("ES&S EVS 6.4.0.0 / DS200", { exact: true })).toBeVisible();
  await expect(page.getByText("Clear Ballot ClearVote 2.5 / ClearAccess", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Manufacturer").locator("option")).toHaveCount(4);
  await expect(page.getByLabel("Manufacturer").locator("option").allTextContents()).resolves.toEqual(
    ["All manufacturers", "Clear Ballot", "Dominion Voting Systems", "Election Systems & Software (ES&S)"],
  );
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/equipment");
});

test("compares two reviewed dossiers through a shareable URL and API", async ({ page, request }) => {
  const query = "slugs=clear-ballot-clearvote-25-clearaccess&slugs=dominion-democracy-suite-517-imagecast-x";
  await page.goto(`/equipment/compare?${query}`);
  await expect(page.getByRole("heading", { name: "Clear Ballot ClearVote 2.5 / ClearAccess", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dominion Democracy Suite 5.17 / ImageCast X", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certification scope" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Network evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage relations and sources" })).toBeVisible();

  const response = await request.get(`/api/v1/equipment-systems/compare?${query}`);
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.meta.schemaVersion).toBe("2.1.0");
  expect(payload.data.systems).toHaveLength(2);
  expect(payload.data.systems.map((system: { slug: string }) => system.slug)).toEqual([
    "clear-ballot-clearvote-25-clearaccess",
    "dominion-democracy-suite-517-imagecast-x",
  ]);
});

test("separates exact product-family matches from manufacturer context on state pages", async ({ page, request }) => {
  await page.goto("/equipment/state/WI");
  await expect(page.getByRole("heading", { name: "Wisconsin election equipment records" })).toBeVisible();
  await expect(page.locator("[data-evidence='device-family']")).toHaveCount(2);
  await expect(page.locator("[data-evidence='manufacturer-context']")).toHaveCount(2);
  await expect(page.getByText(/Each vendor appears once/)).toBeVisible();
  await expect(page.getByText(/not evidence that a listed machine was selected, installed, configured, or used/)).toBeVisible();

  const response = await request.get("/api/v1/equipment-states/WI");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.meta.schemaVersion).toBe("2.1.0");
  expect(payload.data.exactProductFamilySystems).toHaveLength(2);
  expect(payload.data.manufacturerContexts).toHaveLength(2);
  expect(payload.data.manufacturerContexts.every(
    (context: { relatedDossierSlugs: string[] }) => context.relatedDossierSlugs.length > 0,
  )).toBe(true);
});

test("exposes U.S. Equipment in shared navigation and the equipment index tour", async ({ page }) => {
  await page.goto("/equipment");
  await expect(page.getByRole("link", { name: "U.S. Equipment" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Start a guided tour of this page" }).click();
  const equipmentTour = page.getByRole("dialog", { name: "Start with the evidence scope" });
  await expect(equipmentTour).toBeVisible();
  await expect(equipmentTour.getByLabel("Jump to tour step")).toHaveValue("equipment-index-scope");
  await page.keyboard.press("Escape");
  await expect(equipmentTour).toHaveCount(0);
});

test("introduces the shareable dossier sections in the equipment detail tour", async ({ page }) => {
  await page.goto(ds200Path);
  await page.getByRole("button", { name: "Start a guided tour of this page" }).click();
  const detailTour = page.getByRole("dialog");
  await expect(detailTour).toBeVisible();
  await expect(detailTour).toHaveAccessibleName("Identify the reviewed configuration");
  await detailTour.getByLabel("Jump to tour step").selectOption("equipment-detail-navigation");
  await expect(detailTour).toHaveAccessibleName("Use the shareable dossier sections");
  await expect(page.locator("[data-tour='equipment-dossier-navigation']")).toBeInViewport({ timeout: 15_000 });
  await detailTour.getByRole("button", { name: "Close tutorial" }).click();
});

test("lists separately scoped jurisdiction evidence with source and map links", async ({ page, request }) => {
  await page.goto(`${clearAccessPath}#equipment-usage`);
  await expect(page).toHaveURL(
    /\/equipment\/clear-ballot-clearvote-25-clearaccess\/usage#equipment-usage$/,
    { timeout: 15_000 },
  );
  const usageSection = page.locator("[data-tour='equipment-usage']");
  await expect(usageSection.getByText("49 matching sourced records", { exact: true })).toBeVisible();
  await expect(usageSection.getByText("Named product family", { exact: true }).first()).toBeVisible();
  await expect(usageSection.locator("article[class*='usageRecord']")).toHaveCount(20);
  await expect(usageSection.getByRole("link", { name: /Open this jurisdiction on the equipment map/ }).first()).toHaveAttribute("href", /mode=equipment&fips=\d{5}$/);
  await expect(usageSection.getByRole("link", { name: /Open Verified Voting Verifier source/ }).first()).toHaveAttribute("href", /^https:\/\//);

  const familyResponse = await request.get(
    "/api/v1/equipment-systems/clear-ballot-clearvote-25-clearaccess/jurisdictions?evidence=device_family&limit=5",
  );
  expect(familyResponse.status()).toBe(200);
  const familyPayload = await familyResponse.json();
  expect(familyPayload.data.evidenceKind).toBe("device_family");
  expect(familyPayload.data.total).toBe(49);
  expect(familyPayload.data.records).toHaveLength(5);
  expect(familyPayload.data.records.every((record: { map: { href: string } }) => /mode=equipment&fips=\d{5}$/.test(record.map.href))).toBe(true);
  expect(familyPayload.data.relation.target).toEqual({
    kind: "equipment_system",
    slug: "clear-ballot-clearvote-25-clearaccess",
  });

  await page.goto(`${ds200Path}#equipment-usage`);
  await expect(page).toHaveURL(
    /\/equipment\/ess-evs-6400-ds200\/usage#equipment-usage$/,
    { timeout: 15_000 },
  );
  await expect(page.locator("[data-tour='equipment-usage']").getByText("1,509 matching sourced records", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Evidence strength")).toHaveValue("manufacturer_context");
  await expect(page.locator("[data-tour='equipment-usage']").getByText("Manufacturer context, not DS200 deployment evidence")).toBeVisible();

  const manufacturerResponse = await request.get(
    "/api/v1/equipment-systems/ess-evs-6400-ds200/jurisdictions?evidence=manufacturer_context&limit=2",
  );
  const manufacturerPayload = await manufacturerResponse.json();
  expect(manufacturerPayload.data.relation.target.kind).toBe("manufacturer");
  expect(manufacturerPayload.data.relation.target.id).toBe("ess");
  expect(manufacturerPayload.data.requestedDossierContext.relationship).toBe("same_manufacturer_not_exact_deployment");
});

test("renders confirmed ClearAccess UPS options without inventing runtime", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto(`${clearAccessPath}/history`);
  await expect(page.getByRole("heading", { name: "Clear Ballot ClearVote 2.5 / ClearAccess" })).toBeVisible();
  await expect(page.getByText("CyberPower; APC", { exact: true })).toBeVisible();
  await expect(page.getByText("PR1500RT2U; SMT2200C; SRT1500RMXLA", { exact: true })).toBeVisible();
  await expect(page.getByText("Not specified in reviewed source", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "No reviewed deployment observation in this dossier" })).toBeVisible();
  await page.goto(`${clearAccessPath}/components`);
  await expect(page.locator("[data-component-select='true']")).toHaveCount(9);

  const networkBadge = page.getByRole("img", { name: "Network connectivity capability" });
  await expect(networkBadge).toHaveCount(1);
  await networkBadge.hover();
  const networkTooltip = page.getByRole("tooltip", { name: /Ethernet/ });
  await expect(networkTooltip).toBeVisible();
  await expect(networkTooltip).toHaveAttribute("data-overlay-root", "document-body");
  expect(await networkTooltip.evaluate((element) => element.parentElement === document.body)).toBe(true);

  const componentRail = page.locator("div[class*='componentRail']").first();
  const [componentRailBox, networkTooltipBox] = await Promise.all([
    componentRail.boundingBox(),
    networkTooltip.boundingBox(),
  ]);
  expect(componentRailBox).not.toBeNull();
  expect(networkTooltipBox).not.toBeNull();
  expect(networkTooltipBox!.x).toBeGreaterThan(componentRailBox!.x + componentRailBox!.width);

  await page.mouse.move(0, 0);
  await networkBadge.focus();
  await expect(networkTooltip).toBeVisible();

  await page.locator("[data-component-select='true']").filter({ hasText: "All-in-one touchscreen computer" }).click();
  const componentDetail = page.locator("article[class*='componentDetail']");
  await expect(componentDetail.getByText("Cellular modem", { exact: true })).toHaveCount(0);
  await expect(componentDetail.getByText("Not publicly established", { exact: true })).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);

  const response = await request.get("/api/v1/equipment-systems/clear-ballot-clearvote-25-clearaccess");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.data.system.coverage.confirmedPowerRecordCount).toBe(1);
  expect(payload.data.system.coverage.technicalSpecificationCount).toBe(8);
  expect(payload.data.sources).toHaveLength(8);
});

test("keeps the ClearAccess 3D view lazy, optional, and selectable", async ({ page }) => {
  await page.goto(`${clearAccessPath}/components`);
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(initialResources.filter((url) => url.endsWith(".glb"))).toHaveLength(0);
  const initialChunkCount = initialResources.filter((url) => url.includes("/_next/static/chunks/")).length;

  await page.locator("[data-component-select='true']").filter({ hasText: "External uninterruptible power supply" }).click();
  await page.getByRole("button", { name: /Open 3D view/ }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("heading", { name: "External uninterruptible power supply", level: 3 })).toBeVisible();
  await expect(page.getByText(/Drag to rotate \| wheel or pinch to zoom/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();

  await expect.poll(() => page.evaluate(() =>
    performance.getEntriesByType("resource").some((entry) => entry.name.includes(".glb")),
  )).toBe(true);
  const viewerResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(viewerResources.filter((url) => url.includes("/_next/static/chunks/")).length).toBeGreaterThan(initialChunkCount);

  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport();
  const initialCameraRevision = await canvas.getAttribute("data-camera-revision");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2 + 90, canvasBox!.y + canvasBox!.height / 2 - 35, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute("data-camera-revision")).not.toBe(initialCameraRevision);
  const rotatedPosition = await canvas.getAttribute("data-camera-position");
  const zoomBeforeWheel = await canvas.getAttribute("data-camera-zoom");
  await page.mouse.wheel(0, -420);
  await expect.poll(() => canvas.getAttribute("data-camera-zoom")).not.toBe(zoomBeforeWheel);
  const zoomBeforeButton = await canvas.getAttribute("data-camera-zoom");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => canvas.getAttribute("data-camera-zoom")).not.toBe(zoomBeforeButton);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(rotatedPosition);

  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByRole("button", { name: "Assembled" })).toBeVisible();
  const explosionDistance = page.getByLabel("Explosion distance");
  await explosionDistance.fill("55");
  await expect(explosionDistance).toHaveValue("55");
  await expect(page.getByText("Explosion distance 55%")).toBeVisible();

  await page.getByRole("button", { name: "Isolate External uninterruptible power supply" }).click();
  await expect(page.getByText(/1 of 9 modeled components visible/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop isolating External uninterruptible power supply" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-component-select='true']").filter({ hasText: "Ballot printer" }).click();
  await expect(page.getByRole("button", { name: "Stop isolating Ballot printer" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/isolating Ballot printer/)).toBeVisible();

  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(page.getByText(/9 of 9 modeled components visible/)).toBeVisible();
  await page.getByRole("button", { name: "Hide Ballot printer" }).click();
  await expect(page.getByText(/8 of 9 modeled components visible/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Ballot printer" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(page.getByText(/9 of 9 modeled components visible/)).toBeVisible();
});

test("opens a sourced reference-photo sidebar and expanded image dialog", async ({ page }) => {
  await page.goto(`${clearAccessPath}/components`);
  const photoButton = page.getByRole("button", { name: "Photos 1" });
  await expect(photoButton).toHaveAttribute("aria-expanded", "false");
  await photoButton.click();
  await expect(photoButton).toHaveAttribute("aria-expanded", "true");

  const gallery = page.getByRole("complementary", { name: "Reference photos" });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole("img", { name: /ClearAccess portrait touchscreen/ })).toBeVisible();
  await expect(gallery.getByRole("link", { name: "View source" })).toHaveAttribute("href", /clearballot\.com/);
  await gallery.getByRole("button", { name: /Expand: Manufacturer product image/ }).click();

  const dialog = page.getByRole("dialog", { name: /Manufacturer product image/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: /ClearAccess portrait touchscreen/ })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Clear Ballot Group/ })).toHaveAttribute("href", /clearballot\.com/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("preserves the source-linked fallback when WebGL 2 is unavailable", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.goto(`${clearAccessPath}/components`);
  await page.getByRole("button", { name: /Open 3D view/ }).click();
  await expect(page.getByText("3D view unavailable")).toBeVisible();
  await expect(page.locator("[data-component-select='true']")).toHaveCount(9);
  await context.close();
});

test("renders ImageCast X advisory and internal-component evidence boundaries", async ({ page, request }) => {
  await page.goto(`${imageCastXPath}/components`);
  await expect(page.getByRole("heading", { name: "Dominion Democracy Suite 5.17 / ImageCast X" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ICX Prime solid-state drive", level: 3 })).toHaveCount(0);
  const ssdButton = page.getByRole("button", { name: /ICX Prime solid-state drive/ });
  await ssdButton.press("Enter");
  await expect(ssdButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "ICX Prime solid-state drive", level: 3 })).toBeVisible();
  await expect(page.getByText(/not placed in the 3D scene/)).toBeVisible();
  await page.goto(`${imageCastXPath}/history`);
  await expect(page.getByText("SMT-1500; SMT-1500C; PR1500LCD; PR1500LCD-VTVM", { exact: true })).toBeVisible();
  await expect(page.getByText("Not specified in reviewed source", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Straight-party and split-ticket selection review advisory" })).toBeVisible();
  const response = await request.get("/api/v1/equipment-systems/dominion-democracy-suite-517-imagecast-x");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.data.system.coverage.sourceCount).toBe(12);
  expect(payload.data.sources).toHaveLength(12);

  await page.goto(`${imageCastXPath}/components`);
  await page.locator("[data-component-select='true']").filter({ hasText: "SID-21V compute board profile" }).click();
  await expect(page.getByRole("heading", { name: "SID-21V compute board profile", level: 3 })).toBeVisible();
  await expect(page.getByText("Intel Atom Z3735F", { exact: true })).toBeVisible();
  await expect(page.getByText("2 GB DDR3L", { exact: true })).toBeVisible();
  await expect(page.getByText("32 GB eMMC", { exact: true })).toBeVisible();

  await expect(page.getByRole("img", { name: "Network connectivity capability" })).toHaveCount(1);
  await page.locator("[data-component-select='true']").filter({ hasText: "SID-21V connector panel" }).click();
  const componentDetail = page.locator("article[class*='componentDetail']");
  await expect(componentDetail.getByText("1 × 10/100 RJ-45 Ethernet", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("Cellular modem", { exact: true })).toHaveCount(0);
});

test("retains DS200 partial-power and deployment evidence boundaries", async ({ page }) => {
  await page.goto(`${ds200Path}/history`);
  await expect(page.getByRole("heading", { name: "DS200 power / backup supply" })).toBeVisible();
  await expect(page.getByText(/confirms DS200 battery backup/)).toBeVisible();
  await expect(page.getByText("Jefferson County, Washington", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.goto(`${ds200Path}/components`);
  await expect(page.locator("[data-component-select='true']")).toHaveCount(12);
  await expect(page.getByRole("img", { name: "Network connectivity capability" })).toHaveCount(3);
  const carrierItem = page.locator("li[class*='componentItem']").filter({ hasText: "Optional modem carrier board" });
  const carrierNetworkBadge = carrierItem.getByRole("img", { name: "Network connectivity capability" });
  await carrierNetworkBadge.hover();
  await expect(page.getByRole("tooltip", { name: /Rhode Island documents transmission/ })).toBeVisible();
  const carrierButton = page.locator("[data-component-select='true']").filter({ hasText: "Optional modem carrier board" });
  await expect(carrierButton.getByText("Optional", { exact: true })).toBeVisible();
  await carrierButton.click();
  const componentDetail = page.locator("article[class*='componentDetail']");
  await expect(componentDetail.getByText("Optional component", { exact: true })).toBeVisible();
  await expect(componentDetail.getByRole("heading", { name: "Hardware and interfaces" })).toBeVisible();
  await expect(componentDetail.getByText("Optional cellular transmission", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText(/Separate modem board installed only where permitted/)).toBeVisible();
  await expect(componentDetail.getByText("Exact-product review blocked by unresolved identity", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("No WAN modem or WAN wireless use listed", { exact: false })).toHaveCount(0);

  const c2Button = page.locator("[data-component-select='true']").filter({ hasText: "MultiTech Verizon C2 cellular modem" });
  await c2Button.click();
  await expect(componentDetail.getByText(/Models:\s*MTSMC-C2-N3-R\.1$/)).toBeVisible();
  await expect(componentDetail.getByRole("heading", { name: "Ranked vulnerabilities" })).toBeVisible();
  await expect(componentDetail.getByText("No exact-product matches found in the reviewed public sources", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("Not publicly established", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("NIST National Vulnerability Database", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("0 exact matches", { exact: true })).toHaveCount(3);

  const lteButton = page.locator("[data-component-select='true']").filter({ hasText: "MultiTech Verizon 4G LTE modem" });
  await lteButton.click();
  await expect(componentDetail.getByText(/Models:\s*MTSMC-LVW3$/)).toBeVisible();
  await expect(componentDetail.getByText("Telit LE910-NA1 in MultiTech's current MTSMC-LVW3 family table", { exact: true })).toBeVisible();
  await expect(componentDetail.getByRole("heading", { name: "Other vendor advisories" })).toBeVisible();
  await expect(componentDetail.getByText("Verizon LTE Cat 1 software patch bulletin", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("Non-CVE", { exact: true })).toBeVisible();
  await expect(componentDetail.getByText("No CVSS assigned", { exact: true })).toBeVisible();
});

test("keeps network topology claims source-bounded and interactive", async ({ page }) => {
  await page.goto(`${clearCountPath}/network`);
  const networkEvidence = page.locator("[data-network-evidence]");
  await expect(networkEvidence.getByRole("heading", { name: "Documented paths, controls, and unknowns" })).toBeVisible();
  await expect(networkEvidence.getByText("1 sourced configuration view", { exact: true })).toBeVisible();
  await expect(networkEvidence.getByText("No field-observed topology collected", { exact: true })).toBeVisible();
  await expect(networkEvidence.getByText("Operational details withheld", { exact: true })).toBeVisible();

  const countServerNode = networkEvidence.getByRole("button", { name: /CountServer/ });
  await countServerNode.click();
  await expect(countServerNode).toHaveAttribute("aria-pressed", "true");
  await expect(networkEvidence.getByText("The Ubuntu CountServer hosts ClearCount software, its database, and election reports.", { exact: true })).toBeVisible();

  await networkEvidence.getByRole("button", { name: /Expand: Exact ClearVote 2.5 scope text/ }).click();
  const sourceDialog = page.getByRole("dialog", { name: /Exact ClearVote 2.5 scope text/ });
  await expect(sourceDialog).toBeVisible();
  await expect(sourceDialog.getByRole("img", { name: /ClearVote 2.5 certification scope page/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sourceDialog).toHaveCount(0);

  await page.goto(`${ds200Path}/network`);
  const ds200NetworkEvidence = page.locator("[data-network-evidence]");
  const certifiedPath = ds200NetworkEvidence.getByRole("button", { name: /EVS 6.4.0.0 Regional Results test path/ });
  const optionalCellular = ds200NetworkEvidence.getByRole("button", { name: /Historical optional cellular hardware context/ });
  await expect(certifiedPath).toHaveAttribute("aria-pressed", "true");
  await optionalCellular.click();
  await expect(optionalCellular).toHaveAttribute("aria-pressed", "true");
  await expect(ds200NetworkEvidence.getByRole("button", { name: /MultiTech MTSMC-LVW3/ })).toBeVisible();
  await expect(ds200NetworkEvidence.getByText(/not evidence that EVS 6.4.0.0 certified/)).toBeVisible();
});

test("renders central tabulators as three separate sourced systems", async ({ page, request }) => {
  await page.goto(`${clearCountPath}/components`);
  await expect(page.getByRole("heading", { name: "Clear Ballot ClearVote 2.5 / ClearCount" })).toBeVisible();
  await expect(page.locator("[data-component-select='true']")).toHaveCount(7);
  await expect(page.locator("[data-component-select='true']").filter({ hasText: "CountServer" })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Network connectivity capability" })).toHaveCount(1);

  await page.goto(`${imageCastCentralPath}/components`);
  await expect(page.getByRole("heading", { name: "Dominion Democracy Suite 5.17 / ImageCast Central" })).toBeVisible();
  await expect(page.locator("[data-component-select='true']")).toHaveCount(7);
  const optionalLan = page.locator("[data-component-select='true']").filter({ hasText: "Optional isolated network infrastructure" });
  await expect(optionalLan.getByText("Optional", { exact: true })).toBeVisible();
  await optionalLan.click();
  await expect(page.getByText("100 Mbps infrastructure when an additional central repository/data center is used; isolated from the Internet and all other networks", { exact: true })).toBeVisible();
  await page.goto(`${imageCastCentralPath}/history`);
  await expect(page.getByText("900 W / 1500 VA", { exact: true })).toBeVisible();

  await page.goto(`${ds950Path}/components`);
  await expect(page.getByRole("heading", { name: "ES&S EVS 6.4.0.0 / DS950" })).toBeVisible();
  await expect(page.locator("[data-component-select='true']")).toHaveCount(10);
  await expect(page.getByText("Certified DS950 firmware:", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Orthographic component").getByText("4.3.0.0", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Network connectivity capability" })).toHaveCount(0);

  for (const path of [clearCountPath, imageCastCentralPath, ds950Path]) {
    const response = await request.get(`/api/v1/equipment-systems/${path.split("/").at(-1)}`);
    expect(response.status()).toBe(200);
  }
});


test("keeps equipment navigation compact and keyboard-usable on mobile", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`${imageCastXPath}/components`);
  await expect(page.getByRole("heading", { name: "Dominion Democracy Suite 5.17 / ImageCast X" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open 3D view/ })).toBeVisible();

  const openNavigation = page.getByRole("button", { name: "Open primary navigation" });
  await expect(openNavigation).toBeVisible();
  await openNavigation.press("Enter");
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile primary navigation" });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "U.S. Equipment" })).toHaveAttribute("aria-current", "page");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toHaveCount(0);
  await expect(openNavigation).toBeFocused();

  const dossierSection = page.getByLabel("Dossier section", { exact: true });
  await expect(dossierSection).toHaveValue(`${imageCastXPath}/components`);
  await dossierSection.selectOption(`${imageCastXPath}/sources`);
  await expect(page).toHaveURL(`${imageCastXPath}/sources`, { timeout: 15_000 });
  await expect(page.getByLabel("Dossier section", { exact: true })).toHaveValue(`${imageCastXPath}/sources`);

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
});

test("avoids a second sticky navigation layer at tablet widths", async ({ page }) => {
  await page.setViewportSize({ height: 1024, width: 900 });
  await page.goto(`${imageCastXPath}/components`);
  const dossierNavigation = page.locator("[data-tour='equipment-dossier-navigation']");
  await expect(dossierNavigation).toBeVisible();
  await expect(dossierNavigation).toHaveCSS("position", "static");
});

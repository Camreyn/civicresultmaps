import { expect, test } from "@playwright/test";
import sharp from "sharp";

const ds200Path = "/equipment/ess-evs-6400-ds200";
const equipmentSlugs = [
  "clear-ballot-clearvote-25-clearaccess",
  "clear-ballot-clearvote-25-clearcount",
  "dominion-democracy-suite-517-imagecast-central",
  "dominion-democracy-suite-517-imagecast-x",
  "ess-evs-6400-ds200",
  "ess-evs-6400-ds950",
];

function expectPngDimensions(body: Buffer, width: number, height: number) {
  expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(body.readUInt32BE(16)).toBe(width);
  expect(body.readUInt32BE(20)).toBe(height);
}

async function expectDenseStateCardLayout(body: Buffer) {
  const { data, info } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
  const rowBackground = [0x0d, 0x24, 0x27];
  const scanX = 900;
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let y = 0; y < info.height; y += 1) {
    const offset = (y * info.width + scanX) * info.channels;
    const matches = rowBackground.every((value, channel) => data[offset + channel] === value);
    if (matches && start < 0) start = y;
    if (!matches && start >= 0) {
      runs.push({ start, end: y - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start, end: info.height - 1 });

  expect(runs).toHaveLength(6);
  expect(runs.every((run) => run.end - run.start >= 45)).toBe(true);
  expect(runs[runs.length - 1]?.end).toBeLessThan(540);
}

test.describe.configure({ mode: "serial", timeout: 90_000 });

test("builds a stable state share page with exact-family and manufacturer-context boundaries", async ({ page, request }) => {
  await page.goto("/equipment");
  const picker = page.getByLabel("State", { exact: true });
  await expect(picker).toContainText("Colorado (CO)");
  await picker.selectOption("CO");
  await Promise.all([
    page.waitForURL(/\/equipment\/state\/CO$/, { waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "View state equipment" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "Colorado election equipment records" })).toBeVisible();
  await expect(page.locator("article[data-evidence='device-family']")).toHaveCount(2);
  await expect(page.locator("article[data-evidence='manufacturer-context']")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Named product-family records" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manufacturer context only" })).toBeVisible();
  await expect(page.getByText(/Dossier network capability does not establish a state or local connection/)).toBeVisible();

  const clearCountContext = page.locator("article[data-evidence='manufacturer-context']")
    .filter({ hasText: "Clear Ballot ClearVote 2.5 / ClearCount" });
  await expect(clearCountContext.getByText("Clear Ballot ClearAccess", { exact: true })).toBeVisible();
  await expect(clearCountContext.getByText(/do not identify this dossier's exact model/i)).toBeVisible();
  await expect(clearCountContext.getByText("Closed wired Ethernet system documented", { exact: true })).toBeVisible();

  await expect(page.locator("meta[property='og:title']")).toHaveAttribute("content", /Colorado tracked election equipment/);
  await expect(page.locator("meta[property='og:image']")).toHaveAttribute("content", /\/api\/equipment-social-card\?v=equipment-v2&state=CO$/);
  await expect(page.locator("meta[name='twitter:card']")).toHaveAttribute("content", "summary_large_image");
  await expect(page.getByRole("link", { name: "Open preview image" })).toHaveAttribute("href", /state=CO$/);

  const stateCard = await request.get("/api/equipment-social-card?v=equipment-v2&state=CO");
  expect(stateCard.status()).toBe(200);
  expect(stateCard.headers()["content-type"]).toMatch(/^image\/png/);
  expect(stateCard.headers()["cache-control"]).toContain("s-maxage=900");
  expectPngDimensions(await stateCard.body(), 1200, 630);

  const denseStateCard = await request.get("/api/equipment-social-card?v=equipment-v2&state=WI");
  expect(denseStateCard.status()).toBe(200);
  expect(denseStateCard.headers()["content-type"]).toMatch(/^image\/png/);
  const denseStateCardBody = await denseStateCard.body();
  expectPngDimensions(denseStateCardBody, 1200, 630);
  await expectDenseStateCardLayout(denseStateCardBody);
});

test("publishes machine quick facts and optional-networking metadata", async ({ page, request }) => {
  await page.goto(ds200Path);
  await expect(page.locator("meta[property='og:title']")).toHaveAttribute("content", /ES&S EVS 6\.4\.0\.0 \/ DS200 equipment dossier/i);
  await expect(page.locator("meta[property='og:description']")).toHaveAttribute("content", /Optional cellular modem hardware documented historically/);
  await expect(page.locator("meta[property='og:image']")).toHaveAttribute("content", /slug=ess-evs-6400-ds200$/);
  await expect(page.locator("meta[name='twitter:card']")).toHaveAttribute("content", "summary_large_image");

  for (const slug of equipmentSlugs) {
    const machineCard = await request.get(`/api/equipment-social-card?v=equipment-v2&slug=${slug}`);
    expect(machineCard.status()).toBe(200);
    expect(machineCard.headers()["content-type"]).toMatch(/^image\/png/);
    expectPngDimensions(await machineCard.body(), 1200, 630);
  }

  const unknownMachine = await request.get("/api/equipment-social-card?slug=not-a-machine");
  expect(unknownMachine.status()).toBe(404);
  const unknownState = await request.get("/api/equipment-social-card?state=ZZ");
  expect(unknownState.status()).toBe(404);
});

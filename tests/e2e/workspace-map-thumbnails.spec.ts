import { expect, test } from "@playwright/test";
import sharp from "sharp";

const origin = "https://www.civicresultmaps.org";
const modes = ["winner", "margin", "volume", "votes-3d", "method", "equipment", "security"] as const;

test("every map mode advertises a distinct 1200×630 PNG to a crawler without JavaScript", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: "Twitterbot/1.0" });
  try {
    const page = await context.newPage();
    const images = new Set<string>();
    const pictures = new Set<string>();
    for (const mode of modes) {
      const query = new URLSearchParams({ state: "WI", year: "2024", tab: "map", mode });
      const path = "/?" + query;
      await page.goto(path + "&ignored=private-example");
      const image = await page.locator('head meta[property="og:image"]').getAttribute("content");
      expect(await page.locator('head meta[name="twitter:image"]').getAttribute("content")).toBe(image);
      expect(await page.locator('head meta[property="og:url"]').getAttribute("content")).toBe(origin + path);
      expect(image).toBe(origin + "/api/social-card?" + query + "&v=map-modes-1");
      images.add(image!);
      const response = await context.request.get(new URL(image!).pathname + new URL(image!).search);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      expect(response.headers()["cache-control"]).toContain("s-maxage=900");
      const png = await response.body();
      expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630, format: "png" });
      // Compare the illustrated map area (not title text); seed covers at least the three results modes + prisms.
      if (["winner", "margin", "volume", "votes-3d"].includes(mode)) {
        const map = await sharp(png).extract({ left: 490, top: 150, width: 550, height: 316 }).png().toBuffer();
        pictures.add(map.toString("base64"));
      }
      if (mode === "votes-3d") {
        await testInfo.attach("Wisconsin 3D share card", { body: png, contentType: "image/png" });
        const raw = await sharp(png).removeAlpha().raw().toBuffer();
        let wallPixels = 0;
        for (let i = 0; i < raw.length; i += 3) {
          // The seeded Dane County result has a 66.8% leading share (second blue shade).
          if (raw[i] === 0x34 && raw[i + 1] === 0x4f && raw[i + 2] === 0x9d) wallPixels++;
        }
        expect(wallPixels, "the selected race has visible blue prism walls").toBeGreaterThan(0);
      }
    }
    expect(images.size).toBe(modes.length);
    expect(pictures.size).toBe(4);
  } finally { await context.close(); }
});

test("historical dates and in-state pins survive sharing; unknown race and private query values do not", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: "Twitterbot" });
  try {
    const page = await context.newPage();
    await page.goto("/?state=WI&year=2012&tab=map&mode=votes-3d&fips=55025&race=not-a-public-contest");
    const image = await page.locator('head meta[property="og:image"]').getAttribute("content");
    expect(image).toContain("year=2012&tab=map&mode=votes-3d&fips=55025&");
    expect(image).not.toContain("race=");
    await expect(page.locator('head meta[property="og:image:alt"]')).toHaveAttribute("content", /Wisconsin 2012.*President.*Dane/);
    expect((await request.get(new URL(image!).pathname + new URL(image!).search)).headers()["content-type"]).toContain("image/png");
    expect((await request.get("/api/social-card?state=WI&year=2012&mode=equipment")).status()).toBe(400);
    expect((await request.get("/api/social-card?state=XX&mode=votes-3d")).status()).toBe(400);
  } finally { await context.close(); }
});

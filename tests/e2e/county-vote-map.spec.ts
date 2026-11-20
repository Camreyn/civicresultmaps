import { expect, test } from "@playwright/test";

test("3D vote layer: inspect a sourced county, rotate, follow a deep link, and return to the flat map", async ({ page }, testInfo) => {
  await page.goto("/?state=WI&year=2024&tab=map&mode=votes-3d");
  const map = page.getByRole("group", {name:"WI 2024 President 3D county votes"});
  await expect(map.getByRole("button")).toHaveCount(72);
  const dane = map.locator('[data-fips="55025"]');
  await expect(dane).toHaveAttribute("aria-label", /401,667 votes/);
  await dane.focus();
  await dane.press("Enter");
  await expect(page.getByLabel("Inspect 3D county")).toHaveValue("55025");
  await expect(page).toHaveURL(/fips=55025/);
  await expect(page.getByRole("link", {name:/Wisconsin Elections Commission/}).first()).toBeVisible();
  const roof = dane.locator("path").last();
  const before = await roof.getAttribute("d");
  await page.getByRole("slider", {name:"Rotate 3D map"}).press("ArrowRight");
  await expect(roof).not.toHaveAttribute("d", before!);
  await page.reload();
  await expect(page.getByLabel("Inspect 3D county")).toHaveValue("55025");
  await testInfo.attach("3D county map", {body: await map.screenshot(), contentType:"image/png"});
  await page.getByRole("button", {name:"Return to flat map"}).click();
  await expect(page.getByRole("button", {name:"3D votes", exact:true})).toBeVisible();
  await page.getByRole("button", {name:"3D votes", exact:true}).click();
  await expect(map).toBeVisible();
  await page.getByRole("combobox", {name:"Workspace election year"}).selectOption("2012");
  await expect(page).toHaveURL(/year=2012.*mode=votes-3d/);
  await expect(page.getByText("No county totals are available", {exact:false})).toBeVisible();
});

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const previewPath = path.resolve(__dirname, "..", "socks-product-list.html");
const previewUrl = pathToFileURL(previewPath).href;

test("renders the socks category page shell", async ({ page }) => {
  await page.goto(previewUrl);

  await expect(page.getByRole("heading", { name: "袜子专区" })).toBeVisible();
  await expect(page.locator("[data-toolbar]")).toBeVisible();
  await expect(page.locator("[data-filter='全部']")).toBeVisible();
  await expect(page.locator("[data-sort='推荐']")).toBeVisible();
  await expect(page.locator("[data-result-count]")).toBeVisible();
  await expect(page.locator("[data-product-grid]")).toBeVisible();
});

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const previewPath = path.resolve(__dirname, "..", "socks-product-list.html");
const previewUrl = pathToFileURL(previewPath).href;

test.use({ viewport: { width: 1280, height: 960 } });

test("renders the socks category page shell", async ({ page }) => {
  await page.goto(previewUrl);

  await expect(page.getByRole("heading", { name: "袜子专区" })).toBeVisible();
  await expect(page.locator("[data-toolbar]")).toBeVisible();
  await expect(page.locator("[data-filter='全部']")).toBeVisible();
  await expect(page.locator("[data-sort='推荐']")).toBeVisible();
  await expect(page.locator("[data-result-count]")).toBeVisible();
  await expect(page.locator("[data-result-count]")).toHaveText("共 6 件商品");
  await expect(page.locator("[data-product-grid]")).toBeVisible();
  await expect(page.locator("[data-product-card]").first()).toBeVisible();
});

test("renders multiple socks cards in a three-column desktop grid", async ({ page }) => {
  await page.goto(previewUrl);

  const productCards = page.locator("[data-product-card]");
  await expect(productCards).toHaveCount(6);
  const firstCard = productCards.first();

  await expect(firstCard.locator(".product-card__media")).toBeVisible();
  await expect(firstCard.locator(".product-card__sock")).toBeVisible();
  await expect(firstCard.locator(".product-card__badge")).toHaveText("32% OFF");
  await expect(firstCard.getByText("极简中筒袜")).toBeVisible();
  await expect(firstCard.locator(".product-card__price-original")).toHaveText("¥59");
  await expect(firstCard.getByRole("button", { name: "加入购物车" })).toBeVisible();
  await expect(productCards.nth(1).getByText("轻压运动袜")).toBeVisible();

  const gridColumns = await page.locator("[data-product-grid]").evaluate((node) => {
    return window.getComputedStyle(node).gridTemplateColumns.split(" ").length;
  });

  expect(gridColumns).toBe(3);
});

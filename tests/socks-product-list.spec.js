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
  await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
  await expect(page.getByRole("button", { name: "推荐" })).toBeVisible();
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

test("filters the list by category and updates the result count", async ({ page }) => {
  await page.goto(previewUrl);

  await page.getByRole("button", { name: "运动袜" }).click();

  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.locator("[data-result-count]")).toHaveText("共 2 件商品");
  await expect(page.getByText("轻压运动袜")).toBeVisible();
  await expect(page.getByText("速干训练袜")).toBeVisible();
});

test("sorts the visible products by price from low to high", async ({ page }) => {
  await page.goto(previewUrl);

  await page.getByRole("button", { name: "价格从低到高" }).click();

  await expect(page.locator("[data-product-card]").first().getByText("柔棉短袜")).toBeVisible();
});

test("keeps recommended products first in the default view and inside filtered results", async ({ page }) => {
  await page.goto(previewUrl);

  const allProductTitles = await page.locator(".product-card__title").allTextContents();
  expect(allProductTitles.slice(0, 3)).toEqual(["极简中筒袜", "轻压运动袜", "通勤罗口袜"]);

  await page.getByRole("button", { name: "日常袜" }).click();
  await expect(page.locator("[data-product-card]").first().getByText("通勤罗口袜")).toBeVisible();
});

test("sorts products by price descending and newest with full visible order", async ({ page }) => {
  await page.goto(previewUrl);

  await page.getByRole("button", { name: "价格从高到低" }).click();
  await expect(page.locator(".product-card__title")).toHaveText([
    "轻压运动袜",
    "速干训练袜",
    "极简中筒袜",
    "通勤罗口袜",
    "云感船袜",
    "柔棉短袜"
  ]);

  await page.getByRole("button", { name: "最新上架" }).click();
  await expect(page.locator(".product-card__title")).toHaveText([
    "极简中筒袜",
    "轻压运动袜",
    "速干训练袜",
    "通勤罗口袜",
    "云感船袜",
    "柔棉短袜"
  ]);
});

test("keeps size selection scoped to the clicked product card", async ({ page }) => {
  await page.goto(previewUrl);

  const firstCard = page.locator("[data-product-card]").first();
  const secondCard = page.locator("[data-product-card]").nth(1);

  await secondCard.getByRole("button", { name: "43-45" }).click();

  await expect(secondCard.getByRole("button", { name: "43-45" })).toHaveAttribute("aria-pressed", "true");
  await expect(secondCard.locator('.product-card__size[aria-pressed="true"]')).toHaveCount(1);
  await expect(firstCard.getByRole("button", { name: "35-38" })).toHaveAttribute("aria-pressed", "true");
});

test("shows cart feedback per card and restores it after the timer", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-07-16T08:00:00") });
  await page.goto(previewUrl);
  await page.clock.pauseAt(new Date("2026-07-16T10:00:00"));

  const firstButton = page.locator("[data-product-card]").first().locator("[data-cart-button]");
  const secondButton = page.locator("[data-product-card]").nth(1).locator("[data-cart-button]");

  await secondButton.click();

  await expect(secondButton).toHaveText("已加入购物车");
  await expect(firstButton).toHaveText("加入购物车");

  await page.clock.runFor(1500);
  await expect(secondButton).toHaveText("加入购物车");
});

test("shows an empty state when a filter has no products", async ({ page }) => {
  await page.goto(previewUrl);

  await page.evaluate(() => {
    const filterGroups = document.querySelectorAll("[data-toolbar] .toolbar__group");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar__chip";
    button.dataset.filter = "business";
    button.textContent = "商务袜";
    filterGroups[0].appendChild(button);
  });

  await page.getByRole("button", { name: "商务袜" }).click();

  await expect(page.locator("[data-product-card]")).toHaveCount(0);
  await expect(page.locator("[data-empty-state]")).toHaveText("当前分类暂无商品");
});

test("reuses the single-card hover motion for the card media and cart button", async ({ page }) => {
  await page.goto(previewUrl);

  const firstCard = page.locator("[data-product-card]").first();
  const sockVisual = firstCard.locator(".product-card__sock");
  const sizeButton = firstCard.getByRole("button", { name: "39-42" });
  const cartButton = firstCard.locator("[data-cart-button]");

  const initialCardTransform = await firstCard.evaluate((node) => window.getComputedStyle(node).transform);
  const initialSockTransform = await sockVisual.evaluate((node) => window.getComputedStyle(node).transform);
  const initialSizeBorderColor = await sizeButton.evaluate((node) => window.getComputedStyle(node).borderTopColor);
  await expect(sizeButton).toHaveCSS("cursor", "pointer");

  await firstCard.hover();

  await expect
    .poll(async () => firstCard.evaluate((node) => window.getComputedStyle(node).transform))
    .not.toBe(initialCardTransform);
  await expect
    .poll(async () => sockVisual.evaluate((node) => window.getComputedStyle(node).transform))
    .not.toBe(initialSockTransform);

  await sizeButton.hover();
  await expect
    .poll(async () => sizeButton.evaluate((node) => window.getComputedStyle(node).borderTopColor))
    .not.toBe(initialSizeBorderColor);

  const cardHoverButtonBackground = await cartButton.evaluate((node) => window.getComputedStyle(node).backgroundColor);
  await cartButton.hover();
  await expect
    .poll(async () => cartButton.evaluate((node) => window.getComputedStyle(node).backgroundColor))
    .not.toBe(cardHoverButtonBackground);
});

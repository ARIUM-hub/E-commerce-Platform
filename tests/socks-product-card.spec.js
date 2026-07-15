const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const previewPath = path.resolve(__dirname, "..", "socks-product-card.html");
const previewUrl = pathToFileURL(previewPath).href;

test("renders the base product card shell with a default size", async ({ page }) => {
  await page.goto(previewUrl);

  const defaultSize = page.getByRole("button", { name: "35-38" });
  const mediumSize = page.getByRole("button", { name: "39-42" });
  const largeSize = page.getByRole("button", { name: "43-45" });

  await expect(page.locator(".product-card")).toBeVisible();
  await expect(page.getByText("极简中筒袜")).toBeVisible();
  await expect(defaultSize).toHaveAttribute("aria-pressed", "true");
  await expect(defaultSize).toHaveClass(/is-selected/);
  await expect(mediumSize).toHaveAttribute("aria-pressed", "false");
  await expect(mediumSize).not.toHaveClass(/is-selected/);
  await expect(largeSize).toHaveAttribute("aria-pressed", "false");
  await expect(largeSize).not.toHaveClass(/is-selected/);
  await expect(page.getByRole("button", { name: "加入购物车" })).toBeVisible();
});

test("shows an image-first layout with sale and pricing details", async ({ page }) => {
  await page.goto(previewUrl);

  const media = page.locator(".product-card__media");
  const content = page.locator(".product-card__content");
  const currentPrice = page.locator(".product-card__price-current");
  const originalPrice = page.locator(".product-card__price-original");
  const stackedTolerance = 2;

  await expect(media).toBeVisible();
  await expect(page.locator(".product-card__badge")).toHaveText("32% OFF");
  await expect(currentPrice).toBeVisible();
  await expect(originalPrice).toBeVisible();
  await expect(currentPrice).toHaveText("¥39");
  await expect(originalPrice).toHaveText("¥59");
  await expect(page.locator(".product-card__description")).toContainText("柔软透气面料");

  const mediaBox = await media.boundingBox();
  const contentBox = await content.boundingBox();
  expect(mediaBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(mediaBox.y).toBeLessThanOrEqual(contentBox.y);
  expect(mediaBox.y + mediaBox.height).toBeLessThanOrEqual(contentBox.y + stackedTolerance);

  const currentPriceStyles = await currentPrice.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      fontSize: Number.parseFloat(styles.fontSize),
      fontWeight: Number.parseInt(styles.fontWeight, 10),
    };
  });
  const originalPriceStyles = await originalPrice.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      fontSize: Number.parseFloat(styles.fontSize),
      fontWeight: Number.parseInt(styles.fontWeight, 10),
      textDecorationLine: styles.textDecorationLine,
    };
  });

  expect(currentPriceStyles.fontSize).toBeGreaterThan(originalPriceStyles.fontSize);
  expect(currentPriceStyles.fontWeight).toBeGreaterThanOrEqual(originalPriceStyles.fontWeight);
  expect(originalPriceStyles.textDecorationLine).toContain("line-through");

  const mediaHeight = await media.evaluate((node) => node.getBoundingClientRect().height);
  expect(mediaHeight).toBeGreaterThan(220);
});

test("switches the selected size with single-select behavior", async ({ page }) => {
  await page.goto(previewUrl);

  const sizeOne = page.getByRole("button", { name: "35-38" });
  const sizeTwo = page.getByRole("button", { name: "39-42" });
  const sizeThree = page.getByRole("button", { name: "43-45" });
  const selectedSizes = page.locator(".product-card__size.is-selected");
  const pressedSizes = page.locator('.product-card__size[aria-pressed="true"]');

  await sizeTwo.click();

  await expect(sizeOne).toHaveAttribute("aria-pressed", "false");
  await expect(sizeOne).not.toHaveClass(/is-selected/);
  await expect(sizeTwo).toHaveAttribute("aria-pressed", "true");
  await expect(sizeTwo).toHaveClass(/is-selected/);
  await expect(sizeThree).toHaveAttribute("aria-pressed", "false");
  await expect(sizeThree).not.toHaveClass(/is-selected/);
  await expect(selectedSizes).toHaveCount(1);
  await expect(pressedSizes).toHaveCount(1);
});

test("changes the cart button text after click and restores it", async ({ page }) => {
  await page.goto(previewUrl);

  const cartButton = page.getByRole("button", { name: "加入购物车" });
  await cartButton.click();

  await expect(cartButton).toHaveText("已加入购物车");
  await page.waitForTimeout(1700);
  await expect(page.locator(".product-card__button")).toHaveText("加入购物车");
});

test("applies hover motion to the card and product image", async ({ page }) => {
  await page.goto(previewUrl);

  const card = page.locator(".product-card");
  const sock = page.locator(".product-card__sock");

  const beforeCardTransform = await card.evaluate((node) => getComputedStyle(node).transform);
  const beforeSockTransform = await sock.evaluate((node) => getComputedStyle(node).transform);

  await card.hover();

  const afterCardTransform = await card.evaluate((node) => getComputedStyle(node).transform);
  const afterSockTransform = await sock.evaluate((node) => getComputedStyle(node).transform);

  expect(afterCardTransform).not.toBe(beforeCardTransform);
  expect(afterSockTransform).not.toBe(beforeSockTransform);
});

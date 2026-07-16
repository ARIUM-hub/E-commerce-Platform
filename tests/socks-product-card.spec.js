const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test, expect } = require("@playwright/test");

test("fails to start when DATA_DIR does not contain required JSON files", async () => {
  const missingDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "socks-missing-data-"));

  const result = spawnSync(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      DATA_DIR: missingDataDir,
      PORT: "0"
    },
    encoding: "utf8",
    timeout: 1000
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("products.json");
  expect(result.stderr).toContain("cart.json");
});

test("keeps product fixtures identical between app and test datasets", async () => {
  const appProducts = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "data", "products.json"), "utf8")
  );
  const testProducts = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "fixtures", "test-data", "products.json"), "utf8")
  );

  expect(appProducts).toHaveLength(6);
  expect(testProducts).toHaveLength(6);
  expect(testProducts).toEqual(appProducts);

  for (const product of appProducts) {
    expect(product.visualTone).toBeTruthy();
    expect(product.visualShadow).toBeTruthy();
    expect(product.visualAccent).toBeTruthy();
    expect(product.visualPattern).toBeTruthy();
  }
});

test("does not expose internal project files over static hosting", async ({ request }) => {
  const blockedPaths = ["/data/cart.json", "/package.json", "/tests/socks-product-card.spec.js"];

  for (const blockedPath of blockedPaths) {
    const response = await request.get(blockedPath);
    expect(response.status(), blockedPath).toBe(404);
  }
});

test("renders the base product card shell with a default size", async ({ page }) => {
  await page.goto("/socks-product-card.html");

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
  await page.goto("/socks-product-card.html");

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
  await page.goto("/socks-product-card.html");

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
  await page.clock.install({ time: new Date("2026-07-16T08:00:00") });
  await page.goto("/socks-product-card.html");
  await page.clock.pauseAt(new Date("2026-07-16T10:00:00"));

  const cartButton = page.locator(".product-card__button");
  await cartButton.click();

  await expect(cartButton).toHaveText("已加入购物车");
  await page.clock.runFor(1000);

  await cartButton.click();
  await expect(cartButton).toHaveText("已加入购物车");

  await page.clock.runFor(1499);
  await expect(cartButton).toHaveText("已加入购物车");

  await page.clock.runFor(1);
  await expect(cartButton).toHaveText("加入购物车");
});

test("applies hover motion to the card and product image", async ({ page }) => {
  await page.goto("/socks-product-card.html");

  const card = page.locator(".product-card");
  const sock = page.locator(".product-card__sock");
  const sizeButton = page.getByRole("button", { name: "39-42" });
  const cartButton = page.locator(".product-card__button");

  const beforeCardTransform = await card.evaluate((node) => getComputedStyle(node).transform);
  const beforeSockTransform = await sock.evaluate((node) => getComputedStyle(node).transform);
  const beforeSizeBorderColor = await sizeButton.evaluate((node) => getComputedStyle(node).borderTopColor);
  const beforeCartButtonBackground = await cartButton.evaluate((node) => getComputedStyle(node).backgroundColor);

  await card.hover();

  await expect.poll(async () => {
    return card.evaluate((node) => getComputedStyle(node).transform);
  }).not.toBe(beforeCardTransform);
  await expect.poll(async () => {
    return sock.evaluate((node) => getComputedStyle(node).transform);
  }).not.toBe(beforeSockTransform);

  await sizeButton.hover();
  await expect.poll(async () => {
    return sizeButton.evaluate((node) => getComputedStyle(node).borderTopColor);
  }).not.toBe(beforeSizeBorderColor);

  await cartButton.hover();
  await expect.poll(async () => {
    return cartButton.evaluate((node) => getComputedStyle(node).backgroundColor);
  }).not.toBe(beforeCartButtonBackground);

  await page.mouse.down();
  await expect.poll(async () => {
    return cartButton.evaluate((node) => getComputedStyle(node).transform);
  }).not.toBe("none");
  await page.mouse.up();
  await expect.poll(async () => {
    return cartButton.evaluate((node) => getComputedStyle(node).transform);
  }).toBe("none");
});

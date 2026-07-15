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

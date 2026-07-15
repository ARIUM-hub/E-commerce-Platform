const path = require("node:path");
const { test, expect } = require("@playwright/test");

const previewUrl = "file://" + path.join(process.cwd(), "socks-product-card.html");

test("renders the base product card shell with a default size", async ({ page }) => {
  await page.goto(previewUrl);

  await expect(page.locator(".product-card")).toBeVisible();
  await expect(page.getByText("极简中筒袜")).toBeVisible();
  await expect(page.getByRole("button", { name: "35-38" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "加入购物车" })).toBeVisible();
});

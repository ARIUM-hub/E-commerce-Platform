const { test, expect } = require("@playwright/test");

test("shows a friendly empty state when no stored order is available", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=order");

  await expect(page.locator("[data-page-title]")).toHaveText("暂无最近的演示订单");
  await expect(page.locator(".order-empty-state__copy")).toHaveText("请先从商城完成一次演示结账。");
  await expect(page.getByRole("link", { name: "返回商城" })).toHaveAttribute("href", "/socks-product-list.html");
});

test("renders a richer order summary and recommended products for the current demo order", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("demoOrderConfirmation", JSON.stringify({
      orderNumber: "SOCK-20260717-001",
      itemCount: 3,
      estimatedDelivery: "2026年7月18日星期六",
      subtotal: 187,
      savings: 54,
      total: 133,
      purchasedProductIds: ["sock-02", "sock-05"]
    }));
  });

  await page.goto("/socks-product-list.html?view=order");

  await expect(page.locator("[data-order-page-number]")).toHaveText("SOCK-20260717-001");
  await expect(page.locator("[data-order-page-items]")).toHaveText("3 件商品");
  await expect(page.locator("[data-order-page-delivery]")).toHaveText("2026年7月18日星期六");
  await expect(page.locator("[data-order-page-subtotal]")).toHaveText("¥187");
  await expect(page.locator("[data-order-page-savings]")).toHaveText("-¥54");
  await expect(page.locator("[data-order-page-total]")).toHaveText("¥133");

  await expect(page.getByRole("heading", { name: "你可能也喜欢" })).toBeVisible();
  await expect(page.locator("[data-recommended-card]")).toHaveCount(3);
  await expect(page.locator("[data-recommended-card]")).toContainText([
    "极简中筒袜",
    "速干训练袜",
    "云感船袜"
  ]);
  const recommendationTexts = await page.locator("[data-recommended-card]").allTextContents();
  expect(recommendationTexts.join(" ")).not.toContain("轻压运动袜");
  expect(recommendationTexts.join(" ")).not.toContain("通勤罗口袜");
});

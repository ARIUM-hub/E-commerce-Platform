const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const cartFile = path.join(__dirname, "fixtures", "test-data", "cart.json");

function getSortedSearchParamEntries(searchParams) {
  return [...searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });
}

function expectUrlMatch(rawUrl, { pathname, searchParams = {} }) {
  const resolvedUrl = new URL(rawUrl, "http://127.0.0.1");
  const expectedEntries = getSortedSearchParamEntries(new URLSearchParams(searchParams));
  const actualEntries = getSortedSearchParamEntries(resolvedUrl.searchParams);

  expect(resolvedUrl.pathname).toBe(pathname);
  expect(actualEntries).toEqual(expectedEntries);

  for (const [key, value] of Object.entries(searchParams)) {
    expect(resolvedUrl.searchParams.get(key)).toBe(value);
  }
}

async function expectPageUrlMatch(page, expected) {
  expectUrlMatch(page.url(), expected);
}

async function expectLocatorHrefMatch(locator, expected) {
  const href = await locator.getAttribute("href");

  expect(href).not.toBeNull();
  expectUrlMatch(href, expected);
}

test.use({ viewport: { width: 1280, height: 960 } });

test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
});

test("rejects urls with unexpected extra query params in helper matching", () => {
  expect(() => {
    expectUrlMatch("/socks-product-list.html?view=detail&id=sock-02&filter=sport&extra=1", {
      pathname: "/socks-product-list.html",
      searchParams: { view: "detail", id: "sock-02", filter: "sport" }
    });
  }).toThrow();
});

test("renders the socks category page shell", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect(page.getByRole("heading", { name: "袜子专区" })).toBeVisible();
  await expect(page.locator("[data-toolbar]")).toBeVisible();
  await expect(page.locator("[data-cart-summary]")).toBeVisible();
  await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
  await expect(page.getByRole("button", { name: "推荐" })).toBeVisible();
  await expect(page.locator("[data-result-count]")).toBeVisible();
  await expect(page.locator("[data-result-count]")).toHaveText("共 6 件商品");
  await expect(page.locator("[data-product-grid]")).toBeVisible();
  await expect(page.locator("[data-product-card]").first()).toBeVisible();
});

test("renders the shared storefront shell on storefront, detail, and order views", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await expect(page.locator("[data-site-header]")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();
  await expect(page.locator("[data-site-search-form]")).toBeVisible();

  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await expect(page.locator("[data-site-header]")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();
  await expect(page.locator("[data-site-search-form]")).toBeVisible();

  await page.goto("/socks-product-list.html?view=order");
  await expect(page.locator("[data-site-header]")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();
  await expect(page.locator("[data-site-search-form]")).toBeVisible();
});

test("switches the storefront copy to English and persists the locale preference", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const localeResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("filter") === "all"
      && requestUrl.searchParams.get("sort") === "recommended"
      && requestUrl.searchParams.get("locale") === "en-US";
  });

  await page.locator('[data-locale-option="en-US"]').click();
  expect((await localeResponsePromise).ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "Socks Storefront" })).toBeVisible();
  await expect(page.getByText("A focused edit of black, white, and gray essentials for daily wear, training, and light commuting.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sport Socks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recommended" })).toBeVisible();
  await expect(page.locator("[data-cart-summary]")).toHaveText("Cart 0 items");
  await expect(page.locator("[data-result-count]")).toHaveText("6 products");
  await expect(page.locator('[data-product-card][data-product-id="sock-02"]')).toContainText("Compression Sport Socks");
  await expect(page.locator('[data-product-card][data-product-id="sock-02"]').locator("[data-product-detail-link]")).toHaveText("View details");
  await expect.poll(async () => {
    return page.evaluate(() => window.localStorage.getItem("socks-storefront-locale"));
  }).toBe("en-US");
});

test("navigates from a product card into the detail view and returns to the filtered storefront state", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "运动袜" }).click();
  await page.getByRole("button", { name: "价格从高到低" }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.locator("[data-product-card]").first().getByText("轻压运动袜")).toBeVisible();

  await page.locator("[data-product-card]").first().locator("[data-product-detail-link]").click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-02", filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("轻压运动袜");
  await expect(page.locator("[data-detail-page-price]")).toHaveText("¥49");
  await expectLocatorHrefMatch(page.locator("[data-detail-back-link]"), {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });

  await page.locator("[data-detail-back-link]").click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.locator("[data-product-card]").first().getByText("轻压运动袜")).toBeVisible();
});

test("renders the selected product detail when opened directly by id", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-04");

  await expect(page.locator("[data-detail-page-title]")).toHaveText("速干训练袜");
  await expect(page.locator("[data-detail-page-series]")).toHaveText("Motion Fit");
  await expect(page.locator("[data-detail-page-price]")).toHaveText("¥45");
  await expect(page.locator("[data-detail-page-original-price]")).toHaveText("¥58");
  await expect(page.locator("[data-detail-page-description]")).toContainText("快干面料帮助维持长时间训练舒适度。");
  await expect(page.locator("[data-detail-page-stock]")).toHaveText("仅剩 5 件");
  await expect(page.locator("[data-detail-back-link]")).toHaveAttribute("href", "/socks-product-list.html");
});

test("shows source copy and breadcrumb on the detail page when storefront context exists", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  await expect(page.locator("[data-detail-source-link]")).toContainText("返回 运动袜 结果");
  await expectLocatorHrefMatch(page.locator("[data-detail-source-link]"), {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-detail-sort-copy]")).toHaveText("当前排序：价格从高到低");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("首页");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("袜子专区");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("运动袜");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("轻压运动袜");
});

test("keeps English source copy and product content on the detail page after switching locale", async ({ page }) => {
  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");

  await page.locator('[data-locale-option="en-US"]').click();
  await page.locator('[data-product-card][data-product-id="sock-02"]').locator("[data-product-detail-link]").click();

  await expect(page.locator("[data-detail-page-title]")).toHaveText("Compression Sport Socks");
  await expect(page.locator("[data-detail-source-link]")).toHaveText("Back to results for Sport Socks");
  await expect(page.locator("[data-detail-sort-copy]")).toHaveText("Current sort: Price high to low");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("Home");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("Socks");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("Sport Socks");
});

test("falls back to a simplified breadcrumb on the detail page when no storefront context exists", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-05");

  await expect(page.locator("[data-detail-source-link]")).toHaveCount(0);
  await expect(page.locator("[data-detail-sort-copy]")).toHaveCount(0);
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("首页");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("袜子专区");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("通勤罗口袜");
});

test("submits shared header search from detail view back into storefront results", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  const searchResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("q") === "速干"
      && requestUrl.searchParams.get("filter") === "sport"
      && requestUrl.searchParams.get("sort") === "price-desc"
      && requestUrl.searchParams.get("locale") === "zh-CN";
  });

  await page.locator("[data-site-search-input]").fill("速干");
  await page.locator("[data-site-search-submit]").click();
  expect((await searchResponsePromise).ok()).toBe(true);

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc", q: "速干" }
  });
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(page.locator("[data-product-card]").first()).toContainText("速干训练袜");
});

test("shows a friendly empty state when the detail product id is invalid", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=missing-sock");

  await expect(page.locator("[data-detail-empty-state]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "商品不存在" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回商城" })).toHaveAttribute("href", "/socks-product-list.html");
});

test("loads persisted cart state and opens the cart drawer from the detail view", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=detail&id=sock-02");

  await expect(page.locator("[data-detail-cart-count]")).toHaveText("3");
  await expect(page.locator("[data-detail-cart-summary]")).toContainText("3 件");

  await page.getByRole("button", { name: "打开详情购物车" }).click();

  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
  await expect(page.locator("[data-cart-item]")).toHaveCount(2);
  await expect(page.locator("[data-cart-item]").first()).toContainText("轻压运动袜");
});

test("updates the visible detail cart state after adding the current product", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-04");

  await expect(page.locator("[data-detail-cart-count]")).toHaveText("0");
  await page.getByRole("button", { name: "43-45" }).click();

  const addResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });

  await page.locator("[data-detail-cart-button]").click();
  expect((await addResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-detail-cart-count]")).toHaveText("1");
  await expect(page.locator("[data-detail-cart-summary]")).toContainText("1 件");
});

test("shows detail recommendations without repeating the current product", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");

  await expect(page.getByRole("heading", { name: "你可能也喜欢" })).toBeVisible();
  await expect(page.locator("[data-detail-recommendation-card]")).toHaveCount(3);

  const recommendationTexts = await page.locator("[data-detail-recommendation-card]").allTextContents();
  expect(recommendationTexts.join(" ")).not.toContain("轻压运动袜");
  await expect(page.locator("[data-detail-recommendation-card]")).toContainText([
    "极简中筒袜",
    "通勤罗口袜",
    "速干训练袜"
  ]);
});

test("keeps detail recommendation links inside the current filter and sort context", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  const recommendationCard = page.locator("[data-detail-recommendation-card]").first();
  await expectLocatorHrefMatch(recommendationCard, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-01", filter: "sport", sort: "price-desc" }
  });

  await recommendationCard.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-01", filter: "sport", sort: "price-desc" }
  });
});

test("navigates to the next product within the preserved detail filter and sort context", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  await expect(page.locator("[data-detail-nav-previous]")).toHaveAttribute("aria-disabled", "true");
  await expectLocatorHrefMatch(page.locator("[data-detail-nav-next]"), {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-04", filter: "sport", sort: "price-desc" }
  });

  await page.locator("[data-detail-nav-next]").click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-04", filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("速干训练袜");
  await expectLocatorHrefMatch(page.locator("[data-detail-nav-previous]"), {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-02", filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-detail-nav-next]")).toHaveAttribute("aria-disabled", "true");
});

test("loads the persisted cart state from backend on page init", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  const [cartResponse] = await Promise.all([
    page.waitForResponse((response) => {
      return response.url().includes("/api/cart") && response.request().method() === "GET";
    }),
    page.goto("/socks-product-list.html")
  ]);

  expect(cartResponse.ok()).toBe(true);
  await expect(page.locator("[data-cart-count]")).toHaveText("3");
  await expect(page.locator("[data-cart-summary]")).toContainText("3 件");
});

test("opens the cart drawer and shows persisted cart item details", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await expect(page.locator("[data-cart-count]")).toHaveText("3");

  await page.getByRole("button", { name: "打开购物车" }).click();

  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
  await expect(page.getByRole("heading", { name: "购物车明细" })).toBeVisible();
  await expect(page.locator("[data-cart-item]")).toHaveCount(2);
  await expect(page.locator("[data-cart-item]").first()).toContainText("轻压运动袜");
  await expect(page.locator("[data-cart-item]").first()).toContainText("43-45");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x2");
  await expect(page.locator("[data-cart-item]").first()).toContainText("¥98");
  await expect(page.locator("[data-cart-item]").nth(1)).toContainText("通勤罗口袜");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("¥187");
  await expect(page.locator("[data-cart-savings]")).toHaveText("-¥54");
  await expect(page.locator("[data-cart-shipping]")).toHaveText("包邮");
  await expect(page.locator("[data-cart-delivery-summary]")).toHaveText("最早送达：2026年7月18日星期六");
  await expect(page.getByRole("button", { name: "去结算" })).toBeEnabled();
  await expect(page.locator("[data-cart-total]")).toHaveText("¥133");
});

test("keeps valid cart item details when the storefront filter hides that product", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const cartItem = page.locator("[data-cart-item]").first();
  const detailLink = page.locator("[data-cart-item-detail-link]").first();

  await expect(cartItem).toContainText("通勤罗口袜");
  await expect(detailLink).toHaveCount(1);
  await expectLocatorHrefMatch(detailLink, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "sport", sort: "price-desc" }
  });
});

test("opens a cart drawer item in the detail view while keeping storefront context", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=daily&sort=price-asc");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const detailLink = page.locator("[data-cart-item-detail-link]").first();
  await expectLocatorHrefMatch(detailLink, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "daily", sort: "price-asc" }
  });

  await detailLink.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "daily", sort: "price-asc" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("通勤罗口袜");
});

test("opens a cart drawer item from the detail view while keeping detail context", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");
  await page.getByRole("button", { name: "打开详情购物车" }).click();

  const detailLink = page.locator("[data-cart-item-detail-link]").first();
  await expectLocatorHrefMatch(detailLink, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "sport", sort: "price-desc" }
  });

  await detailLink.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("通勤罗口袜");
});

test("opens a cart drawer item to the default detail view when no navigation context exists", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await page.getByRole("button", { name: "打开详情购物车" }).click();

  const detailLink = page.locator("[data-cart-item-detail-link]").first();
  await expectLocatorHrefMatch(detailLink, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05" }
  });

  await detailLink.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("通勤罗口袜");
});

test("opens a cart drawer item from stored storefront context when the current detail page has no explicit filter or sort", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=daily&sort=price-asc");
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await page.getByRole("button", { name: "打开详情购物车" }).click();

  const detailLink = page.locator("[data-cart-item-detail-link]").first();
  await expectLocatorHrefMatch(detailLink, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "daily", sort: "price-asc" }
  });

  await detailLink.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-05", filter: "daily", sort: "price-asc" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("通勤罗口袜");
});

test("does not show a cart drawer detail link for orphan cart items", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-missing", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  await expect(page.locator("[data-cart-item]")).toHaveCount(1);
  await expect(page.locator("[data-cart-item-detail-link]")).toHaveCount(0);
});

test("closes the cart drawer from the close button", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "打开购物车" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");

  await page.getByRole("button", { name: "关闭购物车" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "false");
});

test("shows disabled checkout state for an empty cart drawer", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "打开购物车" }).click();

  await expect(page.locator("[data-cart-delivery-summary]")).toHaveText("加入商品后可查看配送时间");
  await expect(page.locator("[data-cart-trust-copy]")).toHaveText("此演示商城使用安全结账流程");
  await expect(page.getByRole("button", { name: "去结算" })).toBeDisabled();
});

test("shows an order confirmation state after checkout and clears the cart", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const checkoutResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/clear") && response.request().method() === "POST";
  });

  await page.getByRole("button", { name: "去结算" }).click();
  expect((await checkoutResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("0");
  await expect(page.locator("[data-cart-summary]")).toContainText("0 件");
  await expect(page.locator("[data-order-confirmation]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "订单已确认" })).toBeVisible();
  await expect(page.locator("[data-order-number]")).toHaveText("SOCK-20260717-001");
  await expect(page.locator("[data-order-items]")).toHaveText("3 件商品");
  await expect(page.locator("[data-order-delivery]")).toHaveText("预计送达: 2026年7月18日星期六");

  const persistedCart = JSON.parse(await fs.readFile(cartFile, "utf8"));
  expect(persistedCart).toEqual({ items: [] });
});

test("clears the old confirmation state after the user adds a new item later", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const checkoutResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/clear") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "去结算" }).click();
  expect((await checkoutResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-order-confirmation]")).toBeVisible();
  await page.getByRole("button", { name: "继续逛逛" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "false");

  const firstCard = page.locator("[data-product-card]").first();
  const addResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });

  await firstCard.locator("[data-cart-button]").click();
  expect((await addResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("1");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await expect(page.locator("[data-order-confirmation]")).toHaveCount(0);
  await expect(page.locator("[data-cart-item]")).toHaveCount(1);
});

test("opens the dedicated order confirmation page from the drawer success state", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const checkoutResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/clear") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "去结算" }).click();
  expect((await checkoutResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-order-confirmation]")).toBeVisible();
  await page.getByRole("button", { name: "查看订单页" }).click();

  await expect(page).toHaveURL(/\/socks-product-list\.html\?view=order$/);
  await expect(page.getByRole("heading", { name: "订单已确认" })).toBeVisible();
  await expect(page.locator("[data-order-page-number]")).toHaveText("SOCK-20260717-001");
  await expect(page.locator("[data-order-page-items]")).toHaveText("3 件商品");
  await expect(page.locator("[data-order-page-delivery]")).toHaveText("2026年7月18日星期六");
});

test("returns from the order page to the latest storefront context", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43-45", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await page.getByRole("button", { name: "去结算" }).click();
  await page.getByRole("button", { name: "查看订单页" }).click();

  const continueShoppingLink = page.locator("[data-order-continue-shopping]");
  await expectLocatorHrefMatch(continueShoppingLink, {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });

  await continueShoppingLink.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });
});

test("shows last-results source copy on the order page when storefront context exists", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43-45", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await page.getByRole("button", { name: "去结算" }).click();
  await page.getByRole("button", { name: "查看订单页" }).click();

  await expect(page.locator("[data-order-source-title]")).toHaveText("返回上一轮浏览结果");
  await expect(page.locator("[data-order-source-copy]")).toContainText("袜子专区");
  await expect(page.locator("[data-order-source-copy]")).toContainText("运动袜");
  await expect(page.locator("[data-order-source-copy]")).toContainText("价格从高到低");
});

test("shows default storefront source copy on the order page when storefront context is missing", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=order");

  await expect(page.locator("[data-order-source-title]")).toHaveText("继续在商城中浏览");
  await expect(page.locator("[data-order-source-copy]")).toHaveText("袜子专区 / 全部商品");
});

test("submits shared header search from order view back into storefront results", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=order");

  const searchResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("q") === "船袜"
      && requestUrl.searchParams.get("filter") === "all"
      && requestUrl.searchParams.get("sort") === "recommended"
      && requestUrl.searchParams.get("locale") === "zh-CN";
  });

  await page.locator("[data-site-search-input]").fill("船袜");
  await page.locator("[data-site-search-submit]").click();
  expect((await searchResponsePromise).ok()).toBe(true);

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { q: "船袜" }
  });
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(page.locator("[data-product-card]").first()).toContainText("云感船袜");
});

test("keeps English cart and order copy after switching locale", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43-45", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.locator('[data-locale-option="en-US"]').click();
  await page.getByRole("button", { name: "Open cart" }).click();

  await expect(page.getByRole("heading", { name: "Cart details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear cart" })).toBeVisible();

  await page.getByRole("button", { name: "Proceed to checkout" }).click();
  await page.getByRole("button", { name: "View order page" }).click();

  await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();
  await expect(page.locator("[data-order-source-title]")).toHaveText("Go back to your last results");
  await expect(page.locator("[data-order-source-copy]")).toHaveText("Socks / Sport Socks / Price high to low");
  await expect(page.locator("[data-order-continue-shopping]")).toHaveText("Continue shopping");
});

test("continue shopping falls back to the default storefront", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=order");

  const continueShoppingLink = page.locator("[data-order-continue-shopping]");
  await expectLocatorHrefMatch(continueShoppingLink, {
    pathname: "/socks-product-list.html"
  });

  await continueShoppingLink.click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html"
  });
});

test("locks body scroll while the cart drawer is open", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect.poll(async () => {
    return page.evaluate(() => window.getComputedStyle(document.body).overflow);
  }).not.toBe("hidden");

  await page.getByRole("button", { name: "打开购物车" }).click();

  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
  await expect.poll(async () => {
    return page.evaluate(() => window.getComputedStyle(document.body).overflow);
  }).toBe("hidden");

  await page.getByRole("button", { name: "关闭购物车" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "false");
  await expect.poll(async () => {
    return page.evaluate(() => window.getComputedStyle(document.body).overflow);
  }).not.toBe("hidden");
});

test("loads products from the backend response instead of inline seed markup", async ({ page }) => {
  const [productsResponse] = await Promise.all([
    page.waitForResponse((response) => {
      return response.url().includes("/api/products") && response.request().method() === "GET";
    }),
    page.goto("/socks-product-list.html")
  ]);

  expect(productsResponse.ok()).toBe(true);
  await expect(page.locator("[data-product-card]")).toHaveCount(6);
});

test("renders multiple socks cards in a three-column desktop grid", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const productCards = page.locator("[data-product-card]");
  await expect(productCards).toHaveCount(6);
  const firstCard = productCards.first();

  await expect(firstCard.locator(".product-card__media")).toBeVisible();
  await expect(firstCard.locator(".product-card__illustration")).toBeVisible();
  await expect(firstCard.locator(".product-card__sock")).toBeVisible();
  await expect(firstCard.locator(".product-card__media")).not.toContainText("SOCKS");
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

test("renders rating, review count, and top rated tag inside the first product card", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await expect(firstCard.locator("[data-rating-band]")).toBeVisible();
  await expect(firstCard.locator("[data-rating-stars]")).toHaveText("★★★★★");
  await expect(firstCard.locator("[data-rating-value]")).toHaveText("4.7");
  await expect(firstCard.locator("[data-review-count]")).toHaveText("1,284 条评价");
  await expect(firstCard.locator("[data-top-rated]")).toHaveText("高评分");
});

test("does not show the top rated tag for products that are not top rated", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const sock05Card = page.locator('[data-product-card][data-product-id="sock-05"]');
  await expect(sock05Card.locator("[data-rating-band]")).toBeVisible();
  await expect(sock05Card.locator("[data-rating-value]")).toHaveText("4.6");
  await expect(sock05Card.locator("[data-review-count]")).toHaveText("973 条评价");
  await expect(sock05Card.locator("[data-top-rated]")).toHaveCount(0);
});

test("keeps the rating band readable on a mobile viewport", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  const ratingBand = firstCard.locator("[data-rating-band]");
  await expect(ratingBand).toBeVisible();

  const ratingMetrics = await ratingBand.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      flexWrap: styles.flexWrap,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight
    };
  });

  expect(ratingMetrics.flexWrap).toBe("nowrap");
  expect(ratingMetrics.scrollWidth).toBeLessThanOrEqual(ratingMetrics.clientWidth + 1);
  expect(ratingMetrics.scrollHeight).toBeLessThanOrEqual(ratingMetrics.clientHeight + 1);

  await page.close();
});

test("renders delivery and stock signals inside the first product card", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await expect(firstCard.locator("[data-commerce-info]")).toBeVisible();
  await expect(firstCard.locator("[data-shipping-label]")).toHaveText("包邮");
  await expect(firstCard.locator("[data-delivery-estimate]")).toHaveText("预计7月19日周日送达");
  await expect(firstCard.locator("[data-stock-label]")).toHaveText("现货充足");
});

test("shows low stock styling only for products marked as low stock", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const sock04Card = page.locator('[data-product-card][data-product-id="sock-04"]');
  const sock05Card = page.locator('[data-product-card][data-product-id="sock-05"]');

  await expect(sock04Card.locator("[data-stock-label]")).toHaveText("仅剩 5 件");
  await expect(sock04Card.locator("[data-stock-label]")).toHaveAttribute("data-low-stock", "true");
  await expect(sock05Card.locator("[data-stock-label]")).toHaveText("现货充足");
  await expect(sock05Card.locator("[data-stock-label]")).toHaveAttribute("data-low-stock", "false");
});

test("keeps the commerce info block readable on a mobile viewport", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("/socks-product-list.html");

  const commerceBlock = page.locator("[data-product-card]").first().locator("[data-commerce-info]");
  await expect(commerceBlock).toBeVisible();

  const commerceMetrics = await commerceBlock.evaluate((node) => {
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight
    };
  });

  expect(commerceMetrics.scrollWidth).toBeLessThanOrEqual(commerceMetrics.clientWidth + 1);
  expect(commerceMetrics.scrollHeight).toBeLessThanOrEqual(commerceMetrics.clientHeight + 1);

  await page.close();
});

test("renders social proof content inside the commerce info block", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const sock02Card = page.locator('[data-product-card][data-product-id="sock-02"]');
  await expect(sock02Card.locator("[data-social-proof]")).toBeVisible();
  await expect(sock02Card.locator("[data-bestseller-badge]")).toHaveText("热卖");
  await expect(sock02Card.locator("[data-recently-bought]")).toHaveText("过去一个月 2K+ 人购买");
});

test("does not show bestseller for recommended products that are not bestsellers", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const sock05Card = page.locator('[data-product-card][data-product-id="sock-05"]');
  await expect(sock05Card.locator("[data-social-proof]")).toBeVisible();
  await expect(sock05Card.locator("[data-recently-bought]")).toHaveText("过去一个月 1K+ 人购买");
  await expect(sock05Card.locator("[data-bestseller-badge]")).toHaveCount(0);
});

test("keeps the social proof row readable on a mobile viewport", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("/socks-product-list.html");

  const socialProof = page.locator('[data-product-card][data-product-id="sock-02"]').locator("[data-social-proof]");
  await expect(socialProof).toBeVisible();

  const socialProofMetrics = await socialProof.evaluate((node) => {
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight
    };
  });

  expect(socialProofMetrics.scrollWidth).toBeLessThanOrEqual(socialProofMetrics.clientWidth + 1);
  expect(socialProofMetrics.scrollHeight).toBeLessThanOrEqual(socialProofMetrics.clientHeight + 1);

  await page.close();
});

test("filters the list by category and updates the result count", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const filterResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("filter") === "sport"
      && requestUrl.searchParams.get("sort") === "recommended";
  });

  await page.getByRole("button", { name: "运动袜" }).click();
  const filterResponse = await filterResponsePromise;

  expect(filterResponse.ok()).toBe(true);
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.locator("[data-result-count]")).toHaveText("共 2 件商品");
  await expect(page.getByText("轻压运动袜")).toBeVisible();
  await expect(page.getByText("速干训练袜")).toBeVisible();
});

test("submits q through the shared header search and filters the storefront results", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const searchResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("q") === "运动"
      && requestUrl.searchParams.get("filter") === "all"
      && requestUrl.searchParams.get("sort") === "recommended"
      && requestUrl.searchParams.get("locale") === "zh-CN";
  });

  await page.locator("[data-site-search-input]").fill("运动");
  await page.locator("[data-site-search-submit]").click();
  expect((await searchResponsePromise).ok()).toBe(true);

  await expect(page).toHaveURL(/q=%E8%BF%90%E5%8A%A8/);
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.getByText("轻压运动袜")).toBeVisible();
  await expect(page.getByText("速干训练袜")).toBeVisible();
});

test("sorts the visible products by price from low to high", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const sortResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("filter") === "all"
      && requestUrl.searchParams.get("sort") === "price-asc";
  });

  await page.getByRole("button", { name: "价格从低到高" }).click();
  const sortResponse = await sortResponsePromise;

  expect(sortResponse.ok()).toBe(true);
  await expect(page.locator("[data-product-card]").first().getByText("柔棉短袜")).toBeVisible();
});

test("keeps recommended products first in the default view and inside filtered results", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const allProductTitles = await page.locator(".product-card__title").allTextContents();
  expect(allProductTitles.slice(0, 3)).toEqual(["极简中筒袜", "轻压运动袜", "通勤罗口袜"]);

  await page.getByRole("button", { name: "日常袜" }).click();
  await expect(page.locator("[data-product-card]").first().getByText("通勤罗口袜")).toBeVisible();
});

test("sorts products by price descending and newest with full visible order", async ({ page }) => {
  await page.goto("/socks-product-list.html");

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

test("keeps list interactions working while products are served over http api", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "运动袜" }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(2);

  await page.getByRole("button", { name: "价格从高到低" }).click();
  await expect(page.locator(".product-card__title")).toHaveText([
    "轻压运动袜",
    "速干训练袜"
  ]);
});

test("keeps size selection scoped to the clicked product card", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  const secondCard = page.locator("[data-product-card]").nth(1);

  await secondCard.getByRole("button", { name: "43-45" }).click();

  await expect(secondCard.getByRole("button", { name: "43-45" })).toHaveAttribute("aria-pressed", "true");
  await expect(secondCard.locator('.product-card__size[aria-pressed="true"]')).toHaveCount(1);
  await expect(firstCard.getByRole("button", { name: "35-38" })).toHaveAttribute("aria-pressed", "true");
});

test("shows cart feedback per card and restores it after the timer", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-07-16T08:00:00") });
  await page.goto("/socks-product-list.html");
  await page.clock.pauseAt(new Date("2026-07-16T10:00:00"));

  const firstButton = page.locator("[data-product-card]").first().locator("[data-cart-button]");
  const secondButton = page.locator("[data-product-card]").nth(1).locator("[data-cart-button]");

  await secondButton.click();

  await expect(secondButton).toHaveText("已加入购物车");
  await expect(firstButton).toHaveText("加入购物车");

  await page.clock.runFor(1500);
  await expect(secondButton).toHaveText("加入购物车");
});

test("posts the selected size to the backend cart api", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await firstCard.getByRole("button", { name: "43-45" }).click();

  const responsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });

  await firstCard.locator("[data-cart-button]").click();
  const response = await responsePromise;

  expect(response.ok()).toBe(true);
  expect(JSON.parse(response.request().postData())).toEqual({
    productId: "sock-01",
    size: "43-45",
    quantity: 1
  });
});

test("updates the visible cart state after repeated add-to-cart actions", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await firstCard.getByRole("button", { name: "43-45" }).click();
  await expect(page.locator("[data-cart-count]")).toHaveText("0");

  const firstAddResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });
  await firstCard.locator("[data-cart-button]").click();
  expect((await firstAddResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("1");
  await expect(page.locator("[data-cart-summary]")).toContainText("1 件");

  const secondAddResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });
  await firstCard.locator("[data-cart-button]").click();
  expect((await secondAddResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("2");
  await expect(page.locator("[data-cart-summary]")).toContainText("2 件");

  await page.getByRole("button", { name: "打开购物车" }).click();
  await expect(page.locator("[data-cart-item]")).toHaveCount(1);
  await expect(page.locator("[data-cart-item]").first()).toContainText("极简中筒袜");
  await expect(page.locator("[data-cart-item]").first()).toContainText("43-45");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x2");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥78");
});

test("clears the visible cart state and persisted cart data from the page action", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");

  await expect(page.locator("[data-cart-count]")).toHaveText("3");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await expect(page.locator("[data-cart-item]")).toHaveCount(2);

  const clearResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/clear") && response.request().method() === "POST";
  });

  await page.getByRole("button", { name: "清空购物车" }).click();
  expect((await clearResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("0");
  await expect(page.locator("[data-cart-summary]")).toContainText("0 件");
  await expect(page.locator("[data-cart-empty-state]")).toContainText("购物车还是空的");

  const persistedCart = JSON.parse(await fs.readFile(cartFile, "utf8"));
  expect(persistedCart).toEqual({ items: [] });
});

test("updates cart item quantity from drawer controls and refreshes totals", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  await expect(page.locator("[data-cart-subtotal]")).toHaveText("¥187");
  await expect(page.locator("[data-cart-savings]")).toHaveText("-¥54");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥133");

  const increaseResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "PATCH";
  });
  await page.getByRole("button", { name: "增加 轻压运动袜 数量" }).click();
  expect((await increaseResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("4");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x3");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("¥256");
  await expect(page.locator("[data-cart-savings]")).toHaveText("-¥74");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥182");

  const decreaseResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "PATCH";
  });
  await page.getByRole("button", { name: "减少 轻压运动袜 数量" }).click();
  expect((await decreaseResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("3");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x2");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("¥187");
  await expect(page.locator("[data-cart-savings]")).toHaveText("-¥54");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥133");
});

test("disables drawer controls while a cart quantity update is pending", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  let releasePatchRequest;
  await page.route("**/api/cart/items", async (route) => {
    if (route.request().method() !== "PATCH" || releasePatchRequest) {
      await route.continue();
      return;
    }

    await new Promise((resolve) => {
      releasePatchRequest = async () => {
        await route.continue();
        resolve();
      };
    });
  });

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const increaseButton = page.getByRole("button", { name: "增加 轻压运动袜 数量" });
  const decreaseButton = page.getByRole("button", { name: "减少 轻压运动袜 数量" });
  const removeButton = page.getByRole("button", { name: "移除 轻压运动袜" });
  const clearButton = page.getByRole("button", { name: "清空购物车" });
  const checkoutButton = page.getByRole("button", { name: "去结算" });

  const clickPromise = increaseButton.click();

  await expect.poll(() => typeof releasePatchRequest).toBe("function");
  await expect(increaseButton).toBeDisabled();
  await expect(decreaseButton).toBeDisabled();
  await expect(removeButton).toBeDisabled();
  await expect(clearButton).toBeDisabled();
  await expect(checkoutButton).toBeDisabled();

  await releasePatchRequest();
  await clickPromise;

  await expect(page.locator("[data-cart-count]")).toHaveText("4");
  await expect(page.getByRole("button", { name: "增加 轻压运动袜 数量" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "减少 轻压运动袜 数量" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "移除 轻压运动袜" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "清空购物车" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "去结算" })).toBeEnabled();
});

test("removes a cart item from the drawer without clearing the rest", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43-45", quantity: 2 },
      { productId: "sock-05", size: "39-42", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const removeResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "DELETE";
  });
  await page.getByRole("button", { name: "移除 轻压运动袜" }).click();
  expect((await removeResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("1");
  await expect(page.locator("[data-cart-item]")).toHaveCount(1);
  await expect(page.locator("[data-cart-item]").first()).toContainText("通勤罗口袜");
  await expect(page.locator("[data-cart-subtotal]")).toHaveText("¥49");
  await expect(page.locator("[data-cart-savings]")).toHaveText("-¥14");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥35");
});

test("shows an empty state when a filter has no products", async ({ page }) => {
  await page.route("**/api/products?*", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.searchParams.get("filter") === "business") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          items: [],
          meta: {
            filter: "business",
            sort: requestUrl.searchParams.get("sort") || "recommended",
            count: 0
          }
        })
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/socks-product-list.html");

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
  await page.goto("/socks-product-list.html");

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

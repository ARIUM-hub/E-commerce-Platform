const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const cartFile = path.join(__dirname, "fixtures", "test-data", "cart.json");
const ordersFile = path.join(__dirname, "fixtures", "test-data", "orders.json");
const usersFile = path.join(__dirname, "fixtures", "test-data", "users.json");
const sessionsFile = path.join(__dirname, "fixtures", "test-data", "sessions.json");
const userCartsFile = path.join(__dirname, "fixtures", "test-data", "user-carts.json");

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

async function fillCheckoutForm(page) {
  await page.locator('[data-checkout-field="customer.name"]').fill("Alex Chen");
  await page.locator('[data-checkout-field="customer.contact"]').fill("alex@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("100 Demo Street");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("Seattle");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("WA");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("98101");
}

async function registerFromUi(page) {
  await page.goto("/socks-product-list.html?view=auth&mode=register");
  await page.locator('[data-auth-field="name"]').fill("Alex Chen");
  await page.locator('[data-auth-field="email"]').fill("alex@example.com");
  await page.locator('[data-auth-field="password"]').fill("demo1234");
  await page.locator("[data-auth-submit]").click();
  await expect(page.locator("[data-auth-user-name]")).toHaveText("Alex Chen");
}

test.use({ viewport: { width: 1280, height: 960 } });

test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(ordersFile, `${JSON.stringify({ orders: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(usersFile, `${JSON.stringify({ users: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(sessionsFile, `${JSON.stringify({ sessions: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(userCartsFile, `${JSON.stringify({ carts: [] }, null, 2)}\n`, "utf8");
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
  await expect(page.locator("[data-result-count]")).toHaveText("共 12 件商品");
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

test("opens the trust center from the header help link", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.locator("[data-site-help-link]").click();

  await expect(page).toHaveURL(/view=support&section=faq/);
  await expect(page.locator("[data-support-view]")).toBeVisible();
  await expect(page.locator("[data-support-title]")).toHaveText("帮助中心");
});

test("opens returns policy from the header returns link", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.locator("[data-site-returns-link]").click();

  await expect(page).toHaveURL(/view=support&section=returns/);
  await expect(page.locator("[data-support-section='returns']")).toHaveClass(/is-active/);
  await expect(page.locator("[data-support-current-title]")).toHaveText("退换政策");
});

test("footer policy links route to trust center sections", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.locator("[data-footer-support-link='privacy']").click();

  await expect(page).toHaveURL(/view=support&section=privacy/);
  await expect(page.locator("[data-support-current-title]")).toHaveText("隐私政策");
});

test("expands and collapses trust center FAQ items", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=faq");

  const firstQuestion = page.locator("[data-support-faq-question]").first();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
  await firstQuestion.click();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  await firstQuestion.press("Enter");
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
});

test("validates trust center contact form", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=contact");
  await page.locator("[data-support-contact-submit]").click();

  await expect(page.locator("[data-support-contact-error='name']")).toHaveText("请填写姓名");
});

test("submits trust center contact form and shows ticket number", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=contact");
  await page.locator("[data-support-contact-field='name']").fill("演示买家");
  await page.locator("[data-support-contact-field='contact']").fill("buyer@example.com");
  await page.locator("[data-support-contact-field='topic']").selectOption("returns");
  await page.locator("[data-support-contact-field='message']").fill("想了解未穿着袜子的退换流程。");
  await page.locator("[data-support-contact-submit]").click();

  await expect(page.locator("[data-support-ticket]")).toBeVisible();
  await expect(page.locator("[data-support-ticket]")).toContainText(/SUP-\d{8}-\d{4}/);
});

test("shows login and register entry points when the visitor is anonymous", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect(page.locator("[data-auth-login-link]")).toBeVisible();
  await expect(page.locator("[data-auth-register-link]")).toBeVisible();
  await expect(page.locator("[data-auth-user-name]")).toHaveCount(0);
});

test("registers from the auth view and updates the storefront header", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=auth&mode=register");

  await page.locator('[data-auth-field="name"]').fill("Alex Chen");
  await page.locator('[data-auth-field="email"]').fill("alex@example.com");
  await page.locator('[data-auth-field="password"]').fill("demo1234");

  const registerResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/register") && response.request().method() === "POST";
  });
  await page.locator("[data-auth-submit]").click();
  expect((await registerResponse).status()).toBe(201);

  await expect(page.locator("[data-auth-user-name]")).toHaveText("Alex Chen");
  await expect(page.locator("[data-auth-logout]")).toBeVisible();
});

test("logs out from the storefront header", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=auth&mode=register");
  await page.locator('[data-auth-field="name"]').fill("Alex Chen");
  await page.locator('[data-auth-field="email"]').fill("alex@example.com");
  await page.locator('[data-auth-field="password"]').fill("demo1234");
  await page.locator("[data-auth-submit]").click();

  const logoutResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/logout") && response.request().method() === "POST";
  });
  await page.locator("[data-auth-logout]").click();
  expect((await logoutResponse).ok()).toBe(true);

  await expect(page.locator("[data-auth-login-link]")).toBeVisible();
  await expect(page.locator("[data-auth-register-link]")).toBeVisible();
});

test("manages saved addresses from the addresses view", async ({ page }) => {
  await registerFromUi(page);
  await page.goto("/socks-product-list.html?view=addresses");

  await page.locator('[data-address-field="name"]').fill("Alex Chen");
  await page.locator('[data-address-field="contact"]').fill("alex@example.com");
  await page.locator('[data-address-field="address"]').fill("100 Demo Street");
  await page.locator('[data-address-field="city"]').fill("Seattle");
  await page.locator('[data-address-field="region"]').fill("WA");
  await page.locator('[data-address-field="postalCode"]').fill("98101");

  const createAddressResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/me/addresses") && response.request().method() === "POST";
  });
  await page.locator("[data-address-submit]").click();
  expect((await createAddressResponse).status()).toBe(201);

  await expect(page.locator("[data-address-card]")).toHaveCount(1);
  await expect(page.locator("[data-address-card]")).toContainText("100 Demo Street");
  await expect(page.locator("[data-address-default-badge]")).toBeVisible();
});

test("uses a default saved address during checkout", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");
  await registerFromUi(page);
  await page.goto("/socks-product-list.html?view=addresses");
  await page.locator('[data-address-field="name"]').fill("Alex Chen");
  await page.locator('[data-address-field="contact"]').fill("alex@example.com");
  await page.locator('[data-address-field="address"]').fill("100 Demo Street");
  await page.locator('[data-address-field="city"]').fill("Seattle");
  await page.locator('[data-address-field="region"]').fill("WA");
  await page.locator('[data-address-field="postalCode"]').fill("98101");
  await page.locator("[data-address-submit]").click();

  await page.goto("/socks-product-list.html?view=checkout");
  await expect(page.locator("[data-checkout-address-option]")).toContainText("100 Demo Street");

  const orderResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/orders") && response.request().method() === "POST";
  });
  await page.locator("[data-checkout-submit]").click();
  expect((await orderResponse).status()).toBe(201);

  await expect(page).toHaveURL(/view=order&id=SOCK-/);
  await expect(page.locator("[data-order-address]")).toContainText("100 Demo Street");
});

test("shows the logged-in user's order history after checkout", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");
  await registerFromUi(page);
  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator('[data-checkout-field="customer.name"]').fill("Alex Chen");
  await page.locator('[data-checkout-field="customer.contact"]').fill("alex@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("100 Demo Street");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("Seattle");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("WA");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("98101");
  await page.locator("[data-checkout-submit]").click();

  await page.goto("/socks-product-list.html?view=orders");
  await expect(page.locator("[data-order-history-card]")).toHaveCount(1);
  await expect(page.locator("[data-order-history-card]")).toContainText("SOCK-");
  await expect(page.locator("[data-order-history-card]")).toContainText(/Minimal Crew Socks|极简中筒袜/);
});

test("requires login before showing order history", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=orders");

  await expect(page.locator("[data-auth-required]")).toContainText("sign in");
});

test("opens the checkout view from the cart drawer with a live cart summary", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 2 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.locator("[data-cart-toggle]").click();
  await page.locator("[data-cart-checkout]").click();

  await expect(page).toHaveURL(/view=checkout/);
  await expect(page.locator("[data-checkout-view]")).toBeVisible();
  await expect(page.locator("[data-checkout-form]")).toBeVisible();
  await expect(page.locator("[data-checkout-summary-item]")).toHaveCount(1);
  await expect(page.locator("[data-checkout-summary-quantity]")).toHaveText("x2");
});

test("shows checkout validation errors without creating an order", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });

  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator("[data-checkout-submit]").click();

  await expect(page.locator("[data-checkout-form-error]")).toContainText(
    "Complete the shipping information"
  );
  await expect(page).toHaveURL(/view=checkout/);
});

test("submits checkout, clears cart, and opens the persisted order detail", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 2 }]
  }, null, 2)}\n`, "utf8");
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });

  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator('[data-checkout-field="customer.name"]').fill("Alex Chen");
  await page.locator('[data-checkout-field="customer.contact"]').fill("alex@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("100 Demo Street");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("Seattle");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("WA");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("98101");

  const orderResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/orders") && response.request().method() === "POST";
  });
  await page.locator("[data-checkout-submit]").click();
  expect((await orderResponse).status()).toBe(201);

  await expect(page).toHaveURL(/view=order&id=SOCK-/);
  await expect(page.locator("[data-order-status]")).toHaveText("Pending payment");
  await expect(page.locator("[data-order-items]")).toContainText("Minimal Crew Socks");
  await expect(page.locator("[data-cart-count]")).toHaveText("0");

  await page.reload();
  await expect(page.locator("[data-order-status]")).toHaveText("Pending payment");
  await expect(page.locator("[data-order-items]")).toContainText("Minimal Crew Socks");
});

test("advances persisted order status from the order detail page", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });

  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator('[data-checkout-field="customer.name"]').fill("Alex Chen");
  await page.locator('[data-checkout-field="customer.contact"]').fill("alex@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("100 Demo Street");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("Seattle");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("WA");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("98101");
  await page.locator("[data-checkout-submit]").click();

  await expect(page.locator("[data-order-status]")).toHaveText("Pending payment");

  await page.locator('[data-order-status-action][data-next-status="paid"]').click();
  await expect(page.locator("[data-order-status]")).toHaveText("Paid");

  await page.locator('[data-order-status-action][data-next-status="processing"]').click();
  await expect(page.locator("[data-order-status]")).toHaveText("Processing");

  await page.locator('[data-order-status-action][data-next-status="shipped"]').click();
  await expect(page.locator("[data-order-status]")).toHaveText("Shipped");

  await page.locator('[data-order-status-action][data-next-status="delivered"]').click();
  await expect(page.locator("[data-order-status]")).toHaveText("Delivered");
  await expect(page.locator("[data-order-timeline]")).toContainText("Delivered");
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
  await expect(page.locator("[data-result-count]")).toHaveText("12 products");
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
  await expect(page.locator("[data-product-card]")).toHaveCount(4);
  await expect(page.locator("[data-product-card]").first().getByText("厚底毛圈运动袜")).toBeVisible();

  await page.locator("[data-product-card]").first().locator("[data-product-detail-link]").click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-08", filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-detail-page-title]")).toHaveText("厚底毛圈运动袜");
  await expect(page.locator("[data-detail-page-price]")).toHaveText("¥55");
  await expectLocatorHrefMatch(page.locator("[data-detail-back-link]"), {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });

  await page.locator("[data-detail-back-link]").click();

  await expectPageUrlMatch(page, {
    pathname: "/socks-product-list.html",
    searchParams: { filter: "sport", sort: "price-desc" }
  });
  await expect(page.locator("[data-product-card]")).toHaveCount(4);
  await expect(page.locator("[data-product-card]").first().getByText("厚底毛圈运动袜")).toBeVisible();
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
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
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
  await expect(page.locator("[data-detail-size]")).toHaveCount(7);
  await page.getByRole("button", { name: "43" }).click();

  const addResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });

  await page.locator("[data-detail-cart-button]").click();
  expect((await addResponsePromise).ok()).toBe(true);

  await expect(page.locator("[data-detail-cart-count]")).toHaveText("1");
  await expect(page.locator("[data-detail-cart-summary]")).toContainText("1 件");
});

test("shows selected detail sizes and quantities after adding from the detail page", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-04");

  const detailRoot = page.locator("[data-detail-product-root]");
  const detailAddButton = detailRoot.locator("[data-detail-cart-button]");
  const detailFeedbackButton = detailRoot.locator("[data-cart-feedback-button]");

  await expect(detailRoot.locator("[data-detail-size]")).toHaveCount(7);
  await expect(detailRoot.getByRole("button", { name: "39" })).toHaveAttribute("aria-pressed", "true");
  await expect(detailAddButton).toHaveCount(1);
  await expect(detailFeedbackButton).toHaveCount(0);

  await detailRoot.getByRole("button", { name: "43" }).click();
  await detailAddButton.click();

  await expect(detailAddButton).toHaveText("加入购物车");
  await expect(detailFeedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+1）");
  await expect(detailRoot.locator("[data-cart-feedback-size]")).toHaveText(["43 x1"]);

  await detailRoot.getByRole("button", { name: "39" }).click();
  await detailAddButton.click();

  await expect(detailFeedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+2）");
  await expect(detailRoot.locator("[data-cart-feedback-size]")).toHaveText(["43 x1", "39 x1"]);
});

test("renders gallery color material and size chart on the detail page", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-01&locale=en-US");

  await expect(page.locator("[data-product-gallery]")).toBeVisible();
  await expect(page.locator("[data-product-gallery-image]")).toHaveAttribute("alt", /socks/i);
  await expect(page.locator("[data-product-gallery-thumb]")).toHaveCount(2);
  await expect(page.locator("[data-product-colors]")).toContainText(/Black|White|Gray/);
  await expect(page.locator("[data-product-materials]")).toContainText(/Cotton|Spandex/);
  await expect(page.locator("[data-size-chart-row]")).toHaveCount(11);
});

test("shows selected SKU stock state on detail size selection", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-01&locale=en-US");

  await page.locator('[data-detail-size="43"]').click();
  await expect(page.locator("[data-selected-sku-stock]")).toContainText(/43|Only/);
  await expect(page.locator('[data-detail-size="45"]')).toBeDisabled();
});

test("keeps add-to-cart size feedback synced between storefront and detail views", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator('[data-product-card][data-product-id="sock-01"]');
  await firstCard.getByRole("button", { name: "43" }).click();
  await firstCard.locator("[data-cart-button]").click();
  await expect(firstCard.locator("[data-cart-feedback-size]")).toHaveText(["43 x1"]);

  await firstCard.locator("[data-product-detail-link]").click();

  const detailRoot = page.locator("[data-detail-product-root]");
  await expect(detailRoot.locator("[data-cart-feedback-summary]")).toHaveText("已选（+1）");
  await expect(detailRoot.locator("[data-cart-feedback-size]")).toHaveText(["43 x1"]);

  await detailRoot.getByRole("button", { name: "39" }).click();
  await detailRoot.locator("[data-detail-cart-button]").click();

  await expect(detailRoot.locator("[data-cart-feedback-summary]")).toHaveText("已选（+2）");
  await expect(detailRoot.locator("[data-cart-feedback-size]")).toHaveText(["43 x1", "39 x1"]);

  await page.locator("[data-detail-back-link]").click();
  await expect(firstCard.locator("[data-cart-feedback-summary]")).toHaveText("已选（+2）");
  await expect(firstCard.locator("[data-cart-feedback-size]")).toHaveText(["43 x1", "39 x1"]);
});

test("restores persisted size feedback when the detail page is reopened", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-01", size: "43", quantity: 1 },
      { productId: "sock-01", size: "39", quantity: 2 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=detail&id=sock-01");

  const detailRoot = page.locator("[data-detail-product-root]");
  await expect(detailRoot.locator("[data-cart-feedback-summary]")).toHaveText("已选（+3）");
  await expect(detailRoot.locator("[data-cart-feedback-size]")).toHaveText(["43 x1", "39 x2"]);

  await page.locator("[data-detail-back-link]").click();
  await page.locator('[data-product-card][data-product-id="sock-01"]').locator("[data-product-detail-link]").click();

  await expect(detailRoot.locator("[data-cart-feedback-summary]")).toHaveText("已选（+3）");
  await expect(detailRoot.locator("[data-cart-feedback-size]")).toHaveText(["43 x1", "39 x2"]);
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

  await expectLocatorHrefMatch(page.locator("[data-detail-nav-previous]"), {
    pathname: "/socks-product-list.html",
    searchParams: { view: "detail", id: "sock-11", filter: "sport", sort: "price-desc" }
  });
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
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
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
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await expect(page.locator("[data-cart-count]")).toHaveText("3");

  await page.getByRole("button", { name: "打开购物车" }).click();

  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
  await expect(page.getByRole("heading", { name: "购物车明细" })).toBeVisible();
  await expect(page.locator("[data-cart-item]")).toHaveCount(2);
  await expect(page.locator("[data-cart-item]").first()).toContainText("轻压运动袜");
  await expect(page.locator("[data-cart-item]").first()).toContainText("43");
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
    items: [{ productId: "sock-05", size: "39", quantity: 1 }]
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
    items: [{ productId: "sock-05", size: "39", quantity: 1 }]
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
    items: [{ productId: "sock-05", size: "39", quantity: 1 }]
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
    items: [{ productId: "sock-05", size: "39", quantity: 1 }]
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
    items: [{ productId: "sock-05", size: "39", quantity: 1 }]
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
    items: [{ productId: "sock-missing", size: "39", quantity: 1 }]
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

test.skip("shows an order confirmation state after checkout and clears the cart", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
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

test.skip("clears the old confirmation state after the user adds a new item later", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-05", size: "39", quantity: 1 }
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

test.skip("opens the dedicated order confirmation page from the drawer success state", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
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

test.skip("returns from the order page to the latest storefront context", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43", quantity: 1 }]
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

test.skip("shows last-results source copy on the order page when storefront context exists", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43", quantity: 1 }]
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
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.locator("[data-product-card]").first()).toContainText("云感船袜");
});

test("keeps English cart and order copy after switching locale", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.locator('[data-locale-option="en-US"]').click();
  await page.getByRole("button", { name: "Open cart" }).click();

  await expect(page.getByRole("heading", { name: "Cart details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear cart" })).toBeVisible();

  await page.getByRole("button", { name: "Proceed to checkout" }).click();
  await expect(page).toHaveURL(/view=checkout/);

  await fillCheckoutForm(page);
  const orderResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/orders") && response.request().method() === "POST";
  });
  await page.locator("[data-checkout-submit]").click();
  expect((await orderResponse).status()).toBe(201);

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
  await expect(page.locator("[data-result-count]")).toHaveText("共 12 件商品");
  await expect(page.locator("[data-product-card]")).toHaveCount(8);
});

test("renders multiple socks cards in a three-column desktop grid", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const productCards = page.locator("[data-product-card]");
  await expect(productCards).toHaveCount(8);
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
  await page.locator("[data-load-more-products]").click();
  await expect(productCards).toHaveCount(12);
  await expect(page.locator('[data-product-card][data-product-id="sock-12"]')).toContainText("轻薄透气袜");

  const gridColumns = await page.locator("[data-product-grid]").evaluate((node) => {
    return window.getComputedStyle(node).gridTemplateColumns.split(" ").length;
  });

  expect(gridColumns).toBe(3);
});

test("shows all products on a clean storefront url even after a stored filtered context", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.evaluate(() => {
    window.sessionStorage.setItem(
      "demoNavigationContext",
      JSON.stringify({
        storefrontHref: "/socks-product-list.html?filter=sport&q=%E9%80%9F%E5%B9%B2",
        filter: "sport",
        sort: "recommended",
        query: "速干"
      })
    );
  });

  await page.goto("/socks-product-list.html");

  await expect(page.locator("[data-result-count]")).toHaveText("共 12 件商品");
  await expect(page.locator("[data-product-card]")).toHaveCount(8);
  await expect(page.locator("[data-site-search-input]")).toHaveValue("");
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

test("renders SKU-level low-stock and sold-out size states on product cards", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const card = page.locator('[data-product-card][data-product-id="sock-01"]');
  await expect(card.locator('[data-size="43"]')).toHaveAttribute("data-low-stock", "true");
  await expect(card.locator('[data-size="45"]')).toBeDisabled();
  await expect(card.locator("[data-sku-stock-summary]")).toContainText(/43|仅剩|Only/);
});

test("does not select sold-out SKU sizes from product cards", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const card = page.locator('[data-product-card][data-product-id="sock-01"]');
  await expect(card.locator('[data-size="35"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator('[data-size="45"]')).toBeDisabled();
  await card.locator('[data-size="45"]').click({ force: true });

  await expect(card.locator('[data-size="35"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator('[data-size="45"]')).toHaveAttribute("aria-pressed", "false");
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

test("shows marketing campaigns and applies a coupon in the cart drawer", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect(page.locator("[data-marketing-strip]")).toContainText("SOCK10");
  const sock01Card = page.locator('[data-product-card][data-product-id="sock-01"]');
  await sock01Card.locator('[data-size="43"]').click();
  await sock01Card.locator("[data-cart-button]").click();
  await expect(page.locator("[data-cart-count]")).toHaveText("1");
  await sock01Card.locator("[data-cart-button]").click();
  await expect(page.locator("[data-cart-count]")).toHaveText("2");
  await page.locator("[data-cart-toggle]").click();

  await expect(page.locator("[data-threshold-progress]")).toContainText(/还差|Need/);
  await page.locator("[data-coupon-input]").fill("SOCK10");
  await page.locator("[data-coupon-apply]").click();
  await expect(page.locator("[data-applied-coupon]")).toContainText("SOCK10");
  await expect(page.locator("[data-cart-coupon-discount]")).toHaveText("-¥10");
});

test("adds a bundle from the detail page and shows recently viewed products", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");

  await expect(page.locator("[data-bundle-card]")).toContainText(/组合|Bundle/);
  await page.locator("[data-add-bundle]").click();
  await expect(page.locator("[data-detail-cart-count]")).toHaveText("2");

  await page.goto("/socks-product-list.html?view=detail&id=sock-01");
  await expect(page.locator("[data-detail-page-title]")).toContainText(/极简|Minimal/);
  await page.goto("/socks-product-list.html");
  await expect(page.locator("[data-recently-viewed]")).toBeVisible();
  await expect(page.locator("[data-recently-viewed]")).toContainText(/sock-01|极简|Minimal/);
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
  await expect(page.locator("[data-product-card]")).toHaveCount(4);
  await expect(page.locator("[data-result-count]")).toHaveText("共 4 件商品");
  await expect(page.getByText("轻压运动袜")).toBeVisible();
  await expect(page.getByText("速干训练袜")).toBeVisible();
  await expect(page.getByText("厚底毛圈运动袜")).toBeVisible();
  await expect(page.getByText("夜跑反光运动袜")).toBeVisible();
});

test("applies advanced filters from the storefront url", async ({ page }) => {
  await page.goto("/socks-product-list.html?minPrice=40&maxPrice=50&size=43&stock=in-stock&ratingMin=4.5");

  await expect(page.locator("[data-active-filter-chip]")).toContainText([
    "¥40 - ¥50",
    "43",
    "in-stock",
    "4.5+"
  ]);
  await expect(page.locator("[data-product-card]")).not.toHaveCount(0);
  await expect(page.locator("[data-product-card]").first().locator("[data-size='43']")).toBeVisible();
});

test("changes price and size filters from the storefront controls", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.locator("[data-price-min]").fill("40");
  await page.locator("[data-price-max]").fill("50");
  await page.locator("[data-price-apply]").click();
  await expect(page).toHaveURL(/minPrice=40/);
  await expect(page).toHaveURL(/maxPrice=50/);

  await page.locator('[data-size-filter="43"]').click();
  await expect(page).toHaveURL(/size=43/);
  await expect(page.locator("[data-active-filter-chip]")).toContainText(["¥40 - ¥50", "43"]);
});

test("loads more products without replacing the first page", async ({ page }) => {
  await page.goto("/socks-product-list.html?pageSize=5");
  await expect(page.locator("[data-product-card]")).toHaveCount(5);

  const firstProductId = await page.locator("[data-product-card]").first().getAttribute("data-product-id");
  await page.locator("[data-load-more-products]").click();

  await expect(page.locator("[data-product-card]")).toHaveCount(10);
  await expect(page.locator("[data-product-card]").first()).toHaveAttribute("data-product-id", firstProductId);
});

test("shows no-result recommendations and recovery actions", async ({ page }) => {
  await page.goto("/socks-product-list.html?q=not-a-real-sock-query&maxPrice=1");

  await expect(page.locator("[data-no-results]")).toBeVisible();
  await expect(page.locator("[data-no-results-title]")).toContainText(/没有|No/);
  await expect(page.locator("[data-recommendation-card]")).not.toHaveCount(0);

  await page.locator("[data-clear-all-filters]").click();
  await expect(page).not.toHaveURL(/maxPrice=1/);
  await expect(page.locator("[data-product-card]")).not.toHaveCount(0);
});

test("preserves advanced filters when opening product detail and returning", async ({ page }) => {
  await page.goto("/socks-product-list.html?minPrice=40&maxPrice=60&size=43&stock=in-stock&ratingMin=4.5");

  await page.locator("[data-product-card]").first().locator("[data-product-detail-link]").click();
  await expect(page).toHaveURL(/view=detail/);
  await expect(page).toHaveURL(/minPrice=40/);
  await expect(page).toHaveURL(/size=43/);

  await page.locator("[data-detail-back-link]").click();
  await expect(page).toHaveURL(/minPrice=40/);
  await expect(page).toHaveURL(/size=43/);
  await expect(page.locator("[data-active-filter-chip]")).toContainText(["¥40 - ¥60", "43"]);
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
  await expect(page.locator("[data-product-card]")).toHaveCount(4);
  await expect(page.getByText("轻压运动袜")).toBeVisible();
  await expect(page.getByText("速干训练袜")).toBeVisible();
  await expect(page.getByText("厚底毛圈运动袜")).toBeVisible();
  await expect(page.getByText("夜跑反光运动袜")).toBeVisible();
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
    "厚底毛圈运动袜",
    "夜跑反光运动袜",
    "轻压运动袜",
    "速干训练袜",
    "商务黑中筒袜",
    "极简中筒袜",
    "通勤罗口袜",
    "抗菌柔棉短袜",
    "防滑隐形船袜",
    "云感船袜",
    "轻薄透气袜",
    "柔棉短袜"
  ]);

  await page.getByRole("button", { name: "最新上架" }).click();
  await expect(page.locator(".product-card__title")).toHaveText([
    "极简中筒袜",
    "轻压运动袜",
    "速干训练袜",
    "通勤罗口袜",
    "云感船袜",
    "柔棉短袜",
    "商务黑中筒袜",
    "厚底毛圈运动袜",
    "抗菌柔棉短袜",
    "防滑隐形船袜",
    "夜跑反光运动袜",
    "轻薄透气袜"
  ]);
});

test("keeps list interactions working while products are served over http api", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "运动袜" }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(4);

  await page.getByRole("button", { name: "价格从高到低" }).click();
  await expect(page.locator(".product-card__title")).toHaveText([
    "厚底毛圈运动袜",
    "夜跑反光运动袜",
    "轻压运动袜",
    "速干训练袜"
  ]);
});

test("keeps size selection scoped to the clicked product card", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  const secondCard = page.locator("[data-product-card]").nth(1);

  await secondCard.locator("[data-size]", { hasText: "43" }).click();

  await expect(secondCard.getByRole("button", { name: "43" })).toHaveAttribute("aria-pressed", "true");
  await expect(secondCard.locator('.product-card__size[aria-pressed="true"]')).toHaveCount(1);
  await expect(firstCard.getByRole("button", { name: "35" })).toHaveAttribute("aria-pressed", "true");
});

test("splits cart action into add and persistent feedback buttons after adding", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-07-16T08:00:00") });
  await page.goto("/socks-product-list.html");
  await page.clock.pauseAt(new Date("2026-07-16T10:00:00"));

  const firstCard = page.locator("[data-product-card]").first();
  const secondCard = page.locator("[data-product-card]").nth(1);
  const firstButton = firstCard.locator("[data-cart-button]");
  const secondButton = secondCard.locator("[data-cart-button]");
  const secondFeedbackButton = secondCard.locator("[data-cart-feedback-button]");

  const fullButtonBox = await secondButton.boundingBox();
  expect(fullButtonBox).not.toBeNull();

  await expect(secondCard.locator("[data-cart-button]")).toHaveCount(1);
  await expect(secondFeedbackButton).toHaveCount(0);

  await secondButton.click();

  await expect(secondCard.locator("[data-cart-button]")).toHaveText("加入购物车");
  await expect(secondFeedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+1）");
  await expect(secondCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x1"]);
  await expect(firstButton).toHaveText("加入购物车");
  await expect(firstCard.locator("[data-cart-feedback-button]")).toHaveCount(0);

  const splitAddBox = await secondButton.boundingBox();
  const splitFeedbackBox = await secondFeedbackButton.boundingBox();
  expect(splitAddBox).not.toBeNull();
  expect(splitFeedbackBox).not.toBeNull();
  expect(Math.abs(splitAddBox.width - splitFeedbackBox.width)).toBeLessThanOrEqual(2);
  expect(splitAddBox.width).toBeLessThan(fullButtonBox.width);

  await secondCard.getByRole("button", { name: "43" }).click();
  await secondButton.click();

  await expect(secondCard.locator("[data-cart-button]")).toHaveText("加入购物车");
  await expect(secondFeedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+2）");
  await expect(secondCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x1", "43 x1"]);
  await expect(firstButton).toHaveText("加入购物车");

  await secondCard.locator("[data-size]", { hasText: "39" }).click();
  await secondButton.click();

  await expect(secondFeedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+3）");
  await expect(secondCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x2", "43 x1"]);

  await page.clock.runFor(2000);
  await expect(secondCard.locator("[data-cart-button]")).toHaveText("加入购物车");
  await expect(secondFeedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+3）");
  await expect(secondCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x2", "43 x1"]);
});

test("shows selected size quantities in a hover popover instead of inside the selected button", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "39", quantity: 2 },
      { productId: "sock-02", size: "43", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");

  const sockCard = page.locator('[data-product-card][data-product-id="sock-02"]');
  const feedbackButton = sockCard.locator("[data-cart-feedback-button]");
  const feedbackPopover = sockCard.locator("[data-cart-feedback-popover]");

  await expect(feedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+3）");
  await expect(feedbackButton).toHaveText("已选（+3）");
  await expect(feedbackPopover).toBeHidden();
  await expect(feedbackPopover.locator("[data-cart-feedback-size]")).toHaveText(["39 x2", "43 x1"]);

  await feedbackButton.hover();

  await expect(feedbackPopover).toBeVisible();
});

test("removes selected size quantities from the product-card remove dialog", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "39", quantity: 2 },
      { productId: "sock-02", size: "43", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");

  const sockCard = page.locator('[data-product-card][data-product-id="sock-02"]');
  const actions = sockCard.locator("[data-cart-actions]");
  const removeButton = sockCard.locator("[data-card-remove-button]");
  const feedbackButton = sockCard.locator("[data-cart-feedback-button]");

  await expect(actions).toHaveClass(/is-triple/);
  await expect(sockCard.locator("[data-cart-button]")).toHaveText("加入购物车");
  await expect(removeButton).toHaveText("移除");
  await expect(feedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+3）");
  await expect(sockCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x2", "43 x1"]);
  await expect(page.locator("[data-cart-count]")).toHaveText("3");

  await removeButton.click();
  const dialog = page.locator("[data-card-remove-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-card-remove-size]")).toHaveText(["39 x2", "43 x1"]);

  await dialog.locator('[data-card-remove-size][data-size="39"]').click();
  await expect(dialog.locator("[data-card-remove-quantity]")).toHaveText("1");
  const partialRemoveResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "PATCH";
  });
  await dialog.locator("[data-card-remove-confirm]").click();
  expect((await partialRemoveResponse).ok()).toBe(true);

  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-cart-count]")).toHaveText("2");
  await expect(feedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+2）");
  await expect(sockCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x1", "43 x1"]);

  await removeButton.click();
  await dialog.locator('[data-card-remove-size][data-size="43"]').click();
  const fullRemoveResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "DELETE";
  });
  await dialog.locator("[data-card-remove-confirm]").click();
  expect((await fullRemoveResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("1");
  await expect(feedbackButton.locator("[data-cart-feedback-summary]")).toHaveText("已选（+1）");
  await expect(sockCard.locator("[data-cart-feedback-size]")).toHaveText(["39 x1"]);
});

test("keeps first-row product card action buttons aligned", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-01", size: "39", quantity: 1 },
      { productId: "sock-02", size: "39", quantity: 2 },
      { productId: "sock-03", size: "39", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");

  const firstRowActions = page.locator("[data-product-card]").locator("[data-cart-actions]");
  const boxes = await Promise.all([
    firstRowActions.nth(0).boundingBox(),
    firstRowActions.nth(1).boundingBox(),
    firstRowActions.nth(2).boundingBox()
  ]);

  boxes.forEach((box) => expect(box).not.toBeNull());

  const actionTops = boxes.map((box) => Math.round(box.y));
  const actionBottoms = boxes.map((box) => Math.round(box.y + box.height));
  expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThanOrEqual(2);
  expect(Math.max(...actionBottoms) - Math.min(...actionBottoms)).toBeLessThanOrEqual(2);
});

test("posts the selected size to the backend cart api", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await firstCard.getByRole("button", { name: "43" }).click();

  const responsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });

  await firstCard.locator("[data-cart-button]").click();
  const response = await responsePromise;

  expect(response.ok()).toBe(true);
  expect(JSON.parse(response.request().postData())).toEqual({
    productId: "sock-01",
    size: "43",
    quantity: 1
  });
});

test("updates the visible cart state after repeated add-to-cart actions", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await firstCard.getByRole("button", { name: "43" }).click();
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
  await expect(page.locator("[data-cart-item]").first()).toContainText("43");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x2");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥78");
});

test("shows an out-of-stock popup and keeps low stock cart quantities capped", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-10", size: "35", quantity: 8 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");

  const lowStockCard = page.locator('[data-product-card][data-product-id="sock-10"]');
  await expect(page.locator("[data-cart-count]")).toHaveText("8");

  const addResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });
  await lowStockCard.locator("[data-cart-button]").click();
  expect((await addResponse).status()).toBe(409);

  await expect(page.locator("[data-stock-toast]")).toHaveText("无货");
  await expect(page.locator("[data-cart-count]")).toHaveText("8");

  await page.getByRole("button", { name: "打开购物车" }).click();
  const increaseResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "PATCH";
  });
  await page.getByRole("button", { name: "增加 防滑隐形船袜 数量" }).click();
  expect((await increaseResponse).status()).toBe(409);

  await expect(page.locator("[data-stock-toast]")).toHaveText("无货");
  await expect(page.locator("[data-cart-count]")).toHaveText("8");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x8");
});

test("clears the visible cart state and persisted cart data from the page action", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");

  const sock02Card = page.locator('[data-product-card][data-product-id="sock-02"]');
  await expect(sock02Card.locator("[data-cart-feedback-summary]")).toHaveText("已选（+2）");
  await expect(sock02Card.locator("[data-cart-feedback-size]")).toHaveText(["43 x2"]);
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
  await expect(sock02Card.locator("[data-cart-feedback-button]")).toHaveCount(0);
  await expect(sock02Card.locator("[data-cart-button]")).toHaveText("加入购物车");

  const persistedCart = JSON.parse(await fs.readFile(cartFile, "utf8"));
  expect(persistedCart).toEqual({ items: [] });
});

test("updates cart item quantity from drawer controls and refreshes totals", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
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
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
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
      { productId: "sock-02", size: "43", quantity: 2 },
      { productId: "sock-05", size: "39", quantity: 1 }
    ]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const removeButton = page.getByRole("button", { name: "移除 轻压运动袜" });
  await expect(removeButton).toBeVisible();
  await expect(removeButton).toHaveCSS("border-top-width", "1px");
  await expect(removeButton).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const removeResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "DELETE";
  });
  await removeButton.click();
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
  const sizeButton = firstCard.getByRole("button", { name: "39" });
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

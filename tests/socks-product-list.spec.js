const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const cartFile = path.join(__dirname, "fixtures", "test-data", "cart.json");

test.use({ viewport: { width: 1280, height: 960 } });

test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
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
  await expect(page.locator("[data-cart-total]")).toHaveText("¥133");
});

test("closes the cart drawer from the close button", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "打开购物车" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");

  await page.getByRole("button", { name: "关闭购物车" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "false");
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
  await expect(firstCard.locator("[data-review-count]")).toHaveText("1,284 reviews");
  await expect(firstCard.locator("[data-top-rated]")).toHaveText("Top rated");
});

test("does not show the top rated tag for products that are not top rated", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const sock05Card = page.locator('[data-product-card][data-product-id="sock-05"]');
  await expect(sock05Card.locator("[data-rating-band]")).toBeVisible();
  await expect(sock05Card.locator("[data-rating-value]")).toHaveText("4.6");
  await expect(sock05Card.locator("[data-review-count]")).toHaveText("973 reviews");
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

  await expect(page.locator("[data-cart-total]")).toHaveText("¥133");

  const increaseResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "PATCH";
  });
  await page.getByRole("button", { name: "增加 轻压运动袜 数量" }).click();
  expect((await increaseResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("4");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x3");
  await expect(page.locator("[data-cart-total]")).toHaveText("¥182");

  const decreaseResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "PATCH";
  });
  await page.getByRole("button", { name: "减少 轻压运动袜 数量" }).click();
  expect((await decreaseResponse).ok()).toBe(true);

  await expect(page.locator("[data-cart-count]")).toHaveText("3");
  await expect(page.locator("[data-cart-item]").first()).toContainText("x2");
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

  const clickPromise = increaseButton.click();

  await expect.poll(() => typeof releasePatchRequest).toBe("function");
  await expect(increaseButton).toBeDisabled();
  await expect(decreaseButton).toBeDisabled();
  await expect(removeButton).toBeDisabled();
  await expect(clearButton).toBeDisabled();

  await releasePatchRequest();
  await clickPromise;

  await expect(page.locator("[data-cart-count]")).toHaveText("4");
  await expect(page.getByRole("button", { name: "增加 轻压运动袜 数量" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "减少 轻压运动袜 数量" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "移除 轻压运动袜" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "清空购物车" })).toBeEnabled();
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

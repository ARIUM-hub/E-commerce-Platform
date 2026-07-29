# Socks 收藏与复购补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete retention loop with a wishlist page, reorder actions, and a full recent browsing history page.

**Architecture:** Reuse the existing single-page storefront shell, owner/session model, SQLite-backed saved products, recent views, orders, and cart repositories. Add small API surfaces for reorder and recent-history management, then wire new views in `public/js/storefront-app.js` and matching sections/styles in `socks-product-list.html`.

**Tech Stack:** Node.js HTTP server, SQLite repositories, vanilla HTML/CSS/JS, Playwright API/UI tests.

---

## File Map

- Modify `tests/api.spec.js`: add API behavior coverage for reorder and recent view list/delete/clear.
- Modify `tests/socks-product-list.spec.js`: add UI coverage for wishlist, reorder from order history/detail, and full recent history.
- Modify `lib/repositories/marketing.js`: add recent view listing and deletion helpers while keeping existing recommendation helper.
- Modify `lib/repositories/orders.js`: add a `reorderItemsFromOrder` helper that validates ownership and current SKU stock before adding to cart.
- Modify `server.js`: import new helpers and route `GET /api/recent-views`, `DELETE /api/recent-views/:productId`, `POST /api/recent-views/clear`, `POST /api/orders/:id/reorder`.
- Modify `public/js/storefront-app.js`: add wishlist/recent views, fetch helpers, renderers, and reorder bindings.
- Modify `socks-product-list.html`: add hidden wishlist/recent view containers, navigation links, and compact retained-product card styles.

## Safety Notes

- Keep all commands UTF-8 safe in PowerShell:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8;
```

- Run Playwright with `--workers=1`.
- Do not dispatch background agents for this feature.
- Clean fixture noise before commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

---

### Task 1: Recent Views API

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/repositories/marketing.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API tests**

Add tests near the existing recent views test in `tests/api.spec.js`:

```js
test("lists removes and clears full recent views for the current session", async ({ request }) => {
  const firstRecord = await request.post("/api/recent-views", { data: { productId: "sock-01" } });
  expect(firstRecord.ok()).toBe(true);
  const cookie = getSessionCookie(firstRecord);

  const secondRecord = await request.post("/api/recent-views", {
    data: { productId: "sock-02" },
    headers: { cookie }
  });
  expect(secondRecord.ok()).toBe(true);

  const listResponse = await request.get("/api/recent-views?limit=24", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  await expect(listResponse.json()).resolves.toMatchObject({
    ok: true,
    productIds: ["sock-02", "sock-01"]
  });

  const removeResponse = await request.delete("/api/recent-views/sock-02", {
    headers: { cookie }
  });
  expect(removeResponse.ok()).toBe(true);
  await expect(removeResponse.json()).resolves.toMatchObject({
    ok: true,
    productIds: ["sock-01"]
  });

  const clearResponse = await request.post("/api/recent-views/clear", {
    headers: { cookie }
  });
  expect(clearResponse.ok()).toBe(true);
  await expect(clearResponse.json()).resolves.toMatchObject({
    ok: true,
    productIds: []
  });
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "full recent views" --workers=1
```

Expected: FAIL because `GET /api/recent-views`, `DELETE /api/recent-views/:productId`, and `POST /api/recent-views/clear` are not implemented.

- [ ] **Step 3: Add repository helpers**

In `lib/repositories/marketing.js`, add these helpers after `listRecentProductIds`:

```js
function normalizeRecentLimit(limit) {
  const parsedLimit = Number(limit);
  return Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50
    ? parsedLimit
    : 24;
}

function listRecentViews(db, { userId = null, sessionId = null, limit = 24 }) {
  const normalizedLimit = normalizeRecentLimit(limit);
  return db.prepare(`
    SELECT product_id AS productId, viewed_at AS viewedAt
    FROM recent_views
    WHERE COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
    ORDER BY viewed_at DESC, rowid DESC
    LIMIT ?
  `).all(userId, sessionId, normalizedLimit);
}

function removeRecentView(db, { userId = null, sessionId = null, productId }) {
  db.prepare(`
    DELETE FROM recent_views
    WHERE product_id = ?
      AND COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(productId, userId, sessionId);
}

function clearRecentViews(db, { userId = null, sessionId = null }) {
  db.prepare(`
    DELETE FROM recent_views
    WHERE COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(userId, sessionId);
}
```

Export `listRecentViews`, `removeRecentView`, and `clearRecentViews`.

- [ ] **Step 4: Add server payload helper**

In `server.js`, import the new helpers:

```js
  clearRecentViews,
  listRecentProductIds,
  listRecentViews,
  recordRecentView,
  removeRecentView,
```

Add a helper near other payload helpers:

```js
function getRecentViewsPayload(db, owner, products, locale, limit) {
  const views = listRecentViews(db, {
    userId: owner.userId,
    sessionId: owner.sessionId,
    limit
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const items = views
    .map((view) => {
      const product = productsById.get(view.productId);
      return product ? { ...localizeProduct(product, locale), viewedAt: view.viewedAt } : null;
    })
    .filter(Boolean);

  return {
    ok: true,
    productIds: views.map((view) => view.productId),
    items
  };
}
```

- [ ] **Step 5: Add recent view routes**

In `server.js`, after the existing `POST /api/recent-views` route, add:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/recent-views") {
    try {
      const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const owner = {
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId
      };
      const products = withDatabase((db) => listProducts(db));
      const payload = withDatabase((db) => getRecentViewsPayload(
        db,
        owner,
        products,
        locale,
        requestUrl.searchParams.get("limit")
      ));
      sendCartJson(response, 200, payload, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const recentViewProductMatch = requestUrl.pathname.match(/^\/api\/recent-views\/([^/]+)$/);
  if (request.method === "DELETE" && recentViewProductMatch) {
    try {
      const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const owner = {
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId
      };
      const productId = decodeURIComponent(recentViewProductMatch[1]);
      const products = withDatabase((db) => listProducts(db));
      const payload = withDatabase((db) => {
        removeRecentView(db, { ...owner, productId });
        return getRecentViewsPayload(db, owner, products, locale, 24);
      });
      sendCartJson(response, 200, payload, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/recent-views/clear") {
    try {
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const owner = {
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId
      };
      withDatabase((db) => clearRecentViews(db, owner));
      sendCartJson(response, 200, { ok: true, productIds: [], items: [] }, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 6: Verify green**

Run:

```powershell
npx playwright test tests/api.spec.js -g "full recent views|records and returns recently viewed products" --workers=1
```

Expected: PASS.

---

### Task 2: Reorder API

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/repositories/orders.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API tests**

Add tests near the order history tests in `tests/api.spec.js`:

```js
test("reorders an owned order into the current cart", async ({ request }) => {
  const registerResponse = await request.post("/api/auth/register", {
    data: { name: "Reorder User", email: "reorder@example.com", password: "demo1234" }
  });
  const cookie = getSessionCookie(registerResponse);

  const cartResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "39", quantity: 1 },
    headers: { cookie }
  });
  expect(cartResponse.ok()).toBe(true);

  const orderResponse = await request.post("/api/orders", {
    data: checkoutPayload,
    headers: { cookie }
  });
  expect(orderResponse.ok()).toBe(true);
  const orderPayload = await orderResponse.json();

  const reorderResponse = await request.post(`/api/orders/${orderPayload.order.id}/reorder`, {
    headers: { cookie }
  });
  expect(reorderResponse.ok()).toBe(true);
  await expect(reorderResponse.json()).resolves.toMatchObject({
    ok: true,
    addedItems: [{ productId: "sock-02", size: "39", quantity: 1 }],
    cart: {
      meta: { itemCount: 1 }
    }
  });
});

test("does not reorder another user's order", async ({ request }) => {
  const ownerResponse = await request.post("/api/auth/register", {
    data: { name: "Order Owner", email: "owner@example.com", password: "demo1234" }
  });
  const ownerCookie = getSessionCookie(ownerResponse);
  await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "39", quantity: 1 },
    headers: { cookie: ownerCookie }
  });
  const orderResponse = await request.post("/api/orders", {
    data: checkoutPayload,
    headers: { cookie: ownerCookie }
  });
  const orderPayload = await orderResponse.json();

  const otherResponse = await request.post("/api/auth/register", {
    data: { name: "Other User", email: "other@example.com", password: "demo1234" }
  });
  const otherCookie = getSessionCookie(otherResponse);

  const reorderResponse = await request.post(`/api/orders/${orderPayload.order.id}/reorder`, {
    headers: { cookie: otherCookie }
  });
  expect(reorderResponse.status()).toBe(404);
  await expect(reorderResponse.json()).resolves.toMatchObject({
    error: { code: "ORDER_NOT_FOUND" }
  });
});
```

Use the existing `checkoutPayload` constant already defined in `tests/api.spec.js`.

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "reorders|another user's order" --workers=1
```

Expected: FAIL because reorder route does not exist.

- [ ] **Step 3: Add repository helper**

In `lib/repositories/orders.js`, add `reorderItemsFromOrder` before `module.exports`:

```js
function getSkuByProductAndSize(db, productId, size) {
  return db.prepare(`
    SELECT sku_id AS skuId, product_id AS productId, size, stock_quantity AS stockQuantity, is_available AS isAvailable
    FROM product_variants
    WHERE product_id = ? AND size = ?
  `).get(productId, size);
}

function reorderItemsFromOrder(db, { order, cart, products }) {
  const productIds = new Set(products.map((product) => product.id));
  const nextItems = [...cart.items];
  const addedItems = [];
  const skippedItems = [];

  order.items.forEach((item) => {
    if (!productIds.has(item.productId)) {
      skippedItems.push({ productId: item.productId, size: item.size, quantity: item.quantity, reason: "PRODUCT_NOT_FOUND" });
      return;
    }

    const variant = getSkuByProductAndSize(db, item.productId, item.size);
    if (!variant || !variant.isAvailable || variant.stockQuantity <= 0) {
      skippedItems.push({ productId: item.productId, size: item.size, quantity: item.quantity, reason: "OUT_OF_STOCK" });
      return;
    }

    const existingItem = nextItems.find((cartItem) => cartItem.skuId === variant.skuId);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const availableToAdd = Math.max(0, variant.stockQuantity - currentQuantity);
    const quantityToAdd = Math.min(item.quantity, availableToAdd);

    if (quantityToAdd <= 0) {
      skippedItems.push({ productId: item.productId, size: item.size, quantity: item.quantity, reason: "STOCK_LIMIT" });
      return;
    }

    if (existingItem) {
      existingItem.quantity += quantityToAdd;
    } else {
      nextItems.push({
        productId: item.productId,
        skuId: variant.skuId,
        size: variant.size,
        quantity: quantityToAdd
      });
    }

    addedItems.push({ productId: item.productId, size: variant.size, quantity: quantityToAdd });

    if (quantityToAdd < item.quantity) {
      skippedItems.push({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity - quantityToAdd,
        reason: "STOCK_LIMIT"
      });
    }
  });

  return {
    items: nextItems,
    addedItems,
    skippedItems
  };
}
```

Export `reorderItemsFromOrder`.

- [ ] **Step 4: Add route parser and route**

In `server.js`, add:

```js
function parseOrderReorderPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/reorder$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Import `reorderItemsFromOrder` from `lib/repositories/orders`.

Add route before the generic `GET /api/orders/:id` block:

```js
  const requestedReorderId = parseOrderReorderPath(requestUrl.pathname);
  if (request.method === "POST" && requestedReorderId) {
    try {
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const order = withDatabase((db) => findOrderById(db, requestedReorderId));
      if (!order || (order.userId && (!activeCart.user || activeCart.user.id !== order.userId))) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const products = withDatabase((db) => listProducts(db));
      const result = withDatabase((db) => reorderItemsFromOrder(db, {
        order,
        cart: activeCart.cart,
        products
      }));

      if (!result.addedItems.length) {
        sendError(response, 409, "REORDER_EMPTY", "No order items are available to reorder.");
        return;
      }

      await writeActiveCart(activeCart, { ...activeCart.cart, items: result.items });
      const cartPayload = getCartPayload({ ...activeCart.cart, items: result.items }, { products });
      sendCartJson(response, 200, {
        ok: true,
        cart: cartPayload,
        addedItems: result.addedItems,
        skippedItems: result.skippedItems
      }, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 5: Verify green**

Run:

```powershell
npx playwright test tests/api.spec.js -g "reorders|another user's order" --workers=1
```

Expected: PASS.

---

### Task 3: Wishlist Page UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`
- Modify: `public/js/storefront-app.js`

- [ ] **Step 1: Write failing UI tests**

Add tests near the existing saved product detail test:

```js
test("shows saved products on the wishlist page and removes one", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await page.locator("[data-save-product-button]").click();
  await expect(page.locator("[data-saved-products-count]")).toHaveText("1");

  await page.goto("/socks-product-list.html?view=wishlist");
  await expect(page.locator("[data-wishlist-view]")).toBeVisible();
  await expect(page.locator("[data-wishlist-card]")).toHaveCount(1);
  await expect(page.locator("[data-wishlist-card]").first()).toContainText(/轻压运动袜|Active Base/);

  await page.locator("[data-wishlist-remove]").click();
  await expect(page.locator("[data-wishlist-empty]")).toBeVisible();
});

test("adds a wishlist product to the cart", async ({ page }) => {
  await page.request.post("/api/saved-products", { data: { productId: "sock-02" } });
  await page.goto("/socks-product-list.html?view=wishlist");

  const cartResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });
  await page.locator("[data-wishlist-add-cart]").first().click();
  expect((await cartResponse).ok()).toBe(true);
  await expect(page.locator("[data-cart-count]")).toHaveText("1");
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "wishlist" --workers=1
```

Expected: FAIL because the wishlist view does not exist.

- [ ] **Step 3: Add HTML shell and styles**

In `socks-product-list.html`, add a hidden section beside the existing view sections:

```html
<section class="view view--wishlist" data-wishlist-view hidden>
  <div class="hero hero--compact">
    <p class="hero__eyebrow" data-wishlist-hero-eyebrow>Wishlist</p>
    <h1 class="hero__title" data-wishlist-title>心愿单</h1>
    <p class="hero__copy" data-wishlist-copy>管理你保存的袜子，稍后继续购买。</p>
  </div>
  <section class="retention-panel" data-wishlist-panel></section>
</section>
```

Add compact retained-product card CSS near existing order/recent styles:

```css
.retention-panel {
  display: grid;
  gap: 16px;
}

.retention-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.retention-card {
  display: grid;
  gap: 12px;
  border: 1px solid #e4e4e4;
  border-radius: 22px;
  padding: 16px;
  background: #ffffff;
}

.retention-card__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.retention-card__button {
  min-height: 44px;
  border: 1px solid #111111;
  border-radius: 999px;
  padding: 10px 12px;
  background: #ffffff;
  color: #111111;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.retention-card__button--primary {
  background: #111111;
  color: #ffffff;
}
```

- [ ] **Step 4: Add route constants and DOM refs**

In `public/js/storefront-app.js`, add:

```js
const WISHLIST_VIEW_KEY = "wishlist";
```

Add DOM refs:

```js
const wishlistView = document.querySelector("[data-wishlist-view]");
const wishlistPanel = document.querySelector("[data-wishlist-panel]");
```

Update `syncPageView()`:

```js
const isWishlistView = currentView === WISHLIST_VIEW_KEY;
wishlistView.hidden = !isWishlistView;
```

- [ ] **Step 5: Add wishlist translations**

Add under both locale `detail` or a new `wishlist` key:

```js
wishlist: {
  eyebrow: "保存列表",
  title: "心愿单",
  copy: "管理你保存的袜子，稍后继续购买。",
  empty: "还没有保存的商品",
  browse: "去浏览袜子",
  viewDetail: "查看详情",
  addCart: "加入购物车",
  remove: "移除收藏"
}
```

English:

```js
wishlist: {
  eyebrow: "Saved list",
  title: "Wishlist",
  copy: "Manage saved socks and continue shopping later.",
  empty: "No saved products yet",
  browse: "Browse socks",
  viewDetail: "View detail",
  addCart: "Add to cart",
  remove: "Remove"
}
```

- [ ] **Step 6: Render wishlist page**

Add:

```js
function getDefaultSizeForProduct(product) {
  return getProductVariants(product).find(isVariantAvailable)?.size || getProductVariants(product)[0]?.size || "";
}

function createRetentionCardMarkup(product, options = {}) {
  const localizedProduct = getLocalizedProduct(product);
  const addAction = options.addAction || "";
  const removeAction = options.removeAction || "";
  return `
    <article class="retention-card" data-wishlist-card data-product-id="${escapeHtml(product.id)}">
      <p class="retention-card__series">${escapeHtml(localizedProduct.series)}</p>
      <h2 class="retention-card__title">${escapeHtml(localizedProduct.title)}</h2>
      <p class="retention-card__meta">${escapeHtml(localizedProduct.category)} · ¥${product.price} <s>¥${product.originalPrice}</s></p>
      <p class="retention-card__meta">${localizedProduct.rating} · ${formatReviewCount(product.reviewCount)}</p>
      <div class="retention-card__actions">
        <a class="retention-card__button" href="${getActiveDetailHref(product.id)}">${t("wishlist.viewDetail")}</a>
        <button class="retention-card__button retention-card__button--primary" type="button" ${addAction}>${t("wishlist.addCart")}</button>
        <button class="retention-card__button" type="button" ${removeAction}>${t("wishlist.remove")}</button>
      </div>
    </article>
  `;
}

async function renderWishlistPage() {
  if (!wishlistPanel) {
    return;
  }

  const payload = await fetchSavedProducts().catch(() => ({ items: [], savedProductIds: [] }));
  applySavedProductsPayload(payload);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    wishlistPanel.innerHTML = `
      <div class="empty-state" data-wishlist-empty>
        ${t("wishlist.empty")}
        <a class="retention-card__button retention-card__button--primary" href="${STOREFRONT_PATH}">${t("wishlist.browse")}</a>
      </div>
    `;
    return;
  }

  wishlistPanel.innerHTML = `
    <div class="retention-grid">
      ${items.map((product) => createRetentionCardMarkup(product, {
        addAction: `data-wishlist-add-cart data-default-size="${escapeHtml(getDefaultSizeForProduct(product))}"`,
        removeAction: "data-wishlist-remove"
      })).join("")}
    </div>
  `;
  bindWishlistInteractions();
}
```

- [ ] **Step 7: Bind wishlist actions**

Add:

```js
function bindWishlistInteractions() {
  wishlistPanel.querySelectorAll("[data-wishlist-add-cart]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-product-id]");
      const productId = card?.dataset.productId;
      const size = button.dataset.defaultSize;
      if (!productId || !size) return;
      button.disabled = true;
      try {
        await addCartItem(productId, size);
      } catch (error) {
        showOutOfStockToast();
      } finally {
        button.disabled = false;
      }
    });
  });

  wishlistPanel.querySelectorAll("[data-wishlist-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const productId = button.closest("[data-product-id]")?.dataset.productId;
      if (!productId) return;
      button.disabled = true;
      try {
        const payload = await removeSavedProduct(productId);
        applySavedProductsPayload(payload);
        await renderWishlistPage();
      } catch (error) {
        showOutOfStockToast();
      } finally {
        button.disabled = false;
      }
    });
  });
}
```

- [ ] **Step 8: Initialize wishlist route**

In `initializePage()` or the route dispatcher, call:

```js
if (getCurrentView() === WISHLIST_VIEW_KEY) {
  await renderWishlistPage();
}
```

- [ ] **Step 9: Verify green**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "wishlist" --workers=1
```

Expected: PASS.

---

### Task 4: Reorder UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing UI tests**

Add tests near order history/order detail tests:

```js
test("reorders from the order history page", async ({ page }) => {
  await registerFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=payment/);

  await page.goto("/socks-product-list.html?view=orders");
  const reorderResponse = page.waitForResponse((response) => {
    return response.url().includes("/reorder") && response.request().method() === "POST";
  });
  await page.locator("[data-order-reorder]").first().click();
  expect((await reorderResponse).ok()).toBe(true);
  await expect(page.locator("[data-cart-count]")).toHaveText("1");
});

test("reorders from the order detail page", async ({ page }) => {
  await registerFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-02", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=payment/);
  const orderId = new URL(page.url()).searchParams.get("id");
  expect(orderId).not.toBeNull();
  await page.goto(`/socks-product-list.html?view=order&id=${orderId}`);

  const reorderResponse = page.waitForResponse((response) => {
    return response.url().includes("/reorder") && response.request().method() === "POST";
  });
  await page.locator("[data-order-detail-reorder]").click();
  expect((await reorderResponse).ok()).toBe(true);
  await expect(page.locator("[data-cart-count]")).toHaveText("1");
});
```

The checkout flow already puts the created order id in the payment URL, so the test extracts `id` from `page.url()` and opens `?view=order&id=<id>`.

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "reorders from" --workers=1
```

Expected: FAIL because reorder buttons are not rendered.

- [ ] **Step 3: Add fetch helper and translations**

In `public/js/storefront-app.js`, add:

```js
async function reorderOrder(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reorder`, {
    method: "POST"
  });

  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to reorder");
  }

  const payload = await response.json();
  setCartStateFromPayload(payload);
  renderCartState();
  return payload;
}
```

Add translations:

```js
reorder: {
  button: "再次购买",
  partial: "部分商品因库存不足未加入",
  empty: "暂无可再次购买的商品"
}
```

English:

```js
reorder: {
  button: "Buy again",
  partial: "Some items were skipped because of stock",
  empty: "No items are available to buy again"
}
```

- [ ] **Step 4: Render buttons in order history**

Inside `renderOrderHistory()`, update each `[data-order-history-card]` card to include:

```html
<button class="order-button order-button--secondary" type="button" data-order-reorder data-order-id="${escapeHtml(order.id)}">${t("reorder.button")}</button>
```

Keep the existing detail link.

- [ ] **Step 5: Render button in order detail**

Inside the order detail markup, add near the order summary actions:

```html
<button class="order-button order-button--secondary" type="button" data-order-detail-reorder data-order-id="${escapeHtml(order.id)}">${t("reorder.button")}</button>
```

- [ ] **Step 6: Bind reorder buttons**

Add:

```js
function bindReorderButtons(root = document) {
  root.querySelectorAll("[data-order-reorder], [data-order-detail-reorder]").forEach((button) => {
    button.addEventListener("click", async () => {
      const orderId = button.dataset.orderId;
      if (!orderId || button.disabled) return;
      button.disabled = true;
      try {
        const payload = await reorderOrder(orderId);
        if (Array.isArray(payload.skippedItems) && payload.skippedItems.length) {
          showOutOfStockToast();
        }
      } catch (error) {
        showOutOfStockToast();
      } finally {
        button.disabled = false;
      }
    });
  });
}
```

Call `bindReorderButtons(orderHistoryPanel)` after rendering order history and `bindReorderButtons(orderPagePanel)` after rendering order detail.

- [ ] **Step 7: Verify green**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "reorders from" --workers=1
```

Expected: PASS.

---

### Task 5: Full Recent History Page UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`
- Modify: `public/js/storefront-app.js`

- [ ] **Step 1: Write failing UI tests**

Add tests near the existing recently viewed UI test:

```js
test("shows a full recent history page and clears it", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-01");
  await expect(page.locator("[data-detail-product-root]")).toBeVisible();
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await expect(page.locator("[data-detail-product-root]")).toBeVisible();

  await page.goto("/socks-product-list.html?view=recent");
  await expect(page.locator("[data-recent-history-card]")).toHaveCount(2);
  await expect(page.locator("[data-recent-history-card]").first()).toContainText(/轻压运动袜|Active Base/);

  await page.locator("[data-recent-clear]").click();
  await expect(page.locator("[data-recent-history-empty]")).toBeVisible();
});

test("adds a recently viewed product to the cart from the full history page", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await expect(page.locator("[data-detail-product-root]")).toBeVisible();
  await page.goto("/socks-product-list.html?view=recent");

  const cartResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });
  await page.locator("[data-recent-add-cart]").first().click();
  expect((await cartResponse).ok()).toBe(true);
  await expect(page.locator("[data-cart-count]")).toHaveText("1");
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "recent history" --workers=1
```

Expected: FAIL because the full recent view does not exist.

- [ ] **Step 3: Add HTML shell**

In `socks-product-list.html`, add:

```html
<section class="view view--recent" data-recent-view hidden>
  <div class="hero hero--compact">
    <p class="hero__eyebrow" data-recent-hero-eyebrow>Browsing history</p>
    <h1 class="hero__title" data-recent-title>浏览历史</h1>
    <p class="hero__copy" data-recent-copy>继续查看你最近打开过的袜子商品。</p>
  </div>
  <section class="retention-panel" data-recent-panel></section>
</section>
```

- [ ] **Step 4: Add route constants, DOM refs, and translations**

In `public/js/storefront-app.js`, add:

```js
const RECENT_VIEW_KEY = "recent";
const recentView = document.querySelector("[data-recent-view]");
const recentPanel = document.querySelector("[data-recent-panel]");
```

Update `syncPageView()`:

```js
const isRecentView = currentView === RECENT_VIEW_KEY;
recentView.hidden = !isRecentView;
```

Add translations:

```js
recent: {
  eyebrow: "浏览历史",
  title: "浏览历史",
  copy: "继续查看你最近打开过的袜子商品。",
  empty: "还没有浏览记录",
  clear: "清空浏览历史",
  remove: "移除记录",
  viewDetail: "查看详情",
  addCart: "加入购物车"
}
```

English:

```js
recent: {
  eyebrow: "Browsing history",
  title: "Browsing history",
  copy: "Continue with socks you viewed recently.",
  empty: "No browsing history yet",
  clear: "Clear history",
  remove: "Remove",
  viewDetail: "View detail",
  addCart: "Add to cart"
}
```

- [ ] **Step 5: Add recent fetch helpers**

Add:

```js
async function fetchRecentHistory(limit = 24) {
  const response = await fetch(`/api/recent-views?limit=${encodeURIComponent(limit)}&locale=${encodeURIComponent(activeLocale)}`);
  if (!response.ok) {
    throw new Error("Failed to load recent history");
  }
  return response.json();
}

async function removeRecentHistoryItem(productId) {
  const response = await fetch(`/api/recent-views/${encodeURIComponent(productId)}?locale=${encodeURIComponent(activeLocale)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to remove recent history item");
  }
  return response.json();
}

async function clearRecentHistory() {
  const response = await fetch("/api/recent-views/clear", {
    method: "POST"
  });
  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to clear recent history");
  }
  return response.json();
}
```

- [ ] **Step 6: Render and bind recent history**

Add:

```js
function createRecentHistoryCardMarkup(product) {
  return createRetentionCardMarkup(product, {
    addAction: `data-recent-add-cart data-default-size="${escapeHtml(getDefaultSizeForProduct(product))}"`,
    removeAction: "data-recent-remove"
  }).replace("data-wishlist-card", "data-recent-history-card");
}

async function renderRecentHistoryPage(payload) {
  if (!recentPanel) return;
  const recentPayload = payload || await fetchRecentHistory().catch(() => ({ items: [] }));
  const items = Array.isArray(recentPayload.items) ? recentPayload.items : [];
  if (!items.length) {
    recentPanel.innerHTML = `<div class="empty-state" data-recent-history-empty>${t("recent.empty")}</div>`;
    return;
  }

  recentPanel.innerHTML = `
    <div class="retention-panel__toolbar">
      <button class="retention-card__button" type="button" data-recent-clear>${t("recent.clear")}</button>
    </div>
    <div class="retention-grid">
      ${items.map(createRecentHistoryCardMarkup).join("")}
    </div>
  `;
  bindRecentHistoryInteractions();
}

function bindRecentHistoryInteractions() {
  recentPanel.querySelector("[data-recent-clear]")?.addEventListener("click", async () => {
    await clearRecentHistory();
    await renderRecentHistoryPage({ items: [] });
  });

  recentPanel.querySelectorAll("[data-recent-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const productId = button.closest("[data-product-id]")?.dataset.productId;
      if (!productId) return;
      const payload = await removeRecentHistoryItem(productId);
      await renderRecentHistoryPage(payload);
    });
  });

  recentPanel.querySelectorAll("[data-recent-add-cart]").forEach((button) => {
    button.addEventListener("click", async () => {
      const productId = button.closest("[data-product-id]")?.dataset.productId;
      const size = button.dataset.defaultSize;
      if (!productId || !size) return;
      await addCartItem(productId, size);
    });
  });
}
```

- [ ] **Step 7: Initialize recent route**

In `initializePage()` or route dispatcher:

```js
if (getCurrentView() === RECENT_VIEW_KEY) {
  await renderRecentHistoryPage();
}
```

- [ ] **Step 8: Verify green**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "recent history" --workers=1
```

Expected: PASS.

---

### Task 6: Navigation Entrypoints and Regression

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`
- Modify: `public/js/storefront-app.js`

- [ ] **Step 1: Write failing UI test for entrypoints**

Add:

```js
test("opens wishlist and recent history from storefront navigation", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.locator("[data-site-wishlist-link]").click();
  await expect(page).toHaveURL(/view=wishlist/);
  await expect(page.locator("[data-wishlist-view]")).toBeVisible();

  await page.goto("/socks-product-list.html");
  await page.locator("[data-site-recent-link]").click();
  await expect(page).toHaveURL(/view=recent/);
  await expect(page.locator("[data-recent-view]")).toBeVisible();
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "wishlist and recent history from storefront navigation" --workers=1
```

Expected: FAIL because links are not present.

- [ ] **Step 3: Add navigation links**

In `socks-product-list.html`, add links in the existing account/header area:

```html
<a href="/socks-product-list.html?view=wishlist" data-site-wishlist-link>心愿单</a>
<a href="/socks-product-list.html?view=recent" data-site-recent-link>浏览历史</a>
```

If the header area has English localization nodes, use data attributes and set labels from JS translations instead of hardcoded text.

- [ ] **Step 4: Update locale sync**

In `public/js/storefront-app.js`, add DOM refs and set text:

```js
const siteWishlistLink = document.querySelector("[data-site-wishlist-link]");
const siteRecentLink = document.querySelector("[data-site-recent-link]");
siteWishlistLink.textContent = t("wishlist.title");
siteRecentLink.textContent = t("recent.title");
```

Place these assignments in the existing locale/header sync function.

- [ ] **Step 5: Focused regression**

Run:

```powershell
npx playwright test tests/api.spec.js tests/socks-product-list.spec.js -g "saved products|reorder|recent views|wishlist|recent history|order history|order detail" --workers=1
```

Expected: PASS.

- [ ] **Step 6: Full verification**

Run:

```powershell
npx playwright test --workers=1
```

Expected: PASS with existing skipped tests only.

- [ ] **Step 7: Clean fixture noise and commit**

Run:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git diff --check
git status --short
git add docs/superpowers/plans/2026-07-29-socks-retention-repurchase.md lib/repositories/marketing.js lib/repositories/orders.js server.js public/js/storefront-app.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add wishlist reorder and recent history"
```

Expected: commit succeeds and working tree is clean.

---

## Self-Review

- Spec coverage: wishlist page, reorder API/UI, recent history API/UI, navigation entrypoints, and low-concurrency verification all map to tasks.
- Vague-instruction scan: no incomplete or deferred implementation notes remain.
- Type consistency: view keys use `wishlist` and `recent`; API routes use `/api/orders/:id/reorder` and `/api/recent-views`; cart updates reuse current `setCartStateFromPayload()` and `renderCartState()`.

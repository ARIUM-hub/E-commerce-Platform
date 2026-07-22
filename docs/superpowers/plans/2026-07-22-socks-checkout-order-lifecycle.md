# Socks Checkout Order Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo-real checkout flow that creates persisted orders from the cart, clears the cart, and lets the order move through a constrained lifecycle.

**Architecture:** Keep the current lightweight Node HTTP server and single storefront HTML file. Add `orders.json` persistence beside existing `products.json` and `cart.json`, then route checkout and order views through the existing `?view=` mechanism. Use TDD with API tests first, then Playwright page tests for the checkout and lifecycle flow.

**Tech Stack:** Node.js HTTP server, JSON file persistence, vanilla HTML/CSS/JS, Playwright tests.

---

## File Structure

- Create: `data/orders.json`，保存本地演示订单 `{ "orders": [] }`。
- Create: `tests/fixtures/test-data/orders.json`，测试环境订单 fixture。
- Modify: `server.js`，新增订单文件校验、订单创建、订单读取、订单状态更新 API。
- Modify: `tests/api.spec.js`，覆盖订单创建、校验、读取和状态流转。
- Modify: `socks-product-list.html`，新增 checkout 视图、checkout 表单、订单详情数据读取和状态操作。
- Modify: `tests/socks-product-list.spec.js`，覆盖购物车到 checkout、表单校验、订单创建、订单详情刷新、状态推进。
- Modify: `playwright.config.js`，无需改动，继续通过 `DATA_DIR=tests/fixtures/test-data` 隔离测试数据。

---

### Task 1: Add Order Persistence Fixtures

**Files:**
- Create: `data/orders.json`
- Create: `tests/fixtures/test-data/orders.json`
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing API fixture test**

Add this near the top of `tests/api.spec.js`:

```js
const ordersFile = path.join(__dirname, "fixtures", "test-data", "orders.json");
```

Update `beforeEach`:

```js
test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(ordersFile, `${JSON.stringify({ orders: [] }, null, 2)}\n`, "utf8");
});
```

Add this test:

```js
test("returns an empty order collection fixture by default", async () => {
  const orders = JSON.parse(await fs.readFile(ordersFile, "utf8"));
  expect(orders).toEqual({ orders: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "returns an empty order collection fixture by default"
```

Expected: FAIL because `tests/fixtures/test-data/orders.json` does not exist.

- [ ] **Step 3: Add order JSON files**

Create `data/orders.json`:

```json
{
  "orders": []
}
```

Create `tests/fixtures/test-data/orders.json`:

```json
{
  "orders": []
}
```

- [ ] **Step 4: Wire server data-dir validation**

Modify the top of `server.js`:

```js
const ordersFile = path.join(dataDir, "orders.json");
const requiredDataFiles = ["products.json", "cart.json", "orders.json"];
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "returns an empty order collection fixture by default"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add data/orders.json tests/fixtures/test-data/orders.json tests/api.spec.js server.js
git commit -m "feat: add order persistence fixtures"
```

---

### Task 2: Create Orders From Cart

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API tests for order creation**

Add tests to `tests/api.spec.js`:

```js
const checkoutPayload = {
  customer: {
    name: "张三",
    contact: "zhangsan@example.com"
  },
  shippingAddress: {
    address: "示例路 1 号",
    city: "上海",
    region: "上海",
    postalCode: "200000",
    note: "门口即可"
  },
  shippingMethodId: "standard"
};

test("rejects order creation when cart is empty", async ({ request }) => {
  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("EMPTY_CART");
});

test("rejects order creation when required checkout fields are missing", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", {
    data: {
      customer: { name: "", contact: "" },
      shippingAddress: { address: "", city: "", region: "", postalCode: "" },
      shippingMethodId: "standard"
    }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("CHECKOUT_VALIDATION_FAILED");
  expect(payload.error.fields).toEqual(["customer.name", "customer.contact", "shippingAddress.address", "shippingAddress.city", "shippingAddress.region", "shippingAddress.postalCode"]);
});

test("creates a persisted order from the current cart and clears the cart", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 2 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);

  const payload = await response.json();
  expect(payload.order).toMatchObject({
    status: "pending_payment",
    customer: checkoutPayload.customer,
    shippingAddress: checkoutPayload.shippingAddress,
    shippingMethod: {
      id: "standard",
      fee: 0
    },
    totals: {
      subtotal: 118,
      savings: 40,
      shipping: 0,
      total: 78
    }
  });
  expect(payload.order.id).toMatch(/^SOCK-\d{8}-\d{4}$/);
  expect(payload.order.items).toEqual([
    {
      productId: "sock-01",
      title: "极简中筒袜",
      size: "39",
      quantity: 2,
      price: 39,
      originalPrice: 59
    }
  ]);
  expect(payload.order.timeline[0].status).toBe("pending_payment");
  expect(payload.cart).toEqual({ items: [], meta: { itemCount: 0 } });

  const persistedOrders = JSON.parse(await fs.readFile(ordersFile, "utf8"));
  expect(persistedOrders.orders).toHaveLength(1);

  const persistedCart = JSON.parse(await fs.readFile(cartFile, "utf8"));
  expect(persistedCart).toEqual({ items: [] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "order creation|creates a persisted order"
```

Expected: FAIL with `404` or route not found for `/api/orders`.

- [ ] **Step 3: Add server constants and helpers**

Add below locale/filter constants in `server.js`:

```js
const shippingMethods = {
  standard: {
    id: "standard",
    label: { "zh-CN": "标准配送", "en-US": "Standard delivery" },
    fee: 0,
    deliveryDays: 4
  },
  express: {
    id: "express",
    label: { "zh-CN": "加急配送", "en-US": "Express delivery" },
    fee: 12,
    deliveryDays: 2
  }
};

const orderStatusLabels = {
  pending_payment: { "zh-CN": "待支付", "en-US": "Pending payment" },
  paid: { "zh-CN": "已支付", "en-US": "Paid" },
  processing: { "zh-CN": "处理中", "en-US": "Processing" },
  shipped: { "zh-CN": "已发货", "en-US": "Shipped" },
  delivered: { "zh-CN": "已送达", "en-US": "Delivered" },
  cancelled: { "zh-CN": "已取消", "en-US": "Cancelled" }
};
```

Add helper functions before `const server = http.createServer`:

```js
function getRequiredCheckoutFields(body) {
  const missingFields = [];
  const customer = body.customer || {};
  const shippingAddress = body.shippingAddress || {};

  if (!String(customer.name || "").trim()) missingFields.push("customer.name");
  if (!String(customer.contact || "").trim()) missingFields.push("customer.contact");
  if (!String(shippingAddress.address || "").trim()) missingFields.push("shippingAddress.address");
  if (!String(shippingAddress.city || "").trim()) missingFields.push("shippingAddress.city");
  if (!String(shippingAddress.region || "").trim()) missingFields.push("shippingAddress.region");
  if (!String(shippingAddress.postalCode || "").trim()) missingFields.push("shippingAddress.postalCode");

  return missingFields;
}

function getShippingMethod(methodId, locale = "zh-CN") {
  const method = shippingMethods[methodId];
  if (!method) {
    return null;
  }

  return {
    id: method.id,
    label: method.label[locale] || method.label["zh-CN"],
    fee: method.fee,
    estimatedDelivery: formatDeliveryDate(method.deliveryDays, locale)
  };
}

function formatDeliveryDate(daysFromNow, locale = "zh-CN") {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function buildOrderId(existingOrders) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("-", "");
  const sequence = String(existingOrders.length + 1).padStart(4, "0");
  return `SOCK-${stamp}-${sequence}`;
}

function buildOrderItems(cart, products, locale = "zh-CN") {
  return cart.items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const localizedProduct = localizeProduct(product, locale);

    return {
      productId: item.productId,
      title: localizedProduct.title,
      size: item.size,
      quantity: item.quantity,
      price: product.price,
      originalPrice: product.originalPrice
    };
  });
}

function calculateOrderTotals(items, shippingFee) {
  const subtotal = items.reduce((total, item) => total + item.originalPrice * item.quantity, 0);
  const itemTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const savings = subtotal - itemTotal;

  return {
    subtotal,
    savings,
    shipping: shippingFee,
    total: itemTotal + shippingFee
  };
}

function createTimelineEntry(status, locale = "zh-CN") {
  return {
    status,
    label: orderStatusLabels[status][locale] || orderStatusLabels[status]["zh-CN"],
    at: new Date().toISOString()
  };
}
```

- [ ] **Step 4: Add `POST /api/orders` route**

Add before the non-GET method guard in `server.js`:

```js
if (request.method === "POST" && requestUrl.pathname === "/api/orders") {
  try {
    const products = await readJsonFile(productsFile);
    const cart = await readJsonFile(cartFile);
    const ordersPayload = await readJsonFile(ordersFile);
    const body = await readRequestBody(request);
    const locale = normalizeLocale(body.locale);

    if (!cart.items.length) {
      sendError(response, 400, "EMPTY_CART", "Cart is empty.");
      return;
    }

    const missingFields = getRequiredCheckoutFields(body);
    if (missingFields.length) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "CHECKOUT_VALIDATION_FAILED",
          message: "Checkout information is incomplete.",
          fields: missingFields
        }
      });
      return;
    }

    const shippingMethod = getShippingMethod(body.shippingMethodId, locale);
    if (!shippingMethod) {
      sendError(response, 400, "INVALID_SHIPPING_METHOD", "Shipping method is invalid.");
      return;
    }

    for (const cartItem of cart.items) {
      const product = products.find((entry) => entry.id === cartItem.productId);
      if (!product) {
        sendError(response, 404, "PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }
      if (!product.sizes.includes(cartItem.size)) {
        sendError(response, 400, "INVALID_SIZE", "Size is not available for this product.");
        return;
      }
      const stockValidation = validateStockQuantity(cart, product, cartItem.quantity, cartItem.size);
      if (stockValidation) {
        sendError(response, stockValidation.statusCode, stockValidation.code, stockValidation.message);
        return;
      }
    }

    const orderItems = buildOrderItems(cart, products, locale);
    const order = {
      id: buildOrderId(ordersPayload.orders),
      status: "pending_payment",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customer: {
        name: String(body.customer.name).trim(),
        contact: String(body.customer.contact).trim()
      },
      shippingAddress: {
        address: String(body.shippingAddress.address).trim(),
        city: String(body.shippingAddress.city).trim(),
        region: String(body.shippingAddress.region).trim(),
        postalCode: String(body.shippingAddress.postalCode).trim(),
        note: String(body.shippingAddress.note || "").trim()
      },
      shippingMethod,
      items: orderItems,
      totals: calculateOrderTotals(orderItems, shippingMethod.fee),
      timeline: [createTimelineEntry("pending_payment", locale)]
    };

    ordersPayload.orders.push(order);
    await writeJsonFile(ordersFile, ordersPayload);

    const emptyCart = { items: [] };
    await writeJsonFile(cartFile, emptyCart);

    sendJson(response, 201, {
      ok: true,
      order,
      cart: getCartPayload(emptyCart)
    });
    return;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }

    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "order creation|creates a persisted order"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add server.js tests/api.spec.js data/orders.json tests/fixtures/test-data/orders.json
git commit -m "feat: create persisted checkout orders"
```

---

### Task 3: Read Orders And Advance Lifecycle

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API tests for order reads and transitions**

Add to `tests/api.spec.js`:

```js
async function createOrderViaApi(request) {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  return response.json();
}

test("returns a persisted order by id", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.get(`/api/orders/${order.id}`);
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.order.id).toBe(order.id);
  expect(payload.order.status).toBe("pending_payment");
  expect(payload.order.items[0].title).toBe("极简中筒袜");
});

test("returns 404 for missing order id", async ({ request }) => {
  const response = await request.get("/api/orders/SOCK-20990101-9999");
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.error.code).toBe("ORDER_NOT_FOUND");
});

test("advances order status through the allowed lifecycle", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const paidResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "paid" }
  });
  expect(paidResponse.ok()).toBe(true);
  expect((await paidResponse.json()).order.status).toBe("paid");

  const processingResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "processing" }
  });
  expect(processingResponse.ok()).toBe(true);
  expect((await processingResponse.json()).order.status).toBe("processing");

  const shippedResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped" }
  });
  expect(shippedResponse.ok()).toBe(true);
  expect((await shippedResponse.json()).order.status).toBe("shipped");

  const deliveredResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "delivered" }
  });
  expect(deliveredResponse.ok()).toBe(true);
  const deliveredPayload = await deliveredResponse.json();
  expect(deliveredPayload.order.status).toBe("delivered");
  expect(deliveredPayload.order.timeline.map((entry) => entry.status)).toEqual([
    "pending_payment",
    "paid",
    "processing",
    "shipped",
    "delivered"
  ]);
});

test("rejects invalid order status transitions", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped" }
  });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_ORDER_TRANSITION");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "persisted order by id|missing order id|advances order status|invalid order status"
```

Expected: FAIL because `GET /api/orders/:id` and `PATCH /api/orders/:id/status` are not implemented.

- [ ] **Step 3: Add lifecycle helpers**

Add before `const server = http.createServer`:

```js
const allowedOrderTransitions = {
  pending_payment: new Set(["paid", "cancelled"]),
  paid: new Set(["processing"]),
  processing: new Set(["shipped"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([])
};

function parseOrderIdFromPath(pathname) {
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  return orderMatch ? decodeURIComponent(orderMatch[1]) : null;
}

function parseOrderStatusPath(pathname) {
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  return orderMatch ? decodeURIComponent(orderMatch[1]) : null;
}

function findOrderIndex(ordersPayload, orderId) {
  return ordersPayload.orders.findIndex((order) => order.id === orderId);
}
```

- [ ] **Step 4: Add `GET /api/orders/:id` route**

Add before the non-GET method guard:

```js
const requestedOrderId = parseOrderIdFromPath(requestUrl.pathname);
if (request.method === "GET" && requestedOrderId) {
  try {
    const ordersPayload = await readJsonFile(ordersFile);
    const order = ordersPayload.orders.find((entry) => entry.id === requestedOrderId);

    if (!order) {
      sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
      return;
    }

    sendJson(response, 200, { order });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 5: Add `PATCH /api/orders/:id/status` route**

Add before the non-GET method guard:

```js
const requestedStatusOrderId = parseOrderStatusPath(requestUrl.pathname);
if (request.method === "PATCH" && requestedStatusOrderId) {
  try {
    const ordersPayload = await readJsonFile(ordersFile);
    const body = await readRequestBody(request);
    const locale = normalizeLocale(body.locale);
    const nextStatus = String(body.status || "").trim();

    if (!allowedOrderTransitions[nextStatus]) {
      sendError(response, 400, "INVALID_ORDER_STATUS", "Order status is invalid.");
      return;
    }

    const orderIndex = findOrderIndex(ordersPayload, requestedStatusOrderId);
    if (orderIndex === -1) {
      sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
      return;
    }

    const order = ordersPayload.orders[orderIndex];
    if (!allowedOrderTransitions[order.status].has(nextStatus)) {
      sendError(response, 409, "INVALID_ORDER_TRANSITION", "Order status transition is not allowed.");
      return;
    }

    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();
    order.timeline.push(createTimelineEntry(nextStatus, locale));

    await writeJsonFile(ordersFile, ordersPayload);
    sendJson(response, 200, { ok: true, order });
    return;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }

    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "persisted order by id|missing order id|advances order status|invalid order status"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: add order lifecycle api"
```

---

### Task 4: Add Checkout View And Cart Navigation

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing page test for cart-to-checkout navigation**

Add to `tests/socks-product-list.spec.js`:

```js
test("opens the checkout view from a non-empty cart drawer", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 2 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await page.getByRole("button", { name: "去结算" }).click();

  await expect(page).toHaveURL(/view=checkout/);
  await expect(page.getByRole("heading", { name: "确认收货与配送" })).toBeVisible();
  await expect(page.locator("[data-checkout-summary]")).toContainText("极简中筒袜");
  await expect(page.locator("[data-checkout-total]")).toHaveText("¥78");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "opens the checkout view"
```

Expected: FAIL because checkout view does not exist and cart checkout still uses old immediate checkout behavior.

- [ ] **Step 3: Add checkout static shell**

Add a checkout section near current `order-view` in `socks-product-list.html`:

```html
<div class="checkout-view" data-checkout-view hidden>
  <section class="hero checkout-hero">
    <p class="hero__eyebrow" data-checkout-eyebrow>Checkout</p>
    <h1 class="hero__title" data-checkout-title>确认收货与配送</h1>
    <p class="hero__copy" data-checkout-copy>填写收货信息并确认本次演示订单。</p>
  </section>
  <section class="checkout-panel" data-checkout-panel></section>
</div>
```

Add constants:

```js
const CHECKOUT_VIEW_KEY = "checkout";
const CHECKOUT_VIEW_PATH = "/socks-product-list.html?view=checkout";
```

Add DOM reference:

```js
const checkoutView = document.querySelector("[data-checkout-view]");
const checkoutPagePanel = document.querySelector("[data-checkout-panel]");
```

Update `getCurrentView()` so `view=checkout` returns `CHECKOUT_VIEW_KEY`.

Update `syncPageView()`:

```js
const isCheckoutView = currentView === CHECKOUT_VIEW_KEY;
checkoutView.hidden = !isCheckoutView;
```

- [ ] **Step 4: Render checkout summary**

Add helper:

```js
function renderCheckoutPage() {
  const quantity = getCartQuantity(cartState.items);
  if (!quantity) {
    checkoutPagePanel.innerHTML = `
      <div class="empty-state" data-checkout-empty-state>${t("checkout.empty")}</div>
      <a class="detail-back-link" href="${STOREFRONT_PATH}">${t("common.backToStorefront")}</a>
    `;
    return;
  }

  const enrichedItems = cartState.items.map((item) => {
    const product = findProduct(item.productId);
    const localizedProduct = product ? getLocalizedProduct(product) : null;
    return { ...item, product, localizedProduct };
  });

  const subtotal = enrichedItems.reduce((total, item) => total + item.product.originalPrice * item.quantity, 0);
  const itemTotal = enrichedItems.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const savings = subtotal - itemTotal;

  checkoutPagePanel.innerHTML = `
    <div class="checkout-layout">
      <form class="checkout-form" data-checkout-form novalidate>
        <label class="checkout-field">${t("checkout.name")}<input name="name" data-checkout-field="customer.name"></label>
        <label class="checkout-field">${t("checkout.contact")}<input name="contact" data-checkout-field="customer.contact"></label>
        <label class="checkout-field">${t("checkout.address")}<input name="address" data-checkout-field="shippingAddress.address"></label>
        <label class="checkout-field">${t("checkout.city")}<input name="city" data-checkout-field="shippingAddress.city"></label>
        <label class="checkout-field">${t("checkout.region")}<input name="region" data-checkout-field="shippingAddress.region"></label>
        <label class="checkout-field">${t("checkout.postalCode")}<input name="postalCode" data-checkout-field="shippingAddress.postalCode"></label>
        <label class="checkout-field">${t("checkout.note")}<textarea name="note" data-checkout-field="shippingAddress.note"></textarea></label>
        <fieldset class="checkout-shipping">
          <legend>${t("checkout.shippingMethod")}</legend>
          <label><input type="radio" name="shippingMethodId" value="standard" checked> ${t("checkout.standardShipping")}</label>
          <label><input type="radio" name="shippingMethodId" value="express"> ${t("checkout.expressShipping")}</label>
        </fieldset>
        <div class="checkout-form__error" data-checkout-form-error role="alert"></div>
        <button class="cart-drawer__checkout-button" type="submit" data-checkout-submit>${t("checkout.submitOrder")}</button>
      </form>
      <aside class="checkout-summary" data-checkout-summary>
        ${enrichedItems.map((item) => `<article class="checkout-summary__item">${item.localizedProduct.title} ${item.size} x${item.quantity}</article>`).join("")}
        <p>${t("common.subtotal")}: ¥${subtotal}</p>
        <p>${t("common.savings")}: -¥${savings}</p>
        <p data-checkout-total>¥${itemTotal}</p>
      </aside>
    </div>
  `;
}
```

Add checkout translations in both locales with keys:

```js
checkout: {
  empty: "购物车为空，请先返回商城加购。",
  name: "姓名",
  contact: "联系方式",
  address: "详细地址",
  city: "城市",
  region: "省/州",
  postalCode: "邮编",
  note: "配送备注",
  shippingMethod: "配送方式",
  standardShipping: "标准配送 · 包邮",
  expressShipping: "加急配送 · ¥12",
  submitOrder: "提交订单"
}
```

English values:

```js
checkout: {
  empty: "Your cart is empty. Return to the storefront first.",
  name: "Name",
  contact: "Contact",
  address: "Address",
  city: "City",
  region: "State / Region",
  postalCode: "Postal code",
  note: "Delivery note",
  shippingMethod: "Shipping method",
  standardShipping: "Standard delivery · free",
  expressShipping: "Express delivery · ¥12",
  submitOrder: "Place order"
}
```

- [ ] **Step 5: Route checkout button**

Replace `cartCheckoutButton` click behavior:

```js
cartCheckoutButton.addEventListener("click", () => {
  if (getCartQuantity(cartState.items) === 0 || isCartMutationPending) {
    return;
  }
  setCartDrawerOpen(false);
  window.location.href = CHECKOUT_VIEW_PATH;
});
```

Update `initializePage()`:

```js
if (getCurrentView() === CHECKOUT_VIEW_KEY) {
  const [allProducts] = await Promise.all([fetchAllProducts(), fetchCart()]);
  syncProductCatalog(allProducts);
  renderCheckoutPage();
  return;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "opens the checkout view"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add checkout view entry"
```

---

### Task 5: Submit Checkout And Render Persisted Order Detail

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing page tests for checkout validation and submit**

Add:

```js
test("shows checkout validation errors without creating an order", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=checkout");
  await page.getByRole("button", { name: "提交订单" }).click();

  await expect(page.locator("[data-checkout-form-error]")).toContainText("请补全收货信息");
  await expect(page).toHaveURL(/view=checkout/);
});

test("submits checkout, clears cart, and opens the persisted order detail", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 2 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator('[data-checkout-field="customer.name"]').fill("张三");
  await page.locator('[data-checkout-field="customer.contact"]').fill("zhangsan@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("示例路 1 号");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("上海");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("上海");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("200000");

  const orderResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/orders") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "提交订单" }).click();
  expect((await orderResponse).status()).toBe(201);

  await expect(page).toHaveURL(/view=order&id=SOCK-/);
  await expect(page.locator("[data-order-status]")).toHaveText("待支付");
  await expect(page.locator("[data-order-items]")).toContainText("极简中筒袜");
  await expect(page.locator("[data-cart-count]")).toHaveText("0");

  await page.reload();
  await expect(page.locator("[data-order-status]")).toHaveText("待支付");
  await expect(page.locator("[data-order-items]")).toContainText("极简中筒袜");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "checkout validation|submits checkout"
```

Expected: FAIL because checkout submit and persisted order detail rendering do not exist.

- [ ] **Step 3: Add checkout form helpers**

Add:

```js
function getCheckoutFormPayload(form) {
  const formData = new FormData(form);
  return {
    locale: activeLocale,
    customer: {
      name: formData.get("name"),
      contact: formData.get("contact")
    },
    shippingAddress: {
      address: formData.get("address"),
      city: formData.get("city"),
      region: formData.get("region"),
      postalCode: formData.get("postalCode"),
      note: formData.get("note")
    },
    shippingMethodId: formData.get("shippingMethodId") || "standard"
  };
}

async function createOrder(payload) {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to create order");
  }

  return response.json();
}
```

Add submit binding after rendering checkout:

```js
checkoutPagePanel.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-checkout-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  const errorNode = form.querySelector("[data-checkout-form-error]");
  const submitButton = form.querySelector("[data-checkout-submit]");
  errorNode.textContent = "";
  submitButton.disabled = true;

  try {
    const payload = await createOrder(getCheckoutFormPayload(form));
    cartState = payload.cart;
    renderCartState();
    window.location.href = `/socks-product-list.html?view=order&id=${encodeURIComponent(payload.order.id)}`;
  } catch (error) {
    errorNode.textContent = error.code === "CHECKOUT_VALIDATION_FAILED"
      ? t("checkout.validationError")
      : t("checkout.submitError");
    submitButton.disabled = false;
  }
});
```

Add translations:

```js
validationError: "请补全收货信息后再提交。",
submitError: "订单提交失败，请稍后重试。"
```

English:

```js
validationError: "Complete the shipping information before placing the order.",
submitError: "Order submission failed. Please try again."
```

- [ ] **Step 4: Fetch and render persisted order detail**

Add:

```js
function getRequestedOrderId() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

async function fetchOrder(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
  if (!response.ok) {
    throw new Error("Failed to load order");
  }
  return response.json();
}

function renderPersistedOrder(order) {
  orderPagePanel.innerHTML = `
    <section class="order-summary" data-order-detail>
      <p data-order-number>${order.id}</p>
      <h2 data-order-status>${order.timeline[order.timeline.length - 1].label}</h2>
      <div data-order-timeline>
        ${order.timeline.map((entry) => `<p>${entry.label}</p>`).join("")}
      </div>
      <div data-order-address>
        ${order.customer.name} · ${order.customer.contact}<br>
        ${order.shippingAddress.address} ${order.shippingAddress.city} ${order.shippingAddress.region} ${order.shippingAddress.postalCode}
      </div>
      <div data-order-items>
        ${order.items.map((item) => `<article>${item.title} ${item.size} x${item.quantity}</article>`).join("")}
      </div>
      <p data-order-total>¥${order.totals.total}</p>
      ${createOrderStatusActionsMarkup(order)}
    </section>
  `;
}
```

Update `renderOrderPage()`:

```js
async function renderOrderPage() {
  const requestedOrderId = getRequestedOrderId();
  if (requestedOrderId) {
    const payload = await fetchOrder(requestedOrderId);
    renderPersistedOrder(payload.order);
    return;
  }

  if (orderConfirmationState) {
    renderOrderConfirmationPage(orderConfirmationState);
    return;
  }

  renderOrderPageFallback();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "checkout validation|submits checkout"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: submit checkout orders"
```

---

### Task 6: Add Frontend Order Status Actions

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing page test for status progression**

Add:

```js
test("advances persisted order status from the order detail page", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator('[data-checkout-field="customer.name"]').fill("张三");
  await page.locator('[data-checkout-field="customer.contact"]').fill("zhangsan@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("示例路 1 号");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("上海");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("上海");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("200000");
  await page.getByRole("button", { name: "提交订单" }).click();

  await expect(page.locator("[data-order-status]")).toHaveText("待支付");

  await page.getByRole("button", { name: "模拟付款" }).click();
  await expect(page.locator("[data-order-status]")).toHaveText("已支付");

  await page.getByRole("button", { name: "模拟处理中" }).click();
  await expect(page.locator("[data-order-status]")).toHaveText("处理中");

  await page.getByRole("button", { name: "模拟发货" }).click();
  await expect(page.locator("[data-order-status]")).toHaveText("已发货");

  await page.getByRole("button", { name: "模拟送达" }).click();
  await expect(page.locator("[data-order-status]")).toHaveText("已送达");
  await expect(page.locator("[data-order-timeline]")).toContainText("已送达");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "advances persisted order status"
```

Expected: FAIL because order status buttons are not wired.

- [ ] **Step 3: Add order status action markup**

Add:

```js
function getNextOrderActions(order) {
  if (order.status === "pending_payment") {
    return [
      { status: "paid", label: t("order.payDemo") },
      { status: "cancelled", label: t("order.cancelDemo") }
    ];
  }
  if (order.status === "paid") {
    return [{ status: "processing", label: t("order.processDemo") }];
  }
  if (order.status === "processing") {
    return [{ status: "shipped", label: t("order.shipDemo") }];
  }
  if (order.status === "shipped") {
    return [{ status: "delivered", label: t("order.deliverDemo") }];
  }
  return [];
}

function createOrderStatusActionsMarkup(order) {
  const actions = getNextOrderActions(order);
  if (!actions.length) {
    return "";
  }

  return `
    <div class="order-actions" data-order-actions>
      ${actions.map((action) => `
        <button class="cart-drawer__confirmation-action" type="button" data-order-status-action data-next-status="${action.status}">
          ${action.label}
        </button>
      `).join("")}
    </div>
  `;
}
```

Add order translations:

```js
payDemo: "模拟付款",
cancelDemo: "取消订单",
processDemo: "模拟处理中",
shipDemo: "模拟发货",
deliverDemo: "模拟送达"
```

English:

```js
payDemo: "Simulate payment",
cancelDemo: "Cancel order",
processDemo: "Simulate processing",
shipDemo: "Simulate shipping",
deliverDemo: "Simulate delivery"
```

- [ ] **Step 4: Add status API client and event binding**

Add:

```js
async function updateOrderStatus(orderId, status) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, locale: activeLocale })
  });

  if (!response.ok) {
    throw new Error("Failed to update order status");
  }

  return response.json();
}
```

Add click binding:

```js
orderPagePanel.addEventListener("click", async (event) => {
  const statusButton = event.target.closest("[data-order-status-action]");
  if (!statusButton) {
    return;
  }

  const orderId = getRequestedOrderId();
  statusButton.disabled = true;

  try {
    const payload = await updateOrderStatus(orderId, statusButton.dataset.nextStatus);
    renderPersistedOrder(payload.order);
  } catch (error) {
    await renderOrderPage();
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "advances persisted order status"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add order status actions"
```

---

### Task 7: Final Verification

**Files:**
- Verify: `server.js`
- Verify: `socks-product-list.html`
- Verify: `tests/api.spec.js`
- Verify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Run targeted backend tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js -- --grep "order|cart"
```

Expected: all matching API tests PASS.

- [ ] **Step 2: Run targeted frontend checkout tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "checkout|persisted order|order status"
```

Expected: all matching page tests PASS.

- [ ] **Step 3: Run cart regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "cart drawer|cart state|add-to-cart|removes selected size"
```

Expected: all matching cart tests PASS.

- [ ] **Step 4: Manual smoke check**

Run one local server:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; node server.js
```

Open:

```text
http://127.0.0.1:4173/socks-product-list.html
```

Manual flow:

```text
加购任意袜子 -> 打开购物车 -> 去结算 -> 填写表单 -> 提交订单 -> 查看订单详情 -> 模拟付款 -> 模拟处理中 -> 模拟发货 -> 模拟送达
```

Expected:

```text
订单详情可刷新保留，购物车归零，订单状态按顺序推进。
```

- [ ] **Step 5: Commit verification-only updates if any**

If no code changed during verification, skip commit. If verification required small test or copy fixes:

```powershell
git add server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "test: verify checkout order lifecycle"
```

---

## Self-Review

- Spec coverage: checkout 视图、订单 API、订单持久化、购物车清空、订单详情、状态生命周期、错误处理和测试均映射到 Task 1-7。
- Placeholder scan: plan avoids unfinished placeholder markers and incomplete task wording.
- Type consistency: order fields use `customer`, `shippingAddress`, `shippingMethod`, `items`, `totals`, `timeline`; API uses `POST /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status` consistently.
- Scope control: no login, no real payment provider, no database migration, no admin panel.

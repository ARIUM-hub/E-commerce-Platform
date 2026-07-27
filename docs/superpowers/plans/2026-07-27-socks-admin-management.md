# Socks Admin Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo-grade real admin console for products, inventory, orders, marketing configuration, and operational dashboard metrics.

**Architecture:** Add a focused `lib/repositories/admin.js` module that aggregates and mutates SQLite-backed admin data, then expose guarded `/api/admin/*` routes in `server.js`. Extend the existing single-page storefront with `view=admin`, preserving the global shell while rendering a dense black/white/gray operations dashboard that reads and writes through the new admin APIs.

**Tech Stack:** Node.js HTTP server, SQLite, Playwright, vanilla HTML/CSS/JavaScript.

---

## File Structure

- Create: `lib/repositories/admin.js`
  - Admin-only data aggregation and mutations for dashboard metrics, product summaries, inventory updates, order management, and marketing status updates.
- Modify: `server.js`
  - Admin auth guard, route parsing, `/api/admin/*` routes.
- Modify: `socks-product-list.html`
  - `view=admin`, admin tab layout, data loading, inventory/order/marketing actions, i18n copy.
- Modify: `tests/api.spec.js`
  - Admin auth, summary, products, inventory, orders, marketing API tests.
- Modify: `tests/socks-product-list.spec.js`
  - Admin view auth states, dashboard render, inventory update, order status update, marketing toggle tests.

## Task 1: Admin Auth Guard And Summary API

**Files:**
- Create: `lib/repositories/admin.js`
- Modify: `server.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: Write failing API tests for admin auth and summary**

Add these helpers near the existing API helpers in `tests/api.spec.js`:

```js
async function registerApiUser(request, { name = "Admin User", email, password = "demo1234" } = {}) {
  const response = await request.post("/api/auth/register", {
    data: { name, email, password }
  });
  expect(response.ok()).toBe(true);
  return response.headers()["set-cookie"];
}
```

Add these tests near the support/order API tests:

```js
test("requires an admin session for admin summary", async ({ request }) => {
  const response = await request.get("/api/admin/summary");

  expect(response.status()).toBe(401);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
});

test("rejects non-admin users from admin summary", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "buyer@example.com" });

  const response = await request.get("/api/admin/summary", {
    headers: { cookie }
  });

  expect(response.status()).toBe(403);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_FORBIDDEN");
});

test("returns admin dashboard summary for demo admins", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });

  const response = await request.get("/api/admin/summary", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.summary).toMatchObject({
    ordersTotal: 1,
    pendingPayment: 1,
    lowStockSkuCount: expect.any(Number),
    outOfStockSkuCount: expect.any(Number),
    activeMarketingCount: expect.any(Number)
  });
  expect(payload.recentOrders[0].id).toMatch(/^SOCK-/);
  expect(Array.isArray(payload.stockAlerts)).toBe(true);
  expect(Array.isArray(payload.workQueue)).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin summary"
```

Expected: FAIL because `/api/admin/summary` is not implemented.

- [ ] **Step 3: Create admin repository summary implementation**

Create `lib/repositories/admin.js`:

```js
const ACTIVE_FULFILLMENT_STATUSES = new Set(["paid", "processing", "shipped"]);
const PENDING_RETURN_STATUSES = new Set(["submitted", "reviewing"]);

function parsePayload(row) {
  return row ? JSON.parse(row.payload) : null;
}

function listOrderPayloads(db) {
  return db.prepare("SELECT payload FROM orders ORDER BY created_at DESC").all().map(parsePayload);
}

function getOrderTotal(order) {
  return Number(order?.totals?.total) || 0;
}

function isToday(isoValue, now = new Date()) {
  if (!isoValue) return false;
  return new Date(isoValue).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

function mapRecentOrder(order) {
  return {
    id: order.id,
    userId: order.userId || "",
    customer: order.customer || {},
    status: order.status,
    paymentStatus: order.payment?.status || "requires_payment",
    total: getOrderTotal(order),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function listInventoryRows(db) {
  return db.prepare(`
    SELECT
      variant.sku_id,
      variant.product_id,
      variant.size,
      variant.color,
      variant.material,
      variant.stock_quantity,
      variant.low_stock_threshold,
      variant.is_available,
      product.payload AS product_payload
    FROM product_variants variant
    JOIN products product ON product.id = variant.product_id
    ORDER BY product.rowid ASC, variant.rowid ASC
  `).all();
}

function mapInventoryRow(row) {
  const product = parsePayload({ payload: row.product_payload });
  const stockQuantity = Number(row.stock_quantity);
  const lowStockThreshold = Number(row.low_stock_threshold);
  const isAvailable = Boolean(row.is_available);

  return {
    skuId: row.sku_id,
    productId: row.product_id,
    productTitle: product.title,
    category: product.category,
    size: row.size,
    color: row.color,
    material: row.material,
    stockQuantity,
    lowStockThreshold,
    isAvailable,
    stockState: !isAvailable || stockQuantity <= 0
      ? "out-of-stock"
      : stockQuantity <= lowStockThreshold
        ? "low-stock"
        : "in-stock"
  };
}

function listInventory(db, filters = {}) {
  const query = String(filters.q || "").trim().toLowerCase();
  const stock = String(filters.stock || "all").trim();
  return listInventoryRows(db)
    .map(mapInventoryRow)
    .filter((item) => {
      const matchesQuery = !query
        || item.skuId.toLowerCase().includes(query)
        || item.productTitle.toLowerCase().includes(query)
        || item.category.toLowerCase().includes(query);
      const matchesStock = stock === "all" || item.stockState === stock;
      return matchesQuery && matchesStock;
    });
}

function listStockAlerts(db, limit = 8) {
  return listInventory(db)
    .filter((item) => item.stockState === "low-stock" || item.stockState === "out-of-stock")
    .slice(0, limit);
}

function countActiveMarketing(db) {
  const promotions = db.prepare("SELECT COUNT(*) AS count FROM promotions WHERE status = 'active'").get().count;
  const coupons = db.prepare("SELECT COUNT(*) AS count FROM coupons WHERE status = 'active'").get().count;
  const bundles = db.prepare("SELECT COUNT(*) AS count FROM bundles WHERE status = 'active'").get().count;
  return promotions + coupons + bundles;
}

function countPendingReturns(db) {
  const placeholders = [...PENDING_RETURN_STATUSES].map(() => "?").join(", ");
  return db.prepare(`SELECT COUNT(*) AS count FROM return_requests WHERE status IN (${placeholders})`)
    .get(...PENDING_RETURN_STATUSES).count;
}

function listWorkQueue(db) {
  const openTicketCount = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'").get().count;
  const pendingReturnCount = countPendingReturns(db);
  return [
    { type: "returns", label: "Pending returns", count: pendingReturnCount },
    { type: "support", label: "Open support tickets", count: openTicketCount }
  ];
}

function getAdminSummary(db, now = new Date()) {
  const orders = listOrderPayloads(db);
  const inventory = listInventory(db);
  const lowStockSkuCount = inventory.filter((item) => item.stockState === "low-stock").length;
  const outOfStockSkuCount = inventory.filter((item) => item.stockState === "out-of-stock").length;
  const openTicketCount = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'").get().count;

  return {
    summary: {
      ordersTotal: orders.length,
      ordersToday: orders.filter((order) => isToday(order.createdAt, now)).length,
      pendingPayment: orders.filter((order) => order.status === "pending_payment").length,
      activeFulfillment: orders.filter((order) => ACTIVE_FULFILLMENT_STATUSES.has(order.status)).length,
      grossSales: orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + getOrderTotal(order), 0),
      lowStockSkuCount,
      outOfStockSkuCount,
      pendingReturnCount: countPendingReturns(db),
      openTicketCount,
      activeMarketingCount: countActiveMarketing(db)
    },
    recentOrders: orders.slice(0, 5).map(mapRecentOrder),
    stockAlerts: listStockAlerts(db, 8),
    workQueue: listWorkQueue(db)
  };
}

module.exports = {
  getAdminSummary,
  listInventory
};
```

- [ ] **Step 4: Add admin auth guard and summary route**

In `server.js`, import:

```js
const {
  getAdminSummary
} = require("./lib/repositories/admin");
```

Add near constants:

```js
const DEMO_ADMIN_EMAILS = new Set(["admin@socks.test"]);
```

Add helper near session helpers:

```js
async function requireAdmin(request, response) {
  const user = await requireUser(request, response, {
    code: "ADMIN_AUTH_REQUIRED",
    message: "Admin authentication is required."
  });
  if (!user) return null;

  if (!DEMO_ADMIN_EMAILS.has(String(user.email || "").toLowerCase())) {
    sendError(response, 403, "ADMIN_FORBIDDEN", "Admin access is required.");
    return null;
  }

  return user;
}
```

If `requireUser` does not accept custom error options, change its signature to:

```js
async function requireUser(request, response, errorOptions = {}) {
  const { user } = await getSessionContext(request);
  if (!user) {
    sendError(
      response,
      401,
      errorOptions.code || "AUTH_REQUIRED",
      errorOptions.message || "Authentication is required."
    );
    return null;
  }

  return user;
}
```

Add route before public order/product routes:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/summary") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const payload = withDatabase((db) => getAdminSummary(db));
      sendJson(response, 200, { ok: true, ...payload });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 5: Run admin summary tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin summary"
```

Expected: admin summary tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/repositories/admin.js server.js tests/api.spec.js; git commit -m "feat: add admin summary api"
```

## Task 2: Admin Products And Inventory APIs

**Files:**
- Modify: `lib/repositories/admin.js`
- Modify: `server.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: Write failing API tests for products, inventory, and SKU update**

Add:

```js
test("returns admin product summaries for demo admins", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.get("/api/admin/products", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.products.length).toBeGreaterThan(0);
  expect(payload.products[0]).toMatchObject({
    id: "sock-01",
    title: expect.any(String),
    variantCount: expect.any(Number),
    totalStock: expect.any(Number),
    lowStockCount: expect.any(Number),
    outOfStockCount: expect.any(Number)
  });
});

test("returns filtered admin inventory rows", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.get("/api/admin/inventory?stock=low-stock&q=sock-04", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.items.length).toBeGreaterThan(0);
  payload.items.forEach((item) => {
    expect(item.stockState).toBe("low-stock");
    expect(item.skuId).toContain("sock-04");
  });
});

test("updates SKU inventory from admin API and reflects it in products", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.patch("/api/admin/inventory/sock-01-39", {
    headers: { cookie },
    data: { stockQuantity: 0, lowStockThreshold: 2, isAvailable: false }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.item).toMatchObject({
    skuId: "sock-01-39",
    stockQuantity: 0,
    lowStockThreshold: 2,
    isAvailable: false,
    stockState: "out-of-stock"
  });

  const productsResponse = await request.get("/api/products?locale=en-US&pageSize=24");
  const productsPayload = await productsResponse.json();
  const product = productsPayload.items.find((item) => item.id === "sock-01");
  expect(product.variants.find((variant) => variant.skuId === "sock-01-39")).toMatchObject({
    stockQuantity: 0,
    isAvailable: false
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin product|admin inventory|updates SKU"
```

Expected: FAIL because product/inventory admin routes are missing.

- [ ] **Step 3: Extend admin repository**

Add to `lib/repositories/admin.js`:

```js
function getProductStockSummary(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    variantCount: variants.length,
    totalStock: variants.reduce((sum, variant) => sum + (Number(variant.stockQuantity) || 0), 0),
    lowStockCount: variants.filter((variant) => {
      return variant.isAvailable && variant.stockQuantity > 0 && variant.stockQuantity <= variant.lowStockThreshold;
    }).length,
    outOfStockCount: variants.filter((variant) => !variant.isAvailable || variant.stockQuantity <= 0).length
  };
}

function listAdminProducts(db) {
  const { listProducts } = require("./products");
  return listProducts(db).map((product) => ({
    id: product.id,
    title: product.title,
    category: product.category,
    price: product.price,
    originalPrice: product.originalPrice,
    ratingValue: product.ratingValue,
    reviewCount: product.reviewCount,
    ...getProductStockSummary(product)
  }));
}

function validateInventoryPatch(body) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "stockQuantity")) {
    const stockQuantity = Number(body.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 9999) {
      return { validationError: { code: "ADMIN_STOCK_INVALID", message: "Stock quantity is invalid." } };
    }
    patch.stockQuantity = stockQuantity;
  }

  if (Object.prototype.hasOwnProperty.call(body, "lowStockThreshold")) {
    const lowStockThreshold = Number(body.lowStockThreshold);
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 999) {
      return { validationError: { code: "ADMIN_LOW_STOCK_THRESHOLD_INVALID", message: "Low stock threshold is invalid." } };
    }
    patch.lowStockThreshold = lowStockThreshold;
  }

  if (Object.prototype.hasOwnProperty.call(body, "isAvailable")) {
    patch.isAvailable = Boolean(body.isAvailable);
  }

  if (Object.keys(patch).length === 0) {
    return { validationError: { code: "ADMIN_INVENTORY_PATCH_EMPTY", message: "Inventory update is empty." } };
  }

  return { patch };
}

function updateInventoryItem(db, skuId, body) {
  const current = db.prepare("SELECT sku_id FROM product_variants WHERE sku_id = ?").get(skuId);
  if (!current) {
    return { validationError: { statusCode: 404, code: "ADMIN_SKU_NOT_FOUND", message: "SKU was not found." } };
  }

  const validation = validateInventoryPatch(body);
  if (validation.validationError) {
    return {
      validationError: {
        statusCode: 400,
        ...validation.validationError
      }
    };
  }

  const patch = validation.patch;
  const updates = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(patch, "stockQuantity")) {
    updates.push("stock_quantity = ?");
    params.push(patch.stockQuantity);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "lowStockThreshold")) {
    updates.push("low_stock_threshold = ?");
    params.push(patch.lowStockThreshold);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "isAvailable")) {
    updates.push("is_available = ?");
    params.push(patch.isAvailable ? 1 : 0);
  }

  db.prepare(`UPDATE product_variants SET ${updates.join(", ")} WHERE sku_id = ?`).run(...params, skuId);
  const item = listInventory(db).find((entry) => entry.skuId === skuId);
  return { item };
}
```

Update exports:

```js
module.exports = {
  getAdminSummary,
  listAdminProducts,
  listInventory,
  updateInventoryItem
};
```

- [ ] **Step 4: Add product and inventory routes**

In `server.js`, extend import:

```js
const {
  getAdminSummary,
  listAdminProducts,
  listInventory,
  updateInventoryItem
} = require("./lib/repositories/admin");
```

Add parser:

```js
function parseAdminInventoryPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/inventory\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add routes:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/products") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const products = withDatabase((db) => listAdminProducts(db));
      sendJson(response, 200, { ok: true, products });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/inventory") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const items = withDatabase((db) => listInventory(db, {
        stock: requestUrl.searchParams.get("stock") || "all",
        q: requestUrl.searchParams.get("q") || ""
      }));
      sendJson(response, 200, { ok: true, items });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminSkuId = parseAdminInventoryPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedAdminSkuId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateInventoryItem(db, requestedAdminSkuId, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, item: result.item });
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

- [ ] **Step 5: Run tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin product|admin inventory|updates SKU"
```

Expected: product and inventory admin API tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/repositories/admin.js server.js tests/api.spec.js; git commit -m "feat: add admin product inventory api"
```

## Task 3: Admin Orders And Marketing APIs

**Files:**
- Modify: `lib/repositories/admin.js`
- Modify: `server.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: Write failing API tests for orders and marketing**

Add:

```js
test("lists admin orders and advances an order status", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const createResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await createResponse.json()).order;

  const listResponse = await request.get("/api/admin/orders", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  expect((await listResponse.json()).orders[0].id).toBe(order.id);

  const statusResponse = await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "cancelled", locale: "en-US" }
  });
  expect(statusResponse.ok()).toBe(true);
  const statusPayload = await statusResponse.json();
  expect(statusPayload.order.status).toBe("cancelled");
  expect(statusPayload.order.timeline.map((entry) => entry.status)).toContain("cancelled");
});

test("returns and toggles admin marketing resources", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const listResponse = await request.get("/api/admin/marketing", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  const listPayload = await listResponse.json();
  expect(listPayload.coupons.map((coupon) => coupon.code)).toContain("SOCK10");

  const updateResponse = await request.patch("/api/admin/marketing/coupon/SOCK10/status", {
    headers: { cookie },
    data: { status: "inactive" }
  });
  expect(updateResponse.ok()).toBe(true);
  expect((await updateResponse.json()).resource).toMatchObject({
    code: "SOCK10",
    status: "inactive"
  });

  const marketingResponse = await request.get("/api/marketing");
  const marketingPayload = await marketingResponse.json();
  expect(marketingPayload.coupons.map((coupon) => coupon.code)).not.toContain("SOCK10");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin orders|admin marketing"
```

Expected: FAIL because orders/marketing admin routes are missing.

- [ ] **Step 3: Extend admin repository for orders and marketing**

Add:

```js
const ORDER_TRANSITIONS = {
  pending_payment: new Set(["paid", "cancelled"]),
  paid: new Set(["processing"]),
  processing: new Set(["shipped"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([])
};

function listAdminOrders(db, filters = {}) {
  const status = String(filters.status || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();
  return listOrderPayloads(db)
    .filter((order) => !status || order.status === status)
    .filter((order) => {
      return !query
        || order.id.toLowerCase().includes(query)
        || String(order.customer?.contact || "").toLowerCase().includes(query)
        || String(order.customer?.name || "").toLowerCase().includes(query);
    })
    .map(mapRecentOrder);
}

function findAdminOrder(db, orderId) {
  const order = parsePayload(db.prepare("SELECT payload FROM orders WHERE id = ?").get(orderId));
  if (!order) return null;
  return order;
}

function updateAdminOrderStatus(db, orderId, nextStatus, locale, createTimelineEntry, saveOrder) {
  const order = findAdminOrder(db, orderId);
  if (!order) {
    return { validationError: { statusCode: 404, code: "ADMIN_ORDER_NOT_FOUND", message: "Order was not found." } };
  }

  if (!ORDER_TRANSITIONS[nextStatus]) {
    return { validationError: { statusCode: 400, code: "ADMIN_ORDER_STATUS_INVALID", message: "Order status is invalid." } };
  }

  const allowed = ORDER_TRANSITIONS[order.status] || new Set();
  if (!allowed.has(nextStatus)) {
    return { validationError: { statusCode: 409, code: "ADMIN_ORDER_TRANSITION_INVALID", message: "Order status transition is not allowed." } };
  }

  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push(createTimelineEntry(nextStatus, locale));
  saveOrder(db, order);
  return { order };
}

function mapMarketingRow(row, idKey) {
  return {
    [idKey]: idKey === "code" ? row.code : row.id,
    type: row.type || undefined,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...parsePayload(row)
  };
}

function listAdminMarketing(db) {
  return {
    coupons: db.prepare("SELECT * FROM coupons ORDER BY rowid ASC").all().map((row) => mapMarketingRow(row, "code")),
    promotions: db.prepare("SELECT * FROM promotions ORDER BY rowid ASC").all().map((row) => mapMarketingRow(row, "id")),
    bundles: db.prepare("SELECT * FROM bundles ORDER BY rowid ASC").all().map((row) => mapMarketingRow(row, "id"))
  };
}

function updateMarketingStatus(db, type, id, status) {
  const normalizedType = String(type || "").trim();
  const normalizedStatus = String(status || "").trim();
  if (!["coupon", "promotion", "bundle"].includes(normalizedType)) {
    return { validationError: { statusCode: 400, code: "ADMIN_MARKETING_TYPE_INVALID", message: "Marketing type is invalid." } };
  }
  if (!["active", "inactive"].includes(normalizedStatus)) {
    return { validationError: { statusCode: 400, code: "ADMIN_MARKETING_STATUS_INVALID", message: "Marketing status is invalid." } };
  }

  const config = {
    coupon: { table: "coupons", key: "code", idKey: "code" },
    promotion: { table: "promotions", key: "id", idKey: "id" },
    bundle: { table: "bundles", key: "id", idKey: "id" }
  }[normalizedType];

  const result = db.prepare(`UPDATE ${config.table} SET status = ? WHERE ${config.key} = ?`).run(normalizedStatus, id);
  if (result.changes !== 1) {
    return { validationError: { statusCode: 404, code: "ADMIN_MARKETING_RESOURCE_NOT_FOUND", message: "Marketing resource was not found." } };
  }

  const row = db.prepare(`SELECT * FROM ${config.table} WHERE ${config.key} = ?`).get(id);
  return { resource: mapMarketingRow(row, config.idKey) };
}
```

Update exports:

```js
module.exports = {
  getAdminSummary,
  listAdminProducts,
  listInventory,
  updateInventoryItem,
  listAdminOrders,
  findAdminOrder,
  updateAdminOrderStatus,
  listAdminMarketing,
  updateMarketingStatus
};
```

- [ ] **Step 4: Add order and marketing routes**

In `server.js`, extend imports:

```js
  findAdminOrder,
  listAdminMarketing,
  listAdminOrders,
  updateAdminOrderStatus,
  updateMarketingStatus
```

Add parsers:

```js
function parseAdminOrderPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminOrderStatusPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminMarketingStatusPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/marketing\/([^/]+)\/([^/]+)\/status$/);
  return match ? { type: decodeURIComponent(match[1]), id: decodeURIComponent(match[2]) } : null;
}
```

Add routes:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/orders") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const orders = withDatabase((db) => listAdminOrders(db, {
        status: requestUrl.searchParams.get("status") || "",
        q: requestUrl.searchParams.get("q") || ""
      }));
      sendJson(response, 200, { ok: true, orders });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminOrderId = parseAdminOrderPath(requestUrl.pathname);
  if (request.method === "GET" && requestedAdminOrderId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const order = withDatabase((db) => findAdminOrder(db, requestedAdminOrderId));
      if (!order) {
        sendError(response, 404, "ADMIN_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }
      sendJson(response, 200, { ok: true, order });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminStatusOrderId = parseAdminOrderStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedAdminStatusOrderId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateAdminOrderStatus(
        db,
        requestedAdminStatusOrderId,
        String(body.status || "").trim(),
        normalizeLocale(body.locale),
        createTimelineEntry,
        saveOrder
      ));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, order: result.order });
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

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/marketing") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const marketing = withDatabase((db) => listAdminMarketing(db));
      sendJson(response, 200, { ok: true, ...marketing });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedMarketingStatus = parseAdminMarketingStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedMarketingStatus) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;
      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateMarketingStatus(
        db,
        requestedMarketingStatus.type,
        requestedMarketingStatus.id,
        body.status
      ));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, resource: result.resource });
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

- [ ] **Step 5: Run tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin orders|admin marketing"
```

Expected: admin order and marketing API tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/repositories/admin.js server.js tests/api.spec.js; git commit -m "feat: add admin order marketing api"
```

## Task 4: Admin View Shell And Read-Only Tabs

**Files:**
- Modify: `socks-product-list.html`
- Test: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing UI tests for admin access states and tabs**

Add helper:

```js
async function registerAdminFromUi(page) {
  await registerFromUi(page, {
    name: "Admin User",
    email: "admin@socks.test",
    password: "demo1234"
  });
}
```

Add tests:

```js
test("shows login prompt for anonymous admin view access", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=admin");

  await expect(page.locator("[data-admin-auth-required]")).toBeVisible();
  await expect(page.locator("[data-admin-auth-required]")).toContainText(/登录|sign in/i);
});

test("shows forbidden state for non-admin users on admin view", async ({ page }) => {
  await registerFromUi(page, { email: "buyer@example.com" });

  await page.goto("/socks-product-list.html?view=admin");

  await expect(page.locator("[data-admin-forbidden]")).toBeVisible();
});

test("renders admin dashboard tabs for demo admins", async ({ page }) => {
  await registerAdminFromUi(page);

  await page.goto("/socks-product-list.html?view=admin");

  await expect(page.locator("[data-admin-view]")).toBeVisible();
  await expect(page.locator("[data-admin-tab='dashboard']")).toBeVisible();
  await expect(page.locator("[data-admin-tab='products']")).toBeVisible();
  await expect(page.locator("[data-admin-tab='inventory']")).toBeVisible();
  await expect(page.locator("[data-admin-tab='orders']")).toBeVisible();
  await expect(page.locator("[data-admin-tab='marketing']")).toBeVisible();
  await expect(page.locator("[data-admin-kpi]")).not.toHaveCount(0);
});

test("renders admin products inventory orders and marketing tabs", async ({ page }) => {
  await registerAdminFromUi(page);

  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='products']").click();
  await expect(page.locator("[data-admin-product-row]")).not.toHaveCount(0);

  await page.locator("[data-admin-tab='inventory']").click();
  await expect(page.locator("[data-admin-inventory-row]")).not.toHaveCount(0);

  await page.locator("[data-admin-tab='orders']").click();
  await expect(page.locator("[data-admin-orders-empty], [data-admin-order-row]").first()).toBeVisible();

  await page.locator("[data-admin-tab='marketing']").click();
  await expect(page.locator("[data-admin-marketing-row]")).not.toHaveCount(0);
});
```

- [ ] **Step 2: Run UI tests and verify fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "admin"
```

Expected: FAIL because `view=admin` is missing.

- [ ] **Step 3: Add admin view markup and CSS**

Add after support/order views:

```html
    <div class="admin-view" data-admin-view hidden>
      <section class="hero hero--compact">
        <p class="hero__eyebrow" data-admin-eyebrow>Admin</p>
        <h1 class="hero__title" data-admin-title>后台管理</h1>
        <p class="hero__description" data-admin-copy>管理商品、库存、订单、优惠和运营指标。</p>
      </section>
      <section class="admin-shell">
        <div class="admin-state" data-admin-auth-required hidden>
          <h2>请先登录管理员账号</h2>
          <a class="order-button order-button--primary" href="/socks-product-list.html?view=auth&mode=login">去登录</a>
        </div>
        <div class="admin-state" data-admin-forbidden hidden>
          <h2>当前账号没有后台权限</h2>
          <p>请使用 admin@socks.test 演示管理员账号。</p>
        </div>
        <div data-admin-console hidden>
          <nav class="admin-tabs" data-admin-tabs aria-label="后台模块">
            <button type="button" data-admin-tab="dashboard">看板</button>
            <button type="button" data-admin-tab="products">商品</button>
            <button type="button" data-admin-tab="inventory">库存</button>
            <button type="button" data-admin-tab="orders">订单</button>
            <button type="button" data-admin-tab="marketing">优惠</button>
          </nav>
          <div class="admin-panel" data-admin-panel></div>
        </div>
      </section>
    </div>
```

Add CSS near support/admin-related CSS:

```css
    .admin-shell {
      display: grid;
      gap: 18px;
      max-width: 1180px;
      margin: 0 auto 48px;
      padding: 0 24px;
    }

    .admin-state,
    .admin-panel {
      border: 1px solid var(--line);
      background: #ffffff;
      padding: 22px;
      box-shadow: 0 18px 45px rgba(17, 17, 17, 0.07);
    }

    .admin-tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      border-bottom: 1px solid var(--line);
      padding-bottom: 10px;
    }

    .admin-tabs button {
      border: 1px solid var(--line);
      background: #f7f7f7;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
    }

    .admin-tabs button.is-active {
      background: #111111;
      color: #ffffff;
      border-color: #111111;
    }

    .admin-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .admin-card,
    .admin-row {
      border: 1px solid var(--line);
      padding: 14px;
      background: #fbfbfb;
    }

    .admin-table {
      display: grid;
      gap: 10px;
    }

    .admin-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      align-items: center;
    }
```

- [ ] **Step 4: Add admin routing, API helpers, and read-only renderers**

Add constants and DOM refs:

```js
    const ADMIN_VIEW_KEY = "admin";
    const adminView = document.querySelector("[data-admin-view]");
    const adminAuthRequired = document.querySelector("[data-admin-auth-required]");
    const adminForbidden = document.querySelector("[data-admin-forbidden]");
    const adminConsole = document.querySelector("[data-admin-console]");
    const adminTabs = document.querySelector("[data-admin-tabs]");
    const adminPanel = document.querySelector("[data-admin-panel]");
```

Add `getCurrentView()` branch:

```js
      if (view === ADMIN_VIEW_KEY) {
        return ADMIN_VIEW_KEY;
      }
```

Update `syncPageView()`:

```js
      const isAdminView = currentView === ADMIN_VIEW_KEY;
      adminView.hidden = !isAdminView;
```

Add admin API helper:

```js
async function fetchAdminJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    const error = await createCartRequestError(response, "Admin request failed");
    throw error;
  }
  return response.json();
}
```

Add renderers:

```js
let activeAdminTab = "dashboard";
let adminData = { summary: null, products: [], inventory: [], orders: [], marketing: null };

function isCurrentUserAdmin() {
  return String(currentUser?.email || "").toLowerCase() === "admin@socks.test";
}

function setAdminAccessState(state) {
  adminAuthRequired.hidden = state !== "auth";
  adminForbidden.hidden = state !== "forbidden";
  adminConsole.hidden = state !== "ready";
}

function renderAdminTabs() {
  adminTabs.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === activeAdminTab);
  });
}

function createKpiMarkup(summary) {
  const cards = [
    ["Orders", summary.ordersTotal],
    ["Sales", formatCurrency(summary.grossSales)],
    ["Low stock", summary.lowStockSkuCount],
    ["Open tickets", summary.openTicketCount]
  ];
  return `<div class="admin-grid">${cards.map(([label, value]) => `
    <article class="admin-card" data-admin-kpi><strong>${value}</strong><span>${label}</span></article>
  `).join("")}</div>`;
}

async function renderAdminDashboard() {
  const payload = await fetchAdminJson("/api/admin/summary");
  adminData.summary = payload;
  adminPanel.innerHTML = `
    ${createKpiMarkup(payload.summary)}
    <div class="admin-table">
      ${payload.recentOrders.map((order) => `
        <article class="admin-row" data-admin-recent-order>
          <span>${escapeHtml(order.id)}</span>
          <span>${escapeHtml(order.status)}</span>
          <span>${formatCurrency(order.total)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

async function renderAdminProducts() {
  const payload = await fetchAdminJson("/api/admin/products");
  adminData.products = payload.products;
  adminPanel.innerHTML = `<div class="admin-table">${payload.products.map((product) => `
    <article class="admin-row" data-admin-product-row>
      <span>${escapeHtml(product.id)}</span>
      <strong>${escapeHtml(product.title)}</strong>
      <span>${escapeHtml(product.category)}</span>
      <span>${formatCurrency(product.price)}</span>
      <span>${product.variantCount} SKU</span>
      <span>${product.totalStock}</span>
    </article>
  `).join("")}</div>`;
}

async function renderAdminInventory() {
  const payload = await fetchAdminJson("/api/admin/inventory");
  adminData.inventory = payload.items;
  adminPanel.innerHTML = `<div class="admin-table">${payload.items.map((item) => `
    <article class="admin-row" data-admin-inventory-row data-sku-id="${escapeHtml(item.skuId)}">
      <span>${escapeHtml(item.skuId)}</span>
      <strong>${escapeHtml(item.productTitle)}</strong>
      <span>${escapeHtml(item.size)}</span>
      <span>${item.stockQuantity}</span>
      <span>${escapeHtml(item.stockState)}</span>
    </article>
  `).join("")}</div>`;
}

async function renderAdminOrders() {
  const payload = await fetchAdminJson("/api/admin/orders");
  adminData.orders = payload.orders;
  adminPanel.innerHTML = payload.orders.length
    ? `<div class="admin-table">${payload.orders.map((order) => `
      <article class="admin-row" data-admin-order-row data-order-id="${escapeHtml(order.id)}">
        <span>${escapeHtml(order.id)}</span>
        <span>${escapeHtml(order.status)}</span>
        <span>${formatCurrency(order.total)}</span>
      </article>
    `).join("")}</div>`
    : `<div class="empty-state" data-admin-orders-empty>No orders yet.</div>`;
}

async function renderAdminMarketing() {
  const payload = await fetchAdminJson("/api/admin/marketing");
  adminData.marketing = payload;
  const rows = [
    ...payload.coupons.map((item) => ({ type: "coupon", id: item.code, status: item.status })),
    ...payload.promotions.map((item) => ({ type: "promotion", id: item.id, status: item.status })),
    ...payload.bundles.map((item) => ({ type: "bundle", id: item.id, status: item.status }))
  ];
  adminPanel.innerHTML = `<div class="admin-table">${rows.map((row) => `
    <article class="admin-row" data-admin-marketing-row data-marketing-type="${row.type}" data-marketing-id="${escapeHtml(row.id)}">
      <span>${escapeHtml(row.type)}</span>
      <strong>${escapeHtml(row.id)}</strong>
      <span>${escapeHtml(row.status)}</span>
    </article>
  `).join("")}</div>`;
}

async function renderAdminPanel() {
  renderAdminTabs();
  if (activeAdminTab === "products") return renderAdminProducts();
  if (activeAdminTab === "inventory") return renderAdminInventory();
  if (activeAdminTab === "orders") return renderAdminOrders();
  if (activeAdminTab === "marketing") return renderAdminMarketing();
  return renderAdminDashboard();
}

async function renderAdminView() {
  if (!currentUser) {
    setAdminAccessState("auth");
    return;
  }
  if (!isCurrentUserAdmin()) {
    setAdminAccessState("forbidden");
    return;
  }
  setAdminAccessState("ready");
  await renderAdminPanel();
}
```

Call `renderAdminView()` in locale rerender and initialization branches when `getCurrentView() === ADMIN_VIEW_KEY`.

- [ ] **Step 5: Add tab click handler**

Add:

```js
adminTabs.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-admin-tab]");
  if (!tab) return;
  activeAdminTab = tab.dataset.adminTab;
  await renderAdminPanel();
});
```

- [ ] **Step 6: Run UI tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "admin"
```

Expected: admin read-only UI tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: add admin console shell"
```

## Task 5: Admin UI Mutations

**Files:**
- Modify: `socks-product-list.html`
- Test: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing UI tests for inventory, order, and marketing actions**

Add:

```js
test("updates inventory from the admin inventory tab", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='inventory']").click();

  const row = page.locator("[data-admin-inventory-row][data-sku-id='sock-01-39']");
  await row.locator("[data-admin-stock-input]").fill("0");
  await row.locator("[data-admin-inventory-save]").click();

  await expect(row).toContainText("out-of-stock");
});

test("advances an order from the admin orders tab", async ({ page }) => {
  await registerAdminFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();

  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='orders']").click();
  await page.locator("[data-admin-order-action='cancelled']").first().click();

  await expect(page.locator("[data-admin-order-row]").first()).toContainText("cancelled");
});

test("toggles a coupon from the admin marketing tab", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='marketing']").click();

  const row = page.locator("[data-admin-marketing-row][data-marketing-id='SOCK10']");
  await row.locator("[data-admin-marketing-toggle]").click();

  await expect(row).toContainText("inactive");
});
```

- [ ] **Step 2: Run tests and verify fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "updates inventory|advances an order|toggles a coupon"
```

Expected: FAIL because action controls are missing.

- [ ] **Step 3: Add admin mutation API helpers**

Add:

```js
async function patchAdminJson(path, payload) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw await createCartRequestError(response, "Admin update failed");
  }
  return response.json();
}
```

- [ ] **Step 4: Add inventory row controls and save handler**

Update inventory row markup:

```js
<input class="advanced-filters__input" type="number" min="0" max="9999" value="${item.stockQuantity}" data-admin-stock-input>
<input class="advanced-filters__input" type="number" min="0" max="999" value="${item.lowStockThreshold}" data-admin-low-stock-input>
<label><input type="checkbox" data-admin-available-input ${item.isAvailable ? "checked" : ""}> Available</label>
<button class="order-button order-button--secondary" type="button" data-admin-inventory-save>Save</button>
```

Add click handler in `adminPanel`:

```js
const inventorySave = event.target.closest("[data-admin-inventory-save]");
if (inventorySave) {
  const row = inventorySave.closest("[data-admin-inventory-row]");
  await patchAdminJson(`/api/admin/inventory/${encodeURIComponent(row.dataset.skuId)}`, {
    stockQuantity: Number(row.querySelector("[data-admin-stock-input]").value),
    lowStockThreshold: Number(row.querySelector("[data-admin-low-stock-input]").value),
    isAvailable: row.querySelector("[data-admin-available-input]").checked
  });
  await renderAdminInventory();
  return;
}
```

- [ ] **Step 5: Add order action controls**

Add helper:

```js
function getAdminOrderActions(status) {
  if (status === "pending_payment") return ["paid", "cancelled"];
  if (status === "paid") return ["processing"];
  if (status === "processing") return ["shipped"];
  if (status === "shipped") return ["delivered"];
  return [];
}
```

Update admin order row markup:

```js
<span>
  ${getAdminOrderActions(order.status).map((status) => `
    <button class="order-button order-button--secondary" type="button" data-admin-order-action="${status}">${status}</button>
  `).join("")}
</span>
```

Add click handler:

```js
const orderAction = event.target.closest("[data-admin-order-action]");
if (orderAction) {
  const row = orderAction.closest("[data-admin-order-row]");
  await patchAdminJson(`/api/admin/orders/${encodeURIComponent(row.dataset.orderId)}/status`, {
    status: orderAction.dataset.adminOrderAction,
    locale: activeLocale
  });
  await renderAdminOrders();
  return;
}
```

- [ ] **Step 6: Add marketing toggle controls**

Update marketing row markup:

```js
<button class="order-button order-button--secondary" type="button" data-admin-marketing-toggle>
  ${row.status === "active" ? "Disable" : "Enable"}
</button>
```

Add click handler:

```js
const marketingToggle = event.target.closest("[data-admin-marketing-toggle]");
if (marketingToggle) {
  const row = marketingToggle.closest("[data-admin-marketing-row]");
  const nextStatus = row.textContent.includes("active") && !row.textContent.includes("inactive") ? "inactive" : "active";
  await patchAdminJson(
    `/api/admin/marketing/${encodeURIComponent(row.dataset.marketingType)}/${encodeURIComponent(row.dataset.marketingId)}/status`,
    { status: nextStatus }
  );
  await renderAdminMarketing();
}
```

- [ ] **Step 7: Run mutation UI tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "updates inventory|advances an order|toggles a coupon"
```

Expected: mutation UI tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: add admin console actions"
```

## Task 6: Verification And PR Update

**Files:**
- Modify only if verification reveals a focused issue.

- [ ] **Step 1: Run admin API regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "admin"
```

Expected: all admin API tests pass.

- [ ] **Step 2: Run admin UI regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "admin"
```

Expected: all admin UI tests pass.

- [ ] **Step 3: Run safety regression for affected user flows**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "products|cart|checkout|order|marketing|payment"
```

Expected: affected API tests pass.

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "payment|checkout|order|marketing|inventory|cart"
```

Expected: affected UI tests pass or existing skipped legacy tests remain skipped.

- [ ] **Step 4: Run full API suite**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js
```

Expected: API suite passes.

- [ ] **Step 5: Clean fixture noise**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

Expected: test fixture JSON files return to committed state.

- [ ] **Step 6: Check final status**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git diff --check; git status --short
```

Expected: no whitespace errors and no uncommitted changes after task commits.

- [ ] **Step 7: Push branch and update PR**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git push
```

Expected: branch pushes to existing PR branch.

## Self-Review

- Spec coverage: Product management, inventory management, order management, marketing configuration, dashboard metrics, admin auth, SQLite consistency, UI tabs, and verification are each mapped to at least one task.
- Placeholder scan: The plan uses concrete file paths, route names, selectors, test names, commands, and expected outcomes; no unresolved implementation markers remain.
- Type consistency: The same names are used throughout: `getAdminSummary`, `listAdminProducts`, `listInventory`, `updateInventoryItem`, `listAdminOrders`, `updateAdminOrderStatus`, `listAdminMarketing`, `updateMarketingStatus`, `ADMIN_VIEW_KEY`, and `/api/admin/*`.
- Scope control: The plan excludes complex RBAC, product creation, image upload, rich text editing, complex promotion rule editing, reporting exports, support replies, and inventory import.

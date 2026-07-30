# Socks Fulfillment Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add demo-real fulfillment, address-based delivery estimates, tracking, order cancellation, and refund progress to the socks storefront.

**Architecture:** Keep the existing Node HTTP + SQLite + vanilla storefront app. Add focused `fulfillment` and `refunds` repositories, persist fulfillment/refund events in SQLite, expose small `/api/orders/:id/...` routes, then render the new lifecycle data in checkout, order history, order detail, and admin order management.

**Tech Stack:** Node.js HTTP server, SQLite repository modules, vanilla HTML/CSS/JS, Playwright API/UI tests.

---

## Safety Notes

- Use UTF-8 PowerShell prefix for every command:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8;
```

- Do not dispatch background agents for this feature.
- Run Playwright with `--workers=1`.
- Avoid high-frequency health checks, model probes, or retry loops.
- Clean fixture noise before commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

## File Map

- Modify `lib/database.js`: add fulfillment/refund tables and migration `0006_fulfillment_refunds`.
- Create `lib/repositories/fulfillment.js`: shipping methods, address-zone calculation, fulfillment creation, tracking number/events, fulfillment status transitions.
- Create `lib/repositories/refunds.js`: refund creation, refund events, refund status transitions, order refund synchronization.
- Modify `lib/repositories/orders.js`: keep persistence helpers usable by fulfillment/refund modules; no large refactor.
- Modify `lib/repositories/admin.js`: include fulfillment/refund summaries and support admin lifecycle actions.
- Modify `server.js`: import repositories, add API routes, wire order creation/cancel/fulfillment/refund transitions.
- Modify `public/js/storefront-app.js`: render checkout delivery estimates, order detail fulfillment/refund cards, cancel buttons, admin controls.
- Modify `socks-product-list.html`: add compact lifecycle card styles if existing order styles are not enough.
- Modify `tests/api.spec.js`: add API coverage for shipping estimates, fulfillment, cancellation, refunds.
- Modify `tests/socks-product-list.spec.js`: add UI coverage for checkout estimates, tracking display, cancellation, refund progress, admin actions.

---

### Task 1: Fulfillment and Refund Schema

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/database.js`

- [ ] **Step 1: Write failing schema tests**

Add near the existing database initialization tests in `tests/api.spec.js`:

```js
test("initializes SQLite fulfillment and refund lifecycle tables", async () => {
  const { createDatabase, initializeDatabase } = require("../lib/database");
  const db = createDatabase(":memory:");
  initializeDatabase(db);

  const fulfillmentTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fulfillments'").get();
  const fulfillmentEventTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fulfillment_events'").get();
  const refundTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refunds'").get();
  const refundEventTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refund_events'").get();

  expect(fulfillmentTable).toEqual({ name: "fulfillments" });
  expect(fulfillmentEventTable).toEqual({ name: "fulfillment_events" });
  expect(refundTable).toEqual({ name: "refunds" });
  expect(refundEventTable).toEqual({ name: "refund_events" });

  db.close();
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "fulfillment and refund lifecycle tables" --workers=1
```

Expected: FAIL because the four tables do not exist.

- [ ] **Step 3: Add schema helper**

In `lib/database.js`, add after `ensureProductPageCommerceTables(db)`:

```js
function ensureFulfillmentAndRefundTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fulfillments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      status TEXT NOT NULL,
      shipping_method_id TEXT NOT NULL,
      carrier TEXT NOT NULL,
      tracking_number TEXT,
      estimated_delivery_date TEXT NOT NULL,
      delivery_window_start TEXT NOT NULL,
      delivery_window_end TEXT NOT NULL,
      address_zone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS fulfillment_events (
      id TEXT PRIMARY KEY,
      fulfillment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (fulfillment_id) REFERENCES fulfillments(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_id TEXT,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      method TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS refund_events (
      id TEXT PRIMARY KEY,
      refund_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON fulfillments(order_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_user ON fulfillments(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_events_order ON fulfillment_events(order_id, at);
    CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_refund_events_order ON refund_events(order_id, at);
  `);
}
```

- [ ] **Step 4: Register migration**

In the `migrations` array in `lib/database.js`, add:

```js
  {
    id: "0006_fulfillment_refunds",
    name: "Add fulfillment and refund lifecycle tables",
    up(db) {
      ensureFulfillmentAndRefundTables(db);
    }
  }
```

- [ ] **Step 5: Verify green**

Run:

```powershell
npx playwright test tests/api.spec.js -g "fulfillment and refund lifecycle tables|records schema migrations" --workers=1
```

Expected: PASS.

---

### Task 2: Shipping Methods and Fulfillment Repository

**Files:**
- Modify: `tests/api.spec.js`
- Create: `lib/repositories/fulfillment.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing shipping-method API test**

Add near checkout/order API tests in `tests/api.spec.js`:

```js
test("returns address-aware shipping methods with delivery windows", async ({ request }) => {
  const westResponse = await request.get("/api/shipping-methods?region=WA&postalCode=98101&locale=en-US");
  expect(westResponse.ok()).toBe(true);
  const westPayload = await westResponse.json();

  expect(westPayload.methods.map((method) => method.id)).toEqual(["standard", "express", "economy"]);
  expect(westPayload.methods.find((method) => method.id === "standard")).toMatchObject({
    fee: 0,
    addressZone: "west",
    deliveryDays: 4
  });

  const remoteResponse = await request.get("/api/shipping-methods?region=AK&postalCode=99501&locale=en-US");
  expect(remoteResponse.ok()).toBe(true);
  const remotePayload = await remoteResponse.json();
  expect(remotePayload.methods.find((method) => method.id === "standard")).toMatchObject({
    addressZone: "remote",
    deliveryDays: 6
  });
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "address-aware shipping methods" --workers=1
```

Expected: FAIL because `/api/shipping-methods` is missing.

- [ ] **Step 3: Create fulfillment repository**

Create `lib/repositories/fulfillment.js`:

```js
const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);
const fulfillmentStatusTransitions = {
  not_started: new Set(["preparing", "cancelled"]),
  preparing: new Set(["label_created", "cancelled"]),
  label_created: new Set(["in_transit"]),
  in_transit: new Set(["out_for_delivery"]),
  out_for_delivery: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([])
};

const shippingMethodConfigs = {
  standard: { id: "standard", fee: 0, baseDays: 4, minimumDays: 3, carrier: "Socks Standard", labels: { "zh-CN": "标准配送", "en-US": "Standard delivery" } },
  express: { id: "express", fee: 12, baseDays: 2, minimumDays: 1, carrier: "Socks Express", labels: { "zh-CN": "加急配送", "en-US": "Express delivery" } },
  economy: { id: "economy", fee: 0, baseDays: 6, minimumDays: 5, carrier: "Socks Economy", labels: { "zh-CN": "经济配送", "en-US": "Economy delivery" } }
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDate(date, locale = "zh-CN") {
  return new Intl.DateTimeFormat(locale === "en-US" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function getAddressZone({ region = "", postalCode = "" } = {}) {
  const normalizedRegion = String(region || "").trim().toUpperCase();
  const normalizedPostal = String(postalCode || "").trim();
  if (["AK", "HI"].includes(normalizedRegion)) return "remote";
  if (["NY", "FL", "TX"].includes(normalizedRegion)) return "far";
  if (["WA", "CA", "OR"].includes(normalizedRegion)) return "west";
  if (!/^[0-9]{5}/.test(normalizedPostal)) return "remote";
  return "standard";
}

function getAddressZoneExtraDays(zone) {
  if (zone === "remote") return 2;
  if (zone === "far") return 1;
  return 0;
}

function getShippingMethodsForAddress(address = {}, locale = "zh-CN", now = new Date()) {
  const normalizedLocale = normalizeLocale(locale);
  const addressZone = getAddressZone(address);
  const extraDays = getAddressZoneExtraDays(addressZone);

  return Object.values(shippingMethodConfigs).map((method) => {
    const deliveryDays = Math.max(method.minimumDays, method.baseDays + extraDays);
    const estimatedDate = addDays(now, deliveryDays);
    const windowEnd = addDays(estimatedDate, 1);
    return {
      id: method.id,
      label: method.labels[normalizedLocale],
      fee: method.fee,
      carrier: method.carrier,
      deliveryDays,
      addressZone,
      estimatedDeliveryDate: estimatedDate.toISOString(),
      estimatedDeliveryLabel: formatDate(estimatedDate, normalizedLocale),
      deliveryWindow: {
        start: estimatedDate.toISOString(),
        end: windowEnd.toISOString(),
        label: `${formatDate(estimatedDate, normalizedLocale)} - ${formatDate(windowEnd, normalizedLocale)}`
      }
    };
  });
}

function getShippingMethodForOrder(methodId, address = {}, locale = "zh-CN", now = new Date()) {
  return getShippingMethodsForAddress(address, locale, now).find((method) => method.id === methodId) || null;
}

function getFulfillmentStatusLabel(status, locale = "zh-CN") {
  const labels = {
    not_started: { "zh-CN": "未开始履约", "en-US": "Not started" },
    preparing: { "zh-CN": "仓库处理中", "en-US": "Preparing" },
    label_created: { "zh-CN": "已生成发货单", "en-US": "Label created" },
    in_transit: { "zh-CN": "运输中", "en-US": "In transit" },
    out_for_delivery: { "zh-CN": "派送中", "en-US": "Out for delivery" },
    delivered: { "zh-CN": "已送达", "en-US": "Delivered" },
    cancelled: { "zh-CN": "履约已取消", "en-US": "Fulfillment cancelled" }
  };
  return labels[status]?.[normalizeLocale(locale)] || status;
}

function buildTrackingNumber(db, now = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM fulfillments WHERE tracking_number LIKE ?").get(`TRK-${stamp}-%`);
  return `TRK-${stamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function parseFulfillmentRow(row) {
  if (!row) return null;
  return JSON.parse(row.payload);
}

function listFulfillmentEvents(db, orderId) {
  return db.prepare(`
    SELECT status, label, location, description, at
    FROM fulfillment_events
    WHERE order_id = ?
    ORDER BY at ASC, rowid ASC
  `).all(orderId);
}

function findFulfillmentByOrderId(db, orderId) {
  const fulfillment = parseFulfillmentRow(db.prepare("SELECT payload FROM fulfillments WHERE order_id = ?").get(orderId));
  if (!fulfillment) return null;
  return { ...fulfillment, events: listFulfillmentEvents(db, orderId) };
}

function insertFulfillmentEvent(db, fulfillment, status, locale = "zh-CN", options = {}) {
  const now = options.at || new Date().toISOString();
  const event = {
    status,
    label: getFulfillmentStatusLabel(status, locale),
    location: options.location || "Socks Depot Fulfillment Center",
    description: options.description || getFulfillmentStatusLabel(status, locale),
    at: now
  };
  db.prepare(`
    INSERT INTO fulfillment_events (id, fulfillment_id, order_id, status, label, location, description, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`fulfillment-event-${crypto.randomUUID()}`, fulfillment.id, fulfillment.orderId, event.status, event.label, event.location, event.description, event.at);
  return event;
}

function createFulfillmentForOrder(db, order, shippingMethod, locale = "zh-CN") {
  const now = new Date().toISOString();
  const fulfillment = {
    id: `fulfillment-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "not_started",
    shippingMethodId: shippingMethod.id,
    shippingMethodLabel: shippingMethod.label,
    carrier: shippingMethod.carrier,
    trackingNumber: "",
    estimatedDeliveryDate: shippingMethod.estimatedDeliveryDate,
    estimatedDeliveryLabel: shippingMethod.estimatedDeliveryLabel,
    deliveryWindow: shippingMethod.deliveryWindow,
    addressZone: shippingMethod.addressZone,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO fulfillments (
      id, order_id, user_id, status, shipping_method_id, carrier, tracking_number,
      estimated_delivery_date, delivery_window_start, delivery_window_end, address_zone,
      created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fulfillment.id,
    fulfillment.orderId,
    fulfillment.userId,
    fulfillment.status,
    fulfillment.shippingMethodId,
    fulfillment.carrier,
    null,
    fulfillment.estimatedDeliveryDate,
    fulfillment.deliveryWindow.start,
    fulfillment.deliveryWindow.end,
    fulfillment.addressZone,
    fulfillment.createdAt,
    fulfillment.updatedAt,
    JSON.stringify(fulfillment)
  );

  insertFulfillmentEvent(db, fulfillment, "not_started", locale);
  return findFulfillmentByOrderId(db, order.id);
}

function saveFulfillment(db, fulfillment) {
  db.prepare(`
    UPDATE fulfillments
    SET status = ?, tracking_number = ?, updated_at = ?, payload = ?
    WHERE id = ?
  `).run(
    fulfillment.status,
    fulfillment.trackingNumber || null,
    fulfillment.updatedAt,
    JSON.stringify({ ...fulfillment, events: undefined }),
    fulfillment.id
  );
  return fulfillment;
}

function updateFulfillmentStatus(db, { order, fulfillment, status, locale = "zh-CN", saveOrder, createTimelineEntry }) {
  const nextStatus = String(status || "").trim();
  if (!fulfillmentStatusTransitions[nextStatus]) {
    return { validationError: { statusCode: 400, code: "FULFILLMENT_STATUS_INVALID", message: "Fulfillment status is invalid." } };
  }
  const allowed = fulfillmentStatusTransitions[fulfillment.status] || new Set();
  if (!allowed.has(nextStatus)) {
    return { validationError: { statusCode: 409, code: "FULFILLMENT_TRANSITION_INVALID", message: "Fulfillment status transition is not allowed." } };
  }

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    fulfillment.status = nextStatus;
    fulfillment.updatedAt = now;
    if (nextStatus === "label_created" && !fulfillment.trackingNumber) {
      fulfillment.trackingNumber = buildTrackingNumber(db);
    }
    saveFulfillment(db, fulfillment);
    insertFulfillmentEvent(db, fulfillment, nextStatus, locale);

    if (nextStatus === "delivered" && order.status !== "delivered") {
      order.status = "delivered";
      order.updatedAt = now;
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push(createTimelineEntry("delivered", locale));
      order.fulfillment = { status: fulfillment.status, trackingNumber: fulfillment.trackingNumber };
      saveOrder(db, order);
    }
  });

  transaction();
  return { fulfillment: findFulfillmentByOrderId(db, order.id), order };
}

module.exports = {
  createFulfillmentForOrder,
  findFulfillmentByOrderId,
  getShippingMethodForOrder,
  getShippingMethodsForAddress,
  updateFulfillmentStatus
};
```

- [ ] **Step 4: Add shipping-method route**

In `server.js`, import:

```js
const {
  createFulfillmentForOrder,
  findFulfillmentByOrderId,
  getShippingMethodForOrder,
  getShippingMethodsForAddress,
  updateFulfillmentStatus
} = require("./lib/repositories/fulfillment");
```

Add this route before `/api/orders`:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/shipping-methods") {
    const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
    const methods = getShippingMethodsForAddress({
      region: requestUrl.searchParams.get("region") || "",
      postalCode: requestUrl.searchParams.get("postalCode") || ""
    }, locale);
    sendJson(response, 200, { ok: true, methods });
    return;
  }
```

- [ ] **Step 5: Verify green**

Run:

```powershell
npx playwright test tests/api.spec.js -g "address-aware shipping methods" --workers=1
```

Expected: PASS.

---

### Task 3: Persist Fulfillment on Order Creation

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing order fulfillment snapshot test**

Add near existing order creation tests in `tests/api.spec.js`:

```js
test("creates orders with an address-aware fulfillment snapshot", async ({ request }) => {
  const cookie = await createCartWithOneItem(request);
  const response = await request.post("/api/orders", {
    headers: { cookie },
    data: {
      ...checkoutPayload,
      locale: "en-US",
      shippingAddress: {
        address: "100 Demo Street",
        city: "Seattle",
        region: "WA",
        postalCode: "98101"
      },
      shippingMethodId: "express"
    }
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.order.fulfillment).toMatchObject({
    status: "not_started",
    shippingMethodId: "express",
    carrier: "Socks Express",
    addressZone: "west"
  });
  expect(payload.order.fulfillment.trackingNumber).toBe("");

  const fulfillmentResponse = await request.get(`/api/orders/${payload.order.id}/fulfillment`, {
    headers: { cookie }
  });
  expect(fulfillmentResponse.ok()).toBe(true);
  await expect(fulfillmentResponse.json()).resolves.toMatchObject({
    fulfillment: {
      status: "not_started",
      shippingMethodId: "express",
      events: [{ status: "not_started" }]
    }
  });
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "fulfillment snapshot" --workers=1
```

Expected: FAIL because order payload has no `fulfillment` and fulfillment route is missing.

- [ ] **Step 3: Replace order shipping method calculation**

In `server.js` order creation route, replace:

```js
const shippingMethod = getShippingMethod(body.shippingMethodId, locale);
```

with:

```js
const shippingAddressInput = {
  address: String(body.shippingAddress.address).trim(),
  city: String(body.shippingAddress.city).trim(),
  region: String(body.shippingAddress.region).trim(),
  postalCode: String(body.shippingAddress.postalCode).trim(),
  note: String(body.shippingAddress.note || "").trim()
};
const shippingMethod = getShippingMethodForOrder(body.shippingMethodId, shippingAddressInput, locale);
```

Then set `order.shippingAddress` to `shippingAddressInput`.

- [ ] **Step 4: Persist fulfillment in transaction**

After `createOrderTransaction(...)` succeeds in the `/api/orders` route, add:

```js
const createdOrder = withDatabase((db) => {
  const fulfillment = createFulfillmentForOrder(db, order, shippingMethod, locale);
  order.fulfillment = {
    status: fulfillment.status,
    shippingMethodId: fulfillment.shippingMethodId,
    shippingMethodLabel: fulfillment.shippingMethodLabel,
    carrier: fulfillment.carrier,
    trackingNumber: fulfillment.trackingNumber,
    estimatedDeliveryDate: fulfillment.estimatedDeliveryDate,
    estimatedDeliveryLabel: fulfillment.estimatedDeliveryLabel,
    deliveryWindow: fulfillment.deliveryWindow,
    addressZone: fulfillment.addressZone
  };
  saveOrder(db, order);
  return order;
});
```

Return `createdOrder` instead of the old `order` in the JSON payload.

- [ ] **Step 5: Add fulfillment route parser and route**

In `server.js`, add parser near other parsers:

```js
function parseOrderFulfillmentPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/fulfillment$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add route before payment routes:

```js
  const requestedFulfillmentOrderId = parseOrderFulfillmentPath(requestUrl.pathname);
  if (request.method === "GET" && requestedFulfillmentOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedFulfillmentOrderId));
      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }
      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }
      const fulfillment = withDatabase((db) => findFulfillmentByOrderId(db, requestedFulfillmentOrderId));
      if (!fulfillment) {
        sendError(response, 404, "FULFILLMENT_NOT_FOUND", "Fulfillment was not found.");
        return;
      }
      sendJson(response, 200, { ok: true, fulfillment });
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
npx playwright test tests/api.spec.js -g "fulfillment snapshot|creates a persisted order" --workers=1
```

Expected: PASS.

---

### Task 4: Cancellation and Refund Repository

**Files:**
- Modify: `tests/api.spec.js`
- Create: `lib/repositories/refunds.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing cancellation/refund API tests**

Add near order lifecycle API tests in `tests/api.spec.js`:

```js
test("cancels an unpaid order without creating a refund", async ({ request }) => {
  const cookie = await createCartWithOneItem(request);
  const orderResponse = await request.post("/api/orders", { headers: { cookie }, data: checkoutPayload });
  const order = (await orderResponse.json()).order;

  const cancelResponse = await request.post(`/api/orders/${order.id}/cancel`, {
    headers: { cookie },
    data: { reason: "changed_mind", locale: "en-US" }
  });
  expect(cancelResponse.ok()).toBe(true);
  const payload = await cancelResponse.json();
  expect(payload.order.status).toBe("cancelled");
  expect(payload.refund).toBeNull();
});

test("cancels a paid order and exposes refund progress", async ({ request }) => {
  const { order, cookie } = await createPaidOrder(request);
  const cancelResponse = await request.post(`/api/orders/${order.id}/cancel`, {
    headers: { cookie },
    data: { reason: "changed_mind", locale: "en-US" }
  });
  expect(cancelResponse.ok()).toBe(true);
  const cancelPayload = await cancelResponse.json();
  expect(cancelPayload.order.status).toBe("refund_pending");
  expect(cancelPayload.refund).toMatchObject({
    orderId: order.id,
    status: "requested",
    amount: order.totals.total
  });

  const refundsResponse = await request.get(`/api/orders/${order.id}/refunds`, { headers: { cookie } });
  expect(refundsResponse.ok()).toBe(true);
  await expect(refundsResponse.json()).resolves.toMatchObject({
    refunds: [{ status: "requested", events: [{ status: "requested" }] }]
  });
});

test("does not cancel a shipped order", async ({ request }) => {
  const { order, cookie } = await createPaidOrder(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "processing", locale: "en-US" }
  });
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "shipped", locale: "en-US" }
  });

  const cancelResponse = await request.post(`/api/orders/${order.id}/cancel`, {
    headers: { cookie },
    data: { reason: "changed_mind", locale: "en-US" }
  });
  expect(cancelResponse.status()).toBe(409);
  await expect(cancelResponse.json()).resolves.toMatchObject({
    error: { code: "ORDER_CANCEL_NOT_ALLOWED" }
  });
});
```

If `createPaidOrder(request)` does not exist, add this helper near other helpers:

```js
async function createPaidOrder(request) {
  const cookie = await createCartWithOneItem(request);
  const orderResponse = await request.post("/api/orders", { headers: { cookie }, data: checkoutPayload });
  const order = (await orderResponse.json()).order;
  await request.post(`/api/orders/${order.id}/payments`, {
    headers: { cookie },
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });
  const refreshedResponse = await request.get(`/api/orders/${order.id}`, { headers: { cookie } });
  return { order: (await refreshedResponse.json()).order, cookie };
}
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "cancels an unpaid|cancels a paid|does not cancel a shipped" --workers=1
```

Expected: FAIL because cancel/refunds routes and repository are missing.

- [ ] **Step 3: Create refunds repository**

Create `lib/repositories/refunds.js`:

```js
const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);
const cancellableWithoutRefund = new Set(["pending_payment"]);
const cancellableWithRefund = new Set(["paid", "processing"]);
const finalCancelStatuses = new Set(["cancelled", "refund_pending", "refunded"]);
const refundStatusTransitions = {
  requested: new Set(["processing", "failed"]),
  processing: new Set(["succeeded", "failed"]),
  succeeded: new Set([]),
  failed: new Set([])
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function getRefundStatusLabel(status, locale = "zh-CN") {
  const labels = {
    requested: { "zh-CN": "退款已申请", "en-US": "Refund requested" },
    processing: { "zh-CN": "退款处理中", "en-US": "Refund processing" },
    succeeded: { "zh-CN": "退款成功", "en-US": "Refund succeeded" },
    failed: { "zh-CN": "退款失败", "en-US": "Refund failed" }
  };
  return labels[status]?.[normalizeLocale(locale)] || status;
}

function parseRefundRow(row) {
  return row ? JSON.parse(row.payload) : null;
}

function listRefundEvents(db, refundId) {
  return db.prepare(`
    SELECT status, label, description, at
    FROM refund_events
    WHERE refund_id = ?
    ORDER BY at ASC, rowid ASC
  `).all(refundId);
}

function serializeRefund(db, row) {
  const refund = parseRefundRow(row);
  return refund ? { ...refund, events: listRefundEvents(db, refund.id) } : null;
}

function listRefundsByOrder(db, orderId) {
  return db.prepare(`
    SELECT payload FROM refunds
    WHERE order_id = ?
    ORDER BY created_at DESC, rowid DESC
  `).all(orderId).map((row) => serializeRefund(db, row));
}

function findRefundById(db, refundId) {
  const row = db.prepare("SELECT payload FROM refunds WHERE id = ?").get(refundId);
  return serializeRefund(db, row);
}

function insertRefundEvent(db, refund, status, locale = "zh-CN") {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO refund_events (id, refund_id, order_id, status, label, description, at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `refund-event-${crypto.randomUUID()}`,
    refund.id,
    refund.orderId,
    status,
    getRefundStatusLabel(status, locale),
    getRefundStatusLabel(status, locale),
    now
  );
}

function createRefundForOrder(db, order, reason = "changed_mind", locale = "zh-CN") {
  const now = new Date().toISOString();
  const refund = {
    id: `refund-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "requested",
    amount: order.totals.total,
    reason: String(reason || "changed_mind").trim(),
    method: order.payment?.method || "original_payment",
    createdAt: now,
    updatedAt: now
  };
  db.prepare(`
    INSERT INTO refunds (id, order_id, user_id, status, amount, reason, method, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(refund.id, refund.orderId, refund.userId, refund.status, refund.amount, refund.reason, refund.method, refund.createdAt, refund.updatedAt, JSON.stringify(refund));
  insertRefundEvent(db, refund, "requested", locale);
  return findRefundById(db, refund.id);
}

function cancelOrder(db, { order, reason = "changed_mind", locale = "zh-CN", saveOrder, createTimelineEntry }) {
  if (finalCancelStatuses.has(order.status)) {
    return { validationError: { statusCode: 409, code: "ORDER_CANCEL_ALREADY_FINAL", message: "Order has already reached a final cancellation state." } };
  }
  if (!cancellableWithoutRefund.has(order.status) && !cancellableWithRefund.has(order.status)) {
    return { validationError: { statusCode: 409, code: "ORDER_CANCEL_NOT_ALLOWED", message: "Order can no longer be cancelled." } };
  }

  let refund = null;
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    order.updatedAt = now;
    order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
    if (cancellableWithoutRefund.has(order.status)) {
      order.status = "cancelled";
      order.timeline.push(createTimelineEntry("cancelled", locale));
      order.refund = { status: "none" };
    } else {
      order.status = "refund_pending";
      refund = createRefundForOrder(db, order, reason, locale);
      order.timeline.push({
        status: "refund_pending",
        label: locale === "en-US" ? "Refund pending" : "退款处理中",
        at: new Date().toISOString()
      });
      order.refund = {
        id: refund.id,
        status: refund.status,
        amount: refund.amount
      };
    }
    saveOrder(db, order);
  });
  transaction();
  return { order, refund };
}

function updateRefundStatus(db, { refund, order, status, locale = "zh-CN", saveOrder }) {
  const nextStatus = String(status || "").trim();
  if (!refundStatusTransitions[nextStatus]) {
    return { validationError: { statusCode: 400, code: "REFUND_STATUS_INVALID", message: "Refund status is invalid." } };
  }
  const allowed = refundStatusTransitions[refund.status] || new Set();
  if (!allowed.has(nextStatus)) {
    return { validationError: { statusCode: 409, code: "REFUND_TRANSITION_INVALID", message: "Refund status transition is not allowed." } };
  }

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    refund.status = nextStatus;
    refund.updatedAt = now;
    db.prepare("UPDATE refunds SET status = ?, updated_at = ?, payload = ? WHERE id = ?")
      .run(refund.status, refund.updatedAt, JSON.stringify({ ...refund, events: undefined }), refund.id);
    insertRefundEvent(db, refund, nextStatus, locale);
    if (nextStatus === "succeeded") {
      order.status = "refunded";
      order.updatedAt = now;
      order.refund = { id: refund.id, status: "succeeded", amount: refund.amount };
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push({ status: "refunded", label: locale === "en-US" ? "Refunded" : "已退款", at: now });
      saveOrder(db, order);
    }
  });
  transaction();
  return { refund: findRefundById(db, refund.id), order };
}

module.exports = {
  cancelOrder,
  findRefundById,
  listRefundsByOrder,
  updateRefundStatus
};
```

- [ ] **Step 4: Add cancel/refund routes**

In `server.js`, import:

```js
const {
  cancelOrder,
  findRefundById,
  listRefundsByOrder,
  updateRefundStatus
} = require("./lib/repositories/refunds");
```

Add parsers:

```js
function parseOrderCancelPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderRefundsPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/refunds$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseRefundStatusPath(pathname) {
  const match = pathname.match(/^\/api\/refunds\/([^/]+)\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add owner check helper:

```js
function canAccessOrder(order, user) {
  return !order.userId || (user && user.id === order.userId);
}
```

Add routes before generic order status route:

```js
  const requestedCancelOrderId = parseOrderCancelPath(requestUrl.pathname);
  if (request.method === "POST" && requestedCancelOrderId) {
    try {
      const body = await readRequestBody(request);
      const order = withDatabase((db) => findOrderById(db, requestedCancelOrderId));
      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }
      const { user } = await getSessionContext(request);
      if (!canAccessOrder(order, user)) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }
      const result = withDatabase((db) => cancelOrder(db, {
        order,
        reason: body.reason,
        locale: normalizeLocale(body.locale),
        saveOrder,
        createTimelineEntry
      }));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, order: result.order, refund: result.refund || null });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

Add `GET /api/orders/:id/refunds` and `PATCH /api/refunds/:id/status` routes following the same owner/admin checks.

- [ ] **Step 5: Verify green**

Run:

```powershell
npx playwright test tests/api.spec.js -g "cancels an unpaid|cancels a paid|does not cancel a shipped" --workers=1
```

Expected: PASS.

---

### Task 5: Fulfillment Status Transitions and Tracking

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`
- Modify: `lib/repositories/admin.js`

- [ ] **Step 1: Write failing tracking tests**

Add near order lifecycle API tests:

```js
test("generates a tracking number when fulfillment is shipped and completes delivery", async ({ request }) => {
  const { order, cookie } = await createPaidOrder(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "processing", locale: "en-US" }
  });

  const shipResponse = await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "shipped", locale: "en-US" }
  });
  expect(shipResponse.ok()).toBe(true);
  const shippedOrder = (await shipResponse.json()).order;
  expect(shippedOrder.fulfillment).toMatchObject({ status: "label_created" });
  expect(shippedOrder.fulfillment.trackingNumber).toMatch(/^TRK-\d{8}-\d{4}$/);

  const transitResponse = await request.patch(`/api/orders/${order.id}/fulfillment/status`, {
    headers: { cookie, "x-demo-admin": "true" },
    data: { status: "in_transit", locale: "en-US" }
  });
  expect(transitResponse.ok()).toBe(true);

  const deliveredResponse = await request.patch(`/api/orders/${order.id}/fulfillment/status`, {
    headers: { cookie, "x-demo-admin": "true" },
    data: { status: "out_for_delivery", locale: "en-US" }
  });
  expect(deliveredResponse.ok()).toBe(true);
  await request.patch(`/api/orders/${order.id}/fulfillment/status`, {
    headers: { cookie, "x-demo-admin": "true" },
    data: { status: "delivered", locale: "en-US" }
  });

  const fulfillmentResponse = await request.get(`/api/orders/${order.id}/fulfillment`, { headers: { cookie } });
  const fulfillmentPayload = await fulfillmentResponse.json();
  expect(fulfillmentPayload.fulfillment.events.map((event) => event.status)).toEqual([
    "not_started",
    "preparing",
    "label_created",
    "in_transit",
    "out_for_delivery",
    "delivered"
  ]);
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "generates a tracking number" --workers=1
```

Expected: FAIL because order status transitions do not update fulfillment.

- [ ] **Step 3: Update order status route**

In `server.js`, when `nextStatus === "processing"` after `saveOrder`, also update fulfillment from `not_started` to `preparing`.

When `nextStatus === "shipped"`, update fulfillment from `preparing` to `label_created`.

Use:

```js
const fulfillment = withDatabase((db) => findFulfillmentByOrderId(db, order.id));
if (fulfillment && nextStatus === "processing") {
  withDatabase((db) => updateFulfillmentStatus(db, {
    order,
    fulfillment,
    status: "preparing",
    locale,
    saveOrder,
    createTimelineEntry
  }));
}
if (fulfillment && nextStatus === "shipped") {
  const result = withDatabase((db) => updateFulfillmentStatus(db, {
    order,
    fulfillment: findFulfillmentByOrderId(db, order.id),
    status: "label_created",
    locale,
    saveOrder,
    createTimelineEntry
  }));
  order.fulfillment = {
    status: result.fulfillment.status,
    trackingNumber: result.fulfillment.trackingNumber,
    carrier: result.fulfillment.carrier,
    estimatedDeliveryLabel: result.fulfillment.estimatedDeliveryLabel
  };
}
```

- [ ] **Step 4: Add admin fulfillment status route**

Add parser:

```js
function parseOrderFulfillmentStatusPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/fulfillment\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add route requiring `x-demo-admin: true` or admin user:

```js
  const requestedFulfillmentStatusOrderId = parseOrderFulfillmentStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedFulfillmentStatusOrderId) {
    try {
      const body = await readRequestBody(request);
      const { user } = await getSessionContext(request);
      const isDemoAdmin = request.headers["x-demo-admin"] === "true" || (user && DEMO_ADMIN_EMAILS.has(user.email));
      if (!isDemoAdmin) {
        sendError(response, 403, "FULFILLMENT_FORBIDDEN", "Only demo admins can update fulfillment.");
        return;
      }
      const order = withDatabase((db) => findOrderById(db, requestedFulfillmentStatusOrderId));
      const fulfillment = withDatabase((db) => findFulfillmentByOrderId(db, requestedFulfillmentStatusOrderId));
      if (!order || !fulfillment) {
        sendError(response, 404, "FULFILLMENT_NOT_FOUND", "Fulfillment was not found.");
        return;
      }
      const result = withDatabase((db) => updateFulfillmentStatus(db, {
        order,
        fulfillment,
        status: body.status,
        locale: normalizeLocale(body.locale),
        saveOrder,
        createTimelineEntry
      }));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, order: result.order, fulfillment: result.fulfillment });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 5: Verify green**

Run:

```powershell
npx playwright test tests/api.spec.js -g "generates a tracking number|advances order status" --workers=1
```

Expected: PASS.

---

### Task 6: Checkout Delivery Estimate UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing UI test**

Add near checkout UI tests:

```js
test("updates checkout delivery estimates from the shipping address", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);

  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await expect(page.locator("[data-shipping-estimate-panel]")).toContainText("Standard delivery");
  await expect(page.locator("[data-shipping-estimate-panel]")).toContainText("west");

  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("AK");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("99501");
  await page.locator("[data-shipping-refresh]").click();
  await expect(page.locator("[data-shipping-estimate-panel]")).toContainText("remote");
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "checkout delivery estimates" --workers=1
```

Expected: FAIL because the panel/buttons do not exist.

- [ ] **Step 3: Add checkout fetch helper**

In `public/js/storefront-app.js`, add:

```js
async function fetchShippingMethodsForCheckout(address = {}) {
  const params = new URLSearchParams({
    region: address.region || "",
    postalCode: address.postalCode || "",
    locale: activeLocale
  });
  const response = await fetch(`/api/shipping-methods?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load shipping methods");
  }
  return response.json();
}
```

- [ ] **Step 4: Render shipping estimate panel**

In checkout markup, add a container above the shipping method radio fieldset:

```html
<section class="shipping-estimate" data-shipping-estimate-panel>
  <button class="order-button order-button--secondary" type="button" data-shipping-refresh>${activeLocale === LOCALE_KEY.EN_US ? "Refresh delivery estimates" : "刷新预计送达"}</button>
  <div data-shipping-method-options></div>
</section>
```

Add CSS in `socks-product-list.html` near order panel styles:

```css
.shipping-estimate {
  display: grid;
  gap: 12px;
  border: 1px solid #e8e8e8;
  border-radius: 18px;
  padding: 14px;
  background: #fafafa;
}

.shipping-estimate__option {
  display: grid;
  gap: 4px;
  border: 1px solid #dedede;
  border-radius: 14px;
  padding: 12px;
  background: #ffffff;
}
```

- [ ] **Step 5: Bind refresh**

After `renderCheckoutPage()` writes markup, add:

```js
bindCheckoutShippingEstimates();
```

Add:

```js
async function renderCheckoutShippingEstimates() {
  const panel = checkoutPagePanel.querySelector("[data-shipping-estimate-panel]");
  const optionsRoot = checkoutPagePanel.querySelector("[data-shipping-method-options]");
  if (!panel || !optionsRoot) return;
  const address = getCheckoutFormPayload(checkoutPagePanel.querySelector("[data-checkout-form]")).shippingAddress;
  const payload = await fetchShippingMethodsForCheckout(address).catch(() => ({ methods: [] }));
  optionsRoot.innerHTML = payload.methods.map((method) => `
    <label class="shipping-estimate__option">
      <input type="radio" name="shippingMethodId" value="${escapeHtml(method.id)}" ${method.id === "standard" ? "checked" : ""}>
      <strong>${escapeHtml(method.label)} · ${formatCurrency(method.fee)}</strong>
      <span>${escapeHtml(method.estimatedDeliveryLabel)} · ${escapeHtml(method.addressZone)}</span>
      <span>${escapeHtml(method.deliveryWindow.label)}</span>
    </label>
  `).join("");
}

function bindCheckoutShippingEstimates() {
  checkoutPagePanel.querySelector("[data-shipping-refresh]")?.addEventListener("click", renderCheckoutShippingEstimates);
  renderCheckoutShippingEstimates();
}
```

- [ ] **Step 6: Verify green**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "checkout delivery estimates" --workers=1
```

Expected: PASS.

---

### Task 7: Order Detail, Cancellation, Tracking, and Refund UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `public/js/storefront-app.js`

- [ ] **Step 1: Write failing UI tests**

Add near order detail UI tests:

```js
test("shows fulfillment tracking on the order detail page", async ({ page }) => {
  await registerFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=payment&id=SOCK-/);
  await payCurrentOrderFromPaymentPage(page);
  const orderId = new URL(page.url()).searchParams.get("id");

  await page.request.patch(`/api/orders/${orderId}/status`, { data: { status: "processing", locale: "en-US" } });
  await page.request.patch(`/api/orders/${orderId}/status`, { data: { status: "shipped", locale: "en-US" } });
  await page.goto(`/socks-product-list.html?view=order&id=${orderId}`);

  await expect(page.locator("[data-fulfillment-card]")).toBeVisible();
  await expect(page.locator("[data-fulfillment-tracking-number]")).toContainText(/TRK-/);
  await expect(page.locator("[data-fulfillment-events]")).toContainText(/Label created|已生成发货单/);
});

test("cancels a paid order from detail and shows refund progress", async ({ page }) => {
  await registerFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-02", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await payCurrentOrderFromPaymentPage(page);

  const cancelResponse = page.waitForResponse((response) => {
    return response.url().includes("/cancel") && response.request().method() === "POST";
  });
  await page.locator("[data-order-cancel]").click();
  expect((await cancelResponse).ok()).toBe(true);
  await expect(page.locator("[data-order-status]")).toHaveText(/Refund pending|退款处理中/);
  await expect(page.locator("[data-refund-progress]")).toContainText(/Refund requested|退款已申请/);
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "fulfillment tracking|refund progress" --workers=1
```

Expected: FAIL because the UI cards/buttons are missing.

- [ ] **Step 3: Add front-end API helpers**

In `public/js/storefront-app.js`, add:

```js
async function fetchOrderFulfillment(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment`);
  if (!response.ok) return { fulfillment: null };
  return response.json();
}

async function fetchOrderRefunds(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refunds`);
  if (!response.ok) return { refunds: [] };
  return response.json();
}

async function cancelOrder(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "changed_mind", locale: activeLocale })
  });
  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to cancel order");
  }
  return response.json();
}
```

- [ ] **Step 4: Add card markup helpers**

Add:

```js
function createFulfillmentCardMarkup(fulfillment) {
  if (!fulfillment) return "";
  return `
    <section class="order-source" data-fulfillment-card>
      <p class="order-source__title">${escapeHtml(fulfillment.shippingMethodLabel || fulfillment.shippingMethodId)} · ${escapeHtml(fulfillment.carrier)}</p>
      <p class="order-source__copy">${escapeHtml(fulfillment.estimatedDeliveryLabel || "")}</p>
      <p class="order-source__copy" data-fulfillment-tracking-number>${fulfillment.trackingNumber ? escapeHtml(fulfillment.trackingNumber) : (activeLocale === LOCALE_KEY.EN_US ? "Tracking pending" : "待生成发货单号")}</p>
      <div data-fulfillment-events>
        ${(fulfillment.events || []).map((event) => `<p>${escapeHtml(event.label)} · ${escapeHtml(event.location || "")}</p>`).join("")}
      </div>
    </section>
  `;
}

function createRefundProgressMarkup(refunds = []) {
  if (!refunds.length) return "";
  const refund = refunds[0];
  return `
    <section class="order-source" data-refund-progress>
      <p class="order-source__title">${activeLocale === LOCALE_KEY.EN_US ? "Refund progress" : "退款进度"}</p>
      ${(refund.events || []).map((event) => `<p class="order-source__copy">${escapeHtml(event.label)}</p>`).join("")}
    </section>
  `;
}
```

- [ ] **Step 5: Render detail lifecycle**

In `renderOrderPage()`, when `requestedOrderId` exists, load:

```js
const fulfillmentPayload = await fetchOrderFulfillment(requestedOrderId);
const refundsPayload = await fetchOrderRefunds(requestedOrderId);
renderPersistedOrder(payload.order, {
  fulfillment: fulfillmentPayload.fulfillment,
  refunds: refundsPayload.refunds || []
});
```

Update `renderPersistedOrder(order, options = {})` and insert:

```js
${createFulfillmentCardMarkup(options.fulfillment)}
${createRefundProgressMarkup(options.refunds || [])}
```

Add cancel button in actions when `["pending_payment", "paid", "processing"].includes(order.status)`:

```html
<button class="order-button order-button--secondary" type="button" data-order-cancel data-order-id="${escapeHtml(order.id)}">${activeLocale === LOCALE_KEY.EN_US ? "Cancel order" : "取消订单"}</button>
```

- [ ] **Step 6: Bind cancel button**

Call after `renderPersistedOrder` markup:

```js
bindOrderCancelButton();
```

Add:

```js
function bindOrderCancelButton() {
  orderPagePanel.querySelector("[data-order-cancel]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const orderId = button.dataset.orderId;
    if (!orderId || button.disabled) return;
    button.disabled = true;
    try {
      const payload = await cancelOrder(orderId);
      const fulfillmentPayload = await fetchOrderFulfillment(orderId);
      const refundsPayload = await fetchOrderRefunds(orderId);
      renderPersistedOrder(payload.order, {
        fulfillment: fulfillmentPayload.fulfillment,
        refunds: refundsPayload.refunds || []
      });
    } catch (error) {
      showOutOfStockToast();
      button.disabled = false;
    }
  });
}
```

- [ ] **Step 7: Verify green**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "fulfillment tracking|refund progress" --workers=1
```

Expected: PASS.

---

### Task 8: Admin Fulfillment and Refund Controls

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `public/js/storefront-app.js`
- Modify: `lib/repositories/admin.js`

- [ ] **Step 1: Write failing admin UI test**

Add near admin order tests:

```js
test("advances fulfillment and refund status from the admin orders tab", async ({ page }) => {
  await registerAdminFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await payCurrentOrderFromPaymentPage(page);

  await page.goto("/socks-product-list.html?view=admin");
  await page.locator('[data-admin-tab="orders"]').click();
  await page.locator("[data-admin-order-fulfillment]").first().click();
  await expect(page.locator("[data-admin-order-row]").first()).toContainText(/preparing|label_created|处理中|发货单/);

  await page.goto("/socks-product-list.html?view=orders");
  await page.locator("[data-order-history-card]").first().click();
  await page.locator("[data-order-cancel]").click();

  await page.goto("/socks-product-list.html?view=admin");
  await page.locator('[data-admin-tab="orders"]').click();
  await page.locator("[data-admin-refund-status]").first().click();
  await expect(page.locator("[data-admin-order-row]").first()).toContainText(/processing|退款处理中/);
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "advances fulfillment and refund status" --workers=1
```

Expected: FAIL because admin controls are missing.

- [ ] **Step 3: Add admin order data**

In `lib/repositories/admin.js`, update `mapRecentOrder(order)` to include:

```js
fulfillmentStatus: order.fulfillment?.status || "not_started",
trackingNumber: order.fulfillment?.trackingNumber || "",
refundStatus: order.refund?.status || "none",
```

- [ ] **Step 4: Add frontend admin helpers**

In `public/js/storefront-app.js`, add:

```js
async function adminAdvanceFulfillment(orderId, status) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
    body: JSON.stringify({ status, locale: activeLocale })
  });
  if (!response.ok) throw await createCartRequestError(response, "Failed to update fulfillment");
  return response.json();
}

async function adminAdvanceRefund(refundId, status) {
  const response = await fetch(`/api/refunds/${encodeURIComponent(refundId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
    body: JSON.stringify({ status, locale: activeLocale })
  });
  if (!response.ok) throw await createCartRequestError(response, "Failed to update refund");
  return response.json();
}
```

- [ ] **Step 5: Render admin buttons**

In admin orders tab markup, add buttons:

```html
<button type="button" data-admin-order-fulfillment data-order-id="${escapeHtml(order.id)}">推进物流</button>
<button type="button" data-admin-refund-status data-refund-id="${escapeHtml(order.refundId || "")}">推进退款</button>
```

If admin API does not expose `refundId`, add it from `order.refund?.id || ""`.

- [ ] **Step 6: Bind admin buttons**

Add event handlers after rendering admin orders:

```js
adminPanel.querySelectorAll("[data-admin-order-fulfillment]").forEach((button) => {
  button.addEventListener("click", async () => {
    const orderId = button.dataset.orderId;
    await adminAdvanceFulfillment(orderId, "in_transit").catch(() => adminAdvanceFulfillment(orderId, "out_for_delivery"));
    await renderAdminView();
  });
});

adminPanel.querySelectorAll("[data-admin-refund-status]").forEach((button) => {
  button.addEventListener("click", async () => {
    const refundId = button.dataset.refundId;
    if (!refundId) return;
    await adminAdvanceRefund(refundId, "processing").catch(() => adminAdvanceRefund(refundId, "succeeded"));
    await renderAdminView();
  });
});
```

- [ ] **Step 7: Verify green**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "advances fulfillment and refund status" --workers=1
```

Expected: PASS.

---

### Task 9: Focused Regression, Full Verification, Commit

**Files:**
- Modify as needed from prior tasks.

- [ ] **Step 1: Run focused API regression**

Run:

```powershell
npx playwright test tests/api.spec.js -g "shipping methods|fulfillment|cancel|refund|payment|order status|return request" --workers=1
```

Expected: PASS.

- [ ] **Step 2: Run focused UI regression**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "checkout delivery|fulfillment tracking|refund progress|admin|order history|order detail|payment|return" --workers=1
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```powershell
npx playwright test --workers=1 --reporter=line
```

Expected: PASS with existing skipped tests only.

- [ ] **Step 4: Clean fixture noise**

Run:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

- [ ] **Step 5: Run diff checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intended source/test files modified.

- [ ] **Step 6: Commit implementation**

Run:

```powershell
git add lib/database.js lib/repositories/fulfillment.js lib/repositories/refunds.js lib/repositories/admin.js server.js public/js/storefront-app.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add fulfillment tracking and refunds"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage: address-based estimates, shipping methods, fulfillment snapshot, tracking number, tracking events, cancellation rules, refund progress, order detail/history UI, and admin controls are covered by Tasks 1-8.
- Scope control: no real logistics API, no real refund gateway, no multi-package split shipment, no high-concurrency testing.
- TDD coverage: each behavior task starts with a failing API/UI test and verifies red before implementation.
- Type consistency: fulfillment statuses use `not_started`, `preparing`, `label_created`, `in_transit`, `out_for_delivery`, `delivered`, `cancelled`; refund statuses use `requested`, `processing`, `succeeded`, `failed`; order refund statuses use `refund_pending` and `refunded`.
- Execution safety: all test commands use `--workers=1`; no background agents are required.

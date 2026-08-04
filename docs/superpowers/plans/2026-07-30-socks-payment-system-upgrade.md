# Socks Payment System Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add demo-real payment callbacks, configurable payment methods, tax/shipping/payment-fee totals, and invoices to the socks storefront.

**Architecture:** Keep the existing Node HTTP + SQLite + vanilla storefront app. Add focused repositories for payment methods, payment events, invoices, and a shared checkout totals calculator; route payment attempt outcomes through a demo webhook processor so payment success, order status, and invoices stay idempotent.

**Tech Stack:** Node.js HTTP server, SQLite repository modules, vanilla HTML/CSS/JS, Playwright API/UI tests.

---

## Safety Notes

- Use UTF-8 PowerShell prefix for every command:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8;
```

- Do not dispatch background agents for this feature.
- Run Playwright with `--workers=1`.
- Do not run API and UI Playwright suites in parallel because both try to own `127.0.0.1:4173`.
- Avoid payment stress tests, webhook retry loops, or high-frequency callback probes.
- Clean fixture noise before each implementation commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

## File Map

- Modify `lib/database.js`: add migration `0007_payment_system_upgrade`, tables `payment_methods`, `payment_events`, `invoices`, and seed method rows.
- Create `lib/checkout-totals.js`: wraps existing pricing math with tax, payment fee, currency, region, and grand total.
- Create `lib/repositories/payment-methods.js`: list/seed/filter/update payment method configuration.
- Modify `lib/repositories/payments.js`: create processing attempts, preserve compatibility for `outcome`, and expose payment lookup/save helpers.
- Create `lib/repositories/payment-events.js`: record webhook events with idempotency and process demo callback outcomes.
- Create `lib/repositories/invoices.js`: generate one active invoice per paid order and fetch invoices by order/id.
- Modify `lib/repositories/admin.js`: expose payment method config, payment event summaries, and invoice summaries.
- Modify `server.js`: add payment methods API, webhook route, invoice routes, admin payment method patch route, and use checkout totals on order creation.
- Modify `public/js/storefront-app.js`: show configured payment methods, amount breakdown, processing/failed state, invoice entry and invoice detail.
- Modify `socks-product-list.html`: add compact invoice/payment breakdown styles.
- Modify `tests/api.spec.js`: add API coverage for schema, totals, methods, webhook, invoice, and admin config.
- Modify `tests/socks-product-list.spec.js`: add UI coverage for payment methods, payment breakdown, invoice view, failed retry, and admin disabling.

---

### Task 1: Payment Upgrade Schema and Seeded Methods

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/database.js`

- [ ] **Step 1: Write failing schema and seed test**

Add near existing database initialization tests in `tests/api.spec.js`:

```js
test("initializes SQLite payment configuration events and invoices", async () => {
  const db = createDatabase(":memory:");
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });

  const paymentMethodTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payment_methods'").get();
  const paymentEventTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payment_events'").get();
  const invoiceTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'").get();
  const methods = db.prepare("SELECT id, status, sort_order AS sortOrder FROM payment_methods ORDER BY sort_order ASC").all();

  expect(paymentMethodTable).toEqual({ name: "payment_methods" });
  expect(paymentEventTable).toEqual({ name: "payment_events" });
  expect(invoiceTable).toEqual({ name: "invoices" });
  expect(methods).toEqual([
    { id: "card", status: "active", sortOrder: 10 },
    { id: "paypal", status: "active", sortOrder: 20 },
    { id: "gift_card", status: "active", sortOrder: 30 },
    { id: "cod", status: "inactive", sortOrder: 40 }
  ]);

  db.close();
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "payment configuration events and invoices" --workers=1
```

Expected: FAIL because `payment_methods`, `payment_events`, and `invoices` do not exist.

- [ ] **Step 3: Add database helper**

In `lib/database.js`, add after `ensureFulfillmentAndRefundTables(db)`:

```js
const seededPaymentMethods = [
  {
    id: "card",
    labels: { "zh-CN": "银行卡", "en-US": "Credit or debit card" },
    descriptions: { "zh-CN": "支持 Visa / Mastercard 演示支付", "en-US": "Demo Visa / Mastercard payment" },
    status: "active",
    sortOrder: 10,
    feeType: "none",
    feeAmount: 0,
    minTotal: 0,
    maxTotal: 9999
  },
  {
    id: "paypal",
    labels: { "zh-CN": "PayPal", "en-US": "PayPal" },
    descriptions: { "zh-CN": "使用 PayPal 演示钱包支付", "en-US": "Pay with a demo PayPal wallet" },
    status: "active",
    sortOrder: 20,
    feeType: "fixed",
    feeAmount: 1,
    minTotal: 0,
    maxTotal: 9999
  },
  {
    id: "gift_card",
    labels: { "zh-CN": "礼品卡", "en-US": "Gift card" },
    descriptions: { "zh-CN": "使用演示礼品卡余额支付", "en-US": "Use a demo gift-card balance" },
    status: "active",
    sortOrder: 30,
    feeType: "none",
    feeAmount: 0,
    minTotal: 0,
    maxTotal: 300
  },
  {
    id: "cod",
    labels: { "zh-CN": "货到付款", "en-US": "Cash on delivery" },
    descriptions: { "zh-CN": "当前演示站暂未启用", "en-US": "Not enabled in this demo storefront" },
    status: "inactive",
    sortOrder: 40,
    feeType: "fixed",
    feeAmount: 6,
    minTotal: 20,
    maxTotal: 500
  }
];

function ensurePaymentSystemTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      fee_type TEXT NOT NULL,
      fee_amount REAL NOT NULL,
      min_total REAL NOT NULL,
      max_total REAL NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      event_status TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payment_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      status TEXT NOT NULL,
      invoice_number TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL,
      currency TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount_total REAL NOT NULL,
      shipping REAL NOT NULL,
      payment_fee REAL NOT NULL,
      tax REAL NOT NULL,
      grand_total REAL NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id, processed_at);
    CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_events(payment_id, processed_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, issued_at);
  `);
}

function seedPaymentMethods(db) {
  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO payment_methods (id, status, sort_order, fee_type, fee_amount, min_total, max_total, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload
  `);

  seededPaymentMethods.forEach((method) => {
    statement.run(
      method.id,
      method.status,
      method.sortOrder,
      method.feeType,
      method.feeAmount,
      method.minTotal,
      method.maxTotal,
      JSON.stringify(method),
      now
    );
  });
}
```

- [ ] **Step 4: Register migration and seed**

In the `migrations` array in `lib/database.js`, add after `0006_fulfillment_refunds`:

```js
  {
    id: "0007_payment_system_upgrade",
    name: "Add payment methods events and invoices",
    up(db) {
      ensurePaymentSystemTables(db);
      seedPaymentMethods(db);
    }
  }
```

In `initializeDatabase(db, options = {})`, add after `runMigrations(db);`:

```js
  seedPaymentMethods(db);
```

- [ ] **Step 5: Verify green and commit**

Run:

```powershell
npx playwright test tests/api.spec.js -g "payment configuration events and invoices|records schema migrations" --workers=1
```

Expected: PASS.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add lib/database.js tests/api.spec.js
git commit -m "feat: add payment system schema"
```

---

### Task 2: Checkout Totals With Tax and Payment Fee

**Files:**
- Modify: `tests/api.spec.js`
- Create: `lib/checkout-totals.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing totals test**

Add near existing pricing tests in `tests/api.spec.js`:

```js
test("calculates checkout totals with tax shipping and payment fee", async () => {
  const { createCheckoutTotals } = require("../lib/checkout-totals");
  const products = [
    { id: "sock-01", price: 39, originalPrice: 59 },
    { id: "sock-02", price: 45, originalPrice: 69 }
  ];
  const cart = {
    couponCode: "",
    items: [
      { productId: "sock-01", quantity: 2 },
      { productId: "sock-02", quantity: 1 }
    ]
  };

  const totals = createCheckoutTotals({
    cart,
    products,
    marketing: { promotions: [], coupons: [] },
    shippingFee: 12,
    paymentMethod: { id: "paypal", feeType: "fixed", feeAmount: 1 },
    shippingAddress: { region: "WA", postalCode: "98101" },
    now: new Date("2026-07-30T00:00:00.000Z")
  });

  expect(totals).toMatchObject({
    subtotal: 187,
    itemTotal: 123,
    productDiscount: 64,
    shipping: 12,
    paymentFee: 1,
    taxableAmount: 124,
    tax: 10.91,
    grandTotal: 146.91,
    currency: "CNY",
    taxRegion: "WA"
  });
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "checkout totals with tax shipping and payment fee" --workers=1
```

Expected: FAIL because `../lib/checkout-totals` does not exist.

- [ ] **Step 3: Create totals module**

Create `lib/checkout-totals.js`:

```js
const { createPricingSummary } = require("./pricing");

const taxRates = {
  WA: 0.088,
  CA: 0.0725,
  NY: 0.08875,
  TX: 0.0625,
  AK: 0,
  OR: 0
};

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeRegion(region) {
  return String(region || "").trim().toUpperCase();
}

function getTaxRateForAddress(address = {}) {
  const region = normalizeRegion(address.region);
  return Object.prototype.hasOwnProperty.call(taxRates, region) ? taxRates[region] : 0.05;
}

function calculatePaymentFee(paymentMethod = {}, totalBeforePaymentFee = 0) {
  if (paymentMethod.feeType === "fixed") {
    return roundMoney(paymentMethod.feeAmount);
  }
  if (paymentMethod.feeType === "percent") {
    return roundMoney(totalBeforePaymentFee * (Number(paymentMethod.feeAmount) || 0));
  }
  return 0;
}

function createCheckoutTotals({
  cart,
  products,
  marketing = {},
  shippingFee = 0,
  paymentMethod = null,
  shippingAddress = {},
  now = new Date()
}) {
  const pricing = createPricingSummary({ cart, products, marketing, shippingFee });
  const paymentFee = calculatePaymentFee(paymentMethod, pricing.total);
  const taxableAmount = roundMoney(Math.max(0, pricing.itemTotal - pricing.orderDiscount - pricing.couponDiscount + paymentFee));
  const tax = roundMoney(taxableAmount * getTaxRateForAddress(shippingAddress));
  const grandTotal = roundMoney(pricing.total + paymentFee + tax);
  const taxRegion = normalizeRegion(shippingAddress.region) || "DEFAULT";

  return {
    ...pricing,
    paymentFee,
    taxableAmount,
    tax,
    grandTotal,
    currency: "CNY",
    taxRegion,
    calculatedAt: now.toISOString()
  };
}

module.exports = {
  createCheckoutTotals,
  getTaxRateForAddress
};
```

- [ ] **Step 4: Wire order creation totals**

In `server.js`, import:

```js
const { createCheckoutTotals } = require("./lib/checkout-totals");
```

In `/api/orders` creation, replace:

```js
const pricing = createPricingSummary({
  cart,
  products,
  marketing,
  shippingFee: shippingMethod.fee
});
```

with:

```js
const pricing = createCheckoutTotals({
  cart,
  products,
  marketing,
  shippingFee: shippingMethod.fee,
  shippingAddress: body.shippingAddress
});
```

Extend `order.totals`:

```js
        totals: {
          subtotal: pricing.subtotal,
          savings: pricing.productDiscount + pricing.orderDiscount + pricing.couponDiscount,
          productDiscount: pricing.productDiscount,
          orderDiscount: pricing.orderDiscount,
          couponDiscount: pricing.couponDiscount,
          shipping: pricing.shipping,
          paymentFee: pricing.paymentFee,
          taxableAmount: pricing.taxableAmount,
          tax: pricing.tax,
          total: pricing.total,
          grandTotal: pricing.grandTotal,
          currency: pricing.currency,
          taxRegion: pricing.taxRegion,
          calculatedAt: pricing.calculatedAt
        },
```

- [ ] **Step 5: Add order snapshot assertion**

Extend `creates a persisted order from the current cart and clears the cart` in `tests/api.spec.js` with:

```js
  expect(payload.order.totals).toMatchObject({
    tax: expect.any(Number),
    paymentFee: 0,
    grandTotal: expect.any(Number),
    currency: "CNY",
    taxRegion: "WA"
  });
```

- [ ] **Step 6: Verify green and commit**

Run:

```powershell
npx playwright test tests/api.spec.js -g "checkout totals with tax shipping and payment fee|persisted order" --workers=1
```

Expected: PASS.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add lib/checkout-totals.js server.js tests/api.spec.js
git commit -m "feat: add checkout tax and payment fee totals"
```

---

### Task 3: Payment Methods Repository and APIs

**Files:**
- Modify: `tests/api.spec.js`
- Create: `lib/repositories/payment-methods.js`
- Modify: `lib/repositories/admin.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API tests**

Add near payment API tests in `tests/api.spec.js`:

```js
test("returns configured payment methods filtered for the order total", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const response = await request.get(`/api/payment-methods?orderId=${encodeURIComponent(order.id)}&locale=en-US`);
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  expect(payload.methods.map((method) => method.id)).toEqual(["card", "paypal", "gift_card"]);
  expect(payload.methods.find((method) => method.id === "paypal")).toMatchObject({
    label: "PayPal",
    fee: 1,
    isAvailable: true
  });
});

test("disables a payment method from admin API", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const patchResponse = await request.patch("/api/admin/payment-methods/paypal", {
    headers: { cookie },
    data: { status: "inactive", locale: "en-US" }
  });
  expect(patchResponse.ok()).toBe(true);

  const methodsResponse = await request.get("/api/payment-methods?locale=en-US");
  const payload = await methodsResponse.json();
  expect(payload.methods.map((method) => method.id)).not.toContain("paypal");
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "configured payment methods|disables a payment method" --workers=1
```

Expected: FAIL because `/api/payment-methods` and `/api/admin/payment-methods/:id` do not exist.

- [ ] **Step 3: Create payment methods repository**

Create `lib/repositories/payment-methods.js`:

```js
const validStatuses = new Set(["active", "inactive"]);
const validLocales = new Set(["zh-CN", "en-US"]);

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function parseMethod(row) {
  if (!row) return null;
  const payload = JSON.parse(row.payload);
  return {
    ...payload,
    status: row.status,
    sortOrder: row.sort_order,
    feeType: row.fee_type,
    feeAmount: row.fee_amount,
    minTotal: row.min_total,
    maxTotal: row.max_total
  };
}

function calculatePaymentMethodFee(method, orderTotal = 0) {
  if (method.feeType === "fixed") return Number(method.feeAmount) || 0;
  if (method.feeType === "percent") return Math.round(orderTotal * (Number(method.feeAmount) || 0) * 100) / 100;
  return 0;
}

function localizePaymentMethod(method, locale = "zh-CN", orderTotal = 0) {
  const normalizedLocale = normalizeLocale(locale);
  const isAmountAllowed = orderTotal >= method.minTotal && orderTotal <= method.maxTotal;
  return {
    id: method.id,
    label: method.labels?.[normalizedLocale] || method.labels?.["zh-CN"] || method.id,
    description: method.descriptions?.[normalizedLocale] || method.descriptions?.["zh-CN"] || "",
    status: method.status,
    sortOrder: method.sortOrder,
    feeType: method.feeType,
    feeAmount: method.feeAmount,
    fee: calculatePaymentMethodFee(method, orderTotal),
    minTotal: method.minTotal,
    maxTotal: method.maxTotal,
    isAvailable: method.status === "active" && isAmountAllowed
  };
}

function listPaymentMethods(db, { locale = "zh-CN", orderTotal = 0, includeInactive = false } = {}) {
  return db.prepare("SELECT * FROM payment_methods ORDER BY sort_order ASC").all()
    .map(parseMethod)
    .map((method) => localizePaymentMethod(method, locale, orderTotal))
    .filter((method) => includeInactive || method.isAvailable);
}

function findPaymentMethod(db, methodId, { locale = "zh-CN", orderTotal = 0, includeInactive = false } = {}) {
  const method = localizePaymentMethod(parseMethod(db.prepare("SELECT * FROM payment_methods WHERE id = ?").get(methodId)), locale, orderTotal);
  if (!method) return null;
  if (!includeInactive && !method.isAvailable) return null;
  return method;
}

function updatePaymentMethod(db, methodId, patch = {}) {
  const method = parseMethod(db.prepare("SELECT * FROM payment_methods WHERE id = ?").get(methodId));
  if (!method) {
    return { validationError: { statusCode: 404, code: "PAYMENT_METHOD_NOT_FOUND", message: "Payment method was not found." } };
  }

  const nextStatus = patch.status == null ? method.status : String(patch.status).trim();
  if (!validStatuses.has(nextStatus)) {
    return { validationError: { statusCode: 400, code: "PAYMENT_METHOD_CONFIG_INVALID", message: "Payment method status is invalid." } };
  }

  const nextMethod = {
    ...method,
    status: nextStatus,
    sortOrder: patch.sortOrder == null ? method.sortOrder : Number(patch.sortOrder),
    feeType: patch.feeType == null ? method.feeType : String(patch.feeType).trim(),
    feeAmount: patch.feeAmount == null ? method.feeAmount : Number(patch.feeAmount),
    minTotal: patch.minTotal == null ? method.minTotal : Number(patch.minTotal),
    maxTotal: patch.maxTotal == null ? method.maxTotal : Number(patch.maxTotal)
  };

  db.prepare(`
    UPDATE payment_methods
    SET status = ?, sort_order = ?, fee_type = ?, fee_amount = ?, min_total = ?, max_total = ?, payload = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextMethod.status,
    nextMethod.sortOrder,
    nextMethod.feeType,
    nextMethod.feeAmount,
    nextMethod.minTotal,
    nextMethod.maxTotal,
    JSON.stringify(nextMethod),
    new Date().toISOString(),
    methodId
  );

  return { method: findPaymentMethod(db, methodId, { includeInactive: true }) };
}

module.exports = {
  findPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod
};
```

- [ ] **Step 4: Add server routes**

In `server.js`, import:

```js
const {
  findPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod
} = require("./lib/repositories/payment-methods");
```

Add parser:

```js
function parseAdminPaymentMethodPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/payment-methods\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add before order routes:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/payment-methods") {
    const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
    const orderId = requestUrl.searchParams.get("orderId") || "";
    const order = orderId ? withDatabase((db) => findOrderById(db, orderId)) : null;
    const orderTotal = Number(order?.totals?.grandTotal ?? order?.totals?.total ?? 0);
    const methods = withDatabase((db) => listPaymentMethods(db, { locale, orderTotal }));
    sendJson(response, 200, { ok: true, methods });
    return;
  }
```

Add in admin section:

```js
  const requestedPaymentMethodId = parseAdminPaymentMethodPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedPaymentMethodId) {
    try {
      const user = await requireAdminUser(request, response, {
        code: "ADMIN_AUTH_REQUIRED",
        message: "Admin access is required."
      });
      if (!user) return;
      const body = await readRequestBody(request);
      const result = withDatabase((db) => updatePaymentMethod(db, requestedPaymentMethodId, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, method: result.method });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 5: Extend admin repository**

In `lib/repositories/admin.js`, import inside `listAdminMarketing` or create a new function:

```js
function listAdminPaymentMethods(db) {
  const { listPaymentMethods } = require("./payment-methods");
  return listPaymentMethods(db, { includeInactive: true });
}
```

Export `listAdminPaymentMethods`.

Add route `GET /api/admin/payment-methods` in `server.js`:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/admin/payment-methods") {
    try {
      const user = await requireAdminUser(request, response, {
        code: "ADMIN_AUTH_REQUIRED",
        message: "Admin access is required."
      });
      if (!user) return;
      const methods = withDatabase((db) => listAdminPaymentMethods(db));
      sendJson(response, 200, { ok: true, methods });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 6: Verify green and commit**

Run:

```powershell
npx playwright test tests/api.spec.js -g "configured payment methods|disables a payment method" --workers=1
```

Expected: PASS.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add lib/repositories/payment-methods.js lib/repositories/admin.js server.js tests/api.spec.js
git commit -m "feat: add configurable payment methods"
```

---

### Task 4: Webhook Events, Payment Processing, and Invoices

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/repositories/payments.js`
- Create: `lib/repositories/payment-events.js`
- Create: `lib/repositories/invoices.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing webhook and invoice tests**

Add near payment API tests in `tests/api.spec.js`:

```js
test("creates a processing payment and settles it through a successful webhook", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const paymentResponse = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", locale: "en-US" }
  });
  expect(paymentResponse.status()).toBe(201);
  const paymentPayload = await paymentResponse.json();
  expect(paymentPayload.payment.status).toBe("processing");

  const webhookResponse = await request.post("/api/payments/webhook", {
    data: {
      eventId: "evt-success-0001",
      paymentId: paymentPayload.payment.id,
      orderId: order.id,
      status: "succeeded",
      provider: "demo_gateway",
      idempotencyKey: `demo-${paymentPayload.payment.id}-success`,
      signature: "demo-signature",
      locale: "en-US"
    }
  });
  expect(webhookResponse.ok()).toBe(true);
  const webhookPayload = await webhookResponse.json();
  expect(webhookPayload.payment.status).toBe("succeeded");
  expect(webhookPayload.order.status).toBe("paid");
  expect(webhookPayload.invoice.invoiceNumber).toMatch(/^INV-\d{8}-\d{4}$/);
});

test("keeps failed webhook payments retryable and records the event", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const payment = (await (await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "paypal", locale: "en-US" }
  })).json()).payment;

  const webhookResponse = await request.post("/api/payments/webhook", {
    data: {
      eventId: "evt-failed-0001",
      paymentId: payment.id,
      orderId: order.id,
      status: "failed",
      provider: "demo_gateway",
      idempotencyKey: `demo-${payment.id}-failed`,
      signature: "demo-signature",
      failureReason: "Demo payment declined",
      locale: "en-US"
    }
  });
  expect(webhookResponse.ok()).toBe(true);
  const payload = await webhookResponse.json();
  expect(payload.payment.status).toBe("failed");
  expect(payload.order.status).toBe("pending_payment");

  const retryResponse = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", locale: "en-US" }
  });
  expect(retryResponse.status()).toBe(201);
});

test("handles duplicate successful webhooks idempotently without duplicate invoices", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const payment = (await (await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", locale: "en-US" }
  })).json()).payment;
  const callbackPayload = {
    eventId: "evt-duplicate-0001",
    paymentId: payment.id,
    orderId: order.id,
    status: "succeeded",
    provider: "demo_gateway",
    idempotencyKey: `demo-${payment.id}-duplicate`,
    signature: "demo-signature",
    locale: "en-US"
  };

  const firstResponse = await request.post("/api/payments/webhook", { data: callbackPayload });
  const secondResponse = await request.post("/api/payments/webhook", { data: callbackPayload });
  expect(firstResponse.ok()).toBe(true);
  expect(secondResponse.ok()).toBe(true);

  const firstPayload = await firstResponse.json();
  const secondPayload = await secondResponse.json();
  expect(secondPayload.event.eventStatus).toBe("duplicate");
  expect(secondPayload.invoice.id).toBe(firstPayload.invoice.id);
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "processing payment|failed webhook|duplicate successful webhooks" --workers=1
```

Expected: FAIL because payments still settle synchronously and `/api/payments/webhook` does not exist.

- [ ] **Step 3: Update payments repository**

In `lib/repositories/payments.js`, replace validation sets and add helpers:

```js
const PAYMENT_METHODS = new Set(["card", "paypal", "gift_card", "cod"]);
const PAYMENT_OUTCOMES = new Set(["succeeded", "failed"]);
const PAYABLE_ORDER_STATUSES = new Set(["pending_payment"]);

function findPaymentAttemptById(db, paymentId) {
  const row = db.prepare("SELECT payload FROM payment_attempts WHERE id = ?").get(paymentId);
  return row ? JSON.parse(row.payload) : null;
}

function savePaymentAttempt(db, payment) {
  db.prepare(`
    UPDATE payment_attempts
    SET status = ?, failure_reason = ?, updated_at = ?, payload = ?
    WHERE id = ?
  `).run(
    payment.status,
    payment.failureReason || null,
    payment.updatedAt,
    JSON.stringify(payment),
    payment.id
  );
  return payment;
}
```

Replace payment object creation with processing status:

```js
  const payment = {
    id: buildPaymentAttemptId(db),
    orderId: order.id,
    userId: order.userId || null,
    method: normalizedMethod,
    status: "processing",
    provider: "demo_gateway",
    providerPaymentId: `demo-${crypto.randomUUID()}`,
    amount: Number(order.totals?.grandTotal ?? order.totals?.total ?? 0),
    failureReason: "",
    nextAction: {
      type: "demo_webhook",
      webhookUrl: "/api/payments/webhook"
    },
    createdAt: now,
    updatedAt: now
  };
```

At the end of `createPaymentAttempt`, return `{ payment, order, requestedOutcome: normalizedOutcome || "" }` without changing `order.status`.

Export:

```js
  findPaymentAttemptById,
  savePaymentAttempt
```

- [ ] **Step 4: Create invoices repository**

Create `lib/repositories/invoices.js`:

```js
function buildInvoiceNumber(db, now = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE invoice_number LIKE ?").get(`INV-${stamp}-%`);
  return `INV-${stamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function parseInvoice(row) {
  return row ? JSON.parse(row.payload) : null;
}

function findInvoiceByOrderId(db, orderId) {
  return parseInvoice(db.prepare("SELECT payload FROM invoices WHERE order_id = ?").get(orderId));
}

function findInvoiceById(db, invoiceId) {
  return parseInvoice(db.prepare("SELECT payload FROM invoices WHERE id = ?").get(invoiceId));
}

function createInvoiceForOrder(db, order, payment, now = new Date()) {
  const existing = findInvoiceByOrderId(db, order.id);
  if (existing) return existing;

  const totals = order.totals || {};
  const issuedAt = now.toISOString();
  const invoice = {
    id: `invoice-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "issued",
    invoiceNumber: buildInvoiceNumber(db, now),
    issuedAt,
    currency: totals.currency || "CNY",
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    payment: {
      id: payment.id,
      method: payment.method,
      provider: payment.provider
    },
    items: order.items,
    subtotal: totals.subtotal || 0,
    discountTotal: totals.savings || 0,
    shipping: totals.shipping || 0,
    paymentFee: totals.paymentFee || 0,
    tax: totals.tax || 0,
    grandTotal: totals.grandTotal ?? totals.total ?? 0
  };

  db.prepare(`
    INSERT INTO invoices (
      id, order_id, user_id, status, invoice_number, issued_at, currency,
      subtotal, discount_total, shipping, payment_fee, tax, grand_total, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoice.id,
    invoice.orderId,
    invoice.userId,
    invoice.status,
    invoice.invoiceNumber,
    invoice.issuedAt,
    invoice.currency,
    invoice.subtotal,
    invoice.discountTotal,
    invoice.shipping,
    invoice.paymentFee,
    invoice.tax,
    invoice.grandTotal,
    JSON.stringify(invoice)
  );

  return invoice;
}

module.exports = {
  createInvoiceForOrder,
  findInvoiceById,
  findInvoiceByOrderId
};
```

Add `const crypto = require("node:crypto");` at top.

- [ ] **Step 5: Create payment events repository**

Create `lib/repositories/payment-events.js`:

```js
const crypto = require("node:crypto");

const validWebhookStatuses = new Set(["succeeded", "failed"]);
const finalOrderStatuses = new Set(["paid", "cancelled", "refund_pending", "refunded"]);

function findEventByIdempotencyKey(db, idempotencyKey) {
  const row = db.prepare("SELECT payload FROM payment_events WHERE idempotency_key = ?").get(idempotencyKey);
  return row ? JSON.parse(row.payload) : null;
}

function insertPaymentEvent(db, event) {
  db.prepare(`
    INSERT INTO payment_events (
      id, payment_id, order_id, provider, status, event_status,
      idempotency_key, signature, processed_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.paymentId,
    event.orderId,
    event.provider,
    event.status,
    event.eventStatus,
    event.idempotencyKey,
    event.signature,
    event.processedAt,
    JSON.stringify(event)
  );
  return event;
}

function processPaymentWebhook(db, {
  body,
  findOrderById,
  saveOrder,
  findPaymentAttemptById,
  savePaymentAttempt,
  createTimelineEntry,
  createInvoiceForOrder
}) {
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  const duplicateEvent = idempotencyKey ? findEventByIdempotencyKey(db, idempotencyKey) : null;
  if (duplicateEvent) {
    const order = findOrderById(db, duplicateEvent.orderId);
    const payment = findPaymentAttemptById(db, duplicateEvent.paymentId);
    const invoice = order?.payment?.invoiceId ? createInvoiceForOrder(db, order, payment) : null;
    return { event: { ...duplicateEvent, eventStatus: "duplicate" }, payment, order, invoice };
  }

  if (body.signature !== "demo-signature" || !validWebhookStatuses.has(body.status)) {
    return { validationError: { statusCode: 400, code: "PAYMENT_WEBHOOK_INVALID", message: "Payment webhook payload is invalid." } };
  }

  const payment = findPaymentAttemptById(db, body.paymentId);
  const order = findOrderById(db, body.orderId);
  if (!payment || !order || payment.orderId !== order.id) {
    return { validationError: { statusCode: 409, code: "PAYMENT_WEBHOOK_ORDER_MISMATCH", message: "Payment webhook does not match the order." } };
  }

  if (finalOrderStatuses.has(order.status) && order.status !== "pending_payment") {
    return { validationError: { statusCode: 409, code: "PAYMENT_WEBHOOK_FINAL_ORDER", message: "Order is no longer payable." } };
  }

  const transaction = db.transaction(() => {
    const now = new Date().toISOString();
    payment.status = body.status;
    payment.updatedAt = now;
    payment.failureReason = body.status === "failed" ? String(body.failureReason || "Demo payment was declined. Please try another method.") : "";
    savePaymentAttempt(db, payment);

    order.updatedAt = now;
    order.payment = {
      status: payment.status,
      method: payment.method,
      provider: payment.provider,
      latestAttemptId: payment.id,
      latestEventId: body.eventId || ""
    };

    let invoice = null;
    if (body.status === "succeeded") {
      order.status = "paid";
      order.payment.paidAt = now;
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      if (!order.timeline.some((entry) => entry.status === "paid")) {
        order.timeline.push(createTimelineEntry("paid", body.locale));
      }
      invoice = createInvoiceForOrder(db, order, payment);
      order.payment.invoiceId = invoice.id;
    } else {
      order.payment.failureReason = payment.failureReason;
    }

    saveOrder(db, order);
    const event = insertPaymentEvent(db, {
      id: body.eventId || `evt-${crypto.randomUUID()}`,
      paymentId: payment.id,
      orderId: order.id,
      provider: body.provider || "demo_gateway",
      status: body.status,
      eventStatus: "processed",
      idempotencyKey,
      signature: body.signature,
      processedAt: now,
      request: body
    });

    return { event, payment, order, invoice };
  });

  return transaction();
}

module.exports = {
  processPaymentWebhook
};
```

- [ ] **Step 6: Add webhook route and compatibility path**

In `server.js`, import:

```js
const {
  findPaymentAttemptById,
  savePaymentAttempt
} = require("./lib/repositories/payments");
const { processPaymentWebhook } = require("./lib/repositories/payment-events");
const {
  createInvoiceForOrder,
  findInvoiceByOrderId
} = require("./lib/repositories/invoices");
```

Add route before order routes:

```js
  if (request.method === "POST" && requestUrl.pathname === "/api/payments/webhook") {
    try {
      const body = await readRequestBody(request);
      const result = withDatabase((db) => processPaymentWebhook(db, {
        body,
        findOrderById,
        saveOrder,
        findPaymentAttemptById,
        savePaymentAttempt,
        createTimelineEntry,
        createInvoiceForOrder
      }));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, ...result });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

In `POST /api/orders/:id/payments`, after `createPaymentAttempt`, if `body.outcome` exists, call `processPaymentWebhook` with:

```js
      if (body.outcome) {
        const callback = withDatabase((db) => processPaymentWebhook(db, {
          body: {
            eventId: `evt-${result.payment.id}-${body.outcome}`,
            paymentId: result.payment.id,
            orderId: order.id,
            status: body.outcome,
            provider: "demo_gateway",
            idempotencyKey: `demo-${result.payment.id}-${body.outcome}`,
            signature: "demo-signature",
            failureReason: body.outcome === "failed" ? "Demo payment was declined. Please try another method." : "",
            locale
          },
          findOrderById,
          saveOrder,
          findPaymentAttemptById,
          savePaymentAttempt,
          createTimelineEntry,
          createInvoiceForOrder
        }));
        sendJson(response, 201, { ok: true, payment: callback.payment, order: callback.order, invoice: callback.invoice });
        return;
      }
```

For non-`outcome` requests, respond:

```js
      sendJson(response, 201, {
        ok: true,
        payment: result.payment,
        order: result.order,
        nextAction: result.payment.nextAction
      });
```

- [ ] **Step 7: Verify green and commit**

Run:

```powershell
npx playwright test tests/api.spec.js -g "processing payment|failed webhook|duplicate successful webhooks|successful payment attempt|failed payment attempt" --workers=1
```

Expected: PASS, including old payment tests through the compatibility path.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add lib/repositories/payments.js lib/repositories/payment-events.js lib/repositories/invoices.js server.js tests/api.spec.js
git commit -m "feat: add payment webhook and invoices"
```

---

### Task 5: Invoice Read APIs

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`
- Modify: `lib/repositories/invoices.js`

- [ ] **Step 1: Write failing invoice read tests**

Add near invoice/payment tests:

```js
test("returns invoice for a paid order and not-ready for unpaid orders", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const notReadyResponse = await request.get(`/api/orders/${order.id}/invoice`);
  expect(notReadyResponse.status()).toBe(409);
  expect((await notReadyResponse.json()).error.code).toBe("INVOICE_NOT_READY");

  await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });

  const invoiceResponse = await request.get(`/api/orders/${order.id}/invoice`);
  expect(invoiceResponse.ok()).toBe(true);
  const invoicePayload = await invoiceResponse.json();
  expect(invoicePayload.invoice).toMatchObject({
    orderId: order.id,
    status: "issued",
    tax: expect.any(Number),
    grandTotal: expect.any(Number)
  });
});

test("does not expose another user's invoice", async ({ request }) => {
  const { order } = await createLoggedInOrder(request, {
    name: "Invoice Owner",
    email: "invoice-owner@example.com",
    password: "demo1234"
  });
  await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });
  const otherRegisterResponse = await request.post("/api/auth/register", {
    data: { name: "Other User", email: "other-invoice@example.com", password: "demo1234" }
  });
  const otherCookie = getSessionCookie(otherRegisterResponse);

  const response = await request.get(`/api/orders/${order.id}/invoice`, {
    headers: { cookie: otherCookie }
  });
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("INVOICE_NOT_FOUND");
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/api.spec.js -g "returns invoice for a paid order|does not expose another user's invoice" --workers=1
```

Expected: FAIL because invoice read routes do not exist.

- [ ] **Step 3: Add parsers and routes**

In `server.js`, add:

```js
function parseOrderInvoicePath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/invoice$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseInvoiceIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/invoices\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add route:

```js
  const requestedInvoiceOrderId = parseOrderInvoicePath(requestUrl.pathname);
  if (request.method === "GET" && requestedInvoiceOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedInvoiceOrderId));
      if (!order) {
        sendError(response, 404, "INVOICE_NOT_FOUND", "Invoice was not found.");
        return;
      }
      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "INVOICE_NOT_FOUND", "Invoice was not found.");
        return;
      }
      const invoice = withDatabase((db) => findInvoiceByOrderId(db, requestedInvoiceOrderId));
      if (!invoice) {
        sendError(response, 409, "INVOICE_NOT_READY", "Invoice is not ready until payment succeeds.");
        return;
      }
      sendJson(response, 200, { ok: true, invoice });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

Add `/api/invoices/:id` route with the same ownership check by loading invoice first, then order by `invoice.orderId`.

- [ ] **Step 4: Verify green and commit**

Run:

```powershell
npx playwright test tests/api.spec.js -g "returns invoice for a paid order|does not expose another user's invoice" --workers=1
```

Expected: PASS.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add server.js tests/api.spec.js
git commit -m "feat: add invoice read APIs"
```

---

### Task 6: Payment Page and Invoice UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing UI tests**

Add near payment UI tests in `tests/socks-product-list.spec.js`:

```js
test("shows configured payment methods and totals breakdown on the payment page", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);

  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=payment&id=SOCK-/);

  await expect(page.locator("[data-payment-method-card]")).toHaveCount(3);
  await expect(page.locator("[data-payment-breakdown]")).toContainText("Tax");
  await expect(page.locator("[data-payment-breakdown]")).toContainText("Grand total");
});

test("shows invoice entry after successful payment", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);

  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await payCurrentOrderFromPaymentPage(page);

  await expect(page.locator("[data-invoice-card]")).toBeVisible();
  await expect(page.locator("[data-invoice-card]")).toContainText(/INV-\d{8}-\d{4}/);
  await expect(page.locator("[data-invoice-card]")).toContainText("Tax");
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "configured payment methods|invoice entry" --workers=1
```

Expected: FAIL because payment method cards and invoice UI are not rendered.

- [ ] **Step 3: Add frontend API helpers**

In `public/js/storefront-app.js`, add near payment helpers:

```js
async function fetchPaymentMethods(orderId) {
  const params = new URLSearchParams({ orderId, locale: activeLocale });
  const response = await fetch(`/api/payment-methods?${params.toString()}`);
  if (!response.ok) return { methods: [] };
  return response.json();
}

async function fetchOrderInvoice(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`);
  if (!response.ok) return { invoice: null };
  return response.json();
}
```

- [ ] **Step 4: Render payment method cards and breakdown**

In `renderPaymentPage()`, load:

```js
const methodsPayload = await fetchPaymentMethods(orderId);
const paymentMethods = Array.isArray(methodsPayload.methods) ? methodsPayload.methods : [];
```

Replace fixed radio fieldset with:

```html
<fieldset class="checkout-shipping" data-payment-methods>
  <legend>${t("payment.method")}</legend>
  ${paymentMethods.map((method, index) => `
    <label class="payment-method-card" data-payment-method-card>
      <input type="radio" name="method" value="${escapeHtml(method.id)}" data-payment-method="${escapeHtml(method.id)}" ${index === 0 ? "checked" : ""}>
      <strong>${escapeHtml(method.label)}</strong>
      <span>${escapeHtml(method.description)}</span>
      <span>${formatCurrency(method.fee)}</span>
    </label>
  `).join("")}
</fieldset>
```

Add payment breakdown aside:

```html
<section class="order-source" data-payment-breakdown>
  <p class="order-source__title">${activeLocale === LOCALE_KEY.EN_US ? "Payment breakdown" : "支付明细"}</p>
  <p>${t("common.subtotal")} · ${formatCurrency(order.totals.subtotal)}</p>
  <p>${activeLocale === LOCALE_KEY.EN_US ? "Shipping" : "运费"} · ${formatCurrency(order.totals.shipping || 0)}</p>
  <p>${activeLocale === LOCALE_KEY.EN_US ? "Tax" : "税费"} · ${formatCurrency(order.totals.tax || 0)}</p>
  <p>${activeLocale === LOCALE_KEY.EN_US ? "Grand total" : "应付总额"} · ${formatCurrency(order.totals.grandTotal ?? order.totals.total)}</p>
</section>
```

- [ ] **Step 5: Render invoice card on order detail**

In `renderOrderPage()`, load invoice with `fetchOrderInvoice(requestedOrderId)` and pass to `renderPersistedOrder(order, { invoice })`.

Add helper:

```js
function createInvoiceCardMarkup(invoice) {
  if (!invoice) {
    return `
      <div class="order-source" data-invoice-card>
        <p class="order-source__title">${activeLocale === LOCALE_KEY.EN_US ? "Invoice" : "发票"}</p>
        <p class="order-source__copy">${activeLocale === LOCALE_KEY.EN_US ? "Available after successful payment." : "支付成功后可查看发票。"}</p>
      </div>
    `;
  }

  return `
    <div class="order-source invoice-card" data-invoice-card>
      <p class="order-source__title">${escapeHtml(invoice.invoiceNumber)}</p>
      <p class="order-source__copy">${activeLocale === LOCALE_KEY.EN_US ? "Tax" : "税费"} · ${formatCurrency(invoice.tax || 0)}</p>
      <p class="order-source__copy">${activeLocale === LOCALE_KEY.EN_US ? "Grand total" : "应付总额"} · ${formatCurrency(invoice.grandTotal || 0)}</p>
    </div>
  `;
}
```

Insert `${createInvoiceCardMarkup(options.invoice)}` after payment card in `renderPersistedOrder`.

- [ ] **Step 6: Add CSS**

In `socks-product-list.html`, add near order/payment styles:

```css
.payment-method-card {
  display: grid;
  gap: 4px;
  min-height: 58px;
  border: 1px solid #dedede;
  border-radius: 14px;
  padding: 12px;
  background: #ffffff;
  cursor: pointer;
}

.payment-method-card span,
.invoice-card p {
  color: #6b6b6b;
  font-size: 12px;
  line-height: 1.5;
}
```

- [ ] **Step 7: Verify green and commit**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "configured payment methods|invoice entry|successful payment|retry state" --workers=1
```

Expected: PASS.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add public/js/storefront-app.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: show payment methods and invoices in storefront"
```

---

### Task 7: Admin Payment Configuration UI

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `public/js/storefront-app.js`

- [ ] **Step 1: Write failing admin UI test**

Add near admin UI tests:

```js
test("disables a payment method from the admin console and hides it on payment page", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='payments']").click();
  await page.locator("[data-admin-payment-method][data-method-id='paypal'] [data-admin-payment-toggle]").click();
  await expect(page.locator("[data-admin-payment-method][data-method-id='paypal']")).toContainText("inactive");

  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();

  await expect(page.locator("[data-payment-method='paypal']")).toHaveCount(0);
});
```

- [ ] **Step 2: Verify red**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "disables a payment method" --workers=1
```

Expected: FAIL because admin payment tab is missing.

- [ ] **Step 3: Add admin tab**

In `socks-product-list.html`, add in admin tabs:

```html
<button type="button" data-admin-tab="payments">支付</button>
```

In `public/js/storefront-app.js`, add to admin tab rendering switch:

```js
if (activeAdminTab === "payments") return renderAdminPayments();
```

Add click handler in `adminPanel.addEventListener("click", ...)`:

```js
const paymentToggle = event.target.closest("[data-admin-payment-toggle]");
if (paymentToggle) {
  const row = paymentToggle.closest("[data-admin-payment-method]");
  paymentToggle.disabled = true;
  await patchAdminJson(`/api/admin/payment-methods/${encodeURIComponent(row.dataset.methodId)}`, {
    status: row.dataset.status === "active" ? "inactive" : "active",
    locale: activeLocale
  });
  await renderAdminPayments();
  return;
}
```

Add:

```js
async function renderAdminPayments() {
  const payload = await fetchAdminJson("/api/admin/payment-methods");
  adminPanel.innerHTML = `<div class="admin-table">${payload.methods.map((method) => `
    <article class="admin-row" data-admin-payment-method data-method-id="${escapeHtml(method.id)}" data-status="${escapeHtml(method.status)}">
      <span>${escapeHtml(method.id)}</span>
      <strong>${escapeHtml(method.label)}</strong>
      <span>${escapeHtml(method.status)}</span>
      <span>${formatCurrency(method.fee)}</span>
      <button class="order-button order-button--secondary" type="button" data-admin-payment-toggle>
        ${method.status === "active" ? "Disable" : "Enable"}
      </button>
    </article>
  `).join("")}</div>`;
}
```

- [ ] **Step 4: Verify green and commit**

Run:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "disables a payment method|renders admin dashboard tabs" --workers=1
```

Expected: PASS.

Commit:

```powershell
git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
git add public/js/storefront-app.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add admin payment method controls"
```

---

### Task 8: Focused Regression, Full Verification, Commit

**Files:**
- Modify only implementation and test files already listed in Tasks 1-7 if regression failures reveal a payment-upgrade issue.

- [ ] **Step 1: Run focused API regression**

Run:

```powershell
npx playwright test tests/api.spec.js -g "payment|invoice|checkout totals|order creation|refund|fulfillment|admin payment" --workers=1
```

Expected: PASS.

- [ ] **Step 2: Run focused UI regression**

Run after Step 1 finishes:

```powershell
npx playwright test tests/socks-product-list.spec.js -g "payment|invoice|admin|checkout|order detail|refund progress" --workers=1
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

- [ ] **Step 6: Commit any final fixes**

If Step 5 shows intended uncommitted changes, commit them:

```powershell
git add lib/database.js lib/checkout-totals.js lib/repositories/payment-methods.js lib/repositories/payments.js lib/repositories/payment-events.js lib/repositories/invoices.js lib/repositories/admin.js server.js public/js/storefront-app.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: complete payment system upgrade"
```

Expected: commit succeeds, or no commit is needed because earlier task commits already captured every intended change.

---

## Self-Review

- Spec coverage: payment method config, webhook callback, idempotent event handling, tax/shipping/payment-fee totals, invoice generation, invoice read APIs, payment page UI, order detail invoice UI, and admin payment controls are covered by Tasks 1-7.
- Scope control: no real gateway, no real card data, no PCI workflow, no PDF invoice, no credit memo, no multi-currency, no high-concurrency payment testing.
- TDD coverage: each implementation task begins with API or UI failing tests and verifies red before implementation.
- Type consistency: `payment_methods`, `payment_events`, `invoices`, `paymentFee`, `taxableAmount`, `tax`, `grandTotal`, `currency`, `taxRegion`, `processing`, `succeeded`, `failed`, `eventStatus`, and `invoiceNumber` use the same names across tasks.
- Execution safety: all test commands use `--workers=1`; no background agents or parallel Playwright runs are required.

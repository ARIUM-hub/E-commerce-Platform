# Socks After-Sales Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first after-sales PR: logged-in users can request returns/exchanges from real orders, see return history, and cancel eligible requests.

**Architecture:** Keep the existing Node HTTP + SQLite + single-page storefront architecture. Add a focused returns repository that owns quantity eligibility, return request persistence, status transitions, and serialization; then expose it through `/api/returns` routes and render `view=return` plus `view=returns` inside `socks-product-list.html`. Payment simulation and the admin dashboard remain separate follow-up PRs, but PR 1 includes a small demo-reviewer status API contract so the later admin page can reuse it.

**Tech Stack:** Node HTTP server, `node:sqlite`/`better-sqlite3` compatibility layer, vanilla HTML/CSS/JavaScript, Playwright API/UI tests, existing storefront i18n dictionary.

---

## File Structure

- Modify: `lib/database.js`
  Adds `return_requests`, `return_request_items`, and `return_request_events` tables plus indexes.
- Create: `lib/repositories/returns.js`
  Owns return types, reasons, status labels, quantity eligibility, request creation, list/detail queries, and status transitions.
- Modify: `server.js`
  Imports the returns repository and wires `GET /api/me/returns`, `POST /api/returns`, `GET /api/returns/:id`, and `PATCH /api/returns/:id/status`.
- Modify: `socks-product-list.html`
  Adds return request and return history views, order-detail/order-history entry points, i18n copy, CSS, API helpers, and client-side validation.
- Modify: `tests/api.spec.js`
  Adds schema, repository-backed API, authorization, quantity, and transition coverage.
- Modify: `tests/socks-product-list.spec.js`
  Adds UI coverage for entering from order detail, submitting a return, showing history, and validating quantity.

Do not create separate HTML pages. Do not store return requests in JSON. Do not implement real refunds, file uploads, real logistics pickup, payment simulation, or a full admin dashboard in this PR.

## Task 1: Database Schema And Repository Tests

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/database.js`
- Create: `lib/repositories/returns.js`

- [ ] **Step 1: Write failing schema test**

Add this test after `initializes SQLite support ticket table` in `tests/api.spec.js`:

```js
test("initializes SQLite return request tables", async () => {
  const db = createDatabase(":memory:");
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const requestTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'return_requests'").get();
    const itemTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'return_request_items'").get();
    const eventTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'return_request_events'").get();

    expect(requestTable).toEqual({ name: "return_requests" });
    expect(itemTable).toEqual({ name: "return_request_items" });
    expect(eventTable).toEqual({ name: "return_request_events" });
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run schema test to verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "initializes SQLite return request tables"
```

Expected: FAIL because `return_requests` does not exist.

- [ ] **Step 3: Add return tables**

In `lib/database.js`, add these tables inside `runSchema(db)` after `support_tickets`:

```js
    CREATE TABLE IF NOT EXISTS return_requests (
      id TEXT PRIMARY KEY,
      return_number TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      contact TEXT NOT NULL,
      status TEXT NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS return_request_items (
      id TEXT PRIMARY KEY,
      return_request_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      title TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      original_price REAL,
      FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS return_request_events (
      id TEXT PRIMARY KEY,
      return_request_id TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE CASCADE
    );
```

Add these indexes near the existing indexes:

```js
    CREATE INDEX IF NOT EXISTS idx_return_requests_user ON return_requests(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_return_items_request ON return_request_items(return_request_id);
```

- [ ] **Step 4: Run schema test to verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "initializes SQLite return request tables"
```

Expected: PASS.

- [ ] **Step 5: Write failing repository tests**

Add these tests after `createLoggedInOrder` helpers in `tests/api.spec.js`:

```js
test("creates a return request and stores selected order item quantities", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie: sessionCookie },
    data: { status: "paid", locale: "zh-CN" }
  });

  const response = await request.post("/api/returns", {
    headers: { cookie: sessionCookie },
    data: {
      orderId: order.id,
      type: "return_refund",
      reason: "size_issue",
      contact: "alex@example.com",
      note: "尺码偏紧，申请退货退款。",
      items: [{ skuId: "sock-01-39", quantity: 1 }]
    }
  });

  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.returnRequest).toMatchObject({
    orderId: order.id,
    userId: order.userId,
    type: "return_refund",
    reason: "size_issue",
    status: "submitted"
  });
  expect(payload.returnRequest.returnNumber).toMatch(/^RET-\d{8}-\d{4}$/);
  expect(payload.returnRequest.items).toEqual([
    expect.objectContaining({
      productId: "sock-01",
      skuId: "sock-01-39",
      size: "39",
      quantity: 1
    })
  ]);
  expect(payload.returnRequest.timeline[0]).toMatchObject({ status: "submitted" });
});

test("rejects a return request that exceeds remaining returnable quantity", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie: sessionCookie },
    data: { status: "paid", locale: "zh-CN" }
  });

  await request.post("/api/returns", {
    headers: { cookie: sessionCookie },
    data: {
      orderId: order.id,
      type: "return_refund",
      reason: "size_issue",
      contact: "alex@example.com",
      items: [{ skuId: "sock-01-39", quantity: 1 }]
    }
  });

  const response = await request.post("/api/returns", {
    headers: { cookie: sessionCookie },
    data: {
      orderId: order.id,
      type: "exchange",
      reason: "wrong_item",
      contact: "alex@example.com",
      items: [{ skuId: "sock-01-39", quantity: 1 }]
    }
  });

  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("RETURN_QUANTITY_EXCEEDED");
});
```

- [ ] **Step 6: Run repository/API tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "return request"
```

Expected: FAIL because `/api/returns` is not wired.

- [ ] **Step 7: Create returns repository**

Create `lib/repositories/returns.js` with these exported functions and constants:

```js
const crypto = require("node:crypto");

const validReturnTypes = new Set(["return_refund", "exchange", "refund_only"]);
const validReturnReasons = new Set(["size_issue", "quality_issue", "wrong_item", "changed_mind", "other"]);
const returnableOrderStatuses = new Set(["paid", "processing", "shipped", "delivered"]);
const activeReturnStatuses = new Set(["submitted", "reviewing", "approved"]);
const returnStatusTransitions = {
  submitted: new Set(["reviewing", "cancelled"]),
  reviewing: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["completed"]),
  rejected: new Set([]),
  completed: new Set([]),
  cancelled: new Set([])
};

function getReturnStatusLabel(status, locale = "zh-CN") {
  const labels = {
    submitted: { "zh-CN": "已提交", "en-US": "Submitted" },
    reviewing: { "zh-CN": "审核中", "en-US": "In review" },
    approved: { "zh-CN": "已通过", "en-US": "Approved" },
    rejected: { "zh-CN": "已拒绝", "en-US": "Rejected" },
    completed: { "zh-CN": "已完成", "en-US": "Completed" },
    cancelled: { "zh-CN": "已取消", "en-US": "Cancelled" }
  };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}
```

Include `buildReturnNumber(db, now)`, `serializeReturnRequest(db, requestRow)`, `listReturnRequestsByUser(db, userId)`, `findReturnRequestById(db, returnRequestId)`, `getReturnEligibility(db, order)`, `createReturnRequest(db, order, user, body)`, and `updateReturnRequestStatus(db, returnRequest, status, locale)`.

Use this eligibility calculation inside `getReturnEligibility` and `createReturnRequest`:

```js
function getReturnedQuantitiesBySku(db, orderId) {
  const rows = db.prepare(`
    SELECT item.sku_id AS skuId, SUM(item.quantity) AS quantity
    FROM return_request_items item
    JOIN return_requests request ON request.id = item.return_request_id
    WHERE item.order_id = ?
      AND request.status IN ('submitted', 'reviewing', 'approved', 'completed')
    GROUP BY item.sku_id
  `).all(orderId);

  return new Map(rows.map((row) => [row.skuId, row.quantity]));
}
```

Return validation errors as `{ validationError: { statusCode, code, message } }` using these codes: `RETURN_ORDER_NOT_ELIGIBLE`, `RETURN_ITEM_NOT_FOUND`, `RETURN_QUANTITY_INVALID`, `RETURN_QUANTITY_EXCEEDED`, `RETURN_REASON_REQUIRED`, `RETURN_TYPE_INVALID`, `RETURN_STATUS_INVALID`, and `RETURN_TRANSITION_INVALID`.

- [ ] **Step 8: Run focused API tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "return request"
```

Expected: still FAIL until server routes are wired in Task 2.

- [ ] **Step 9: Commit schema and repository work**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/database.js lib/repositories/returns.js tests/api.spec.js; git commit -m "feat: add return request repository"
```

Expected: commit succeeds after Task 2 routes are complete and focused tests pass. If this task is executed before Task 2, delay the commit until the route tests pass.

## Task 2: Return API Routes

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Add failing authorization and status tests**

Add these tests near the other order history tests in `tests/api.spec.js`:

```js
test("requires login before creating or listing return requests", async ({ request }) => {
  const listResponse = await request.get("/api/me/returns");
  expect(listResponse.status()).toBe(401);
  expect((await listResponse.json()).error.code).toBe("AUTH_REQUIRED");

  const createResponse = await request.post("/api/returns", {
    data: { orderId: "SOCK-20990101-0001", type: "return_refund", reason: "size_issue", contact: "guest@example.com", items: [] }
  });
  expect(createResponse.status()).toBe(401);
  expect((await createResponse.json()).error.code).toBe("AUTH_REQUIRED");
});

test("lists current user's return requests only", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie: sessionCookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const createResponse = await request.post("/api/returns", {
    headers: { cookie: sessionCookie },
    data: {
      orderId: order.id,
      type: "return_refund",
      reason: "size_issue",
      contact: "alex@example.com",
      items: [{ skuId: "sock-01-39", quantity: 1 }]
    }
  });
  const created = (await createResponse.json()).returnRequest;

  const listResponse = await request.get("/api/me/returns", {
    headers: { cookie: sessionCookie }
  });

  expect(listResponse.ok()).toBe(true);
  const payload = await listResponse.json();
  expect(payload.returnRequests).toEqual([
    expect.objectContaining({ id: created.id, orderId: order.id })
  ]);
});

test("allows owner to cancel a submitted return request", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie: sessionCookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const createResponse = await request.post("/api/returns", {
    headers: { cookie: sessionCookie },
    data: {
      orderId: order.id,
      type: "return_refund",
      reason: "size_issue",
      contact: "alex@example.com",
      items: [{ skuId: "sock-01-39", quantity: 1 }]
    }
  });
  const created = (await createResponse.json()).returnRequest;

  const cancelResponse = await request.patch(`/api/returns/${created.id}/status`, {
    headers: { cookie: sessionCookie },
    data: { status: "cancelled", locale: "zh-CN" }
  });

  expect(cancelResponse.ok()).toBe(true);
  const payload = await cancelResponse.json();
  expect(payload.returnRequest.status).toBe("cancelled");
  expect(payload.returnRequest.timeline.map((entry) => entry.status)).toEqual(["submitted", "cancelled"]);
});
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "return"
```

Expected: FAIL because routes are absent.

- [ ] **Step 3: Wire route helpers and imports**

In `server.js`, add the repository import beside the order repository import:

```js
const {
  createReturnRequest,
  findReturnRequestById,
  listReturnRequestsByUser,
  updateReturnRequestStatus
} = require("./lib/repositories/returns");
```

Add this parser near `parseOrderStatusPath`:

```js
function parseReturnIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/returns\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseReturnStatusPath(pathname) {
  const match = pathname.match(/^\/api\/returns\/([^/]+)\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

- [ ] **Step 4: Add returns API route chain**

Add these handlers before the cart item routes in `server.js`:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/me/returns") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;

      const returnRequests = withDatabase((db) => listReturnRequestsByUser(db, user.id));
      sendJson(response, 200, { returnRequests });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/returns") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;

      const body = await readRequestBody(request);
      const order = withDatabase((db) => findOrderById(db, String(body.orderId || "")));
      if (!order || order.userId !== user.id) {
        sendError(response, 404, "RETURN_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const result = withDatabase((db) => createReturnRequest(db, order, user, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 201, { ok: true, returnRequest: result.returnRequest });
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

Add detail and status handlers using `parseReturnIdFromPath` and `parseReturnStatusPath`. Owner can read their own request. Owner can only move to `cancelled`. A request with header `x-demo-admin: true` can move through `reviewing`, `approved`, `rejected`, and `completed`; this is a demo bridge for PR 3, not a full permission system.

- [ ] **Step 5: Run route tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "return"
```

Expected: PASS.

- [ ] **Step 6: Commit API routes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add server.js lib/database.js lib/repositories/returns.js tests/api.spec.js; git commit -m "feat: add return request api"
```

Expected: commit succeeds.

## Task 3: Storefront Return Views

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing UI tests**

Add these tests after the order-detail tests in `tests/socks-product-list.spec.js`:

```js
test("submits a return request from persisted order detail", async ({ page }) => {
  await registerFromUi(page);
  await page.goto("/socks-product-list.html");
  await page.locator("[data-product-card]").first().locator("[data-size='39']").click();
  await page.locator("[data-product-card]").first().locator("[data-add-cart]").click();
  await page.locator("[data-cart-toggle]").click();
  await page.locator("[data-cart-checkout]").click();
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=order&id=/);
  await page.locator("[data-order-status-action][data-next-status='paid']").click();

  await page.locator("[data-order-return-link]").click();
  await expect(page).toHaveURL(/view=return/);
  await expect(page.locator("[data-return-view]")).toBeVisible();
  await page.locator("[data-return-item-checkbox]").first().check();
  await page.locator("[data-return-type]").selectOption("return_refund");
  await page.locator("[data-return-reason]").selectOption("size_issue");
  await page.locator("[data-return-contact]").fill("alex@example.com");
  await page.locator("[data-return-note]").fill("尺码偏紧，申请退货退款。");
  await page.locator("[data-return-submit]").click();

  await expect(page).toHaveURL(/view=returns/);
  await expect(page.locator("[data-return-history-card]").first()).toContainText(/RET-\d{8}-\d{4}/);
  await expect(page.locator("[data-return-history-card]").first()).toContainText("已提交");
});

test("shows return quantity validation in the return form", async ({ page }) => {
  await registerFromUi(page);
  await page.goto("/socks-product-list.html");
  await page.locator("[data-product-card]").first().locator("[data-size='39']").click();
  await page.locator("[data-product-card]").first().locator("[data-add-cart]").click();
  await page.locator("[data-cart-toggle]").click();
  await page.locator("[data-cart-checkout]").click();
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await page.locator("[data-order-status-action][data-next-status='paid']").click();
  await page.locator("[data-order-return-link]").click();

  await page.locator("[data-return-submit]").click();
  await expect(page.locator("[data-return-form-error]")).toContainText("请选择至少一件商品");
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "return"
```

Expected: FAIL because return views and selectors do not exist.

- [ ] **Step 3: Add view containers**

In `socks-product-list.html`, add containers after `[data-order-view]`:

```html
    <div class="return-view" data-return-view hidden>
      <section class="hero hero--compact">
        <p class="hero__eyebrow" data-return-hero-eyebrow>After-sales</p>
        <h1 class="hero__title" data-return-title>申请售后</h1>
        <p class="hero__description" data-return-copy>选择订单商品、数量和售后原因。</p>
      </section>
      <section class="order-panel" data-return-panel></section>
    </div>

    <div class="returns-view" data-returns-view hidden>
      <section class="hero hero--compact">
        <p class="hero__eyebrow" data-returns-hero-eyebrow>Return history</p>
        <h1 class="hero__title" data-returns-title>售后进度</h1>
        <p class="hero__description" data-returns-copy>查看已提交的退换货申请。</p>
      </section>
      <section class="order-panel" data-returns-panel></section>
    </div>
```

- [ ] **Step 4: Add view constants and route detection**

Add constants near the other view keys:

```js
    const RETURN_VIEW_KEY = "return";
    const RETURNS_VIEW_KEY = "returns";
```

Update `getCurrentView()`:

```js
      if (view === RETURN_VIEW_KEY) {
        return RETURN_VIEW_KEY;
      }

      if (view === RETURNS_VIEW_KEY) {
        return RETURNS_VIEW_KEY;
      }
```

Update `renderCurrentView()` to hide/show both new containers and call `renderReturnView()` or `renderReturnsView()`.

- [ ] **Step 5: Add return API helpers and renderers**

Add these helper signatures near order helpers:

```js
    async function fetchReturns() {
      const response = await fetch("/api/me/returns");
      if (!response.ok) {
        throw new Error("Failed to load returns");
      }
      return response.json();
    }

    async function submitReturnRequest(payload) {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale: activeLocale })
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error?.message || "Failed to submit return");
        error.code = result.error?.code;
        throw error;
      }
      return result;
    }
```

`renderReturnView()` must fetch the order by `id`, reject anonymous users by showing login CTA, show only returnable order items, and render checked item quantities no higher than `returnableQuantity`. `renderReturnsView()` must call `/api/me/returns` and render cards with return number, order id, status label, item summary, created date, and cancel button for `submitted`/`reviewing`.

- [ ] **Step 6: Add order entry points**

In `renderPersistedOrder(order)`, add this link inside the order actions when `["paid", "processing", "shipped", "delivered"].includes(order.status)`:

```html
            <a
              class="order-button order-button--primary"
              href="${STOREFRONT_PATH}?view=return&id=${encodeURIComponent(order.id)}"
              data-order-return-link
            >
              ${t("returns.request")}
            </a>
```

In `renderOrderHistory(orders)`, show either `data-order-history-return-link` for eligible orders or `data-order-history-returns-link` when returns exist after `GET /api/me/returns` has loaded.

- [ ] **Step 7: Add CSS and i18n copy**

Add CSS classes reusing the existing black/white/gray ecommerce style: `.return-view`, `.returns-view`, `.return-form`, `.return-line-item`, `.return-status-card`, `.return-quantity`, `.return-actions`, and `.return-error`.

Add `LOCALE_MESSAGES["zh-CN"].returns` and `LOCALE_MESSAGES["en-US"].returns` keys for titles, labels, statuses, type labels, reason labels, validation messages, success copy, and cancel actions. Use normal Chinese text directly, not escaped Unicode.

- [ ] **Step 8: Wire submit and cancel events**

Add delegated handlers:

```js
    returnPagePanel.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-return-form]");
      if (!form) return;
      event.preventDefault();
      const errorNode = form.querySelector("[data-return-form-error]");
      const checkedItems = [...form.querySelectorAll("[data-return-item-checkbox]:checked")];
      if (!checkedItems.length) {
        errorNode.textContent = t("returns.errors.itemsRequired");
        return;
      }
      const items = checkedItems.map((checkbox) => {
        const row = checkbox.closest("[data-return-line-item]");
        return {
          skuId: row.dataset.skuId,
          quantity: Number.parseInt(row.querySelector("[data-return-quantity]").value, 10)
        };
      });
      const payload = await submitReturnRequest({
        orderId: getRequestedOrderId(),
        type: form.querySelector("[data-return-type]").value,
        reason: form.querySelector("[data-return-reason]").value,
        contact: form.querySelector("[data-return-contact]").value,
        note: form.querySelector("[data-return-note]").value,
        items
      });
      window.location.href = `${STOREFRONT_PATH}?view=returns&created=${encodeURIComponent(payload.returnRequest.id)}`;
    });
```

Add a click handler for `[data-return-cancel]` that calls `PATCH /api/returns/:id/status` with `{ status: "cancelled", locale: activeLocale }` and refreshes `renderReturnsView()`.

- [ ] **Step 9: Run focused UI tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "return"
```

Expected: PASS.

- [ ] **Step 10: Commit storefront views**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: add return request storefront flow"
```

Expected: commit succeeds.

## Task 4: Return Detail And Policy Integration

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`
- Modify: `lib/repositories/support.js`

- [ ] **Step 1: Write failing integration tests**

Add these tests in `tests/socks-product-list.spec.js`:

```js
test("links returns policy to order history and returns history", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=returns");

  await expect(page.locator("[data-support-return-orders-link]")).toHaveAttribute("href", /view=orders/);
  await expect(page.locator("[data-support-return-history-link]")).toHaveAttribute("href", /view=returns/);
});

test("opens a return request detail from return history", async ({ page }) => {
  await registerFromUi(page);
  await page.goto("/socks-product-list.html");
  await page.locator("[data-product-card]").first().locator("[data-size='39']").click();
  await page.locator("[data-product-card]").first().locator("[data-add-cart]").click();
  await page.locator("[data-cart-toggle]").click();
  await page.locator("[data-cart-checkout]").click();
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await page.locator("[data-order-status-action][data-next-status='paid']").click();
  await page.locator("[data-order-return-link]").click();
  await page.locator("[data-return-item-checkbox]").first().check();
  await page.locator("[data-return-type]").selectOption("return_refund");
  await page.locator("[data-return-reason]").selectOption("size_issue");
  await page.locator("[data-return-contact]").fill("alex@example.com");
  await page.locator("[data-return-submit]").click();

  await page.locator("[data-return-history-detail-link]").first().click();
  await expect(page).toHaveURL(/view=return&id=/);
  await expect(page.locator("[data-return-detail]")).toContainText(/RET-\d{8}-\d{4}/);
  await expect(page.locator("[data-return-detail]")).toContainText("Minimal Crew Socks");
});
```

- [ ] **Step 2: Run integration tests to verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "returns policy|return request detail"
```

Expected: FAIL because policy CTA and return detail mode are absent.

- [ ] **Step 3: Extend support returns section with CTAs**

In `renderSupportSection()`, when active section id is `returns`, append:

```html
        <div class="support-ticket">
          <a class="order-button order-button--primary" href="/socks-product-list.html?view=orders" data-support-return-orders-link>${t("returns.fromOrders")}</a>
          <a class="order-button order-button--secondary" href="/socks-product-list.html?view=returns" data-support-return-history-link>${t("returns.viewHistory")}</a>
        </div>
```

- [ ] **Step 4: Support return detail mode**

Use `view=return&id=<returnRequestId>&mode=detail` for return detail. In `renderReturnView()`, if `mode=detail`, call `GET /api/returns/:id` and render `[data-return-detail]`; otherwise treat `id` as an order id and render the creation form.

Return detail markup must include:

```html
        <section class="order-stack" data-return-detail>
          <div class="order-summary">
            <div class="order-summary__row"><span>${t("returns.returnNumber")}</span><span>${returnRequest.returnNumber}</span></div>
            <div class="order-summary__row"><span>${t("common.orderNumber")}</span><span>${returnRequest.orderId}</span></div>
            <div class="order-summary__row"><span>${t("returns.status")}</span><span>${returnRequest.statusLabel}</span></div>
          </div>
        </section>
```

- [ ] **Step 5: Run integration tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "returns policy|return request detail"
```

Expected: PASS.

- [ ] **Step 6: Commit integration work**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add socks-product-list.html tests/socks-product-list.spec.js lib/repositories/support.js; git commit -m "feat: connect return flow to policy pages"
```

Expected: commit succeeds.

## Task 5: Verification And PR Preparation

**Files:**
- Review: `lib/database.js`
- Review: `lib/repositories/returns.js`
- Review: `server.js`
- Review: `socks-product-list.html`
- Review: `tests/api.spec.js`
- Review: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Run full API tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js
```

Expected: PASS.

- [ ] **Step 2: Run focused storefront regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "return|order|support|checkout"
```

Expected: PASS.

- [ ] **Step 3: Check for unintended fixture-only noise**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git status --short
```

Expected: only intentional source/test/doc changes. If SQLite fixture runs changed JSON line endings only, verify with `git diff --check` and restore the fixture files through `git checkout-index -f -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json`.

- [ ] **Step 4: Run diff hygiene checks**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit any final polish**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/database.js lib/repositories/returns.js server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js; git commit -m "test: cover return request flow"
```

Expected: commit succeeds only if there are remaining intentional test or polish changes.

- [ ] **Step 6: Prepare PR summary**

Use this PR description:

```markdown
## Summary
- add SQLite-backed return request tables and repository logic
- expose logged-in customer return APIs with quantity eligibility and cancellation
- add storefront return request/history/detail views connected to order and policy flows

## Tests
- npx playwright test tests/api.spec.js
- npx playwright test tests/socks-product-list.spec.js -g "return|order|support|checkout"
```

Expected: PR 1 can be opened from `feature/socks-after-sales-payment-admin` after this branch is pushed, or split to a dedicated `feature/socks-after-sales-returns` branch before opening if we want one PR per branch.

# 袜子商城支付模拟流程实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把结算后的待支付订单升级为有独立支付页、支付尝试记录、失败重试和订单状态同步的演示级真实支付流程。

**Architecture:** 继续使用现有 Node HTTP + SQLite + 单页 `socks-product-list.html` 架构。后端新增 `payment_attempts` 表和 `lib/repositories/payments.js`，订单仍由 `lib/repositories/orders.js` 持久化；前端新增 `view=payment`，只通过支付 API 推进订单，不再从用户侧直接把订单状态 PATCH 到 `paid`。

**Tech Stack:** Node.js HTTP server, SQLite, Playwright, vanilla HTML/CSS/JavaScript.

---

## 文件结构

- Modify: `lib/database.js`
  - 新增 `payment_attempts` 表，初始化测试库和本地库时自动建表。
- Create: `lib/repositories/payments.js`
  - 封装支付方式校验、支付尝试创建、支付列表读取、订单支付状态同步。
- Modify: `lib/repositories/orders.js`
  - 继续复用 `findOrderById`、`saveOrder`；如需要只增加小型 helper，不迁移订单职责。
- Modify: `server.js`
  - 引入 payments repository，新增 `/api/orders/:id/payments` 的 `POST` 和 `GET` 路由。
- Modify: `socks-product-list.html`
  - 新增支付视图、支付文案、支付 API 调用、结算跳转、订单详情继续支付入口。
- Modify: `tests/api.spec.js`
  - 增加支付 API 红绿测试。
- Modify: `tests/socks-product-list.spec.js`
  - 增加结算后支付页、支付成功、支付失败重试、订单详情继续支付 UI 测试。

## Task 1: 支付表与支付仓库

**Files:**
- Modify: `lib/database.js`
- Create: `lib/repositories/payments.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: 写失败测试：待支付订单支付成功会生成支付尝试并推进订单**

Add this test near the existing order lifecycle tests in `tests/api.spec.js`:

```js
test("creates a successful payment attempt and marks the order paid", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });

  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.payment).toMatchObject({
    orderId: order.id,
    method: "card",
    status: "succeeded",
    amount: order.totals.total
  });
  expect(payload.order.status).toBe("paid");
  expect(payload.order.payment).toMatchObject({
    status: "succeeded",
    method: "card"
  });
  expect(payload.order.timeline.map((entry) => entry.status)).toEqual([
    "pending_payment",
    "paid"
  ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "successful payment attempt"
```

Expected: FAIL because `/api/orders/:id/payments` does not exist yet.

- [ ] **Step 3: 新增 SQLite 表**

In `lib/database.js`, add this table after `order_timeline`:

```js
    CREATE TABLE IF NOT EXISTS payment_attempts (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_id TEXT,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
```

- [ ] **Step 4: 创建支付仓库最小实现**

Create `lib/repositories/payments.js`:

```js
const PAYMENT_METHODS = new Set(["card", "paypal", "gift_card"]);
const PAYMENT_OUTCOMES = new Set(["succeeded", "failed"]);

function buildPaymentAttemptId(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM payment_attempts").get().count;
  return `PAY-${String(count + 1).padStart(6, "0")}`;
}

function serializePayment(row) {
  return JSON.parse(row.payload);
}

function listPaymentAttemptsByOrder(db, orderId) {
  return db.prepare(`
    SELECT payload FROM payment_attempts
    WHERE order_id = ?
    ORDER BY created_at DESC
  `).all(orderId).map(serializePayment);
}

function createPaymentAttempt(db, { order, method, outcome, locale, createTimelineEntry, saveOrder }) {
  const normalizedMethod = String(method || "").trim();
  const normalizedOutcome = String(outcome || "").trim();

  if (!PAYMENT_METHODS.has(normalizedMethod)) {
    return {
      validationError: {
        statusCode: 400,
        code: "PAYMENT_METHOD_INVALID",
        message: "Payment method is invalid."
      }
    };
  }

  if (!PAYMENT_OUTCOMES.has(normalizedOutcome)) {
    return {
      validationError: {
        statusCode: 400,
        code: "PAYMENT_OUTCOME_INVALID",
        message: "Payment outcome is invalid."
      }
    };
  }

  if (order.status !== "pending_payment") {
    return {
      validationError: {
        statusCode: 409,
        code: "PAYMENT_ORDER_NOT_PAYABLE",
        message: "Order is not payable."
      }
    };
  }

  const now = new Date().toISOString();
  const status = normalizedOutcome === "succeeded" ? "succeeded" : "failed";
  const payment = {
    id: buildPaymentAttemptId(db),
    orderId: order.id,
    userId: order.userId || null,
    method: normalizedMethod,
    status,
    amount: order.totals.total,
    failureReason: status === "failed" ? "Demo payment was declined. Please try another method." : "",
    createdAt: now,
    updatedAt: now
  };

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO payment_attempts
        (id, order_id, user_id, method, status, amount, failure_reason, created_at, updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payment.id,
      payment.orderId,
      payment.userId,
      payment.method,
      payment.status,
      payment.amount,
      payment.failureReason || null,
      payment.createdAt,
      payment.updatedAt,
      JSON.stringify(payment)
    );

    if (status === "succeeded") {
      order.status = "paid";
      order.updatedAt = now;
      order.payment = {
        status: "succeeded",
        method: normalizedMethod,
        paidAt: now,
        latestAttemptId: payment.id
      };
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push(createTimelineEntry("paid", locale));
      saveOrder(db, order);
    } else {
      order.updatedAt = now;
      order.payment = {
        status: "failed",
        method: normalizedMethod,
        failureReason: payment.failureReason,
        latestAttemptId: payment.id
      };
      saveOrder(db, order);
    }

    return { payment, order };
  });

  return transaction();
}

module.exports = {
  createPaymentAttempt,
  listPaymentAttemptsByOrder
};
```

- [ ] **Step 5: 提交本任务**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/database.js lib/repositories/payments.js tests/api.spec.js; git commit -m "feat: add payment attempt persistence"
```

## Task 2: 支付 API 路由与错误码

**Files:**
- Modify: `server.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: 写失败测试：查询订单支付尝试历史**

Add:

```js
test("lists payment attempts for an order", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "paypal", outcome: "failed", locale: "en-US" }
  });

  const response = await request.get(`/api/orders/${order.id}/payments`);
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.payments).toHaveLength(1);
  expect(payload.payments[0]).toMatchObject({
    orderId: order.id,
    method: "paypal",
    status: "failed"
  });
});
```

- [ ] **Step 2: 写失败测试：已取消订单不可支付**

Add:

```js
test("rejects payment attempts for cancelled orders", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "cancelled", locale: "en-US" }
  });

  const response = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });

  expect(response.status()).toBe(409);
  const payload = await response.json();
  expect(payload.error.code).toBe("PAYMENT_ORDER_NOT_PAYABLE");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "payment attempts|cancelled orders"
```

Expected: FAIL because payment routes are not wired.

- [ ] **Step 4: 接入 server 路由**

In `server.js`, import:

```js
const {
  createPaymentAttempt,
  listPaymentAttemptsByOrder
} = require("./lib/repositories/payments");
```

Add parser helpers near the order parser helpers:

```js
function parseOrderPaymentsPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Add routes before the generic `GET /api/orders/:id` route:

```js
  const requestedPaymentOrderId = parseOrderPaymentsPath(requestUrl.pathname);
  if (requestedPaymentOrderId && request.method === "GET") {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedPaymentOrderId));
      if (!order) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const payments = withDatabase((db) => listPaymentAttemptsByOrder(db, requestedPaymentOrderId));
      sendJson(response, 200, { payments });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (requestedPaymentOrderId && request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const locale = normalizeLocale(body.locale);
      const order = withDatabase((db) => findOrderById(db, requestedPaymentOrderId));

      if (!order) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const result = withDatabase((db) => createPaymentAttempt(db, {
        order,
        method: body.method,
        outcome: body.outcome,
        locale,
        createTimelineEntry,
        saveOrder
      }));

      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 201, { ok: true, payment: result.payment, order: result.order });
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

- [ ] **Step 5: 运行 API 支付测试确认通过**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "payment"
```

Expected: all payment API tests pass.

- [ ] **Step 6: 提交本任务**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add server.js tests/api.spec.js; git commit -m "feat: add payment attempt api"
```

## Task 3: 支付页与订单详情入口

**Files:**
- Modify: `socks-product-list.html`
- Test: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写失败测试：结算后跳转支付页**

Add:

```js
test("opens the payment view after checkout submit", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);

  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();

  await expect(page).toHaveURL(/view=payment&id=SOCK-/);
  await expect(page.locator("[data-payment-view]")).toBeVisible();
  await expect(page.locator("[data-payment-method='card']")).toBeVisible();
  await expect(page.locator("[data-payment-submit]")).toContainText("Pay now");
});
```

- [ ] **Step 2: 写失败测试：支付成功后进入订单详情且状态为 Paid**

Add:

```js
test("simulates a successful payment from the payment view", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);

  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=payment&id=SOCK-/);

  const paymentResponse = page.waitForResponse((response) => {
    return response.url().includes("/payments") && response.request().method() === "POST";
  });
  await page.locator("[data-payment-submit]").click();
  expect((await paymentResponse).status()).toBe(201);

  await expect(page).toHaveURL(/view=order&id=SOCK-/);
  await expect(page.locator("[data-order-status]")).toHaveText("Paid");
  await expect(page.locator("[data-order-payment]")).toContainText("Card");
});
```

- [ ] **Step 3: 写失败测试：支付失败显示重试入口**

Add:

```js
test("shows retry state after a failed demo payment", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("socks-storefront-locale", "en-US");
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);

  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  await expect(page).toHaveURL(/view=payment&id=SOCK-/);

  await page.locator("[data-payment-fail-demo]").click();

  await expect(page.locator("[data-payment-error]")).toContainText("Payment failed");
  await expect(page.locator("[data-payment-submit]")).toContainText("Retry payment");
  await expect(page).toHaveURL(/view=payment&id=SOCK-/);
});
```

- [ ] **Step 4: 运行 UI 测试确认失败**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "payment"
```

Expected: FAIL because `view=payment` and selectors are missing.

- [ ] **Step 5: 新增支付视图 DOM**

Add this block near the existing checkout/order views:

```html
    <div class="payment-view" data-payment-view hidden>
      <section class="hero">
        <p class="hero__eyebrow" data-payment-hero-eyebrow>Payment</p>
        <h1 class="hero__title" data-payment-title>支付订单</h1>
        <p class="hero__description" data-payment-copy>选择演示支付方式并完成支付。</p>
      </section>
      <section class="order-panel" data-payment-panel></section>
    </div>
```

- [ ] **Step 6: 新增支付文案**

Add `payment` translation blocks for both locales:

```js
payment: {
  heroEyebrow: "安全支付",
  heroTitle: "支付订单",
  heroCopy: "选择演示支付方式。系统会记录支付尝试并同步订单状态。",
  method: "支付方式",
  card: "银行卡",
  paypal: "PayPal",
  giftCard: "礼品卡",
  payNow: "立即支付",
  retry: "重试支付",
  failDemo: "模拟失败",
  attempts: "支付记录",
  succeeded: "支付成功",
  failed: "Payment failed, please try again.",
  unavailable: "当前订单不可支付。",
  backToOrder: "返回订单"
}
```

English:

```js
payment: {
  heroEyebrow: "Secure Payment",
  heroTitle: "Pay your order",
  heroCopy: "Choose a demo payment method. The backend records each attempt and syncs the order status.",
  method: "Payment method",
  card: "Card",
  paypal: "PayPal",
  giftCard: "Gift card",
  payNow: "Pay now",
  retry: "Retry payment",
  failDemo: "Simulate failure",
  attempts: "Payment attempts",
  succeeded: "Payment succeeded",
  failed: "Payment failed, please try again.",
  unavailable: "This order cannot be paid.",
  backToOrder: "Back to order"
}
```

- [ ] **Step 7: 接入支付前端逻辑**

Implement these functions in the script near order helpers:

```js
function getPaymentOrderId() {
  return getSearchParams().get("id") || "";
}

async function fetchPaymentAttempts(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments`);
  if (!response.ok) {
    return { payments: [] };
  }
  return response.json();
}

async function createPayment(orderId, payload) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, locale: activeLocale })
  });

  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to process payment");
  }

  return response.json();
}

function getPaymentMethodLabel(method) {
  const labels = {
    card: t("payment.card"),
    paypal: t("payment.paypal"),
    gift_card: t("payment.giftCard")
  };
  return labels[method] || method;
}
```

Render markup:

```js
async function renderPaymentPage() {
  const orderId = getPaymentOrderId();
  const payload = await fetchOrder(orderId);
  const order = payload.order;
  const paymentsPayload = await fetchPaymentAttempts(orderId);
  const payments = Array.isArray(paymentsPayload.payments) ? paymentsPayload.payments : [];
  const latestPayment = payments[0] || order.payment || null;
  const canPay = order.status === "pending_payment";

  paymentHeroEyebrow.textContent = t("payment.heroEyebrow");
  paymentTitle.textContent = t("payment.heroTitle");
  paymentCopy.textContent = t("payment.heroCopy");
  paymentPanel.innerHTML = `
    <div class="checkout-layout">
      <form class="checkout-form" data-payment-form novalidate>
        <div class="order-summary">
          <div class="order-summary__row"><span>${t("common.orderNumber")}</span><span>${escapeHtml(order.id)}</span></div>
          <div class="order-summary__row"><span>${t("common.estimatedTotal")}</span><span>${formatCurrency(order.totals.total)}</span></div>
        </div>
        <fieldset class="checkout-shipping">
          <legend>${t("payment.method")}</legend>
          <label><input type="radio" name="method" value="card" data-payment-method="card" checked> ${t("payment.card")}</label>
          <label><input type="radio" name="method" value="paypal" data-payment-method="paypal"> ${t("payment.paypal")}</label>
          <label><input type="radio" name="method" value="gift_card" data-payment-method="gift_card"> ${t("payment.giftCard")}</label>
        </fieldset>
        <div class="checkout-form__error" data-payment-error role="alert">${latestPayment?.status === "failed" ? t("payment.failed") : ""}</div>
        <button class="cart-drawer__checkout-button" type="submit" data-payment-submit ${canPay ? "" : "disabled"}>
          ${latestPayment?.status === "failed" ? t("payment.retry") : t("payment.payNow")}
        </button>
        <button class="cart-drawer__confirmation-action" type="button" data-payment-fail-demo ${canPay ? "" : "disabled"}>${t("payment.failDemo")}</button>
        <a class="order-button order-button--secondary" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(order.id)}">${t("payment.backToOrder")}</a>
      </form>
      <aside class="checkout-summary" data-payment-attempts>
        <h2>${t("payment.attempts")}</h2>
        ${payments.length ? payments.map((payment) => `
          <article class="checkout-summary__item" data-payment-attempt>
            <span>${getPaymentMethodLabel(payment.method)}</span>
            <span>${payment.status}</span>
            <span>${formatCurrency(payment.amount)}</span>
          </article>
        `).join("") : `<p>${t("payment.unavailable")}</p>`}
      </aside>
    </div>
  `;
}
```

- [ ] **Step 8: 改结算跳转与订单详情支付入口**

Change checkout success redirect:

```js
window.location.href = `${STOREFRONT_PATH}?view=payment&id=${encodeURIComponent(payload.order.id)}`;
```

Change pending-payment order action from PATCH status to link:

```js
if (order.status === "pending_payment") {
  return [
    { href: `${STOREFRONT_PATH}?view=payment&id=${encodeURIComponent(order.id)}`, label: t("order.payDemo") },
    { status: "cancelled", label: t("order.cancelDemo") }
  ];
}
```

Render action as an `<a>` when `action.href` exists. Keep cancellation and fulfillment actions on `data-order-status-action`.

Add order payment summary in `renderPersistedOrder` when `order.payment` exists:

```html
<div class="order-source" data-order-payment>
  <p class="order-source__title">${getPaymentMethodLabel(order.payment.method)}</p>
  <p class="order-source__copy">${order.payment.status}</p>
</div>
```

- [ ] **Step 9: 添加支付表单事件**

Add:

```js
paymentPanel.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-payment-form]");
  if (!form) return;

  event.preventDefault();
  const orderId = getPaymentOrderId();
  const submitButton = form.querySelector("[data-payment-submit]");
  const errorNode = form.querySelector("[data-payment-error]");
  submitButton.disabled = true;
  errorNode.textContent = "";

  try {
    const method = new FormData(form).get("method") || "card";
    const payload = await createPayment(orderId, { method, outcome: "succeeded" });
    window.location.href = `${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(payload.order.id)}`;
  } catch (error) {
    errorNode.textContent = t("payment.failed");
    submitButton.disabled = false;
  }
});

paymentPanel.addEventListener("click", async (event) => {
  const failButton = event.target.closest("[data-payment-fail-demo]");
  if (!failButton) return;

  const form = failButton.closest("[data-payment-form]");
  const orderId = getPaymentOrderId();
  const method = new FormData(form).get("method") || "card";
  failButton.disabled = true;

  try {
    await createPayment(orderId, { method, outcome: "failed" });
    await renderPaymentPage();
  } catch (error) {
    await renderPaymentPage();
  }
});
```

- [ ] **Step 10: 运行 UI 支付测试确认通过**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "payment"
```

Expected: payment UI tests pass.

- [ ] **Step 11: 提交本任务**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: add storefront payment flow"
```

## Task 4: 回归与收口

**Files:**
- Modify only if verification reveals a focused issue.

- [ ] **Step 1: 运行支付 API 与 UI 聚焦回归**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "payment|order status|persisted order"
```

Expected: relevant API tests pass.

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "payment|checkout|order detail|return"
```

Expected: relevant UI tests pass or existing skipped tests remain skipped.

- [ ] **Step 2: 运行全量 API 回归**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js
```

Expected: API suite passes.

- [ ] **Step 3: 清理测试 fixture 噪音**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

Expected: JSON fixture files return to committed state; SQLite DB files remain ignored or unchanged unless intentionally tracked.

- [ ] **Step 4: 检查 diff 与空白错误**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git diff --check; git status --short
```

Expected: no whitespace errors; status only shows intentional source/test/doc changes before final commit, or clean after commit.

- [ ] **Step 5: 最终提交**

If previous task commits already captured all changes and status is clean, skip. Otherwise run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/database.js lib/repositories/payments.js server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js docs/superpowers/plans/2026-07-27-socks-payment-flow.md; git commit -m "feat: complete payment simulation flow"
```

## 自检

- Spec coverage: 覆盖了 PR2 支付页、成功/失败/重试、支付尝试记录、订单状态同步、订单详情继续支付入口、API 错误码和中英文文案。
- Placeholder scan: 未保留 TBD、TODO、later、适当处理等占位语；每个任务都有具体文件、代码片段、命令和预期结果。
- Type consistency: 统一使用 `payment_attempts`、`createPaymentAttempt`、`listPaymentAttemptsByOrder`、`method`、`outcome`、`status`、`order.payment`、`view=payment`。
- Scope control: 不接真实支付网关、不做退款、不做后台、不新增复杂权限；保持单会话低并发执行。

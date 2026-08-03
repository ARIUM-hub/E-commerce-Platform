# 真实数据看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为商城后台增加基于真实访问、支付、退款、订单行和 SKU 库存数据的 7/30/90 天经营看板。

**Architecture:** 新增轻量访问事件表补足独立访客和漏斗分母，支付、退款、热销商品和库存仍从现有业务表实时聚合。后台通过独立分析仓储和管理 API 返回稳定视图模型，前端使用独立模块渲染 KPI、SVG 趋势、转化漏斗、热销排行和 SKU 预警，不继续扩大 `storefront-app.js` 的业务职责。

**Tech Stack:** Node.js 原生 HTTP、Node SQLite、原生浏览器 JavaScript、HTML/CSS、SVG、Playwright API/UI 测试。

---

## File Map

- Modify: `lib/database.js`：增加 `0012_analytics_events` 迁移和索引。
- Create: `lib/repositories/analytics-events.js`：事件白名单、服务端身份、上海日期桶、去重和写入。
- Create: `lib/repositories/admin-analytics.js`：周期、对比、交易聚合、趋势、热销排行和库存严重度。
- Create: `lib/routes/analytics-routes.js`：受限公共事件写入和会话限频。
- Create: `lib/routes/admin-analytics-routes.js`：管理员经营看板读取 API。
- Modify: `server.js`：注册分析路由并注入现有会话、商品、订单和管理员服务。
- Create: `public/js/admin-analytics-dashboard.js`：时间范围、请求竞态、KPI、图表、排行、库存预警和状态页面。
- Modify: `public/js/storefront-app.js`：上报受控事件并挂载独立后台看板模块。
- Modify: `socks-product-list.html`：看板样式和脚本入口。
- Modify: `tests/api.spec.js`：迁移、去重、安全、时间边界、指标、排行、库存和权限测试。
- Modify: `tests/socks-product-list.spec.js`：事件触发、时间切换、可访问性、移动端和异常状态测试。

## Execution Notes

- 当前分支已有未推送营销活动提交；不得重置、改写或丢弃这些提交。
- 所有文本文件保持 UTF-8，中文直接写入，不使用 `\uXXXX`。
- Playwright 固定 `--workers=1`，不启动后台智能体、外部分析服务或并行测试。
- 每次测试后恢复明确被修改的 JSON fixture；只删除本轮测试明确生成的上传文件。
- 事件记录失败不得阻断商品展示、加购或结算主链路。

### Task 1: 分析事件数据库迁移

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写迁移和幂等失败测试**

在现有迁移测试之后增加：

```js
test("initializes analytics event storage and indexes idempotently", () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const columns = db.prepare("PRAGMA table_info(analytics_events)").all().map((column) => column.name);
  const indexes = db.prepare("PRAGMA index_list(analytics_events)").all().map((index) => index.name);
  expect(columns).toEqual(expect.arrayContaining([
    "id", "event_type", "visitor_id", "session_id", "user_id", "product_id",
    "order_id", "occurred_at", "bucket_date", "dedupe_key", "metadata"
  ]));
  expect(indexes).toEqual(expect.arrayContaining([
    "idx_analytics_event_time", "idx_analytics_visitor_funnel", "idx_analytics_product_event"
  ]));
  expect(db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("0012_analytics_events"))
    .toEqual({ id: "0012_analytics_events" });
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "analytics event storage" --workers=1`

Expected: FAIL，`analytics_events` 表和迁移不存在。

- [ ] **Step 3: 实现迁移**

在 `lib/database.js` 增加：

```js
function ensureAnalyticsEventTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT,
      product_id TEXT,
      order_id TEXT,
      occurred_at TEXT NOT NULL,
      bucket_date TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      metadata TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_event_time
      ON analytics_events(event_type, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_visitor_funnel
      ON analytics_events(visitor_id, event_type, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_product_event
      ON analytics_events(product_id, event_type, occurred_at);
  `);
}
```

在 `migrations` 末尾注册：

```js
({
  id: "0012_analytics_events",
  name: "Add storefront analytics event storage",
  up(db) {
    ensureAnalyticsEventTables(db);
  }
})
```

- [ ] **Step 4: 运行迁移和初始化回归**

Run: `npm run test:api -- --grep "analytics event storage|schema migrations|idempotently" --workers=1`

Expected: 新迁移测试和既有迁移幂等测试全部 PASS。

- [ ] **Step 5: 提交迁移**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add analytics event schema"
```

### Task 2: 访问事件规范化、去重与限频

**Files:**
- Create: `lib/repositories/analytics-events.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写事件安全和去重失败测试**

```js
test("records allowlisted analytics events once per visitor day", () => {
  const { recordAnalyticsEvent } = require("../lib/repositories/analytics-events");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const now = new Date("2026-08-03T02:00:00.000Z");
  const context = { visitorId: "session-a", sessionId: null, userId: null, now };
  const first = recordAnalyticsEvent(db, { eventType: "storefront_visit" }, context);
  const replay = recordAnalyticsEvent(db, { eventType: "storefront_visit" }, context);
  const product = recordAnalyticsEvent(db, { eventType: "product_view", productId: "sock-01" }, context);
  const invalid = recordAnalyticsEvent(db, {
    eventType: "payment_success", userId: "spoofed", occurredAt: "2020-01-01T00:00:00.000Z"
  }, context);
  expect(first).toMatchObject({ recorded: true, event: { bucketDate: "2026-08-03" } });
  expect(replay).toMatchObject({ recorded: false });
  expect(product.recorded).toBe(true);
  expect(invalid.validationError.code).toBe("ANALYTICS_EVENT_INVALID");
  expect(db.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count).toBe(2);
  db.close();
});
```

```js
test("creates isolated analytics limiter windows", () => {
  const { createAnalyticsEventLimiter } = require("../lib/repositories/analytics-events");
  let now = 1000;
  const limiter = createAnalyticsEventLimiter({ limit: 2, windowMs: 60000, now: () => now });
  expect(limiter.consume("session-a")).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(limiter.consume("session-a")).toEqual({ allowed: true, retryAfterMs: 0 });
  expect(limiter.consume("session-a").allowed).toBe(false);
  expect(limiter.consume("session-b").allowed).toBe(true);
  now += 60001;
  expect(limiter.consume("session-a").allowed).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "allowlisted analytics|analytics limiter" --workers=1`

Expected: FAIL，仓储模块不存在。

- [ ] **Step 3: 实现事件仓储**

创建 `lib/repositories/analytics-events.js`：

```js
const crypto = require("node:crypto");

const PUBLIC_EVENT_TYPES = new Set([
  "storefront_visit", "product_view", "cart_add", "checkout_start"
]);

function getShanghaiDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

function buildDedupeKey(event, context, bucketDate) {
  const productScope = event.eventType === "product_view" ? `:${event.productId}` : "";
  return `${event.eventType}:${context.visitorId}:${bucketDate}${productScope}`;
}

function recordAnalyticsEvent(db, input, context) {
  const eventType = String(input.eventType || "").trim();
  const productId = String(input.productId || "").trim();
  if (!PUBLIC_EVENT_TYPES.has(eventType)) {
    return { validationError: { statusCode: 400, code: "ANALYTICS_EVENT_INVALID", message: "Analytics event is invalid." } };
  }
  if (eventType === "product_view" && !db.prepare("SELECT id FROM products WHERE id = ?").get(productId)) {
    return { validationError: { statusCode: 400, code: "ANALYTICS_PRODUCT_INVALID", message: "Analytics product is invalid." } };
  }
  const occurredAt = context.now.toISOString();
  const bucketDate = getShanghaiDate(context.now);
  const dedupeKey = buildDedupeKey({ eventType, productId }, context, bucketDate);
  const result = db.prepare(`
    INSERT OR IGNORE INTO analytics_events (
      id, event_type, visitor_id, session_id, user_id, product_id, order_id,
      occurred_at, bucket_date, dedupe_key, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, '{}')
  `).run(
    `analytics-${crypto.randomUUID()}`, eventType, context.visitorId,
    context.sessionId, context.userId, productId || null, occurredAt, bucketDate, dedupeKey
  );
  return {
    recorded: Number(result.changes) === 1,
    event: { eventType, productId: productId || null, occurredAt, bucketDate }
  };
}
```

同文件实现 `createAnalyticsEventLimiter({ limit = 120, windowMs = 60000, now = Date.now })`，内部 `Map` 按会话 key 保存 `count` 和 `windowStartedAt`；窗口过期时删除旧记录。导出 `PUBLIC_EVENT_TYPES`、`getShanghaiDate`、`recordAnalyticsEvent` 和 `createAnalyticsEventLimiter`。

- [ ] **Step 4: 运行事件仓储测试确认转绿**

Run: `npm run test:api -- --grep "allowlisted analytics|analytics limiter" --workers=1`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交事件仓储**

```powershell
git add lib/repositories/analytics-events.js tests/api.spec.js
git commit -m "feat: record deduplicated storefront analytics"
```

### Task 3: 公共事件 API 与商城埋点

**Files:**
- Create: `lib/routes/analytics-routes.js`
- Modify: `server.js`
- Modify: `public/js/storefront-app.js`
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写公共 API 身份防伪失败测试**

```js
test("accepts storefront analytics without trusting client identity or time", async ({ request }) => {
  const response = await request.post("/api/analytics/events", {
    data: {
      eventType: "product_view", productId: "sock-01",
      userId: "spoofed-user", sessionId: "spoofed-session", occurredAt: "2020-01-01T00:00:00.000Z"
    }
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.event).not.toHaveProperty("userId");
  expect(payload.event.occurredAt).not.toBe("2020-01-01T00:00:00.000Z");
  expect(response.headers()["set-cookie"]).toContain("socks_session=");
  const invalid = await request.post("/api/analytics/events", { data: { eventType: "payment_success" } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("ANALYTICS_EVENT_INVALID");
});
```

- [ ] **Step 2: 写浏览器事件触发失败测试**

```js
test("records storefront detail cart and checkout analytics after successful actions", async ({ page }) => {
  const events = [];
  await page.route("**/api/analytics/events", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, recorded: true }) });
  });
  await page.goto("/socks-product-list.html");
  await page.locator("[data-product-card][data-product-id='sock-01']")
    .locator("[data-product-detail-link]").click();
  await page.locator("[data-detail-size='39']").click();
  await page.locator("[data-detail-cart-button]").click();
  await page.goto("/socks-product-list.html?view=checkout");
  await expect.poll(() => events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
    "storefront_visit", "product_view", "cart_add", "checkout_start"
  ]));
});
```

- [ ] **Step 3: 运行 API/UI 测试确认红灯**

Run: `npm run test:api -- --grep "storefront analytics without trusting" --workers=1`

Run: `npm run test:ui -- --grep "records storefront detail cart" --workers=1`

Expected: API 404，UI 没有事件请求。

- [ ] **Step 4: 创建公共事件路由**

`lib/routes/analytics-routes.js` 提供：

```js
function registerAnalyticsRoutes(router, services) {
  const limiter = services.createAnalyticsEventLimiter();
  router.post("/api/analytics/events", async ({ request, response, sendJson, sendError }) => {
    const body = await services.readRequestBody(request);
    const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
    if (activeCart.setCookieHeader) response.setHeader("Set-Cookie", activeCart.setCookieHeader);
    const visitorId = activeCart.sessionId;
    const limit = limiter.consume(visitorId);
    if (!limit.allowed) {
      sendError(response, 429, "ANALYTICS_RATE_LIMITED", "Too many analytics events.", {
        retryAfterSeconds: Math.ceil(limit.retryAfterMs / 1000)
      });
      return;
    }
    const result = services.withDatabase((db) => services.recordAnalyticsEvent(db, body, {
      visitorId,
      sessionId: activeCart.sessionId,
      userId: activeCart.user?.id || null,
      now: new Date()
    }));
    if (result.validationError) {
      const error = result.validationError;
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }
    sendJson(response, result.recorded ? 201 : 200, { ok: true, ...result });
  });
}
```

用现有 `handleRequestBodyError` 模式包裹请求体解析，确保无效 JSON 和超限请求继续使用标准错误封装。

- [ ] **Step 5: 注册路由并实现非阻塞浏览器上报**

在 `server.js` 导入仓储与 `registerAnalyticsRoutes`，在 `router` 初始化区注入 `readActiveCart`、`readRequestBody`、`handleRequestBodyError`、`recordAnalyticsEvent`、`createAnalyticsEventLimiter` 和 `withDatabase`。

在 `public/js/storefront-app.js` 增加：

```js
function sendAnalyticsEvent(eventType, productId = "") {
  fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, productId })
  }).catch(() => {});
}
```

接入点固定为：

- `renderProducts()` 成功完成后发送 `storefront_visit`。
- `renderDetailPage()` 成功渲染有效商品后发送 `storefront_visit` 和 `product_view`。
- `addCartItem()` 收到成功响应并更新购物车后发送 `cart_add` 和商品 ID。
- `initializePage()` 确认 checkout 购物车非空并完成渲染后发送 `checkout_start`。

不得在请求发出前上报，也不得 `await` 埋点请求阻塞主链路。

- [ ] **Step 6: 运行 API/UI 测试确认转绿**

Run: `npm run test:api -- --grep "storefront analytics without trusting" --workers=1`

Run: `npm run test:ui -- --grep "records storefront detail cart" --workers=1`

Expected: 两条测试 PASS，现有商品和购物车交互仍通过。

- [ ] **Step 7: 提交公共事件链路**

```powershell
git add lib/routes/analytics-routes.js server.js public/js/storefront-app.js tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: capture storefront analytics events"
```

### Task 4: 周期边界、净销售额、转化率和退款率

**Files:**
- Create: `lib/repositories/admin-analytics.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写上海周期边界失败测试**

先在 `tests/api.spec.js` 增加供本任务和 Task 5 复用的真实表 helper：

```js
function seedPaidAnalyticsOrder(db, {
  orderId, paymentId = `${orderId}-payment`, amount, paidAt, items = []
}) {
  const orderItems = items.length ? items : [
    { productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜", size: "39", quantity: 1, price: amount }
  ];
  const order = {
    id: orderId, orderNumber: orderId, status: "paid", items: orderItems,
    totals: { subtotal: amount, taxableAmount: amount, total: amount, grandTotal: amount },
    payment: { status: "succeeded", paidAt }, createdAt: paidAt, updatedAt: paidAt
  };
  db.prepare(`INSERT INTO orders (id, user_id, status, payload, created_at, updated_at)
    VALUES (?, NULL, 'paid', ?, ?, ?)`)
    .run(orderId, JSON.stringify(order), paidAt, paidAt);
  const insertItem = db.prepare("INSERT INTO order_items (order_id, sku_id, payload) VALUES (?, ?, ?)");
  orderItems.forEach((item) => insertItem.run(orderId, item.skuId, JSON.stringify(item)));
  const payment = {
    id: paymentId, orderId, method: "card", provider: "demo_gateway",
    status: "succeeded", amount, createdAt: paidAt, updatedAt: paidAt
  };
  db.prepare(`INSERT INTO payment_attempts
    (id, order_id, user_id, method, status, amount, failure_reason, created_at, updated_at, payload)
    VALUES (?, ?, NULL, 'card', 'succeeded', ?, NULL, ?, ?, ?)`)
    .run(paymentId, orderId, amount, paidAt, paidAt, JSON.stringify(payment));
  return order;
}

function seedSucceededAnalyticsRefund(db, {
  refundId, orderId, amount, succeededAt, items = [], duplicateEvent = false
}) {
  const refund = {
    id: refundId, orderId, status: "succeeded", amount, amountCents: Math.round(amount * 100),
    reason: "quality_issue", method: "card", createdAt: succeededAt, updatedAt: succeededAt
  };
  db.prepare(`INSERT INTO refunds
    (id, order_id, user_id, status, amount, reason, method, created_at, updated_at, payload)
    VALUES (?, ?, NULL, 'succeeded', ?, 'quality_issue', 'card', ?, ?, ?)`)
    .run(refundId, orderId, amount, succeededAt, succeededAt, JSON.stringify(refund));
  const insertEvent = db.prepare(`INSERT INTO refund_events
    (id, refund_id, order_id, status, label, description, at)
    VALUES (?, ?, ?, 'succeeded', '退款成功', '退款成功', ?)`);
  insertEvent.run(`${refundId}-event-1`, refundId, orderId, succeededAt);
  if (duplicateEvent) insertEvent.run(`${refundId}-event-2`, refundId, orderId, succeededAt);
  const insertItem = db.prepare(`INSERT INTO refund_items
    (id, refund_id, order_id, product_id, sku_id, title, size, quantity,
     unit_paid_amount, refund_amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  items.forEach((item, index) => insertItem.run(
    `${refundId}-item-${index}`, refundId, orderId, item.productId, item.skuId,
    item.title || item.productId, item.size, item.quantity,
    item.unitPaidAmount || item.refundAmount, item.refundAmount, succeededAt
  ));
}

function seedAnalyticsVisitors(db, visitorIds, occurredAt = "2026-08-02T02:00:00.000Z") {
  visitorIds.forEach((visitorId) => db.prepare(`INSERT INTO analytics_events
    (id, event_type, visitor_id, session_id, user_id, product_id, order_id,
     occurred_at, bucket_date, dedupe_key, metadata)
    VALUES (?, 'storefront_visit', ?, NULL, NULL, NULL, NULL, ?, '2026-08-02', ?, '{}')`)
    .run(`event-${visitorId}`, visitorId, occurredAt, `storefront_visit:${visitorId}:2026-08-02`));
}
```

```js
test("builds Shanghai analytics periods and previous comparisons", () => {
  const { createAnalyticsPeriod } = require("../lib/repositories/admin-analytics");
  const period = createAnalyticsPeriod("7d", new Date("2026-08-03T03:00:00.000Z"));
  expect(period).toMatchObject({
    range: "7d",
    start: "2026-07-27T16:00:00.000Z",
    end: "2026-08-03T16:00:00.000Z",
    previousStart: "2026-07-20T16:00:00.000Z",
    previousEnd: "2026-07-27T16:00:00.000Z",
    timezone: "Asia/Shanghai",
    bucket: "day"
  });
  expect(createAnalyticsPeriod("30d", new Date("2026-08-03T03:00:00.000Z"))).toMatchObject({
    start: "2026-07-04T16:00:00.000Z", end: "2026-08-03T16:00:00.000Z", bucket: "day"
  });
  expect(createAnalyticsPeriod("90d", new Date("2026-08-03T03:00:00.000Z"))).toMatchObject({
    start: "2026-05-05T16:00:00.000Z", end: "2026-08-03T16:00:00.000Z", bucket: "week"
  });
  expect(createAnalyticsPeriod("custom", new Date()).validationError.code).toBe("ANALYTICS_RANGE_INVALID");
});
```

- [ ] **Step 2: 写真实核心指标失败测试**

```js
test("calculates net sales conversion and refund rate from business facts", () => {
  const { getAdminAnalytics } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-paid-1", paymentId: "analytics-payment-1",
    amount: 100, paidAt: "2026-08-02T02:00:00.000Z"
  });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-paid-2", paymentId: "analytics-payment-2",
    amount: 80, paidAt: "2026-08-02T03:00:00.000Z"
  });
  const duplicatePayment = {
    id: "analytics-payment-1-duplicate", orderId: "analytics-paid-1",
    method: "card", provider: "demo_gateway", status: "succeeded", amount: 100,
    createdAt: "2026-08-02T02:05:00.000Z", updatedAt: "2026-08-02T02:05:00.000Z"
  };
  db.prepare(`INSERT INTO payment_attempts
    (id, order_id, user_id, method, status, amount, failure_reason, created_at, updated_at, payload)
    VALUES (?, ?, NULL, 'card', 'succeeded', ?, NULL, ?, ?, ?)`)
    .run(
      duplicatePayment.id, duplicatePayment.orderId, duplicatePayment.amount,
      duplicatePayment.createdAt, duplicatePayment.updatedAt, JSON.stringify(duplicatePayment)
    );
  seedSucceededAnalyticsRefund(db, {
    refundId: "analytics-refund-1", orderId: "analytics-paid-1",
    amount: 20, succeededAt: "2026-08-03T02:00:00.000Z", duplicateEvent: true
  });
  seedAnalyticsVisitors(db, ["visitor-a", "visitor-b", "visitor-c", "visitor-d"]);
  const result = getAdminAnalytics(db, { range: "7d", now: new Date("2026-08-03T03:00:00.000Z") });
  expect(result.summary).toMatchObject({
    netSales: 160,
    uniqueVisitors: 4,
    paidOrderCount: 2,
    conversionRate: 50,
    refundedOrderCount: 1,
    refundRate: 50
  });
  expect(result.summary.netSalesComparison).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN/);
  expect(result.funnel).toMatchObject({
    uniqueVisitors: 4, cartAddSessions: 0, checkoutSessions: 0, paidOrderCount: 2
  });
  expect(result.trend.some((bucket) => bucket.netSales > 0)).toBe(true);
  db.close();
});

test("excludes failed payments and allows refund rate above 100 percent", () => {
  const { getAdminAnalytics } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-current-paid", amount: 50, paidAt: "2026-08-02T02:00:00.000Z"
  });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-failed-order", paymentId: "analytics-failed-payment",
    amount: 999, paidAt: "2026-08-02T03:00:00.000Z"
  });
  db.prepare("UPDATE payment_attempts SET status = 'failed' WHERE id = ?").run("analytics-failed-payment");
  for (const suffix of ["a", "b"]) {
    const orderId = `analytics-previous-${suffix}`;
    seedPaidAnalyticsOrder(db, {
      orderId, amount: 40, paidAt: `2026-07-21T0${suffix === "a" ? 2 : 3}:00:00.000Z`
    });
    seedSucceededAnalyticsRefund(db, {
      refundId: `analytics-current-refund-${suffix}`, orderId, amount: 10,
      succeededAt: `2026-08-02T0${suffix === "a" ? 4 : 5}:00:00.000Z`
    });
  }
  seedAnalyticsVisitors(db, ["visitor-only"]);
  const result = getAdminAnalytics(db, { range: "7d", now: new Date("2026-08-03T03:00:00.000Z") });
  expect(result.summary).toMatchObject({
    netSales: 30,
    netSalesComparison: -62.5,
    paidOrderCount: 1,
    conversionRateDelta: 100,
    refundedOrderCount: 2,
    refundRate: 200,
    refundRateDelta: 200
  });
  db.close();
});
```

测试 helper 必须直接写入现有 `orders`、`order_items`、`payment_attempts`、`refunds`、`refund_events` 和 `analytics_events`，使用完整 payload，不能 mock 仓储返回值。

- [ ] **Step 3: 运行周期和指标测试确认红灯**

Run: `npm run test:api -- --grep "Shanghai analytics periods|net sales conversion|failed payments" --workers=1`

Expected: FAIL，`admin-analytics` 模块不存在。

- [ ] **Step 4: 实现周期 helper**

`lib/repositories/admin-analytics.js` 固定：

```js
const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

function createAnalyticsPeriod(range, now = new Date()) {
  if (!RANGE_DAYS[range]) {
    return { validationError: { statusCode: 400, code: "ANALYTICS_RANGE_INVALID", message: "Analytics range is invalid." } };
  }
  const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
  const end = new Date(`${shanghaiDate}T16:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - RANGE_DAYS[range]);
  const previousStart = new Date(start);
  previousStart.setUTCDate(previousStart.getUTCDate() - RANGE_DAYS[range]);
  return {
    range, start: start.toISOString(), end: end.toISOString(),
    previousStart: previousStart.toISOString(), previousEnd: start.toISOString(),
    timezone: "Asia/Shanghai", bucket: range === "90d" ? "week" : "day"
  };
}
```

实现时先用测试校正 `end` 的上海次日零点，避免重复加一天；最终必须满足 Step 1 的精确 ISO 断言。

- [ ] **Step 5: 实现核心事实读取和比较**

新增内部函数：

```js
function listPaidOrders(db, start, end) {
  return db.prepare(`
    SELECT payment.order_id, MIN(payment.updated_at) AS paid_at, MAX(payment.amount) AS amount
    FROM payment_attempts payment
    WHERE payment.status = 'succeeded' AND payment.updated_at >= ? AND payment.updated_at < ?
    GROUP BY payment.order_id
  `).all(start, end);
}

function listSucceededRefunds(db, start, end) {
  return db.prepare(`
    SELECT refund.id, refund.order_id, refund.amount, MIN(event.at) AS succeeded_at
    FROM refunds refund
    JOIN refund_events event ON event.refund_id = refund.id AND event.status = 'succeeded'
    WHERE event.at >= ? AND event.at < ?
    GROUP BY refund.id, refund.order_id, refund.amount
  `).all(start, end);
}
```

对当前周期和上期分别计算：

- `netSales = paid amount sum - succeeded refund amount sum`。
- `uniqueVisitors = COUNT(DISTINCT visitor_id)`，只查 `storefront_visit`。
- `paidOrderCount = distinct paid order count`。
- `refundedOrderCount = distinct succeeded refund order count`。
- 转化率和退款率保留一位小数。
- 销售额比较为相对百分比；上期为零时 `null`。
- 转化率和退款率比较为百分点差。

漏斗响应固定为 `{ uniqueVisitors, cartAddSessions, checkoutSessions, paidOrderCount }`；前三项分别按 `visitor_id` 对 `storefront_visit`、`cart_add`、`checkout_start` 去重，支付阶段继续使用独立成功订单数。退款率不得截断到 100%。所有除法都先处理零分母，任何公开字段都不得出现 `Infinity` 或 `NaN`。

趋势桶必须预先生成完整日期序列，缺失日期填 0；退款归入成功退款发生日，支付归入首次支付成功日。90 天每 7 个上海自然日合并一个周桶。

- [ ] **Step 6: 运行核心指标测试确认转绿**

Run: `npm run test:api -- --grep "Shanghai analytics periods|net sales conversion|failed payments" --workers=1`

Expected: PASS，且无 `Infinity` 或 `NaN`。

- [ ] **Step 7: 提交核心指标**

```powershell
git add lib/repositories/admin-analytics.js tests/api.spec.js
git commit -m "feat: calculate admin commerce analytics"
```

### Task 5: 热销排行和 SKU 库存预警

**Files:**
- Modify: `lib/repositories/admin-analytics.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写热销排序和退款件数失败测试**

```js
test("ranks paid products by units and includes succeeded refunded units", () => {
  const { listTopProducts } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-product-order", amount: 207,
    paidAt: "2026-08-02T02:00:00.000Z",
    items: [
      { productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 3, price: 39 },
      { productId: "sock-02", skuId: "sock-02-40", size: "40", quantity: 2, price: 45 }
    ]
  });
  seedSucceededAnalyticsRefund(db, {
    refundId: "analytics-product-refund", orderId: "analytics-product-order", amount: 39,
    succeededAt: "2026-08-03T02:00:00.000Z", duplicateEvent: true,
    items: [{
      productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜",
      size: "39", quantity: 1, unitPaidAmount: 3900, refundAmount: 3900
    }]
  });
  const products = listTopProducts(db, "2026-07-27T16:00:00.000Z", "2026-08-03T16:00:00.000Z");
  expect(products[0]).toMatchObject({ productId: "sock-01", unitsSold: 3, refundedUnits: 1 });
  expect(products[1]).toMatchObject({ productId: "sock-02", unitsSold: 2, refundedUnits: 0 });
  expect(products[0].sales).toBeGreaterThan(0);
  db.close();
});

test("counts a succeeded full refund without refund items once", () => {
  const { listTopProducts } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-full-refund-order", amount: 168,
    paidAt: "2026-08-01T02:00:00.000Z",
    items: [
      { productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜", size: "39", quantity: 2, price: 39 },
      { productId: "sock-02", skuId: "sock-02-40", title: "通勤罗纹袜", size: "40", quantity: 2, price: 45 }
    ]
  });
  seedSucceededAnalyticsRefund(db, {
    refundId: "analytics-full-refund", orderId: "analytics-full-refund-order",
    amount: 168, succeededAt: "2026-08-03T03:00:00.000Z", duplicateEvent: true
  });
  const products = listTopProducts(db, "2026-07-27T16:00:00.000Z", "2026-08-03T16:00:00.000Z");
  expect(products.find((item) => item.productId === "sock-01").refundedUnits).toBe(2);
  expect(products.find((item) => item.productId === "sock-02").refundedUnits).toBe(2);
  db.close();
});
```

- [ ] **Step 2: 写库存严重度失败测试**

```js
test("classifies SKU inventory alerts by stock and threshold", () => {
  const { listAnalyticsInventoryAlerts } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  db.prepare("UPDATE product_variants SET stock_quantity = 0, is_available = 0 WHERE sku_id = ?").run("sock-01-39");
  db.prepare("UPDATE product_variants SET stock_quantity = 2, low_stock_threshold = 5 WHERE sku_id = ?").run("sock-01-40");
  db.prepare("UPDATE product_variants SET stock_quantity = 4, low_stock_threshold = 5 WHERE sku_id = ?").run("sock-01-41");
  const alerts = listAnalyticsInventoryAlerts(db);
  expect(alerts).toEqual(expect.arrayContaining([
    expect.objectContaining({ skuId: "sock-01-39", severity: "out_of_stock" }),
    expect.objectContaining({ skuId: "sock-01-40", severity: "critical" }),
    expect.objectContaining({ skuId: "sock-01-41", severity: "low" })
  ]));
  expect(alerts.findIndex((item) => item.skuId === "sock-01-39"))
    .toBeLessThan(alerts.findIndex((item) => item.skuId === "sock-01-40"));
  db.close();
});
```

- [ ] **Step 3: 运行排行和库存测试确认红灯**

Run: `npm run test:api -- --grep "ranks paid products|classifies SKU inventory" --workers=1`

Expected: FAIL，导出函数不存在。

- [ ] **Step 4: 实现热销排行**

从周期内首次成功支付订单 ID 读取 `orders.payload`。对每个订单调用现有 `allocateOrderItemPaidAmounts(order)`，按订单行 `paidAmountCents` 再按该行各商品件数分配销售额，聚合到商品 ID。

成功退款件数查询固定为：

```sql
SELECT item.product_id, SUM(item.quantity) AS quantity
FROM refund_items item
JOIN refunds refund ON refund.id = item.refund_id
WHERE refund.status = 'succeeded'
  AND EXISTS (
    SELECT 1
    FROM refund_events event
    WHERE event.refund_id = refund.id
      AND event.status = 'succeeded'
      AND event.at >= ? AND event.at < ?
  )
GROUP BY item.product_id
```

没有 `refund_items` 且 `refund.refund_type = 'order'` 的成功整单退款，从原订单 payload 将所有订单行数量计入一次；部分退款没有明细时不猜测商品件数。按 `refund_id` 去重，不能因重复事件重复计算。结果按 `unitsSold DESC, sales DESC, productId ASC`，返回前 8 项并从商品 payload 读取标题与首张图片。

- [ ] **Step 5: 实现库存预警**

查询 `product_variants JOIN products`，解析商品 payload。严重度函数固定：

```js
function getInventorySeverity(row) {
  if (!row.is_available || row.stock_quantity <= 0) return "out_of_stock";
  if (row.stock_quantity <= Math.ceil(row.low_stock_threshold / 2)) return "critical";
  if (row.stock_quantity <= row.low_stock_threshold) return "low";
  return "";
}
```

过滤空严重度，按映射 `{ out_of_stock: 0, critical: 1, low: 2 }`、库存升序、商品标题、尺码排序。`getAdminAnalytics` 将 `topProducts`、`inventoryAlerts`、`lowStockSkuCount` 和 `outOfStockSkuCount` 合并到响应。

- [ ] **Step 6: 运行排行和库存测试确认转绿**

Run: `npm run test:api -- --grep "ranks paid products|classifies SKU inventory|net sales conversion" --workers=1`

Expected: PASS，核心指标不回归。

- [ ] **Step 7: 提交排行和预警**

```powershell
git add lib/repositories/admin-analytics.js tests/api.spec.js
git commit -m "feat: add product and inventory analytics"
```

### Task 6: 管理员分析 API

**Files:**
- Create: `lib/routes/admin-analytics-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写权限、响应结构和非法范围失败测试**

```js
test("returns admin analytics for fixed ranges only", async ({ request }) => {
  const adminCookie = await registerApiUser(request, { email: "admin@socks.test" });
  const response = await request.get("/api/admin/analytics?range=30d", { headers: { cookie: adminCookie } });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload).toMatchObject({
    period: { range: "30d", timezone: "Asia/Shanghai", bucket: "day" },
    summary: {
      netSales: expect.any(Number), conversionRate: expect.any(Number), refundRate: expect.any(Number),
      uniqueVisitors: expect.any(Number), paidOrderCount: expect.any(Number),
      lowStockSkuCount: expect.any(Number), outOfStockSkuCount: expect.any(Number)
    },
    funnel: expect.any(Object),
    trend: expect.any(Array),
    topProducts: expect.any(Array),
    inventoryAlerts: expect.any(Array)
  });
  const invalid = await request.get("/api/admin/analytics?range=365d", { headers: { cookie: adminCookie } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("ANALYTICS_RANGE_INVALID");
  const anonymous = await request.get("/api/admin/analytics?range=30d");
  expect(anonymous.status()).toBe(401);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "admin analytics for fixed ranges" --workers=1`

Expected: FAIL，路由 404。

- [ ] **Step 3: 创建管理路由**

```js
function registerAdminAnalyticsRoutes(router, services) {
  router.get("/api/admin/analytics", async ({ request, requestUrl, response, sendJson, sendError }) => {
    const admin = await services.requireAdmin(request, response);
    if (!admin) return;
    const result = services.withDatabase((db) => services.getAdminAnalytics(db, {
      range: requestUrl.searchParams.get("range") || "30d",
      now: new Date()
    }));
    if (result.validationError) {
      const error = result.validationError;
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }
    sendJson(response, 200, { ok: true, ...result });
  });
}

module.exports = { registerAdminAnalyticsRoutes };
```

在 `server.js` 导入、注册并注入 `getAdminAnalytics`、`requireAdmin` 和 `withDatabase`。保留 `/api/admin/summary` 供工作队列和最近订单兼容使用。

- [ ] **Step 4: 运行管理 API 和既有后台摘要回归**

Run: `npm run test:api -- --grep "admin analytics for fixed ranges|admin dashboard summary|operational support KPIs" --workers=1`

Expected: PASS。

- [ ] **Step 5: 提交管理 API**

```powershell
git add lib/routes/admin-analytics-routes.js server.js tests/api.spec.js
git commit -m "feat: expose admin analytics API"
```

### Task 7: 独立经营看板模块

**Files:**
- Create: `public/js/admin-analytics-dashboard.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写默认范围和完整布局失败测试**

```js
test("renders the realistic admin analytics dashboard for the default range", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await expect(page.locator("[data-analytics-range][aria-pressed='true']")).toHaveText("30 天");
  await expect(page.locator("[data-analytics-kpi='net-sales']")).toBeVisible();
  await expect(page.locator("[data-analytics-kpi='conversion']")).toContainText("%");
  await expect(page.locator("[data-analytics-kpi='refund-rate']")).toContainText("%");
  await expect(page.locator("[data-analytics-ratio='conversion']")).toContainText("/");
  await expect(page.locator("[data-analytics-ratio='refund-rate']")).toContainText("/");
  await expect(page.locator("[data-analytics-sales-chart]")).toBeVisible();
  await expect(page.locator("[data-analytics-funnel]")).toBeVisible();
  await expect(page.locator("[data-analytics-top-products]")).toBeVisible();
  await expect(page.locator("[data-analytics-inventory]")).toBeVisible();
  await expect(page.locator("[data-admin-recent-order], [data-admin-work-queue]")).not.toHaveCount(0);
});
```

- [ ] **Step 2: 写时间范围切换失败测试**

```js
test("switches the analytics range and updates every dashboard section", async ({ page }) => {
  await registerAdminFromUi(page);
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/admin/analytics")) requests.push(request.url());
  });
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-analytics-range='7d']").click();
  await expect(page.locator("[data-analytics-range='7d']")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => requests.some((url) => url.includes("range=7d"))).toBe(true);
  await expect(page.locator("[data-analytics-period-label]")).toContainText("7");
});
```

- [ ] **Step 3: 运行 UI 测试确认红灯**

Run: `npm run test:ui -- --grep "realistic admin analytics|switches the analytics range" --workers=1`

Expected: FAIL，新模块和选择器不存在。

- [ ] **Step 4: 增加看板样式和脚本入口**

在 `socks-product-list.html` 增加 `.analytics-dashboard`、`.analytics-kpis`、`.analytics-chart-grid`、`.analytics-panel`、`.analytics-table`、`.analytics-skeleton`、`.analytics-error` 和库存严重度样式。使用现有 CSS 变量；净销售趋势使用暖橙 `#c45500`，错误 `#a3261a`，紧急库存 `#9a5b00`。

在 `storefront-app.js` 之前加载：

```html
<script src="/public/js/admin-analytics-dashboard.js" defer></script>
```

- [ ] **Step 5: 实现独立模块壳层和请求**

`public/js/admin-analytics-dashboard.js` 使用单实例状态并导出有效接口：

```js
const state = {
  mounted: false,
  panel: null,
  request: null,
  escapeHtml: null,
  formatCurrency: null,
  onInventoryOpen: null,
  range: "30d",
  analytics: null,
  operations: null,
  requestId: 0,
  controller: null
};

function mount({ panel, request, escapeHtml, formatCurrency, onInventoryOpen }) {
  state.panel?.removeEventListener("click", handlePanelClick);
  Object.assign(state, {
    mounted: true,
    panel,
    request,
    escapeHtml,
    formatCurrency,
    onInventoryOpen
  });
  state.panel.addEventListener("click", handlePanelClick);
  return render();
}

function handlePanelClick(event) {
  const rangeButton = event.target.closest("[data-analytics-range]");
  if (rangeButton && rangeButton.dataset.analyticsRange !== state.range) {
    state.range = rangeButton.dataset.analyticsRange;
    render();
    return;
  }
  const inventoryButton = event.target.closest("[data-analytics-inventory-link]");
  if (inventoryButton) state.onInventoryOpen(inventoryButton.dataset.skuId);
}

async function render() {
  if (!state.mounted) return;
  const requestId = ++state.requestId;
  state.controller?.abort();
  state.controller = new AbortController();
  if (!state.analytics) {
    state.panel.innerHTML = '<div class="analytics-skeleton" aria-label="正在加载经营数据"></div>';
  }
  try {
    const [analytics, operations] = await Promise.all([
      state.request(`/api/admin/analytics?range=${state.range}`, { signal: state.controller.signal }),
      state.request("/api/admin/summary", { signal: state.controller.signal })
    ]);
    if (!state.mounted || requestId !== state.requestId) return;
    state.analytics = analytics;
    state.operations = operations;
    state.panel.innerHTML = createDashboardMarkup(analytics, operations);
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== state.requestId) return;
    state.panel.innerHTML = '<div class="analytics-error" role="alert">经营数据加载失败，请稍后重试。</div>';
  }
}

function destroy() {
  state.controller?.abort();
  state.panel?.removeEventListener("click", handlePanelClick);
  Object.assign(state, { mounted: false, panel: null, analytics: null, operations: null, controller: null });
}

window.StorefrontAdminAnalytics = { mount, render, destroy };
```

`render()` 先渲染固定尺寸骨架，然后并行请求 `/api/admin/analytics?range=${state.range}` 和 `/api/admin/summary`。后者只提供现有 `recentOrders` 和 `workQueue`。范围按钮点击后更新 `aria-pressed`、递增 `requestId`、中止旧 `AbortController` 并重新请求；只有请求 ID 等于当前值时才能更新 DOM。

- [ ] **Step 6: 渲染经营总览布局**

实现独立纯函数：

```js
function formatComparison(value, unit = "%") {
  if (value === null) return '<span class="analytics-comparison">上期无数据</span>';
  const direction = value > 0 ? "上升" : value < 0 ? "下降" : "持平";
  return `<span class="analytics-comparison">较上期${direction} ${Math.abs(value).toFixed(1)}${unit}</span>`;
}

function createKpiMarkup(summary) {
  const cards = [
    {
      key: "net-sales", label: "净销售额", value: state.formatCurrency(summary.netSales),
      comparison: formatComparison(summary.netSalesComparison)
    },
    {
      key: "conversion", label: "转化率", value: `${summary.conversionRate.toFixed(1)}%`,
      ratio: `${summary.paidOrderCount} / ${summary.uniqueVisitors}`,
      comparison: formatComparison(summary.conversionRateDelta, " 个百分点")
    },
    {
      key: "refund-rate", label: "退款率", value: `${summary.refundRate.toFixed(1)}%`,
      ratio: `${summary.refundedOrderCount} / ${summary.paidOrderCount}`,
      comparison: formatComparison(summary.refundRateDelta, " 个百分点")
    },
    { key: "low-stock", label: "低库存 SKU", value: summary.lowStockSkuCount, comparison: "当前库存快照" },
    { key: "out-of-stock", label: "缺货 SKU", value: summary.outOfStockSkuCount, comparison: "当前库存快照" }
  ];
  return `<section class="analytics-kpis" aria-label="经营指标">${cards.map((card) => `
    <article class="analytics-kpi" data-analytics-kpi="${card.key}">
      <span>${card.label}</span><strong>${state.escapeHtml(card.value)}</strong>
      ${card.ratio ? `<small data-analytics-ratio="${card.key}">${state.escapeHtml(card.ratio)}</small>` : ""}
      <small>${card.comparison}</small>
    </article>`).join("")}</section>`;
}

function createSalesChartMarkup(trend) {
  const rows = Array.isArray(trend) ? trend : [];
  const width = 640;
  const height = 240;
  const values = rows.map((row) => Number(row.netSales) || 0);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = Math.max(1, maximum - minimum);
  const point = (row, index) => ({
    x: rows.length === 1 ? width / 2 : 32 + index * (width - 64) / Math.max(1, rows.length - 1),
    y: 20 + (maximum - (Number(row.netSales) || 0)) * (height - 52) / span,
    row
  });
  const points = rows.map(point);
  const summary = rows.length
    ? `本期 ${rows.length} 个时间桶，净销售额 ${state.formatCurrency(values.reduce((sum, value) => sum + value, 0))}`
    : "当前周期暂无成交";
  return `<section class="analytics-panel" data-analytics-sales-chart aria-label="净销售额趋势：${state.escapeHtml(summary)}">
    <h3>净销售额趋势</h3>
    <span class="visually-hidden" data-analytics-chart-summary>${state.escapeHtml(summary)}</span>
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
      <line x1="32" y1="208" x2="608" y2="208"></line>
      ${rows.length ? `<polyline points="${points.map(({ x, y }) => `${x},${y}`).join(" ")}"></polyline>
        ${points.map(({ x, y, row }) => `<circle cx="${x}" cy="${y}" r="5" tabindex="0"
          aria-label="${state.escapeHtml(row.label)}，净销售额 ${state.formatCurrency(row.netSales)}，${row.paidOrderCount} 个支付订单"></circle>`).join("")}`
        : '<text x="320" y="120" text-anchor="middle">当前周期暂无成交</text>'}
    </svg>
  </section>`;
}

function createFunnelMarkup(funnel) {
  const stages = [
    ["独立访客", funnel.uniqueVisitors],
    ["加购会话", funnel.cartAddSessions],
    ["发起结算", funnel.checkoutSessions],
    ["支付订单", funnel.paidOrderCount]
  ];
  const maximum = Math.max(1, ...stages.map(([, value]) => Number(value) || 0));
  const summary = stages.map(([label, value]) => `${label} ${value}`).join("，");
  return `<section class="analytics-panel" data-analytics-funnel aria-label="转化漏斗">
    <h3>转化漏斗</h3><span class="visually-hidden" data-analytics-funnel-summary>${summary}</span>
    ${stages.map(([label, value]) => `<div class="analytics-funnel-row">
      <span>${label}</span><strong>${value}</strong>
      <i style="--funnel-width:${Math.max(4, Number(value) * 100 / maximum)}%"></i>
    </div>`).join("")}
  </section>`;
}

function createTopProductsMarkup(products) {
  const rows = Array.isArray(products) ? products : [];
  return `<section class="analytics-panel" data-analytics-top-products><h3>热销商品</h3>
    ${rows.length ? rows.map((product) => `<article class="analytics-table-row">
      <img src="${state.escapeHtml(product.image)}" alt="" loading="lazy">
      <strong>${state.escapeHtml(product.title)}</strong><span>售出 ${product.unitsSold} 件</span>
      <span>${state.formatCurrency(product.sales)}</span><span>退款 ${product.refundedUnits} 件</span>
    </article>`).join("") : '<p class="empty-state">当前周期暂无热销商品。</p>'}
  </section>`;
}

function createInventoryMarkup(alerts) {
  const rows = Array.isArray(alerts) ? alerts : [];
  return `<section class="analytics-panel" data-analytics-inventory><h3>SKU 库存预警</h3>
    ${rows.length ? rows.map((item) => `<article class="analytics-table-row" data-analytics-inventory-card>
      <strong>${state.escapeHtml(item.title)} / ${state.escapeHtml(item.size)}</strong>
      <span>${state.escapeHtml(item.skuId)}</span><span>${item.stockQuantity} / 阈值 ${item.lowStockThreshold}</span>
      <span class="inventory-severity inventory-severity--${item.severity}">${state.escapeHtml(item.severity)}</span>
      <button type="button" data-analytics-inventory-link data-sku-id="${state.escapeHtml(item.skuId)}">管理库存</button>
    </article>`).join("") : '<p class="empty-state">当前没有库存预警。</p>'}
  </section>`;
}

function createOperationsMarkup(operations) {
  const queue = Array.isArray(operations?.workQueue) ? operations.workQueue : [];
  const orders = Array.isArray(operations?.recentOrders) ? operations.recentOrders : [];
  return `<section class="analytics-operations" aria-label="待处理工作与最近订单">
    <div class="analytics-panel"><h3>待处理工作</h3>${queue.map((item) => `
      <article class="analytics-table-row" data-admin-work-queue><span>${state.escapeHtml(item.label)}</span><strong>${item.count}</strong></article>`).join("") || '<p class="empty-state">暂无待处理工作。</p>'}</div>
    <div class="analytics-panel"><h3>最近订单</h3>${orders.map((order) => `
      <article class="analytics-table-row" data-admin-recent-order><span>${state.escapeHtml(order.id)}</span><span>${state.escapeHtml(order.status)}</span><strong>${state.formatCurrency(order.total)}</strong></article>`).join("") || '<p class="empty-state">暂无最近订单。</p>'}</div>
  </section>`;
}

function createDashboardMarkup(analytics, operations) {
  return `<div class="analytics-dashboard">
    <header><div><p>经营总览</p><h2 data-analytics-period-label>近 ${analytics.period.range.replace("d", "")} 天</h2></div>
      <div class="analytics-ranges" aria-label="数据时间范围">${[7, 30, 90].map((days) => `
        <button type="button" data-analytics-range="${days}d" aria-pressed="${state.range === `${days}d`}">${days} 天</button>`).join("")}</div></header>
    ${createKpiMarkup(analytics.summary)}
    <div class="analytics-chart-grid">${createSalesChartMarkup(analytics.trend)}${createFunnelMarkup(analytics.funnel)}</div>
    <div class="analytics-table-grid">${createTopProductsMarkup(analytics.topProducts)}${createInventoryMarkup(analytics.inventoryAlerts)}</div>
    ${createOperationsMarkup(operations)}
  </div>`;
}
```

KPI 固定五张；销售、转化和退款显示上期变化，`null` 显示“上期无数据”。转化和退款分别用 `[data-analytics-ratio='conversion']`、`[data-analytics-ratio='refund-rate']` 显示分子/分母。库存卡显示当前快照，不伪造周期涨跌。

库存“管理库存”按钮调用 `onInventoryOpen(skuId)`。`storefront-app.js` 实现回调：设置 `activeAdminTab = "inventory"`，把 SKU 写入 URL `tab=inventory&sku=...`，调用 `renderAdminPanel()`，并在库存列表渲染后定位对应 `[data-sku-id]`。

- [ ] **Step 7: 替换旧后台首页接入**

在 `storefront-app.js` 增加 `requestAdminAnalyticsJson(path, { signal } = {})`，携带现有管理员请求头并把 `signal` 传给 `fetch`。增加 `mountAdminAnalyticsDashboard()`；`renderAdminPanel()` 默认分支改为模块 `render()`。退出登录、管理员失去权限或销毁后台时调用 `window.StorefrontAdminAnalytics?.destroy()`。

- [ ] **Step 8: 运行默认布局和切换测试确认转绿**

Run: `npm run test:ui -- --grep "realistic admin analytics|switches the analytics range" --workers=1`

Expected: PASS。

- [ ] **Step 9: 提交独立看板**

```powershell
git add public/js/admin-analytics-dashboard.js public/js/storefront-app.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add realistic admin analytics dashboard"
```

### Task 8: 图表可访问性、移动端和异常状态

**Files:**
- Modify: `public/js/admin-analytics-dashboard.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

先在 `tests/socks-product-list.spec.js` 增加完整、可覆盖局部字段的响应 fixture：

```js
function createAnalyticsFixture(range = "30d", days = 30, overrides = {}) {
  const base = {
    ok: true,
    period: {
      range,
      start: "2026-07-04T16:00:00.000Z",
      end: "2026-08-03T16:00:00.000Z",
      timezone: "Asia/Shanghai",
      bucket: range === "90d" ? "week" : "day"
    },
    summary: {
      netSales: 1280,
      netSalesComparison: 12.5,
      conversionRate: 5,
      conversionRateDelta: 1.2,
      uniqueVisitors: 100,
      paidOrderCount: 5,
      refundRate: 20,
      refundRateDelta: -2.5,
      refundedOrderCount: 1,
      lowStockSkuCount: 1,
      outOfStockSkuCount: 1
    },
    trend: [
      { label: `近 ${days} 天`, start: "2026-08-02T16:00:00.000Z", netSales: 1280, paidOrderCount: 5 }
    ],
    funnel: {
      uniqueVisitors: 100,
      cartAddSessions: 24,
      checkoutSessions: 10,
      paidOrderCount: 5
    },
    topProducts: [
      { productId: "sock-01", title: "极简中筒袜", image: "/public/images/sock-01.svg", unitsSold: 8, sales: 312, refundedUnits: 1 }
    ],
    inventoryAlerts: [
      {
        productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜",
        size: "39", stockQuantity: 0, lowStockThreshold: 5, severity: "out_of_stock"
      }
    ]
  };
  return {
    ...base,
    ...overrides,
    period: { ...base.period, ...(overrides.period || {}) },
    summary: { ...base.summary, ...(overrides.summary || {}) },
    funnel: { ...base.funnel, ...(overrides.funnel || {}) },
    trend: overrides.trend === undefined ? base.trend : overrides.trend,
    topProducts: overrides.topProducts === undefined ? base.topProducts : overrides.topProducts,
    inventoryAlerts: overrides.inventoryAlerts === undefined ? base.inventoryAlerts : overrides.inventoryAlerts
  };
}
```

- [ ] **Step 1: 写移动端和键盘失败测试**

```js
test("keeps analytics charts and inventory accessible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await registerAdminFromUi(page);
  await page.route("**/api/admin/analytics?range=30d", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(createAnalyticsFixture("30d", 30))
  }));
  await page.route("**/api/admin/analytics?range=7d", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(createAnalyticsFixture("7d", 7))
  }));
  await page.goto("/socks-product-list.html?view=admin");
  await expect(page.locator("[data-analytics-sales-chart][aria-label]")).toBeVisible();
  await expect(page.locator("[data-analytics-chart-summary]")).toHaveCount(1);
  await expect(page.locator("[data-analytics-funnel-summary]")).toHaveCount(1);
  const chartPoint = page.locator("[data-analytics-sales-chart] circle[tabindex='0']").nth(0);
  await chartPoint.focus();
  await expect(chartPoint).toBeFocused();
  const range = page.locator("[data-analytics-range='7d']");
  await range.focus();
  await page.keyboard.press("Enter");
  await expect(range).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const inventoryCards = page.locator("[data-analytics-inventory-card]");
  expect(await inventoryCards.count()).toBeGreaterThan(0);
  await expect(inventoryCards.nth(0)).toBeVisible();
  await page.locator("[data-analytics-inventory-link][data-sku-id='sock-01-39']").click();
  await expect(page).toHaveURL(/tab=inventory.*sku=sock-01-39|sku=sock-01-39.*tab=inventory/);
  await expect(page.locator("[data-sku-id='sock-01-39']")).toBeVisible();
});
```

- [ ] **Step 2: 写错误、零数据和竞态失败测试**

```js
test("preserves analytics range through errors and ignores stale responses", async ({ page }) => {
  await registerAdminFromUi(page);
  let resolveSeven;
  await page.route("**/api/admin/analytics?range=7d", (route) => {
    resolveSeven = () => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createAnalyticsFixture("7d", 7)) });
  });
  await page.route("**/api/admin/analytics?range=90d", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createAnalyticsFixture("90d", 90)) });
  });
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-analytics-range='7d']").click();
  await expect.poll(() => Boolean(resolveSeven)).toBe(true);
  await expect(page.locator("[data-analytics-loading]")).toBeVisible();
  await expect(page.locator("[data-analytics-range='7d']")).toBeDisabled();
  await page.locator("[data-analytics-range='90d']").click();
  resolveSeven();
  await expect(page.locator("[data-analytics-period-label]")).toContainText("90");
  let failThirty = true;
  await page.route("**/api/admin/analytics?range=30d", (route) => route.fulfill(
    failThirty
      ? { status: 500, body: "{}" }
      : { status: 200, contentType: "application/json", body: JSON.stringify(createAnalyticsFixture("30d", 30)) }
  ));
  await page.locator("[data-analytics-range='30d']").click();
  await expect(page.locator("[data-analytics-error]")).toBeVisible();
  await expect(page.locator("[data-analytics-range='30d']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-analytics-retry]")).toBeVisible();
  failThirty = false;
  await page.locator("[data-analytics-retry]").click();
  await expect(page.locator("[data-analytics-kpi='net-sales']")).toContainText("1,280");
  await expect(page.locator("[data-analytics-error]")).toHaveCount(0);
});

test("renders honest zero and partial analytics states", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.route("**/api/admin/analytics?range=30d", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(createAnalyticsFixture("30d", 30, {
      summary: {
        netSales: 0, netSalesComparison: null, conversionRate: 0, conversionRateDelta: 0,
        uniqueVisitors: 0, paidOrderCount: 0, refundRate: 0, refundRateDelta: 0,
        refundedOrderCount: 0, lowStockSkuCount: 0, outOfStockSkuCount: 0
      },
      funnel: { uniqueVisitors: 0, cartAddSessions: 0, checkoutSessions: 0, paidOrderCount: 0 },
      trend: [], topProducts: [], inventoryAlerts: []
    }))
  }));
  await page.route("**/api/admin/analytics?range=7d", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(createAnalyticsFixture("7d", 7, {
      summary: { netSales: 128, uniqueVisitors: 0, paidOrderCount: 2, conversionRate: 0 },
      funnel: { uniqueVisitors: 0, cartAddSessions: 0, checkoutSessions: 0, paidOrderCount: 2 }
    }))
  }));
  await page.goto("/socks-product-list.html?view=admin");
  await expect(page.locator("[data-analytics-empty]")).toContainText("当前周期暂无成交/访问");
  await page.locator("[data-analytics-range='7d']").click();
  await expect(page.locator("[data-analytics-kpi='net-sales']")).toContainText("128");
  await expect(page.locator("[data-analytics-kpi='conversion']")).toContainText("0%");
  await expect(page.locator("[data-analytics-partial]")).toContainText("访问采集尚无数据");
});
```

Playwright 不允许对未确认数量使用 `.first()`；实现测试时先 `count()`，确认库存卡数量大于 0 后再读取第一个卡片。

- [ ] **Step 3: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "analytics charts and inventory|preserves analytics range|honest zero and partial" --workers=1`

Expected: FAIL，移动端卡片、摘要或错误状态缺失。

- [ ] **Step 4: 完成 SVG 和可访问语义**

折线图使用 `viewBox` 和 `preserveAspectRatio`，每个点为 `circle tabindex="0"`，`aria-label` 包含日期、净销售额和订单数。图表容器提供总趋势 `aria-label`，并增加视觉隐藏的 `[data-analytics-chart-summary]`；漏斗增加视觉隐藏的 `[data-analytics-funnel-summary]`。无数据时仍渲染坐标和“当前周期暂无成交”文本，不创建伪造折线。

范围按钮使用 `type="button"`、`aria-pressed` 和 44px 最小高度。涨跌文本包含“上升/下降”，不能只依赖颜色或箭头。

- [ ] **Step 5: 完成响应式和状态页面**

在 `max-width: 960px` 时 KPI 三列、图表单列；在 `max-width: 640px` 时 KPI 两列，热销和库存表头隐藏，每行转为带字段标签的卡片。所有容器 `min-width: 0`，标题和值允许换行。

模块增加：

- `createLoadingMarkup()`：稳定高度骨架。
- `createEmptyMarkup()`：零值 KPI 和带 `[data-analytics-empty]` 的“当前周期暂无成交/访问”说明。
- `createPartialDataNotice()`：有成交但 `uniqueVisitors === 0` 时显示带 `[data-analytics-partial]` 的“访问采集尚无数据”，销售和订单指标照常展示。
- `createErrorMarkup()`：保留范围按钮、错误说明和 `[data-analytics-retry]`。
- `AbortError` 静默忽略；其他错误进入 error 状态。
- `destroy()` 中中止请求并移除事件监听器。

请求进行时在保留旧数据的容器上增加 `[data-analytics-loading]`，禁用当前范围按钮但允许用户选择其他范围；重试按钮重新请求当前 `state.range`。库存入口使用 `[data-analytics-inventory-link][data-sku-id]`，把目标 SKU 原样交给 `onInventoryOpen`。

- [ ] **Step 6: 运行移动端、错误和已有后台 UI 回归**

Run: `npm run test:ui -- --grep "analytics charts and inventory|preserves analytics range|honest zero and partial|admin dashboard tabs" --workers=1`

Expected: PASS，无横向溢出，后台页签测试不回归。

- [ ] **Step 7: 提交可访问性和状态**

```powershell
git add public/js/admin-analytics-dashboard.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: harden analytics dashboard states"
```

### Task 9: 全量回归、编码检查和推送

**Files:**
- Verify: all analytics files and existing storefront/admin behavior

- [ ] **Step 1: 运行完整 API 套件**

Run: `npm run test:api -- --workers=1`

Expected: 0 failed，所有测试单 worker。

- [ ] **Step 2: 运行完整 UI 套件**

Run: `npm run test:ui -- --workers=1`

Expected: 0 failed，允许项目已明确标记的 skipped tests。

- [ ] **Step 3: 运行关键定向回归**

```powershell
npm run test:api -- --grep "analytics|payment|refund|inventory" --workers=1
npm run test:ui -- --grep "analytics|admin dashboard|cart|checkout" --workers=1
```

Expected: 经营指标事实、事件触发、后台首页和交易主链路全部 PASS。

- [ ] **Step 4: 检查格式和编码**

```powershell
git diff --check
rg -n "\\u[0-9a-fA-F]{4}" lib public/js socks-product-list.html tests
```

Expected: 无空白错误，无新增中文 Unicode 转义。

- [ ] **Step 5: 清理测试产物**

恢复测试明确修改的：

```powershell
git restore -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

运行 `git status --short`。只删除本轮明确生成的具体 `public/uploads/products/*` 测试文件；不得删除用户文件、已有上传文件或其他未跟踪文件。

- [ ] **Step 6: 核对提交和工作区**

```powershell
git log -10 --oneline
git status --short --branch
```

Expected: 工作区干净，分析看板提交位于当前 `feature/socks-after-sales-payment-admin` 分支，先前营销活动提交仍完整保留。

- [ ] **Step 7: 低频推送现有分支**

```powershell
git push origin feature/socks-after-sales-payment-admin
```

Expected: 更新现有 PR。若 GitHub 网络不可达，只允许一次低频重试；再次失败则停止，保留本地提交并报告，不循环重试。

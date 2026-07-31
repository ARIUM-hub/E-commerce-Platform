# 后台订单状态流转 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把后台订单管理升级为支持确认发货、订单取消、按 SKU 部分退款和售后审核的事务化操作工作台。

**Architecture:** 新增 `admin-order-actions` 编排层和 `inventory-movements` 库存流水层，复用现有订单、履约、退款与售后仓储。所有后台动作通过带 `operationId` 的明确命令接口执行，在 SQLite 事务内完成状态、金额、库存和审计写入；前端使用订单/售后操作抽屉提交表单并读取同一后端状态。

**Tech Stack:** Node.js 原生 HTTP server、Node SQLite、原生浏览器 JavaScript、单页 HTML/CSS、Playwright API/UI 测试。

---

## File Map

- Create: `lib/repositories/inventory-movements.js`
  - 记录幂等库存流水并回补 SKU 库存。
- Create: `lib/repositories/admin-order-actions.js`
  - 编排发货、取消、部分退款和售后审核命令，统一校验与审计。
- Modify: `lib/database.js`
  - 增加 `0008_admin_order_operations` 迁移、退款明细、库存流水、后台审计和唯一运单号索引。
- Modify: `lib/repositories/refunds.js`
  - 支持退款商品明细、整数分金额、累计可退款数量与金额查询。
- Modify: `lib/repositories/fulfillment.js`
  - 支持管理员录入承运商与唯一运单号确认发货。
- Modify: `lib/repositories/returns.js`
  - 增加后台售后列表和关联退款读取能力。
- Modify: `lib/repositories/admin.js`
  - 后台订单摘要增加客户、可执行动作与退款汇总。
- Modify: `server.js`
  - 增加后台动作、后台售后列表和审核路由。
- Modify: `socks-product-list.html`
  - 增加售后 tab、订单/售后操作抽屉容器和响应式样式。
- Modify: `public/js/storefront-app.js`
  - 增加后台订单抽屉、发货/取消/部分退款表单、售后审核交互和错误反馈。
- Modify: `tests/api.spec.js`
  - 覆盖迁移、权限、状态流、金额、库存和幂等行为。
- Modify: `tests/socks-product-list.spec.js`
  - 覆盖后台操作抽屉和用户侧同步。

## Execution Notes

- 运行测试前停止占用 `4173` 的本地开发服务；Playwright 会自行启动测试服务。
- 所有测试保持单 worker，不增加并发或后台智能体。
- PowerShell 先设置 UTF-8：

```powershell
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

---

### Task 1: 数据库迁移与金额单位

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写迁移失败测试**

在 `tests/api.spec.js` 的迁移测试后加入：

```js
test("initializes admin order operation tables and indexes", async () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });

  const tableNames = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('refund_items', 'inventory_movements', 'admin_action_events')
    ORDER BY name
  `).all().map((row) => row.name);
  const refundColumns = db.prepare("PRAGMA table_info(refunds)").all().map((column) => column.name);
  const trackingIndex = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_fulfillments_tracking_unique'
  `).get();
  const migration = db.prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get("0008_admin_order_operations");

  expect(tableNames).toEqual(["admin_action_events", "inventory_movements", "refund_items"]);
  expect(refundColumns).toEqual(expect.arrayContaining(["return_request_id", "operation_id", "refund_type", "amount_cents"]));
  expect(trackingIndex).toEqual({ name: "idx_fulfillments_tracking_unique" });
  expect(migration).toEqual({ id: "0008_admin_order_operations" });
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run:

```powershell
npm run test:api -- --grep "admin order operation tables"
```

Expected: FAIL，缺少三张表、退款扩展列和 `0008_admin_order_operations` 迁移。

- [ ] **Step 3: 实现迁移**

在 `lib/database.js` 增加列检查 helper：

```js
function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  if (!hasColumn(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
```

增加迁移函数：

```js
function ensureAdminOrderOperationTables(db) {
  addColumnIfMissing(db, "refunds", "return_request_id", "TEXT");
  addColumnIfMissing(db, "refunds", "operation_id", "TEXT");
  addColumnIfMissing(db, "refunds", "refund_type", "TEXT NOT NULL DEFAULT 'order'");
  addColumnIfMissing(db, "refunds", "amount_cents", "INTEGER NOT NULL DEFAULT 0");

  db.exec(`
    CREATE TABLE IF NOT EXISTS refund_items (
      id TEXT PRIMARY KEY,
      refund_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      title TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_paid_amount INTEGER NOT NULL,
      refund_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      sku_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sku_id) REFERENCES product_variants(sku_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_action_events (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL UNIQUE,
      admin_user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      before_status TEXT NOT NULL,
      after_status TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_refund_items_order_sku ON refund_items(order_id, sku_id);
    CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON refund_items(refund_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movement_operation
      ON inventory_movements(operation_id, sku_id, reason);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_operation
      ON refunds(operation_id) WHERE operation_id IS NOT NULL AND operation_id <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillments_tracking_unique
      ON fulfillments(tracking_number) WHERE tracking_number IS NOT NULL AND tracking_number <> '';
  `);
}
```

在 `migrations` 末尾加入：

```js
{
  id: "0008_admin_order_operations",
  name: "Add admin order operations and audit storage",
  up(db) {
    ensureAdminOrderOperationTables(db);
  }
}
```

- [ ] **Step 4: 运行迁移测试确认转绿**

Run: `npm run test:api -- --grep "admin order operation tables"`

Expected: PASS，1 个测试通过。

- [ ] **Step 5: 提交迁移**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add admin order operation schema"
```

---

### Task 2: 库存流水与幂等回补

**Files:**
- Create: `lib/repositories/inventory-movements.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写库存流水单元失败测试**

在 `tests/api.spec.js` 加入：

```js
test("restocks SKU inventory once for the same admin operation", async () => {
  const { restockItems } = require("../lib/repositories/inventory-movements");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const before = db.prepare("SELECT stock_quantity FROM product_variants WHERE sku_id = ?")
    .get("sock-01-39").stock_quantity;
  const input = {
    operationId: "op-restock-test",
    reason: "return_refund_completed",
    sourceType: "return_request",
    sourceId: "return-test",
    items: [{ productId: "sock-01", skuId: "sock-01-39", quantity: 2 }]
  };

  const first = restockItems(db, input);
  const second = restockItems(db, input);
  const after = db.prepare("SELECT stock_quantity FROM product_variants WHERE sku_id = ?")
    .get("sock-01-39").stock_quantity;

  expect(first.movements).toHaveLength(1);
  expect(second.replayed).toBe(true);
  expect(after).toBe(before + 2);
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "restocks SKU inventory once"`

Expected: FAIL，模块 `inventory-movements` 不存在。

- [ ] **Step 3: 创建库存流水模块**

创建 `lib/repositories/inventory-movements.js`：

```js
const crypto = require("node:crypto");

function normalizeRestockItems(items) {
  return Array.isArray(items) ? items.map((item) => ({
    productId: String(item.productId || "").trim(),
    skuId: String(item.skuId || "").trim(),
    quantity: Number(item.quantity)
  })) : [];
}

function restockItems(db, input) {
  const operationId = String(input.operationId || "").trim();
  const reason = String(input.reason || "").trim();
  const items = normalizeRestockItems(input.items);
  const existing = db.prepare(`
    SELECT * FROM inventory_movements
    WHERE operation_id = ? AND reason = ? ORDER BY rowid
  `).all(operationId, reason);
  if (existing.length) return { movements: existing, replayed: true };

  const transaction = db.transaction(() => {
    const createdAt = new Date().toISOString();
    return items.map((item) => {
      if (!item.skuId || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw Object.assign(new Error("Inventory movement is invalid."), { code: "ADMIN_INVENTORY_MOVEMENT_INVALID" });
      }
      const result = db.prepare(`
        UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE sku_id = ?
      `).run(item.quantity, item.skuId);
      if (!result.changes) {
        throw Object.assign(new Error("SKU was not found."), { code: "ADMIN_SKU_NOT_FOUND" });
      }
      const movement = {
        id: `inventory-movement-${crypto.randomUUID()}`,
        skuId: item.skuId,
        productId: item.productId,
        quantityDelta: item.quantity,
        reason,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        operationId,
        createdAt
      };
      db.prepare(`
        INSERT INTO inventory_movements (
          id, sku_id, product_id, quantity_delta, reason, source_type, source_id, operation_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        movement.id, movement.skuId, movement.productId, movement.quantityDelta,
        movement.reason, movement.sourceType, movement.sourceId, movement.operationId, movement.createdAt
      );
      return movement;
    });
  });

  return { movements: transaction(), replayed: false };
}

module.exports = { restockItems };
```

- [ ] **Step 4: 运行测试确认转绿**

Run: `npm run test:api -- --grep "restocks SKU inventory once"`

Expected: PASS。

- [ ] **Step 5: 提交库存流水**

```powershell
git add lib/repositories/inventory-movements.js tests/api.spec.js
git commit -m "feat: add idempotent inventory movements"
```

---

### Task 3: 退款明细与可退款上限

**Files:**
- Modify: `lib/repositories/refunds.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写部分退款计算失败测试**

加入 API 仓储测试：

```js
test("calculates remaining refundable quantity and cents per order item", async () => {
  const { getRefundableOrderSummary } = require("../lib/repositories/refunds");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const order = {
    id: "order-refund-summary",
    items: [
      { productId: "sock-01", skuId: "sock-01-39", title: "袜子", size: "39", quantity: 2, price: 39 }
    ],
    totals: { subtotal: 78, discount: 10, total: 68 }
  };

  const summary = getRefundableOrderSummary(db, order);

  expect(summary.items[0]).toMatchObject({
    skuId: "sock-01-39",
    purchasedQuantity: 2,
    refundedQuantity: 0,
    remainingQuantity: 2,
    refundableAmountCents: 6800
  });
  expect(summary.remainingOrderAmountCents).toBe(6800);
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "remaining refundable quantity"`

Expected: FAIL，`getRefundableOrderSummary` 尚未导出。

- [ ] **Step 3: 实现金额分摊和退款明细读取**

在 `lib/repositories/refunds.js` 增加：

```js
function toCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function allocateOrderItemPaidAmounts(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSubtotalCents = items.map((item) => toCents(item.price) * Number(item.quantity || 0));
  const subtotalCents = itemSubtotalCents.reduce((sum, value) => sum + value, 0);
  const merchandisePaidCents = Math.max(0, subtotalCents - toCents(order.totals?.discount || order.totals?.savings || 0));
  let assigned = 0;
  return items.map((item, index) => {
    const amountCents = index === items.length - 1
      ? merchandisePaidCents - assigned
      : Math.round(merchandisePaidCents * itemSubtotalCents[index] / Math.max(1, subtotalCents));
    assigned += amountCents;
    return { ...item, paidAmountCents: amountCents };
  });
}

function listRefundItemsByOrderId(db, orderId) {
  return db.prepare(`
    SELECT item.* FROM refund_items item
    JOIN refunds refund ON refund.id = item.refund_id
    WHERE item.order_id = ? AND refund.status <> 'failed'
    ORDER BY item.rowid
  `).all(orderId);
}

function getRefundableOrderSummary(db, order) {
  const allocated = allocateOrderItemPaidAmounts(order);
  const refunded = listRefundItemsByOrderId(db, order.id);
  const bySku = new Map();
  refunded.forEach((item) => {
    const current = bySku.get(item.sku_id) || { quantity: 0, amountCents: 0 };
    current.quantity += Number(item.quantity);
    current.amountCents += Number(item.refund_amount);
    bySku.set(item.sku_id, current);
  });
  const items = allocated.map((item) => {
    const used = bySku.get(item.skuId) || { quantity: 0, amountCents: 0 };
    return {
      ...item,
      purchasedQuantity: item.quantity,
      refundedQuantity: used.quantity,
      remainingQuantity: Math.max(0, item.quantity - used.quantity),
      refundedAmountCents: used.amountCents,
      refundableAmountCents: Math.max(0, item.paidAmountCents - used.amountCents)
    };
  });
  return {
    items,
    refundedAmountCents: items.reduce((sum, item) => sum + item.refundedAmountCents, 0),
    remainingOrderAmountCents: items.reduce((sum, item) => sum + item.refundableAmountCents, 0)
  };
}
```

扩展 `parseRefundRow` / `findRefundById` / `listRefundsByOrderId`，给退款结果附加 `items`；导出 `allocateOrderItemPaidAmounts`、`getRefundableOrderSummary` 和 `listRefundItemsByOrderId`。

- [ ] **Step 4: 运行测试确认转绿**

Run: `npm run test:api -- --grep "remaining refundable quantity"`

Expected: PASS。

- [ ] **Step 5: 提交退款计算**

```powershell
git add lib/repositories/refunds.js tests/api.spec.js
git commit -m "feat: add itemized refundable order totals"
```

---

### Task 4: 确认发货与后台取消命令

**Files:**
- Create: `lib/repositories/admin-order-actions.js`
- Modify: `lib/repositories/fulfillment.js`
- Modify: `lib/repositories/refunds.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写发货和取消 API 失败测试**

在后台订单测试附近加入两个用例，复用 `registerApiUser` 和 `checkoutPayload`：

```js
test("ships a processing order with an admin supplied carrier and tracking number", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const orderResponse = await request.post("/api/orders", { headers: { cookie }, data: checkoutPayload });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie }, data: { status: "paid", locale: "zh-CN" }
  });
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie }, data: { status: "processing", locale: "zh-CN" }
  });

  const response = await request.post(`/api/admin/orders/${order.id}/actions/ship`, {
    headers: { cookie },
    data: {
      operationId: "op-api-ship-001",
      carrier: "ups",
      trackingNumber: "1Z999AA10123456784",
      note: "仓库已交接",
      locale: "zh-CN"
    }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.order.status).toBe("shipped");
  expect(payload.fulfillment).toMatchObject({
    carrier: "ups",
    trackingNumber: "1Z999AA10123456784",
    status: "label_created"
  });
});

test("cancels a paid unshipped order with one inventory restock", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const orderResponse = await request.post("/api/orders", { headers: { cookie }, data: checkoutPayload });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie }, data: { status: "paid", locale: "zh-CN" }
  });

  const body = {
    operationId: "op-api-cancel-001",
    reason: "customer_request",
    note: "客户要求取消",
    locale: "zh-CN"
  };
  const first = await request.post(`/api/admin/orders/${order.id}/actions/cancel`, { headers: { cookie }, data: body });
  const second = await request.post(`/api/admin/orders/${order.id}/actions/cancel`, { headers: { cookie }, data: body });

  expect(first.ok()).toBe(true);
  expect(second.ok()).toBe(true);
  const payload = await first.json();
  expect(payload.order.status).toBe("refund_pending");
  expect(payload.refund.amount).toBe(order.totals.total);
  expect((await second.json()).replayed).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "admin supplied carrier|one inventory restock"`

Expected: FAIL，两个动作路由返回 404。

- [ ] **Step 3: 扩展履约仓储**

在 `lib/repositories/fulfillment.js` 增加并导出：

```js
function confirmShipment(db, { order, carrier, trackingNumber, locale, saveOrder, createTimelineEntry }) {
  const normalizedCarrier = String(carrier || "").trim().toLowerCase();
  const normalizedTracking = String(trackingNumber || "").trim();
  if (!["ups", "usps", "fedex", "dhl"].includes(normalizedCarrier)) {
    return { validationError: { statusCode: 400, code: "ADMIN_CARRIER_INVALID", message: "Carrier is invalid." } };
  }
  if (!normalizedTracking) {
    return { validationError: { statusCode: 400, code: "ADMIN_TRACKING_REQUIRED", message: "Tracking number is required." } };
  }
  if (db.prepare("SELECT id FROM fulfillments WHERE tracking_number = ?").get(normalizedTracking)) {
    return { validationError: { statusCode: 409, code: "ADMIN_TRACKING_DUPLICATE", message: "Tracking number is already in use." } };
  }
  if (order.status !== "processing") {
    return { validationError: { statusCode: 409, code: "ADMIN_ORDER_TRANSITION_INVALID", message: "Order cannot be shipped." } };
  }

  // 在调用者事务中更新 fulfillments、写入 label_created 事件、更新 order.status 和 order.timeline。
  // 使用现有 findFulfillmentByOrderId、insertFulfillmentEvent、saveOrder 和 createTimelineEntry。
  return { order, fulfillment: findFulfillmentByOrderId(db, order.id) };
}
```

实现注释所述的现有仓储调用，不复制事件序列化逻辑。

- [ ] **Step 4: 创建后台动作编排模块**

创建 `lib/repositories/admin-order-actions.js`，导出：

```js
module.exports = {
  cancelAdminOrder,
  findAdminActionByOperationId,
  recordAdminAction,
  shipAdminOrder
};
```

核心接口：

```js
function shipAdminOrder(db, { admin, order, body, confirmShipment, saveOrder, createTimelineEntry }) {
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "ship",
    resourceType: "order",
    resourceId: order.id,
    reason: body.note || "confirmed_shipment",
    requestPayload: body,
    run() {
      return confirmShipment(db, {
        order,
        carrier: body.carrier,
        trackingNumber: body.trackingNumber,
        locale: body.locale,
        saveOrder,
        createTimelineEntry
      });
    }
  });
}
```

`executeIdempotentAction` 必须：

1. 要求 `operationId` 非空。
2. 查询 `admin_action_events.operation_id`。
3. 相同请求哈希返回已保存结果和 `replayed: true`。
4. 不同请求哈希返回 `ADMIN_OPERATION_DUPLICATE_MISMATCH`。
5. 在一个 `db.transaction()` 中执行 `run()` 并写审计事件。

`cancelAdminOrder` 按设计处理 `pending_payment`、`paid`、`processing`，调用 `createRefundForOrder` 和 `restockItems`，并拒绝已发货订单。

- [ ] **Step 5: 运行仓储级测试（路由仍红）**

Run: `npm run test:api -- --grep "admin supplied carrier|one inventory restock"`

Expected: 仍 FAIL 在路由 404，仓储模块可被加载且无语法错误。

- [ ] **Step 6: 提交命令仓储**

```powershell
git add lib/repositories/admin-order-actions.js lib/repositories/fulfillment.js lib/repositories/refunds.js tests/api.spec.js
git commit -m "feat: add admin shipment and cancellation commands"
```

---

### Task 5: 部分退款与售后审核命令

**Files:**
- Modify: `lib/repositories/admin-order-actions.js`
- Modify: `lib/repositories/refunds.js`
- Modify: `lib/repositories/returns.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写部分退款失败测试**

```js
test("creates itemized partial refunds and rejects cumulative over-refunds", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const orderResponse = await request.post("/api/orders", { headers: { cookie }, data: checkoutPayload });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie }, data: { status: "paid", locale: "zh-CN" }
  });
  const item = order.items[0];

  const first = await request.post(`/api/admin/orders/${order.id}/actions/refund`, {
    headers: { cookie },
    data: {
      operationId: "op-partial-refund-001",
      reason: "quality_issue",
      note: "局部瑕疵补偿",
      items: [{ skuId: item.skuId, quantity: 1, refundAmount: 1000 }],
      locale: "zh-CN"
    }
  });
  expect(first.status()).toBe(201);
  const payload = await first.json();
  expect(payload.refund.items[0]).toMatchObject({ skuId: item.skuId, quantity: 1, refundAmount: 1000 });

  const excessive = await request.post(`/api/admin/orders/${order.id}/actions/refund`, {
    headers: { cookie },
    data: {
      operationId: "op-partial-refund-002",
      reason: "quality_issue",
      items: [{ skuId: item.skuId, quantity: item.quantity, refundAmount: 999999 }],
      locale: "zh-CN"
    }
  });
  expect(excessive.status()).toBe(409);
  await expect(excessive.json()).resolves.toMatchObject({
    error: { code: expect.stringMatching(/ADMIN_REFUND_(QUANTITY|AMOUNT)_EXCEEDED/) }
  });
});
```

- [ ] **Step 2: 写售后审核与库存回补失败测试**

创建已支付用户订单和 `return_refund` 售后申请，然后断言：

```js
const reviewing = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
  headers: { cookie: adminCookie },
  data: { operationId: "op-review-001", action: "start_review", reason: "review_started", locale: "zh-CN" }
});
expect((await reviewing.json()).returnRequest.status).toBe("reviewing");

const approved = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
  headers: { cookie: adminCookie },
  data: {
    operationId: "op-review-002",
    action: "approve",
    reason: "evidence_confirmed",
    refundItems: [{ skuId: returnRequest.items[0].skuId, quantity: 1, refundAmount: 1000 }],
    locale: "zh-CN"
  }
});
expect((await approved.json()).returnRequest.status).toBe("approved");

const completed = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
  headers: { cookie: adminCookie },
  data: { operationId: "op-review-003", action: "complete", reason: "item_received", locale: "zh-CN" }
});
expect((await completed.json()).returnRequest.status).toBe("completed");
```

同时读取 SKU 库存，确认只增加一次；用相同 `operationId` 重放完成请求，库存不再次增加。

- [ ] **Step 3: 运行测试确认红灯**

Run: `npm run test:api -- --grep "itemized partial refunds|售后审核与库存回补"`

Expected: FAIL，动作路由和退款明细写入尚未实现。

- [ ] **Step 4: 实现 `createItemizedRefund`**

在 `lib/repositories/refunds.js` 增加并导出：

```js
function createItemizedRefund(db, order, input) {
  const summary = getRefundableOrderSummary(db, order);
  const requested = Array.isArray(input.items) ? input.items : [];
  if (!requested.length) return validation(400, "ADMIN_REFUND_ITEMS_REQUIRED", "Refund items are required.");
  if (!String(input.reason || "").trim()) return validation(400, "ADMIN_REFUND_REASON_REQUIRED", "Refund reason is required.");

  // 逐项校验 SKU、整数数量、剩余数量、正整数分金额和商品剩余可退金额。
  // 合计不能超过 summary.remainingOrderAmountCents。
  // INSERT refunds 时同时写 amount = amountCents / 100 和 amount_cents = amountCents。
  // INSERT refund_items 保存订单快照标题、尺码、unit_paid_amount 和 refund_amount。
  // 写 requested 退款事件并返回 findRefundById。
}
```

将每个注释项实现为显式分支，分别返回设计文档中的标准错误码。

- [ ] **Step 5: 实现售后后台查询与审核命令**

在 `lib/repositories/returns.js` 增加：

```js
function listAdminReturnRequests(db, filters = {}) {
  const status = String(filters.status || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();
  return db.prepare("SELECT * FROM return_requests ORDER BY created_at DESC").all()
    .map((row) => serializeReturnRequest(db, row))
    .filter((item) => !status || item.status === status)
    .filter((item) => !query || item.returnNumber.toLowerCase().includes(query) || item.orderId.toLowerCase().includes(query));
}
```

在 `admin-order-actions.js` 增加 `createAdminPartialRefund` 和 `reviewAdminReturnRequest`：

- `start_review` 调用 `updateReturnRequestStatus(..., "reviewing")`。
- `approve` 先创建关联 `createItemizedRefund`，再推进到 `approved`。
- `reject` 要求 `reason`，推进到 `rejected`。
- `complete` 推进到 `completed`；只有 `return_refund` 调用 `restockItems`。
- 所有动作使用 `executeIdempotentAction`。

- [ ] **Step 6: 运行仓储与 API 测试（路由仍红）**

Run: `npm run test:api -- --grep "itemized partial refunds|售后审核与库存回补"`

Expected: 路由未挂载前仍 FAIL 在 404，模块加载无异常。

- [ ] **Step 7: 提交退款和审核命令**

```powershell
git add lib/repositories/admin-order-actions.js lib/repositories/refunds.js lib/repositories/returns.js tests/api.spec.js
git commit -m "feat: add partial refunds and return review commands"
```

---

### Task 6: 挂载后台订单动作与售后 API

**Files:**
- Modify: `server.js`
- Modify: `lib/repositories/admin.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 在 `server.js` 引入新函数**

```js
const {
  cancelAdminOrder,
  createAdminPartialRefund,
  reviewAdminReturnRequest,
  shipAdminOrder
} = require("./lib/repositories/admin-order-actions");
```

将 `listAdminReturnRequests`、`confirmShipment` 和 `createItemizedRefund` 加入各自现有 import。

- [ ] **Step 2: 增加精确路径解析**

```js
function parseAdminOrderActionPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/actions\/(ship|cancel|refund)$/);
  return match ? { orderId: decodeURIComponent(match[1]), action: match[2] } : null;
}

function parseAdminReturnActionPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/returns\/([^/]+)\/actions\/review$/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

- [ ] **Step 3: 挂载订单动作路由**

在现有后台订单 GET 路由后增加 `POST` 分支：

```js
const requestedAdminOrderAction = parseAdminOrderActionPath(requestUrl.pathname);
if (request.method === "POST" && requestedAdminOrderAction) {
  try {
    const admin = await requireAdmin(request, response);
    if (!admin) return;
    const body = await readRequestBody(request);
    const order = withDatabase((db) => findAdminOrder(db, requestedAdminOrderAction.orderId));
    if (!order) {
      sendError(response, 404, "ADMIN_ORDER_NOT_FOUND", "Order was not found.");
      return;
    }
    const handlers = {
      ship: shipAdminOrder,
      cancel: cancelAdminOrder,
      refund: createAdminPartialRefund
    };
    const result = withDatabase((db) => handlers[requestedAdminOrderAction.action](db, {
      admin, order, body, saveOrder, createTimelineEntry, confirmShipment,
      createRefundForOrder, createItemizedRefund
    }));
    if (result.validationError) {
      sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
      return;
    }
    sendJson(response, requestedAdminOrderAction.action === "refund" && !result.replayed ? 201 : 200, { ok: true, ...result });
    return;
  } catch (error) {
    if (handleRequestBodyError(error, response)) return;
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 4: 增加后台售后列表与审核路由**

```js
if (request.method === "GET" && requestUrl.pathname === "/api/admin/returns") {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  const returnRequests = withDatabase((db) => listAdminReturnRequests(db, {
    status: requestUrl.searchParams.get("status") || "",
    q: requestUrl.searchParams.get("q") || ""
  }));
  sendJson(response, 200, { ok: true, returnRequests });
  return;
}

const requestedAdminReturnId = parseAdminReturnActionPath(requestUrl.pathname);
if (request.method === "POST" && requestedAdminReturnId) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  const body = await readRequestBody(request);
  const returnRequest = withDatabase((db) => findReturnRequestById(db, requestedAdminReturnId));
  if (!returnRequest) {
    sendError(response, 404, "RETURN_NOT_FOUND", "Return request was not found.");
    return;
  }
  const result = withDatabase((db) => reviewAdminReturnRequest(db, {
    admin, returnRequest, body, updateReturnRequestStatus, createItemizedRefund
  }));
  if (result.validationError) {
    sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
    return;
  }
  sendJson(response, 200, { ok: true, ...result });
  return;
}
```

两个路由均使用与现有路由一致的 `try/catch` 和 `handleRequestBodyError`。

- [ ] **Step 5: 扩展后台订单详情响应**

把 `GET /api/admin/orders/:id` 返回值改为：

```js
const detail = withDatabase((db) => ({
  order: findAdminOrder(db, requestedAdminOrderId),
  refunds: listRefundsByOrderId(db, requestedAdminOrderId),
  refundable: getRefundableOrderSummary(db, findAdminOrder(db, requestedAdminOrderId))
}));
sendJson(response, 200, { ok: true, ...detail });
```

避免重复查询：实际实现先读取一次 `order` 再构造对象。

- [ ] **Step 6: 运行后台动作 API 测试确认转绿**

Run:

```powershell
npm run test:api -- --grep "admin supplied carrier|one inventory restock|itemized partial refunds|售后审核与库存回补"
```

Expected: PASS，所有新增 API 测试通过。

- [ ] **Step 7: 增加权限和非法状态测试**

覆盖：非管理员 403、重复运单号 409、已发货取消 409、操作 ID 内容不一致 409、拒绝售后缺少原因 400。

- [ ] **Step 8: 运行后台动作 API 测试**

Run: `npm run test:api -- --grep "admin order action|admin return review|tracking number|partial refund"`

Expected: PASS。

- [ ] **Step 9: 提交 API 路由**

```powershell
git add server.js lib/repositories/admin.js tests/api.spec.js
git commit -m "feat: expose admin order action APIs"
```

---

### Task 7: 后台订单操作抽屉 UI

**Files:**
- Modify: `socks-product-list.html`
- Modify: `public/js/storefront-app.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写订单抽屉 UI 失败测试**

在后台测试附近加入：

```js
test("ships an order from the admin order operation drawer", async ({ page }) => {
  await registerAdminFromUi(page);
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  await page.goto("/socks-product-list.html?view=checkout");
  await fillCheckoutForm(page);
  await page.locator("[data-checkout-submit]").click();
  const orderId = new URL(page.url()).searchParams.get("id");
  await page.request.patch(`/api/admin/orders/${orderId}/status`, {
    data: { status: "paid", locale: "zh-CN" }, headers: { "x-demo-admin": "true" }
  });
  await page.request.patch(`/api/admin/orders/${orderId}/status`, {
    data: { status: "processing", locale: "zh-CN" }, headers: { "x-demo-admin": "true" }
  });

  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='orders']").click();
  await page.locator(`[data-admin-order-row][data-order-id='${orderId}'] [data-admin-order-open]`).click();
  await expect(page.locator("[data-admin-order-drawer]")).toHaveAttribute("data-open", "true");
  await page.locator("[data-admin-carrier]").selectOption("ups");
  await page.locator("[data-admin-tracking-number]").fill("1Z999AA10123456784");
  await page.locator("[data-admin-ship-submit]").click();

  await expect(page.locator("[data-admin-order-drawer]")).toContainText("1Z999AA10123456784");
  await expect(page.locator(`[data-admin-order-row][data-order-id='${orderId}']`)).toContainText(/已发货|shipped/);
});
```

- [ ] **Step 2: 写部分退款 UI 失败测试**

新增用例打开已支付订单抽屉，填写：

```js
await page.locator("[data-admin-refund-quantity]").first().fill("1");
await page.locator("[data-admin-refund-amount]").first().fill("10.00");
await page.locator("[data-admin-refund-reason]").selectOption("quality_issue");
await page.locator("[data-admin-refund-submit]").click();
await expect(page.locator("[data-admin-order-refunds]")).toContainText(/10\.00|¥10/);
```

- [ ] **Step 3: 运行 UI 测试确认红灯**

Run: `npm run test:ui -- --grep "admin order operation drawer|partial refund from the admin"`

Expected: FAIL，缺少抽屉和表单 data attributes。

- [ ] **Step 4: 增加抽屉容器和售后 tab**

在 `socks-product-list.html` 后台 tabs 加入：

```html
<button type="button" data-admin-tab="returns">售后</button>
```

在后台 view 后加入：

```html
<aside class="admin-operation-drawer" data-admin-order-drawer data-open="false" aria-hidden="true">
  <div class="admin-operation-drawer__header">
    <div>
      <p class="admin-operation-drawer__eyebrow">Order operations</p>
      <h2 tabindex="-1" data-admin-order-drawer-title>处理订单</h2>
    </div>
    <button type="button" data-admin-order-drawer-close aria-label="关闭订单处理面板">关闭</button>
  </div>
  <div class="admin-operation-drawer__body" data-admin-order-drawer-body></div>
</aside>
<div class="admin-operation-backdrop" data-admin-order-backdrop hidden></div>
```

- [ ] **Step 5: 增加后台动作 API client 和状态**

在 `public/js/storefront-app.js` 的 `adminData` 增加：

```js
orderDetail: null,
orderDrawerTrigger: null,
returnRequests: null
```

增加：

```js
async function postAdminAction(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await createCartRequestError(response, "Admin action failed");
  return response.json();
}

function createOperationId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
```

浏览器环境不保证全局 `crypto.randomUUID` 时，使用：

```js
function createOperationId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

- [ ] **Step 6: 渲染订单摘要和操作抽屉**

将 `renderAdminOrders()` 的原状态推进按钮替换为：

```html
<button class="order-button order-button--secondary" type="button" data-admin-order-open>处理订单</button>
```

新增 `openAdminOrderDrawer(orderId, trigger)`：

1. 请求 `/api/admin/orders/:id`。
2. 保存 `adminData.orderDetail` 和触发按钮。
3. 根据订单状态渲染发货、取消和部分退款表单。
4. 设置 `data-open="true"`、`aria-hidden="false"`。
5. 聚焦 `[data-admin-order-drawer-title]`。

金额输入显示元，提交前转换为整数分：

```js
function yuanInputToCents(value) {
  return Math.round(Number(value || 0) * 100);
}
```

- [ ] **Step 7: 接入表单提交和内联错误**

对发货、取消、退款表单分别调用：

```js
await postAdminAction(`/api/admin/orders/${encodeURIComponent(orderId)}/actions/ship`, {
  operationId: createOperationId("ship"),
  carrier,
  trackingNumber,
  note,
  locale: activeLocale
});
```

失败时写入当前表单 `[data-admin-action-error]`；成功后并行顺序刷新订单列表和当前抽屉详情，不关闭抽屉。

- [ ] **Step 8: 实现关闭、Escape 和焦点恢复**

关闭按钮、遮罩和 Escape 调用 `closeAdminOrderDrawer()`；关闭后恢复 `adminData.orderDrawerTrigger.focus()`。抽屉打开时给 `body` 增加 `is-admin-drawer-open`，关闭时移除。

- [ ] **Step 9: 运行订单抽屉 UI 测试**

Run: `npm run test:ui -- --grep "admin order operation drawer|partial refund from the admin"`

Expected: PASS。

- [ ] **Step 10: 提交订单抽屉 UI**

```powershell
git add socks-product-list.html public/js/storefront-app.js tests/socks-product-list.spec.js
git commit -m "feat: add admin order operation drawer"
```

---

### Task 8: 后台售后审核 UI

**Files:**
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写售后审核 UI 失败测试**

通过 API 创建已支付订单和售后申请后：

```js
await page.goto("/socks-product-list.html?view=admin");
await page.locator("[data-admin-tab='returns']").click();
await page.locator(`[data-admin-return-row][data-return-id='${returnRequest.id}'] [data-admin-return-open]`).click();
await page.locator("[data-admin-return-action='start_review']").click();
await expect(page.locator("[data-admin-return-drawer]")).toContainText(/审核中|reviewing/);
await page.locator("[data-admin-return-action='approve']").click();
await page.locator("[data-admin-return-refund-amount]").fill("10.00");
await page.locator("[data-admin-return-confirm]").click();
await expect(page.locator("[data-admin-return-drawer]")).toContainText(/已通过|approved/);
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "reviews a return request from the admin"`

Expected: FAIL，售后 tab 尚未接入渲染和审核交互。

- [ ] **Step 3: 实现 `renderAdminReturns`**

请求 `/api/admin/returns`，渲染：

```html
<article class="admin-row" data-admin-return-row data-return-id="...">
  <span>售后单号</span>
  <span>订单号</span>
  <span>类型</span>
  <span>状态</span>
  <span>创建时间</span>
  <button type="button" data-admin-return-open>审核售后</button>
</article>
```

在 `renderAdminPanel()` 中增加 `activeAdminTab === "returns"` 分支。

- [ ] **Step 4: 实现售后操作抽屉**

复用订单抽屉的遮罩、焦点和表单样式，但使用独立 data attributes。合法动作映射：

```js
function getAdminReturnActions(status) {
  if (status === "submitted") return ["start_review"];
  if (status === "reviewing") return ["approve", "reject"];
  if (status === "approved") return ["complete"];
  return [];
}
```

`approve` 对 `return_refund` 和 `refund_only` 展示退款商品、数量和金额；`reject` 要求原因；`complete` 展示是否回补库存。

- [ ] **Step 5: 接入审核 API 和错误反馈**

```js
await postAdminAction(`/api/admin/returns/${encodeURIComponent(returnRequestId)}/actions/review`, {
  operationId: createOperationId("return"),
  action,
  reason,
  note,
  refundItems,
  locale: activeLocale
});
```

成功后刷新售后列表与抽屉，失败后显示 `[data-admin-return-error]`。

- [ ] **Step 6: 运行售后 UI 测试确认转绿**

Run: `npm run test:ui -- --grep "reviews a return request from the admin"`

Expected: PASS。

- [ ] **Step 7: 提交售后审核 UI**

```powershell
git add socks-product-list.html public/js/storefront-app.js tests/socks-product-list.spec.js
git commit -m "feat: add admin return review workflow"
```

---

### Task 9: 抽屉视觉、响应式与无障碍验收

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写布局与焦点失败测试**

```js
test("keeps admin operation drawers accessible on desktop and mobile", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='orders']").click();
  const trigger = page.locator("[data-admin-order-open]").first();
  await trigger.click();
  await expect(page.locator("[data-admin-order-drawer-title]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 375, height: 812 });
  await trigger.click();
  const drawerBox = await page.locator("[data-admin-order-drawer]").boundingBox();
  expect(drawerBox.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "admin operation drawers accessible"`

Expected: FAIL，抽屉 CSS 和焦点行为尚未完整。

- [ ] **Step 3: 增加抽屉样式**

在 `socks-product-list.html` 现有后台样式附近加入：

```css
.admin-operation-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 80;
  width: min(560px, 100vw);
  background: #fff;
  border-left: 1px solid #d8d8d8;
  box-shadow: -24px 0 60px rgb(0 0 0 / 16%);
  transform: translateX(100%);
  transition: transform 220ms ease;
  overflow-y: auto;
}

.admin-operation-drawer[data-open="true"] { transform: translateX(0); }
.admin-operation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 79;
  background: rgb(0 0 0 / 48%);
}
.is-admin-drawer-open { overflow: hidden; }
.admin-operation-form__error { color: #a3261a; min-height: 1.5em; }

@media (prefers-reduced-motion: reduce) {
  .admin-operation-drawer { transition: none; }
}
```

同时补齐 44px 最小按钮高度、表单网格、退款行对齐、移动端单列布局和可见焦点轮廓。

- [ ] **Step 4: 运行无障碍布局测试确认转绿**

Run: `npm run test:ui -- --grep "admin operation drawers accessible"`

Expected: PASS。

- [ ] **Step 5: 提交样式与无障碍测试**

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "test: verify admin operation drawer accessibility"
```

---

### Task 10: 全量回归、清理与 PR 更新

**Files:**
- Verify: `tests/api.spec.js`
- Verify: `tests/socks-product-list.spec.js`
- Verify: all modified source files

- [ ] **Step 1: 运行 API 全量回归**

Run: `npm run test:api`

Expected: 所有 API 用例通过，0 failed。

- [ ] **Step 2: 运行 UI 全量回归**

Run: `npm run test:ui`

Expected: 所有非跳过 UI 用例通过，0 failed。保持 `--workers=1`。

- [ ] **Step 3: 检查格式与编码**

```powershell
git diff --check
rg -n "\\u[0-9a-fA-F]{4}" lib server.js public/js/storefront-app.js socks-product-list.html tests
```

Expected: `git diff --check` 无输出；新增中文没有 Unicode 转义。

- [ ] **Step 4: 检查测试产物**

```powershell
git status --short
Get-ChildItem 'public\uploads\products' -File -ErrorAction SilentlyContinue
```

如果全量测试改动了已跟踪 fixture，只恢复本轮测试明确生成的 fixture 状态；如果生成上传测试文件，只删除本轮测试产生的具体文件，不递归删除目录。

- [ ] **Step 5: 最终工作区检查**

Run: `git status --short`

Expected: 工作区干净；如存在本阶段遗漏文件，按明确路径提交，不创建空提交。

- [ ] **Step 6: 推送功能分支**

```powershell
git push origin feature/socks-after-sales-payment-admin
```

Expected: 现有 PR #2 更新到最新提交，不创建重复 PR。

---

## Self-Review Notes

- Spec coverage: 发货、取消、部分退款、双退款入口、售后审核、库存回补、幂等、审计、前台同步和无障碍均有对应任务。
- Dependency order: 迁移先于仓储，仓储先于 API，API 先于 UI；不存在跨任务未定义的生产接口。
- Money consistency: API `refundAmount` 使用整数分；现有 `refund.amount` 保持元以兼容旧前端，同时新增 `amountCents`。
- Status consistency: 订单、履约、退款和售后状态沿用现有命名，不引入第二套状态枚举。
- Safety: 测试固定单 worker，不启动并发智能体，不执行模型或供应商探测。
- Placeholder scan: 无 `TBD`、`TODO`、延期实现或不明确的“类似处理”步骤。

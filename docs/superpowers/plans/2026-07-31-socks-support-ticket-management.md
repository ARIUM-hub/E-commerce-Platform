# 客服工单处理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有一次性客服联系表单升级为支持分配、优先级、状态流、公开消息、内部备注及登录/匿名客户追踪的完整工单系统。

**Architecture:** 扩展 `support_tickets` 并新增消息和事件表，服务端把管理员动作与客户动作分离，序列化层按访问者严格过滤内部字段。匿名查询通过工单号、标准化联系方式和进程内限频器保护；后台与客户 UI 分别放在独立浏览器模块中。

**Tech Stack:** Node.js 原生 HTTP、Node SQLite、原生浏览器 JavaScript、HTML/CSS、Playwright API/UI 测试。

---

## File Map

- Modify: `lib/database.js`：增加 `0010_support_ticket_workflow` 迁移并回填初始消息。
- Modify: `lib/repositories/support.js`：工单查询、公开序列化和客户消息。
- Create: `lib/repositories/admin-support-actions.js`：分配、优先级、状态、公开回复和内部备注。
- Modify: `lib/repositories/admin.js`：后台看板增加工单队列 KPI。
- Create: `lib/support-lookup-limiter.js`：匿名查询限频。
- Create: `lib/routes/support-ticket-routes.js`：客户与匿名工单 API。
- Create: `lib/routes/admin-support-routes.js`：后台工单 API。
- Modify: `server.js`：注册新路由并移除旧内联联系路由。
- Create: `public/js/admin-support-management.js`：后台工单工作台。
- Create: `public/js/customer-support-tickets.js`：客户工单列表、查询、详情和回复。
- Modify: `public/js/storefront-app.js`：挂载独立工单模块。
- Modify: `socks-product-list.html`：后台页签、工单视图、抽屉、样式和脚本。
- Modify: `tests/api.spec.js`：迁移、隔离、状态流、限频、幂等与消息可见性。
- Modify: `tests/socks-product-list.spec.js`：后台处理和客户追踪 UI。

## Execution Notes

- 依赖评论管理阶段提供的独立后台模块挂载模式，但不依赖评论业务数据。
- UTF-8 直接写中文，不使用 `\uXXXX`。
- 测试固定 `--workers=1`，不调用外部客服、邮件、短信或模型服务。

### Task 1: 工单流程数据库迁移

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写迁移与回填失败测试**

```js
test("initializes support workflow tables and backfills the opening customer message", async () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const columns = db.prepare("PRAGMA table_info(support_tickets)").all().map((column) => column.name);
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
      AND name IN ('support_ticket_messages', 'support_ticket_events') ORDER BY name
  `).all().map((row) => row.name);
  const tickets = db.prepare("SELECT COUNT(*) AS count FROM support_tickets").get().count;
  const messages = db.prepare("SELECT COUNT(*) AS count FROM support_ticket_messages").get().count;
  expect(columns).toEqual(expect.arrayContaining([
    "priority", "assigned_admin_user_id", "resolved_at", "closed_at",
    "last_message_at", "version", "parent_ticket_id"
  ]));
  expect(tables).toEqual(["support_ticket_events", "support_ticket_messages"]);
  expect(messages).toBe(tickets);
  expect(db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("0010_support_ticket_workflow"))
    .toEqual({ id: "0010_support_ticket_workflow" });
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "support workflow tables"`

Expected: FAIL，缺少列和消息表。

- [ ] **Step 3: 实现迁移**

```js
function ensureSupportTicketWorkflowTables(db) {
  addColumnIfMissing(db, "support_tickets", "priority", "TEXT NOT NULL DEFAULT 'normal'");
  addColumnIfMissing(db, "support_tickets", "assigned_admin_user_id", "TEXT");
  addColumnIfMissing(db, "support_tickets", "resolved_at", "TEXT");
  addColumnIfMissing(db, "support_tickets", "closed_at", "TEXT");
  addColumnIfMissing(db, "support_tickets", "last_message_at", "TEXT");
  addColumnIfMissing(db, "support_tickets", "version", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "support_tickets", "parent_ticket_id", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      author_type TEXT NOT NULL,
      author_user_id TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS support_ticket_events (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      before_value TEXT NOT NULL,
      after_value TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_user_id TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_support_ticket_queue
      ON support_tickets(status, priority, assigned_admin_user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_support_ticket_messages
      ON support_ticket_messages(ticket_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_support_ticket_events
      ON support_ticket_events(ticket_id, created_at);
    INSERT INTO support_ticket_messages (
      id, ticket_id, visibility, author_type, author_user_id, body, created_at
    )
    SELECT 'opening-' || id, id, 'public', 'customer', user_id, message, created_at
    FROM support_tickets
    WHERE NOT EXISTS (
      SELECT 1 FROM support_ticket_messages message_row WHERE message_row.ticket_id = support_tickets.id
    );
    UPDATE support_tickets
    SET last_message_at = COALESCE(last_message_at, created_at);
  `);
}
```

加入迁移 `0010_support_ticket_workflow`。

- [ ] **Step 4: 运行迁移测试确认转绿**

Run: `npm run test:api -- --grep "support workflow tables"`

Expected: PASS。

- [ ] **Step 5: 提交迁移**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add support ticket workflow schema"
```

### Task 2: 工单序列化、列表与客户消息

**Files:**
- Modify: `lib/repositories/support.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写公开/内部消息隔离失败测试**

```js
test("serializes only public ticket messages for customers", async () => {
  const { findSupportTicketById } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const ticket = db.prepare("SELECT id FROM support_tickets LIMIT 1").get();
  db.prepare(`INSERT INTO support_ticket_messages
    (id, ticket_id, visibility, author_type, author_user_id, body, created_at)
    VALUES (?, ?, 'internal', 'admin', NULL, ?, ?)`)
    .run("message-internal-test", ticket.id, "客户不可见", new Date().toISOString());
  const customer = findSupportTicketById(db, ticket.id, { audience: "customer" });
  const admin = findSupportTicketById(db, ticket.id, { audience: "admin" });
  expect(customer.messages.some((message) => message.body === "客户不可见")).toBe(false);
  expect(admin.messages.some((message) => message.body === "客户不可见")).toBe(true);
  db.close();
});

test("creates the opening message and safely links a closed parent ticket", () => {
  const { createSupportTicket } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const owner = { sessionId: "session-owner", userId: null };
  const parent = createSupportTicket(db, {
    name: "Owner", contact: "owner@example.com", topic: "orders",
    message: "原工单", locale: "zh-CN"
  }, owner).ticket;
  db.prepare("UPDATE support_tickets SET status = 'closed' WHERE id = ?").run(parent.id);
  const child = createSupportTicket(db, {
    name: "Owner", contact: "OWNER@example.com", topic: "orders",
    message: "关闭后的后续问题", locale: "zh-CN", parentTicketId: parent.id
  }, { ...owner, authorizedParentTicketIds: new Set([parent.id]) });
  expect(child.ticket.parentTicketId).toBe(parent.id);
  expect(db.prepare("SELECT body FROM support_ticket_messages WHERE ticket_id = ?").all(child.ticket.id))
    .toEqual([{ body: "关闭后的后续问题" }]);
  const rejected = createSupportTicket(db, {
    name: "Other", contact: "other@example.com", topic: "orders",
    message: "尝试关联他人工单", locale: "zh-CN", parentTicketId: parent.id
  }, { sessionId: "session-other", userId: null, authorizedParentTicketIds: new Set() });
  expect(rejected.validationError.code).toBe("SUPPORT_PARENT_TICKET_INVALID");
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "only public ticket messages|opening message"`

Expected: FAIL，查询函数不存在。

- [ ] **Step 3: 实现工单查询与序列化**

在 `support.js` 增加：

```js
const TICKET_STATUSES = new Set(["open", "in_progress", "waiting_customer", "resolved", "closed"]);
const TICKET_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function normalizeContact(value) {
  return String(value || "").trim().toLowerCase();
}

function findSupportTicketById(db, ticketId, options = {}) {
  const row = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(ticketId);
  if (!row) return null;
  const audience = options.audience === "admin" ? "admin" : "customer";
  const messageSql = audience === "admin"
    ? "SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at, rowid"
    : "SELECT * FROM support_ticket_messages WHERE ticket_id = ? AND visibility = 'public' ORDER BY created_at, rowid";
  const messages = db.prepare(messageSql).all(ticketId).map(mapSupportMessageRow);
  const ticket = mapSupportTicketRow(row);
  return audience === "admin"
    ? { ...ticket, messages, events: listSupportTicketEvents(db, ticketId) }
    : { ...stripInternalTicketFields(ticket), messages };
}
```

改造 `createSupportTicket`，在同一事务中写入 `support_tickets` 和首条 `support_ticket_messages` 公开消息，并设置 `last_message_at`。可选 `parentTicketId` 只允许关联状态为 `closed` 的工单；登录用户必须与父工单 `user_id` 相同，匿名用户必须同时满足 `context.authorizedParentTicketIds.has(parentTicketId)` 和标准化联系方式匹配，否则返回 `SUPPORT_PARENT_TICKET_INVALID`，且事务不得产生子工单或孤立消息。

实现 `listSupportTicketsForUser(db, userId)`、`findSupportTicketForGuest(db, ticketNumber, contact)` 和 `addCustomerTicketMessage(db, ticket, actor, body)`。客户消息只允许 `open / in_progress / waiting_customer / resolved`；`waiting_customer` 或 `resolved` 收到客户回复后转为 `in_progress`；写入消息、状态事件、`last_message_at`、`updated_at` 和递增 `version` 必须在一个事务内完成。

- [ ] **Step 4: 运行仓储测试确认转绿**

Run: `npm run test:api -- --grep "public ticket messages|opening message|customer ticket message"`

Expected: PASS。

- [ ] **Step 5: 提交工单仓储**

```powershell
git add lib/repositories/support.js tests/api.spec.js
git commit -m "feat: add support ticket conversations"
```

### Task 3: 匿名查询限频器

**Files:**
- Create: `lib/support-lookup-limiter.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写限频失败测试**

```js
test("blocks repeated failed guest ticket lookups during cooldown", () => {
  const { createSupportLookupLimiter } = require("../lib/support-lookup-limiter");
  let now = 1000;
  const limiter = createSupportLookupLimiter({ maxFailures: 3, cooldownMs: 60000, now: () => now });
  expect(limiter.canAttempt("session-a")).toBe(true);
  limiter.recordFailure("session-a");
  limiter.recordFailure("session-a");
  limiter.recordFailure("session-a");
  expect(limiter.canAttempt("session-a")).toBe(false);
  now += 60001;
  expect(limiter.canAttempt("session-a")).toBe(true);
  limiter.authorizeTicket("session-a", "ticket-1");
  expect(limiter.canAccessTicket("session-a", "ticket-1")).toBe(true);
  expect(limiter.canAccessTicket("session-b", "ticket-1")).toBe(false);
  now += 60001;
  expect(limiter.canAccessTicket("session-a", "ticket-1")).toBe(false);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "guest ticket lookups during cooldown"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现限频器**

```js
function createSupportLookupLimiter(options = {}) {
  const maxFailures = options.maxFailures || 5;
  const cooldownMs = options.cooldownMs || 15 * 60 * 1000;
  const now = options.now || Date.now;
  const failures = new Map();
  const authorizations = new Map();
  function getActive(key) {
    const entry = failures.get(key);
    if (!entry || now() - entry.firstFailureAt > cooldownMs) {
      failures.delete(key);
      return null;
    }
    return entry;
  }
  return {
    canAttempt(key) {
      const entry = getActive(key);
      return !entry || entry.count < maxFailures;
    },
    recordFailure(key) {
      const entry = getActive(key) || { count: 0, firstFailureAt: now() };
      entry.count += 1;
      failures.set(key, entry);
    },
    recordSuccess(key) {
      failures.delete(key);
    },
    authorizeTicket(key, ticketId) {
      const entry = authorizations.get(key) || { expiresAt: now() + cooldownMs, ticketIds: new Set() };
      entry.expiresAt = now() + cooldownMs;
      entry.ticketIds.add(ticketId);
      authorizations.set(key, entry);
    },
    canAccessTicket(key, ticketId) {
      const entry = authorizations.get(key);
      if (!entry || entry.expiresAt <= now()) {
        authorizations.delete(key);
        return false;
      }
      return entry.ticketIds.has(ticketId);
    }
  };
}

module.exports = { createSupportLookupLimiter };
```

路由用“会话 ID + 来源地址”的哈希作为 `key`。匿名查询成功后调用 `recordSuccess(key)` 和 `authorizeTicket(key, ticket.id)`；匿名回复、关联关闭工单创建续单前必须调用 `canAccessTicket(key, ticket.id)`，不能只依赖客户端提交的工单号或 ID。

- [ ] **Step 4: 运行测试确认转绿**

Run: `npm run test:api -- --grep "guest ticket lookups during cooldown"`

Expected: PASS。

- [ ] **Step 5: 提交限频器**

```powershell
git add lib/support-lookup-limiter.js tests/api.spec.js
git commit -m "feat: protect guest support ticket lookups"
```

### Task 4: 后台工单动作与审计

**Files:**
- Create: `lib/repositories/admin-support-actions.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写状态、分配和消息失败测试**

```js
test("assigns and resolves support tickets with idempotent admin actions", async () => {
  const { updateSupportTicket, addAdminSupportMessage } = require("../lib/repositories/admin-support-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const ticket = db.prepare("SELECT id FROM support_tickets LIMIT 1").get();
  const admin = { id: null };
  const assigned = updateSupportTicket(db, {
    admin, ticketId: ticket.id,
    body: { operationId: "op-ticket-assign", action: "assign", assignedAdminUserId: null, expectedVersion: 1 }
  });
  const replied = addAdminSupportMessage(db, {
    admin, ticketId: ticket.id,
    body: { operationId: "op-ticket-reply", visibility: "public", message: "我们正在处理。" }
  });
  expect(assigned.ticket.version).toBe(2);
  expect(replied.ticket.messages.at(-1).body).toBe("我们正在处理。");
  expect(addAdminSupportMessage(db, {
    admin, ticketId: ticket.id,
    body: { operationId: "op-ticket-reply", visibility: "public", message: "我们正在处理。" }
  }).replayed).toBe(true);
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "idempotent admin actions"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现动作模块**

固定状态流：

```js
const SUPPORT_TRANSITIONS = {
  open: new Set(["in_progress", "closed"]),
  in_progress: new Set(["waiting_customer", "resolved", "closed"]),
  waiting_customer: new Set(["in_progress", "resolved", "closed"]),
  resolved: new Set(["in_progress", "closed"]),
  closed: new Set([])
};
```

`updateSupportTicket` 支持 `assign`、`priority` 和 `status`，先核对 `expectedVersion`，冲突返回 409 `SUPPORT_VERSION_CONFLICT`。`status` 动作校验状态表，并设置/清除 `resolved_at`、`closed_at`。每次写入 `support_ticket_events`，再递增版本。

`addAdminSupportMessage` 要求工单未关闭、消息 1-2000 字；`visibility` 只允许 `public` 或 `internal`；公开回复更新 `last_message_at`，内部备注不改变客户可见时间线。所有动作通过 `executeIdempotentAction` 执行。

- [ ] **Step 4: 运行动作测试确认转绿**

Run: `npm run test:api -- --grep "support tickets with idempotent|support version conflict|internal support note"`

Expected: PASS。

- [ ] **Step 5: 提交后台动作**

```powershell
git add lib/repositories/admin-support-actions.js tests/api.spec.js
git commit -m "feat: add admin support ticket actions"
```

### Task 5: 客户、匿名和后台工单 API

**Files:**
- Create: `lib/routes/support-ticket-routes.js`
- Create: `lib/routes/admin-support-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写 API 失败测试**

```js
test("lets customers track and reply to their support tickets", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "support-owner@example.com" });
  const created = await request.post("/api/support/contact", {
    headers: { cookie },
    data: { name: "Owner", contact: "support-owner@example.com", topic: "orders", message: "订单需要帮助", locale: "zh-CN" }
  });
  const ticket = (await created.json()).ticket;
  const reply = await request.post(`/api/me/support/tickets/${ticket.id}/messages`, {
    headers: { cookie }, data: { message: "补充订单截图信息。" }
  });
  expect(reply.ok()).toBe(true);
  const detail = await request.get(`/api/me/support/tickets/${ticket.id}`, { headers: { cookie } });
  expect((await detail.json()).ticket.messages.at(-1).body).toBe("补充订单截图信息。");
});

test("hides internal notes and returns the same not-found error to non-owners", async ({ request }) => {
  const ownerCookie = await registerApiUser(request, { email: "ticket-owner@example.com" });
  const outsiderCookie = await registerApiUser(request, { email: "ticket-outsider@example.com" });
  const adminCookie = await registerApiUser(request, { email: "admin@socks.test" });
  const created = await request.post("/api/support/contact", {
    headers: { cookie: ownerCookie },
    data: { name: "Owner", contact: "ticket-owner@example.com", topic: "orders", message: "需要售后", locale: "zh-CN" }
  });
  const ticket = (await created.json()).ticket;
  const note = await request.post(`/api/admin/support/tickets/${ticket.id}/actions/message`, {
    headers: { cookie: adminCookie },
    data: { operationId: "op-internal-note", visibility: "internal", message: "客户不可见的处理备注" }
  });
  expect(note.ok()).toBe(true);
  const ownerDetail = await request.get(`/api/me/support/tickets/${ticket.id}`, { headers: { cookie: ownerCookie } });
  expect((await ownerDetail.json()).ticket.messages.some((item) => item.body.includes("客户不可见"))).toBe(false);
  const outsiderDetail = await request.get(`/api/me/support/tickets/${ticket.id}`, { headers: { cookie: outsiderCookie } });
  expect(outsiderDetail.status()).toBe(404);
  expect((await outsiderDetail.json()).error.code).toBe("SUPPORT_TICKET_NOT_FOUND");
});

test("authorizes successful guest lookups and rate limits uniform failures", async ({ request }) => {
  const created = await request.post("/api/support/contact", {
    data: { name: "Guest", contact: "guest-lookup@example.com", topic: "product", message: "匿名咨询", locale: "zh-CN" }
  });
  const ticket = (await created.json()).ticket;
  const lookup = await request.post("/api/support/tickets/lookup", {
    data: { ticketNumber: ticket.ticketNumber, contact: "GUEST-LOOKUP@example.com" }
  });
  expect(lookup.ok()).toBe(true);
  const reply = await request.post(`/api/support/tickets/${ticket.ticketNumber}/messages`, {
    data: { message: "已授权会话的补充内容" }
  });
  expect(reply.ok()).toBe(true);
  const failures = [];
  for (let index = 0; index < 5; index += 1) {
    failures.push(await request.post("/api/support/tickets/lookup", {
      data: { ticketNumber: index % 2 ? "SUP-NOT-FOUND" : ticket.ticketNumber, contact: "wrong@example.com" }
    }));
  }
  for (const response of failures) {
    expect(response.status()).toBe(404);
    expect((await response.json()).error.code).toBe("SUPPORT_TICKET_NOT_FOUND");
  }
  const blocked = await request.post("/api/support/tickets/lookup", {
    data: { ticketNumber: ticket.ticketNumber, contact: "wrong@example.com" }
  });
  expect(blocked.status()).toBe(429);
  expect((await blocked.json()).error.code).toBe("SUPPORT_LOOKUP_RATE_LIMITED");
});

test("rejects ordinary users from admin support routes", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "support-buyer@example.com" });
  const response = await request.get("/api/admin/support/tickets", { headers: { cookie } });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("ADMIN_FORBIDDEN");
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "track and reply|internal notes|guest lookups|admin support routes"`

Expected: FAIL，新路由 404。

- [ ] **Step 3: 创建客户路由模块**

注册：

```text
POST /api/support/contact
POST /api/support/tickets/lookup
POST /api/support/tickets/:ticketNumber/messages
GET  /api/me/support/tickets
GET  /api/me/support/tickets/:id
POST /api/me/support/tickets/:id/messages
```

匿名消息接口要求当前会话已成功查询过同一工单；使用 `supportLookupLimiter.authorizeTicket` 和 `canAccessTicket` 在服务端缓存授权工单 ID，不接受仅凭路径直接回复。创建关联关闭工单的续单时，把该会话已授权的工单 ID 集合作为 `authorizedParentTicketIds` 传入 `createSupportTicket`。移除 `server.js` 原内联 `/api/support/contact`，避免重复路由。

- [ ] **Step 4: 创建后台路由模块**

注册：

```text
GET  /api/admin/support/tickets
GET  /api/admin/support/tickets/:id
POST /api/admin/support/tickets/:id/actions/update
POST /api/admin/support/tickets/:id/actions/message
```

列表参数为 `status`、`priority`、`assignee`、`topic`、`q`；响应包含 `summary` 和 `tickets`。

- [ ] **Step 5: 运行 API 测试确认转绿**

Run: `npm run test:api -- --grep "support ticket|guest ticket|internal support|admin support"`

Expected: PASS。

- [ ] **Step 6: 提交工单 API**

```powershell
git add lib/routes/support-ticket-routes.js lib/routes/admin-support-routes.js server.js tests/api.spec.js
git commit -m "feat: expose support ticket workflow APIs"
```

### Task 6: 后台工单工作台

**Files:**
- Create: `public/js/admin-support-management.js`
- Modify: `lib/repositories/admin.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写后台工单 UI 失败测试**

```js
test("assigns and replies from the admin support workspace", async ({ page }) => {
  await registerAdminFromUi(page);
  const created = await page.request.post("/api/support/contact", {
    data: { name: "Buyer", contact: "buyer@example.com", topic: "delivery", message: "物流没有更新", locale: "zh-CN" }
  });
  const ticket = (await created.json()).ticket;
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='support']").click();
  await page.locator(`[data-admin-ticket-row][data-ticket-id='${ticket.id}'] [data-admin-ticket-open]`).click();
  await page.locator("[data-admin-ticket-priority]").selectOption("urgent");
  await page.locator("[data-admin-ticket-update]").click();
  await page.locator("[data-admin-ticket-public-message]").fill("我们已联系承运商核查。");
  await page.locator("[data-admin-ticket-public-submit]").click();
  await expect(page.locator("[data-admin-ticket-drawer]")).toContainText("我们已联系承运商核查");
  await expect(page.locator(`[data-admin-ticket-row][data-ticket-id='${ticket.id}']`)).toContainText(/紧急|urgent/);
});

test("includes operational support KPIs in the admin summary", () => {
  const { getAdminSummary } = require("../lib/repositories/admin");
  const { createSupportTicket } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  db.exec("DELETE FROM support_ticket_events; DELETE FROM support_ticket_messages; DELETE FROM support_tickets;");
  const tickets = ["紧急问题", "等待客户", "超时问题"].map((message) => createSupportTicket(db, {
    name: "Buyer", contact: "buyer@example.com", topic: "orders", message, locale: "zh-CN"
  }, { sessionId: `session-${message}` }).ticket);
  const now = new Date("2026-07-31T12:00:00.000Z");
  db.prepare("UPDATE support_tickets SET priority = 'urgent', last_message_at = ? WHERE id = ?")
    .run(now.toISOString(), tickets[0].id);
  db.prepare("UPDATE support_tickets SET status = 'waiting_customer', last_message_at = ? WHERE id = ?")
    .run(now.toISOString(), tickets[1].id);
  db.prepare("UPDATE support_tickets SET last_message_at = ? WHERE id = ?")
    .run("2026-07-29T11:59:59.000Z", tickets[2].id);
  expect(getAdminSummary(db, now).summary).toMatchObject({
    unassignedSupportCount: 3,
    urgentSupportCount: 1,
    waitingCustomerSupportCount: 1,
    overdueSupportCount: 1
  });
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "admin support workspace"`

Expected: FAIL，工单页签不存在。

- [ ] **Step 3: 增加工单页签和抽屉**

加入 `data-admin-tab="support"` 和 `data-admin-ticket-drawer`；抽屉含消息时间线、状态/优先级/处理人表单、公开回复区和内部备注区。内部备注使用灰色条纹背景与“客户不可见”固定标签。

- [ ] **Step 4: 实现独立后台模块**

```js
window.StorefrontAdminSupport = {
  mount({ panel, drawer, request, createOperationId, escapeHtml }),
  render(),
  destroy()
};
```

表格渲染 KPI、筛选器和工单行；抽屉请求详情。所有更新提交当前 `version`，收到 `SUPPORT_VERSION_CONFLICT` 时刷新详情并显示“工单已被其他操作更新”。

扩展 `getAdminSummary(db, now)`，返回 `unassignedSupportCount`、`urgentSupportCount`、`waitingCustomerSupportCount` 和 `overdueSupportCount`。超时定义为未关闭工单的 `last_message_at` 早于 `now - 24 小时`；四项同时加入 `workQueue`，后台顶部 KPI 直接使用该响应，不在浏览器端重新统计分页列表。

- [ ] **Step 5: 运行后台 UI 测试确认转绿**

Run: `npm run test:ui -- --grep "admin support workspace"`

Expected: PASS。

- [ ] **Step 6: 提交后台工单 UI**

```powershell
git add lib/repositories/admin.js public/js/admin-support-management.js public/js/storefront-app.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add admin support workspace"
```

### Task 7: 客户工单追踪 UI

**Files:**
- Create: `public/js/customer-support-tickets.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写登录和匿名追踪失败测试**

```js
test("opens support ticket history and replies as a signed-in customer", async ({ page }) => {
  await registerFromUi(page, { email: "history@example.com" });
  const created = await page.request.post("/api/support/contact", {
    data: { name: "History Buyer", contact: "history@example.com", topic: "orders", message: "订单历史问题", locale: "zh-CN" }
  });
  const ticket = (await created.json()).ticket;
  await page.goto("/socks-product-list.html?view=support-tickets");
  const row = page.locator(`[data-support-ticket-row][data-ticket-id='${ticket.id}']`);
  await expect(row).toContainText("订单历史问题");
  await row.locator("[data-support-ticket-open]").click();
  await page.locator("[data-support-ticket-reply]").fill("这是登录用户补充的信息。");
  await page.locator("[data-support-ticket-reply-submit]").click();
  await expect(page.locator("[data-support-ticket-detail]")).toContainText("这是登录用户补充的信息。");
});

test("tracks a guest support ticket without exposing internal notes", async ({ page }) => {
  const created = await page.request.post("/api/support/contact", {
    data: { name: "Guest", contact: "guest@example.com", topic: "product", message: "商品咨询", locale: "zh-CN" }
  });
  const ticket = (await created.json()).ticket;
  await page.goto("/socks-product-list.html?view=support-tickets");
  await page.locator("[data-support-ticket-number]").fill(ticket.ticketNumber);
  await page.locator("[data-support-ticket-contact]").fill("guest@example.com");
  await page.locator("[data-support-ticket-lookup]").click();
  await expect(page.locator("[data-support-ticket-detail]")).toContainText("商品咨询");
  await expect(page.locator("[data-support-ticket-detail]")).not.toContainText("客户不可见");
  await page.locator("[data-support-ticket-contact]").fill("wrong@example.com");
  await page.locator("[data-support-ticket-lookup]").click();
  await expect(page.locator("[data-support-ticket-error]")).toContainText(/未找到|not found/i);
  await expect(page.locator("[data-support-ticket-error]")).not.toContainText("联系方式不匹配");
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "guest support ticket|support ticket history"`

Expected: FAIL，视图不存在。

- [ ] **Step 3: 增加客户工单视图**

新增 `data-support-tickets-view`，包含登录历史容器、匿名查询表单、详情时间线和客户回复表单。帮助中心联系区域增加 `/socks-product-list.html?view=support-tickets` 入口。

- [ ] **Step 4: 实现客户模块**

```js
window.StorefrontCustomerSupport = {
  mount({ root, currentUser, locale, request, escapeHtml }),
  render(),
  setUser(user),
  destroy()
};
```

登录时请求 `/api/me/support/tickets`；匿名时仅在提交查询后渲染详情。客户回复成功后重新获取当前详情。错误写入表单 `aria-live="polite"` 区域。

- [ ] **Step 5: 运行客户 UI 测试确认转绿**

Run: `npm run test:ui -- --grep "guest support ticket|support ticket history"`

Expected: PASS。

- [ ] **Step 6: 提交客户追踪 UI**

```powershell
git add public/js/customer-support-tickets.js public/js/storefront-app.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add customer support ticket tracking"
```

### Task 8: 工单系统全量回归与清理

**Files:**
- Verify: all modified support files

- [ ] **Step 1: 运行完整 API 套件**

Run: `npm run test:api`

Expected: 0 failed。

- [ ] **Step 2: 运行完整 UI 套件**

Run: `npm run test:ui`

Expected: 0 failed，保持单 worker。

- [ ] **Step 3: 检查格式、编码和客户数据隔离**

```powershell
git diff --check
rg -n "\\u[0-9a-fA-F]{4}" lib public/js socks-product-list.html tests
npm run test:api -- --grep "internal support|ticket owner|guest ticket"
```

Expected: 无格式错误、无新增 Unicode 转义，隔离测试通过。

- [ ] **Step 4: 清理明确测试产物并检查工作区**

恢复本轮测试生成的 fixture，删除本轮明确创建的上传文件，运行 `git status --short`。

- [ ] **Step 5: 推送当前分支**

```powershell
git push origin feature/socks-after-sales-payment-admin
```

Expected: 更新现有 PR。

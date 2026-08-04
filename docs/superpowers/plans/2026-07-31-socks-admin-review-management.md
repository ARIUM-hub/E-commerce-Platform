# 评论管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为商品评论增加混合审核、后台筛选与批量处理、商家回复、审计记录和严格的前台可见性控制。

**Architecture:** 扩展 `product_reviews` 并新增回复表，公共评论仓储只返回已发布评论；新的 `admin-review-actions` 在事务内执行幂等审核与回复。管理 API 和浏览器模块分别放入独立文件，通过现有路由器和后台页签接入。

**Tech Stack:** Node.js 原生 HTTP、Node SQLite、原生浏览器 JavaScript、HTML/CSS、Playwright API/UI 测试。

---

## File Map

- Modify: `lib/database.js`：增加 `0009_product_review_moderation` 迁移。
- Modify: `lib/repositories/product-reviews.js`：混合审核、公共可见性、后台查询和回复序列化。
- Create: `lib/repositories/admin-review-actions.js`：审核、批量审核与商家回复事务。
- Modify: `lib/repositories/admin.js`：后台看板增加评论待办 KPI。
- Create: `lib/routes/admin-review-routes.js`：评论管理 API。
- Modify: `lib/routes/product-routes.js`：评论提交传入用户与会话主体。
- Modify: `server.js`：注册评论管理路由和依赖。
- Create: `public/js/admin-review-management.js`：评论页签、筛选、表格和抽屉交互。
- Modify: `public/js/storefront-app.js`：把评论页签交给独立模块渲染。
- Modify: `socks-product-list.html`：增加评论页签、抽屉、样式和脚本。
- Modify: `tests/api.spec.js`：迁移、可见性、状态流、幂等、权限和批量事务测试。
- Modify: `tests/socks-product-list.spec.js`：评论工作台 UI 测试。

## Execution Notes

- 全程使用 UTF-8，中文直接写入文件，不使用 `\uXXXX`。
- Playwright 固定 `--workers=1`。
- 每个行为先写失败测试并确认失败原因，再实现最小代码。
- 不调用外部内容审核、模型或供应商接口。

### Task 1: 评论审核数据库迁移

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写迁移失败测试**

在迁移测试区加入：

```js
test("initializes product review moderation storage and backfills published reviews", async () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const columns = db.prepare("PRAGMA table_info(product_reviews)").all().map((column) => column.name);
  const replyTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_review_replies'").get();
  const pendingIndex = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_product_reviews_moderation'").get();
  const migration = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("0009_product_review_moderation");
  const statuses = db.prepare("SELECT DISTINCT status FROM product_reviews ORDER BY status").all();

  expect(columns).toEqual(expect.arrayContaining([
    "user_id", "session_id", "status", "moderation_reason", "moderation_note",
    "moderated_by", "moderated_at", "risk_flags", "updated_at"
  ]));
  expect(replyTable).toEqual({ name: "product_review_replies" });
  expect(pendingIndex).toEqual({ name: "idx_product_reviews_moderation" });
  expect(migration).toEqual({ id: "0009_product_review_moderation" });
  expect(statuses).toEqual([{ status: "published" }]);
  db.close();
});
```

- [ ] **Step 2: 运行迁移测试确认红灯**

Run: `npm run test:api -- --grep "product review moderation storage"`

Expected: FAIL，缺少审核列、回复表和迁移记录。

- [ ] **Step 3: 实现迁移**

在 `lib/database.js` 增加：

```js
function ensureProductReviewModerationTables(db) {
  addColumnIfMissing(db, "product_reviews", "user_id", "TEXT");
  addColumnIfMissing(db, "product_reviews", "session_id", "TEXT");
  addColumnIfMissing(db, "product_reviews", "status", "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing(db, "product_reviews", "moderation_reason", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "product_reviews", "moderation_note", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "product_reviews", "moderated_by", "TEXT");
  addColumnIfMissing(db, "product_reviews", "moderated_at", "TEXT");
  addColumnIfMissing(db, "product_reviews", "risk_flags", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "product_reviews", "updated_at", "TEXT");
  db.exec(`
    UPDATE product_reviews
    SET status = COALESCE(NULLIF(status, ''), 'published'),
        updated_at = COALESCE(updated_at, created_at);
    CREATE TABLE IF NOT EXISTS product_review_replies (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL,
      admin_user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      withdrawn_at TEXT,
      FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_product_reviews_moderation
      ON product_reviews(status, rating, created_at);
  `);
}
```

把迁移加入 `migrations`：

```js
{
  id: "0009_product_review_moderation",
  name: "Add product review moderation and merchant replies",
  up(db) {
    ensureProductReviewModerationTables(db);
  }
}
```

- [ ] **Step 4: 运行迁移测试确认转绿**

Run: `npm run test:api -- --grep "product review moderation storage"`

Expected: PASS，1 个测试通过。

- [ ] **Step 5: 提交迁移**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add product review moderation schema"
```

### Task 2: 混合审核与公共可见性

**Files:**
- Modify: `lib/repositories/product-reviews.js`
- Modify: `lib/routes/product-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写匿名待审核与登录自动发布失败测试**

```js
test("publishes safe signed-in reviews and queues anonymous reviews", async ({ request }) => {
  const anonymous = await request.post("/api/products/sock-01/reviews", {
    data: { author: "Guest", rating: 4, body: "穿着舒适，长度合适。", locale: "zh-CN" }
  });
  expect((await anonymous.json()).review.status).toBe("pending");

  const cookie = await registerApiUser(request, { email: "reviewer@example.com" });
  const signedIn = await request.post("/api/products/sock-01/reviews", {
    headers: { cookie },
    data: { author: "Buyer", rating: 5, body: "面料柔软，日常穿很好。", locale: "zh-CN" }
  });
  expect((await signedIn.json()).review.status).toBe("published");

  const publicList = await request.get("/api/products/sock-01/reviews");
  const ids = (await publicList.json()).reviews.map((review) => review.id);
  expect(ids).toContain((await signedIn.json()).review.id);
  expect(ids).not.toContain((await anonymous.json()).review.id);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "queues anonymous reviews"`

Expected: FAIL，评论没有 `status`，匿名评论仍出现在公共列表。

- [ ] **Step 3: 实现本地风险规则与状态写入**

在 `product-reviews.js` 增加并导出：

```js
function getReviewRiskFlags(db, productId, review, owner, now = new Date()) {
  const flags = [];
  if (!owner.userId) flags.push("anonymous");
  if (/https?:\/\/|www\./i.test(review.body)) flags.push("external_link");
  const duplicate = db.prepare(`
    SELECT id FROM product_reviews
    WHERE product_id = ? AND lower(trim(body)) = lower(trim(?))
    LIMIT 1
  `).get(productId, review.body);
  if (duplicate) flags.push("duplicate_content");
  const since = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const recentCount = owner.userId
    ? db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE user_id = ? AND created_at >= ?").get(owner.userId, since).count
    : db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE session_id = ? AND created_at >= ?").get(owner.sessionId, since).count;
  if (recentCount >= 3) flags.push("high_frequency");
  return flags;
}

function getInitialReviewStatus(owner, riskFlags) {
  return owner.userId && riskFlags.length === 0 ? "published" : "pending";
}
```

修改 `createProductReview(db, productId, payload, options)`，写入 `user_id`、`session_id`、`status`、`risk_flags` 和 `updated_at`。修改 `listProductReviews` 的默认 `WHERE` 为 `product_id = ? AND status = 'published'`；增加 `{ includeAllStatuses: true }` 仅供后台使用。

- [ ] **Step 4: 让产品路由取得提交主体**

在 POST 评论路由读取活动会话：

```js
const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
const owner = {
  userId: activeCart.user?.id || null,
  sessionId: activeCart.user ? null : activeCart.sessionId
};
```

调用：

```js
const created = services.createProductReview(db, productId, body, { owner });
```

并在成功响应前设置 `activeCart.setCookieHeader`。

- [ ] **Step 5: 运行测试确认转绿并回归评论接口**

Run: `npm run test:api -- --grep "queues anonymous reviews|product reviews|review trust signals"`

Expected: PASS，已有评论测试与新增测试全部通过。

- [ ] **Step 6: 提交混合审核**

```powershell
git add lib/repositories/product-reviews.js lib/routes/product-routes.js server.js tests/api.spec.js
git commit -m "feat: add hybrid product review moderation"
```

### Task 3: 后台评论查询与汇总

**Files:**
- Modify: `lib/repositories/product-reviews.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写后台筛选失败测试**

```js
test("lists admin reviews with moderation filters and summary", async () => {
  const { listAdminProductReviews } = require("../lib/repositories/product-reviews");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const result = listAdminProductReviews(db, { status: "published", rating: "5", q: "舒适" });
  expect(result.summary).toEqual(expect.objectContaining({ published: expect.any(Number), pending: expect.any(Number) }));
  expect(result.reviews.every((review) => review.status === "published" && review.rating === 5)).toBe(true);
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "admin reviews with moderation filters"`

Expected: FAIL，`listAdminProductReviews` 未定义。

- [ ] **Step 3: 实现后台查询**

```js
function listAdminProductReviews(db, filters = {}) {
  const reviews = db.prepare(`
    SELECT review.*, product.payload AS product_payload,
      reply.id AS reply_id, reply.body AS reply_body, reply.updated_at AS reply_updated_at,
      reply.withdrawn_at AS reply_withdrawn_at
    FROM product_reviews review
    JOIN products product ON product.id = review.product_id
    LEFT JOIN product_review_replies reply ON reply.review_id = review.id
    ORDER BY datetime(review.created_at) DESC, review.rowid DESC
  `).all().map(mapAdminReviewRow);
  const q = String(filters.q || "").trim().toLowerCase();
  const status = String(filters.status || "").trim();
  const rating = Number(filters.rating);
  const filtered = reviews.filter((review) => {
    return (!status || review.status === status)
      && (!Number.isInteger(rating) || review.rating === rating)
      && (!filters.productId || review.productId === filters.productId)
      && (!q || `${review.author} ${review.body} ${review.productTitle}`.toLowerCase().includes(q))
      && (!filters.replied || (filters.replied === "yes") === Boolean(review.reply && !review.reply.withdrawnAt));
  });
  const count = (value) => reviews.filter((review) => review.status === value).length;
  return {
    reviews: filtered,
    summary: {
      pending: count("pending"), published: count("published"), hidden: count("hidden"),
      rejected: count("rejected"), lowRating: reviews.filter((review) => review.rating <= 2).length
    }
  };
}
```

`mapAdminReviewRow` 必须解析商品标题、审核字段、`riskFlags` 和当前商家回复；导出该函数。
同时修改公共 `listProductReviews` 查询，左连接未撤回的 `product_review_replies` 并把回复序列化为 `reply: { body, updatedAt }`。公共响应不得包含管理员 ID 或撤回记录。

扩展 `lib/repositories/admin.js` 的 `getAdminSummary`：

```js
const pendingReviewCount = db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE status = 'pending'").get().count;
const lowRatingReviewCount = db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE status = 'published' AND rating <= 2").get().count;
```

把两项写入 `summary` 和 `workQueue`，并在现有后台汇总 API 测试中断言数值。

- [ ] **Step 4: 运行测试确认转绿**

Run: `npm run test:api -- --grep "admin reviews with moderation filters"`

Expected: PASS。

- [ ] **Step 5: 提交后台查询**

```powershell
git add lib/repositories/product-reviews.js lib/repositories/admin.js tests/api.spec.js
git commit -m "feat: add admin review queries"
```

### Task 4: 幂等审核、批量事务与商家回复

**Files:**
- Create: `lib/repositories/admin-review-actions.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写审核状态和批量回滚失败测试**

```js
test("moderates review batches atomically and replays the same operation", async () => {
  const { moderateReviewBatch } = require("../lib/repositories/admin-review-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  db.prepare("UPDATE product_reviews SET status = 'pending' WHERE id IN (?, ?)")
    .run("seed-review-sock-02-01", "seed-review-sock-02-02");
  const body = {
    operationId: "op-review-batch-001", action: "publish",
    reviewIds: ["seed-review-sock-02-01", "seed-review-sock-02-02"],
    reason: "content_verified", note: "人工审核通过"
  };
  const first = moderateReviewBatch(db, { admin: { id: null }, body });
  const replay = moderateReviewBatch(db, { admin: { id: null }, body });
  expect(first.reviews.every((review) => review.status === "published")).toBe(true);
  expect(replay.replayed).toBe(true);
  expect(db.prepare("SELECT COUNT(*) AS count FROM admin_action_events WHERE operation_id = ?").get(body.operationId).count).toBe(1);
  db.close();
});
```

另加非法混合批次用例：包含一个 `rejected` 评论时返回 `ADMIN_REVIEW_BATCH_CONFLICT`，并断言其他评论状态未改变。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "moderates review batches atomically"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现审核动作**

创建 `admin-review-actions.js`，状态表固定为：

```js
const crypto = require("node:crypto");

function validation(statusCode, code, message, extra = {}) {
  return { validationError: { statusCode, code, message, ...extra } };
}

const REVIEW_TRANSITIONS = {
  publish: { from: new Set(["pending", "hidden"]), to: "published" },
  reject: { from: new Set(["pending"]), to: "rejected" },
  hide: { from: new Set(["published"]), to: "hidden" },
  restore: { from: new Set(["hidden"]), to: "published" }
};
```

`moderateReviewBatch` 必须：标准化并去重 ID；要求 1-100 条；在写入前读取全部评论并验证数量及状态；通过 `executeIdempotentAction` 执行单事务更新；记录 `moderation_reason`、`moderation_note`、`moderated_by`、`moderated_at`、`updated_at`；资源类型使用 `product_review_batch`，资源 ID 使用排序后 ID 的 SHA-256。

实现回复动作：

```js
function upsertMerchantReply(db, { admin, review, body }) {
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "review_reply_upsert",
    resourceType: "product_review",
    resourceId: review.id,
    reason: "merchant_reply",
    beforeStatus: review.status,
    requestPayload: body,
    run() {
      const replyBody = String(body.replyBody || "").trim();
      if (review.status !== "published") return validation(409, "ADMIN_REVIEW_REPLY_NOT_ALLOWED", "Only published reviews can be replied to.");
      if (!replyBody || replyBody.length > 1000) return validation(400, "ADMIN_REVIEW_REPLY_INVALID", "Reply must contain 1 to 1000 characters.");
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO product_review_replies (id, review_id, body, admin_user_id, created_at, updated_at, withdrawn_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(review_id) DO UPDATE SET body = excluded.body, admin_user_id = excluded.admin_user_id,
          updated_at = excluded.updated_at, withdrawn_at = NULL
      `).run(`review-reply-${crypto.randomUUID()}`, review.id, replyBody, admin.id || null, now, now);
      return { review: findAdminReviewById(db, review.id) };
    }
  });
}
```

实现 `withdrawMerchantReply`，只设置 `withdrawn_at`，不删除行。

- [ ] **Step 4: 运行审核和回复测试确认转绿**

Run: `npm run test:api -- --grep "review batches|merchant review repl|admin dashboard review"`

Expected: PASS。

- [ ] **Step 5: 提交审核动作**

```powershell
git add lib/repositories/admin-review-actions.js tests/api.spec.js
git commit -m "feat: add idempotent review moderation actions"
```

### Task 5: 评论管理 API

**Files:**
- Create: `lib/routes/admin-review-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写 API 权限与动作失败测试**

覆盖：非管理员 GET 返回 403；管理员按状态筛选；批量发布；单条回复；不一致 `operationId` 重放返回 409。

```js
test("moderates and replies to reviews through admin APIs", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const list = await request.get("/api/admin/reviews?status=published", { headers: { cookie } });
  const review = (await list.json()).reviews[0];
  const reply = await request.post(`/api/admin/reviews/${review.id}/actions/reply`, {
    headers: { cookie },
    data: { operationId: "op-review-reply-api", replyBody: "感谢您的真实反馈。" }
  });
  expect(reply.ok()).toBe(true);
  expect((await reply.json()).review.reply.body).toBe("感谢您的真实反馈。");
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "through admin APIs"`

Expected: FAIL，路由返回 404。

- [ ] **Step 3: 创建路由模块**

`registerAdminReviewRoutes(router, services)` 注册：

```text
GET  /api/admin/reviews
POST /api/admin/reviews/actions/moderate
GET  /api/admin/reviews/:id
POST /api/admin/reviews/:id/actions/reply
POST /api/admin/reviews/:id/actions/withdraw-reply
```

每个处理器先调用 `services.requireAdmin`；请求体错误使用 `handleRequestBodyError` 对应的标准错误；仓储 `validationError.statusCode` 原样返回。`server.js` 注入 `withDatabase`、查询函数和动作函数。

- [ ] **Step 4: 运行 API 测试确认转绿**

Run: `npm run test:api -- --grep "admin review|through admin APIs|review batches"`

Expected: PASS。

- [ ] **Step 5: 提交路由**

```powershell
git add lib/routes/admin-review-routes.js server.js tests/api.spec.js
git commit -m "feat: expose admin review management APIs"
```

### Task 6: 评论管理后台模块

**Files:**
- Create: `public/js/admin-review-management.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写评论工作台 UI 失败测试**

```js
test("moderates and replies from the admin reviews workspace", async ({ page }) => {
  await registerAdminFromUi(page);
  const created = await page.request.post("/api/products/sock-01/reviews", {
    data: { author: "Guest", rating: 2, body: "袜口偏紧，需要人工审核。", locale: "zh-CN" }
  });
  const review = (await created.json()).review;
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='reviews']").click();
  const row = page.locator(`[data-admin-review-row][data-review-id='${review.id}']`);
  await row.locator("[data-admin-review-select]").check();
  await page.locator("[data-admin-review-batch-action]").selectOption("publish");
  await page.locator("[data-admin-review-batch-submit]").click();
  await expect(row).toContainText(/已发布|published/);
  await row.locator("[data-admin-review-open]").click();
  await page.locator("[data-admin-review-reply]").fill("感谢反馈，我们会继续优化袜口弹性。");
  await page.locator("[data-admin-review-reply-submit]").click();
  await expect(page.locator("[data-admin-review-drawer]")).toContainText("感谢反馈");
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "admin reviews workspace"`

Expected: FAIL，评论页签不存在。

- [ ] **Step 3: 增加 HTML 容器和脚本**

后台页签加入：

```html
<button type="button" data-admin-tab="reviews">评论</button>
```

增加 `data-admin-review-drawer` 对话框，沿用 `.admin-operation-drawer`，包含标题、关闭按钮和 body。脚本顺序：

```html
<script src="/public/js/admin-review-management.js" defer></script>
<script src="/public/js/storefront-app.js" defer></script>
```

- [ ] **Step 4: 实现独立浏览器模块**

模块暴露：

```js
window.StorefrontAdminReviews = {
  mount({ panel, drawer, locale, request, createOperationId, escapeHtml, onSummaryChange }),
  render(),
  destroy()
};
```

`mount` 绑定一次事件委托；`render` 请求 `/api/admin/reviews` 并生成 KPI、筛选栏、批量工具条和表格；抽屉请求单条详情。提交期间禁用当前按钮，错误写入 `[data-admin-review-error]`。关闭、遮罩和 Escape 恢复触发按钮焦点。

修改 `storefront-app.js` 的 `createReviewItemsMarkup`，在评论正文后渲染当前未撤回的商家回复：

```js
${review.reply ? `
  <aside class="detail-review__merchant-reply" data-review-merchant-reply>
    <strong>${activeLocale === LOCALE_KEY.EN_US ? "Seller response" : "商家回复"}</strong>
    <p>${escapeHtml(review.reply.body)}</p>
  </aside>
` : ""}
```

在 UI 用例发布评论并回复后打开商品详情，断言 `[data-review-merchant-reply]` 显示回复内容；隐藏评论后断言该评论及回复均不再出现。

在 `renderAdminPanel()` 中加入：

```js
if (activeAdminTab === "reviews") {
  return window.StorefrontAdminReviews.render();
}
```

管理员就绪时调用 `mount`，退出后台或切换用户时调用 `destroy`。

- [ ] **Step 5: 运行评论 UI 测试确认转绿**

Run: `npm run test:ui -- --grep "admin reviews workspace"`

Expected: PASS。

- [ ] **Step 6: 增加移动端和焦点测试**

```js
test("keeps the admin review drawer accessible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='reviews']").click();
  const trigger = page.locator("[data-admin-review-row] [data-admin-review-open]").first();
  await trigger.click();
  const drawer = page.locator("[data-admin-review-drawer]");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-admin-review-drawer-title]")).toBeFocused();
  expect(await drawer.evaluate((element) => element.getBoundingClientRect().width <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
```

- [ ] **Step 7: 运行移动端和焦点测试确认转绿**

Run: `npm run test:ui -- --grep "admin review drawer accessible"`

Expected: PASS。

- [ ] **Step 8: 提交评论 UI**

```powershell
git add public/js/admin-review-management.js public/js/storefront-app.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add admin review management workspace"
```

### Task 7: 评论管理全量回归与清理

**Files:**
- Verify: all modified review files

- [ ] **Step 1: 运行完整 API 套件**

Run: `npm run test:api`

Expected: 0 failed。

- [ ] **Step 2: 运行完整 UI 套件**

Run: `npm run test:ui`

Expected: 0 failed，保持单 worker。

- [ ] **Step 3: 检查编码和格式**

```powershell
git diff --check
rg -n "\\u[0-9a-fA-F]{4}" lib public/js socks-product-list.html tests
```

Expected: `git diff --check` 无输出；新增中文没有 Unicode 转义。

- [ ] **Step 4: 清理测试产物并检查状态**

只恢复测试明确修改的 fixture，只删除本轮生成的具体上传文件。运行 `git status --short`，确认没有遗漏源文件或测试产物。

- [ ] **Step 5: 推送当前分支**

```powershell
git push origin feature/socks-after-sales-payment-admin
```

Expected: 更新现有 PR，不创建重复 PR。

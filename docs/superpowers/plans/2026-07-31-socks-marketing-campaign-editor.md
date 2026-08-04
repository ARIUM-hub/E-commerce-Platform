# 优惠活动可视化配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为优惠券、满减/限时折扣和组合购买增加草稿、版本、排期、冲突检测、价格预览和可视化发布流程。

**Architecture:** 新增活动身份与不可变版本表，现有 `coupons`、`promotions`、`bundles` 继续作为购物车读取的运行投影。后台保存草稿，发布动作在事务中完成版本校验、冲突检测和运行投影；状态协调函数在营销读取前处理到期和结束状态，不启动常驻任务。

**Tech Stack:** Node.js 原生 HTTP、Node SQLite、现有 `lib/pricing.js`、原生浏览器 JavaScript、HTML/CSS、Playwright API/UI 测试。

---

## File Map

- Modify: `lib/database.js`：增加 `0011_marketing_campaign_versions` 迁移并回填现有营销数据。
- Create: `lib/repositories/marketing-campaigns.js`：草稿、版本、校验、冲突、状态协调和运行投影。
- Modify: `lib/repositories/marketing.js`：组合活动时间窗口和协调后读取。
- Modify: `lib/pricing.js`：抽取组合折扣并与活动预览共享价格计算。
- Create: `lib/routes/admin-marketing-campaign-routes.js`：活动配置与动作 API。
- Modify: `lib/routes/marketing-routes.js`：读取前执行状态协调。
- Modify: `server.js`：注册新路由，移除旧直接启停接口。
- Create: `public/js/admin-marketing-campaigns.js`：列表、分段编辑器、预览与发布。
- Modify: `public/js/storefront-app.js`：把优惠页签交给独立模块。
- Modify: `socks-product-list.html`：营销抽屉、样式和脚本。
- Modify: `tests/api.spec.js`：迁移、版本、冲突、状态协调、投影和价格预览测试。
- Modify: `tests/socks-product-list.spec.js`：可视化编辑、冲突和发布 UI 测试。

## Execution Notes

- 依赖评论阶段建立的独立后台模块挂载方式，不依赖评论或工单业务数据。
- 金额仍使用现有商城元单位输入；API 校验后规范化为最多两位小数。
- 所有测试固定 `--workers=1`，不启动调度进程或后台智能体。

### Task 1: 活动与版本数据库迁移

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写迁移与回填失败测试**

```js
test("initializes campaign version storage and imports runtime marketing data", async () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
      AND name IN ('marketing_campaigns', 'marketing_campaign_versions') ORDER BY name
  `).all().map((row) => row.name);
  const runtimeCount = db.prepare(`
    SELECT (SELECT COUNT(*) FROM promotions) + (SELECT COUNT(*) FROM coupons) + (SELECT COUNT(*) FROM bundles) AS count
  `).get().count;
  const campaignCount = db.prepare("SELECT COUNT(*) AS count FROM marketing_campaigns").get().count;
  const versionCount = db.prepare("SELECT COUNT(*) AS count FROM marketing_campaign_versions").get().count;
  const bundleColumns = db.prepare("PRAGMA table_info(bundles)").all().map((column) => column.name);
  expect(tables).toEqual(["marketing_campaign_versions", "marketing_campaigns"]);
  expect(campaignCount).toBe(runtimeCount);
  expect(versionCount).toBe(runtimeCount);
  expect(bundleColumns).toEqual(expect.arrayContaining(["starts_at", "ends_at"]));
  expect(db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("0011_marketing_campaign_versions"))
    .toEqual({ id: "0011_marketing_campaign_versions" });
  db.close();
});
```

- [ ] **Step 2: 运行迁移测试确认红灯**

Run: `npm run test:api -- --grep "campaign version storage"`

Expected: FAIL，缺少活动表和 bundle 时间列。

- [ ] **Step 3: 创建活动表并回填运行数据**

在 `lib/database.js` 增加 `ensureMarketingCampaignVersionTables(db)`：

```js
function ensureMarketingCampaignVersionTables(db) {
  addColumnIfMissing(db, "bundles", "starts_at", "TEXT");
  addColumnIfMissing(db, "bundles", "ends_at", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      current_version INTEGER NOT NULL,
      published_version INTEGER,
      starts_at TEXT,
      ends_at TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(resource_type, resource_key),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS marketing_campaign_versions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(campaign_id, version),
      FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_marketing_campaign_state
      ON marketing_campaigns(status, starts_at, ends_at);
  `);
  importRuntimeCampaignRows(db, "promotion", "promotions", "id");
  importRuntimeCampaignRows(db, "coupon", "coupons", "code");
  importRuntimeCampaignRows(db, "bundle", "bundles", "id");
}
```

`importRuntimeCampaignRows` 逐行解析 `payload`，活动 ID 为 `${resourceType}-${resourceKey}`，名称优先 `titleZh`、其次 `title`、最后资源 key；每个历史运行项写入版本 1，`current_version` 与 `published_version` 均为 1。bundle 缺少时间时使用 `2026-01-01T00:00:00.000Z` 与 `2026-12-31T23:59:59.999Z`，并同步写回运行表。

加入迁移 `0011_marketing_campaign_versions`。

- [ ] **Step 4: 运行迁移测试确认转绿**

Run: `npm run test:api -- --grep "campaign version storage"`

Expected: PASS。

- [ ] **Step 5: 提交迁移**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add marketing campaign version schema"
```

### Task 2: 草稿仓储与乐观锁

**Files:**
- Create: `lib/repositories/marketing-campaigns.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写草稿创建和版本冲突失败测试**

```js
test("saves campaign drafts with optimistic versions", async () => {
  const { createCampaignDraft, saveCampaignDraft } = require("../lib/repositories/marketing-campaigns");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const created = createCampaignDraft(db, {
    admin: { id: null },
    body: {
      resourceType: "coupon", resourceKey: "WEEKEND10", name: "周末袜券",
      startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-31T23:59:59.999Z",
      rules: { type: "amount-off", discountAmount: 10, minimumSubtotal: 79, eligibleCategoryKeys: ["daily"] }
    }
  });
  const saved = saveCampaignDraft(db, created.campaign.id, {
    admin: { id: null }, body: { expectedVersion: 1, name: "周末袜券 V2", rules: created.campaign.rules }
  });
  const conflict = saveCampaignDraft(db, created.campaign.id, {
    admin: { id: null }, body: { expectedVersion: 1, name: "过期页面", rules: created.campaign.rules }
  });
  expect(saved.campaign.currentVersion).toBe(2);
  expect(conflict.validationError.code).toBe("MARKETING_VERSION_CONFLICT");
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "campaign drafts with optimistic versions"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现规范化、查询和草稿保存**

模块固定活动类型 `coupon / promotion / bundle` 和状态 `draft / scheduled / active / paused / ended`。实现：

```js
function normalizeCampaignInput(body) {
  return {
    resourceType: String(body.resourceType || "").trim(),
    resourceKey: String(body.resourceKey || "").trim(),
    name: String(body.name || "").trim(),
    startsAt: String(body.startsAt || "").trim(),
    endsAt: String(body.endsAt || "").trim(),
    rules: body.rules && typeof body.rules === "object" ? body.rules : {}
  };
}
```

`createCampaignDraft` 校验类型、唯一资源 key、名称和 ISO 时间，写入 campaign 版本 1。`saveCampaignDraft` 只允许 `draft` 或 `paused`，对比 `expectedVersion`，新建不可变版本并递增 `current_version`。实现并导出 `findCampaignById`、`listCampaigns`、`listCampaignVersions`。

- [ ] **Step 4: 运行草稿测试确认转绿**

Run: `npm run test:api -- --grep "campaign drafts with optimistic versions"`

Expected: PASS。

- [ ] **Step 5: 提交草稿仓储**

```powershell
git add lib/repositories/marketing-campaigns.js tests/api.spec.js
git commit -m "feat: add versioned marketing campaign drafts"
```

### Task 3: 规则校验与冲突检测

**Files:**
- Modify: `lib/repositories/marketing-campaigns.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写三类规则与冲突失败测试**

```js
test.each([
  {
    name: "coupon discount exceeds minimum",
    campaign: { resourceType: "coupon", resourceKey: "INVALID80", rules: { type: "amount-off", discountAmount: 80, minimumSubtotal: 79, eligibleCategoryKeys: ["daily"] } },
    field: "rules.discountAmount"
  },
  {
    name: "coupon code already exists",
    campaign: { resourceType: "coupon", resourceKey: "SOCK10", rules: { type: "amount-off", discountAmount: 10, minimumSubtotal: 79, eligibleCategoryKeys: ["daily"] } },
    field: "resourceKey"
  },
  {
    name: "threshold discount exceeds threshold",
    campaign: { resourceType: "promotion", resourceKey: "invalid-threshold", rules: { kind: "threshold", threshold: 10, discountAmount: 20, stackableWithCoupon: false } },
    field: "rules.discountAmount"
  },
  {
    name: "limited product does not exist",
    campaign: { resourceType: "promotion", resourceKey: "missing-product", rules: { kind: "limited-time-product", productId: "sock-missing", promotionalPrice: 10 } },
    field: "rules.productId"
  },
  {
    name: "limited price is not below product price",
    campaign: { resourceType: "promotion", resourceKey: "invalid-price", rules: { kind: "limited-time-product", productId: "sock-02", promotionalPrice: 999 } },
    field: "rules.promotionalPrice"
  },
  {
    name: "bundle default size is unavailable",
    campaign: { resourceType: "bundle", resourceKey: "invalid-size", rules: { productIds: ["sock-01", "sock-05"], defaultSizes: { "sock-01": "999", "sock-05": "43" }, discountAmount: 12 } },
    field: "rules.defaultSizes.sock-01"
  },
  {
    name: "bundle product does not exist",
    campaign: { resourceType: "bundle", resourceKey: "invalid-product", rules: { productIds: ["sock-01", "sock-missing"], defaultSizes: { "sock-01": "43", "sock-missing": "43" }, discountAmount: 12 } },
    field: "rules.productIds"
  },
  {
    name: "bundle discount exceeds item total",
    campaign: { resourceType: "bundle", resourceKey: "invalid-bundle-discount", rules: { productIds: ["sock-01", "sock-05"], defaultSizes: { "sock-01": "43", "sock-05": "43" }, discountAmount: 9999 } },
    field: "rules.discountAmount"
  }
])("rejects invalid campaign rules: $name", ({ campaign, field }) => {
  const { validateCampaignForPublish } = require("../lib/repositories/marketing-campaigns");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const result = validateCampaignForPublish(db, {
    id: `case-${campaign.resourceKey}`, name: campaign.resourceKey,
    startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-31T23:59:59.999Z",
    ...campaign
  });
  expect(result.validationError.code).toBe("MARKETING_CAMPAIGN_INVALID");
  expect(result.validationError.fields).toContain(field);
  db.close();
});

test("detects overlapping product promotion conflicts", async () => {
  const { validateCampaignForPublish } = require("../lib/repositories/marketing-campaigns");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const result = validateCampaignForPublish(db, {
    id: "promotion-conflict-test", resourceType: "promotion", resourceKey: "conflict-test",
    startsAt: "2026-06-01T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z",
    rules: { kind: "limited-time-product", productId: "sock-02", promotionalPrice: 40 }
  });
  expect(result.validationError.code).toBe("MARKETING_CAMPAIGN_CONFLICT");
  expect(result.validationError.conflicts).toEqual(expect.arrayContaining([
    expect.objectContaining({ resourceKey: "limited-sock-02" })
  ]));
  db.close();
});

test("detects bundle set conflicts but allows different coupon codes", () => {
  const { validateCampaignForPublish } = require("../lib/repositories/marketing-campaigns");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const bundle = validateCampaignForPublish(db, {
    id: "bundle-conflict-test", resourceType: "bundle", resourceKey: "same-products-reversed", name: "重复组合",
    startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-31T23:59:59.999Z",
    rules: { productIds: ["sock-05", "sock-01"], defaultSizes: { "sock-01": "43", "sock-05": "43" }, discountAmount: 10 }
  });
  const coupon = validateCampaignForPublish(db, {
    id: "coupon-no-conflict-test", resourceType: "coupon", resourceKey: "AUGUST12", name: "八月券",
    startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-31T23:59:59.999Z",
    rules: { type: "amount-off", discountAmount: 12, minimumSubtotal: 99, eligibleCategoryKeys: ["daily"] }
  });
  expect(bundle.validationError.code).toBe("MARKETING_CAMPAIGN_CONFLICT");
  expect(bundle.validationError.conflicts).toEqual(expect.arrayContaining([
    expect.objectContaining({ resourceKey: "daily-refresh-bundle" })
  ]));
  expect(coupon.validationError).toBeUndefined();
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "invalid campaign rules|promotion conflicts|bundle set conflicts"`

Expected: FAIL，校验函数不存在。

- [ ] **Step 3: 实现校验器**

实现 `validateCouponRules`、`validatePromotionRules`、`validateBundleRules`。统一错误为：

```js
{
  validationError: {
    statusCode: 400,
    code: "MARKETING_CAMPAIGN_INVALID",
    message: "Campaign rules are invalid.",
    fields: ["rules.discountAmount"]
  }
}
```

实现 `windowsOverlap`、`getPromotionScope` 和 `findCampaignConflicts`。促销冲突按 `kind + product scope` 判断；threshold scope 为 `all-products`，单品促销 scope 为对应 product ID。组合冲突使用排序后的 `productIds` 作为集合签名。优惠券只检查资源 key 唯一，不做时间冲突。

- [ ] **Step 4: 运行规则测试确认转绿**

Run: `npm run test:api -- --grep "campaign rules|promotion conflicts|bundle conflict"`

Expected: PASS。

- [ ] **Step 5: 提交校验器**

```powershell
git add lib/repositories/marketing-campaigns.js tests/api.spec.js
git commit -m "feat: validate marketing campaign conflicts"
```

### Task 4: 发布投影、状态动作与时间协调

**Files:**
- Modify: `lib/repositories/marketing-campaigns.js`
- Modify: `lib/repositories/marketing.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写原子发布与协调失败测试**

```js
test("publishes campaign versions into runtime marketing tables and reconciles time", async () => {
  const { publishCampaign, reconcileCampaignStates } = require("../lib/repositories/marketing-campaigns");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const campaign = db.prepare("SELECT id, current_version FROM marketing_campaigns WHERE resource_type = 'coupon' LIMIT 1").get();
  const published = publishCampaign(db, {
    admin: { id: null }, campaignId: campaign.id,
    body: { operationId: "op-campaign-publish", expectedVersion: campaign.current_version }
  });
  const runtime = db.prepare("SELECT status, payload FROM coupons WHERE code = ?").get(published.campaign.resourceKey);
  expect(JSON.parse(runtime.payload).title).toBe(published.campaign.name);
  const replay = publishCampaign(db, {
    admin: { id: null }, campaignId: campaign.id,
    body: { operationId: "op-campaign-publish", expectedVersion: campaign.current_version }
  });
  expect(replay.replayed).toBe(true);
  reconcileCampaignStates(db, new Date("2027-01-01T00:00:00.000Z"));
  expect(db.prepare("SELECT status FROM marketing_campaigns WHERE id = ?").get(campaign.id).status).toBe("ended");
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "publishes campaign versions"`

Expected: FAIL，发布函数不存在。

- [ ] **Step 3: 实现运行投影**

`projectCampaignToRuntime(db, campaign)` 按类型执行：

```js
const projection = {
  promotion: {
    sql: `INSERT INTO promotions (id, type, status, starts_at, ends_at, payload)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type,
      status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, payload = excluded.payload`
  },
  coupon: {
    sql: `INSERT INTO coupons (code, status, starts_at, ends_at, payload)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET status = excluded.status,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, payload = excluded.payload`
  },
  bundle: {
    sql: `INSERT INTO bundles (id, status, starts_at, ends_at, payload)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, payload = excluded.payload`
  }
};
```

发布事务先验证版本和冲突，再把状态设为未来开始时 `scheduled`、当前窗口 `active`，保存 `published_version` 并投影运行表。`pauseCampaign` 把 campaign 与运行表设为 `paused/inactive`；`resumeCampaign` 按当前时间恢复；`endCampaign` 设为 `ended/inactive`；`copyCampaign` 创建新草稿和版本 1。动作全部使用 `executeIdempotentAction`。

- [ ] **Step 4: 实现无常驻任务状态协调**

`reconcileCampaignStates(db, now)` 在事务中查询应切换的活动，执行 `scheduled → active` 和 `active → ended`，同步运行表并写入 `admin_action_events`，操作 ID 使用 `system-campaign-${campaign.id}-${targetStatus}-${ISO date}` 保证重复读取幂等。

修改 `listActiveMarketingCampaigns`、`findCouponByCode`、`findBundleById` 和 `listActiveBundles` 处理 bundle 时间窗口；路由层在营销读取前调用协调函数。

- [ ] **Step 5: 运行发布与现有价格回归测试**

Run: `npm run test:api -- --grep "publishes campaign versions|marketing campaigns|coupon|bundle"`

Expected: PASS，现有购物车优惠测试不回归。

- [ ] **Step 6: 提交发布投影**

```powershell
git add lib/repositories/marketing-campaigns.js lib/repositories/marketing.js tests/api.spec.js
git commit -m "feat: publish campaign versions to runtime pricing"
```

### Task 5: 价格预览与管理 API

**Files:**
- Modify: `lib/pricing.js`
- Modify: `lib/repositories/marketing-campaigns.js`
- Create: `lib/routes/admin-marketing-campaign-routes.js`
- Modify: `lib/routes/marketing-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写草稿、预览和发布 API 失败测试**

```js
test("creates previews and publishes marketing campaign drafts through admin APIs", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const created = await request.post("/api/admin/marketing/campaigns", {
    headers: { cookie },
    data: {
      resourceType: "coupon", resourceKey: "ADMIN20", name: "后台满减券",
      startsAt: "2026-07-01T00:00:00.000Z", endsAt: "2026-12-31T23:59:59.999Z",
      rules: { type: "amount-off", discountAmount: 20, minimumSubtotal: 149, eligibleCategoryKeys: ["crew"] }
    }
  });
  const campaign = (await created.json()).campaign;
  const preview = await request.post(`/api/admin/marketing/campaigns/${campaign.id}/preview`, {
    headers: { cookie }, data: { items: [{ productId: "sock-01", size: "39", quantity: 4 }] }
  });
  const previewPricing = (await preview.json()).pricing;
  expect(previewPricing).toEqual(expect.objectContaining({ subtotal: expect.any(Number), total: expect.any(Number) }));
  const published = await request.post(`/api/admin/marketing/campaigns/${campaign.id}/actions/publish`, {
    headers: { cookie }, data: { operationId: "op-publish-api-001", expectedVersion: 1 }
  });
  expect(published.ok()).toBe(true);
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 4 }
  });
  const cart = await request.post("/api/cart/coupon", { data: { code: "ADMIN20" } });
  const cartPricing = (await cart.json()).cart.pricing;
  expect(cartPricing).toMatchObject({
    subtotal: previewPricing.subtotal,
    itemTotal: previewPricing.itemTotal,
    orderDiscount: previewPricing.orderDiscount,
    couponDiscount: previewPricing.couponDiscount,
    total: previewPricing.total
  });
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "campaign drafts through admin APIs"`

Expected: FAIL，新路由 404。

- [ ] **Step 3: 实现价格预览服务**

先把 `server.js` 组合购买路由中直接修改 `pricing.total` 的代码抽到 `lib/pricing.js`：

```js
function applyBundleDiscount(pricing, bundle) {
  if (!bundle) return pricing;
  const bundleDiscount = Math.min(Number(bundle.discountAmount) || 0, pricing.total);
  return {
    ...pricing,
    bundleDiscount,
    total: Math.max(0, pricing.total - bundleDiscount),
    appliedPromotions: [
      ...pricing.appliedPromotions,
      { id: bundle.id, type: "bundle", title: bundle.titleZh || bundle.title, discount: bundleDiscount }
    ]
  };
}
```

购物车组合路由与活动预览都调用该函数，不再各自直接减价。在 `marketing-campaigns.js` 实现：

```js
const { createPricingSummary, applyBundleDiscount } = require("../pricing");
const { listProducts } = require("./products");
const { listActiveMarketingCampaigns } = require("./marketing");

function previewCampaignPricing(db, campaign, items) {
  const products = listProducts(db);
  const currentMarketing = listActiveMarketingCampaigns(db);
  const projected = mapCampaignToRuntime(campaign);
  const marketing = replacePreviewCampaign(currentMarketing, campaign.resourceType, projected);
  const cart = {
    items: items.map(({ productId, size, quantity }) => ({ productId, size, quantity })),
    couponCode: campaign.resourceType === "coupon" ? campaign.resourceKey : ""
  };
  const basePricing = createPricingSummary({ cart, products, marketing, shippingFee: 0 });
  const pricing = campaign.resourceType === "bundle"
    ? applyBundleDiscount(basePricing, projected)
    : basePricing;
  return { pricing, conflicts: findCampaignConflicts(db, campaign) };
}
```

`replacePreviewCampaign` 只在内存中移除相同 `resourceType/resourceKey` 的运行项并插入草稿投影，不写运行表。返回的 `pricing` 包含 `subtotal`、`itemTotal`、`productDiscount`、`orderDiscount`、`couponDiscount`、`bundleDiscount`、`total`、`thresholdProgress` 和 `appliedPromotions`。这样所有预览先经过真实 `createPricingSummary`，组合折扣也复用购物车的共享函数，不复制优惠算法。

- [ ] **Step 4: 创建管理路由**

注册：

```text
GET   /api/admin/marketing/campaigns
POST  /api/admin/marketing/campaigns
GET   /api/admin/marketing/campaigns/:id
PATCH /api/admin/marketing/campaigns/:id
POST  /api/admin/marketing/campaigns/:id/preview
POST  /api/admin/marketing/campaigns/:id/actions/publish
POST  /api/admin/marketing/campaigns/:id/actions/pause
POST  /api/admin/marketing/campaigns/:id/actions/resume
POST  /api/admin/marketing/campaigns/:id/actions/end
POST  /api/admin/marketing/campaigns/:id/actions/copy
```

删除旧 `/api/admin/marketing/:type/:id/status` 直接启停路径和前端依赖，避免绕过版本发布流。所有管理路由要求管理员。

- [ ] **Step 5: 运行管理 API 和公共营销回归**

Run: `npm run test:api -- --grep "marketing campaign|campaign drafts through admin APIs|cart coupon|bundle"`

Expected: PASS。

- [ ] **Step 6: 提交管理 API**

```powershell
git add lib/pricing.js lib/routes/admin-marketing-campaign-routes.js lib/routes/marketing-routes.js lib/repositories/marketing-campaigns.js server.js tests/api.spec.js
git commit -m "feat: expose marketing campaign editor APIs"
```

### Task 6: 优惠活动可视化编辑器

**Files:**
- Create: `public/js/admin-marketing-campaigns.js`
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写创建、预览、冲突和发布 UI 失败测试**

```js
test("creates previews and publishes a campaign from the visual editor", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='marketing']").click();
  await page.locator("[data-admin-campaign-new]").click();
  await page.locator("[data-campaign-type]").selectOption("coupon");
  await page.locator("[data-campaign-key]").fill("VISUAL10");
  await page.locator("[data-campaign-name]").fill("可视化袜券");
  await page.locator("[data-campaign-starts-at]").fill("2026-08-01T00:00");
  await page.locator("[data-campaign-ends-at]").fill("2026-09-01T00:00");
  await page.locator("[data-campaign-discount]").fill("10");
  await page.locator("[data-campaign-minimum]").fill("79");
  await page.locator("[data-campaign-save]").click();
  await page.locator("[data-campaign-preview]").click();
  await expect(page.locator("[data-campaign-price-preview]")).toContainText(/优惠|Total/);
  await page.locator("[data-campaign-publish]").click();
  await expect(page.locator("[data-admin-campaign-drawer]")).toContainText(/已排期|进行中|scheduled|active/);
});

test("keeps the campaign editor open and names a conflicting promotion", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='marketing']").click();
  await page.locator("[data-admin-campaign-new]").click();
  await page.locator("[data-campaign-type]").selectOption("promotion");
  await page.locator("[data-campaign-kind]").selectOption("limited-time-product");
  await page.locator("[data-campaign-key]").fill("visual-sock-02-overlap");
  await page.locator("[data-campaign-name]").fill("重叠训练价");
  await page.locator("[data-campaign-product-id]").selectOption("sock-02");
  await page.locator("[data-campaign-promotional-price]").fill("40");
  await page.locator("[data-campaign-starts-at]").fill("2026-08-01T00:00");
  await page.locator("[data-campaign-ends-at]").fill("2026-09-01T00:00");
  await page.locator("[data-campaign-save]").click();
  await page.locator("[data-campaign-publish]").click();
  await expect(page.locator("[data-admin-campaign-drawer]")).toBeVisible();
  await expect(page.locator("[data-campaign-conflict]")).toContainText("限时训练价");
  await expect(page.locator("[data-campaign-conflict]")).toContainText("limited-sock-02");
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "visual editor|campaign conflict"`

Expected: FAIL，新编辑器不存在。

- [ ] **Step 3: 增加营销抽屉与样式**

`data-admin-campaign-drawer` 使用现有 dialog 语义。内容分为五个 `fieldset`：基础信息、优惠规则、适用商品、排期、预览发布。桌面宽度 `min(720px, 100vw)`，规则表单与价格预览双列；`max-width: 640px` 时单列。

- [ ] **Step 4: 实现独立浏览器模块**

```js
window.StorefrontAdminMarketing = {
  mount({ panel, drawer, request, createOperationId, escapeHtml, formatCurrency }),
  render(),
  destroy()
};
```

模块状态包含 `campaigns`、`draft`、`mode`、`preview` 和 `conflicts`。列表支持类型、状态和搜索筛选；表单根据类型渲染对应规则字段；商品选择读取现有 `/api/admin/products` 和 SKU 详情；保存后更新 `expectedVersion`；发布、暂停、恢复、结束和复制均使用独立确认区与新 `operationId`。

收到 `MARKETING_VERSION_CONFLICT` 时重新加载服务器版本，并保留本地表单值供管理员比较，不自动覆盖。收到 `MARKETING_CAMPAIGN_CONFLICT` 时渲染冲突活动列表。

- [ ] **Step 5: 替换旧营销页签接入**

删除 `storefront-app.js` 中 `renderAdminMarketing` 的直接启停按钮和 `[data-admin-marketing-toggle]` 处理；`activeAdminTab === "marketing"` 时调用新模块 `render()`。

- [ ] **Step 6: 运行编辑器 UI 测试确认转绿**

Run: `npm run test:ui -- --grep "visual editor|campaign conflict"`

Expected: PASS。

- [ ] **Step 7: 增加无障碍与移动端测试**

```js
test("keeps the visual campaign editor accessible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='marketing']").click();
  const trigger = page.locator("[data-admin-campaign-new]");
  await trigger.click();
  const drawer = page.locator("[data-admin-campaign-drawer]");
  await expect(drawer.locator("[data-admin-campaign-title]")).toBeFocused();
  await expect(drawer.locator("fieldset > legend")).toHaveCount(5);
  await expect(drawer.locator("[data-campaign-error][aria-live='polite']")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
```

- [ ] **Step 8: 运行无障碍与移动端测试确认转绿**

Run: `npm run test:ui -- --grep "campaign editor accessible"`

Expected: PASS。

- [ ] **Step 9: 提交可视化编辑器**

```powershell
git add public/js/admin-marketing-campaigns.js public/js/storefront-app.js socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add visual marketing campaign editor"
```

### Task 7: 营销配置全量回归与清理

**Files:**
- Verify: all modified marketing files

- [ ] **Step 1: 运行完整 API 套件**

Run: `npm run test:api`

Expected: 0 failed。

- [ ] **Step 2: 运行完整 UI 套件**

Run: `npm run test:ui`

Expected: 0 failed，保持单 worker。

- [ ] **Step 3: 运行关键价格一致性回归**

```powershell
npm run test:api -- --grep "pricing|coupon|promotion|bundle|campaign preview"
```

Expected: 价格预览、购物车和结算优惠结果一致。

- [ ] **Step 4: 检查格式与编码**

```powershell
git diff --check
rg -n "\\u[0-9a-fA-F]{4}" lib public/js socks-product-list.html tests
```

Expected: 无空白错误，无新增中文转义。

- [ ] **Step 5: 清理测试产物并检查工作区**

只恢复测试明确修改的 fixture，只删除本轮生成的具体上传文件。运行 `git status --short`，确认工作区只包含预期提交。

- [ ] **Step 6: 推送当前分支**

```powershell
git push origin feature/socks-after-sales-payment-admin
```

Expected: 三个阶段全部更新到现有 PR。

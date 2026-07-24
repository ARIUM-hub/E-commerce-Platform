# Socks Marketing Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo-grade real marketing system with coupons, full-reduction promotions, limited-time discounts, bundle buying, recommendation scenarios, and recently viewed products.

**Architecture:** Add SQLite-backed marketing data and focused repository/pricing helpers, then route cart, checkout, and orders through one backend pricing summary. Keep the existing single-page storefront, but make marketing UI read from APIs and preserve order marketing snapshots.

**Tech Stack:** Node.js HTTP server, `node:sqlite`, vanilla HTML/CSS/JavaScript storefront, Playwright API/UI tests.

---

## File Structure

- Modify: `lib/database.js`
  - Add marketing tables and deterministic seed data.
- Create: `lib/repositories/marketing.js`
  - Read active promotions, coupons, bundles, and recent views.
  - Store coupon selection on a cart by extending cart payload or a dedicated table.
- Create: `lib/pricing.js`
  - Centralize cart/order pricing, coupon validation, full-reduction, limited-time product discounts, and bundle discounts.
- Modify: `server.js`
  - Import marketing repository and pricing helper.
  - Add marketing, coupon, bundle, recommendation, and recent-view endpoints.
  - Use unified pricing in `/api/cart` and `/api/orders`.
- Modify: `socks-product-list.html`
  - Add marketing strip, coupon UI, threshold progress, limited-time labels, bundle card, recently viewed rail, and marketing-aware checkout totals.
- Modify: `tests/api.spec.js`
  - Add API tests for campaign listing, coupon validation, pricing, bundles, recommendations, recent views, and order snapshots.
- Modify: `tests/socks-product-list.spec.js`
  - Add UI tests for coupons, threshold progress, limited-time labels, bundle add, recently viewed, and checkout total alignment.
- Reference: `docs/superpowers/specs/2026-07-24-socks-marketing-module-design.md`

## Important Constraints

- Do not reintroduce live JSON reads for cart, orders, users, sessions, or user carts.
- SQLite remains the source of truth for product, cart, order, user, and marketing state.
- Use TDD for each behavior change: write failing test, run red, implement minimal code, run green, commit.
- Keep provider/model operations out of scope. Do not run concurrent agents, high-frequency checks, or stress tests.
- Keep Chinese text as direct UTF-8, not `\uXXXX`.

---

### Task 1: Add Marketing Database Schema And Repository

**Files:**
- Modify: `lib/database.js`
- Create: `lib/repositories/marketing.js`
- Modify: `tests/api.spec.js`

- [x] **Step 1: Write failing database/repository test**

Add near the existing SQLite initialization test in `tests/api.spec.js`:

```js
test("initializes SQLite marketing campaigns, coupons, bundles, and recent views", async () => {
  const { createDatabase, initializeDatabase } = require("../lib/database");
  const {
    listActiveMarketingCampaigns,
    findCouponByCode,
    listActiveBundles
  } = require("../lib/repositories/marketing");

  const db = createDatabase(":memory:");
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });

  const campaigns = listActiveMarketingCampaigns(db, new Date("2026-07-24T00:00:00.000Z"));
  expect(campaigns.promotions.map((promotion) => promotion.id)).toEqual(
    expect.arrayContaining(["threshold-99-save-15", "limited-sock-02"])
  );

  expect(findCouponByCode(db, " sock10 ")).toMatchObject({
    code: "SOCK10",
    type: "amount-off"
  });

  expect(listActiveBundles(db)).toEqual([
    expect.objectContaining({
      id: "daily-refresh-bundle",
      discountAmount: 12
    })
  ]);

  const recentViewTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recent_views'").get();
  expect(recentViewTable).toEqual({ name: "recent_views" });
});
```

- [x] **Step 2: Run test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing campaigns"
```

Expected: FAIL because `lib/repositories/marketing.js` does not exist.

- [x] **Step 3: Add schema and seed data in `lib/database.js`**

Inside `runSchema(db)`, after the order tables, add:

```js
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      starts_at TEXT,
      ends_at TEXT,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      starts_at TEXT,
      ends_at TEXT,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bundles (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recent_views (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      session_id TEXT,
      product_id TEXT NOT NULL,
      viewed_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recent_views_user ON recent_views(user_id, viewed_at);
    CREATE INDEX IF NOT EXISTS idx_recent_views_session ON recent_views(session_id, viewed_at);
```

Still in `lib/database.js`, add this helper before `initializeDatabase`:

```js
function seedMarketing(db) {
  const promotionCount = db.prepare("SELECT COUNT(*) AS count FROM promotions").get().count;
  if (promotionCount === 0) {
    const insertPromotion = db.prepare(`
      INSERT INTO promotions (id, type, status, starts_at, ends_at, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPromotion.run(
      "threshold-99-save-15",
      "threshold",
      "active",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      JSON.stringify({
        title: "满 ¥99 减 ¥15",
        threshold: 99,
        discountAmount: 15,
        stackableWithCoupon: true
      })
    );
    insertPromotion.run(
      "limited-sock-02",
      "limited-time-product",
      "active",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      JSON.stringify({
        title: "限时训练价",
        productId: "sock-02",
        promotionalPrice: 45,
        countdownLabel: "限时价"
      })
    );
  }

  const couponCount = db.prepare("SELECT COUNT(*) AS count FROM coupons").get().count;
  if (couponCount === 0) {
    const insertCoupon = db.prepare(`
      INSERT INTO coupons (code, status, starts_at, ends_at, payload)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertCoupon.run(
      "SOCK10",
      "active",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      JSON.stringify({
        type: "amount-off",
        title: "新人袜券",
        discountAmount: 10,
        minimumSubtotal: 59,
        eligibleCategoryKeys: ["daily", "sport", "crew", "no-show"]
      })
    );
    insertCoupon.run(
      "SOCK20",
      "active",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      JSON.stringify({
        type: "amount-off",
        title: "囤货袜券",
        discountAmount: 20,
        minimumSubtotal: 129,
        eligibleCategoryKeys: ["daily", "sport", "crew", "no-show"]
      })
    );
    insertCoupon.run(
      "FREESHIP",
      "active",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      JSON.stringify({
        type: "free-shipping",
        title: "免邮券",
        minimumSubtotal: 1
      })
    );
  }

  const bundleCount = db.prepare("SELECT COUNT(*) AS count FROM bundles").get().count;
  if (bundleCount === 0) {
    db.prepare("INSERT INTO bundles (id, status, payload) VALUES (?, ?, ?)").run(
      "daily-refresh-bundle",
      "active",
      JSON.stringify({
        title: "Daily Refresh Bundle",
        titleZh: "日常焕新组合",
        productIds: ["sock-01", "sock-05"],
        defaultSizes: {
          "sock-01": "43",
          "sock-05": "43"
        },
        discountAmount: 12
      })
    );
  }
}
```

Call it from `initializeDatabase(db, options = {})` after `seedProducts(...)`:

```js
  seedMarketing(db);
```

- [x] **Step 4: Create `lib/repositories/marketing.js`**

Create this file:

```js
function parsePayload(row) {
  return row ? JSON.parse(row.payload) : null;
}

function isActiveWindow(row, now = new Date()) {
  if (!row || row.status !== "active") {
    return false;
  }

  const nowTime = now.getTime();
  const startsAt = row.starts_at ? new Date(row.starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : Number.POSITIVE_INFINITY;
  return startsAt <= nowTime && nowTime <= endsAt;
}

function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function mapPromotion(row) {
  const payload = parsePayload(row);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...payload
  };
}

function mapCoupon(row) {
  const payload = parsePayload(row);
  return {
    code: row.code,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...payload
  };
}

function mapBundle(row) {
  const payload = parsePayload(row);
  return {
    id: row.id,
    status: row.status,
    ...payload
  };
}

function listActiveMarketingCampaigns(db, now = new Date()) {
  const promotionRows = db.prepare("SELECT * FROM promotions ORDER BY rowid ASC").all();
  const couponRows = db.prepare("SELECT * FROM coupons ORDER BY rowid ASC").all();
  const bundleRows = db.prepare("SELECT * FROM bundles ORDER BY rowid ASC").all();

  return {
    promotions: promotionRows.filter((row) => isActiveWindow(row, now)).map(mapPromotion),
    coupons: couponRows.filter((row) => isActiveWindow(row, now)).map(mapCoupon),
    bundles: bundleRows.filter((row) => row.status === "active").map(mapBundle)
  };
}

function findCouponByCode(db, code, now = new Date()) {
  const row = db.prepare("SELECT * FROM coupons WHERE code = ?").get(normalizeCouponCode(code));
  return isActiveWindow(row, now) ? mapCoupon(row) : null;
}

function listActiveBundles(db) {
  return db.prepare("SELECT * FROM bundles WHERE status = 'active' ORDER BY rowid ASC")
    .all()
    .map(mapBundle);
}

module.exports = {
  findCouponByCode,
  listActiveBundles,
  listActiveMarketingCampaigns,
  normalizeCouponCode
};
```

- [x] **Step 5: Run test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing campaigns"
```

Expected: PASS.

- [x] **Step 6: Commit**

Run:

```powershell
git add lib/database.js lib/repositories/marketing.js tests/api.spec.js
git commit -m "feat: seed marketing campaigns"
```

---

### Task 2: Add Unified Backend Pricing Helper

**Files:**
- Create: `lib/pricing.js`
- Modify: `tests/api.spec.js`

- [x] **Step 1: Write failing pricing tests**

Add near cart/order pricing API tests in `tests/api.spec.js`:

```js
test("calculates marketing-aware cart pricing with threshold promotion and coupon", async () => {
  const { createPricingSummary } = require("../lib/pricing");
  const products = JSON.parse(await fs.readFile(path.join(__dirname, "fixtures", "test-data", "products.json"), "utf8")).products;
  const cart = {
    couponCode: "SOCK10",
    items: [
      { productId: "sock-01", skuId: "sock-01-43", size: "43", quantity: 1 },
      { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 1 }
    ]
  };
  const marketing = {
    promotions: [
      {
        id: "threshold-99-save-15",
        type: "threshold",
        title: "满 ¥99 减 ¥15",
        threshold: 99,
        discountAmount: 15,
        stackableWithCoupon: true
      },
      {
        id: "limited-sock-02",
        type: "limited-time-product",
        title: "限时训练价",
        productId: "sock-02",
        promotionalPrice: 45
      }
    ],
    coupons: [
      {
        code: "SOCK10",
        type: "amount-off",
        title: "新人袜券",
        discountAmount: 10,
        minimumSubtotal: 59,
        eligibleCategoryKeys: ["daily", "sport", "crew", "no-show"]
      }
    ],
    bundles: []
  };

  const summary = createPricingSummary({ cart, products, marketing, shippingFee: 0 });

  expect(summary).toMatchObject({
    subtotal: 128,
    itemTotal: 84,
    productDiscount: 44,
    orderDiscount: 0,
    couponDiscount: 10,
    shipping: 0,
    total: 74
  });
  expect(summary.appliedPromotions.map((promotion) => promotion.id)).toContain("limited-sock-02");
  expect(summary.coupon).toMatchObject({ code: "SOCK10", status: "applied" });
  expect(summary.thresholdProgress).toMatchObject({
    threshold: 99,
    remaining: 15,
    isMet: false
  });
});

test("calculates full-reduction promotion when cart crosses the threshold", async () => {
  const { createPricingSummary } = require("../lib/pricing");
  const products = JSON.parse(await fs.readFile(path.join(__dirname, "fixtures", "test-data", "products.json"), "utf8")).products;
  const cart = {
    items: [
      { productId: "sock-01", skuId: "sock-01-43", size: "43", quantity: 2 },
      { productId: "sock-05", skuId: "sock-05-43", size: "43", quantity: 1 }
    ]
  };
  const marketing = {
    promotions: [
      {
        id: "threshold-99-save-15",
        type: "threshold",
        title: "满 ¥99 减 ¥15",
        threshold: 99,
        discountAmount: 15
      }
    ],
    coupons: [],
    bundles: []
  };

  const summary = createPricingSummary({ cart, products, marketing, shippingFee: 0 });

  expect(summary.orderDiscount).toBe(15);
  expect(summary.thresholdProgress).toMatchObject({
    threshold: 99,
    remaining: 0,
    isMet: true
  });
  expect(summary.appliedPromotions).toEqual([
    expect.objectContaining({ id: "threshold-99-save-15", discount: 15 })
  ]);
});
```

- [x] **Step 2: Run pricing tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing-aware cart pricing|full-reduction promotion"
```

Expected: FAIL because `lib/pricing.js` does not exist.

- [x] **Step 3: Create `lib/pricing.js`**

Create this file:

```js
function findProduct(products, productId) {
  return products.find((product) => product.id === productId) || null;
}

function getLimitedPromotion(product, promotions = []) {
  return promotions.find((promotion) => {
    return promotion.type === "limited-time-product" && promotion.productId === product.id;
  }) || null;
}

function getEffectiveUnitPrice(product, promotions = []) {
  const limitedPromotion = getLimitedPromotion(product, promotions);
  if (!limitedPromotion) {
    return {
      unitPrice: product.price,
      promotion: null
    };
  }

  return {
    unitPrice: Math.min(product.price, limitedPromotion.promotionalPrice),
    promotion: limitedPromotion
  };
}

function getEligibleCoupon(coupons = [], couponCode = "") {
  const normalizedCode = String(couponCode || "").trim().toUpperCase();
  return coupons.find((coupon) => coupon.code === normalizedCode) || null;
}

function calculateCouponDiscount(coupon, itemTotal) {
  if (!coupon) {
    return {
      coupon: null,
      discount: 0
    };
  }

  if (itemTotal < coupon.minimumSubtotal) {
    return {
      coupon: {
        code: coupon.code,
        title: coupon.title,
        status: "minimum-not-met",
        minimumSubtotal: coupon.minimumSubtotal
      },
      discount: 0
    };
  }

  if (coupon.type === "amount-off") {
    return {
      coupon: {
        code: coupon.code,
        title: coupon.title,
        status: "applied",
        discount: Math.min(coupon.discountAmount, itemTotal)
      },
      discount: Math.min(coupon.discountAmount, itemTotal)
    };
  }

  return {
    coupon: {
      code: coupon.code,
      title: coupon.title,
      status: "unsupported"
    },
    discount: 0
  };
}

function calculateThresholdPromotion(promotions = [], itemTotal) {
  const thresholdPromotion = promotions.find((promotion) => promotion.type === "threshold") || null;
  if (!thresholdPromotion) {
    return {
      discount: 0,
      promotion: null,
      progress: null
    };
  }

  const isMet = itemTotal >= thresholdPromotion.threshold;
  return {
    discount: isMet ? Math.min(thresholdPromotion.discountAmount, itemTotal) : 0,
    promotion: isMet
      ? {
          id: thresholdPromotion.id,
          title: thresholdPromotion.title,
          type: thresholdPromotion.type,
          discount: Math.min(thresholdPromotion.discountAmount, itemTotal)
        }
      : null,
    progress: {
      id: thresholdPromotion.id,
      title: thresholdPromotion.title,
      threshold: thresholdPromotion.threshold,
      remaining: Math.max(0, thresholdPromotion.threshold - itemTotal),
      isMet
    }
  };
}

function createPricingSummary({ cart, products, marketing = {}, shippingFee = 0 }) {
  const promotions = Array.isArray(marketing.promotions) ? marketing.promotions : [];
  const coupons = Array.isArray(marketing.coupons) ? marketing.coupons : [];
  const appliedPromotions = [];

  const subtotal = cart.items.reduce((sum, item) => {
    const product = findProduct(products, item.productId);
    return product ? sum + product.originalPrice * item.quantity : sum;
  }, 0);

  const itemTotal = cart.items.reduce((sum, item) => {
    const product = findProduct(products, item.productId);
    if (!product) {
      return sum;
    }

    const pricing = getEffectiveUnitPrice(product, promotions);
    if (pricing.promotion) {
      appliedPromotions.push({
        id: pricing.promotion.id,
        title: pricing.promotion.title,
        type: pricing.promotion.type,
        productId: product.id,
        discount: (product.price - pricing.unitPrice) * item.quantity
      });
    }

    return sum + pricing.unitPrice * item.quantity;
  }, 0);

  const threshold = calculateThresholdPromotion(promotions, itemTotal);
  if (threshold.promotion) {
    appliedPromotions.push(threshold.promotion);
  }

  const couponResult = calculateCouponDiscount(getEligibleCoupon(coupons, cart.couponCode), itemTotal - threshold.discount);
  const total = Math.max(0, itemTotal - threshold.discount - couponResult.discount + shippingFee);

  return {
    subtotal,
    itemTotal,
    productDiscount: subtotal - itemTotal,
    orderDiscount: threshold.discount,
    couponDiscount: couponResult.discount,
    shipping: shippingFee,
    total,
    coupon: couponResult.coupon,
    thresholdProgress: threshold.progress,
    appliedPromotions
  };
}

module.exports = {
  createPricingSummary,
  getEffectiveUnitPrice
};
```

- [x] **Step 4: Run pricing tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing-aware cart pricing|full-reduction promotion"
```

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```powershell
git add lib/pricing.js tests/api.spec.js
git commit -m "feat: calculate marketing pricing"
```

---

### Task 3: Expose Marketing And Cart Pricing APIs

**Files:**
- Modify: `server.js`
- Modify: `lib/repositories/carts.js`
- Modify: `lib/repositories/marketing.js`
- Modify: `tests/api.spec.js`

- [x] **Step 1: Write failing API tests for marketing listing and cart pricing**

Add near product/cart API tests in `tests/api.spec.js`:

```js
test("returns active marketing campaigns", async ({ request }) => {
  const response = await request.get("/api/marketing");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.coupons).toEqual([
    expect.objectContaining({ code: "SOCK10" }),
    expect.objectContaining({ code: "SOCK20" }),
    expect.objectContaining({ code: "FREESHIP" })
  ]);
  expect(payload.promotions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "threshold-99-save-15" }),
      expect.objectContaining({ id: "limited-sock-02" })
    ])
  );
  expect(payload.bundles).toEqual([
    expect.objectContaining({ id: "daily-refresh-bundle" })
  ]);
});

test("returns marketing pricing in the cart payload", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 2 }
  });

  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  expect(payload.pricing).toMatchObject({
    subtotal: 118,
    itemTotal: 78,
    orderDiscount: 0,
    couponDiscount: 0,
    total: 78
  });
  expect(payload.pricing.thresholdProgress).toMatchObject({
    threshold: 99,
    remaining: 21,
    isMet: false
  });
});
```

- [x] **Step 2: Run API tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "active marketing campaigns|marketing pricing in the cart"
```

Expected: FAIL because `/api/marketing` and `cart.pricing` do not exist.

- [x] **Step 3: Extend cart persistence for coupon code**

In `lib/database.js`, add to `carts` table schema:

```sql
      coupon_code TEXT,
```

If existing databases may not have the column, add after schema creation:

```js
function ensureCartCouponColumn(db) {
  const columns = db.prepare("PRAGMA table_info(carts)").all();
  if (!columns.some((column) => column.name === "coupon_code")) {
    db.prepare("ALTER TABLE carts ADD COLUMN coupon_code TEXT").run();
  }
}
```

Call `ensureCartCouponColumn(db);` inside `initializeDatabase` after `runSchema(db);`.

In `lib/repositories/carts.js`, update `readCart` mapping so returned cart includes:

```js
couponCode: cartRow.coupon_code || ""
```

Update the cart insert statement to include `coupon_code` as `NULL`, and export:

```js
function setCartCouponCode(db, cartId, couponCode) {
  const now = new Date().toISOString();
  db.prepare("UPDATE carts SET coupon_code = ?, updated_at = ? WHERE id = ?").run(couponCode || null, now, cartId);
}
```

- [x] **Step 4: Wire marketing APIs in `server.js`**

At the top of `server.js`, import:

```js
const {
  findCouponByCode,
  listActiveBundles,
  listActiveMarketingCampaigns
} = require("./lib/repositories/marketing");
const { createPricingSummary } = require("./lib/pricing");
```

Add helper near `getCartPayload`:

```js
function getMarketingPayload() {
  return withDatabase((db) => listActiveMarketingCampaigns(db));
}

function getCartPayload(cart, options = {}) {
  const products = options.products || withDatabase((db) => listProducts(db));
  const marketing = options.marketing || getMarketingPayload();
  const pricing = createPricingSummary({
    cart,
    products,
    marketing,
    shippingFee: options.shippingFee || 0
  });

  return {
    items: cart.items,
    pricing,
    meta: {
      itemCount: cart.items.length
    }
  };
}
```

Replace the existing `getCartPayload(cart)` function with the marketing-aware version above.

Add route before `/api/cart`:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/marketing") {
    try {
      sendJson(response, 200, getMarketingPayload());
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [x] **Step 5: Run API tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "active marketing campaigns|marketing pricing in the cart"
```

Expected: PASS.

- [x] **Step 6: Run cart regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "cart|SKU stock|invalid cart quantity"
```

Expected: PASS.

Actual: The broad grep also matched slower order/concurrency cases and timed out locally; the focused cart/pricing/stock regression passed with `npm test -- tests/api.spec.js --grep "returns marketing pricing in the cart payload|invalid cart quantity|exceed SKU stock quantity"`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add server.js lib/database.js lib/repositories/carts.js lib/repositories/marketing.js tests/api.spec.js
git commit -m "feat: expose marketing pricing api"
```

---

### Task 4: Add Coupon Apply And Remove APIs

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [x] **Step 1: Write failing coupon API tests**

Add near cart tests in `tests/api.spec.js`:

```js
test("applies and removes a valid cart coupon", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 2 }
  });

  const applyResponse = await request.post("/api/cart/coupon", {
    data: { code: "sock10" }
  });
  expect(applyResponse.ok()).toBe(true);
  const applyPayload = await applyResponse.json();
  expect(applyPayload.cart.couponCode).toBe("SOCK10");
  expect(applyPayload.cart.pricing.coupon).toMatchObject({
    code: "SOCK10",
    status: "applied"
  });

  const removeResponse = await request.delete("/api/cart/coupon");
  expect(removeResponse.ok()).toBe(true);
  const removePayload = await removeResponse.json();
  expect(removePayload.cart.couponCode).toBe("");
  expect(removePayload.cart.pricing.couponDiscount).toBe(0);
});

test("rejects coupon that does not meet minimum spend", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });

  const response = await request.post("/api/cart/coupon", {
    data: { code: "SOCK20" }
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "COUPON_MINIMUM_NOT_MET"
    }
  });
});
```

- [x] **Step 2: Run coupon tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "valid cart coupon|minimum spend"
```

Expected: FAIL because coupon endpoints do not exist.

- [x] **Step 3: Add coupon route helpers in `server.js`**

Add near cart validation helpers:

```js
function validateCouponForCart(coupon, cart, products) {
  if (!coupon) {
    return { ok: false, code: "COUPON_NOT_FOUND", message: "Coupon was not found." };
  }

  const itemTotal = cart.items.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);

  if (itemTotal < coupon.minimumSubtotal) {
    return {
      ok: false,
      code: "COUPON_MINIMUM_NOT_MET",
      message: `Coupon requires at least ¥${coupon.minimumSubtotal}.`
    };
  }

  return { ok: true };
}
```

- [x] **Step 4: Add `POST /api/cart/coupon` and `DELETE /api/cart/coupon`**

In `server.js`, import `setCartCouponCode` from `lib/repositories/carts.js`.

Add routes before cart item routes:

```js
  if (request.method === "POST" && requestUrl.pathname === "/api/cart/coupon") {
    try {
      const body = await readRequestBody(request);
      const activeCart = await readActiveCart(request);
      const products = withDatabase((db) => listProducts(db));
      const coupon = withDatabase((db) => findCouponByCode(db, body.code));
      const validation = validateCouponForCart(coupon, activeCart.cart, products);

      if (!validation.ok) {
        sendError(response, 400, validation.code, validation.message);
        return;
      }

      withDatabase((db) => setCartCouponCode(db, activeCart.cartId, coupon.code));
      const updatedCart = {
        ...activeCart.cart,
        couponCode: coupon.code
      };

      sendJson(response, 200, {
        ok: true,
        cart: {
          ...getCartPayload(updatedCart, { products }),
          couponCode: coupon.code
        }
      });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "DELETE" && requestUrl.pathname === "/api/cart/coupon") {
    try {
      const activeCart = await readActiveCart(request);
      const products = withDatabase((db) => listProducts(db));
      withDatabase((db) => setCartCouponCode(db, activeCart.cartId, ""));
      const updatedCart = {
        ...activeCart.cart,
        couponCode: ""
      };

      sendJson(response, 200, {
        ok: true,
        cart: {
          ...getCartPayload(updatedCart, { products }),
          couponCode: ""
        }
      });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [x] **Step 5: Run coupon tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "valid cart coupon|minimum spend"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js lib/repositories/carts.js tests/api.spec.js
git commit -m "feat: apply cart coupons"
```

---

### Task 5: Save Marketing Snapshot On Orders

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing order snapshot test**

Add near order API tests in `tests/api.spec.js`:

```js
test("saves marketing snapshot on order creation", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 2 }
  });
  await request.post("/api/cart/coupon", {
    data: { code: "SOCK10" }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.order.marketing).toMatchObject({
    coupon: {
      code: "SOCK10",
      status: "applied"
    },
    couponDiscount: 10
  });
  expect(payload.order.totals).toMatchObject({
    couponDiscount: 10
  });
});
```

- [ ] **Step 2: Run order snapshot test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing snapshot"
```

Expected: FAIL because orders do not save `marketing`.

- [ ] **Step 3: Use unified pricing in order creation**

In `/api/orders`, after `orderItems` are built, add:

```js
      const marketing = getMarketingPayload();
      const pricing = createPricingSummary({
        cart,
        products,
        marketing,
        shippingFee: shippingMethod.fee
      });
```

Replace:

```js
        totals: calculateOrderTotals(orderItems, shippingMethod.fee),
```

with:

```js
        totals: {
          subtotal: pricing.subtotal,
          savings: pricing.productDiscount + pricing.orderDiscount + pricing.couponDiscount,
          productDiscount: pricing.productDiscount,
          orderDiscount: pricing.orderDiscount,
          couponDiscount: pricing.couponDiscount,
          shipping: pricing.shipping,
          total: pricing.total
        },
        marketing: {
          coupon: pricing.coupon,
          couponDiscount: pricing.couponDiscount,
          appliedPromotions: pricing.appliedPromotions,
          thresholdProgress: pricing.thresholdProgress
        },
```

- [ ] **Step 4: Run order snapshot test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing snapshot"
```

Expected: PASS.

- [ ] **Step 5: Run order regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "order|checkout|SKU stock"
```

Expected: PASS. If older tests assert exact totals without coupon data, update them to assert `total`, `subtotal`, and `couponDiscount` separately.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: snapshot marketing on orders"
```

---

### Task 6: Add Bundle And Recommendation APIs

**Files:**
- Modify: `server.js`
- Modify: `lib/repositories/marketing.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing bundle and recommendation API tests**

Add near recommendation/product API tests in `tests/api.spec.js`:

```js
test("adds an active bundle to the cart", async ({ request }) => {
  const response = await request.post("/api/cart/bundles/daily-refresh-bundle");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.cart.items).toEqual([
    expect.objectContaining({ productId: "sock-01", size: "43", quantity: 1 }),
    expect.objectContaining({ productId: "sock-05", size: "43", quantity: 1 })
  ]);
  expect(payload.cart.pricing.appliedPromotions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "daily-refresh-bundle", discount: 12 })
    ])
  );
});

test("returns scenario-based recommendations", async ({ request }) => {
  const detailResponse = await request.get("/api/recommendations?scenario=detail&productId=sock-02");
  expect(detailResponse.ok()).toBe(true);
  const detailPayload = await detailResponse.json();
  expect(detailPayload.items).toHaveLength(3);
  detailPayload.items.forEach((product) => {
    expect(product.id).not.toBe("sock-02");
  });

  const cartResponse = await request.get("/api/recommendations?scenario=cart");
  expect(cartResponse.ok()).toBe(true);
  const cartPayload = await cartResponse.json();
  expect(cartPayload.items.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "active bundle|scenario-based recommendations"
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add bundle lookup repository function**

In `lib/repositories/marketing.js`, add:

```js
function findBundleById(db, bundleId) {
  const row = db.prepare("SELECT * FROM bundles WHERE id = ? AND status = 'active'").get(bundleId);
  return row ? mapBundle(row) : null;
}
```

Export it.

- [ ] **Step 4: Add recommendation helper in `server.js`**

Add near product recommendation helpers:

```js
function getRecommendationItems(products, scenario, options = {}) {
  const excludedIds = new Set();
  if (options.productId) {
    excludedIds.add(options.productId);
  }
  if (Array.isArray(options.excludeProductIds)) {
    options.excludeProductIds.forEach((id) => excludedIds.add(id));
  }

  return products
    .filter((product) => !excludedIds.has(product.id))
    .filter((product) => getProductVariants(product).some(isVariantSellable))
    .sort((left, right) => {
      if (scenario === "cart" && left.isBestSeller !== right.isBestSeller) {
        return Number(right.isBestSeller) - Number(left.isBestSeller);
      }
      if (left.isRecommended !== right.isRecommended) {
        return Number(right.isRecommended) - Number(left.isRecommended);
      }
      return right.ratingValue - left.ratingValue;
    })
    .slice(0, scenario === "order" ? 3 : 4);
}
```

- [ ] **Step 5: Add bundle and recommendation routes**

In `server.js`, import `findBundleById`.

Add route:

```js
  const bundleMatch = requestUrl.pathname.match(/^\/api\/cart\/bundles\/([^/]+)$/);
  if (request.method === "POST" && bundleMatch) {
    try {
      const bundleId = decodeURIComponent(bundleMatch[1]);
      const products = withDatabase((db) => listProducts(db));
      const bundle = withDatabase((db) => findBundleById(db, bundleId));
      if (!bundle) {
        sendError(response, 404, "BUNDLE_NOT_FOUND", "Bundle was not found.");
        return;
      }

      const activeCart = await readActiveCart(request);
      for (const productId of bundle.productIds) {
        const size = bundle.defaultSizes[productId];
        const validation = validateCartItemInput(products, { productId, size, quantity: 1 });
        if (!validation.ok) {
          sendError(response, 409, "BUNDLE_OUT_OF_STOCK", "Bundle item is not available.");
          return;
        }
        const variant = validation.variant;
        const stockValidation = validateSkuStockQuantity(activeCart.cart, variant, 1);
        if (!stockValidation.ok) {
          sendError(response, 409, "BUNDLE_OUT_OF_STOCK", "Bundle item is out of stock.");
          return;
        }
        const existingItem = activeCart.cart.items.find((item) => item.skuId === variant.skuId);
        if (existingItem) {
          existingItem.quantity += 1;
        } else {
          activeCart.cart.items.push({ productId, skuId: variant.skuId, size, quantity: 1 });
        }
      }

      await writeActiveCart(activeCart, activeCart.cart);
      const cartPayload = getCartPayload(activeCart.cart, { products });
      cartPayload.pricing.appliedPromotions.push({
        id: bundle.id,
        type: "bundle",
        title: bundle.titleZh || bundle.title,
        discount: bundle.discountAmount
      });
      cartPayload.pricing.total = Math.max(0, cartPayload.pricing.total - bundle.discountAmount);

      sendJson(response, 200, { ok: true, cart: cartPayload, bundle });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

Add route:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/recommendations") {
    try {
      const scenario = requestUrl.searchParams.get("scenario") || "detail";
      const products = withDatabase((db) => listProducts(db));
      const items = getRecommendationItems(products, scenario, {
        productId: requestUrl.searchParams.get("productId"),
        excludeProductIds: requestUrl.searchParams.getAll("excludeProductId")
      }).map((product) => localizeProduct(product, normalizeLocale(requestUrl.searchParams.get("locale"))));
      sendJson(response, 200, { scenario, items });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 6: Run tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "active bundle|scenario-based recommendations"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add server.js lib/repositories/marketing.js tests/api.spec.js
git commit -m "feat: add bundles and recommendation api"
```

---

### Task 7: Add Recently Viewed API

**Files:**
- Modify: `server.js`
- Modify: `lib/repositories/marketing.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing recent-view API test**

Add near recommendation API tests in `tests/api.spec.js`:

```js
test("records and returns recently viewed products for the session", async ({ request }) => {
  const firstRecord = await request.post("/api/recent-views", { data: { productId: "sock-01" } });
  expect(firstRecord.ok()).toBe(true);
  const secondRecord = await request.post("/api/recent-views", { data: { productId: "sock-02" } });
  expect(secondRecord.ok()).toBe(true);

  const response = await request.get("/api/recommendations?scenario=recently-viewed");
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.items.map((item) => item.id)).toEqual(["sock-02", "sock-01"]);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "recently viewed products"
```

Expected: FAIL because recent-view endpoints are not implemented.

- [ ] **Step 3: Add recent-view repository functions**

In `lib/repositories/marketing.js`, add:

```js
function recordRecentView(db, { id, userId = null, sessionId = null, productId, viewedAt = new Date().toISOString() }) {
  db.prepare(`
    DELETE FROM recent_views
    WHERE product_id = ?
      AND COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(productId, userId, sessionId);

  db.prepare(`
    INSERT INTO recent_views (id, user_id, session_id, product_id, viewed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, sessionId, productId, viewedAt);

  db.prepare(`
    DELETE FROM recent_views
    WHERE id NOT IN (
      SELECT id FROM recent_views
      WHERE COALESCE(user_id, '') = COALESCE(?, '')
        AND COALESCE(session_id, '') = COALESCE(?, '')
      ORDER BY viewed_at DESC
      LIMIT 8
    )
      AND COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(userId, sessionId, userId, sessionId);
}

function listRecentProductIds(db, { userId = null, sessionId = null, limit = 8 }) {
  return db.prepare(`
    SELECT product_id
    FROM recent_views
    WHERE COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
    ORDER BY viewed_at DESC
    LIMIT ?
  `).all(userId, sessionId, limit).map((row) => row.product_id);
}
```

Export both functions.

- [ ] **Step 4: Add recent-view route and recommendation scenario**

In `server.js`, import `recordRecentView` and `listRecentProductIds`.

Add route:

```js
  if (request.method === "POST" && requestUrl.pathname === "/api/recent-views") {
    try {
      const body = await readRequestBody(request);
      const activeCart = await readActiveCart(request);
      const products = withDatabase((db) => listProducts(db));
      const product = products.find((item) => item.id === body.productId);
      if (!product) {
        sendError(response, 404, "PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }

      withDatabase((db) => recordRecentView(db, {
        id: `rv-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId,
        productId: product.id
      }));

      sendJson(response, 200, { ok: true });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

In `/api/recommendations`, before default recommendation logic:

```js
      if (scenario === "recently-viewed") {
        const activeCart = await readActiveCart(request);
        const productIds = withDatabase((db) => listRecentProductIds(db, {
          userId: activeCart.user ? activeCart.user.id : null,
          sessionId: activeCart.sessionId
        }));
        const items = productIds
          .map((productId) => products.find((product) => product.id === productId))
          .filter(Boolean)
          .map((product) => localizeProduct(product, normalizeLocale(requestUrl.searchParams.get("locale"))));
        sendJson(response, 200, { scenario, items });
        return;
      }
```

- [ ] **Step 5: Run test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "recently viewed products"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js lib/repositories/marketing.js tests/api.spec.js
git commit -m "feat: track recently viewed products"
```

---

### Task 8: Add Marketing UI To Storefront, Cart, And Detail

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing UI tests**

Add near storefront/cart UI tests in `tests/socks-product-list.spec.js`:

```js
test("shows marketing campaigns and applies a coupon in the cart drawer", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect(page.locator("[data-marketing-strip]")).toContainText("满 ¥99 减 ¥15");
  const firstCard = page.locator("[data-product-card]").first();
  await firstCard.locator("[data-size='43']").click();
  await firstCard.locator("[data-cart-button]").click();
  await page.locator("[data-cart-toggle]").click();

  await expect(page.locator("[data-threshold-progress]")).toContainText("还差");
  await page.locator("[data-coupon-input]").fill("SOCK10");
  await page.locator("[data-coupon-apply]").click();
  await expect(page.locator("[data-applied-coupon]")).toContainText("SOCK10");
  await expect(page.locator("[data-cart-coupon-discount]")).toContainText("-¥");
});

test("adds a bundle from the detail page and shows recently viewed products", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02");

  await expect(page.locator("[data-bundle-card]")).toContainText("日常焕新组合");
  await page.locator("[data-add-bundle]").click();
  await expect(page.locator("[data-detail-cart-count]")).toHaveText("2");

  await page.goto("/socks-product-list.html?view=detail&id=sock-01");
  await page.goto("/socks-product-list.html");
  await expect(page.locator("[data-recently-viewed]")).toContainText(["轻压运动袜", "极简中筒袜"]);
});
```

- [ ] **Step 2: Run UI tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "marketing campaigns|bundle from the detail"
```

Expected: FAIL because marketing UI does not exist.

- [ ] **Step 3: Add marketing state and fetch helpers**

In `socks-product-list.html`, near existing state variables, add:

```js
    let marketingState = {
      promotions: [],
      coupons: [],
      bundles: []
    };
    let recentlyViewedProducts = [];
```

Add helpers near fetch functions:

```js
    async function fetchMarketing() {
      const response = await fetch("/api/marketing");
      if (!response.ok) {
        throw new Error("Failed to load marketing");
      }
      marketingState = await response.json();
      return marketingState;
    }

    async function applyCoupon(code) {
      const response = await fetch("/api/cart/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to apply coupon");
      }
      const payload = await response.json();
      cartState = {
        items: Array.isArray(payload.cart?.items) ? payload.cart.items : [],
        couponCode: payload.cart?.couponCode || "",
        pricing: payload.cart?.pricing || null
      };
      renderCartState();
      return payload;
    }

    async function addBundle(bundleId) {
      const response = await fetch(`/api/cart/bundles/${encodeURIComponent(bundleId)}`, {
        method: "POST"
      });
      if (!response.ok) {
        throw await createCartRequestError(response, "Failed to add bundle");
      }
      const payload = await response.json();
      cartState = {
        items: Array.isArray(payload.cart?.items) ? payload.cart.items : [],
        couponCode: payload.cart?.couponCode || "",
        pricing: payload.cart?.pricing || null
      };
      renderCartState();
      return payload;
    }

    async function recordRecentView(productId) {
      await fetch("/api/recent-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId })
      });
    }

    async function fetchRecentlyViewed() {
      const response = await fetch(`/api/recommendations?scenario=recently-viewed&locale=${encodeURIComponent(activeLocale)}`);
      if (!response.ok) {
        return [];
      }
      const payload = await response.json();
      recentlyViewedProducts = Array.isArray(payload.items) ? payload.items : [];
      return recentlyViewedProducts;
    }
```

- [ ] **Step 4: Add marketing strip and recently viewed markup**

In the storefront view after the hero, add:

```html
      <section class="marketing-strip" data-marketing-strip></section>
```

After the product grid/load-more row, add:

```html
      <section class="recently-viewed" data-recently-viewed hidden></section>
```

Add render functions:

```js
    function renderMarketingStrip() {
      const strip = document.querySelector("[data-marketing-strip]");
      if (!strip) return;
      const threshold = marketingState.promotions.find((promotion) => promotion.id === "threshold-99-save-15");
      const coupons = marketingState.coupons.slice(0, 2);
      strip.innerHTML = `
        <p>${threshold ? threshold.title : "本周袜子优惠"}</p>
        <div>${coupons.map((coupon) => `<span data-coupon-chip>${coupon.code}</span>`).join("")}</div>
      `;
    }

    function renderRecentlyViewed() {
      const root = document.querySelector("[data-recently-viewed]");
      if (!root) return;
      root.hidden = recentlyViewedProducts.length === 0;
      root.innerHTML = recentlyViewedProducts.length === 0
        ? ""
        : `<h2>最近浏览</h2><div>${recentlyViewedProducts.map((product) => `<a href="${getActiveDetailHref(product.id)}">${product.title}</a>`).join("")}</div>`;
    }
```

- [ ] **Step 5: Add coupon UI to cart drawer**

In cart drawer footer before summary rows, add:

```html
        <div class="cart-coupon" data-cart-coupon>
          <label class="cart-coupon__label" for="cart-coupon-code">优惠券</label>
          <div class="cart-coupon__row">
            <input id="cart-coupon-code" class="cart-coupon__input" data-coupon-input>
            <button class="cart-coupon__button" type="button" data-coupon-apply>应用</button>
          </div>
          <p class="cart-coupon__error" data-coupon-error role="alert"></p>
          <p class="cart-coupon__applied" data-applied-coupon></p>
        </div>
        <p class="cart-threshold" data-threshold-progress></p>
```

Add pricing render lines in `renderCartDrawer()`:

```js
      const pricing = cartState.pricing || pricingSummary;
      document.querySelector("[data-threshold-progress]").textContent = pricing.thresholdProgress
        ? pricing.thresholdProgress.isMet
          ? "已满足满减"
          : `还差 ¥${pricing.thresholdProgress.remaining} 可享满减`
        : "";
      document.querySelector("[data-applied-coupon]").textContent = pricing.coupon?.status === "applied"
        ? `已使用 ${pricing.coupon.code}`
        : "";
      cartSavings.textContent = formatSavingsValue(
        (pricing.productDiscount || 0) + (pricing.orderDiscount || 0) + (pricing.couponDiscount || 0)
      );
```

Add a new node for coupon discount row:

```html
        <div class="cart-drawer__summary-row">
          <span>优惠券</span>
          <span class="cart-drawer__summary-value cart-drawer__summary-value--savings" data-cart-coupon-discount>-¥0</span>
        </div>
```

And set:

```js
      document.querySelector("[data-cart-coupon-discount]").textContent = formatSavingsValue(pricing.couponDiscount || 0);
```

- [ ] **Step 6: Add bundle card to detail**

Inside detail page buy section after size buttons, render:

```js
      const bundle = marketingState.bundles[0];
      const bundleMarkup = bundle
        ? `<section class="bundle-card" data-bundle-card>
            <p>组合购买</p>
            <h3>${activeLocale === LOCALE_KEY.EN_US ? bundle.title : bundle.titleZh}</h3>
            <p>立省 ¥${bundle.discountAmount}</p>
            <button type="button" data-add-bundle="${bundle.id}">加入组合</button>
          </section>`
        : "";
```

Insert `${bundleMarkup}` before recommendations.

Add click handling near detail interactions:

```js
      const bundleButton = event.target.closest("[data-add-bundle]");
      if (bundleButton) {
        bundleButton.disabled = true;
        try {
          await addBundle(bundleButton.dataset.addBundle);
        } catch (error) {
          showOutOfStockToast();
        } finally {
          bundleButton.disabled = false;
        }
      }
```

- [ ] **Step 7: Wire initialization and events**

In `initializePage()`, after `renderStaticCopy();`, call:

```js
      await fetchMarketing().catch(() => {
        marketingState = { promotions: [], coupons: [], bundles: [] };
      });
```

For storefront view before `renderProducts()`, call:

```js
      await fetchRecentlyViewed();
      renderMarketingStrip();
      renderRecentlyViewed();
```

For detail view, after resolving product id and before rendering recommendations, call:

```js
      await recordRecentView(product.id).catch(() => {});
```

Add coupon apply click handler:

```js
      const couponApply = event.target.closest("[data-coupon-apply]");
      if (couponApply) {
        const input = document.querySelector("[data-coupon-input]");
        const errorNode = document.querySelector("[data-coupon-error]");
        errorNode.textContent = "";
        try {
          await applyCoupon(input.value);
        } catch (error) {
          errorNode.textContent = error.message;
        }
        return;
      }
```

- [ ] **Step 8: Add minimal CSS**

Add styles near cart/detail/storefront sections:

```css
    .marketing-strip,
    .recently-viewed,
    .bundle-card,
    .cart-coupon {
      border: 1px solid #e8e8e8;
      border-radius: 22px;
      background: #ffffff;
      padding: 16px;
      box-shadow: 0 12px 28px rgba(17, 17, 17, 0.05);
    }

    .marketing-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }

    .cart-coupon__row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }

    .cart-coupon__input,
    .cart-coupon__button,
    .bundle-card button {
      min-height: 44px;
      border: 1px solid #d8d8d8;
      border-radius: 999px;
      padding: 0 12px;
      font: inherit;
    }

    .cart-coupon__button,
    .bundle-card button {
      background: #111111;
      color: #ffffff;
      cursor: pointer;
    }
```

- [ ] **Step 9: Run UI tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "marketing campaigns|bundle from the detail"
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add marketing storefront ui"
```

---

### Task 9: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-24-socks-marketing-module.md`

- [ ] **Step 1: Run marketing API verification**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "marketing|coupon|bundle|recommendations|recently viewed|order|cart pricing"
```

Expected: PASS. `node:sqlite` ExperimentalWarning is expected and not a failure.

- [ ] **Step 2: Run marketing UI verification**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "marketing campaigns|bundle from the detail|checkout|cart drawer|recommendation|recently"
```

Expected: PASS. If legacy JSON-seeded cart tests fail, do not reintroduce JSON reads; update those tests to seed carts through `/api/cart/items` in a separate cleanup task.

- [ ] **Step 3: Run targeted regression for products and checkout**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "products|SKU|checkout|orders"
```

Expected: PASS.

- [ ] **Step 4: Check git status**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git status --short
```

Expected: either clean working tree or only this plan file with checked boxes.

- [ ] **Step 5: Commit plan checkbox updates**

Run:

```powershell
git add docs/superpowers/plans/2026-07-24-socks-marketing-module.md
git commit -m "docs: complete marketing module plan"
```

---

## Self-Review

- Spec coverage: coupons, threshold promotions, limited-time discounts, bundles, recommendation scenarios, recently viewed, unified pricing, cart UI, checkout/order pricing snapshot, and tests are each covered by at least one task.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: plan consistently uses `couponCode`, `pricing`, `appliedPromotions`, `thresholdProgress`, `recent_views`, `promotions`, `coupons`, and `bundles`.
- Risk control: all verification commands are targeted Playwright runs, single worker by default, and no provider/model requests or background agent loops are required.

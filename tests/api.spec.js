const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect, request: playwrightRequest } = require("@playwright/test");

const cartFile = path.join(__dirname, "fixtures", "test-data", "cart.json");
const ordersFile = path.join(__dirname, "fixtures", "test-data", "orders.json");
const usersFile = path.join(__dirname, "fixtures", "test-data", "users.json");
const sessionsFile = path.join(__dirname, "fixtures", "test-data", "sessions.json");
const userCartsFile = path.join(__dirname, "fixtures", "test-data", "user-carts.json");
const testDbFile = path.join(__dirname, "fixtures", "test-data", "socks-store.test.db");
const {
  createDatabase,
  initializeDatabase,
  resetDatabase,
  getDatabasePath
} = require("../lib/database");

test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(ordersFile, `${JSON.stringify({ orders: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(usersFile, `${JSON.stringify({ users: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(sessionsFile, `${JSON.stringify({ sessions: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(userCartsFile, `${JSON.stringify({ carts: [] }, null, 2)}\n`, "utf8");
  await resetDatabase(testDbFile);
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.close();
});

test("parses engineering config defaults and test overrides", async () => {
  const { createConfig } = require("../lib/config");

  const development = createConfig({});
  expect(development).toMatchObject({
    host: "127.0.0.1",
    port: 4173,
    nodeEnv: "development",
    isTest: false,
    logLevel: "info",
    requestBodyLimitBytes: 1048576,
    securityHeadersEnabled: true
  });
  expect(development.dataDir).toContain("data");

  const testConfig = createConfig({
    NODE_ENV: "test",
    PORT: "5123",
    HOST: "0.0.0.0",
    DATA_DIR: "tests/fixtures/test-data",
    LOG_LEVEL: "debug",
    REQUEST_BODY_LIMIT_BYTES: "2048",
    SECURITY_HEADERS_ENABLED: "false"
  });
  expect(testConfig).toMatchObject({
    host: "0.0.0.0",
    port: 5123,
    nodeEnv: "test",
    isTest: true,
    logLevel: "debug",
    requestBodyLimitBytes: 2048,
    securityHeadersEnabled: false
  });
  expect(testConfig.dataDir).toContain("tests");
});

test("rejects invalid engineering config values", async () => {
  const { createConfig } = require("../lib/config");

  expect(() => createConfig({ PORT: "abc" })).toThrow("PORT must be an integer between 0 and 65535");
  expect(() => createConfig({ REQUEST_BODY_LIMIT_BYTES: "0" })).toThrow("REQUEST_BODY_LIMIT_BYTES must be an integer between 1024 and 10485760");
  expect(() => createConfig({ LOG_LEVEL: "loud" })).toThrow("LOG_LEVEL must be one of debug, info, warn, error, silent");
  expect(() => createConfig({ DATA_DIR: "   " })).toThrow("DATA_DIR cannot be empty");
});

test("filters structured logger output by level", async () => {
  const { createLogger } = require("../lib/logger");
  const lines = [];
  const logger = createLogger({
    level: "warn",
    sink: (line) => lines.push(line),
    now: () => new Date("2026-07-28T00:00:00.000Z")
  });

  logger.info("request.received", { method: "GET" });
  logger.warn("request.slow", { elapsedMs: 1200 });
  logger.error("request.failed", { code: "INTERNAL_ERROR" });

  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("[warn]");
  expect(lines[0]).toContain("request.slow");
  expect(lines[0]).toContain("\"elapsedMs\":1200");
  expect(lines[1]).toContain("[error]");
  expect(lines[1]).toContain("request.failed");
});

test("adds baseline security headers to API responses", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
});

test("serves the external storefront script", async ({ request }) => {
  const response = await request.get("/public/js/storefront-app.js");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/javascript");
  const body = await response.text();
  expect(body).toContain("fetchCart");
  expect(body).toContain("renderProducts");
});

test("keeps migrated health product and marketing routes behavior stable", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ ok: true });

  const products = await request.get("/api/products?filter=sport&sort=price-asc&pageSize=4&locale=en-US");
  expect(products.ok()).toBe(true);
  const productsPayload = await products.json();
  expect(productsPayload.items.length).toBeGreaterThan(0);
  expect(productsPayload.meta).toMatchObject({
    filter: "sport",
    sort: "price-asc"
  });

  const marketing = await request.get("/api/marketing");
  expect(marketing.ok()).toBe(true);
  const marketingPayload = await marketing.json();
  expect(Array.isArray(marketingPayload.promotions)).toBe(true);
  expect(Array.isArray(marketingPayload.coupons)).toBe(true);
});

test("documents expected engineering environment variables", async () => {
  const envExample = await fs.readFile(".env.example", "utf8");

  expect(envExample).toContain("HOST=127.0.0.1");
  expect(envExample).toContain("PORT=4173");
  expect(envExample).toContain("DATA_DIR=data");
  expect(envExample).toContain("LOG_LEVEL=info");
  expect(envExample).toContain("REQUEST_BODY_LIMIT_BYTES=1048576");
  expect(envExample).toContain("SECURITY_HEADERS_ENABLED=true");
});

test("rejects oversized JSON request bodies with a standard error", async ({ request }) => {
  const largeMessage = "x".repeat(1100000);
  const response = await request.post("/api/support/contact", {
    data: {
      name: "Alex",
      contact: "alex@example.com",
      topic: "other",
      message: largeMessage,
      locale: "zh-CN"
    }
  });

  expect(response.status()).toBe(413);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "REQUEST_BODY_TOO_LARGE",
      message: expect.any(String),
      details: {}
    }
  });
});

test("keeps invalid JSON errors in the standard error envelope", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    headers: { "content-type": "application/json" },
    data: Buffer.from("{not-json", "utf8")
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "INVALID_JSON",
      message: expect.any(String),
      details: {}
    }
  });
});

test("returns an empty order collection fixture by default", async () => {
  const orders = JSON.parse(await fs.readFile(ordersFile, "utf8"));
  expect(orders).toEqual({ orders: [] });
});

test("returns empty user session fixtures by default", async () => {
  const users = JSON.parse(await fs.readFile(usersFile, "utf8"));
  const sessions = JSON.parse(await fs.readFile(sessionsFile, "utf8"));
  const userCarts = JSON.parse(await fs.readFile(userCartsFile, "utf8"));

  expect(users).toEqual({ users: [] });
  expect(sessions).toEqual({ sessions: [] });
  expect(userCarts).toEqual({ carts: [] });
});

test("resets the SQLite test database through the test-only API", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  expect(addResponse.ok()).toBe(true);

  const resetResponse = await request.post("/api/test/reset");
  expect(resetResponse.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  expect((await cartResponse.json()).items).toEqual([]);
});

test("initializes a SQLite database with product and SKU tables", async () => {
  await resetDatabase(testDbFile);
  const db = createDatabase(testDbFile);
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const product = db.prepare("SELECT id FROM products WHERE id = ?").get("sock-01");
    const sku = db.prepare("SELECT sku_id, stock_quantity FROM product_variants WHERE sku_id = ?").get("sock-01-43");

    expect(product).toEqual({ id: "sock-01" });
    expect(sku).toEqual({ sku_id: "sock-01-43", stock_quantity: 3 });
  } finally {
    db.close();
  }
});

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

test("records schema migrations during database initialization", async () => {
  await resetDatabase(testDbFile);

  const db = createDatabase(testDbFile);
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const migrations = db.prepare("SELECT id, name FROM schema_migrations ORDER BY id ASC").all();
    expect(migrations.map((migration) => migration.id)).toContain("0001_initial_schema");
    expect(migrations.map((migration) => migration.id)).toContain("0002_cart_coupon_code");
    expect(migrations.map((migration) => migration.id)).toContain("0003_product_reviews");
  } finally {
    db.close();
  }
});

test("runs database initialization idempotently without duplicate seeds", async () => {
  await resetDatabase(testDbFile);

  const db = createDatabase(testDbFile);
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
    const promotionCount = db.prepare("SELECT COUNT(*) AS count FROM promotions").get().count;
    const migrationCount = db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count;

    expect(productCount).toBe(12);
    expect(promotionCount).toBe(2);
    expect(migrationCount).toBeGreaterThanOrEqual(2);
  } finally {
    db.close();
  }
});

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
  expect(refundColumns).toEqual(expect.arrayContaining([
    "return_request_id",
    "operation_id",
    "refund_type",
    "amount_cents"
  ]));
  expect(trackingIndex).toEqual({ name: "idx_fulfillments_tracking_unique" });
  expect(migration).toEqual({ id: "0008_admin_order_operations" });
  db.close();
});

test("initializes product review moderation storage and backfills published reviews", async () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const columns = db.prepare("PRAGMA table_info(product_reviews)").all().map((column) => column.name);
  const replyTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_review_replies'").get();
  const pendingIndex = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_product_reviews_moderation'").get();
  const migration = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("0009_product_review_moderation");
  const statuses = db.prepare("SELECT DISTINCT status FROM product_reviews ORDER BY status").all();
  const missingUpdatedAt = db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE updated_at IS NULL OR updated_at = ''").get().count;

  expect(columns).toEqual(expect.arrayContaining([
    "user_id", "session_id", "status", "moderation_reason", "moderation_note",
    "moderated_by", "moderated_at", "risk_flags", "updated_at"
  ]));
  expect(replyTable).toEqual({ name: "product_review_replies" });
  expect(pendingIndex).toEqual({ name: "idx_product_reviews_moderation" });
  expect(migration).toEqual({ id: "0009_product_review_moderation" });
  expect(statuses).toEqual([{ status: "published" }]);
  expect(missingUpdatedAt).toBe(0);
  db.close();
});

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
  expect(first.replayed).toBe(false);
  expect(second.replayed).toBe(true);
  expect(after).toBe(before + 2);
  db.close();
});

test("rolls back writes when an admin action returns a validation error", async () => {
  const { executeIdempotentAction } = require("../lib/repositories/admin-order-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.exec("CREATE TABLE admin_action_transaction_probe (value TEXT NOT NULL)");

  const result = executeIdempotentAction(db, {
    admin: { id: null },
    operationId: "op-validation-rollback",
    action: "probe",
    resourceType: "order",
    resourceId: "order-probe",
    reason: "validation_probe",
    beforeStatus: "paid",
    requestPayload: { value: "must-not-persist" },
    run() {
      db.prepare("INSERT INTO admin_action_transaction_probe (value) VALUES (?)")
        .run("must-not-persist");
      return {
        validationError: {
          statusCode: 409,
          code: "ADMIN_PROBE_REJECTED",
          message: "Probe action was rejected."
        }
      };
    }
  });

  expect(result.validationError.code).toBe("ADMIN_PROBE_REJECTED");
  expect(db.prepare("SELECT COUNT(*) AS count FROM admin_action_transaction_probe").get().count).toBe(0);
  expect(db.prepare("SELECT COUNT(*) AS count FROM admin_action_events WHERE operation_id = ?")
    .get("op-validation-rollback").count).toBe(0);
  db.close();
});

test("moderates review batches atomically and replays the same operation", () => {
  const { moderateReviewBatch } = require("../lib/repositories/admin-review-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.prepare("UPDATE product_reviews SET status = 'pending' WHERE id IN (?, ?)")
    .run("seed-review-sock-02-01", "seed-review-sock-02-02");
  const body = {
    operationId: "op-review-batch-001",
    action: "publish",
    reviewIds: ["seed-review-sock-02-01", "seed-review-sock-02-02"],
    reason: "content_verified",
    note: "人工审核通过"
  };
  const first = moderateReviewBatch(db, { admin: { id: null }, body });
  const replay = moderateReviewBatch(db, { admin: { id: null }, body });
  const event = db.prepare(`
    SELECT before_status AS beforeStatus, after_status AS afterStatus
    FROM admin_action_events WHERE operation_id = ?
  `).get(body.operationId);
  expect(first.reviews.every((review) => review.status === "published")).toBe(true);
  expect(replay.replayed).toBe(true);
  expect(event).toEqual({ beforeStatus: "pending", afterStatus: "published" });
  expect(db.prepare("SELECT COUNT(*) AS count FROM admin_action_events WHERE operation_id = ?").get(body.operationId).count).toBe(1);
  db.close();
});

test("rolls back an invalid mixed review moderation batch", () => {
  const { moderateReviewBatch } = require("../lib/repositories/admin-review-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.prepare("UPDATE product_reviews SET status = 'pending' WHERE id = ?").run("seed-review-sock-02-01");
  db.prepare("UPDATE product_reviews SET status = 'rejected' WHERE id = ?").run("seed-review-sock-02-02");
  const result = moderateReviewBatch(db, {
    admin: { id: null },
    body: {
      operationId: "op-review-batch-conflict",
      action: "publish",
      reviewIds: ["seed-review-sock-02-01", "seed-review-sock-02-02"],
      reason: "content_verified",
      note: "不应产生部分更新"
    }
  });
  expect(result.validationError).toMatchObject({ statusCode: 409, code: "ADMIN_REVIEW_BATCH_CONFLICT" });
  expect(db.prepare("SELECT status FROM product_reviews WHERE id = ?").get("seed-review-sock-02-01"))
    .toEqual({ status: "pending" });
  expect(db.prepare("SELECT COUNT(*) AS count FROM admin_action_events WHERE operation_id = ?").get("op-review-batch-conflict").count)
    .toBe(0);
  db.close();
});

for (const { action, from, to } of [
  { action: "reject", from: "pending", to: "rejected" },
  { action: "hide", from: "published", to: "hidden" },
  { action: "restore", from: "hidden", to: "published" }
]) {
  test(`moves reviews through the ${action} moderation transition`, () => {
    const { moderateReviewBatch } = require("../lib/repositories/admin-review-actions");
    const db = createDatabase(testDbFile);
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });
    const reviewId = "seed-review-sock-02-01";
    db.prepare("UPDATE product_reviews SET status = ? WHERE id = ?").run(from, reviewId);
    const result = moderateReviewBatch(db, {
      admin: { id: null },
      body: {
        operationId: `op-review-${action}-transition`,
        action,
        reviewIds: [reviewId],
        reason: `test_${action}`,
        note: "状态流测试"
      }
    });
    expect(result.reviews[0].status).toBe(to);
    db.close();
  });
}

test("upserts and withdraws merchant replies with idempotent audit events", () => {
  const { findAdminReviewById, listProductReviews } = require("../lib/repositories/product-reviews");
  const { upsertMerchantReply, withdrawMerchantReply } = require("../lib/repositories/admin-review-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const review = findAdminReviewById(db, "seed-review-sock-02-01");
  const body = { operationId: "op-review-reply-001", replyBody: "感谢反馈，我们会继续优化。" };
  const created = upsertMerchantReply(db, { admin: { id: null }, review, body });
  const replay = upsertMerchantReply(db, { admin: { id: null }, review, body });
  expect(created.review.reply.body).toBe(body.replyBody);
  expect(replay.replayed).toBe(true);
  expect(listProductReviews(db, "sock-02").find((item) => item.id === review.id).reply.body)
    .toBe(body.replyBody);

  const withdrawn = withdrawMerchantReply(db, {
    admin: { id: null },
    review: created.review,
    body: { operationId: "op-review-reply-withdraw-001", reason: "reply_retracted" }
  });
  expect(withdrawn.review.reply.withdrawnAt).toEqual(expect.any(String));
  expect(listProductReviews(db, "sock-02").find((item) => item.id === review.id).reply).toBeNull();
  expect(db.prepare("SELECT COUNT(*) AS count FROM product_review_replies WHERE review_id = ?").get(review.id).count).toBe(1);
  db.close();
});

test("rejects merchant replies for hidden reviews and empty bodies", () => {
  const { findAdminReviewById } = require("../lib/repositories/product-reviews");
  const { upsertMerchantReply } = require("../lib/repositories/admin-review-actions");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const reviewId = "seed-review-sock-02-01";
  db.prepare("UPDATE product_reviews SET status = 'hidden' WHERE id = ?").run(reviewId);
  const hidden = upsertMerchantReply(db, {
    admin: { id: null },
    review: findAdminReviewById(db, reviewId),
    body: { operationId: "op-hidden-review-reply", replyBody: "不应写入" }
  });
  expect(hidden.validationError).toMatchObject({ statusCode: 409, code: "ADMIN_REVIEW_REPLY_NOT_ALLOWED" });

  db.prepare("UPDATE product_reviews SET status = 'published' WHERE id = ?").run(reviewId);
  const empty = upsertMerchantReply(db, {
    admin: { id: null },
    review: findAdminReviewById(db, reviewId),
    body: { operationId: "op-empty-review-reply", replyBody: "   " }
  });
  expect(empty.validationError).toMatchObject({ statusCode: 400, code: "ADMIN_REVIEW_REPLY_INVALID" });
  expect(db.prepare("SELECT COUNT(*) AS count FROM product_review_replies WHERE review_id = ?").get(reviewId).count).toBe(0);
  db.close();
});

test("calculates remaining refundable quantity and cents per order item", async () => {
  const { getRefundableOrderSummary } = require("../lib/repositories/refunds");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const order = {
    id: "order-refund-summary",
    items: [
      {
        productId: "sock-01",
        skuId: "sock-01-39",
        title: "袜子",
        size: "39",
        quantity: 2,
        price: 39
      }
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

test("initializes SQLite support ticket table", async () => {
  const db = createDatabase(":memory:");
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const ticketTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'support_tickets'").get();
    expect(ticketTable).toEqual({ name: "support_tickets" });
  } finally {
    db.close();
  }
});

test("initializes support workflow tables and backfills the opening customer message", async () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
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

test("initializes RBAC roles assignments and audit storage idempotently", () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.prepare(`
    INSERT INTO users (
      id, name, email, password, password_hash, password_salt, created_at, updated_at
    ) VALUES ('legacy-user', 'Legacy', 'legacy@example.com', 'hash', 'hash', 'salt', ?, ?)
  `).run("2026-08-03T00:00:00.000Z", "2026-08-03T00:00:00.000Z");
  db.prepare("DELETE FROM schema_migrations WHERE id = '0013_rbac_authorization'").run();

  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });

  expect(db.prepare("SELECT id FROM roles ORDER BY id").all().map((row) => row.id)).toEqual([
    "customer",
    "customer_service",
    "operator",
    "super_admin",
    "warehouse"
  ]);
  expect(db.prepare("SELECT role_id FROM user_roles WHERE user_id = 'legacy-user'").get())
    .toEqual({ role_id: "customer" });
  expect(db.prepare("PRAGMA index_list(role_assignment_events)").all().map((row) => row.name))
    .toEqual(expect.arrayContaining([
      "idx_role_assignment_target_time",
      "idx_role_assignment_actor_time"
    ]));
  expect(db.prepare("SELECT COUNT(*) AS count FROM roles").get().count).toBe(5);
  expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '0013_rbac_authorization'").get())
    .toEqual({ id: "0013_rbac_authorization" });
  db.close();
});

test("maps fixed RBAC roles to least-privilege permissions", () => {
  const { PERMISSIONS, getPermissionsForRoles, hasPermission } = require("../lib/auth/permissions");
  const superPermissions = getPermissionsForRoles(["super_admin"]);

  expect(superPermissions).toEqual(expect.arrayContaining(Object.values(PERMISSIONS)));
  expect(hasPermission(["operator"], PERMISSIONS.ORDERS_REFUND)).toBe(true);
  expect(hasPermission(["operator"], PERMISSIONS.USERS_ROLES_MANAGE)).toBe(false);
  expect(hasPermission(["customer_service"], PERMISSIONS.SUPPORT_REPLY)).toBe(true);
  expect(hasPermission(["customer_service"], PERMISSIONS.INVENTORY_WRITE)).toBe(false);
  expect(hasPermission(["warehouse"], PERMISSIONS.ORDERS_SHIP)).toBe(true);
  expect(hasPermission(["warehouse"], PERMISSIONS.RETURNS_RECEIVE)).toBe(true);
  expect(hasPermission(["warehouse"], PERMISSIONS.RETURNS_REVIEW)).toBe(false);
  expect(getPermissionsForRoles(["customer"])).toEqual([]);
  expect(hasPermission(["unknown"], PERMISSIONS.ANALYTICS_READ)).toBe(false);
  expect(hasPermission(["super_admin"], "unknown.permission")).toBe(false);
});

test("assigns roles atomically audits changes and protects the last super admin", () => {
  const { createSession, createUser, findUserById } = require("../lib/repositories/users");
  const { assignUserRole, listRoleAssignmentEvents } = require("../lib/repositories/roles");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const base = { passwordHash: "hash", passwordSalt: "salt", addresses: [] };
  const root = createUser(db, {
    ...base,
    id: "root",
    name: "Root",
    email: "root@example.com"
  }, { roleId: "super_admin" });
  const staff = createUser(db, {
    ...base,
    id: "staff",
    name: "Staff",
    email: "staff@example.com"
  });
  createSession(db, {
    id: "staff-session",
    userId: staff.id,
    createdAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2026-08-17T00:00:00.000Z"
  });

  const assigned = assignUserRole(db, {
    actorUserId: root.id,
    targetUserId: staff.id,
    roleId: "warehouse",
    reason: "负责仓库履约"
  });
  expect(assigned.assignment).toMatchObject({ targetUserId: staff.id, roleId: "warehouse" });
  expect(findUserById(db, staff.id).roles).toEqual(["warehouse"]);
  expect(listRoleAssignmentEvents(db, { userId: staff.id }).items).toHaveLength(1);
  expect(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(staff.id).count).toBe(0);

  const blocked = assignUserRole(db, {
    actorUserId: root.id,
    targetUserId: root.id,
    roleId: "customer",
    reason: "测试最后管理员保护"
  });
  expect(blocked.validationError.code).toBe("LAST_SUPER_ADMIN_REQUIRED");
  db.close();
});

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

test("accepts storefront analytics without trusting client identity or time", async ({ request }) => {
  const response = await request.post("/api/analytics/events", {
    data: {
      eventType: "product_view",
      productId: "sock-01",
      userId: "spoofed-user",
      sessionId: "spoofed-session",
      occurredAt: "2020-01-01T00:00:00.000Z"
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

function seedPaidAnalyticsOrder(db, {
  orderId,
  paymentId = `${orderId}-payment`,
  amount,
  paidAt,
  items = []
}) {
  const orderItems = items.length ? items : [
    { productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜", size: "39", quantity: 1, price: amount }
  ];
  const order = {
    id: orderId,
    orderNumber: orderId,
    status: "paid",
    items: orderItems,
    totals: { subtotal: amount, taxableAmount: amount, total: amount, grandTotal: amount },
    payment: { status: "succeeded", paidAt },
    createdAt: paidAt,
    updatedAt: paidAt
  };
  db.prepare(`INSERT INTO orders (id, user_id, status, payload, created_at, updated_at)
    VALUES (?, NULL, 'paid', ?, ?, ?)`)
    .run(orderId, JSON.stringify(order), paidAt, paidAt);
  const insertItem = db.prepare("INSERT INTO order_items (order_id, sku_id, payload) VALUES (?, ?, ?)");
  orderItems.forEach((item) => insertItem.run(orderId, item.skuId, JSON.stringify(item)));
  const payment = {
    id: paymentId,
    orderId,
    method: "card",
    provider: "demo_gateway",
    status: "succeeded",
    amount,
    createdAt: paidAt,
    updatedAt: paidAt
  };
  db.prepare(`INSERT INTO payment_attempts
    (id, order_id, user_id, method, status, amount, failure_reason, created_at, updated_at, payload)
    VALUES (?, ?, NULL, 'card', 'succeeded', ?, NULL, ?, ?, ?)`)
    .run(paymentId, orderId, amount, paidAt, paidAt, JSON.stringify(payment));
  return order;
}

function seedSucceededAnalyticsRefund(db, {
  refundId,
  orderId,
  amount,
  succeededAt,
  items = [],
  duplicateEvent = false
}) {
  const refund = {
    id: refundId,
    orderId,
    status: "succeeded",
    amount,
    amountCents: Math.round(amount * 100),
    reason: "quality_issue",
    method: "card",
    refundType: "order",
    createdAt: succeededAt,
    updatedAt: succeededAt
  };
  db.prepare(`INSERT INTO refunds
    (id, order_id, user_id, status, amount, reason, method, refund_type, amount_cents, created_at, updated_at, payload)
    VALUES (?, ?, NULL, 'succeeded', ?, 'quality_issue', 'card', 'order', ?, ?, ?, ?)`)
    .run(refundId, orderId, amount, refund.amountCents, succeededAt, succeededAt, JSON.stringify(refund));
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
    `${refundId}-item-${index}`,
    refundId,
    orderId,
    item.productId,
    item.skuId,
    item.title || item.productId,
    item.size,
    item.quantity,
    item.unitPaidAmount || item.refundAmount,
    item.refundAmount,
    succeededAt
  ));
}

function seedAnalyticsVisitors(db, visitorIds, occurredAt = "2026-08-02T02:00:00.000Z") {
  const bucketDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(occurredAt));
  visitorIds.forEach((visitorId) => db.prepare(`INSERT INTO analytics_events
    (id, event_type, visitor_id, session_id, user_id, product_id, order_id,
     occurred_at, bucket_date, dedupe_key, metadata)
    VALUES (?, 'storefront_visit', ?, NULL, NULL, NULL, NULL, ?, ?, ?, '{}')`)
    .run(
      `event-${visitorId}-${occurredAt}`,
      visitorId,
      occurredAt,
      bucketDate,
      `storefront_visit:${visitorId}:${bucketDate}`
    ));
}

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
    start: "2026-07-04T16:00:00.000Z",
    end: "2026-08-03T16:00:00.000Z",
    bucket: "day"
  });
  expect(createAnalyticsPeriod("90d", new Date("2026-08-03T03:00:00.000Z"))).toMatchObject({
    start: "2026-05-05T16:00:00.000Z",
    end: "2026-08-03T16:00:00.000Z",
    bucket: "week"
  });
  expect(createAnalyticsPeriod("custom", new Date()).validationError.code).toBe("ANALYTICS_RANGE_INVALID");
});

test("calculates net sales conversion and refund rate from business facts", () => {
  const { getAdminAnalytics } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-paid-1",
    paymentId: "analytics-payment-1",
    amount: 100,
    paidAt: "2026-08-02T02:00:00.000Z"
  });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-paid-2",
    paymentId: "analytics-payment-2",
    amount: 80,
    paidAt: "2026-08-02T03:00:00.000Z"
  });
  const duplicatePayment = {
    id: "analytics-payment-1-duplicate",
    orderId: "analytics-paid-1",
    status: "succeeded",
    amount: 100,
    createdAt: "2026-08-02T02:05:00.000Z",
    updatedAt: "2026-08-02T02:05:00.000Z"
  };
  db.prepare(`INSERT INTO payment_attempts
    (id, order_id, user_id, method, status, amount, failure_reason, created_at, updated_at, payload)
    VALUES (?, ?, NULL, 'card', 'succeeded', ?, NULL, ?, ?, ?)`)
    .run(
      duplicatePayment.id,
      duplicatePayment.orderId,
      duplicatePayment.amount,
      duplicatePayment.createdAt,
      duplicatePayment.updatedAt,
      JSON.stringify(duplicatePayment)
    );
  seedSucceededAnalyticsRefund(db, {
    refundId: "analytics-refund-1",
    orderId: "analytics-paid-1",
    amount: 20,
    succeededAt: "2026-08-03T02:00:00.000Z",
    duplicateEvent: true
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
    uniqueVisitors: 4,
    cartAddSessions: 0,
    checkoutSessions: 0,
    paidOrderCount: 2
  });
  expect(result.trend[0].label).toBe("2026-07-28");
  expect(result.trend.some((bucket) => bucket.netSales > 0)).toBe(true);
  db.close();
});

test("excludes failed payments and allows refund rate above 100 percent", () => {
  const { getAdminAnalytics } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-current-paid",
    amount: 50,
    paidAt: "2026-08-02T02:00:00.000Z"
  });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-failed-order",
    paymentId: "analytics-failed-payment",
    amount: 999,
    paidAt: "2026-08-02T03:00:00.000Z"
  });
  db.prepare("UPDATE payment_attempts SET status = 'failed' WHERE id = ?").run("analytics-failed-payment");
  for (const suffix of ["a", "b"]) {
    const orderId = `analytics-previous-${suffix}`;
    seedPaidAnalyticsOrder(db, {
      orderId,
      amount: 40,
      paidAt: `2026-07-21T0${suffix === "a" ? 2 : 3}:00:00.000Z`
    });
    seedSucceededAnalyticsRefund(db, {
      refundId: `analytics-current-refund-${suffix}`,
      orderId,
      amount: 10,
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

test("ranks paid products by units and includes succeeded refunded units", () => {
  const { listTopProducts } = require("../lib/repositories/admin-analytics");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  seedPaidAnalyticsOrder(db, {
    orderId: "analytics-product-order",
    amount: 207,
    paidAt: "2026-08-02T02:00:00.000Z",
    items: [
      { productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜", size: "39", quantity: 3, price: 39 },
      { productId: "sock-02", skuId: "sock-02-40", title: "通勤罗纹袜", size: "40", quantity: 2, price: 45 }
    ]
  });
  seedSucceededAnalyticsRefund(db, {
    refundId: "analytics-product-refund",
    orderId: "analytics-product-order",
    amount: 39,
    succeededAt: "2026-08-03T02:00:00.000Z",
    duplicateEvent: true,
    items: [{
      productId: "sock-01",
      skuId: "sock-01-39",
      title: "极简中筒袜",
      size: "39",
      quantity: 1,
      unitPaidAmount: 3900,
      refundAmount: 3900
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
    orderId: "analytics-full-refund-order",
    amount: 168,
    paidAt: "2026-08-01T02:00:00.000Z",
    items: [
      { productId: "sock-01", skuId: "sock-01-39", title: "极简中筒袜", size: "39", quantity: 2, price: 39 },
      { productId: "sock-02", skuId: "sock-02-40", title: "通勤罗纹袜", size: "40", quantity: 2, price: 45 }
    ]
  });
  seedSucceededAnalyticsRefund(db, {
    refundId: "analytics-full-refund",
    orderId: "analytics-full-refund-order",
    amount: 168,
    succeededAt: "2026-08-03T03:00:00.000Z",
    duplicateEvent: true
  });
  const products = listTopProducts(db, "2026-07-27T16:00:00.000Z", "2026-08-03T16:00:00.000Z");
  expect(products.find((item) => item.productId === "sock-01").refundedUnits).toBe(2);
  expect(products.find((item) => item.productId === "sock-02").refundedUnits).toBe(2);
  db.close();
});

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

test("returns admin analytics for fixed ranges only", async ({ request }) => {
  const anonymous = await request.get("/api/admin/analytics?range=30d");
  expect(anonymous.status()).toBe(401);
  const adminCookie = await registerApiUser(request, { email: "admin@socks.test" });
  const response = await request.get("/api/admin/analytics?range=30d", {
    headers: { cookie: adminCookie }
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload).toMatchObject({
    period: { range: "30d", timezone: "Asia/Shanghai", bucket: "day" },
    summary: {
      netSales: expect.any(Number),
      conversionRate: expect.any(Number),
      refundRate: expect.any(Number),
      uniqueVisitors: expect.any(Number),
      paidOrderCount: expect.any(Number),
      lowStockSkuCount: expect.any(Number),
      outOfStockSkuCount: expect.any(Number)
    },
    funnel: expect.any(Object),
    trend: expect.any(Array),
    topProducts: expect.any(Array),
    inventoryAlerts: expect.any(Array)
  });
  const invalid = await request.get("/api/admin/analytics?range=365d", {
    headers: { cookie: adminCookie }
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("ANALYTICS_RANGE_INVALID");
});

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

[
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
].forEach(({ name, campaign, field }) => {
  test(`rejects invalid campaign rules: ${name}`, () => {
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
});

test("detects overlapping product promotion conflicts", async () => {
  const { validateCampaignForPublish } = require("../lib/repositories/marketing-campaigns");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const result = validateCampaignForPublish(db, {
    id: "promotion-conflict-test", resourceType: "promotion", resourceKey: "conflict-test", name: "冲突训练价",
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

test("serializes only public ticket messages for customers", async () => {
  const { createSupportTicket, findSupportTicketById } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const ticket = createSupportTicket(db, {
    name: "Owner",
    contact: "owner@example.com",
    topic: "orders",
    message: "订单需要帮助",
    locale: "zh-CN"
  }).ticket;
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
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const owner = { sessionId: null, userId: null };
  const parent = createSupportTicket(db, {
    name: "Owner",
    contact: "owner@example.com",
    topic: "orders",
    message: "原工单",
    locale: "zh-CN"
  }, owner).ticket;
  db.prepare("UPDATE support_tickets SET status = 'closed' WHERE id = ?").run(parent.id);

  const child = createSupportTicket(db, {
    name: "Owner",
    contact: "OWNER@example.com",
    topic: "orders",
    message: "关闭后的后续问题",
    locale: "zh-CN",
    parentTicketId: parent.id
  }, { ...owner, authorizedParentTicketIds: new Set([parent.id]) });
  expect(child.ticket.parentTicketId).toBe(parent.id);
  expect(db.prepare("SELECT body FROM support_ticket_messages WHERE ticket_id = ?").all(child.ticket.id))
    .toEqual([{ body: "关闭后的后续问题" }]);

  const rejected = createSupportTicket(db, {
    name: "Other",
    contact: "other@example.com",
    topic: "orders",
    message: "尝试关联他人工单",
    locale: "zh-CN",
    parentTicketId: parent.id
  }, { sessionId: null, userId: null, authorizedParentTicketIds: new Set() });
  expect(rejected.validationError.code).toBe("SUPPORT_PARENT_TICKET_INVALID");
  db.close();
});

test("adds a customer ticket message and resumes a waiting conversation", () => {
  const { addCustomerTicketMessage, createSupportTicket } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const ticket = createSupportTicket(db, {
    name: "Owner",
    contact: "owner@example.com",
    topic: "orders",
    message: "原始问题",
    locale: "zh-CN"
  }).ticket;
  db.prepare("UPDATE support_tickets SET status = 'waiting_customer' WHERE id = ?").run(ticket.id);

  const result = addCustomerTicketMessage(db, { ...ticket, status: "waiting_customer" }, {}, "补充订单截图信息");
  expect(result.ticket.status).toBe("in_progress");
  expect(result.ticket.version).toBe(2);
  expect(result.ticket.messages.map((message) => message.body)).toEqual(["原始问题", "补充订单截图信息"]);
  expect(db.prepare("SELECT event_type FROM support_ticket_events WHERE ticket_id = ?").all(ticket.id))
    .toEqual([{ event_type: "customer_replied" }]);
  db.close();
});

test("lists account tickets and matches guest tickets by normalized contact", () => {
  const {
    createSupportTicket,
    findSupportTicketForGuest,
    listSupportTicketsForUser
  } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, name, email, password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("support-user", "Support User", "support-user@example.com", "unused", now, now);
  const accountTicket = createSupportTicket(db, {
    name: "Support User",
    contact: "support-user@example.com",
    topic: "orders",
    message: "账号工单",
    locale: "zh-CN"
  }, { userId: "support-user" }).ticket;
  const guestTicket = createSupportTicket(db, {
    name: "Guest",
    contact: "Guest@Example.com",
    topic: "delivery",
    message: "匿名工单",
    locale: "zh-CN"
  }).ticket;

  expect(listSupportTicketsForUser(db, "support-user").map((ticket) => ticket.id))
    .toEqual([accountTicket.id]);
  expect(findSupportTicketForGuest(db, guestTicket.ticketNumber, " guest@example.COM ").id)
    .toBe(guestTicket.id);
  expect(findSupportTicketForGuest(db, guestTicket.ticketNumber, "other@example.com")).toBeNull();
  db.close();
});

test("blocks repeated failed guest ticket lookups during cooldown", () => {
  const { createSupportLookupLimiter } = require("../lib/support-lookup-limiter");
  let now = 1000;
  const limiter = createSupportLookupLimiter({ maxFailures: 3, cooldownMs: 60000, now: () => now });
  expect(limiter.canAttempt("session-a")).toBe(true);
  limiter.recordFailure("session-a");
  limiter.recordFailure("session-a");
  limiter.recordFailure("session-a");
  expect(limiter.canAttempt("session-a")).toBe(false);
  expect(limiter.retryAfterMs("session-a")).toBe(60000);
  now += 60001;
  expect(limiter.canAttempt("session-a")).toBe(true);
  limiter.authorizeTicket("session-a", "ticket-1");
  expect(limiter.canAccessTicket("session-a", "ticket-1")).toBe(true);
  expect([...limiter.getAuthorizedTicketIds("session-a")]).toEqual(["ticket-1"]);
  expect(limiter.canAccessTicket("session-b", "ticket-1")).toBe(false);
  now += 60001;
  expect(limiter.canAccessTicket("session-a", "ticket-1")).toBe(false);
});

test("assigns and resolves support tickets with idempotent admin actions", () => {
  const { addAdminSupportMessage, updateSupportTicket } = require("../lib/repositories/admin-support-actions");
  const { createSupportTicket } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const ticket = createSupportTicket(db, {
    name: "Owner",
    contact: "owner@example.com",
    topic: "orders",
    message: "订单需要帮助",
    locale: "zh-CN"
  }).ticket;
  const admin = { id: null };
  const assigned = updateSupportTicket(db, {
    admin,
    ticketId: ticket.id,
    body: {
      operationId: "op-ticket-assign",
      action: "assign",
      assignedAdminUserId: null,
      expectedVersion: 1
    }
  });
  const replied = addAdminSupportMessage(db, {
    admin,
    ticketId: ticket.id,
    body: {
      operationId: "op-ticket-reply",
      visibility: "public",
      message: "我们正在处理。"
    }
  });

  expect(assigned.ticket.version).toBe(2);
  expect(replied.ticket.messages.at(-1).body).toBe("我们正在处理。");
  expect(addAdminSupportMessage(db, {
    admin,
    ticketId: ticket.id,
    body: {
      operationId: "op-ticket-reply",
      visibility: "public",
      message: "我们正在处理。"
    }
  }).replayed).toBe(true);
  db.close();
});

test("rejects stale support versions and hides internal support notes from customers", () => {
  const { addAdminSupportMessage, updateSupportTicket } = require("../lib/repositories/admin-support-actions");
  const { createSupportTicket, findSupportTicketById } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const ticket = createSupportTicket(db, {
    name: "Owner",
    contact: "owner@example.com",
    topic: "orders",
    message: "订单需要帮助",
    locale: "zh-CN"
  }).ticket;
  const admin = { id: null };
  const first = updateSupportTicket(db, {
    admin,
    ticketId: ticket.id,
    body: { operationId: "op-ticket-priority", action: "priority", priority: "high", expectedVersion: 1 }
  });
  const conflict = updateSupportTicket(db, {
    admin,
    ticketId: ticket.id,
    body: { operationId: "op-ticket-stale", action: "status", status: "in_progress", expectedVersion: 1 }
  });
  addAdminSupportMessage(db, {
    admin,
    ticketId: ticket.id,
    body: { operationId: "op-ticket-note", visibility: "internal", message: "仅供客服查看" }
  });

  expect(first.ticket.priority).toBe("high");
  expect(conflict.validationError.code).toBe("SUPPORT_VERSION_CONFLICT");
  expect(findSupportTicketById(db, ticket.id, { audience: "customer" }).messages.map((message) => message.body))
    .not.toContain("仅供客服查看");
  expect(findSupportTicketById(db, ticket.id, { audience: "admin" }).messages.map((message) => message.body))
    .toContain("仅供客服查看");
  db.close();
});

test("lets customers track and reply to their support tickets", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "support-owner@example.com" });
  const created = await request.post("/api/support/contact", {
    headers: { cookie },
    data: {
      name: "Owner",
      contact: "support-owner@example.com",
      topic: "orders",
      message: "订单需要帮助",
      locale: "zh-CN"
    }
  });
  const ticket = (await created.json()).ticket;
  const reply = await request.post(`/api/me/support/tickets/${ticket.id}/messages`, {
    headers: { cookie },
    data: { message: "补充订单截图信息。" }
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
    data: {
      name: "Owner",
      contact: "ticket-owner@example.com",
      topic: "orders",
      message: "需要售后",
      locale: "zh-CN"
    }
  });
  const ticket = (await created.json()).ticket;
  const note = await request.post(`/api/admin/support/tickets/${ticket.id}/actions/message`, {
    headers: { cookie: adminCookie },
    data: {
      operationId: "op-internal-note-api",
      visibility: "internal",
      message: "客户不可见的处理备注"
    }
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
    data: {
      name: "Guest",
      contact: "guest-lookup@example.com",
      topic: "product",
      message: "匿名咨询",
      locale: "zh-CN"
    }
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

  for (let index = 0; index < 5; index += 1) {
    const failure = await request.post("/api/support/tickets/lookup", {
      data: {
        ticketNumber: index % 2 ? "SUP-NOT-FOUND" : ticket.ticketNumber,
        contact: "wrong@example.com"
      }
    });
    expect(failure.status()).toBe(404);
    expect((await failure.json()).error.code).toBe("SUPPORT_TICKET_NOT_FOUND");
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

test("includes operational support KPIs in the admin summary", () => {
  const { getAdminSummary } = require("../lib/repositories/admin");
  const { createSupportTicket } = require("../lib/repositories/support");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.exec("DELETE FROM support_ticket_events; DELETE FROM support_ticket_messages; DELETE FROM support_tickets;");
  const tickets = ["紧急问题", "等待客户", "超时问题"].map((message) => createSupportTicket(db, {
    name: "Buyer",
    contact: "buyer@example.com",
    topic: "orders",
    message,
    locale: "zh-CN"
  }).ticket);
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

test("creates and lists product reviews for a product", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "maya-reviewer@example.com" });
  const createResponse = await request.post("/api/products/sock-02/reviews", {
    headers: { cookie },
    data: {
      author: "Maya Chen",
      rating: 5,
      body: "面料柔软，运动后也很透气。",
      locale: "zh-CN"
    }
  });

  expect(createResponse.status()).toBe(201);
  await expect(createResponse.json()).resolves.toMatchObject({
    ok: true,
    review: {
      productId: "sock-02",
      author: "Maya Chen",
      rating: 5,
      body: "面料柔软，运动后也很透气。"
    }
  });

  const listResponse = await request.get("/api/products/sock-02/reviews");
  expect(listResponse.ok()).toBe(true);
  await expect(listResponse.json()).resolves.toMatchObject({
    ok: true,
    summary: {
      count: 5,
      averageRating: 4.2
    },
    reviews: expect.arrayContaining([
      expect.objectContaining({
        productId: "sock-02",
        author: "Maya Chen",
        rating: 5,
        body: "面料柔软，运动后也很透气。"
      }),
      expect.objectContaining({
        productId: "sock-02",
        author: "李然",
        rating: 5,
        body: "运动时包裹感很好，脚背不会勒。"
      })
    ])
  });
});

test("publishes safe signed-in reviews and queues anonymous reviews", async ({ request }) => {
  const anonymous = await request.post("/api/products/sock-01/reviews", {
    data: { author: "Guest", rating: 4, body: "穿着舒适，长度合适。", locale: "zh-CN" }
  });
  const anonymousReview = (await anonymous.json()).review;
  expect(anonymousReview.status).toBe("pending");

  const cookie = await registerApiUser(request, { email: "reviewer@example.com" });
  const signedIn = await request.post("/api/products/sock-01/reviews", {
    headers: { cookie },
    data: { author: "Buyer", rating: 5, body: "面料柔软，日常穿很好。", locale: "zh-CN" }
  });
  const signedInReview = (await signedIn.json()).review;
  expect(signedInReview.status).toBe("published");

  const publicList = await request.get("/api/products/sock-01/reviews");
  const ids = (await publicList.json()).reviews.map((review) => review.id);
  expect(ids).toContain(signedInReview.id);
  expect(ids).not.toContain(anonymousReview.id);
});

test("queues signed-in reviews with links or duplicate content", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "risk-reviewer@example.com" });
  const first = await request.post("/api/products/sock-03/reviews", {
    headers: { cookie },
    data: { author: "Risk Buyer", rating: 4, body: "这双袜子的支撑感不错。", locale: "zh-CN" }
  });
  expect((await first.json()).review.status).toBe("published");

  const duplicate = await request.post("/api/products/sock-03/reviews", {
    headers: { cookie },
    data: { author: "Risk Buyer", rating: 4, body: "这双袜子的支撑感不错。", locale: "zh-CN" }
  });
  expect((await duplicate.json()).review).toMatchObject({
    status: "pending",
    riskFlags: ["duplicate_content"]
  });

  const linked = await request.post("/api/products/sock-03/reviews", {
    headers: { cookie },
    data: { author: "Risk Buyer", rating: 4, body: "更多信息请看 https://example.com", locale: "zh-CN" }
  });
  expect((await linked.json()).review).toMatchObject({
    status: "pending",
    riskFlags: ["external_link"]
  });
});

test("queues the fourth signed-in review submitted within ten minutes", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "frequent-reviewer@example.com" });
  const reviews = [];
  for (let index = 1; index <= 4; index += 1) {
    const response = await request.post("/api/products/sock-04/reviews", {
      headers: { cookie },
      data: { author: "Frequent Buyer", rating: 4, body: `十分钟内的第 ${index} 条不同评价。`, locale: "zh-CN" }
    });
    reviews.push((await response.json()).review);
  }
  expect(reviews.slice(0, 3).every((review) => review.status === "published")).toBe(true);
  expect(reviews[3]).toMatchObject({ status: "pending", riskFlags: ["high_frequency"] });
});

test("lists admin reviews with moderation filters and summary", () => {
  const { listAdminProductReviews } = require("../lib/repositories/product-reviews");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  const result = listAdminProductReviews(db, { status: "published", rating: "5", q: "包裹" });
  expect(result.summary).toEqual(expect.objectContaining({
    published: expect.any(Number),
    pending: expect.any(Number),
    lowRating: expect.any(Number)
  }));
  expect(result.reviews).not.toHaveLength(0);
  expect(result.reviews.every((review) => {
    return review.status === "published"
      && review.rating === 5
      && `${review.author} ${review.body} ${review.productTitle}`.includes("包裹");
  })).toBe(true);
  db.close();
});

test("adds review moderation KPIs to the admin dashboard", () => {
  const { getAdminSummary } = require("../lib/repositories/admin");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.prepare("UPDATE product_reviews SET status = 'pending' WHERE id = ?").run("seed-review-sock-02-01");
  const pendingReviewCount = db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE status = 'pending'").get().count;
  const lowRatingReviewCount = db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE status = 'published' AND rating <= 2").get().count;
  const dashboard = getAdminSummary(db);
  expect(dashboard.summary).toMatchObject({ pendingReviewCount, lowRatingReviewCount });
  expect(dashboard.workQueue).toEqual(expect.arrayContaining([
    { type: "reviews-pending", label: "Pending reviews", count: pendingReviewCount },
    { type: "reviews-low-rating", label: "Low-rating reviews", count: lowRatingReviewCount }
  ]));
  db.close();
});

test("serializes active merchant replies without exposing admin identifiers", () => {
  const { listProductReviews } = require("../lib/repositories/product-reviews");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.prepare(`
    INSERT INTO product_review_replies (
      id, review_id, body, admin_user_id, created_at, updated_at, withdrawn_at
    ) VALUES (?, ?, ?, NULL, ?, ?, NULL)
  `).run(
    "reply-public-test",
    "seed-review-sock-02-01",
    "感谢您的真实反馈。",
    "2026-07-31T10:00:00.000Z",
    "2026-07-31T10:00:00.000Z"
  );
  const review = listProductReviews(db, "sock-02")
    .find((item) => item.id === "seed-review-sock-02-01");
  expect(review.reply).toEqual({
    body: "感谢您的真实反馈。",
    updatedAt: "2026-07-31T10:00:00.000Z"
  });
  expect(review.reply.adminUserId).toBeUndefined();
  db.close();
});

test("lists seeded product reviews for product detail pages", async ({ request }) => {
  const response = await request.get("/api/products/sock-02/reviews");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    summary: {
      count: 4,
      averageRating: 4
    },
    reviews: expect.arrayContaining([
      expect.objectContaining({
        productId: "sock-02",
        author: "李然",
        rating: 5,
        body: "运动时包裹感很好，脚背不会勒。",
        verifiedPurchase: true,
        helpfulCount: 12,
        mediaUrls: expect.arrayContaining([expect.stringContaining("data:image/svg+xml")])
      }),
      expect.objectContaining({
        productId: "sock-02",
        author: "Ava",
        rating: 4,
        body: "洗过两次还是挺有弹性，厚度适合训练。"
      }),
      expect.objectContaining({
        productId: "sock-02",
        author: "韩路",
        rating: 2,
        body: "脚背偏紧，厚度也比预期更明显。",
        reasonTags: ["尺码偏紧", "厚度偏厚"]
      })
    ])
  });
});

test("returns product review trust signals and records helpful votes once per session", async ({ request }) => {
  const reviewsResponse = await request.get("/api/products/sock-02/reviews");

  expect(reviewsResponse.ok()).toBe(true);
  const reviewsPayload = await reviewsResponse.json();
  const trustedReview = reviewsPayload.reviews.find((review) => review.id === "seed-review-sock-02-01");
  expect(trustedReview).toMatchObject({
    verifiedPurchase: true,
    helpfulCount: 12,
    mediaUrls: expect.arrayContaining([expect.stringContaining("data:image/svg+xml")]),
    reasonTags: []
  });

  const negativeReview = reviewsPayload.reviews.find((review) => review.id === "seed-review-sock-02-04");
  expect(negativeReview).toMatchObject({
    verifiedPurchase: true,
    rating: 2,
    reasonTags: ["尺码偏紧", "厚度偏厚"]
  });

  const helpfulResponse = await request.post("/api/products/sock-02/reviews/seed-review-sock-02-01/helpful");
  expect(helpfulResponse.ok()).toBe(true);
  const cookie = getSessionCookie(helpfulResponse);
  expect(cookie).toContain("socks_session=");
  await expect(helpfulResponse.json()).resolves.toMatchObject({
    ok: true,
    review: {
      id: "seed-review-sock-02-01",
      helpfulCount: 13
    }
  });

  const duplicateResponse = await request.post("/api/products/sock-02/reviews/seed-review-sock-02-01/helpful", {
    headers: { cookie }
  });
  expect(duplicateResponse.ok()).toBe(true);
  await expect(duplicateResponse.json()).resolves.toMatchObject({
    ok: true,
    review: {
      id: "seed-review-sock-02-01",
      helpfulCount: 13
    }
  });
});

test("filters product reviews by rating and sort order", async ({ request }) => {
  const ratingResponse = await request.get("/api/products/sock-02/reviews?rating=4");

  expect(ratingResponse.ok()).toBe(true);
  await expect(ratingResponse.json()).resolves.toMatchObject({
    ok: true,
    summary: {
      count: 1,
      averageRating: 4
    },
    reviews: [
      expect.objectContaining({
        author: "Ava",
        rating: 4,
        body: "洗过两次还是挺有弹性，厚度适合训练。"
      })
    ]
  });

  const sortedResponse = await request.get("/api/products/sock-02/reviews?sort=rating-asc");
  expect(sortedResponse.ok()).toBe(true);
  const sortedPayload = await sortedResponse.json();
  expect(sortedPayload.reviews[0]).toMatchObject({
    author: "韩路",
    rating: 2
  });
});

test("creates and lists saved products for an anonymous session", async ({ request }) => {
  const saveResponse = await request.post("/api/saved-products", {
    data: {
      productId: "sock-02"
    }
  });

  expect(saveResponse.status()).toBe(201);
  const cookie = getSessionCookie(saveResponse);
  expect(cookie).toContain("socks_session=");
  await expect(saveResponse.json()).resolves.toMatchObject({
    ok: true,
    savedProductIds: ["sock-02"],
    items: [
      expect.objectContaining({
        id: "sock-02"
      })
    ]
  });

  const listResponse = await request.get("/api/saved-products", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  await expect(listResponse.json()).resolves.toMatchObject({
    ok: true,
    savedProductIds: ["sock-02"],
    items: [
      expect.objectContaining({
        id: "sock-02"
      })
    ]
  });

  const removeResponse = await request.delete("/api/saved-products/sock-02", {
    headers: { cookie }
  });
  expect(removeResponse.ok()).toBe(true);
  await expect(removeResponse.json()).resolves.toMatchObject({
    ok: true,
    savedProductIds: [],
    items: []
  });
});

test("creates and lists product questions for product detail pages", async ({ request }) => {
  const seededResponse = await request.get("/api/products/sock-02/questions");

  expect(seededResponse.ok()).toBe(true);
  await expect(seededResponse.json()).resolves.toMatchObject({
    ok: true,
    summary: {
      count: 3
    },
    questions: expect.arrayContaining([
      expect.objectContaining({
        productId: "sock-02",
        author: "官方客服",
        question: "这款适合跑步训练吗？",
        answer: "适合。它的袜底有轻压支撑，日常跑步和健身训练都可以穿。"
      })
    ])
  });

  const createResponse = await request.post("/api/products/sock-02/questions", {
    data: {
      author: "王",
      question: "40 码脚宽可以穿吗？",
      locale: "zh-CN"
    }
  });

  expect(createResponse.status()).toBe(201);
  await expect(createResponse.json()).resolves.toMatchObject({
    ok: true,
    question: {
      productId: "sock-02",
      author: "王",
      question: "40 码脚宽可以穿吗？",
      answer: ""
    },
    summary: {
      count: 4
    }
  });
});

test("accepts concise product reviews with short nicknames", async ({ request }) => {
  const response = await request.post("/api/products/sock-02/reviews", {
    data: {
      author: "王",
      rating: 5,
      body: "好穿",
      locale: "zh-CN"
    }
  });

  expect(response.status()).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    review: {
      author: "王",
      rating: 5,
      body: "好穿"
    }
  });
});

test("rejects invalid product reviews with standard errors", async ({ request }) => {
  const response = await request.post("/api/products/sock-02/reviews", {
    data: {
      author: "",
      rating: 8,
      body: "",
      locale: "zh-CN"
    }
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "PRODUCT_REVIEW_VALIDATION_FAILED",
      details: {
        fields: expect.arrayContaining(["author", "rating", "body"])
      }
    }
  });
});

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

test("uses the configured SQLite database path", () => {
  expect(getDatabasePath({ nodeEnv: "test" })).toContain("socks-store.test.db");

  const originalNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.NODE_ENV;
    expect(getDatabasePath({ nodeEnv: "production" })).toContain("socks-store.db");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("calculates marketing-aware cart pricing with threshold promotion and coupon", async () => {
  const { createPricingSummary } = require("../lib/pricing");
  const products = JSON.parse(await fs.readFile(path.join(__dirname, "fixtures", "test-data", "products.json"), "utf8"));
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
  const products = JSON.parse(await fs.readFile(path.join(__dirname, "fixtures", "test-data", "products.json"), "utf8"));
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

test("returns localized trust center content", async ({ request }) => {
  const response = await request.get("/api/trust-center?locale=zh-CN");
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  expect(payload.sections.map((section) => section.id)).toEqual([
    "returns",
    "delivery",
    "privacy",
    "terms",
    "faq",
    "contact"
  ]);
  expect(payload.sections.find((section) => section.id === "returns")).toMatchObject({
    title: "退换政策"
  });
  expect(payload.faqs.length).toBeGreaterThanOrEqual(5);
  expect(payload.contactTopics.map((topic) => topic.id)).toContain("orders");
});

test("returns English trust center content", async ({ request }) => {
  const response = await request.get("/api/trust-center?locale=en-US");
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  expect(payload.sections.find((section) => section.id === "privacy")).toMatchObject({
    title: "Privacy Policy"
  });
  expect(payload.faqs[0].question).toContain("size");
});

test("creates a support contact ticket", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    data: {
      name: "Demo Buyer",
      contact: "buyer@example.com",
      topic: "returns",
      orderId: "SOCK-20260724-0001",
      message: "I want to understand the return window for unworn socks.",
      locale: "en-US"
    }
  });
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  expect(payload.ticket).toMatchObject({
    topic: "returns",
    status: "open"
  });
  expect(payload.ticket.ticketNumber).toMatch(/^SUP-\d{8}-\d{4}$/);

  const db = createDatabase(testDbFile);
  try {
    const row = db.prepare("SELECT ticket_number, topic, status FROM support_tickets WHERE ticket_number = ?").get(payload.ticket.ticketNumber);
    expect(row).toMatchObject({
      ticket_number: payload.ticket.ticketNumber,
      topic: "returns",
      status: "open"
    });
  } finally {
    db.close();
  }
});

test("rejects support contact requests with missing required fields", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    data: {
      name: "",
      contact: "buyer@example.com",
      topic: "orders",
      message: "Please help with my order."
    }
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "SUPPORT_NAME_REQUIRED"
    }
  });
});

test("rejects support contact requests with invalid topics", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    data: {
      name: "Demo Buyer",
      contact: "buyer@example.com",
      topic: "billing-provider",
      message: "Please help with my order."
    }
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "SUPPORT_TOPIC_INVALID"
    }
  });
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

test("lists removes and clears full recent views for the current session", async ({ request }) => {
  const firstRecord = await request.post("/api/recent-views", { data: { productId: "sock-01" } });
  expect(firstRecord.ok()).toBe(true);
  const cookie = getSessionCookie(firstRecord);

  const secondRecord = await request.post("/api/recent-views", {
    data: { productId: "sock-02" },
    headers: { cookie }
  });
  expect(secondRecord.ok()).toBe(true);

  const listResponse = await request.get("/api/recent-views?limit=24", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  await expect(listResponse.json()).resolves.toMatchObject({
    ok: true,
    productIds: ["sock-02", "sock-01"]
  });

  const removeResponse = await request.delete("/api/recent-views/sock-02", {
    headers: { cookie }
  });
  expect(removeResponse.ok()).toBe(true);
  await expect(removeResponse.json()).resolves.toMatchObject({
    ok: true,
    productIds: ["sock-01"]
  });

  const clearResponse = await request.post("/api/recent-views/clear", {
    headers: { cookie }
  });
  expect(clearResponse.ok()).toBe(true);
  await expect(clearResponse.json()).resolves.toMatchObject({
    ok: true,
    productIds: []
  });
});

const checkoutPayload = {
  locale: "en-US",
  customer: {
    name: "Alex Chen",
    contact: "alex@example.com"
  },
  shippingAddress: {
    address: "100 Demo Street",
    city: "Seattle",
    region: "WA",
    postalCode: "98101",
    note: "Leave at the door"
  },
  shippingMethodId: "standard"
};

function createAdminProductFixture(id = "sock-admin-new") {
  return {
    id,
    series: "Admin Studio",
    title: "后台新增中筒袜",
    localizedContent: {
      "en-US": {
        title: "Admin Crew Socks",
        categoryLabel: "Crew Socks",
        description: "A clean admin-created sock for testing."
      }
    },
    categoryKey: "crew",
    categoryLabel: "中筒袜",
    price: 39,
    originalPrice: 59,
    discount: "34% OFF",
    description: "后台创建的柔软中筒袜。",
    isRecommended: true,
    isTopRated: false,
    isBestSeller: false,
    ratingValue: 4.7,
    reviewCount: 12,
    recentlyBoughtLabel: "过去 24 小时有 80+ 人看过",
    shippingLabel: "满 $35 免配送费",
    deliveryEstimate: "预计 3-5 日送达",
    visualTone: "#f7f7f7",
    visualShadow: "soft",
    visualAccent: "#111111",
    visualPattern: "minimal",
    colors: ["Black", "White"],
    materials: ["Cotton blend"],
    sizeChart: [
      { size: "39", footLength: "24.5cm", usMen: "6.5", usWomen: "8" },
      { size: "40", footLength: "25cm", usMen: "7", usWomen: "8.5" }
    ],
    gallery: [
      { id: "img-admin-1", src: "/public/uploads/products/admin-placeholder.svg", alt: "后台新增中筒袜" }
    ],
    variants: [
      {
        skuId: `${id}-39`,
        size: "39",
        color: "Black",
        material: "Cotton blend",
        stockQuantity: 14,
        lowStockThreshold: 4,
        isAvailable: true
      },
      {
        skuId: `${id}-40`,
        size: "40",
        color: "White",
        material: "Cotton blend",
        stockQuantity: 8,
        lowStockThreshold: 3,
        isAvailable: true
      }
    ]
  };
}

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

const registerPayload = {
  name: "Alex Chen",
  email: "alex@example.com",
  password: "demo1234"
};

const addressPayload = {
  name: "Alex Chen",
  contact: "alex@example.com",
  address: "100 Demo Street",
  city: "Seattle",
  region: "WA",
  postalCode: "98101",
  note: "Leave at the door"
};

function getSessionCookie(response) {
  const setCookie = response.headers()["set-cookie"] || "";
  const match = /socks_session=([^;]+)/.exec(setCookie);
  return match ? `socks_session=${match[1]}` : "";
}

async function registerAndGetCookie(request) {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  return getSessionCookie(response);
}

async function registerApiUser(request, { name = "Admin User", email, password = "demo1234" } = {}) {
  const response = await request.post("/api/auth/register", {
    data: { name, email, password }
  });
  expect(response.ok()).toBe(true);
  return response.headers()["set-cookie"];
}

test("requires an admin session for admin summary", async ({ request }) => {
  const response = await request.get("/api/admin/summary");

  expect(response.status()).toBe(401);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
});

test("rejects non-admin users from admin summary", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "buyer@example.com" });

  const response = await request.get("/api/admin/summary", {
    headers: { cookie }
  });

  expect(response.status()).toBe(403);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_FORBIDDEN");
});

test("rejects non-admin users from admin review management", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "review-buyer@example.com" });
  const response = await request.get("/api/admin/reviews", { headers: { cookie } });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("ADMIN_FORBIDDEN");
});

test("moderates and replies to reviews through admin APIs", async ({ request }) => {
  const created = await request.post("/api/products/sock-01/reviews", {
    data: { author: "API Guest", rating: 3, body: "等待后台审核的接口评论。", locale: "zh-CN" }
  });
  const review = (await created.json()).review;
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const list = await request.get("/api/admin/reviews?status=pending&q=接口评论", { headers: { cookie } });
  expect(list.ok()).toBe(true);
  expect((await list.json()).reviews.map((item) => item.id)).toContain(review.id);

  const moderated = await request.post("/api/admin/reviews/actions/moderate", {
    headers: { cookie },
    data: {
      operationId: "op-review-publish-api",
      action: "publish",
      reviewIds: [review.id],
      reason: "content_verified",
      note: "接口审核通过"
    }
  });
  expect(moderated.ok()).toBe(true);
  expect((await moderated.json()).reviews[0].status).toBe("published");

  const replyBody = { operationId: "op-review-reply-api", replyBody: "感谢您的真实反馈。" };
  const reply = await request.post(`/api/admin/reviews/${review.id}/actions/reply`, {
    headers: { cookie }, data: replyBody
  });
  expect(reply.ok()).toBe(true);
  expect((await reply.json()).review.reply.body).toBe(replyBody.replyBody);

  const mismatch = await request.post(`/api/admin/reviews/${review.id}/actions/reply`, {
    headers: { cookie },
    data: { operationId: replyBody.operationId, replyBody: "不同的重放内容" }
  });
  expect(mismatch.status()).toBe(409);
  expect((await mismatch.json()).error.code).toBe("ADMIN_OPERATION_DUPLICATE_MISMATCH");
});

test("returns admin dashboard summary for demo admins", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });

  const response = await request.get("/api/admin/summary", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.summary).toMatchObject({
    ordersTotal: 1,
    pendingPayment: 1,
    lowStockSkuCount: expect.any(Number),
    outOfStockSkuCount: expect.any(Number),
    activeMarketingCount: expect.any(Number)
  });
  expect(payload.recentOrders[0].id).toMatch(/^SOCK-/);
  expect(Array.isArray(payload.stockAlerts)).toBe(true);
  expect(Array.isArray(payload.workQueue)).toBe(true);
});

test("returns admin product summaries for demo admins", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.get("/api/admin/products", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.products.length).toBeGreaterThan(0);
  expect(payload.products[0]).toMatchObject({
    id: "sock-01",
    title: expect.any(String),
    variantCount: expect.any(Number),
    totalStock: expect.any(Number),
    lowStockCount: expect.any(Number),
    outOfStockCount: expect.any(Number)
  });
});

test("returns full admin product details for demo admins", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.get("/api/admin/products/sock-01", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.product).toMatchObject({
    id: "sock-01",
    title: expect.any(String),
    gallery: expect.any(Array),
    variants: expect.any(Array),
    sizeChart: expect.any(Array)
  });
  expect(payload.product.variants[0]).toMatchObject({
    skuId: expect.any(String),
    size: expect.any(String),
    stockQuantity: expect.any(Number)
  });
});

test("creates an admin product and exposes it in storefront products", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const product = createAdminProductFixture("sock-admin-new");

  const response = await request.post("/api/admin/products", {
    headers: { cookie },
    data: { product }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.product).toMatchObject({
    id: "sock-admin-new",
    title: "后台新增中筒袜"
  });

  const storefrontResponse = await request.get("/api/products?locale=zh-CN&pageSize=48");
  const storefrontPayload = await storefrontResponse.json();
  const created = storefrontPayload.items.find((item) => item.id === "sock-admin-new");
  expect(created).toMatchObject({
    id: "sock-admin-new",
    title: "后台新增中筒袜",
    categoryKey: "crew"
  });
  expect(created.variants).toHaveLength(2);
});

test("updates admin product details and storefront reads the saved payload", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const detailResponse = await request.get("/api/admin/products/sock-01", { headers: { cookie } });
  const product = (await detailResponse.json()).product;

  const response = await request.patch("/api/admin/products/sock-01", {
    headers: { cookie },
    data: {
      product: {
        ...product,
        title: "后台编辑后的中筒袜",
        price: 42,
        variants: product.variants.map((variant, index) => index === 0
          ? { ...variant, stockQuantity: 6, lowStockThreshold: 2 }
          : variant)
      }
    }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.product.title).toBe("后台编辑后的中筒袜");

  const storefrontResponse = await request.get("/api/products?locale=zh-CN&pageSize=48");
  const storefrontPayload = await storefrontResponse.json();
  const updated = storefrontPayload.items.find((item) => item.id === "sock-01");
  expect(updated.title).toBe("后台编辑后的中筒袜");
  expect(updated.price).toBe(42);
  expect(updated.variants[0].stockQuantity).toBe(6);
});

test("rejects non-admin access to admin product write APIs", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "buyer@example.com" });
  const product = createAdminProductFixture("sock-non-admin");

  const response = await request.post("/api/admin/products", {
    headers: { cookie },
    data: { product }
  });

  expect(response.status()).toBe(403);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_FORBIDDEN");
});

test("rejects invalid admin product payloads", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const product = createAdminProductFixture("INVALID ID");

  const response = await request.post("/api/admin/products", {
    headers: { cookie },
    data: { product }
  });

  expect(response.status()).toBe(400);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_PRODUCT_ID_INVALID");
});

test("uploads a product image to local public uploads for admins", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  const imageBuffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#eeeeee"/></svg>`);

  const response = await request.post("/api/admin/products/sock-01/images", {
    headers: { cookie },
    multipart: {
      image: {
        name: "sock-clean.svg",
        mimeType: "image/svg+xml",
        buffer: imageBuffer
      }
    }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.image).toMatchObject({
    src: expect.stringMatching(/^\/public\/uploads\/products\/sock-01-/),
    alt: "sock-01 product image"
  });
});

test("rejects invalid admin product image uploads", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.post("/api/admin/products/sock-01/images", {
    headers: { cookie },
    multipart: {
      image: {
        name: "bad.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not an image")
      }
    }
  });

  expect(response.status()).toBe(400);
  const payload = await response.json();
  expect(payload.error.code).toBe("ADMIN_IMAGE_TYPE_INVALID");
});

test("returns filtered admin inventory rows", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.get("/api/admin/inventory?stock=low-stock&q=sock-04", {
    headers: { cookie }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.items.length).toBeGreaterThan(0);
  payload.items.forEach((item) => {
    expect(item.stockState).toBe("low-stock");
    expect(item.skuId).toContain("sock-04");
  });
});

test("updates SKU inventory from admin API and reflects it in products", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.patch("/api/admin/inventory/sock-01-39", {
    headers: { cookie },
    data: { stockQuantity: 0, lowStockThreshold: 2, isAvailable: false }
  });

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.item).toMatchObject({
    skuId: "sock-01-39",
    stockQuantity: 0,
    lowStockThreshold: 2,
    isAvailable: false,
    stockState: "out-of-stock"
  });

  const productsResponse = await request.get("/api/products?locale=en-US&pageSize=24");
  const productsPayload = await productsResponse.json();
  const product = productsPayload.items.find((item) => item.id === "sock-01");
  expect(product.variants.find((variant) => variant.skuId === "sock-01-39")).toMatchObject({
    stockQuantity: 0,
    isAvailable: false
  });
});

test("lists admin orders and advances an order status", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const createResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await createResponse.json()).order;

  const listResponse = await request.get("/api/admin/orders", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  expect((await listResponse.json()).orders[0].id).toBe(order.id);

  const statusResponse = await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "cancelled", locale: "en-US" }
  });
  expect(statusResponse.ok()).toBe(true);
  const statusPayload = await statusResponse.json();
  expect(statusPayload.order.status).toBe("cancelled");
  expect(statusPayload.order.timeline.map((entry) => entry.status)).toContain("cancelled");
});

test("ships a processing order with an admin supplied carrier and tracking number", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "processing", locale: "zh-CN" }
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

  const payload = await response.json();
  expect(response.ok(), JSON.stringify(payload)).toBe(true);
  expect(payload.order.status).toBe("shipped");
  expect(payload.fulfillment).toMatchObject({
    carrier: "ups",
    trackingNumber: "1Z999AA10123456784",
    status: "label_created"
  });
});

test("cancels a paid unshipped order with one inventory restock", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const dbAfterCheckout = createDatabase(testDbFile);
  const stockAfterCheckout = dbAfterCheckout.prepare(
    "SELECT stock_quantity FROM product_variants WHERE sku_id = ?"
  ).get("sock-01-39").stock_quantity;
  dbAfterCheckout.close();

  const body = {
    operationId: "op-api-cancel-001",
    reason: "customer_request",
    note: "客户要求取消",
    locale: "zh-CN"
  };
  const first = await request.post(`/api/admin/orders/${order.id}/actions/cancel`, {
    headers: { cookie },
    data: body
  });
  const second = await request.post(`/api/admin/orders/${order.id}/actions/cancel`, {
    headers: { cookie },
    data: body
  });

  const payload = await first.json();
  const replayPayload = await second.json();
  expect(first.ok(), JSON.stringify(payload)).toBe(true);
  expect(second.ok(), JSON.stringify(replayPayload)).toBe(true);
  expect(payload.order.status).toBe("refund_pending");
  expect(payload.refund.amount).toBe(order.totals.total);
  expect(replayPayload.replayed).toBe(true);

  const dbAfterCancel = createDatabase(testDbFile);
  const stockAfterCancel = dbAfterCancel.prepare(
    "SELECT stock_quantity FROM product_variants WHERE sku_id = ?"
  ).get("sock-01-39").stock_quantity;
  const movementCount = dbAfterCancel.prepare(`
    SELECT COUNT(*) AS count FROM inventory_movements WHERE operation_id = ?
  `).get(body.operationId).count;
  dbAfterCancel.close();
  expect(stockAfterCancel).toBe(stockAfterCheckout + 1);
  expect(movementCount).toBe(1);
});

test("creates itemized partial refunds and rejects cumulative over-refunds", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 2 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const item = order.items[0];
  const dbAfterCheckout = createDatabase(testDbFile);
  const stockAfterCheckout = dbAfterCheckout.prepare(
    "SELECT stock_quantity FROM product_variants WHERE sku_id = ?"
  ).get(item.skuId).stock_quantity;
  dbAfterCheckout.close();

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
  const firstPayload = await first.json();
  expect(first.status(), JSON.stringify(firstPayload)).toBe(201);
  expect(firstPayload.refund.items[0]).toMatchObject({
    skuId: item.skuId,
    quantity: 1,
    refundAmount: 1000
  });

  const excessive = await request.post(`/api/admin/orders/${order.id}/actions/refund`, {
    headers: { cookie },
    data: {
      operationId: "op-partial-refund-002",
      reason: "quality_issue",
      items: [{ skuId: item.skuId, quantity: 2, refundAmount: 999999 }],
      locale: "zh-CN"
    }
  });
  expect(excessive.status()).toBe(409);
  await expect(excessive.json()).resolves.toMatchObject({
    error: { code: expect.stringMatching(/ADMIN_REFUND_(QUANTITY|AMOUNT)_EXCEEDED/) }
  });

  const dbAfterRefund = createDatabase(testDbFile);
  const stockAfterRefund = dbAfterRefund.prepare(
    "SELECT stock_quantity FROM product_variants WHERE sku_id = ?"
  ).get(item.skuId).stock_quantity;
  dbAfterRefund.close();
  expect(stockAfterRefund).toBe(stockAfterCheckout);
});

test("reviews return refunds and restocks inventory once on completion", async ({ request }) => {
  const buyerCookie = await registerApiUser(request, { email: "return-buyer@example.com" });
  await request.post("/api/cart/items", {
    headers: { cookie: buyerCookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie: buyerCookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie: buyerCookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const createReturnResponse = await request.post("/api/returns", {
    headers: { cookie: buyerCookie },
    data: {
      orderId: order.id,
      type: "return_refund",
      reason: "quality_issue",
      contact: "return-buyer@example.com",
      note: "商品存在瑕疵。",
      items: [{ skuId: order.items[0].skuId, quantity: 1 }],
      locale: "zh-CN"
    }
  });
  const returnRequest = (await createReturnResponse.json()).returnRequest;
  const adminCookie = await registerApiUser(request, { email: "admin@socks.test" });

  const reviewing = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
    headers: { cookie: adminCookie },
    data: {
      operationId: "op-review-001",
      action: "start_review",
      reason: "review_started",
      locale: "zh-CN"
    }
  });
  const reviewingPayload = await reviewing.json();
  expect(reviewing.ok(), JSON.stringify(reviewingPayload)).toBe(true);
  expect(reviewingPayload.returnRequest.status).toBe("reviewing");

  const approved = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
    headers: { cookie: adminCookie },
    data: {
      operationId: "op-review-002",
      action: "approve",
      reason: "evidence_confirmed",
      refundItems: [{ skuId: order.items[0].skuId, quantity: 1, refundAmount: 1000 }],
      locale: "zh-CN"
    }
  });
  const approvedPayload = await approved.json();
  expect(approved.ok(), JSON.stringify(approvedPayload)).toBe(true);
  expect(approvedPayload.returnRequest.status).toBe("approved");
  expect(approvedPayload.refund.returnRequestId).toBe(returnRequest.id);

  const dbBeforeCompletion = createDatabase(testDbFile);
  const stockBeforeCompletion = dbBeforeCompletion.prepare(
    "SELECT stock_quantity FROM product_variants WHERE sku_id = ?"
  ).get(order.items[0].skuId).stock_quantity;
  dbBeforeCompletion.close();
  const completeBody = {
    operationId: "op-review-003",
    action: "complete",
    reason: "item_received",
    locale: "zh-CN"
  };
  const completed = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
    headers: { cookie: adminCookie },
    data: completeBody
  });
  const replayed = await request.post(`/api/admin/returns/${returnRequest.id}/actions/review`, {
    headers: { cookie: adminCookie },
    data: completeBody
  });
  expect((await completed.json()).returnRequest.status).toBe("completed");
  expect((await replayed.json()).replayed).toBe(true);

  const dbAfterCompletion = createDatabase(testDbFile);
  const stockAfterCompletion = dbAfterCompletion.prepare(
    "SELECT stock_quantity FROM product_variants WHERE sku_id = ?"
  ).get(order.items[0].skuId).stock_quantity;
  const movementCount = dbAfterCompletion.prepare(`
    SELECT COUNT(*) AS count FROM inventory_movements WHERE operation_id = ?
  `).get(completeBody.operationId).count;
  dbAfterCompletion.close();
  expect(stockAfterCompletion).toBe(stockBeforeCompletion + 1);
  expect(movementCount).toBe(1);
});

test("returns admin order operation detail with refunds refundable items and audit events", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  await request.post(`/api/admin/orders/${order.id}/actions/refund`, {
    headers: { cookie },
    data: {
      operationId: "op-detail-refund-001",
      reason: "quality_issue",
      items: [{ skuId: order.items[0].skuId, quantity: 1, refundAmount: 1000 }],
      locale: "zh-CN"
    }
  });

  const response = await request.get(`/api/admin/orders/${order.id}`, {
    headers: { cookie }
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.order.id).toBe(order.id);
  expect(payload.refunds).toHaveLength(1);
  expect(payload.refundable.items[0]).toMatchObject({
    skuId: order.items[0].skuId,
    refundedQuantity: 1,
    remainingQuantity: 0
  });
  expect(payload.adminActions).toEqual([
    expect.objectContaining({ operationId: "op-detail-refund-001", action: "refund" })
  ]);
});

test("lists and filters return requests for demo admins", async ({ request }) => {
  const buyerCookie = await registerApiUser(request, { email: "returns-list@example.com" });
  await request.post("/api/cart/items", {
    headers: { cookie: buyerCookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie: buyerCookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/orders/${order.id}/status`, {
    headers: { cookie: buyerCookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const returnResponse = await request.post("/api/returns", {
    headers: { cookie: buyerCookie },
    data: {
      orderId: order.id,
      type: "refund_only",
      reason: "quality_issue",
      contact: "returns-list@example.com",
      items: [{ skuId: order.items[0].skuId, quantity: 1 }],
      locale: "zh-CN"
    }
  });
  const created = (await returnResponse.json()).returnRequest;
  const adminCookie = await registerApiUser(request, { email: "admin@socks.test" });

  const response = await request.get(`/api/admin/returns?status=submitted&q=${encodeURIComponent(order.id)}`, {
    headers: { cookie: adminCookie }
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.returnRequests).toEqual([
    expect.objectContaining({
      id: created.id,
      orderId: order.id,
      type: "refund_only",
      status: "submitted",
      refunds: []
    })
  ]);
});

test("keeps an order active after a partial refund succeeds", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  await request.patch(`/api/admin/orders/${order.id}/status`, {
    headers: { cookie },
    data: { status: "paid", locale: "zh-CN" }
  });
  const refundResponse = await request.post(`/api/admin/orders/${order.id}/actions/refund`, {
    headers: { cookie },
    data: {
      operationId: "op-partial-status-001",
      reason: "quality_issue",
      items: [{ skuId: order.items[0].skuId, quantity: 1, refundAmount: 1000 }],
      locale: "zh-CN"
    }
  });
  const refund = (await refundResponse.json()).refund;

  await request.patch(`/api/refunds/${refund.id}/status`, {
    headers: { cookie },
    data: { status: "processing", locale: "zh-CN" }
  });
  const succeeded = await request.patch(`/api/refunds/${refund.id}/status`, {
    headers: { cookie },
    data: { status: "succeeded", locale: "zh-CN" }
  });
  const payload = await succeeded.json();

  expect(payload.refund.status).toBe("succeeded");
  expect(payload.order.status).toBe("paid");
  expect(payload.order.timeline.map((entry) => entry.status)).not.toContain("refunded");
});

test("protects admin order actions and rejects mismatched idempotency replays", async ({ request }) => {
  const buyerCookie = await registerApiUser(request, { email: "action-buyer@example.com" });
  const forbidden = await request.post("/api/admin/orders/missing/actions/cancel", {
    headers: { cookie: buyerCookie },
    data: { operationId: "op-forbidden", reason: "customer_request", locale: "zh-CN" }
  });
  expect(forbidden.status()).toBe(403);
  expect((await forbidden.json()).error.code).toBe("ADMIN_FORBIDDEN");

  const adminCookie = await registerApiUser(request, { email: "admin@socks.test" });
  await request.post("/api/cart/items", {
    headers: { cookie: adminCookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const orderResponse = await request.post("/api/orders", {
    headers: { cookie: adminCookie },
    data: checkoutPayload
  });
  const order = (await orderResponse.json()).order;
  const firstBody = {
    operationId: "op-mismatch-001",
    reason: "customer_request",
    note: "第一次请求",
    locale: "zh-CN"
  };
  const first = await request.post(`/api/admin/orders/${order.id}/actions/cancel`, {
    headers: { cookie: adminCookie },
    data: firstBody
  });
  expect(first.ok()).toBe(true);

  const mismatch = await request.post(`/api/admin/orders/${order.id}/actions/cancel`, {
    headers: { cookie: adminCookie },
    data: { ...firstBody, note: "不同的请求内容" }
  });
  expect(mismatch.status()).toBe(409);
  expect((await mismatch.json()).error.code).toBe("ADMIN_OPERATION_DUPLICATE_MISMATCH");
});

test("returns and toggles admin marketing resources", async ({ request }) => {
  const cookie = await registerApiUser(request, { email: "admin@socks.test" });

  const listResponse = await request.get("/api/admin/marketing", {
    headers: { cookie }
  });
  expect(listResponse.ok()).toBe(true);
  const listPayload = await listResponse.json();
  expect(listPayload.coupons.map((coupon) => coupon.code)).toContain("SOCK10");

  const updateResponse = await request.patch("/api/admin/marketing/coupon/SOCK10/status", {
    headers: { cookie },
    data: { status: "inactive" }
  });
  expect(updateResponse.ok()).toBe(true);
  expect((await updateResponse.json()).resource).toMatchObject({
    code: "SOCK10",
    status: "inactive"
  });

  const marketingResponse = await request.get("/api/marketing");
  const marketingPayload = await marketingResponse.json();
  expect(marketingPayload.coupons.map((coupon) => coupon.code)).not.toContain("SOCK10");
});

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

test("registers a user and creates an http-only session", async ({ request }) => {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  expect(response.headers()["set-cookie"]).toContain("SameSite=Lax");

  const payload = await response.json();
  expect(payload.user).toMatchObject({
    name: "Alex Chen",
    email: "alex@example.com",
    addresses: []
  });
  expect(payload.user.id).toMatch(/^user-\d{4}$/);
  expect(payload.user.passwordHash).toBeUndefined();
  expect(payload.cart).toMatchObject({ items: [], meta: { itemCount: 0 } });

  const db = createDatabase(testDbFile);
  try {
    const user = db.prepare(`
      SELECT email, password_hash AS passwordHash, password_salt AS passwordSalt
      FROM users
      WHERE email = ?
    `).get(registerPayload.email);
    const session = db.prepare("SELECT COUNT(*) AS count FROM sessions").get();

    expect(user.passwordHash).toMatch(/^sha256:/);
    expect(user.passwordSalt.length).toBeGreaterThan(8);
    expect(session.count).toBe(1);
  } finally {
    db.close();
  }
});

test("persists registered users and sessions in SQLite", async ({ request }) => {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  const sessionCookie = getSessionCookie(response);
  expect(sessionCookie).toContain("socks_session=");

  const db = createDatabase(testDbFile);
  try {
    const user = db.prepare("SELECT email FROM users WHERE email = ?").get(registerPayload.email);
    const sessionId = sessionCookie.replace("socks_session=", "");
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
    expect(user).toEqual({ email: registerPayload.email });
    expect(session).toEqual({ id: sessionId });
  } finally {
    db.close();
  }
});

test("rejects duplicate user registration emails", async ({ request }) => {
  await request.post("/api/auth/register", { data: registerPayload });

  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("EMAIL_ALREADY_REGISTERED");
});

test("logs in a registered user and returns the active session user", async ({ request }) => {
  await request.post("/api/auth/register", { data: registerPayload });

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  expect(loginResponse.ok()).toBe(true);

  const sessionCookie = getSessionCookie(loginResponse);
  expect(sessionCookie).toContain("socks_session=");

  const sessionResponse = await request.get("/api/session", {
    headers: { cookie: sessionCookie }
  });
  expect(sessionResponse.ok()).toBe(true);
  const sessionPayload = await sessionResponse.json();
  expect(sessionPayload.authenticated).toBe(true);
  expect(sessionPayload.user.email).toBe(registerPayload.email);
});

test("rejects login with an incorrect password", async ({ request }) => {
  await request.post("/api/auth/register", { data: registerPayload });

  const response = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: "wrong-password" }
  });
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_CREDENTIALS");
});

test("logs out and clears the active session", async ({ request }) => {
  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const sessionCookie = getSessionCookie(registerResponse);

  const logoutResponse = await request.post("/api/auth/logout", {
    headers: { cookie: sessionCookie }
  });
  expect(logoutResponse.ok()).toBe(true);
  expect(logoutResponse.headers()["set-cookie"]).toContain("Max-Age=0");

  const sessionResponse = await request.get("/api/session", {
    headers: { cookie: sessionCookie }
  });
  expect(sessionResponse.ok()).toBe(true);
  await expect(sessionResponse.json()).resolves.toMatchObject({
    authenticated: false,
    user: null
  });
});

test("merges anonymous cart into the user cart after login", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 2 }
  });
  await request.post("/api/auth/register", { data: registerPayload });

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  const sessionCookie = getSessionCookie(loginResponse);
  const payload = await loginResponse.json();

  expect(payload.cart.items).toEqual([
    { productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 2 }
  ]);

  const userCartResponse = await request.get("/api/cart", {
    headers: { cookie: sessionCookie }
  });
  await expect(userCartResponse.json()).resolves.toMatchObject({
    items: [{ productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 2 }],
    meta: { itemCount: 1 }
  });

  const anonymousCart = JSON.parse(await fs.readFile(cartFile, "utf8"));
  expect(anonymousCart).toEqual({ items: [] });
});

test("keeps anonymous and logged-in carts isolated", async ({ request }) => {
  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const sessionCookie = getSessionCookie(registerResponse);

  await request.post("/api/cart/items", {
    headers: { cookie: sessionCookie },
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  await request.post("/api/auth/logout", {
    headers: { cookie: sessionCookie }
  });
  await request.post("/api/cart/items", {
    data: { productId: "sock-05", size: "39", quantity: 1 }
  });

  const anonymousCartResponse = await request.get("/api/cart");
  await expect(anonymousCartResponse.json()).resolves.toMatchObject({
    items: [{ productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }],
    meta: { itemCount: 1 }
  });

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  const nextSessionCookie = getSessionCookie(loginResponse);
  const userCartResponse = await request.get("/api/cart", {
    headers: { cookie: nextSessionCookie }
  });
  await expect(userCartResponse.json()).resolves.toMatchObject({
    items: [
      { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 1 },
      { productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }
    ],
    meta: { itemCount: 2 }
  });
});

test("caps anonymous cart merge quantities by SKU stock", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const sessionCookie = getSessionCookie(registerResponse);

  const response = await request.post("/api/cart/items", {
    headers: { cookie: sessionCookie },
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("INSUFFICIENT_STOCK");
});

test("requires authentication for address management", async ({ request }) => {
  const response = await request.get("/api/me/addresses");
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("AUTH_REQUIRED");
});

test("returns standardized API error details for invalid cart quantity", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 0 }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload).toEqual({
    ok: false,
    error: {
      code: "INVALID_QUANTITY",
      message: expect.any(String),
      details: {}
    }
  });
});

test("creates lists updates defaults and deletes user addresses", async ({ request }) => {
  const sessionCookie = await registerAndGetCookie(request);

  const createResponse = await request.post("/api/me/addresses", {
    headers: { cookie: sessionCookie },
    data: addressPayload
  });
  expect(createResponse.status()).toBe(201);
  const createPayload = await createResponse.json();
  expect(createPayload.address).toMatchObject({
    ...addressPayload,
    isDefault: true
  });
  expect(createPayload.address.id).toMatch(/^addr-\d{4}$/);

  const listResponse = await request.get("/api/me/addresses", {
    headers: { cookie: sessionCookie }
  });
  await expect(listResponse.json()).resolves.toMatchObject({
    addresses: [createPayload.address]
  });

  const secondResponse = await request.post("/api/me/addresses", {
    headers: { cookie: sessionCookie },
    data: {
      ...addressPayload,
      address: "200 Work Avenue",
      postalCode: "98102"
    }
  });
  expect(secondResponse.status()).toBe(201);
  const secondAddress = (await secondResponse.json()).address;
  expect(secondAddress.isDefault).toBe(false);

  const defaultResponse = await request.post(`/api/me/addresses/${secondAddress.id}/default`, {
    headers: { cookie: sessionCookie }
  });
  expect(defaultResponse.ok()).toBe(true);
  const defaultPayload = await defaultResponse.json();
  expect(defaultPayload.addresses.find((address) => address.id === secondAddress.id).isDefault).toBe(true);

  const patchResponse = await request.patch(`/api/me/addresses/${secondAddress.id}`, {
    headers: { cookie: sessionCookie },
    data: { note: "Front desk" }
  });
  expect(patchResponse.ok()).toBe(true);
  expect((await patchResponse.json()).address.note).toBe("Front desk");

  const deleteResponse = await request.delete(`/api/me/addresses/${secondAddress.id}`, {
    headers: { cookie: sessionCookie }
  });
  expect(deleteResponse.ok()).toBe(true);
  const deletePayload = await deleteResponse.json();
  expect(deletePayload.addresses).toHaveLength(1);
  expect(deletePayload.addresses[0].isDefault).toBe(true);
});

test("persists address changes in SQLite", async ({ request }) => {
  const sessionCookie = await registerAndGetCookie(request);

  const response = await request.post("/api/me/addresses", {
    headers: { cookie: sessionCookie },
    data: addressPayload
  });
  expect(response.status()).toBe(201);

  const db = createDatabase(testDbFile);
  try {
    const row = db.prepare("SELECT payload, is_default FROM addresses").get();
    expect(JSON.parse(row.payload)).toMatchObject({ address: "100 Demo Street" });
    expect(row.is_default).toBe(1);
  } finally {
    db.close();
  }
});

test("rejects order creation when cart is empty", async ({ request }) => {
  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("EMPTY_CART");
});

test("rejects order creation when required checkout fields are missing", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", {
    data: {
      locale: "en-US",
      customer: { name: "", contact: "" },
      shippingAddress: { address: "", city: "", region: "", postalCode: "" },
      shippingMethodId: "standard"
    }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("CHECKOUT_VALIDATION_FAILED");
  expect(payload.error.fields).toEqual([
    "customer.name",
    "customer.contact",
    "shippingAddress.address",
    "shippingAddress.city",
    "shippingAddress.region",
    "shippingAddress.postalCode"
  ]);
});

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

test("creates a persisted order from the current cart and clears the cart", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 2 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);

  const payload = await response.json();
  expect(payload.order).toMatchObject({
    status: "pending_payment",
    customer: checkoutPayload.customer,
    shippingAddress: checkoutPayload.shippingAddress,
    shippingMethod: {
      id: "standard",
      fee: 0
    },
    totals: {
      subtotal: 118,
      savings: 40,
      shipping: 0,
      total: 78
    }
  });
  expect(payload.order.totals).toMatchObject({
    tax: expect.any(Number),
    paymentFee: 0,
    grandTotal: expect.any(Number),
    currency: "CNY",
    taxRegion: "WA"
  });
  expect(payload.order.id).toMatch(/^SOCK-\d{8}-\d{4}$/);
  expect(payload.order.items).toEqual([
    {
      productId: "sock-01",
      skuId: "sock-01-39",
      title: "Minimal Crew Socks",
      size: "39",
      quantity: 2,
      price: 39,
      originalPrice: 59
    }
  ]);
  expect(payload.order.timeline[0].status).toBe("pending_payment");
  expect(payload.cart).toMatchObject({
    couponCode: "",
    items: [],
    meta: { itemCount: 0 },
    pricing: expect.objectContaining({
      total: 0
    })
  });

  const db = createDatabase(testDbFile);
  try {
    const persistedOrder = db.prepare("SELECT id FROM orders WHERE id = ?").get(payload.order.id);
    const cartItemCount = db.prepare("SELECT COUNT(*) AS count FROM cart_items").get();
    expect(persistedOrder).toEqual({ id: payload.order.id });
    expect(cartItemCount.count).toBe(0);
  } finally {
    db.close();
  }
});

test("creates orders with an address-aware fulfillment snapshot", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", {
    data: {
      ...checkoutPayload,
      shippingAddress: {
        ...checkoutPayload.shippingAddress,
        region: "AK",
        postalCode: "99501"
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
    addressZone: "remote"
  });
  expect(payload.order.fulfillment.estimatedDeliveryDate).toEqual(expect.any(String));

  const fulfillmentResponse = await request.get(`/api/orders/${payload.order.id}/fulfillment`);
  expect(fulfillmentResponse.ok()).toBe(true);
  const fulfillmentPayload = await fulfillmentResponse.json();
  expect(fulfillmentPayload.fulfillment).toMatchObject({
    orderId: payload.order.id,
    status: "not_started",
    shippingMethodId: "express",
    addressZone: "remote"
  });
  expect(fulfillmentPayload.fulfillment.events).toEqual([
    expect.objectContaining({ status: "not_started" })
  ]);
});

test("persists skuId on order items created from cart", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  const payload = await response.json();

  expect(payload.order.items[0]).toMatchObject({
    productId: "sock-01",
    skuId: "sock-01-39",
    size: "39",
    quantity: 1
  });
});

test("creates SQLite orders and decrements SKU stock in one checkout transaction", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 2 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.order.items[0]).toMatchObject({ skuId: "sock-01-43", quantity: 2 });

  const db = createDatabase(testDbFile);
  try {
    const stock = db.prepare("SELECT stock_quantity FROM product_variants WHERE sku_id = ?").get("sock-01-43");
    const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(payload.order.id);
    expect(stock.stock_quantity).toBe(1);
    expect(order).toEqual({ id: payload.order.id });
  } finally {
    db.close();
  }
});

test("rolls back checkout when SKU stock is insufficient", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });

  const db = createDatabase(testDbFile);
  db.prepare("UPDATE product_variants SET stock_quantity = ? WHERE sku_id = ?").run(2, "sock-01-43");
  db.close();

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("INSUFFICIENT_STOCK");

  const cartResponse = await request.get("/api/cart");
  expect((await cartResponse.json()).items).toEqual([
    expect.objectContaining({ skuId: "sock-01-43", quantity: 3 })
  ]);
});

test("allows only one checkout to claim the final SKU stock", async ({ request }) => {
  const secondContext = await playwrightRequest.newContext({
    baseURL: "http://127.0.0.1:4173"
  });

  try {
    const firstAdd = await request.post("/api/cart/items", {
      data: { productId: "sock-01", size: "44", quantity: 2 }
    });
    const firstCookie = getSessionCookie(firstAdd);

    const secondAdd = await secondContext.post("/api/cart/items", {
      data: { productId: "sock-01", size: "44", quantity: 2 }
    });
    const secondCookie = getSessionCookie(secondAdd);

    const [firstCheckout, secondCheckout] = await Promise.all([
      request.post("/api/orders", { headers: { cookie: firstCookie }, data: checkoutPayload }),
      secondContext.post("/api/orders", { headers: { cookie: secondCookie }, data: checkoutPayload })
    ]);

    const statuses = [firstCheckout.status(), secondCheckout.status()].sort();
    expect(statuses).toEqual([201, 409]);
  } finally {
    await secondContext.dispose();
  }
});

async function createOrderViaApi(request) {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createLoggedInOrder(request, userPayload = registerPayload) {
  const registerResponse = await request.post("/api/auth/register", { data: userPayload });
  const sessionCookie = getSessionCookie(registerResponse);
  await request.post("/api/cart/items", {
    headers: { cookie: sessionCookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const response = await request.post("/api/orders", {
    headers: { cookie: sessionCookie },
    data: checkoutPayload
  });
  expect(response.status()).toBe(201);
  return {
    sessionCookie,
    order: (await response.json()).order
  };
}

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

test("creates orders with the logged-in user id and lists user order history", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request);
  expect(order.userId).toMatch(/^user-\d{4}$/);

  const historyResponse = await request.get("/api/me/orders", {
    headers: { cookie: sessionCookie }
  });
  expect(historyResponse.ok()).toBe(true);
  const historyPayload = await historyResponse.json();
  expect(historyPayload.orders).toHaveLength(1);
  expect(historyPayload.orders[0]).toMatchObject({
    id: order.id,
    status: "pending_payment",
    userId: order.userId
  });
});

test("does not expose another user's order detail", async ({ request }) => {
  const { order } = await createLoggedInOrder(request);
  const secondRegisterResponse = await request.post("/api/auth/register", {
    data: {
      name: "Mia Wong",
      email: "mia@example.com",
      password: "demo1234"
    }
  });
  const secondSessionCookie = getSessionCookie(secondRegisterResponse);

  const response = await request.get(`/api/orders/${order.id}`, {
    headers: { cookie: secondSessionCookie }
  });
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.error.code).toBe("ORDER_NOT_FOUND");
});

test("reorders an owned order into the current cart", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request, {
    name: "Reorder User",
    email: "reorder@example.com",
    password: "demo1234"
  });

  const reorderResponse = await request.post(`/api/orders/${order.id}/reorder`, {
    headers: { cookie: sessionCookie }
  });
  expect(reorderResponse.ok()).toBe(true);
  await expect(reorderResponse.json()).resolves.toMatchObject({
    ok: true,
    addedItems: [{ productId: "sock-01", size: "39", quantity: 1 }],
    cart: {
      meta: { itemCount: 1 }
    }
  });
});

test("does not reorder another user's order", async ({ request }) => {
  const { order } = await createLoggedInOrder(request, {
    name: "Order Owner",
    email: "owner@example.com",
    password: "demo1234"
  });
  const otherResponse = await request.post("/api/auth/register", {
    data: { name: "Other User", email: "other@example.com", password: "demo1234" }
  });
  const otherCookie = getSessionCookie(otherResponse);

  const reorderResponse = await request.post(`/api/orders/${order.id}/reorder`, {
    headers: { cookie: otherCookie }
  });
  expect(reorderResponse.status()).toBe(404);
  await expect(reorderResponse.json()).resolves.toMatchObject({
    error: { code: "ORDER_NOT_FOUND" }
  });
});

test("requires login for user order history", async ({ request }) => {
  const response = await request.get("/api/me/orders");
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("AUTH_REQUIRED");
});

test("returns a persisted order by id", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.get(`/api/orders/${order.id}`);
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.order.id).toBe(order.id);
  expect(payload.order.status).toBe("pending_payment");
  expect(payload.order.items[0].title).toBe("Minimal Crew Socks");
});

test("returns 404 for missing order id", async ({ request }) => {
  const response = await request.get("/api/orders/SOCK-20990101-9999");
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.error.code).toBe("ORDER_NOT_FOUND");
});

test("returns standardized API error details for missing order", async ({ request }) => {
  const response = await request.get("/api/orders/SOCK-20990101-9999");
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.ok).toBe(false);
  expect(payload.error).toMatchObject({
    code: "ORDER_NOT_FOUND",
    message: expect.any(String),
    details: {}
  });
});

test("advances order status through the allowed lifecycle", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const paidResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "paid", locale: "en-US" }
  });
  expect(paidResponse.ok()).toBe(true);
  expect((await paidResponse.json()).order.status).toBe("paid");

  const processingResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "processing", locale: "en-US" }
  });
  expect(processingResponse.ok()).toBe(true);
  expect((await processingResponse.json()).order.status).toBe("processing");

  const shippedResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped", locale: "en-US" }
  });
  expect(shippedResponse.ok()).toBe(true);
  expect((await shippedResponse.json()).order.status).toBe("shipped");

  const deliveredResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "delivered", locale: "en-US" }
  });
  expect(deliveredResponse.ok()).toBe(true);
  const deliveredPayload = await deliveredResponse.json();
  expect(deliveredPayload.order.status).toBe("delivered");
  expect(deliveredPayload.order.timeline.map((entry) => entry.status)).toEqual([
    "pending_payment",
    "paid",
    "processing",
    "shipped",
    "delivered"
  ]);
});

test("rejects invalid order status transitions", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped", locale: "en-US" }
  });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_ORDER_TRANSITION");
});

test("cancels pending payment orders without creating a refund", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.post(`/api/orders/${order.id}/cancel`, {
    data: { reason: "changed_mind", locale: "en-US" }
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  expect(payload.order.status).toBe("cancelled");
  expect(payload.refund).toBeNull();
  expect(payload.order.fulfillment.status).toBe("cancelled");

  const refundsResponse = await request.get(`/api/orders/${order.id}/refunds`);
  expect(refundsResponse.ok()).toBe(true);
  expect((await refundsResponse.json()).refunds).toEqual([]);
});

test("cancels paid orders into refund progress", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });

  const response = await request.post(`/api/orders/${order.id}/cancel`, {
    data: { reason: "changed_mind", locale: "en-US" }
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  expect(payload.order.status).toBe("refund_pending");
  expect(payload.order.refund).toMatchObject({
    status: "requested",
    amount: order.totals.total
  });
  expect(payload.refund).toMatchObject({
    orderId: order.id,
    status: "requested",
    amount: order.totals.total
  });

  const refundsResponse = await request.get(`/api/orders/${order.id}/refunds`);
  expect(refundsResponse.ok()).toBe(true);
  const refundsPayload = await refundsResponse.json();
  expect(refundsPayload.refunds).toHaveLength(1);
  expect(refundsPayload.refunds[0].events).toEqual([
    expect.objectContaining({ status: "requested" })
  ]);
});

test("rejects cancellation after an order has shipped", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });
  await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "processing", locale: "en-US" }
  });
  await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped", locale: "en-US" }
  });

  const response = await request.post(`/api/orders/${order.id}/cancel`, {
    data: { reason: "changed_mind", locale: "en-US" }
  });
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("ORDER_CANCEL_NOT_ALLOWED");
});

test("generates tracking events and advances fulfillment to delivery", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", outcome: "succeeded", locale: "en-US" }
  });

  const processingResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "processing", locale: "en-US" }
  });
  expect((await processingResponse.json()).order.fulfillment.status).toBe("preparing");

  const shippedResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped", locale: "en-US" }
  });
  const shippedPayload = await shippedResponse.json();
  expect(shippedPayload.order.fulfillment).toMatchObject({
    status: "label_created",
    trackingNumber: expect.stringMatching(/^TRK-/)
  });

  const inTransitResponse = await request.patch(`/api/orders/${order.id}/fulfillment/status`, {
    headers: { "x-demo-admin": "true" },
    data: { status: "in_transit", locale: "en-US" }
  });
  expect(inTransitResponse.ok()).toBe(true);

  await request.patch(`/api/orders/${order.id}/fulfillment/status`, {
    headers: { "x-demo-admin": "true" },
    data: { status: "out_for_delivery", locale: "en-US" }
  });
  const deliveredResponse = await request.patch(`/api/orders/${order.id}/fulfillment/status`, {
    headers: { "x-demo-admin": "true" },
    data: { status: "delivered", locale: "en-US" }
  });
  const deliveredPayload = await deliveredResponse.json();

  expect(deliveredPayload.order.status).toBe("delivered");
  expect(deliveredPayload.fulfillment.events.map((event) => event.status)).toEqual([
    "not_started",
    "preparing",
    "label_created",
    "in_transit",
    "out_for_delivery",
    "delivered"
  ]);
});

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
    amount: order.totals.grandTotal
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

test("processes a successful payment webhook and creates an invoice", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const paymentResponse = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", locale: "en-US" }
  });
  expect(paymentResponse.status()).toBe(201);
  const paymentPayload = await paymentResponse.json();
  expect(paymentPayload.payment).toMatchObject({
    orderId: order.id,
    status: "processing"
  });

  const webhookResponse = await request.post("/api/payments/webhook", {
    data: {
      eventId: "evt-demo-success-0001",
      paymentId: paymentPayload.payment.id,
      orderId: order.id,
      status: "succeeded",
      provider: "demo_gateway",
      idempotencyKey: "demo-callback-success-0001",
      signature: "demo-signature",
      locale: "en-US"
    }
  });
  expect(webhookResponse.ok()).toBe(true);
  const webhookPayload = await webhookResponse.json();

  expect(webhookPayload.payment.status).toBe("succeeded");
  expect(webhookPayload.order.status).toBe("paid");
  expect(webhookPayload.invoice).toMatchObject({
    orderId: order.id,
    status: "issued",
    invoiceNumber: expect.stringMatching(/^INV-\d{8}-\d{4}$/)
  });
  expect(webhookPayload.order.payment.invoiceId).toBe(webhookPayload.invoice.id);
});

test("keeps orders pending after a failed payment webhook", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const paymentResponse = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "paypal", locale: "en-US" }
  });
  const paymentPayload = await paymentResponse.json();

  const webhookResponse = await request.post("/api/payments/webhook", {
    data: {
      eventId: "evt-demo-failed-0001",
      paymentId: paymentPayload.payment.id,
      orderId: order.id,
      status: "failed",
      provider: "demo_gateway",
      idempotencyKey: "demo-callback-failed-0001",
      signature: "demo-signature",
      failureReason: "Demo payment was declined. Please try another method.",
      locale: "en-US"
    }
  });
  expect(webhookResponse.ok()).toBe(true);
  const webhookPayload = await webhookResponse.json();

  expect(webhookPayload.payment).toMatchObject({
    status: "failed",
    failureReason: "Demo payment was declined. Please try another method."
  });
  expect(webhookPayload.order.status).toBe("pending_payment");
  expect(webhookPayload.invoice).toBeNull();
});

test("handles duplicate successful payment webhooks idempotently", async ({ request }) => {
  const { order } = await createOrderViaApi(request);
  const paymentResponse = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "card", locale: "en-US" }
  });
  const paymentPayload = await paymentResponse.json();
  const webhookBody = {
    eventId: "evt-demo-success-duplicate",
    paymentId: paymentPayload.payment.id,
    orderId: order.id,
    status: "succeeded",
    provider: "demo_gateway",
    idempotencyKey: "demo-callback-success-duplicate",
    signature: "demo-signature",
    locale: "en-US"
  };

  const firstResponse = await request.post("/api/payments/webhook", { data: webhookBody });
  const firstPayload = await firstResponse.json();
  const secondResponse = await request.post("/api/payments/webhook", { data: webhookBody });
  const secondPayload = await secondResponse.json();

  expect(firstResponse.ok()).toBe(true);
  expect(secondResponse.ok()).toBe(true);
  expect(secondPayload.event.eventStatus).toBe("duplicate");
  expect(secondPayload.invoice.id).toBe(firstPayload.invoice.id);
  expect(secondPayload.order.timeline.filter((entry) => entry.status === "paid")).toHaveLength(1);
});

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

test("keeps pending payment orders payable after a failed payment attempt", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.post(`/api/orders/${order.id}/payments`, {
    data: { method: "gift_card", outcome: "failed", locale: "en-US" }
  });

  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.payment).toMatchObject({
    orderId: order.id,
    method: "gift_card",
    status: "failed"
  });
  expect(payload.order.status).toBe("pending_payment");
  expect(payload.order.payment).toMatchObject({
    status: "failed",
    method: "gift_card"
  });
});

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

test("returns products with default filter and recommended sort", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toMatchObject({
    filter: "all",
    sort: "recommended",
    count: 8,
    totalCount: 12,
    page: 1,
    pageSize: 8,
    totalPages: 2,
    hasMore: true
  });
  expect(payload.items).toHaveLength(8);
  expect(payload.items[0].title).toBe("极简中筒袜");
  expect(payload.items[1].title).toBe("轻压运动袜");
  expect(payload.items[2].title).toBe("通勤罗口袜");
});

test("paginates products and returns load-more metadata", async ({ request }) => {
  const response = await request.get("/api/products?page=1&pageSize=5&locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.items).toHaveLength(5);
  expect(payload.meta).toMatchObject({
    filter: "all",
    sort: "recommended",
    count: 5,
    totalCount: 12,
    page: 1,
    pageSize: 5,
    totalPages: 3,
    hasMore: true
  });

  const secondResponse = await request.get("/api/products?page=3&pageSize=5&locale=en-US");
  expect(secondResponse.ok()).toBe(true);
  const secondPayload = await secondResponse.json();
  expect(secondPayload.items).toHaveLength(2);
  expect(secondPayload.meta).toMatchObject({
    count: 2,
    totalCount: 12,
    page: 3,
    pageSize: 5,
    totalPages: 3,
    hasMore: false
  });
});

test("serves products from the SQLite seed database", async ({ request }) => {
  const db = createDatabase(testDbFile);
  db.prepare("UPDATE product_variants SET stock_quantity = ? WHERE sku_id = ?").run(2, "sock-01-43");
  db.close();

  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const product = payload.items.find((item) => item.id === "sock-01");

  expect(product.title).toBe("Minimal Crew Socks");
  expect(product.variants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ skuId: "sock-01-43", stockQuantity: 2 })
    ])
  );
});

test("returns English localized product content when locale=en-US is requested", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toMatchObject({
    filter: "all",
    sort: "recommended",
    count: 8,
    totalCount: 12,
    locale: "en-US"
  });
  expect(payload.items[0]).toMatchObject({
    id: "sock-01",
    title: "Minimal Crew Socks",
    categoryLabel: "Crew Socks",
    description: "Soft, breathable fabric made for daily commuting and relaxed at-home wear."
  });
  expect(payload.items[1]).toMatchObject({
    id: "sock-02",
    title: "Compression Sport Socks",
    categoryLabel: "Sport Socks"
  });
});

test("searches localized product fields with q and locale", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US&q=quick-dry");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toMatchObject({
    filter: "all",
    sort: "recommended",
    count: 1,
    totalCount: 1,
    locale: "en-US",
    q: "quick-dry"
  });
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({
    id: "sock-04",
    title: "Quick-Dry Training Socks"
  });
});

test("filters sport products and sorts by ascending price", async ({ request }) => {
  const response = await request.get("/api/products?filter=sport&sort=price-asc");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toMatchObject({
    filter: "sport",
    sort: "price-asc",
    count: 4,
    totalCount: 4
  });
  expect(payload.items.map((item) => item.title)).toEqual([
    "速干训练袜",
    "轻压运动袜",
    "夜跑反光运动袜",
    "厚底毛圈运动袜"
  ]);
});

test("filters products by price range", async ({ request }) => {
  const response = await request.get("/api/products?minPrice=40&maxPrice=50&pageSize=24&locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.items.length).toBeGreaterThan(0);
  payload.items.forEach((product) => {
    expect(product.price).toBeGreaterThanOrEqual(40);
    expect(product.price).toBeLessThanOrEqual(50);
  });
  expect(payload.meta.filters).toMatchObject({
    minPrice: 40,
    maxPrice: 50
  });
});

test("filters products by SKU size", async ({ request }) => {
  const response = await request.get("/api/products?size=43&pageSize=24&locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.items.length).toBeGreaterThan(0);
  payload.items.forEach((product) => {
    expect(product.variants.some((variant) => variant.size === "43")).toBe(true);
  });
  expect(payload.meta.filters.size).toBe("43");
});

test("filters products by stock state", async ({ request }) => {
  const lowStockResponse = await request.get("/api/products?stock=low-stock&pageSize=24&locale=en-US");
  expect(lowStockResponse.ok()).toBe(true);
  const lowStockPayload = await lowStockResponse.json();
  expect(lowStockPayload.items.length).toBeGreaterThan(0);
  lowStockPayload.items.forEach((product) => {
    expect(product.variants.some((variant) => {
      return variant.isAvailable && variant.stockQuantity > 0 && variant.stockQuantity <= variant.lowStockThreshold;
    })).toBe(true);
  });

  const outOfStockResponse = await request.get("/api/products?stock=out-of-stock&pageSize=24&locale=en-US");
  expect(outOfStockResponse.ok()).toBe(true);
  const outOfStockPayload = await outOfStockResponse.json();
  outOfStockPayload.items.forEach((product) => {
    expect(product.variants.some((variant) => variant.isAvailable && variant.stockQuantity > 0)).toBe(false);
  });
});

test("filters products by minimum rating", async ({ request }) => {
  const response = await request.get("/api/products?ratingMin=4.7&pageSize=24&locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.items.length).toBeGreaterThan(0);
  payload.items.forEach((product) => {
    expect(product.ratingValue).toBeGreaterThanOrEqual(4.7);
  });
  expect(payload.meta.filters.ratingMin).toBe(4.7);
});

test("returns recommendations when product search has no results", async ({ request }) => {
  const response = await request.get("/api/products?q=not-a-real-sock-query&maxPrice=1&pageSize=8&locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.items).toEqual([]);
  expect(payload.meta.totalCount).toBe(0);
  expect(payload.recommendations.length).toBeGreaterThan(0);
  expect(payload.recommendations.length).toBeLessThanOrEqual(4);
  payload.recommendations.forEach((product) => {
    expect(product.variants.some((variant) => variant.isAvailable && variant.stockQuantity > 0)).toBe(true);
    expect(typeof product.title).toBe("string");
  });
});

test("falls back to default filter and recommended sort for invalid query values", async ({ request }) => {
  const response = await request.get("/api/products?filter=business&sort=featured");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toMatchObject({
    filter: "all",
    sort: "recommended",
    count: 8,
    totalCount: 12
  });
  expect(payload.items.slice(0, 3).map((item) => item.title)).toEqual([
    "极简中筒袜",
    "轻压运动袜",
    "通勤罗口袜"
  ]);
});

test("returns an empty anonymous cart by default", async ({ request }) => {
  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload).toMatchObject({
    couponCode: "",
    items: [],
    meta: { itemCount: 0 },
    pricing: expect.objectContaining({
      total: 0
    })
  });
});

test("does not read live cart state from JSON files after SQLite migration", async ({ request }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 99 }]
  }, null, 2)}\n`, "utf8");

  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    items: [],
    meta: { itemCount: 0 }
  });
});

test("adds an item to the cart and persists quantity merges", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  expect(firstAdd.ok()).toBe(true);

  const secondAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  expect(secondAdd.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);

  const cartPayload = await cartResponse.json();
  expect(cartPayload.items).toEqual([
    { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 2 }
  ]);
  expect(cartPayload.meta.itemCount).toBe(1);
});

test("persists anonymous cart items in SQLite by session cookie", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 2 }
  });
  expect(addResponse.ok()).toBe(true);

  const sessionCookie = getSessionCookie(addResponse);
  expect(sessionCookie).toContain("socks_session=");
  const sessionId = sessionCookie.replace("socks_session=", "");

  const db = createDatabase(testDbFile);
  try {
    const cart = db.prepare(`
      SELECT id, owner_type AS ownerType, session_id AS sessionId
      FROM carts
      WHERE session_id = ?
    `).get(sessionId);
    const item = db.prepare(`
      SELECT product_id AS productId, sku_id AS skuId, size, quantity
      FROM cart_items
      WHERE cart_id = ?
    `).get(cart.id);

    expect(cart).toMatchObject({
      ownerType: "anonymous",
      sessionId
    });
    expect(item).toEqual({
      productId: "sock-02",
      skuId: "sock-02-43",
      size: "43",
      quantity: 2
    });
  } finally {
    db.close();
  }

  const cartResponse = await request.get("/api/cart", {
    headers: { cookie: sessionCookie }
  });
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toMatchObject({
    items: [{ productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 2 }],
    meta: { itemCount: 1 }
  });
});

test("rejects invalid cart size values", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "35", quantity: 1 }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_SIZE");
});

test("clears the anonymous cart state", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "35", quantity: 1 }
  });
  expect(addResponse.ok()).toBe(true);

  const clearResponse = await request.post("/api/cart/clear");
  expect(clearResponse.ok()).toBe(true);

  const clearPayload = await clearResponse.json();
  expect(clearPayload).toMatchObject({
    ok: true,
    items: [],
    meta: { itemCount: 0 }
  });

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toMatchObject({
    items: [],
    meta: { itemCount: 0 }
  });
});

test("adds a valid SKU-backed size and stores skuId on the cart item", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.item).toMatchObject({
    productId: "sock-01",
    skuId: "sock-01-39",
    size: "39",
    quantity: 1
  });

  const cartResponse = await request.get("/api/cart");
  await expect(cartResponse.json()).resolves.toMatchObject({
    items: [
      { productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 1 }
    ]
  });
});

test("rejects sold-out SKU sizes", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "45", quantity: 1 }
  });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("OUT_OF_STOCK");
});

test("enforces stock independently for each SKU size", async ({ request }) => {
  const firstResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  expect(firstResponse.ok()).toBe(true);

  const secondResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "44", quantity: 2 }
  });
  expect(secondResponse.ok()).toBe(true);

  const overLimitResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });
  expect(overLimitResponse.status()).toBe(409);
  expect((await overLimitResponse.json()).error.code).toBe("INSUFFICIENT_STOCK");
});

test("updates SKU-backed cart item quantities up to that SKU stock", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });

  const response = await request.patch("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).item).toMatchObject({
    skuId: "sock-01-43",
    quantity: 3
  });

  const overLimitResponse = await request.patch("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 4 }
  });
  expect(overLimitResponse.status()).toBe(409);
  expect((await overLimitResponse.json()).error.code).toBe("INSUFFICIENT_STOCK");
});

test("ignores legacy JSON cart items when enforcing SQLite cart stock limits", async ({ request }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-10", size: "35", quantity: 8 }]
  }, null, 2)}\n`, "utf8");

  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 1 }
  });

  expect(response.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  await expect(cartResponse.json()).resolves.toMatchObject({
    items: [{ productId: "sock-10", skuId: "sock-10-35", size: "35", quantity: 1 }],
    meta: { itemCount: 1 }
  });
});

test("updates an existing cart item quantity", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  expect(addResponse.ok()).toBe(true);

  const updateResponse = await request.fetch("/api/cart/items", {
    method: "PATCH",
    data: { productId: "sock-02", size: "43", quantity: 3 }
  });
  expect(updateResponse.ok()).toBe(true);

  const updatePayload = await updateResponse.json();
  expect(updatePayload.item).toEqual({
    productId: "sock-02",
    skuId: "sock-02-43",
    size: "43",
    quantity: 3
  });

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toMatchObject({
    items: [{ productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 3 }],
    meta: { itemCount: 1 }
  });
});

test("removes a single cart item without clearing the rest", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  await request.post("/api/cart/items", {
    data: { productId: "sock-05", size: "39", quantity: 1 }
  });

  const removeResponse = await request.fetch("/api/cart/items", {
    method: "DELETE",
    data: { productId: "sock-02", size: "43" }
  });
  expect(removeResponse.ok()).toBe(true);

  const removePayload = await removeResponse.json();
  expect(removePayload).toMatchObject({
    ok: true,
    removedItem: { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 1 },
    items: [{ productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }],
    meta: { itemCount: 1 }
  });
  expect(removePayload.cart).toMatchObject({
    items: [{ productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }],
    pricing: expect.objectContaining({
      total: 35
    })
  });
});

test("returns rating metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products?pageSize=24");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock01 = payload.items.find((product) => product.id === "sock-01");

  expect(sock01).toMatchObject({
    id: "sock-01",
    ratingValue: 4.7,
    reviewCount: 1284,
    isTopRated: true
  });

  payload.items.forEach((product) => {
    expect(typeof product.ratingValue).toBe("number");
    expect(Number.isInteger(product.reviewCount)).toBe(true);
    expect(typeof product.isTopRated).toBe("boolean");
  });
});

test("keeps rating metadata in filtered product responses", async ({ request }) => {
  const response = await request.get("/api/products?filter=daily&sort=recommended");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock05 = payload.items.find((product) => product.id === "sock-05");
  expect(sock05).toMatchObject({
    id: "sock-05",
    title: "通勤罗口袜",
    ratingValue: 4.6,
    reviewCount: 973,
    isTopRated: false
  });
});

test("returns fulfillment metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock01 = payload.items.find((product) => product.id === "sock-01");

  expect(sock01).toMatchObject({
    id: "sock-01",
    shippingLabel: "FREE delivery",
    deliveryEstimate: "Get it by Sunday, July 19",
    stockLabel: "In stock",
    isLowStock: false
  });

  payload.items.forEach((product) => {
    expect(typeof product.shippingLabel).toBe("string");
    expect(typeof product.deliveryEstimate).toBe("string");
    expect(typeof product.stockLabel).toBe("string");
    expect(typeof product.isLowStock).toBe("boolean");
  });
});

test("returns SKU variants and merchandising metadata for products", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const product = payload.items.find((item) => item.id === "sock-01");

  expect(product.variants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        skuId: "sock-01-39",
        size: "39",
        color: expect.any(String),
        material: expect.any(String),
        stockQuantity: expect.any(Number),
        lowStockThreshold: expect.any(Number),
        isAvailable: expect.any(Boolean)
      })
    ])
  );
  expect(product.gallery).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(String),
        src: expect.any(String),
        alt: expect.any(String)
      })
    ])
  );
  expect(product.colors).toEqual(expect.arrayContaining(["Black", "White", "Gray"]));
  expect(product.materials.length).toBeGreaterThan(0);
  expect(product.sizeChart).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        size: "39",
        footLengthCm: expect.any(String),
        usMen: expect.any(String),
        usWomen: expect.any(String)
      })
    ])
  );
});

test("returns unique SKU ids for every product variant", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  payload.items.forEach((product) => {
    const skuIds = product.variants.map((variant) => variant.skuId);
    expect(new Set(skuIds).size).toBe(skuIds.length);
    product.variants.forEach((variant) => {
      expect(variant.skuId).toBe(`${product.id}-${variant.size}`);
      expect(product.sizes).toContain(variant.size);
    });
  });
});

test("keeps fulfillment metadata in filtered product responses", async ({ request }) => {
  const response = await request.get("/api/products?filter=sport&sort=price-asc");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock04 = payload.items.find((product) => product.id === "sock-04");

  expect(sock04).toMatchObject({
    id: "sock-04",
    shippingLabel: "FREE delivery",
    deliveryEstimate: "Get it by Monday, July 20",
    stockLabel: "Only 5 left in stock",
    isLowStock: true
  });
});

test("returns social proof metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock02 = payload.items.find((product) => product.id === "sock-02");

  expect(sock02).toMatchObject({
    id: "sock-02",
    recentlyBoughtLabel: "2K+ bought in past month",
    isBestSeller: true
  });

  payload.items.forEach((product) => {
    expect(typeof product.recentlyBoughtLabel).toBe("string");
    expect(typeof product.isBestSeller).toBe("boolean");
  });
});

test("keeps social proof independent from recommended products", async ({ request }) => {
  const response = await request.get("/api/products?filter=daily&sort=recommended");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock05 = payload.items.find((product) => product.id === "sock-05");

  expect(sock05).toMatchObject({
    id: "sock-05",
    title: "通勤罗口袜",
    recentlyBoughtLabel: "1K+ bought in past month",
    isBestSeller: false,
    isRecommended: true
  });
});

test("returns structured stock quantity for low stock products", async ({ request }) => {
  const response = await request.get("/api/products?pageSize=24");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock04 = payload.items.find((product) => product.id === "sock-04");
  const sock10 = payload.items.find((product) => product.id === "sock-10");

  expect(sock04).toMatchObject({
    id: "sock-04",
    isLowStock: true,
    stockQuantity: 5
  });
  expect(sock10).toMatchObject({
    id: "sock-10",
    isLowStock: true,
    stockQuantity: 8
  });
});

test("rejects cart additions that exceed SKU stock quantity", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 8 }
  });
  expect(firstAdd.ok()).toBe(true);

  const overLimitAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 1 }
  });
  expect(overLimitAdd.status()).toBe(409);

  const payload = await overLimitAdd.json();
  expect(payload.error.code).toBe("INSUFFICIENT_STOCK");

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toMatchObject({
    couponCode: "",
    items: [{ productId: "sock-10", skuId: "sock-10-35", size: "35", quantity: 8 }],
    meta: { itemCount: 1 },
    pricing: expect.objectContaining({
      total: expect.any(Number)
    })
  });
});

test("rejects cart quantity updates that exceed SKU stock quantity", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 7 }
  });

  const overLimitUpdate = await request.fetch("/api/cart/items", {
    method: "PATCH",
    data: { productId: "sock-10", size: "35", quantity: 9 }
  });
  expect(overLimitUpdate.status()).toBe(409);

  const payload = await overLimitUpdate.json();
  expect(payload.error.code).toBe("INSUFFICIENT_STOCK");

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toMatchObject({
    couponCode: "",
    items: [
      { productId: "sock-10", skuId: "sock-10-35", size: "35", quantity: 7 }
    ],
    meta: { itemCount: 1 },
    pricing: expect.objectContaining({
      total: expect.any(Number)
    })
  });
});

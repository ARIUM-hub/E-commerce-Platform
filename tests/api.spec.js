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

test("creates and lists product reviews for a product", async ({ request }) => {
  const createResponse = await request.post("/api/products/sock-02/reviews", {
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

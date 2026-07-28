const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const defaultProductsSeedFile = path.join(rootDir, "data", "products.json");

const seededProductReviews = [
  {
    id: "seed-review-sock-01-01",
    productId: "sock-01",
    author: "周晴",
    rating: 5,
    body: "日常通勤很舒服，袜口不勒脚踝。",
    locale: "zh-CN",
    createdAt: "2026-07-20T09:00:00.000Z"
  },
  {
    id: "seed-review-sock-01-02",
    productId: "sock-01",
    author: "Ben",
    rating: 4,
    body: "黑白灰都好搭，厚度比想象中轻。",
    locale: "zh-CN",
    createdAt: "2026-07-19T14:20:00.000Z"
  },
  {
    id: "seed-review-sock-01-03",
    productId: "sock-01",
    author: "林",
    rating: 5,
    body: "尺码准，穿一天也没有闷脚感。",
    locale: "zh-CN",
    createdAt: "2026-07-18T11:35:00.000Z"
  },
  {
    id: "seed-review-sock-02-01",
    productId: "sock-02",
    author: "李然",
    rating: 5,
    body: "运动时包裹感很好，脚背不会勒。",
    locale: "zh-CN",
    createdAt: "2026-07-20T10:12:00.000Z"
  },
  {
    id: "seed-review-sock-02-02",
    productId: "sock-02",
    author: "Ava",
    rating: 4,
    body: "洗过两次还是挺有弹性，厚度适合训练。",
    locale: "zh-CN",
    createdAt: "2026-07-19T16:48:00.000Z"
  },
  {
    id: "seed-review-sock-02-03",
    productId: "sock-02",
    author: "陈",
    rating: 5,
    body: "跑步不容易滑，后跟贴合度不错。",
    locale: "zh-CN",
    createdAt: "2026-07-18T08:30:00.000Z"
  },
  {
    id: "seed-review-sock-03-01",
    productId: "sock-03",
    author: "Mia",
    rating: 5,
    body: "隐形袜不掉跟，这点很加分。",
    locale: "zh-CN",
    createdAt: "2026-07-20T12:05:00.000Z"
  },
  {
    id: "seed-review-sock-03-02",
    productId: "sock-03",
    author: "赵",
    rating: 4,
    body: "适合浅口鞋，边缘处理比较干净。",
    locale: "zh-CN",
    createdAt: "2026-07-19T09:42:00.000Z"
  },
  {
    id: "seed-review-sock-03-03",
    productId: "sock-03",
    author: "吴可",
    rating: 5,
    body: "夏天穿刚好，透气感明显。",
    locale: "zh-CN",
    createdAt: "2026-07-18T15:18:00.000Z"
  },
  {
    id: "seed-review-sock-04-01",
    productId: "sock-04",
    author: "何",
    rating: 5,
    body: "中筒高度合适，搭运动鞋很好看。",
    locale: "zh-CN",
    createdAt: "2026-07-20T13:27:00.000Z"
  },
  {
    id: "seed-review-sock-04-02",
    productId: "sock-04",
    author: "Leo",
    rating: 4,
    body: "弹力稳定，长时间走路没有磨脚。",
    locale: "zh-CN",
    createdAt: "2026-07-19T18:10:00.000Z"
  },
  {
    id: "seed-review-sock-04-03",
    productId: "sock-04",
    author: "唐雨",
    rating: 5,
    body: "颜色很干净，灰色尤其耐看。",
    locale: "zh-CN",
    createdAt: "2026-07-18T10:44:00.000Z"
  },
  {
    id: "seed-review-sock-05-01",
    productId: "sock-05",
    author: "沈",
    rating: 5,
    body: "居家穿很软，脚底有一点缓冲。",
    locale: "zh-CN",
    createdAt: "2026-07-20T15:33:00.000Z"
  },
  {
    id: "seed-review-sock-05-02",
    productId: "sock-05",
    author: "Nora",
    rating: 4,
    body: "包装简单，袜子质感比价格更好。",
    locale: "zh-CN",
    createdAt: "2026-07-19T12:24:00.000Z"
  },
  {
    id: "seed-review-sock-05-03",
    productId: "sock-05",
    author: "许明",
    rating: 5,
    body: "补货买的，洗后没有明显变形。",
    locale: "zh-CN",
    createdAt: "2026-07-18T17:06:00.000Z"
  }
];

function loadSqliteDriver() {
  try {
    return require("better-sqlite3");
  } catch (error) {
    const { DatabaseSync } = require("node:sqlite");
    return class NodeSqliteCompat {
      constructor(filePath) {
        this.database = new DatabaseSync(filePath);
      }

      prepare(sql) {
        const statement = this.database.prepare(sql);
        return {
          get: (...params) => statement.get(...params),
          all: (...params) => statement.all(...params),
          run: (...params) => statement.run(...params)
        };
      }

      exec(sql) {
        this.database.exec(sql);
      }

      transaction(callback) {
        return (...args) => {
          this.exec("BEGIN IMMEDIATE");
          try {
            const result = callback(...args);
            this.exec("COMMIT");
            return result;
          } catch (transactionError) {
            this.exec("ROLLBACK");
            throw transactionError;
          }
        };
      }

      close() {
        this.database.close();
      }
    };
  }
}

function getDatabasePath(options = {}) {
  if (options.filePath) {
    return options.filePath;
  }

  const dataDir = path.resolve(rootDir, options.dataDir || process.env.DATA_DIR || "data");
  const isTest = options.nodeEnv === "test" || process.env.NODE_ENV === "test" || dataDir.includes(path.join("tests", "fixtures", "test-data"));
  return path.join(dataDir, isTest ? "socks-store.test.db" : "socks-store.db");
}

function createDatabase(filePath = getDatabasePath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const Database = loadSqliteDriver();
  const db = new Database(filePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

function runSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      sku_id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT,
      material TEXT,
      stock_quantity INTEGER NOT NULL,
      low_stock_threshold INTEGER NOT NULL,
      is_available INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      password_hash TEXT,
      password_salt TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      coupon_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (cart_id, sku_id),
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (sku_id) REFERENCES product_variants(sku_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_timeline (
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      session_id TEXT,
      user_id TEXT,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      topic TEXT NOT NULL,
      order_id TEXT,
      message TEXT NOT NULL,
      locale TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

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

    CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id) WHERE owner_type = 'user';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_session ON carts(session_id) WHERE owner_type = 'anonymous';
    CREATE INDEX IF NOT EXISTS idx_recent_views_user ON recent_views(user_id, viewed_at);
    CREATE INDEX IF NOT EXISTS idx_recent_views_session ON recent_views(session_id, viewed_at);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_session ON support_tickets(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_return_requests_user ON return_requests(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_return_items_request ON return_request_items(return_request_id);
  `);
}

function ensureCartCouponColumn(db) {
  const columns = db.prepare("PRAGMA table_info(carts)").all();
  if (!columns.some((column) => column.name === "coupon_code")) {
    db.prepare("ALTER TABLE carts ADD COLUMN coupon_code TEXT").run();
  }
}

function ensureProductReviewsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL,
      body TEXT NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id, created_at);
  `);
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

const migrations = [
  {
    id: "0001_initial_schema",
    name: "Initial storefront schema",
    up(db) {
      runSchema(db);
    }
  },
  {
    id: "0002_cart_coupon_code",
    name: "Ensure carts coupon code column",
    up(db) {
      ensureCartCouponColumn(db);
    }
  },
  {
    id: "0003_product_reviews",
    name: "Add product review storage",
    up(db) {
      ensureProductReviewsTable(db);
    }
  }
];

function hasMigration(db, id) {
  return Boolean(db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id));
}

function recordMigration(db, migration) {
  db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
    migration.id,
    migration.name,
    new Date().toISOString()
  );
}

function runMigrations(db) {
  ensureMigrationTable(db);

  migrations.forEach((migration) => {
    if (hasMigration(db, migration.id)) {
      return;
    }

    const migrate = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration);
    });
    migrate();
  });
}

function seedProducts(db, productsSeedFile = defaultProductsSeedFile) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (count > 0) {
    return;
  }

  const products = JSON.parse(fs.readFileSync(productsSeedFile, "utf8"));
  const insertProduct = db.prepare("INSERT INTO products (id, payload) VALUES (?, ?)");
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (
      sku_id, product_id, size, color, material, stock_quantity, low_stock_threshold, is_available
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    products.forEach((product) => {
      insertProduct.run(product.id, JSON.stringify(product));
      product.variants.forEach((variant) => {
        insertVariant.run(
          variant.skuId,
          product.id,
          variant.size,
          variant.color || "",
          variant.material || "",
          variant.stockQuantity,
          variant.lowStockThreshold,
          variant.isAvailable === false ? 0 : 1
        );
      });
    });
  });

  seed();
}

function seedProductReviews(db) {
  const insertReview = db.prepare(`
    INSERT OR IGNORE INTO product_reviews (id, product_id, author, rating, body, locale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    seededProductReviews.forEach((review) => {
      insertReview.run(
        review.id,
        review.productId,
        review.author,
        review.rating,
        review.body,
        review.locale,
        review.createdAt
      );
    });
  });

  seed();
}

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

function initializeDatabase(db, options = {}) {
  runMigrations(db);
  seedProducts(db, options.productsSeedFile);
  seedProductReviews(db);
  seedMarketing(db);
  return db;
}

async function resetDatabase(filePath) {
  await Promise.all([
    fsp.rm(filePath, { force: true }),
    fsp.rm(`${filePath}-wal`, { force: true }),
    fsp.rm(`${filePath}-shm`, { force: true }),
    fsp.rm(`${filePath}-journal`, { force: true })
  ]);
}

module.exports = {
  createDatabase,
  initializeDatabase,
  resetDatabase,
  getDatabasePath,
  runMigrations
};

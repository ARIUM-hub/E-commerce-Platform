const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const defaultProductsSeedFile = path.join(rootDir, "data", "products.json");
const reviewBuyerPhotoDataUrl = "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20160%2090'%3E%3Crect%20width%3D'160'%20height%3D'90'%20fill%3D'%23f3f3f3'%2F%3E%3Cpath%20d%3D'M38%2050c18-15%2043-15%2061%200%207%206%2019%209%2032%209h7v13H78c-26%200-43-7-55-21z'%20fill%3D'%232f2f2f'%2F%3E%3Ccircle%20cx%3D'118'%20cy%3D'30'%20r%3D'10'%20fill%3D'%23d9d9d9'%2F%3E%3C%2Fsvg%3E";

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
    createdAt: "2026-07-20T10:12:00.000Z",
    verifiedPurchase: true,
    helpfulCount: 12,
    mediaUrls: [reviewBuyerPhotoDataUrl],
    reasonTags: []
  },
  {
    id: "seed-review-sock-02-02",
    productId: "sock-02",
    author: "Ava",
    rating: 4,
    body: "洗过两次还是挺有弹性，厚度适合训练。",
    locale: "zh-CN",
    createdAt: "2026-07-19T16:48:00.000Z",
    verifiedPurchase: true,
    helpfulCount: 5,
    mediaUrls: [],
    reasonTags: []
  },
  {
    id: "seed-review-sock-02-03",
    productId: "sock-02",
    author: "陈",
    rating: 5,
    body: "跑步不容易滑，后跟贴合度不错。",
    locale: "zh-CN",
    createdAt: "2026-07-18T08:30:00.000Z",
    verifiedPurchase: true,
    helpfulCount: 8,
    mediaUrls: [reviewBuyerPhotoDataUrl],
    reasonTags: []
  },
  {
    id: "seed-review-sock-02-04",
    productId: "sock-02",
    author: "韩路",
    rating: 2,
    body: "脚背偏紧，厚度也比预期更明显。",
    locale: "zh-CN",
    createdAt: "2026-07-17T12:10:00.000Z",
    verifiedPurchase: true,
    helpfulCount: 2,
    mediaUrls: [],
    reasonTags: ["尺码偏紧", "厚度偏厚"]
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

const seededProductQuestions = [
  {
    id: "seed-question-sock-01-01",
    productId: "sock-01",
    author: "官方客服",
    question: "这款适合每天通勤穿吗？",
    answer: "适合。它是偏轻薄的棉混纺中筒袜，通勤、居家和日常出门都比较舒适。",
    locale: "zh-CN",
    createdAt: "2026-07-21T09:00:00.000Z"
  },
  {
    id: "seed-question-sock-01-02",
    productId: "sock-01",
    author: "林",
    question: "袜口会不会勒？",
    answer: "袜口是弹性罗口，正常尺码下不会明显勒脚踝。",
    locale: "zh-CN",
    createdAt: "2026-07-20T13:15:00.000Z"
  },
  {
    id: "seed-question-sock-01-03",
    productId: "sock-01",
    author: "Mia",
    question: "黑色和灰色是同一种厚度吗？",
    answer: "是，同商品不同颜色使用同一材质和厚度。",
    locale: "zh-CN",
    createdAt: "2026-07-19T10:30:00.000Z"
  },
  {
    id: "seed-question-sock-02-01",
    productId: "sock-02",
    author: "官方客服",
    question: "这款适合跑步训练吗？",
    answer: "适合。它的袜底有轻压支撑，日常跑步和健身训练都可以穿。",
    locale: "zh-CN",
    createdAt: "2026-07-21T10:12:00.000Z"
  },
  {
    id: "seed-question-sock-02-02",
    productId: "sock-02",
    author: "周",
    question: "脚背高会不会紧？",
    answer: "建议选择常穿鞋码；脚背偏高但不宽的用户通常可以正常穿。",
    locale: "zh-CN",
    createdAt: "2026-07-20T15:45:00.000Z"
  },
  {
    id: "seed-question-sock-02-03",
    productId: "sock-02",
    author: "Ava",
    question: "运动后会不会很闷？",
    answer: "袜面有透气组织，强度不高的训练后闷热感不明显。",
    locale: "zh-CN",
    createdAt: "2026-07-19T08:20:00.000Z"
  },
  {
    id: "seed-question-sock-03-01",
    productId: "sock-03",
    author: "官方客服",
    question: "隐形袜容易掉跟吗？",
    answer: "后跟有防滑贴合设计，正常尺码下不容易滑落。",
    locale: "zh-CN",
    createdAt: "2026-07-21T11:05:00.000Z"
  },
  {
    id: "seed-question-sock-03-02",
    productId: "sock-03",
    author: "赵",
    question: "适合浅口鞋吗？",
    answer: "适合，多数浅口运动鞋和休闲鞋都能隐藏袜口。",
    locale: "zh-CN",
    createdAt: "2026-07-20T09:42:00.000Z"
  },
  {
    id: "seed-question-sock-03-03",
    productId: "sock-03",
    author: "Nora",
    question: "夏天穿会厚吗？",
    answer: "这款偏薄，夏季日常穿着压力不大。",
    locale: "zh-CN",
    createdAt: "2026-07-19T14:18:00.000Z"
  },
  {
    id: "seed-question-sock-04-01",
    productId: "sock-04",
    author: "官方客服",
    question: "中筒高度大概到哪里？",
    answer: "通常到脚踝上方，搭配运动鞋时能露出简洁袜边。",
    locale: "zh-CN",
    createdAt: "2026-07-21T13:27:00.000Z"
  },
  {
    id: "seed-question-sock-04-02",
    productId: "sock-04",
    author: "Leo",
    question: "长时间走路会磨脚吗？",
    answer: "袜底和后跟有基础缓冲，日常步行不容易磨脚。",
    locale: "zh-CN",
    createdAt: "2026-07-20T18:10:00.000Z"
  },
  {
    id: "seed-question-sock-04-03",
    productId: "sock-04",
    author: "唐雨",
    question: "灰色会不会偏深？",
    answer: "灰色偏中性，不是深炭灰，搭配黑白灰鞋都比较稳。",
    locale: "zh-CN",
    createdAt: "2026-07-19T10:44:00.000Z"
  },
  {
    id: "seed-question-sock-05-01",
    productId: "sock-05",
    author: "官方客服",
    question: "这款适合居家穿吗？",
    answer: "适合，脚感偏软，袜底有轻微缓冲。",
    locale: "zh-CN",
    createdAt: "2026-07-21T15:33:00.000Z"
  },
  {
    id: "seed-question-sock-05-02",
    productId: "sock-05",
    author: "沈",
    question: "洗后会缩水吗？",
    answer: "按常规冷水洗涤并自然晾干，缩水不明显。",
    locale: "zh-CN",
    createdAt: "2026-07-20T12:24:00.000Z"
  },
  {
    id: "seed-question-sock-05-03",
    productId: "sock-05",
    author: "许明",
    question: "适合囤货买吗？",
    answer: "适合，日常替换频率高，组合优惠时更划算。",
    locale: "zh-CN",
    createdAt: "2026-07-19T17:06:00.000Z"
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

    CREATE TABLE IF NOT EXISTS saved_products (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      product_id TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_questions (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      author TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_products_user ON saved_products(user_id, product_id) WHERE owner_type = 'user';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_products_session ON saved_products(session_id, product_id) WHERE owner_type = 'anonymous';
    CREATE INDEX IF NOT EXISTS idx_saved_products_product ON saved_products(product_id, saved_at);
    CREATE INDEX IF NOT EXISTS idx_product_questions_product ON product_questions(product_id, created_at);
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
      verified_purchase INTEGER NOT NULL DEFAULT 0,
      helpful_count INTEGER NOT NULL DEFAULT 0,
      media_urls TEXT NOT NULL DEFAULT '[]',
      reason_tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id, created_at);

    CREATE TABLE IF NOT EXISTS product_review_helpful_votes (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_helpful_user ON product_review_helpful_votes(review_id, user_id) WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_helpful_session ON product_review_helpful_votes(review_id, session_id) WHERE session_id IS NOT NULL;
  `);
}

function ensureProductReviewTrustLayer(db) {
  ensureProductReviewsTable(db);

  const columns = db.prepare("PRAGMA table_info(product_reviews)").all();
  const columnNames = new Set(columns.map((column) => column.name));
  const addColumn = (name, sql) => {
    if (!columnNames.has(name)) {
      db.prepare(sql).run();
    }
  };

  addColumn("verified_purchase", "ALTER TABLE product_reviews ADD COLUMN verified_purchase INTEGER NOT NULL DEFAULT 0");
  addColumn("helpful_count", "ALTER TABLE product_reviews ADD COLUMN helpful_count INTEGER NOT NULL DEFAULT 0");
  addColumn("media_urls", "ALTER TABLE product_reviews ADD COLUMN media_urls TEXT NOT NULL DEFAULT '[]'");
  addColumn("reason_tags", "ALTER TABLE product_reviews ADD COLUMN reason_tags TEXT NOT NULL DEFAULT '[]'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_review_helpful_votes (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_helpful_user ON product_review_helpful_votes(review_id, user_id) WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_helpful_session ON product_review_helpful_votes(review_id, session_id) WHERE session_id IS NOT NULL;
  `);
}

function ensureProductPageCommerceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_products (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      product_id TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_questions (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      author TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_products_user ON saved_products(user_id, product_id) WHERE owner_type = 'user';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_products_session ON saved_products(session_id, product_id) WHERE owner_type = 'anonymous';
    CREATE INDEX IF NOT EXISTS idx_saved_products_product ON saved_products(product_id, saved_at);
    CREATE INDEX IF NOT EXISTS idx_product_questions_product ON product_questions(product_id, created_at);
  `);
}

function ensureFulfillmentAndRefundTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fulfillments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      status TEXT NOT NULL,
      shipping_method_id TEXT NOT NULL,
      carrier TEXT NOT NULL,
      tracking_number TEXT,
      estimated_delivery_date TEXT NOT NULL,
      delivery_window_start TEXT NOT NULL,
      delivery_window_end TEXT NOT NULL,
      address_zone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS fulfillment_events (
      id TEXT PRIMARY KEY,
      fulfillment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (fulfillment_id) REFERENCES fulfillments(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_id TEXT,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      method TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS refund_events (
      id TEXT PRIMARY KEY,
      refund_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON fulfillments(order_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_user ON fulfillments(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_events_order ON fulfillment_events(order_id, at);
    CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_refund_events_order ON refund_events(order_id, at);
  `);
}

const seededPaymentMethods = [
  {
    id: "card",
    labels: { "zh-CN": "银行卡", "en-US": "Credit or debit card" },
    descriptions: { "zh-CN": "支持 Visa / Mastercard 演示支付", "en-US": "Demo Visa / Mastercard payment" },
    status: "active",
    sortOrder: 10,
    feeType: "none",
    feeAmount: 0,
    minTotal: 0,
    maxTotal: 9999
  },
  {
    id: "paypal",
    labels: { "zh-CN": "PayPal", "en-US": "PayPal" },
    descriptions: { "zh-CN": "使用 PayPal 演示钱包支付", "en-US": "Pay with a demo PayPal wallet" },
    status: "active",
    sortOrder: 20,
    feeType: "fixed",
    feeAmount: 1,
    minTotal: 0,
    maxTotal: 9999
  },
  {
    id: "gift_card",
    labels: { "zh-CN": "礼品卡", "en-US": "Gift card" },
    descriptions: { "zh-CN": "使用演示礼品卡余额支付", "en-US": "Use a demo gift-card balance" },
    status: "active",
    sortOrder: 30,
    feeType: "none",
    feeAmount: 0,
    minTotal: 0,
    maxTotal: 300
  },
  {
    id: "cod",
    labels: { "zh-CN": "货到付款", "en-US": "Cash on delivery" },
    descriptions: { "zh-CN": "当前演示站暂未启用", "en-US": "Not enabled in this demo storefront" },
    status: "inactive",
    sortOrder: 40,
    feeType: "fixed",
    feeAmount: 6,
    minTotal: 20,
    maxTotal: 500
  }
];

function ensurePaymentSystemTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      fee_type TEXT NOT NULL,
      fee_amount REAL NOT NULL,
      min_total REAL NOT NULL,
      max_total REAL NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      event_status TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payment_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      status TEXT NOT NULL,
      invoice_number TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL,
      currency TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount_total REAL NOT NULL,
      shipping REAL NOT NULL,
      payment_fee REAL NOT NULL,
      tax REAL NOT NULL,
      grand_total REAL NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id, processed_at);
    CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_events(payment_id, processed_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, issued_at);
  `);
}

function seedPaymentMethods(db) {
  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO payment_methods (id, status, sort_order, fee_type, fee_amount, min_total, max_total, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload
  `);

  seededPaymentMethods.forEach((method) => {
    statement.run(
      method.id,
      method.status,
      method.sortOrder,
      method.feeType,
      method.feeAmount,
      method.minTotal,
      method.maxTotal,
      JSON.stringify(method),
      now
    );
  });
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

function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  if (!hasColumn(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

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

const DEFAULT_CAMPAIGN_START = "2026-01-01T00:00:00.000Z";
const DEFAULT_CAMPAIGN_END = "2026-12-31T23:59:59.999Z";

function parseCampaignPayload(value) {
  try {
    const payload = JSON.parse(value || "{}");
    return payload && typeof payload === "object" ? payload : {};
  } catch (_error) {
    return {};
  }
}

function importRuntimeCampaignRows(db, resourceType) {
  const queries = {
    promotion: "SELECT id AS resource_key, type AS runtime_type, status, starts_at, ends_at, payload FROM promotions",
    coupon: "SELECT code AS resource_key, NULL AS runtime_type, status, starts_at, ends_at, payload FROM coupons",
    bundle: "SELECT id AS resource_key, NULL AS runtime_type, status, starts_at, ends_at, payload FROM bundles"
  };
  const query = queries[resourceType];
  if (!query) return;

  const rows = db.prepare(query).all();
  const insertCampaign = db.prepare(`
    INSERT OR IGNORE INTO marketing_campaigns (
      id, resource_type, resource_key, name, status, current_version, published_version,
      starts_at, ends_at, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, NULL, NULL, ?, ?)
  `);
  const insertVersion = db.prepare(`
    INSERT OR IGNORE INTO marketing_campaign_versions (
      id, campaign_id, version, payload, created_by, created_at
    ) VALUES (?, ?, 1, ?, NULL, ?)
  `);
  const updateBundleWindow = resourceType === "bundle"
    ? db.prepare("UPDATE bundles SET starts_at = ?, ends_at = ? WHERE id = ?")
    : null;

  rows.forEach((row) => {
    const runtimePayload = parseCampaignPayload(row.payload);
    const startsAt = row.starts_at || DEFAULT_CAMPAIGN_START;
    const endsAt = row.ends_at || DEFAULT_CAMPAIGN_END;
    const campaignId = `${resourceType}-${row.resource_key}`;
    const name = runtimePayload.titleZh || runtimePayload.title || row.resource_key;
    const status = row.status === "active" ? "active" : "paused";
    const createdAt = new Date().toISOString();
    const rules = resourceType === "promotion"
      ? { kind: row.runtime_type, ...runtimePayload }
      : runtimePayload;
    const versionPayload = JSON.stringify({
      resourceType,
      resourceKey: row.resource_key,
      name,
      startsAt,
      endsAt,
      rules
    });

    insertCampaign.run(
      campaignId,
      resourceType,
      row.resource_key,
      name,
      status,
      startsAt,
      endsAt,
      createdAt,
      createdAt
    );
    insertVersion.run(`${campaignId}-v1`, campaignId, versionPayload, createdAt);
    updateBundleWindow?.run(startsAt, endsAt, row.resource_key);
  });
}

function importAllRuntimeCampaignRows(db) {
  importRuntimeCampaignRows(db, "promotion");
  importRuntimeCampaignRows(db, "coupon");
  importRuntimeCampaignRows(db, "bundle");
}

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
  importAllRuntimeCampaignRows(db);
}

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
  },
  {
    id: "0004_product_page_commerce_depth",
    name: "Add saved products and product questions",
    up(db) {
      ensureProductPageCommerceTables(db);
    }
  },
  {
    id: "0005_product_review_trust_layer",
    name: "Add product review trust signals",
    up(db) {
      ensureProductReviewTrustLayer(db);
    }
  },
  {
    id: "0006_fulfillment_refunds",
    name: "Add fulfillment and refund lifecycle tables",
    up(db) {
      ensureFulfillmentAndRefundTables(db);
    }
  },
  {
    id: "0007_payment_system_upgrade",
    name: "Add payment methods events and invoices",
    up(db) {
      ensurePaymentSystemTables(db);
      seedPaymentMethods(db);
    }
  },
  {
    id: "0008_admin_order_operations",
    name: "Add admin order operations and audit storage",
    up(db) {
      ensureAdminOrderOperationTables(db);
    }
  },
  {
    id: "0009_product_review_moderation",
    name: "Add product review moderation and merchant replies",
    up(db) {
      ensureProductReviewModerationTables(db);
    }
  },
  {
    id: "0010_support_ticket_workflow",
    name: "Add support ticket workflow messages and events",
    up(db) {
      ensureSupportTicketWorkflowTables(db);
    }
  },
  {
    id: "0011_marketing_campaign_versions",
    name: "Add versioned marketing campaign storage",
    up(db) {
      ensureMarketingCampaignVersionTables(db);
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
    INSERT OR IGNORE INTO product_reviews (
      id, product_id, author, rating, body, locale, verified_purchase, helpful_count, media_urls, reason_tags, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateTrustSignals = db.prepare(`
    UPDATE product_reviews
    SET verified_purchase = ?, helpful_count = CASE WHEN helpful_count < ? THEN ? ELSE helpful_count END, media_urls = ?, reason_tags = ?
    WHERE id = ?
  `);

  const seed = db.transaction(() => {
    seededProductReviews.forEach((review) => {
      const verifiedPurchase = review.verifiedPurchase ? 1 : 0;
      const helpfulCount = Number.isInteger(review.helpfulCount) ? review.helpfulCount : 0;
      const mediaUrls = JSON.stringify(Array.isArray(review.mediaUrls) ? review.mediaUrls : []);
      const reasonTags = JSON.stringify(Array.isArray(review.reasonTags) ? review.reasonTags : []);
      insertReview.run(
        review.id,
        review.productId,
        review.author,
        review.rating,
        review.body,
        review.locale,
        verifiedPurchase,
        helpfulCount,
        mediaUrls,
        reasonTags,
        review.createdAt,
        review.createdAt
      );
      updateTrustSignals.run(verifiedPurchase, helpfulCount, helpfulCount, mediaUrls, reasonTags, review.id);
    });
  });

  seed();
}

function seedProductQuestions(db) {
  const insertQuestion = db.prepare(`
    INSERT OR IGNORE INTO product_questions (id, product_id, author, question, answer, locale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    seededProductQuestions.forEach((question) => {
      insertQuestion.run(
        question.id,
        question.productId,
        question.author,
        question.question,
        question.answer,
        question.locale,
        question.createdAt
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
  seedPaymentMethods(db);
  seedProducts(db, options.productsSeedFile);
  seedProductReviews(db);
  seedProductQuestions(db);
  seedMarketing(db);
  importAllRuntimeCampaignRows(db);
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

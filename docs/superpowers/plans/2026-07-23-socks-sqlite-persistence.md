# Socks SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace live JSON-file backend state with SQLite persistence while preserving the current socks storefront API and adding transactional checkout inventory validation.

**Architecture:** Add a small SQLite database layer and repositories under `lib/`, seed product data from the existing JSON catalog, and route current `server.js` handlers through repository functions. Keep API response shapes stable for the frontend, but centralize structured error responses and move checkout inventory deduction into one SQLite transaction.

**Tech Stack:** Node.js HTTP server, SQLite through `better-sqlite3` with `node:sqlite` fallback only if needed, vanilla JS frontend, Playwright API/UI tests.

---

## File Structure

- Create: `lib/api-errors.js` for centralized API error definitions and response payload helpers.
- Create: `lib/database.js` for database opening, schema initialization, seed import, and test reset helpers.
- Create: `lib/repositories/products.js` for product queries and API payload assembly.
- Create: `lib/repositories/carts.js` for anonymous/user cart lookup, mutation, merge, and payload building.
- Create: `lib/repositories/users.js` for users, sessions, logout, and address management.
- Create: `lib/repositories/orders.js` for transactional checkout, order lookup/history, and order status updates.
- Modify: `server.js` to use repositories instead of direct JSON reads/writes for live state.
- Modify: `package.json` and `package-lock.json` to add SQLite dependency if `better-sqlite3` installation is used.
- Modify: `tests/api.spec.js` to reset the test database and verify SQLite persistence, transactions, sessions, and error contract.
- Keep: `data/products.json` and `tests/fixtures/test-data/products.json` as seed fixtures.
- Ignore or avoid committing: generated `data/socks-store.db`, `data/socks-store.db-*`, `tests/fixtures/test-data/socks-store.test.db`, and journal/WAL files.

## Important Constraints

- Do not run stress tests, model/provider probes, or concurrent loops. The only concurrency validation should use exactly two checkout requests against a deterministic low-stock SKU.
- Preserve the existing public HTTP endpoints and frontend payload names such as `skuId`, `stockQuantity`, `variants`, `gallery`, and `sizeChart`.
- Keep `socks_session` as the cookie name.
- Use TDD for each behavior change: write the failing test, run it red, implement, run green.
- Because `server.js` is large, new persistence logic belongs in `lib/` files.

---

### Task 1: Add SQLite Dependency And Database Bootstrap

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Verify SQLite dependency path**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; node -e "try { require('better-sqlite3'); console.log('better-sqlite3 available') } catch (error) { console.log('better-sqlite3 missing') }"
```

Expected: likely prints `better-sqlite3 missing`.

- [ ] **Step 2: Install `better-sqlite3` only once**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm install better-sqlite3
```

Expected: dependency installs and updates `package.json` plus `package-lock.json`.

If installation fails because of native build or network constraints, do not retry in a loop. Record the failure once and switch the plan implementation to `node:sqlite` inside `lib/database.js`.

- [ ] **Step 3: Write failing database initialization tests**

At the top of `tests/api.spec.js`, add imports and DB file helpers:

```js
const testDbFile = path.join(__dirname, "fixtures", "test-data", "socks-store.test.db");
const {
  createDatabase,
  initializeDatabase,
  resetDatabase,
  getDatabasePath
} = require("../lib/database");
```

Add these tests near the fixture sanity tests:

```js
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

test("uses the configured SQLite database path", () => {
  expect(getDatabasePath({ nodeEnv: "test" })).toContain("socks-store.test.db");
  expect(getDatabasePath({ nodeEnv: "production" })).toContain("socks-store.db");
});
```

- [ ] **Step 4: Run bootstrap tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SQLite database|configured SQLite"
```

Expected: FAIL because `lib/database.js` does not exist yet.

- [ ] **Step 5: Create `lib/database.js`**

Create:

```js
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const defaultRuntimeDbFile = path.join(__dirname, "..", "data", "socks-store.db");
const defaultTestDbFile = path.join(__dirname, "..", "tests", "fixtures", "test-data", "socks-store.test.db");
const defaultProductsSeedFile = path.join(__dirname, "..", "data", "products.json");

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

  return options.nodeEnv === "test" || process.env.NODE_ENV === "test"
    ? defaultTestDbFile
    : defaultRuntimeDbFile;
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

    CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id) WHERE owner_type = 'user';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_session ON carts(session_id) WHERE owner_type = 'anonymous';
  `);
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

function initializeDatabase(db, options = {}) {
  runSchema(db);
  seedProducts(db, options.productsSeedFile);
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
  getDatabasePath
};
```

- [ ] **Step 6: Update `.gitignore` for SQLite files**

Append:

```gitignore
*.db
*.db-shm
*.db-wal
*.db-journal
```

- [ ] **Step 7: Run bootstrap tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SQLite database|configured SQLite"
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add package.json package-lock.json .gitignore lib/database.js tests/api.spec.js
git commit -m "feat: add sqlite database bootstrap"
```

---

### Task 2: Centralize API Error Contract

**Files:**
- Create: `lib/api-errors.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing error-shape tests**

Add these tests near validation/error tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Run error tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "standardized API error"
```

Expected: FAIL because current errors omit `details`.

- [ ] **Step 3: Create `lib/api-errors.js`**

Create:

```js
const errorDefinitions = {
  AUTH_REQUIRED: [401, "Authentication is required."],
  AUTH_VALIDATION_FAILED: [400, "Authentication information is incomplete."],
  INVALID_CREDENTIALS: [401, "Email or password is incorrect."],
  EMAIL_ALREADY_REGISTERED: [409, "Email is already registered."],
  SESSION_EXPIRED: [401, "Session has expired."],
  INVALID_JSON: [400, "Request body must be valid JSON."],
  VALIDATION_FAILED: [400, "Request validation failed."],
  INVALID_QUANTITY: [400, "Quantity must be a positive integer."],
  INVALID_SIZE: [400, "Size is not available for this product."],
  INVALID_SHIPPING_METHOD: [400, "Shipping method is invalid."],
  OUT_OF_STOCK: [409, "Selected size is out of stock."],
  INSUFFICIENT_STOCK: [409, "Selected size stock is not enough for the requested quantity."],
  CART_ITEM_NOT_FOUND: [404, "Cart item was not found."],
  EMPTY_CART: [400, "Cart is empty."],
  ADDRESS_NOT_FOUND: [404, "Address was not found."],
  ADDRESS_VALIDATION_FAILED: [400, "Address information is incomplete."],
  ORDER_NOT_FOUND: [404, "Order was not found."],
  INVALID_ORDER_STATUS: [400, "Order status is invalid."],
  INVALID_ORDER_TRANSITION: [409, "Order status transition is not allowed."],
  DATABASE_CONFLICT: [409, "Database conflict."],
  DATABASE_UNAVAILABLE: [503, "Database is unavailable."],
  INTERNAL_ERROR: [500, "Unexpected server error."]
};

function createApiError(code, overrides = {}) {
  const [statusCode, defaultMessage] = errorDefinitions[code] || errorDefinitions.INTERNAL_ERROR;
  return {
    statusCode: overrides.statusCode || statusCode,
    payload: {
      ok: false,
      error: {
        code,
        message: overrides.message || defaultMessage,
        details: overrides.details || {}
      }
    }
  };
}

module.exports = {
  createApiError,
  errorDefinitions
};
```

- [ ] **Step 4: Update `server.js` error sender**

At the top of `server.js`, import:

```js
const { createApiError } = require("./lib/api-errors");
```

Replace `sendError` with:

```js
function sendError(response, statusCode, code, message, details = {}) {
  const apiError = createApiError(code, { statusCode, message, details });
  sendJson(response, apiError.statusCode, apiError.payload);
}
```

Keep existing call sites working.

- [ ] **Step 5: Run error tests and broad API error grep**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "standardized API error|invalid|missing|not found|rejects"
```

Expected: PASS or only failures caused by tests expecting old error shape. Update old tests to check `payload.error.code` instead of exact legacy payload when necessary.

- [ ] **Step 6: Commit**

Run:

```powershell
git add lib/api-errors.js server.js tests/api.spec.js
git commit -m "feat: standardize api error payloads"
```

---

### Task 3: Move Product Reads To SQLite Repository

**Files:**
- Create: `lib/repositories/products.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing repository-backed product API tests**

Add this test near product payload tests in `tests/api.spec.js`:

```js
test("serves products from the SQLite seed database", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const product = payload.items.find((item) => item.id === "sock-01");

  expect(product.title).toBe("Minimal Crew Socks");
  expect(product.variants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ skuId: "sock-01-43", stockQuantity: 3 })
    ])
  );
});
```

Also update `test.beforeEach` to reset and initialize the test database:

```js
test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(ordersFile, `${JSON.stringify({ orders: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(usersFile, `${JSON.stringify({ users: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(sessionsFile, `${JSON.stringify({ sessions: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(userCartsFile, `${JSON.stringify({ carts: [] }, null, 2)}\n`, "utf8");
  await resetDatabase(testDbFile);
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  db.close();
});
```

- [ ] **Step 2: Run product repository test and verify the current implementation still uses JSON**

Temporarily change the test database stock for `sock-01-43` inside the test to prove DB source:

```js
const db = createDatabase(testDbFile);
db.prepare("UPDATE product_variants SET stock_quantity = ? WHERE sku_id = ?").run(2, "sock-01-43");
db.close();
```

Expected test assertion should expect `stockQuantity: 2`.

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "serves products from the SQLite"
```

Expected: FAIL because `/api/products` still reads JSON and returns stock `3`.

- [ ] **Step 3: Create `lib/repositories/products.js`**

Create:

```js
function parseProductRow(row) {
  return JSON.parse(row.payload);
}

function applyVariantRows(product, variantRows) {
  const variants = variantRows.map((row) => ({
    skuId: row.sku_id,
    size: row.size,
    color: row.color,
    material: row.material,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    isAvailable: Boolean(row.is_available)
  }));

  return {
    ...product,
    variants,
    sizes: variants.map((variant) => variant.size)
  };
}

function listProducts(db) {
  const products = db.prepare("SELECT id, payload FROM products ORDER BY rowid ASC").all().map(parseProductRow);
  const variantRows = db.prepare("SELECT * FROM product_variants ORDER BY product_id ASC, rowid ASC").all();
  const variantsByProduct = variantRows.reduce((map, row) => {
    if (!map.has(row.product_id)) {
      map.set(row.product_id, []);
    }
    map.get(row.product_id).push(row);
    return map;
  }, new Map());

  return products.map((product) => applyVariantRows(product, variantsByProduct.get(product.id) || []));
}

function findProductById(db, productId) {
  return listProducts(db).find((product) => product.id === productId) || null;
}

module.exports = {
  listProducts,
  findProductById
};
```

- [ ] **Step 4: Wire `/api/products` through repository**

In `server.js`, initialize a database connection during startup:

```js
const { createDatabase, initializeDatabase, getDatabasePath } = require("./lib/database");
const { listProducts } = require("./lib/repositories/products");

const database = initializeDatabase(createDatabase(getDatabasePath({ nodeEnv: process.env.NODE_ENV })));
```

In `/api/products`, replace JSON loading:

```js
const products = listProducts(database);
const payload = getProductsPayload(products, filterValue, sortValue, localeValue, queryValue);
```

- [ ] **Step 5: Run product API and SKU schema tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "serves products from the SQLite|SKU variants|unique SKU ids|products"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add lib/repositories/products.js server.js tests/api.spec.js
git commit -m "feat: serve products from sqlite"
```

---

### Task 4: Move Users, Sessions, And Addresses To SQLite

**Files:**
- Create: `lib/repositories/users.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing SQLite session persistence tests**

Add tests near auth tests:

```js
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
```

- [ ] **Step 2: Run auth persistence tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "persists registered users|persists address"
```

Expected: FAIL because users/sessions/addresses still write JSON.

- [ ] **Step 3: Create `lib/repositories/users.js`**

Create repository functions matching current route needs:

```js
function nowIso() {
  return new Date().toISOString();
}

function mapUser(row, addresses = []) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    addresses
  };
}

function listAddresses(db, userId) {
  return db.prepare("SELECT id, payload, is_default FROM addresses WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId)
    .map((row) => ({
      id: row.id,
      ...JSON.parse(row.payload),
      isDefault: Boolean(row.is_default)
    }));
}

function findUserByEmail(db, email) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  return row ? mapUser(row, listAddresses(db, row.id)) : null;
}

function findUserById(db, userId) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return row ? mapUser(row, listAddresses(db, row.id)) : null;
}

function createUser(db, user) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO users (id, name, email, password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, user.name, user.email, user.password, timestamp, timestamp);
  return findUserById(db, user.id);
}

function createSession(db, session) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, created_at, updated_at, expires_at)
    VALUES (?, ?, COALESCE((SELECT created_at FROM sessions WHERE id = ?), ?), ?, ?)
  `).run(session.id, session.userId || null, session.id, timestamp, timestamp, session.expiresAt || null);
  return session;
}

function findSession(db, sessionId) {
  return db.prepare("SELECT id, user_id AS userId, expires_at AS expiresAt FROM sessions WHERE id = ?").get(sessionId) || null;
}

function deleteSession(db, sessionId) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function createAddress(db, userId, address) {
  const timestamp = nowIso();
  const existingCount = db.prepare("SELECT COUNT(*) AS count FROM addresses WHERE user_id = ?").get(userId).count;
  db.prepare(`
    INSERT INTO addresses (id, user_id, payload, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(address.id, userId, JSON.stringify(address), existingCount === 0 ? 1 : 0, timestamp, timestamp);
  return findUserById(db, userId);
}

function replaceAddresses(db, userId, addresses) {
  const timestamp = nowIso();
  db.prepare("DELETE FROM addresses WHERE user_id = ?").run(userId);
  const insert = db.prepare(`
    INSERT INTO addresses (id, user_id, payload, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  addresses.forEach((address) => {
    insert.run(address.id, userId, JSON.stringify(address), address.isDefault ? 1 : 0, timestamp, timestamp);
  });
  return findUserById(db, userId);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  createSession,
  findSession,
  deleteSession,
  createAddress,
  replaceAddresses,
  listAddresses
};
```

- [ ] **Step 4: Wire auth/session routes through repository**

In `server.js`, replace reads/writes of `usersFile` and `sessionsFile` in:

- `getSessionContext`
- register route
- login route
- logout route
- address routes

Use `findUserByEmail`, `findUserById`, `createUser`, `createSession`, `findSession`, `deleteSession`, `createAddress`, and `replaceAddresses`.

Keep current response payloads unchanged.

- [ ] **Step 5: Run auth/address tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "auth|session|address|registered users|persists address"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add lib/repositories/users.js server.js tests/api.spec.js
git commit -m "feat: persist users sessions and addresses in sqlite"
```

---

### Task 5: Move Carts To SQLite With Anonymous Session Carts

**Files:**
- Create: `lib/repositories/carts.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing cart persistence tests**

Add tests near cart tests:

```js
test("creates an anonymous session cart in SQLite", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  expect(response.ok()).toBe(true);
  const sessionCookie = getSessionCookie(response);
  expect(sessionCookie).toContain("socks_session=");

  const db = createDatabase(testDbFile);
  try {
    const cart = db.prepare("SELECT owner_type FROM carts WHERE session_id = ?").get(sessionCookie.replace("socks_session=", ""));
    const item = db.prepare("SELECT sku_id, quantity FROM cart_items").get();
    expect(cart).toEqual({ owner_type: "anonymous" });
    expect(item).toEqual({ sku_id: "sock-01-39", quantity: 1 });
  } finally {
    db.close();
  }
});

test("keeps anonymous cart stable through the session cookie", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const sessionCookie = getSessionCookie(addResponse);

  const cartResponse = await request.get("/api/cart", {
    headers: { cookie: sessionCookie }
  });
  expect(cartResponse.ok()).toBe(true);
  expect((await cartResponse.json()).items).toEqual([
    expect.objectContaining({ skuId: "sock-01-39", quantity: 1 })
  ]);
});
```

- [ ] **Step 2: Run cart persistence tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "anonymous session cart|session cookie"
```

Expected: FAIL because cart still uses JSON and add-cart does not set anonymous session cookie.

- [ ] **Step 3: Create `lib/repositories/carts.js`**

Create repository functions:

```js
function nowIso() {
  return new Date().toISOString();
}

function createCartId(ownerType, ownerId) {
  return `${ownerType}-${ownerId}`;
}

function ensureCart(db, context) {
  const timestamp = nowIso();
  const ownerType = context.userId ? "user" : "anonymous";
  const ownerId = context.userId || context.sessionId;
  const cartId = createCartId(ownerType, ownerId);

  db.prepare(`
    INSERT OR IGNORE INTO carts (id, owner_type, user_id, session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cartId, ownerType, context.userId || null, context.userId ? null : context.sessionId, timestamp, timestamp);

  return db.prepare("SELECT * FROM carts WHERE id = ?").get(cartId);
}

function getCartItems(db, cartId) {
  return db.prepare(`
    SELECT product_id AS productId, sku_id AS skuId, size, quantity
    FROM cart_items
    WHERE cart_id = ?
    ORDER BY created_at ASC
  `).all(cartId);
}

function getCart(db, context) {
  const cart = ensureCart(db, context);
  return { id: cart.id, items: getCartItems(db, cart.id) };
}

function upsertCartItem(db, cartId, item) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO cart_items (cart_id, product_id, sku_id, size, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cart_id, sku_id) DO UPDATE SET
      quantity = excluded.quantity,
      updated_at = excluded.updated_at
  `).run(cartId, item.productId, item.skuId, item.size, item.quantity, timestamp, timestamp);
}

function removeCartItem(db, cartId, skuId) {
  return db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND sku_id = ?").run(cartId, skuId);
}

function clearCart(db, cartId) {
  db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cartId);
}

function replaceCartItems(db, cartId, items) {
  clearCart(db, cartId);
  items.forEach((item) => upsertCartItem(db, cartId, item));
}

module.exports = {
  ensureCart,
  getCart,
  getCartItems,
  upsertCartItem,
  removeCartItem,
  clearCart,
  replaceCartItems
};
```

- [ ] **Step 4: Add anonymous session creation in cart routes**

In `server.js`, add helper:

```js
function ensureRequestSession(request, response, user) {
  const existingSessionId = parseCookies(request.headers.cookie || "")[sessionCookieName];
  if (existingSessionId) {
    return { sessionId: existingSessionId, headers: {} };
  }

  const sessionId = createSessionId();
  createSession(database, { id: sessionId, userId: user?.id || null });
  return {
    sessionId,
    headers: { "Set-Cookie": createSessionCookie(sessionId) }
  };
}
```

Use it in add/update/remove/clear cart routes so anonymous carts are keyed by `socks_session`.

- [ ] **Step 5: Wire cart routes through repository**

Replace `readActiveCart` and `writeActiveCart` usage with SQLite cart repository functions:

- `GET /api/cart`: resolve user/session, `getCart(database, context)`, return `getCartPayload(cart)`.
- `POST /api/cart/items`: resolve variant, validate stock, upsert merged quantity.
- `PATCH /api/cart/items`: validate stock, set quantity.
- `DELETE /api/cart/items`: resolve variant and delete by `skuId`.
- `POST /api/cart/clear`: delete cart items for current cart.

When setting a new anonymous session, use `sendJsonWithHeaders`.

- [ ] **Step 6: Run cart tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "cart|SKU-backed|stock|anonymous session"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add lib/repositories/carts.js server.js tests/api.spec.js
git commit -m "feat: persist carts in sqlite"
```

---

### Task 6: Merge Anonymous Cart Into User Cart In SQLite

**Files:**
- Modify: `lib/repositories/carts.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing merge transaction tests**

Add tests near existing user cart merge tests:

```js
test("merges anonymous SQLite cart into user cart after login", async ({ request }) => {
  const anonymousAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 2 }
  });
  const anonymousCookie = getSessionCookie(anonymousAdd);

  await request.post("/api/auth/register", { data: registerPayload });
  const loginResponse = await request.post("/api/auth/login", {
    headers: { cookie: anonymousCookie },
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  const userCookie = getSessionCookie(loginResponse);

  const cartResponse = await request.get("/api/cart", { headers: { cookie: userCookie } });
  expect((await cartResponse.json()).items).toEqual([
    expect.objectContaining({ skuId: "sock-01-43", quantity: 2 })
  ]);
});

test("caps SQLite cart merge quantities by SKU stock", async ({ request }) => {
  const anonymousAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  const anonymousCookie = getSessionCookie(anonymousAdd);

  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const userCookie = getSessionCookie(registerResponse);
  await request.post("/api/cart/items", {
    headers: { cookie: userCookie },
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });

  const loginResponse = await request.post("/api/auth/login", {
    headers: { cookie: anonymousCookie },
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  expect(loginResponse.status()).toBe(200);

  const cartResponse = await request.get("/api/cart", {
    headers: { cookie: getSessionCookie(loginResponse) }
  });
  expect((await cartResponse.json()).items).toEqual([
    expect.objectContaining({ skuId: "sock-01-43", quantity: 3 })
  ]);
});
```

- [ ] **Step 2: Run merge tests and verify they fail if merge is not yet wired**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SQLite cart merge|merges anonymous SQLite"
```

Expected: FAIL until login/register merge calls SQLite cart repository.

- [ ] **Step 3: Add cart merge repository function**

In `lib/repositories/carts.js`, add:

```js
function mergeCarts(db, { anonymousSessionId, userId, getStockLimit }) {
  const transaction = db.transaction(() => {
    const anonymousCart = ensureCart(db, { sessionId: anonymousSessionId });
    const userCart = ensureCart(db, { userId });
    const anonymousItems = getCartItems(db, anonymousCart.id);
    const userItems = getCartItems(db, userCart.id);
    const userBySku = new Map(userItems.map((item) => [item.skuId, item]));

    anonymousItems.forEach((item) => {
      const existing = userBySku.get(item.skuId);
      const requestedQuantity = (existing?.quantity || 0) + item.quantity;
      const stockLimit = getStockLimit(item.skuId);
      const quantity = stockLimit == null ? requestedQuantity : Math.min(requestedQuantity, stockLimit);
      upsertCartItem(db, userCart.id, { ...item, quantity });
    });

    clearCart(db, anonymousCart.id);
    return { id: userCart.id, items: getCartItems(db, userCart.id) };
  });

  return transaction();
}

module.exports.mergeCarts = mergeCarts;
```

- [ ] **Step 4: Wire merge into register/login**

In `server.js`, after creating a logged-in session, call `mergeCarts` when the request has an anonymous `socks_session` cookie different from the new session id:

```js
const previousSessionId = parseCookies(request.headers.cookie || "")[sessionCookieName];
if (previousSessionId) {
  mergeCarts(database, {
    anonymousSessionId: previousSessionId,
    userId: user.id,
    getStockLimit: (skuId) => {
      const row = database.prepare("SELECT stock_quantity FROM product_variants WHERE sku_id = ?").get(skuId);
      return row ? row.stock_quantity : null;
    }
  });
}
```

- [ ] **Step 5: Run merge and auth/cart regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "merge|auth|cart"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add lib/repositories/carts.js server.js tests/api.spec.js
git commit -m "feat: merge sqlite carts on login"
```

---

### Task 7: Move Orders To SQLite And Deduct Inventory Transactionally

**Files:**
- Create: `lib/repositories/orders.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing order inventory tests**

Add tests near order creation tests:

```js
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
```

- [ ] **Step 2: Run order transaction tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SQLite orders|rolls back checkout"
```

Expected: FAIL because orders still use JSON and stock is not deducted from SQLite.

- [ ] **Step 3: Create `lib/repositories/orders.js`**

Create:

```js
function nowIso() {
  return new Date().toISOString();
}

function insertOrder(db, order) {
  db.prepare(`
    INSERT INTO orders (id, user_id, status, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(order.id, order.userId || null, order.status, JSON.stringify(order), order.createdAt, order.updatedAt);

  const insertItem = db.prepare("INSERT INTO order_items (order_id, sku_id, payload) VALUES (?, ?, ?)");
  order.items.forEach((item) => {
    insertItem.run(order.id, item.skuId, JSON.stringify(item));
  });

  const insertTimeline = db.prepare("INSERT INTO order_timeline (order_id, status, label, at) VALUES (?, ?, ?, ?)");
  order.timeline.forEach((entry) => {
    insertTimeline.run(order.id, entry.status, entry.label, entry.at);
  });
}

function createOrderTransaction(db, { cart, order, clearCart }) {
  const transaction = db.transaction(() => {
    cart.items.forEach((item) => {
      const result = db.prepare(`
        UPDATE product_variants
        SET stock_quantity = stock_quantity - ?
        WHERE sku_id = ?
          AND is_available = 1
          AND stock_quantity >= ?
      `).run(item.quantity, item.skuId, item.quantity);

      if (result.changes !== 1) {
        const error = new Error("Selected size stock is not enough for the requested quantity.");
        error.code = "INSUFFICIENT_STOCK";
        throw error;
      }
    });

    insertOrder(db, order);
    clearCart();
    return order;
  });

  return transaction();
}

function listOrders(db, userId) {
  const rows = userId
    ? db.prepare("SELECT payload FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(userId)
    : db.prepare("SELECT payload FROM orders ORDER BY created_at DESC").all();
  return rows.map((row) => JSON.parse(row.payload));
}

function findOrderById(db, orderId) {
  const row = db.prepare("SELECT payload FROM orders WHERE id = ?").get(orderId);
  return row ? JSON.parse(row.payload) : null;
}

function saveOrder(db, order) {
  db.prepare("UPDATE orders SET status = ?, payload = ?, updated_at = ? WHERE id = ?")
    .run(order.status, JSON.stringify(order), order.updatedAt, order.id);
  db.prepare("DELETE FROM order_timeline WHERE order_id = ?").run(order.id);
  const insertTimeline = db.prepare("INSERT INTO order_timeline (order_id, status, label, at) VALUES (?, ?, ?, ?)");
  order.timeline.forEach((entry) => insertTimeline.run(order.id, entry.status, entry.label, entry.at));
  return order;
}

module.exports = {
  createOrderTransaction,
  listOrders,
  findOrderById,
  saveOrder
};
```

- [ ] **Step 4: Wire order routes through repository**

In `server.js`:

- Build order payload as before.
- Use SQLite cart repository to read current cart.
- Call `createOrderTransaction(database, { cart, order, clearCart })`.
- On thrown `error.code === "INSUFFICIENT_STOCK"`, send `409`.
- List, detail, and status update routes read/write through order repository.

- [ ] **Step 5: Run order tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "order|checkout|SQLite orders|rolls back checkout"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add lib/repositories/orders.js server.js tests/api.spec.js
git commit -m "feat: persist orders and deduct sku stock"
```

---

### Task 8: Add Two-Request Concurrent Checkout Guard

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `lib/repositories/orders.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing low-concurrency checkout test**

Add this test near checkout inventory tests:

```js
test("allows only one checkout to claim the final SKU stock", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "44", quantity: 2 }
  });
  const firstCookie = getSessionCookie(firstAdd);

  const secondContext = await request.newContext();
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

  await secondContext.dispose();
});
```

This uses exactly two requests and is not a stress test.

- [ ] **Step 2: Run two-request checkout test**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "final SKU stock"
```

Expected: PASS if Task 7 transaction is correct. If it fails with both requests succeeding, fix the inventory update condition in `createOrderTransaction`.

- [ ] **Step 3: Ensure order transaction uses guarded updates**

Confirm the SQL is:

```sql
UPDATE product_variants
SET stock_quantity = stock_quantity - ?
WHERE sku_id = ?
  AND is_available = 1
  AND stock_quantity >= ?
```

Confirm the code checks:

```js
if (result.changes !== 1) {
  const error = new Error("Selected size stock is not enough for the requested quantity.");
  error.code = "INSUFFICIENT_STOCK";
  throw error;
}
```

- [ ] **Step 4: Run SKU/order tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "final SKU stock|INSUFFICIENT_STOCK|order|checkout"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add lib/repositories/orders.js server.js tests/api.spec.js
git commit -m "test: cover transactional sku checkout"
```

---

### Task 9: Remove Live JSON State Dependency And Preserve Seed Fixtures

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`
- Modify: `docs/superpowers/plans/2026-07-23-socks-sqlite-persistence.md` if execution notes are needed

- [ ] **Step 1: Write failing test proving live JSON cart is ignored**

Add:

```js
test("does not read live cart state from JSON files after SQLite migration", async ({ request }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 99 }]
  }, null, 2)}\n`, "utf8");

  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);
  expect((await response.json()).items).toEqual([]);
});
```

- [ ] **Step 2: Run JSON dependency test and verify it passes only after route migration**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "does not read live cart state"
```

Expected: PASS after Tasks 5-7.

- [ ] **Step 3: Remove unused JSON live-state helpers**

In `server.js`, remove or stop using:

- `ordersFile`
- `usersFile`
- `sessionsFile`
- `userCartsFile`
- live `cartFile` usage outside product seeding compatibility
- `readActiveCart` and `writeActiveCart` if fully replaced

Keep `productsFile` only as seed source if `lib/database.js` still needs it.

- [ ] **Step 4: Run focused no-JSON regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "does not read live cart state|products|cart|order|auth|address"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "refactor: remove live json state reads"
```

---

### Task 10: Final Targeted Verification

**Files:**
- Verify: `server.js`
- Verify: `lib/api-errors.js`
- Verify: `lib/database.js`
- Verify: `lib/repositories/products.js`
- Verify: `lib/repositories/carts.js`
- Verify: `lib/repositories/users.js`
- Verify: `lib/repositories/orders.js`
- Verify: `tests/api.spec.js`
- Verify: `socks-product-list.html`

- [ ] **Step 1: Run backend persistence tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SQLite|sqlite|database|session|cart|order|checkout|address|SKU|error"
```

Expected: PASS.

- [ ] **Step 2: Run storefront flow tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "cart|checkout|order|auth|address|SKU|stock|detail"
```

Expected: PASS, with only intentionally skipped legacy confirmation tests remaining skipped.

- [ ] **Step 3: Run focused API full file**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js
```

Expected: PASS.

- [ ] **Step 4: Manual smoke check one local service**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm run dev
```

Open:

```text
http://127.0.0.1:4173/socks-product-list.html
```

Manual flow:

```text
Open storefront -> add sock-01 size 43 -> checkout -> create order -> reopen product list -> verify size 43 available stock decreased -> register/login -> add anonymous cart -> login merge -> manage address -> view order history.
```

Expected:

```text
The storefront behaves the same visually, but cart/session/order/inventory state is persisted in SQLite and checkout cannot oversell low-stock SKUs.
```

- [ ] **Step 5: Commit verification fixes if any**

If no changes are needed, skip this commit. If test-only or wiring fixes are required:

```powershell
git add server.js lib tests package.json package-lock.json .gitignore
git commit -m "test: verify sqlite persistence flow"
```

---

## Self-Review

- Spec coverage: database bootstrap, product seeding, sessions, anonymous carts, login merge, cart mutation, transactional orders, two-request concurrency guard, error contract, and no live JSON state are all mapped to tasks.
- Placeholder scan: no unresolved implementation markers remain.
- Type consistency: SQL uses `sku_id`, API payloads use `skuId`, cart items keep `productId`, `skuId`, `size`, and `quantity`.
- Risk control: tests are targeted, concurrency test uses exactly two requests, and there is no high-frequency retry or supplier/model activity.

# Socks Engineering Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first engineering foundation layer for the socks storefront: centralized config, logging, HTTP helpers, security headers, database migrations, externalized storefront script, and a lightweight route boundary.

**Architecture:** Keep the current vanilla Node HTTP server and SQLite repository model, but move reusable infrastructure out of `server.js` into focused `lib/` modules. Keep the first frontend split conservative by extracting only the main storefront script into `public/js/storefront-app.js` while preserving existing HTML, CSS, selectors, and user flows.

**Tech Stack:** Node.js HTTP server, SQLite via existing database adapter, vanilla HTML/CSS/JavaScript, Playwright.

---

## File Structure

- Create: `lib/config.js`
  - Parse and validate environment values for host, port, data directory, log level, request body limit, and security headers.
- Create: `lib/logger.js`
  - Provide a small level-based logger with injectable sink for tests.
- Create: `lib/security.js`
  - Provide safe default headers and helpers for static/API responses.
- Create: `lib/http/responses.js`
  - Centralize JSON responses and API error responses.
- Create: `lib/http/request-body.js`
  - Read JSON request bodies with size limits and typed parse errors.
- Create: `lib/http/cookies.js`
  - Centralize cookie parsing and session cookie formatting.
- Create: `lib/http/static-files.js`
  - Resolve and send static files, including the new `public/` directory.
- Create: `lib/http/router.js`
  - Register and dispatch route handlers with exact path and pattern helpers.
- Create: `lib/database/connection.js`
  - Move SQLite driver loading, path resolution, and connection creation behind the existing API.
- Create: `lib/database/migrations.js`
  - Add `schema_migrations` and a migration runner.
- Create: `lib/database/schema.js`
  - Hold schema SQL that is currently embedded in `lib/database.js`.
- Create: `lib/database/seed.js`
  - Hold product and marketing seed logic currently embedded in `lib/database.js`.
- Create: `lib/database/index.js`
  - Re-export `createDatabase`, `initializeDatabase`, `resetDatabase`, and `getDatabasePath` for compatibility.
- Modify: `lib/database.js`
  - Convert to a compatibility wrapper around `lib/database/index.js`.
- Create: `lib/routes/health-routes.js`
  - Register `/api/health`.
- Create: `lib/routes/product-routes.js`
  - Register `GET /api/products`.
- Create: `lib/routes/marketing-routes.js`
  - Register `GET /api/marketing`, `GET /api/recommendations`, and `POST /api/recent-views` if context extraction remains small.
- Create: `public/js/storefront-app.js`
  - Host the extracted main script from `socks-product-list.html`.
- Modify: `server.js`
  - Use the new config/logger/http/security/database modules, keep complex routes in place until they can be safely moved.
- Modify: `socks-product-list.html`
  - Replace the inline main script with a deferred same-origin script tag.
- Modify: `.env.example`
  - Document environment variables.
- Modify: `playwright.config.js`
  - Keep test env explicit and single-server friendly.
- Modify: `tests/api.spec.js`
  - Add config, logging, security header, request body, migration, and route-regression tests.
- Modify: `tests/socks-product-list.spec.js`
  - Add externalized script smoke coverage through existing page behavior.
- Modify: `tests/socks-product-card.spec.js`
  - Update startup failure tests if config error wording changes.

## Safety Rules For Execution

- Run Playwright commands with `--workers=1` unless a command is only a pure unit-like API subset and uses the existing single web server.
- Do not start looped health checks, pressure tests, or repeated retry scripts.
- Use this PowerShell prefix for every command that reads or writes text:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8;
```

- Do not edit test fixture JSON files except when a test explicitly writes them; clean fixture noise before every commit.
- Preserve real UTF-8 Chinese text. Do not use `\uXXXX` escapes for Chinese copy.

## Task 1: Config And Logger Foundation

**Files:**
- Create: `lib/config.js`
- Create: `lib/logger.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing tests for config parsing**

Add near the top-level infrastructure tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Write failing tests for logger filtering**

Add:

```js
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
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "engineering config|structured logger" --workers=1
```

Expected: FAIL with module-not-found errors for `../lib/config` and `../lib/logger`.

- [ ] **Step 4: Implement `lib/config.js`**

Create `lib/config.js`:

```js
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const allowedLogLevels = new Set(["debug", "info", "warn", "error", "silent"]);

function parseIntegerEnv(env, key, defaultValue, { min, max }) {
  const rawValue = env[key];
  const value = rawValue === undefined || rawValue === "" ? defaultValue : Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function parseBooleanEnv(env, key, defaultValue) {
  const rawValue = env[key];
  if (rawValue === undefined || rawValue === "") return defaultValue;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function createConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "development").trim() || "development";
  const dataDirValue = String(env.DATA_DIR || "data").trim();
  if (!dataDirValue) {
    throw new Error("DATA_DIR cannot be empty");
  }

  const logLevel = String(env.LOG_LEVEL || (nodeEnv === "test" ? "warn" : "info")).trim();
  if (!allowedLogLevels.has(logLevel)) {
    throw new Error("LOG_LEVEL must be one of debug, info, warn, error, silent");
  }

  return {
    rootDir,
    host: String(env.HOST || "127.0.0.1").trim() || "127.0.0.1",
    port: parseIntegerEnv(env, "PORT", 4173, { min: 0, max: 65535 }),
    dataDir: path.resolve(rootDir, dataDirValue),
    nodeEnv,
    isTest: nodeEnv === "test" || dataDirValue.includes(path.join("tests", "fixtures", "test-data")),
    logLevel,
    requestBodyLimitBytes: parseIntegerEnv(env, "REQUEST_BODY_LIMIT_BYTES", 1048576, {
      min: 1024,
      max: 10485760
    }),
    securityHeadersEnabled: parseBooleanEnv(env, "SECURITY_HEADERS_ENABLED", true)
  };
}

module.exports = {
  createConfig
};
```

- [ ] **Step 5: Implement `lib/logger.js`**

Create `lib/logger.js`:

```js
const levelRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

function serializeContext(context) {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(context)}`;
}

function createLogger({ level = "info", sink = console.log, now = () => new Date() } = {}) {
  const minimumRank = levelRank[level] ?? levelRank.info;

  function write(entryLevel, event, context = {}) {
    if ((levelRank[entryLevel] ?? levelRank.info) < minimumRank) {
      return;
    }
    sink(`${now().toISOString()} [${entryLevel}] ${event}${serializeContext(context)}`);
  }

  return {
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, context) => write("error", event, context)
  };
}

module.exports = {
  createLogger
};
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "engineering config|structured logger" --workers=1
```

Expected: config and logger tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/config.js lib/logger.js tests/api.spec.js; git commit -m "feat: add config logger foundation"
```

## Task 2: HTTP Helpers And Security Headers

**Files:**
- Create: `lib/security.js`
- Create: `lib/http/responses.js`
- Create: `lib/http/request-body.js`
- Create: `lib/http/cookies.js`
- Create: `lib/http/static-files.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-card.spec.js`

- [ ] **Step 1: Write failing tests for security headers**

Add to `tests/api.spec.js`:

```js
test("adds baseline security headers to API responses", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
});

test("serves storefront JavaScript with security headers and JavaScript content type", async ({ request }) => {
  const response = await request.get("/public/js/storefront-app.js");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/javascript");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
```

- [ ] **Step 2: Write failing tests for request body limits and invalid JSON**

Add:

```js
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
    data: "{not-json"
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
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "security headers|oversized JSON|invalid JSON errors" --workers=1
```

Expected: FAIL because security headers and body limit handling are not centralized yet; `/public/js/storefront-app.js` may return 404 until Task 4.

- [ ] **Step 4: Implement `lib/security.js`**

Create:

```js
const defaultSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"
};

function getSecurityHeaders(enabled = true) {
  return enabled ? { ...defaultSecurityHeaders } : {};
}

function mergeHeaders(...headerGroups) {
  return Object.assign({}, ...headerGroups.filter(Boolean));
}

module.exports = {
  getSecurityHeaders,
  mergeHeaders
};
```

- [ ] **Step 5: Implement `lib/http/responses.js`**

Create:

```js
const { createApiError } = require("../api-errors");
const { getSecurityHeaders, mergeHeaders } = require("../security");

function sendJson(response, statusCode, payload, options = {}) {
  response.writeHead(statusCode, mergeHeaders(
    getSecurityHeaders(options.securityHeadersEnabled),
    { "Content-Type": "application/json; charset=utf-8" },
    options.headers
  ));
  response.end(JSON.stringify(payload));
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}, options = {}) {
  sendJson(response, statusCode, payload, {
    ...options,
    headers
  });
}

function sendError(response, statusCode, code, message, details = {}, options = {}) {
  const apiError = createApiError(code, { statusCode, message, details });
  sendJson(response, apiError.statusCode, apiError.payload, options);
}

module.exports = {
  sendJson,
  sendJsonWithHeaders,
  sendError
};
```

- [ ] **Step 6: Implement `lib/http/request-body.js`**

Create:

```js
class JsonBodyError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = "JsonBodyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function readJsonBody(request, { limitBytes = 1048576 } = {}) {
  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > limitBytes) {
      throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", "Request body is too large.", 413);
    }
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new JsonBodyError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

module.exports = {
  JsonBodyError,
  readJsonBody
};
```

- [ ] **Step 7: Implement `lib/http/cookies.js`**

Create:

```js
function getCookieValue(request, cookieName) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((entry) => entry.trim().split("="))
    .find(([name]) => name === cookieName)?.[1] || "";
}

function createCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  getCookieValue,
  createCookie
};
```

- [ ] **Step 8: Implement `lib/http/static-files.js`**

Create:

```js
const fs = require("node:fs");
const path = require("node:path");
const { getSecurityHeaders, mergeHeaders } = require("../security");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStaticFile(pathname, { rootDir, staticRoutes }) {
  if (staticRoutes.has(pathname)) {
    return staticRoutes.get(pathname);
  }

  if (pathname.startsWith("/public/")) {
    const publicRoot = path.join(rootDir, "public");
    const requestedFile = path.resolve(rootDir, pathname.slice(1));
    return isPathInside(publicRoot, requestedFile) ? requestedFile : null;
  }

  return null;
}

function sendStaticFile(request, response, filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  response.writeHead(200, mergeHeaders(
    getSecurityHeaders(options.securityHeadersEnabled),
    { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" }
  ));

  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  fs.createReadStream(filePath).pipe(response);
  return true;
}

module.exports = {
  resolveStaticFile,
  sendStaticFile
};
```

- [ ] **Step 9: Wire helpers into `server.js` without moving routes**

In `server.js`:

- Import `createConfig`, `createLogger`, `sendJson`, `sendJsonWithHeaders`, `sendError`, `JsonBodyError`, `readJsonBody`, `getCookieValue`, `createCookie`, `resolveStaticFile`, and `sendStaticFile`.
- Replace local `host`, `port`, `dataDir`, `rootDir` with `const config = createConfig(process.env)`.
- Replace local `sendJson`, `sendJsonWithHeaders`, `sendError`, `readRequestBody`, and `getCookieValue` definitions with imported helpers or wrapper functions:

```js
async function readRequestBody(request) {
  return readJsonBody(request, { limitBytes: config.requestBodyLimitBytes });
}

function handleJsonBodyError(error, response) {
  if (error instanceof JsonBodyError) {
    sendError(response, error.statusCode, error.code, error.message, {}, config);
    return true;
  }
  return false;
}
```

- In every `catch (error)` that currently checks `error instanceof SyntaxError`, replace with:

```js
if (handleJsonBodyError(error, response)) {
  return;
}
```

- Pass `config` into response helpers:

```js
sendJson(response, 200, payload, config);
sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.", {}, config);
```

- Replace session cookie creation with `createCookie`.
- Replace static serving with `resolveStaticFile` and `sendStaticFile`.

- [ ] **Step 10: Run focused tests and verify pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "security headers|oversized JSON|invalid JSON errors|session|cart" --workers=1
```

Expected: security, request body, session, and cart tests pass. The static JS test may still fail until Task 4 if `public/js/storefront-app.js` has not been created; if so, leave that single failure documented and proceed to Task 4 before committing.

- [ ] **Step 11: Commit if focused tests excluding external JS pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/config.js lib/logger.js lib/security.js lib/http server.js tests/api.spec.js tests/socks-product-card.spec.js; git commit -m "feat: add http config security foundation"
```

Expected: commit succeeds after all Task 2 tests that do not require `public/js/storefront-app.js` pass.

## Task 3: Database Migration Runner

**Files:**
- Create: `lib/database/connection.js`
- Create: `lib/database/migrations.js`
- Create: `lib/database/schema.js`
- Create: `lib/database/seed.js`
- Create: `lib/database/index.js`
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing migration tests**

Add to `tests/api.spec.js` near existing SQLite initialization tests:

```js
test("records schema migrations during database initialization", async () => {
  const {
    createDatabase,
    initializeDatabase,
    resetDatabase,
    getDatabasePath
  } = require("../lib/database");

  const dbFile = getDatabasePath({ dataDir: "tests/fixtures/test-data", nodeEnv: "test" });
  await resetDatabase(dbFile);

  const db = createDatabase(dbFile);
  try {
    initializeDatabase(db, { productsSeedFile });
    const migrations = db.prepare("SELECT id, name FROM schema_migrations ORDER BY id ASC").all();
    expect(migrations.map((migration) => migration.id)).toContain("0001_initial_schema");
    expect(migrations.map((migration) => migration.id)).toContain("0002_cart_coupon_code");
  } finally {
    db.close();
  }
});

test("runs database initialization idempotently without duplicate seeds", async () => {
  const {
    createDatabase,
    initializeDatabase,
    resetDatabase,
    getDatabasePath
  } = require("../lib/database");

  const dbFile = getDatabasePath({ dataDir: "tests/fixtures/test-data", nodeEnv: "test" });
  await resetDatabase(dbFile);

  const db = createDatabase(dbFile);
  try {
    initializeDatabase(db, { productsSeedFile });
    initializeDatabase(db, { productsSeedFile });

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
```

- [ ] **Step 2: Run migration tests and verify fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "schema migrations|idempotently" --workers=1
```

Expected: FAIL because `schema_migrations` does not exist.

- [ ] **Step 3: Split database connection**

Create `lib/database/connection.js` by moving driver loading and path functions from `lib/database.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");

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
  if (options.filePath) return options.filePath;
  const dataDir = path.resolve(rootDir, options.dataDir || process.env.DATA_DIR || "data");
  const isTest = options.nodeEnv === "test"
    || process.env.NODE_ENV === "test"
    || dataDir.includes(path.join("tests", "fixtures", "test-data"));
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

module.exports = {
  createDatabase,
  getDatabasePath,
  rootDir
};
```

- [ ] **Step 4: Move schema SQL to `lib/database/schema.js`**

Create `lib/database/schema.js` with:

```js
const initialSchemaSql = `
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
`;

const remainingSchemaSql = `
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
`;

module.exports = {
  initialSchemaSql: `${initialSchemaSql}\n${remainingSchemaSql}`
};
```

If any table is missing from the current `runSchema`, copy it exactly from `lib/database.js` into `remainingSchemaSql` before running tests.

- [ ] **Step 5: Implement migration runner**

Create `lib/database/migrations.js`:

```js
const { initialSchemaSql } = require("./schema");

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function hasMigration(db, id) {
  return Boolean(db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id));
}

function recordMigration(db, migration) {
  db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)")
    .run(migration.id, migration.name, new Date().toISOString());
}

const migrations = [
  {
    id: "0001_initial_schema",
    name: "Initial storefront schema",
    up(db) {
      db.exec(initialSchemaSql);
    }
  },
  {
    id: "0002_cart_coupon_code",
    name: "Ensure carts coupon code column",
    up(db) {
      const columns = db.prepare("PRAGMA table_info(carts)").all();
      if (!columns.some((column) => column.name === "coupon_code")) {
        db.prepare("ALTER TABLE carts ADD COLUMN coupon_code TEXT").run();
      }
    }
  }
];

function runMigrations(db) {
  ensureMigrationTable(db);
  migrations.forEach((migration) => {
    if (hasMigration(db, migration.id)) {
      return;
    }
    const transaction = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration);
    });
    transaction();
  });
}

module.exports = {
  migrations,
  runMigrations
};
```

- [ ] **Step 6: Move seed logic**

Create `lib/database/seed.js` by moving `seedProducts` and `seedMarketing` from `lib/database.js`. Export:

```js
module.exports = {
  seedMarketing,
  seedProducts
};
```

Keep the exact product and marketing seed payloads from current `lib/database.js`.

- [ ] **Step 7: Add compatible database index module and wrapper**

Create `lib/database/index.js`:

```js
const fsp = require("node:fs/promises");
const { createDatabase, getDatabasePath } = require("./connection");
const { rootDir } = require("./connection");
const { runMigrations } = require("./migrations");
const { seedMarketing, seedProducts } = require("./seed");

function initializeDatabase(db, options = {}) {
  runMigrations(db);
  seedProducts(db, options.productsSeedFile);
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
  getDatabasePath,
  initializeDatabase,
  resetDatabase,
  rootDir
};
```

Replace `lib/database.js` contents with:

```js
module.exports = require("./database/index");
```

- [ ] **Step 8: Run migration and full API tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "schema migrations|idempotently|SQLite|products|cart" --workers=1
```

Expected: migration, SQLite, products, and cart tests pass.

- [ ] **Step 9: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/database.js lib/database tests/api.spec.js; git commit -m "feat: add database migration runner"
```

## Task 4: Externalize Storefront Script

**Files:**
- Create: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing static asset and UI smoke tests**

Add to `tests/api.spec.js` if not already added in Task 2:

```js
test("serves the external storefront script", async ({ request }) => {
  const response = await request.get("/public/js/storefront-app.js");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/javascript");
  const body = await response.text();
  expect(body).toContain("fetchCart");
  expect(body).toContain("renderProducts");
});
```

Add to `tests/socks-product-list.spec.js`:

```js
test("boots the storefront from the external script bundle", async ({ page }) => {
  const scriptResponse = page.waitForResponse((response) => {
    return response.url().includes("/public/js/storefront-app.js") && response.status() === 200;
  });

  await page.goto("/socks-product-list.html");
  expect((await scriptResponse).ok()).toBe(true);
  await expect(page.locator("[data-product-card]")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开购物车" })).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js tests/socks-product-list.spec.js -g "external storefront script|external script bundle" --workers=1
```

Expected: FAIL because `public/js/storefront-app.js` does not exist and HTML still uses inline script.

- [ ] **Step 3: Extract the inline storefront script**

Use a safe one-time extraction command after confirming the script boundaries manually:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; $html = Get-Content -Raw -Encoding UTF8 socks-product-list.html; $start = $html.LastIndexOf('<script>'); $end = $html.LastIndexOf('</script>'); if ($start -lt 0 -or $end -lt $start) { throw 'Unable to locate final inline script'; }; $script = $html.Substring($start + '<script>'.Length, $end - ($start + '<script>'.Length)).Trim(); New-Item -ItemType Directory -Force public/js | Out-Null; Set-Content -Encoding UTF8 public/js/storefront-app.js ($script + "`n")
```

This command only creates the external file. It does not modify `socks-product-list.html`.

- [ ] **Step 4: Replace the inline script tag using `apply_patch`**

In `socks-product-list.html`, replace the final inline script block with:

```html
  <script src="/public/js/storefront-app.js" defer></script>
```

Do not move CSS or HTML markup in this task.

- [ ] **Step 5: Verify the extracted script has no surrounding HTML**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; Select-String -Path public/js/storefront-app.js -Pattern '</script>|<html|<body|<!doctype' -SimpleMatch
```

Expected: no matches.

- [ ] **Step 6: Run static and UI smoke tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js tests/socks-product-list.spec.js -g "external storefront script|external script bundle" --workers=1
```

Expected: external script API and UI boot tests pass.

- [ ] **Step 7: Run cart and admin UI smoke tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "cart|admin" --workers=1
```

Expected: cart and admin UI tests pass or existing skipped tests remain skipped.

- [ ] **Step 8: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add public/js/storefront-app.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js; git commit -m "refactor: externalize storefront script"
```

## Task 5: Lightweight Router And Low-Risk Route Migration

**Files:**
- Create: `lib/http/router.js`
- Create: `lib/routes/health-routes.js`
- Create: `lib/routes/product-routes.js`
- Create: `lib/routes/marketing-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing router unit-style tests through API behavior**

Add:

```js
test("keeps migrated health product and marketing routes behavior stable", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ ok: true });

  const products = await request.get("/api/products?filter=sport&sort=price-asc&pageSize=4&locale=en-US");
  expect(products.ok()).toBe(true);
  const productsPayload = await products.json();
  expect(productsPayload.items.length).toBeGreaterThan(0);
  expect(productsPayload.meta.filters).toMatchObject({
    filter: "sport",
    sort: "price-asc"
  });

  const marketing = await request.get("/api/marketing");
  expect(marketing.ok()).toBe(true);
  const marketingPayload = await marketing.json();
  expect(Array.isArray(marketingPayload.promotions)).toBe(true);
  expect(Array.isArray(marketingPayload.coupons)).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify current behavior passes before migration**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "migrated health product and marketing" --workers=1
```

Expected: PASS before route migration. This is a characterization test.

- [ ] **Step 3: Implement `lib/http/router.js`**

Create:

```js
function createRouter() {
  const routes = [];

  function add(method, matcher, handler) {
    routes.push({ method, matcher, handler });
  }

  function get(pathname, handler) {
    add("GET", pathname, handler);
  }

  function post(pathname, handler) {
    add("POST", pathname, handler);
  }

  function matchRoute(method, pathname) {
    return routes.find((route) => {
      if (route.method !== method) return false;
      if (typeof route.matcher === "string") return route.matcher === pathname;
      return route.matcher.test(pathname);
    }) || null;
  }

  async function dispatch(context) {
    const route = matchRoute(context.request.method, context.requestUrl.pathname);
    if (!route) {
      return false;
    }
    await route.handler(context);
    return true;
  }

  return {
    get,
    post,
    add,
    dispatch
  };
}

module.exports = {
  createRouter
};
```

- [ ] **Step 4: Add health route module**

Create `lib/routes/health-routes.js`:

```js
function registerHealthRoutes(router) {
  router.get("/api/health", ({ response, sendJson }) => {
    sendJson(response, 200, { ok: true });
  });
}

module.exports = {
  registerHealthRoutes
};
```

- [ ] **Step 5: Add product route module**

Create `lib/routes/product-routes.js`:

```js
function registerProductRoutes(router, services) {
  router.get("/api/products", ({ requestUrl, response, sendJson }) => {
    const products = services.withDatabase((db) => services.listProducts(db));
    const locale = services.normalizeLocale(requestUrl.searchParams.get("locale"));
    const payload = services.buildProductsPayload(products, {
      filter: requestUrl.searchParams.get("filter"),
      sort: requestUrl.searchParams.get("sort"),
      q: requestUrl.searchParams.get("q"),
      locale,
      page: requestUrl.searchParams.get("page"),
      pageSize: requestUrl.searchParams.get("pageSize"),
      priceMin: requestUrl.searchParams.get("priceMin"),
      priceMax: requestUrl.searchParams.get("priceMax"),
      size: requestUrl.searchParams.get("size"),
      stock: requestUrl.searchParams.get("stock"),
      ratingMin: requestUrl.searchParams.get("ratingMin")
    });
    sendJson(response, 200, payload);
  });
}

module.exports = {
  registerProductRoutes
};
```

If `buildProductsPayload` or `normalizeLocale` are still local to `server.js`, export them through a small `services` object from `server.js` first. Do not duplicate product filtering logic.

- [ ] **Step 6: Add marketing route module**

Create `lib/routes/marketing-routes.js`:

```js
function registerMarketingRoutes(router, services) {
  router.get("/api/marketing", ({ response, sendJson }) => {
    sendJson(response, 200, services.getMarketingPayload());
  });
}

module.exports = {
  registerMarketingRoutes
};
```

Keep recommendations and recent views in `server.js` unless their helper dependencies are already cleanly injectable.

- [ ] **Step 7: Wire router into `server.js`**

In `server.js`:

```js
const { createRouter } = require("./lib/http/router");
const { registerHealthRoutes } = require("./lib/routes/health-routes");
const { registerProductRoutes } = require("./lib/routes/product-routes");
const { registerMarketingRoutes } = require("./lib/routes/marketing-routes");

const router = createRouter();
registerHealthRoutes(router);
registerProductRoutes(router, {
  withDatabase,
  listProducts,
  normalizeLocale,
  buildProductsPayload
});
registerMarketingRoutes(router, {
  getMarketingPayload
});
```

At the start of the request handler, after `requestUrl` is created and before the old route `if` blocks:

```js
const wasHandledByRouter = await router.dispatch({
  request,
  response,
  requestUrl,
  sendJson: (targetResponse, statusCode, payload, options = {}) => sendJson(targetResponse, statusCode, payload, { ...config, ...options }),
  sendError: (targetResponse, statusCode, code, message, details = {}) => sendError(targetResponse, statusCode, code, message, details, config)
});

if (wasHandledByRouter) {
  return;
}
```

Remove or bypass the old `/api/health`, `/api/products`, and `/api/marketing` blocks after tests confirm router dispatch handles them.

- [ ] **Step 8: Run migrated route regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "migrated health product and marketing|products|marketing" --workers=1
```

Expected: migrated route tests, product API tests, and marketing API tests pass.

- [ ] **Step 9: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add lib/http/router.js lib/routes server.js tests/api.spec.js; git commit -m "refactor: add route registration boundary"
```

## Task 6: Environment Docs And Playwright Defaults

**Files:**
- Create: `.env.example`
- Modify: `playwright.config.js`
- Modify: `package.json`
- Test: `tests/api.spec.js`

- [ ] **Step 1: Write failing script/config smoke test**

Add:

```js
test("documents expected engineering environment variables", async () => {
  const fs = require("node:fs/promises");
  const envExample = await fs.readFile(".env.example", "utf8");

  expect(envExample).toContain("HOST=127.0.0.1");
  expect(envExample).toContain("PORT=4173");
  expect(envExample).toContain("DATA_DIR=data");
  expect(envExample).toContain("LOG_LEVEL=info");
  expect(envExample).toContain("REQUEST_BODY_LIMIT_BYTES=1048576");
  expect(envExample).toContain("SECURITY_HEADERS_ENABLED=true");
});
```

- [ ] **Step 2: Run test and verify fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "engineering environment variables" --workers=1
```

Expected: FAIL because `.env.example` does not exist.

- [ ] **Step 3: Add `.env.example`**

Create:

```dotenv
HOST=127.0.0.1
PORT=4173
DATA_DIR=data
NODE_ENV=development
LOG_LEVEL=info
REQUEST_BODY_LIMIT_BYTES=1048576
SECURITY_HEADERS_ENABLED=true
```

- [ ] **Step 4: Add package scripts**

In `package.json`, change scripts to:

```json
"scripts": {
  "dev": "node server.js",
  "test": "playwright test",
  "test:api": "playwright test tests/api.spec.js --workers=1",
  "test:ui": "playwright test tests/socks-product-list.spec.js --workers=1"
}
```

- [ ] **Step 5: Keep Playwright env explicit**

In `playwright.config.js`, ensure `webServer.env` includes:

```js
env: {
  DATA_DIR: "tests/fixtures/test-data",
  NODE_ENV: "test",
  PORT: "4173",
  LOG_LEVEL: "warn",
  REQUEST_BODY_LIMIT_BYTES: "1048576",
  SECURITY_HEADERS_ENABLED: "true"
}
```

- [ ] **Step 6: Run env doc test**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "engineering environment variables" --workers=1
```

Expected: environment documentation test passes.

- [ ] **Step 7: Commit**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git add .env.example package.json playwright.config.js tests/api.spec.js; git commit -m "docs: add engineering environment defaults"
```

## Task 7: Final Regression And Cleanup

**Files:**
- Modify only if verification reveals a focused issue.

- [ ] **Step 1: Run engineering foundation focused API tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js -g "engineering config|structured logger|security headers|oversized JSON|invalid JSON errors|schema migrations|idempotently|external storefront script|migrated health product and marketing|engineering environment variables" --workers=1
```

Expected: all focused engineering tests pass.

- [ ] **Step 2: Run full API suite**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/api.spec.js --workers=1
```

Expected: full API suite passes.

- [ ] **Step 3: Run key UI regression batches**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-list.spec.js -g "external script bundle|cart|checkout|order|marketing|admin|support" --workers=1
```

Expected: selected UI tests pass or existing skipped tests remain skipped.

- [ ] **Step 4: Run static-card smoke tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npx playwright test tests/socks-product-card.spec.js tests/socks-order-confirmation.spec.js --workers=1
```

Expected: static card and order confirmation tests pass.

- [ ] **Step 5: Clean generated fixture noise**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

Expected: fixture JSON files return to committed state.

- [ ] **Step 6: Check final diff and whitespace**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git diff --check; git status --short
```

Expected: no whitespace errors. Status shows no uncommitted changes after all task commits, or only intentional files staged for a final fix commit.

- [ ] **Step 7: Push branch**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; git push
```

Expected: existing PR branch updates without force push.

## Self-Review

- Spec coverage: Config, logging, HTTP helpers, request body limits, security headers, database migrations, frontend script externalization, route boundary, environment docs, and verification are each mapped to at least one task.
- 未决标记扫描：本计划使用具体文件名、函数名、测试名、命令和期望结果，没有留下未决实现标记。
- Type consistency: The plan consistently uses `createConfig`, `createLogger`, `readJsonBody`, `JsonBodyError`, `getSecurityHeaders`, `createRouter`, `runMigrations`, `schema_migrations`, and `public/js/storefront-app.js`.
- Scope control: The plan does not introduce a frontend framework, strict CSP, full template componentization, external logging services, stress tests, or a full route rewrite.
- 熔断保护：所有验证命令都显式使用 `--workers=1`，没有循环健康检查、压力测试或高并发后台智能体。

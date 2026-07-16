# Socks Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Node.js backend for the socks product list so the page loads products from HTTP APIs and writes cart changes through a persisted backend.

**Architecture:** A single `server.js` will use Node's built-in `http` module to both serve static files and expose JSON APIs. Product and cart data will live in JSON files under a configurable data directory so the app uses real persistence while tests can point to isolated test data.

**Tech Stack:** HTML, vanilla JavaScript, Node.js built-in `http/fs/path`, JSON files, Playwright

---

## File Structure

- Create: `server.js`
  Purpose: static file hosting, API routing, JSON request parsing, product filtering/sorting, cart persistence.
- Create: `data/products.json`
  Purpose: source of truth for product list data returned by `GET /api/products`.
- Create: `data/cart.json`
  Purpose: persisted anonymous cart state for `GET /api/cart` and `POST /api/cart/items`.
- Create: `tests/fixtures/test-data/products.json`
  Purpose: isolated product data for automated tests.
- Create: `tests/fixtures/test-data/cart.json`
  Purpose: isolated cart state for automated tests.
- Create: `tests/api.spec.js`
  Purpose: direct API coverage for products and cart endpoints.
- Modify: `socks-product-list.html`
  Purpose: replace in-page product array rendering with API-driven loading and cart writes.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: run list-page behavior against the HTTP server instead of `file://`.
- Modify: `tests/socks-product-card.spec.js`
  Purpose: keep the single-card page running through the same HTTP server.
- Modify: `playwright.config.js`
  Purpose: configure a `webServer` so Playwright starts the backend automatically for tests.
- Modify: `package.json`
  Purpose: add local server script and keep test execution consistent.

### Shared Data Contracts

- `GET /api/products`
  Query params: `filter=all|sport|daily|crew|no-show`, `sort=recommended|price-asc|price-desc|newest`
- `GET /api/cart`
  Response: `{ items: [{ productId, size, quantity }], meta: { itemCount } }`
- `POST /api/cart/items`
  Request body: `{ productId, size, quantity }`

### Test Server Conventions

- Default server port: `4173`
- Default data directory: `data`
- Test data directory: `tests/fixtures/test-data`
- Tests should start the server with `DATA_DIR=tests/fixtures/test-data`

### Task 1: Add backend server shell, static hosting, and test data fixtures

**Files:**
- Create: `server.js`
- Create: `data/products.json`
- Create: `data/cart.json`
- Create: `tests/fixtures/test-data/products.json`
- Create: `tests/fixtures/test-data/cart.json`
- Modify: `package.json`
- Modify: `playwright.config.js`
- Modify: `tests/socks-product-card.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing smoke test for HTTP-served pages**

Update `tests/socks-product-card.spec.js` to stop using `pathToFileURL` and instead use the Playwright `baseURL`:

```js
const { test, expect } = require("@playwright/test");

test("renders the base product card shell with a default size", async ({ page }) => {
  await page.goto("/socks-product-card.html");

  const defaultSize = page.getByRole("button", { name: "35-38" });
  const mediumSize = page.getByRole("button", { name: "39-42" });
  const largeSize = page.getByRole("button", { name: "43-45" });

  await expect(page.locator(".product-card")).toBeVisible();
  await expect(page.getByText("极简中筒袜")).toBeVisible();
  await expect(defaultSize).toHaveAttribute("aria-pressed", "true");
  await expect(defaultSize).toHaveClass(/is-selected/);
  await expect(mediumSize).toHaveAttribute("aria-pressed", "false");
  await expect(mediumSize).not.toHaveClass(/is-selected/);
  await expect(largeSize).toHaveAttribute("aria-pressed", "false");
  await expect(largeSize).not.toHaveClass(/is-selected/);
  await expect(page.getByRole("button", { name: "加入购物车" })).toBeVisible();
});
```

Update the top of `tests/socks-product-list.spec.js` in the same way:

```js
const { test, expect } = require("@playwright/test");

test.use({ viewport: { width: 1280, height: 960 } });

test("renders the socks category page shell", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect(page.getByRole("heading", { name: "袜子专区" })).toBeVisible();
  await expect(page.locator("[data-toolbar]")).toBeVisible();
  await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
  await expect(page.getByRole("button", { name: "推荐" })).toBeVisible();
  await expect(page.locator("[data-result-count]")).toBeVisible();
  await expect(page.locator("[data-product-grid]")).toBeVisible();
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run:

```powershell
npm test -- --grep "renders the base product card shell with a default size"
```

Expected:

```text
Error: page.goto: net::ERR_CONNECTION_REFUSED
```

- [ ] **Step 3: Add the minimal server shell, data files, and test runner wiring**

Create `server.js`:

```js
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || "data");

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function serveStaticFile(response, requestPath) {
  const safePath = requestPath === "/" ? "/socks-product-list.html" : requestPath;
  const filePath = path.resolve(ROOT_DIR, `.${safePath}`);

  if (!filePath.startsWith(ROOT_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = STATIC_TYPES[extension] || "application/octet-stream";
  const fileContent = await fs.readFile(filePath);
  response.writeHead(200, { "Content-Type": contentType });
  response.end(fileContent);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    await serveStaticFile(response, url.pathname);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    sendJson(response, 500, {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
  }
});

server.listen(PORT, () => {
  console.log(`Socks backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Using data directory: ${DATA_DIR}`);
});
```

Create `data/products.json` and `tests/fixtures/test-data/products.json` with the same content:

```json
[
  {
    "id": "sock-01",
    "series": "Cotton Daily",
    "title": "极简中筒袜",
    "categoryKey": "crew",
    "categoryLabel": "中筒袜",
    "price": 39,
    "originalPrice": 59,
    "discount": "32% OFF",
    "description": "柔软透气面料，适合日常通勤与居家穿着。",
    "sizes": ["35-38", "39-42", "43-45"],
    "isRecommended": true,
    "releaseDate": "2026-07-15",
    "visualTone": "#f7f7f7",
    "visualShadow": "#d4d4d4",
    "visualAccent": "#c3c3c3",
    "visualPattern": "minimal"
  },
  {
    "id": "sock-02",
    "series": "Active Base",
    "title": "轻压运动袜",
    "categoryKey": "sport",
    "categoryLabel": "运动袜",
    "price": 49,
    "originalPrice": 69,
    "discount": "29% OFF",
    "description": "包裹感更强，适合慢跑和日常训练。",
    "sizes": ["39-42", "43-45"],
    "isRecommended": true,
    "releaseDate": "2026-07-14",
    "visualTone": "#2d2d2d",
    "visualShadow": "#171717",
    "visualAccent": "#616161",
    "visualPattern": "sport"
  },
  {
    "id": "sock-03",
    "series": "Daily Soft",
    "title": "柔棉短袜",
    "categoryKey": "daily",
    "categoryLabel": "日常袜",
    "price": 25,
    "originalPrice": 39,
    "discount": "36% OFF",
    "description": "低调百搭，适合夏季与日常轻松穿着。",
    "sizes": ["35-38", "39-42"],
    "isRecommended": false,
    "releaseDate": "2026-07-10",
    "visualTone": "#f1f1f1",
    "visualShadow": "#cfcfcf",
    "visualAccent": "#bcbcbc",
    "visualPattern": "soft"
  },
  {
    "id": "sock-04",
    "series": "Motion Fit",
    "title": "速干训练袜",
    "categoryKey": "sport",
    "categoryLabel": "运动袜",
    "price": 45,
    "originalPrice": 58,
    "discount": "22% OFF",
    "description": "快干面料帮助维持长时间训练舒适度。",
    "sizes": ["39-42", "43-45"],
    "isRecommended": false,
    "releaseDate": "2026-07-13",
    "visualTone": "#6d6d6d",
    "visualShadow": "#4b4b4b",
    "visualAccent": "#8b8b8b",
    "visualPattern": "mesh"
  },
  {
    "id": "sock-05",
    "series": "City Basic",
    "title": "通勤罗口袜",
    "categoryKey": "daily",
    "categoryLabel": "日常袜",
    "price": 35,
    "originalPrice": 49,
    "discount": "29% OFF",
    "description": "更适合正装与通勤鞋型的基础搭配。",
    "sizes": ["35-38", "39-42", "43-45"],
    "isRecommended": true,
    "releaseDate": "2026-07-12",
    "visualTone": "#d8d8d8",
    "visualShadow": "#b7b7b7",
    "visualAccent": "#8c8c8c",
    "visualPattern": "rib"
  },
  {
    "id": "sock-06",
    "series": "Lite Step",
    "title": "云感船袜",
    "categoryKey": "no-show",
    "categoryLabel": "船袜",
    "price": 29,
    "originalPrice": 42,
    "discount": "31% OFF",
    "description": "轻薄贴脚，适合浅口鞋与夏日轻装搭配。",
    "sizes": ["35-38", "39-42"],
    "isRecommended": false,
    "releaseDate": "2026-07-11",
    "visualTone": "#fbfbfb",
    "visualShadow": "#d7d7d7",
    "visualAccent": "#b0b0b0",
    "visualPattern": "light"
  }
]
```

Create `data/cart.json` and `tests/fixtures/test-data/cart.json`:

```json
{
  "items": []
}
```

Update `package.json`:

```json
{
  "name": "socks-product-card",
  "private": true,
  "scripts": {
    "dev": "node server.js",
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.1"
  }
}
```

Update `playwright.config.js`:

```js
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "node server.js",
    port: 4173,
    reuseExistingServer: true,
    env: {
      DATA_DIR: "tests/fixtures/test-data",
      PORT: "4173",
    },
  },
});
```

- [ ] **Step 4: Run the smoke test to verify it passes**

Run:

```powershell
npm test -- --grep "renders the base product card shell with a default size"
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Commit**

```powershell
git add server.js data/products.json data/cart.json tests/fixtures/test-data/products.json tests/fixtures/test-data/cart.json package.json playwright.config.js tests/socks-product-card.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add backend server shell"
```

### Task 2: Implement `GET /api/products` and move the list page to API-driven rendering

**Files:**
- Modify: `server.js`
- Modify: `socks-product-list.html`
- Create: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing API and page tests**

Create `tests/api.spec.js`:

```js
const { test, expect } = require("@playwright/test");

test("returns products with default filter and recommended sort", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 6,
  });
  expect(payload.items).toHaveLength(6);
  expect(payload.items[0].title).toBe("极简中筒袜");
  expect(payload.items[1].title).toBe("轻压运动袜");
  expect(payload.items[2].title).toBe("通勤罗口袜");
});

test("filters sport products and sorts by ascending price", async ({ request }) => {
  const response = await request.get("/api/products?filter=sport&sort=price-asc");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta.count).toBe(2);
  expect(payload.items.map((item) => item.title)).toEqual(["速干训练袜", "轻压运动袜"]);
});
```

Add this new page test in `tests/socks-product-list.spec.js`:

```js
test("loads products from the backend response instead of inline seed markup", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const productsResponse = await page.waitForResponse((response) => {
    return response.url().includes("/api/products") && response.request().method() === "GET";
  });

  expect(productsResponse.ok()).toBe(true);
  await expect(page.locator("[data-product-card]")).toHaveCount(6);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```powershell
npm test -- --grep "returns products with default filter and recommended sort|loads products from the backend response instead of inline seed markup"
```

Expected:

```text
404 for /api/products or timeout waiting for response
```

- [ ] **Step 3: Implement `GET /api/products` and page fetch rendering**

Replace `server.js` with:

```js
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const CART_FILE = path.join(DATA_DIR, "cart.json");

const FILTER_KEYS = new Set(["all", "sport", "daily", "crew", "no-show"]);
const SORT_KEYS = new Set(["recommended", "price-asc", "price-desc", "newest"]);
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function getProductsForQuery(products, filter, sort) {
  const activeFilter = FILTER_KEYS.has(filter) ? filter : "all";
  const activeSort = SORT_KEYS.has(sort) ? sort : "recommended";
  const filtered = activeFilter === "all"
    ? [...products]
    : products.filter((product) => product.categoryKey === activeFilter);

  if (activeSort === "recommended") {
    filtered.sort((left, right) => {
      if (left.isRecommended !== right.isRecommended) {
        return Number(right.isRecommended) - Number(left.isRecommended);
      }
      return right.releaseDate.localeCompare(left.releaseDate);
    });
  } else if (activeSort === "price-asc") {
    filtered.sort((left, right) => left.price - right.price);
  } else if (activeSort === "price-desc") {
    filtered.sort((left, right) => right.price - left.price);
  } else if (activeSort === "newest") {
    filtered.sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  return {
    items: filtered,
    meta: {
      filter: activeFilter,
      sort: activeSort,
      count: filtered.length,
    },
  };
}

async function serveStaticFile(response, requestPath) {
  const safePath = requestPath === "/" ? "/socks-product-list.html" : requestPath;
  const filePath = path.resolve(ROOT_DIR, `.${safePath}`);

  if (!filePath.startsWith(ROOT_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = STATIC_TYPES[extension] || "application/octet-stream";
  const fileContent = await fs.readFile(filePath);
  response.writeHead(200, { "Content-Type": contentType });
  response.end(fileContent);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/products") {
      const products = await readJsonFile(PRODUCTS_FILE);
      const payload = getProductsForQuery(
        products,
        url.searchParams.get("filter"),
        url.searchParams.get("sort")
      );
      sendJson(response, 200, payload);
      return;
    }

    await serveStaticFile(response, url.pathname);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    sendJson(response, 500, {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
  }
});

server.listen(PORT, () => {
  console.log(`Socks backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Using data directory: ${DATA_DIR}`);
});
```

Update `socks-product-list.html` by removing the inline `products` array and adding fetch-driven state:

```html
  <script>
    const FILTER_KEY = {
      ALL: "all",
      SPORT: "sport",
      DAILY: "daily",
      CREW: "crew",
      NO_SHOW: "no-show"
    };

    const SORT_KEY = {
      RECOMMENDED: "recommended",
      PRICE_ASC: "price-asc",
      PRICE_DESC: "price-desc",
      NEWEST: "newest"
    };

    const toolbar = document.querySelector("[data-toolbar]");
    const productGrid = document.querySelector("[data-product-grid]");
    const resultCount = document.querySelector("[data-result-count]");
    const cartFeedbackTimers = new Map();
    let activeFilter = FILTER_KEY.ALL;
    let activeSort = SORT_KEY.RECOMMENDED;
    let products = [];

    async function fetchProducts() {
      const params = new URLSearchParams({
        filter: activeFilter,
        sort: activeSort
      });
      const response = await fetch(`/api/products?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to load products");
      }

      const payload = await response.json();
      products = payload.items;
      resultCount.textContent = `共 ${payload.meta.count} 件商品`;
      return payload.items;
    }
```

Then replace the current `renderProducts()` with:

```js
    async function renderProducts() {
      const visibleProducts = await fetchProducts();
      const isEmpty = visibleProducts.length === 0;

      productGrid.classList.toggle("is-empty", isEmpty);
      productGrid.innerHTML = isEmpty
        ? '<div class="empty-state" data-empty-state>当前分类暂无商品</div>'
        : visibleProducts.map(createCardMarkup).join("");
      syncToolbarState();

      if (!isEmpty) {
        bindCardInteractions();
      }
    }
```

And update click handling at the bottom:

```js
    toolbar.addEventListener("click", async (event) => {
      const filterButton = event.target.closest("[data-filter]");
      if (filterButton) {
        activeFilter = filterButton.dataset.filter;
        await renderProducts();
        return;
      }

      const sortButton = event.target.closest("[data-sort]");
      if (sortButton) {
        activeSort = sortButton.dataset.sort;
        await renderProducts();
      }
    });

    renderProducts().catch(() => {
      productGrid.classList.add("is-empty");
      productGrid.innerHTML = '<div class="empty-state" data-empty-state>商品加载失败，请稍后重试</div>';
      resultCount.textContent = "共 0 件商品";
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
npm test -- --grep "returns products with default filter and recommended sort|filters sport products and sorts by ascending price|loads products from the backend response instead of inline seed markup"
```

Expected:

```text
3 passed
```

- [ ] **Step 5: Commit**

```powershell
git add server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add products api"
```

### Task 3: Implement cart read/write APIs with validation and persistence

**Files:**
- Modify: `server.js`
- Create: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing cart API tests**

Append to `tests/api.spec.js`:

```js
test("returns an empty anonymous cart by default", async ({ request }) => {
  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload).toEqual({
    items: [],
    meta: { itemCount: 0 },
  });
});

test("adds an item to the cart and persists quantity merges", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43-45", quantity: 1 },
  });
  expect(firstAdd.ok()).toBe(true);

  const secondAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43-45", quantity: 1 },
  });
  expect(secondAdd.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  const cartPayload = await cartResponse.json();
  expect(cartPayload.items).toEqual([
    { productId: "sock-02", size: "43-45", quantity: 2 },
  ]);
  expect(cartPayload.meta.itemCount).toBe(1);
});

test("rejects invalid cart size values", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "35-38", quantity: 1 },
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_SIZE");
});
```

Add a real-cart page test in `tests/socks-product-list.spec.js`:

```js
test("posts the selected size to the backend cart api", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await firstCard.getByRole("button", { name: "43-45" }).click();

  const responsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/cart/items") && response.request().method() === "POST";
  });

  await firstCard.locator("[data-cart-button]").click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);

  const payload = JSON.parse(response.request().postData());
  expect(payload).toEqual({
    productId: "sock-01",
    size: "43-45",
    quantity: 1,
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm test -- --grep "returns an empty anonymous cart by default|adds an item to the cart and persists quantity merges|posts the selected size to the backend cart api"
```

Expected:

```text
404 for /api/cart or /api/cart/items
```

- [ ] **Step 3: Implement cart APIs and front-end cart posting**

Replace `server.js` with:

```js
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const CART_FILE = path.join(DATA_DIR, "cart.json");

const FILTER_KEYS = new Set(["all", "sport", "daily", "crew", "no-show"]);
const SORT_KEYS = new Set(["recommended", "price-asc", "price-desc", "newest"]);
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function writeJsonFile(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    ok: false,
    error: { code, message },
  });
}

function getProductsForQuery(products, filter, sort) {
  const activeFilter = FILTER_KEYS.has(filter) ? filter : "all";
  const activeSort = SORT_KEYS.has(sort) ? sort : "recommended";
  const filtered = activeFilter === "all"
    ? [...products]
    : products.filter((product) => product.categoryKey === activeFilter);

  if (activeSort === "recommended") {
    filtered.sort((left, right) => {
      if (left.isRecommended !== right.isRecommended) {
        return Number(right.isRecommended) - Number(left.isRecommended);
      }
      return right.releaseDate.localeCompare(left.releaseDate);
    });
  } else if (activeSort === "price-asc") {
    filtered.sort((left, right) => left.price - right.price);
  } else if (activeSort === "price-desc") {
    filtered.sort((left, right) => right.price - left.price);
  } else if (activeSort === "newest") {
    filtered.sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  return {
    items: filtered,
    meta: {
      filter: activeFilter,
      sort: activeSort,
      count: filtered.length,
    },
  };
}

function getCartMeta(cart) {
  return { itemCount: cart.items.length };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function validateCartItemInput(products, body) {
  const product = products.find((item) => item.id === body.productId);
  if (!product) {
    return { statusCode: 404, code: "PRODUCT_NOT_FOUND", message: "Product was not found." };
  }

  if (!product.sizes.includes(body.size)) {
    return { statusCode: 400, code: "INVALID_SIZE", message: "Size is not available for this product." };
  }

  const quantity = body.quantity == null ? 1 : body.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { statusCode: 400, code: "INVALID_QUANTITY", message: "Quantity must be a positive integer." };
  }

  return { product, quantity };
}

async function serveStaticFile(response, requestPath) {
  const safePath = requestPath === "/" ? "/socks-product-list.html" : requestPath;
  const filePath = path.resolve(ROOT_DIR, `.${safePath}`);

  if (!filePath.startsWith(ROOT_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = STATIC_TYPES[extension] || "application/octet-stream";
  const fileContent = await fs.readFile(filePath);
  response.writeHead(200, { "Content-Type": contentType });
  response.end(fileContent);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/products") {
      const products = await readJsonFile(PRODUCTS_FILE);
      const payload = getProductsForQuery(
        products,
        url.searchParams.get("filter"),
        url.searchParams.get("sort")
      );
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/cart") {
      const cart = await readJsonFile(CART_FILE);
      sendJson(response, 200, {
        items: cart.items,
        meta: getCartMeta(cart),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/cart/items") {
      const products = await readJsonFile(PRODUCTS_FILE);
      const cart = await readJsonFile(CART_FILE);
      const body = await readRequestBody(request);
      const validation = validateCartItemInput(products, body);

      if (validation.statusCode) {
        sendError(response, validation.statusCode, validation.code, validation.message);
        return;
      }

      const existingItem = cart.items.find((item) => {
        return item.productId === body.productId && item.size === body.size;
      });

      if (existingItem) {
        existingItem.quantity += validation.quantity;
      } else {
        cart.items.push({
          productId: body.productId,
          size: body.size,
          quantity: validation.quantity,
        });
      }

      await writeJsonFile(CART_FILE, cart);

      const item = cart.items.find((entry) => {
        return entry.productId === body.productId && entry.size === body.size;
      });

      sendJson(response, 200, {
        ok: true,
        item,
        meta: getCartMeta(cart),
      });
      return;
    }

    await serveStaticFile(response, url.pathname);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }

    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
  }
});

server.listen(PORT, () => {
  console.log(`Socks backend listening on http://127.0.0.1:${PORT}`);
  console.log(`Using data directory: ${DATA_DIR}`);
});
```

Update `socks-product-list.html` by adding cart posting helpers:

```js
    async function addCartItem(productId, size) {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          size,
          quantity: 1
        })
      });

      if (!response.ok) {
        throw new Error("Failed to add cart item");
      }

      return response.json();
    }
```

Then replace the `cartButton.addEventListener("click", ...)` block in `bindCardInteractions()`:

```js
        cartButton.addEventListener("click", async () => {
          const selectedSize = card.querySelector('[data-size][aria-pressed="true"]').textContent;

          try {
            await addCartItem(productId, selectedSize);
            cartButton.textContent = "已加入购物车";

            if (cartFeedbackTimers.has(productId)) {
              window.clearTimeout(cartFeedbackTimers.get(productId));
            }

            const timerId = window.setTimeout(() => {
              cartButton.textContent = "加入购物车";
              cartFeedbackTimers.delete(productId);
            }, 1500);

            cartFeedbackTimers.set(productId, timerId);
          } catch (error) {
            cartButton.textContent = "加入购物车";
          }
        });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
npm test -- --grep "returns an empty anonymous cart by default|adds an item to the cart and persists quantity merges|rejects invalid cart size values|posts the selected size to the backend cart api"
```

Expected:

```text
4 passed
```

- [ ] **Step 5: Commit**

```powershell
git add server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add cart api"
```

### Task 4: Finalize HTTP-based page tests and full verification

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `tests/socks-product-card.spec.js`
- Modify: `playwright.config.js`

- [ ] **Step 1: Write the final failing integration coverage**

Add this to `tests/socks-product-list.spec.js`:

```js
test("keeps list interactions working while products are served over http api", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.getByRole("button", { name: "运动袜" }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(2);

  await page.getByRole("button", { name: "价格从高到低" }).click();
  await expect(page.locator(".product-card__title")).toHaveText([
    "轻压运动袜",
    "速干训练袜"
  ]);
});
```

- [ ] **Step 2: Run the targeted integration test to verify it fails if HTTP state is not fully wired**

Run:

```powershell
npm test -- --grep "keeps list interactions working while products are served over http api"
```

Expected:

```text
FAIL if page still uses stale in-memory state or does not re-fetch correctly
```

- [ ] **Step 3: Make the minimal test/runner adjustments to keep the full suite stable**

Ensure the top of `tests/socks-product-card.spec.js` stays:

```js
const { test, expect } = require("@playwright/test");
```

Ensure the top of `tests/socks-product-list.spec.js` stays:

```js
const { test, expect } = require("@playwright/test");

test.use({ viewport: { width: 1280, height: 960 } });
```

If `playwright.config.js` needs the explicit file pattern to keep all suites under the same HTTP server, use:

```js
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "node server.js",
    port: 4173,
    reuseExistingServer: true,
    env: {
      DATA_DIR: "tests/fixtures/test-data",
      PORT: "4173",
    },
  },
});
```

- [ ] **Step 4: Run the full test suite**

Run:

```powershell
npm test
```

Expected:

```text
All Playwright tests pass, including api, product card, and product list suites
```

- [ ] **Step 5: Commit**

```powershell
git add tests/socks-product-list.spec.js tests/socks-product-card.spec.js playwright.config.js
git commit -m "test: verify backend integration"
```

## Self-Review

- Spec coverage:
  - 本地 Node.js HTTP 服务: Task 1
  - 商品数据接口: Task 2
  - 购物车读取接口: Task 3
  - 购物车写入接口: Task 3
  - 前端列表页接口联调: Tasks 2-3
  - 静态资源托管: Task 1
  - Playwright 跑在 HTTP 服务上: Tasks 1 and 4
  - 测试数据隔离: Task 1
- Placeholder scan:
  - No `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency:
  - Shared keys are consistent across server, front-end, and tests: `categoryKey`, `categoryLabel`, `filter`, `sort`, `productId`, `size`, `quantity`.

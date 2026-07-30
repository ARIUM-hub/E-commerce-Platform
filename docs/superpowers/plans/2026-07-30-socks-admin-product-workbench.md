# 后台商品工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有后台商品 tab 内完成商品新增、编辑、本地图片上传、SKU 模板生成和 SKU 批量编辑。

**Architecture:** 后端新增聚焦的 `lib/repositories/admin-products.js`，统一校验、创建、更新商品 payload 与 `product_variants`。`server.js` 增加受 `requireAdmin` 保护的商品详情、创建、更新、图片上传接口；前端继续复用 `socks-product-list.html?view=admin`，在现有 `public/js/storefront-app.js` 后台商品 tab 内嵌商品表单和 SKU 工具。

**Tech Stack:** Node 原生 HTTP server、SQLite、原生浏览器 JavaScript、Playwright API/UI 测试。

---

## File Map

- Create: `lib/repositories/admin-products.js`
  - 管理后台商品详情读取、payload 标准化、SKU 校验、事务保存、SKU 模板解析。
- Create: `lib/http/multipart.js`
  - 解析单文件 `multipart/form-data` 上传，限制大小并返回 `{ filename, contentType, buffer }`。
- Modify: `server.js`
  - 引入后台商品仓储和 multipart parser，增加 `/api/admin/products/:id`、`POST /api/admin/products`、`PATCH /api/admin/products/:id`、`POST /api/admin/products/:id/images`。
- Modify: `public/js/storefront-app.js`
  - 后台商品 tab 增加新增/编辑表单、图库上传预览、SKU 模板生成、SKU 批量编辑和保存刷新。
- Modify: `tests/api.spec.js`
  - 增加后台商品详情、创建、更新、上传、权限和校验测试。
- Modify: `tests/socks-product-list.spec.js`
  - 增加后台商品工作台 UI 流程测试。
- Create directory at runtime: `public/uploads/products/`
  - 图片上传目标目录；由服务端保存时自动创建。

---

### Task 1: 后台商品仓储与 API 红灯测试

**Files:**
- Modify: `tests/api.spec.js`
- Create later: `lib/repositories/admin-products.js`
- Modify later: `server.js`

- [ ] **Step 1: 写后台商品详情和创建 API 失败测试**

在 `tests/api.spec.js` 现有 `"returns admin product summaries for demo admins"` 后面加入：

```js
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
```

- [ ] **Step 2: 加入测试 fixture helper**

在 `tests/api.spec.js` 的 `checkoutPayload` helper 附近加入：

```js
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
```

- [ ] **Step 3: 运行红灯测试**

Run:

```powershell
npm run test:api -- --grep "full admin product details|creates an admin product"
```

Expected: FAIL，原因是 `/api/admin/products/:id` 和 `POST /api/admin/products` 尚未实现。

---

### Task 2: 实现后台商品仓储

**Files:**
- Create: `lib/repositories/admin-products.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 创建仓储模块**

Create `lib/repositories/admin-products.js`:

```js
const VALID_CATEGORY_KEYS = new Set(["sport", "daily", "crew", "no-show"]);
const PRODUCT_ID_PATTERN = /^[a-z0-9-]+$/;

function parseProductRow(row) {
  return row ? JSON.parse(row.payload) : null;
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];
}

function normalizeGallery(value) {
  return Array.isArray(value)
    ? value.map((item, index) => ({
      id: normalizeText(item.id, `img-${index + 1}`),
      src: normalizeText(item.src),
      alt: normalizeText(item.alt)
    })).filter((item) => item.src)
    : [];
}

function normalizeSizeChart(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
      size: normalizeText(item.size),
      footLength: normalizeText(item.footLength),
      usMen: normalizeText(item.usMen),
      usWomen: normalizeText(item.usWomen)
    })).filter((item) => item.size)
    : [];
}

function normalizeVariant(productId, variant) {
  return {
    skuId: normalizeText(variant.skuId),
    productId,
    size: normalizeText(variant.size),
    color: normalizeText(variant.color),
    material: normalizeText(variant.material),
    stockQuantity: normalizeNumber(variant.stockQuantity),
    lowStockThreshold: normalizeNumber(variant.lowStockThreshold, 5),
    isAvailable: variant.isAvailable !== false
  };
}

function makeValidationError(code, message, statusCode = 400) {
  return { validationError: { statusCode, code, message } };
}

function normalizeProductForSave(input, existingId = "") {
  const product = input && typeof input === "object" ? input : {};
  const id = normalizeText(existingId || product.id);
  const categoryKey = normalizeText(product.categoryKey || product.category);
  const variants = Array.isArray(product.variants)
    ? product.variants.map((variant) => normalizeVariant(id, variant))
    : [];

  return {
    id,
    series: normalizeText(product.series),
    title: normalizeText(product.title),
    localizedContent: product.localizedContent && typeof product.localizedContent === "object" ? product.localizedContent : {},
    categoryKey,
    categoryLabel: normalizeText(product.categoryLabel),
    category: categoryKey,
    price: normalizeNumber(product.price),
    originalPrice: normalizeNumber(product.originalPrice, normalizeNumber(product.price)),
    discount: normalizeText(product.discount),
    description: normalizeText(product.description),
    isRecommended: normalizeBoolean(product.isRecommended),
    isTopRated: normalizeBoolean(product.isTopRated),
    isBestSeller: normalizeBoolean(product.isBestSeller),
    ratingValue: normalizeNumber(product.ratingValue),
    reviewCount: Math.max(0, Math.trunc(normalizeNumber(product.reviewCount))),
    recentlyBoughtLabel: normalizeText(product.recentlyBoughtLabel),
    shippingLabel: normalizeText(product.shippingLabel),
    deliveryEstimate: normalizeText(product.deliveryEstimate),
    visualTone: normalizeText(product.visualTone),
    visualShadow: normalizeText(product.visualShadow),
    visualAccent: normalizeText(product.visualAccent),
    visualPattern: normalizeText(product.visualPattern),
    colors: normalizeStringArray(product.colors),
    materials: normalizeStringArray(product.materials),
    sizeChart: normalizeSizeChart(product.sizeChart),
    gallery: normalizeGallery(product.gallery),
    variants,
    sizes: variants.map((variant) => variant.size)
  };
}

function validateProduct(product, { isCreate }) {
  if (!product.id) return makeValidationError("ADMIN_PRODUCT_ID_REQUIRED", "Product ID is required.");
  if (!PRODUCT_ID_PATTERN.test(product.id)) return makeValidationError("ADMIN_PRODUCT_ID_INVALID", "Product ID is invalid.");
  if (!product.title) return makeValidationError("ADMIN_PRODUCT_TITLE_REQUIRED", "Product title is required.");
  if (!VALID_CATEGORY_KEYS.has(product.categoryKey)) return makeValidationError("ADMIN_PRODUCT_CATEGORY_INVALID", "Product category is invalid.");
  if (!Number.isFinite(product.price) || product.price < 0) return makeValidationError("ADMIN_PRODUCT_PRICE_INVALID", "Product price is invalid.");
  if (!Number.isFinite(product.originalPrice) || product.originalPrice < product.price) return makeValidationError("ADMIN_PRODUCT_PRICE_INVALID", "Original price is invalid.");
  if (!Array.isArray(product.variants) || product.variants.length === 0) return makeValidationError("ADMIN_PRODUCT_VARIANTS_REQUIRED", "At least one SKU is required.");

  const seenSkuIds = new Set();
  const seenSizes = new Set();
  for (const variant of product.variants) {
    if (!variant.skuId || !variant.size) return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU ID and size are required.");
    if (seenSkuIds.has(variant.skuId) || seenSizes.has(variant.size)) return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU ID and size must be unique.");
    if (!Number.isInteger(variant.stockQuantity) || variant.stockQuantity < 0 || variant.stockQuantity > 9999) return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU stock quantity is invalid.");
    if (!Number.isInteger(variant.lowStockThreshold) || variant.lowStockThreshold < 0 || variant.lowStockThreshold > 999) return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU low stock threshold is invalid.");
    seenSkuIds.add(variant.skuId);
    seenSizes.add(variant.size);
  }

  return { product };
}

function findAdminProductById(db, productId) {
  const row = db.prepare("SELECT payload FROM products WHERE id = ?").get(productId);
  if (!row) return null;
  const product = parseProductRow(row);
  const variantRows = db.prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY rowid ASC").all(productId);
  const variants = variantRows.map((variant) => ({
    skuId: variant.sku_id,
    productId: variant.product_id,
    size: variant.size,
    color: variant.color,
    material: variant.material,
    stockQuantity: variant.stock_quantity,
    lowStockThreshold: variant.low_stock_threshold,
    isAvailable: Boolean(variant.is_available)
  }));
  return { ...product, variants, sizes: variants.map((variant) => variant.size) };
}

function saveProductTransaction(db, product, mode) {
  const save = db.transaction(() => {
    if (mode === "create") {
      db.prepare("INSERT INTO products (id, payload) VALUES (?, ?)").run(product.id, JSON.stringify(product));
    } else {
      db.prepare("UPDATE products SET payload = ? WHERE id = ?").run(JSON.stringify(product), product.id);
      db.prepare("DELETE FROM product_variants WHERE product_id = ?").run(product.id);
    }

    const insertVariant = db.prepare(`
      INSERT INTO product_variants (
        sku_id, product_id, size, color, material, stock_quantity, low_stock_threshold, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    product.variants.forEach((variant) => {
      insertVariant.run(
        variant.skuId,
        product.id,
        variant.size,
        variant.color,
        variant.material,
        variant.stockQuantity,
        variant.lowStockThreshold,
        variant.isAvailable ? 1 : 0
      );
    });
  });

  save();
  return findAdminProductById(db, product.id);
}

function createAdminProduct(db, body) {
  const product = normalizeProductForSave(body.product);
  const validation = validateProduct(product, { isCreate: true });
  if (validation.validationError) return validation;
  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(product.id);
  if (existing) return makeValidationError("ADMIN_PRODUCT_DUPLICATE", "Product already exists.", 409);
  return { product: saveProductTransaction(db, product, "create") };
}

function updateAdminProduct(db, productId, body) {
  const existing = findAdminProductById(db, productId);
  if (!existing) return makeValidationError("ADMIN_PRODUCT_NOT_FOUND", "Product was not found.", 404);
  if (body.product?.id && body.product.id !== productId) return makeValidationError("ADMIN_PRODUCT_ID_INVALID", "Product ID cannot be changed.");
  const product = normalizeProductForSave({ ...existing, ...body.product, id: productId }, productId);
  const validation = validateProduct(product, { isCreate: false });
  if (validation.validationError) return validation;
  return { product: saveProductTransaction(db, product, "update") };
}

function parseSizeTemplate(input) {
  const sizes = new Set();
  String(input || "").split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((value) => Number(value.trim()));
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
        for (let size = start; size <= end; size += 1) sizes.add(String(size));
      }
      return;
    }
    sizes.add(part);
  });
  return [...sizes];
}

function generateSkuTemplate({ productId, template, stockQuantity = 10, lowStockThreshold = 5, color = "", material = "" }) {
  return parseSizeTemplate(template).map((size) => ({
    skuId: `${productId}-${size}`,
    productId,
    size,
    color,
    material,
    stockQuantity: Number(stockQuantity),
    lowStockThreshold: Number(lowStockThreshold),
    isAvailable: true
  }));
}

module.exports = {
  createAdminProduct,
  findAdminProductById,
  generateSkuTemplate,
  normalizeProductForSave,
  parseSizeTemplate,
  updateAdminProduct
};
```

- [ ] **Step 2: 导出函数保持 CommonJS 风格**

确认 `module.exports` 包含 `createAdminProduct`、`findAdminProductById`、`updateAdminProduct`、`parseSizeTemplate`、`generateSkuTemplate`，供 `server.js` 和前端测试间接使用。

- [ ] **Step 3: 运行红灯测试确认仍失败在路由层**

Run:

```powershell
npm run test:api -- --grep "full admin product details|creates an admin product"
```

Expected: FAIL，仓储已存在，但 `server.js` 还没有挂载接口。

---

### Task 3: 挂载商品详情、新增、编辑 API

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 在 `server.js` 引入后台商品仓储**

在现有 `require("./lib/repositories/admin")` 附近加入：

```js
const {
  createAdminProduct,
  findAdminProductById,
  updateAdminProduct
} = require("./lib/repositories/admin-products");
```

- [ ] **Step 2: 增加后台商品路径解析函数**

在 `parseAdminInventoryPath` 附近加入：

```js
function parseAdminProductPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}
```

- [ ] **Step 3: 在 `/api/admin/products` 列表路由后加入详情/创建/编辑路由**

在 `GET /api/admin/products` 路由之后加入：

```js
  const requestedAdminProductId = parseAdminProductPath(requestUrl.pathname);
  if (request.method === "GET" && requestedAdminProductId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const product = withDatabase((db) => findAdminProductById(db, requestedAdminProductId));
      if (!product) {
        sendError(response, 404, "ADMIN_PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }

      sendJson(response, 200, { ok: true, product });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/products") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => createAdminProduct(db, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 201, { ok: true, product: result.product });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "PATCH" && requestedAdminProductId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateAdminProduct(db, requestedAdminProductId, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, product: result.product });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }
```

- [ ] **Step 4: 运行 API 测试确认详情和创建转绿**

Run:

```powershell
npm run test:api -- --grep "full admin product details|creates an admin product"
```

Expected: PASS，2 个测试通过。

- [ ] **Step 5: 写编辑和权限测试**

在 `tests/api.spec.js` 后台商品 API 测试附近加入：

```js
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
```

- [ ] **Step 6: 运行后台商品 API 回归**

Run:

```powershell
npm run test:api -- --grep "admin product"
```

Expected: PASS，后台商品相关 API 测试通过。

- [ ] **Step 7: 提交后端商品 API**

```powershell
git add server.js lib/repositories/admin-products.js tests/api.spec.js
git commit -m "feat: add admin product write APIs"
```

---

### Task 4: 图片上传 parser 与上传 API

**Files:**
- Create: `lib/http/multipart.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写图片上传失败测试**

在 `tests/api.spec.js` 后台商品 API 测试附近加入：

```js
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
```

- [ ] **Step 2: 运行红灯测试**

Run:

```powershell
npm run test:api -- --grep "product image uploads|uploads a product image"
```

Expected: FAIL，上传 API 和 multipart parser 尚未实现。

- [ ] **Step 3: 创建简单 multipart parser**

Create `lib/http/multipart.js`:

```js
class MultipartError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "MultipartError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function readMultipartFile(request, { fieldName = "image", limitBytes = 3145728 } = {}) {
  const contentType = request.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > limitBytes) throw new MultipartError("ADMIN_IMAGE_TOO_LARGE", "Image is too large.", 413);
    chunks.push(chunk);
  }

  const boundary = `--${boundaryMatch[1]}`;
  const body = Buffer.concat(chunks);
  const raw = body.toString("binary");
  const part = raw.split(boundary).find((entry) => entry.includes(`name="${fieldName}"`));
  if (!part) throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");

  const [rawHeaders, ...bodyParts] = part.split("\r\n\r\n");
  const disposition = rawHeaders.match(/filename="([^"]*)"/i);
  const type = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
  const filename = disposition ? disposition[1] : "";
  const uploadedContentType = type ? type[1].trim().toLowerCase() : "";
  let binary = bodyParts.join("\r\n\r\n");
  binary = binary.replace(/\r\n--$/, "").replace(/\r\n$/, "");
  const buffer = Buffer.from(binary, "binary");

  if (!filename || buffer.length === 0) throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");
  return { filename, contentType: uploadedContentType, buffer };
}

module.exports = {
  MultipartError,
  readMultipartFile
};
```

- [ ] **Step 4: 在 `server.js` 引入 parser 和 fs/path**

确认 `server.js` 已有 `fs`/`path` 可用；若没有，在顶部加入：

```js
const fs = require("node:fs/promises");
const path = require("node:path");
const { MultipartError, readMultipartFile } = require("./lib/http/multipart");
```

- [ ] **Step 5: 增加上传保存 helper**

在 `server.js` 路由 helper 区加入：

```js
const ADMIN_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"]
]);

function createAdminImageName(productId, contentType) {
  const extension = ADMIN_IMAGE_TYPES.get(contentType);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${productId}-${stamp}-${suffix}.${extension}`;
}

function handleMultipartError(error, response) {
  if (!(error instanceof MultipartError)) return false;
  sendError(response, error.statusCode, error.code, error.message);
  return true;
}
```

- [ ] **Step 6: 在商品详情/编辑路由前加入上传路由**

放在通用 `PATCH /api/admin/products/:id` 前，避免路径冲突：

```js
  const imageUploadMatch = requestUrl.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images$/);
  if (request.method === "POST" && imageUploadMatch) {
    const productId = decodeURIComponent(imageUploadMatch[1]);
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const product = withDatabase((db) => findAdminProductById(db, productId));
      if (!product) {
        sendError(response, 404, "ADMIN_PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }

      const file = await readMultipartFile(request, { limitBytes: 3 * 1024 * 1024 });
      if (!ADMIN_IMAGE_TYPES.has(file.contentType)) {
        sendError(response, 400, "ADMIN_IMAGE_TYPE_INVALID", "Image type is invalid.");
        return;
      }

      const safeFileName = createAdminImageName(productId, file.contentType);
      const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, safeFileName), file.buffer);
      const image = {
        id: safeFileName.replace(/\.[^.]+$/, ""),
        src: `/public/uploads/products/${safeFileName}`,
        alt: `${productId} product image`
      };
      sendJson(response, 201, { ok: true, image });
      return;
    } catch (error) {
      if (handleMultipartError(error, response)) return;
      sendError(response, 500, "ADMIN_IMAGE_SAVE_FAILED", "Image could not be saved.");
      return;
    }
  }
```

- [ ] **Step 7: 运行图片上传 API 测试**

Run:

```powershell
npm run test:api -- --grep "product image uploads|uploads a product image"
```

Expected: PASS，图片上传和非法类型拒绝通过。

- [ ] **Step 8: 提交图片上传 API**

```powershell
git add server.js lib/http/multipart.js tests/api.spec.js public/uploads/products/.gitkeep
git commit -m "feat: add admin product image uploads"
```

若没有创建 `.gitkeep`，只提交实际存在的文件；上传目录可由运行时自动创建。

---

### Task 5: 后台商品工作台 UI 红灯测试

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify later: `public/js/storefront-app.js`

- [ ] **Step 1: 写新增商品 UI 测试**

在后台测试区加入：

```js
test("creates a product from the admin product workbench", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='products']").click();
  await page.locator("[data-admin-product-new]").click();

  await expect(page.locator("[data-admin-product-form]")).toBeVisible();
  await page.locator("[data-admin-product-id]").fill("sock-ui-new");
  await page.locator("[data-admin-product-title]").fill("UI 新增中筒袜");
  await page.locator("[data-admin-product-title-en]").fill("UI New Crew Socks");
  await page.locator("[data-admin-product-category]").selectOption("crew");
  await page.locator("[data-admin-product-category-label]").fill("中筒袜");
  await page.locator("[data-admin-product-category-label-en]").fill("Crew Socks");
  await page.locator("[data-admin-product-price]").fill("36");
  await page.locator("[data-admin-product-original-price]").fill("49");
  await page.locator("[data-admin-product-description]").fill("后台 UI 创建的商品。");
  await page.locator("[data-admin-product-description-en]").fill("Created from admin UI.");
  await page.locator("[data-admin-product-colors]").fill("Black, White");
  await page.locator("[data-admin-product-materials]").fill("Cotton blend");
  await page.locator("[data-admin-sku-template-input]").fill("39-40");
  await page.locator("[data-admin-sku-generate]").click();
  await expect(page.locator("[data-admin-sku-row]")).toHaveCount(2);
  await page.locator("[data-admin-product-save]").click();

  await expect(page.locator("[data-admin-product-row]")).toContainText("UI 新增中筒袜");
  await page.goto("/socks-product-list.html?q=UI%20新增");
  await expect(page.locator("[data-product-card][data-product-id='sock-ui-new']")).toBeVisible();
});
```

- [ ] **Step 2: 写编辑和 SKU 批量 UI 测试**

继续加入：

```js
test("edits a product and bulk updates SKU rows from the admin product workbench", async ({ page }) => {
  await registerAdminFromUi(page);
  await page.goto("/socks-product-list.html?view=admin");
  await page.locator("[data-admin-tab='products']").click();
  await page.locator("[data-admin-product-row][data-product-id='sock-01'] [data-admin-product-edit]").click();

  await expect(page.locator("[data-admin-product-form]")).toBeVisible();
  await page.locator("[data-admin-product-title]").fill("UI 编辑后的袜子");
  await page.locator("[data-admin-sku-row]").first().locator("[data-admin-sku-select]").check();
  await page.locator("[data-admin-sku-bulk-stock]").fill("3");
  await page.locator("[data-admin-sku-bulk-threshold]").fill("2");
  await page.locator("[data-admin-sku-bulk-apply]").click();
  await expect(page.locator("[data-admin-sku-row]").first()).toContainText("3");
  await page.locator("[data-admin-product-save]").click();

  await expect(page.locator("[data-admin-product-row][data-product-id='sock-01']")).toContainText("UI 编辑后的袜子");
  await page.goto("/socks-product-list.html?view=detail&id=sock-01");
  await expect(page.locator("[data-detail-title]")).toHaveText("UI 编辑后的袜子");
});
```

- [ ] **Step 3: 运行 UI 红灯测试**

Run:

```powershell
npm run test:ui -- --grep "admin product workbench"
```

Expected: FAIL，缺少表单、按钮和 data attributes。

---

### Task 6: 实现后台商品表单和 SKU 工具

**Files:**
- Modify: `public/js/storefront-app.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 增加后台商品状态**

在 `adminData` 初始化附近加入：

```js
adminData.productDraft = null;
adminData.productMode = "list";
adminData.selectedSkuIds = new Set();
```

如果 `adminData` 是常量对象，则改为在对象字面量中加入：

```js
productDraft: null,
productMode: "list",
selectedSkuIds: new Set()
```

- [ ] **Step 2: 增加后台商品 API client**

在 `fetchAdminJson` 附近加入：

```js
async function fetchAdminProduct(productId) {
  const payload = await fetchAdminJson(`/api/admin/products/${encodeURIComponent(productId)}`);
  return payload.product;
}

async function saveAdminProduct(product, mode) {
  const url = mode === "edit"
    ? `/api/admin/products/${encodeURIComponent(product.id)}`
    : "/api/admin/products";
  const response = await fetch(url, {
    method: mode === "edit" ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", "x-demo-admin": "true" },
    body: JSON.stringify({ product })
  });
  if (!response.ok) throw await createCartRequestError(response, "Product save failed");
  return response.json();
}

async function uploadAdminProductImage(productId, file) {
  const formData = new FormData();
  formData.append("image", file);
  const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
    method: "POST",
    headers: { "x-demo-admin": "true" },
    body: formData
  });
  if (!response.ok) throw await createCartRequestError(response, "Image upload failed");
  return response.json();
}
```

- [ ] **Step 3: 增加 draft helper**

在后台渲染函数前加入：

```js
function createEmptyAdminProductDraft() {
  return {
    id: "",
    series: "",
    title: "",
    localizedContent: { "en-US": { title: "", categoryLabel: "", description: "" } },
    categoryKey: "crew",
    categoryLabel: "中筒袜",
    price: 39,
    originalPrice: 59,
    discount: "",
    description: "",
    isRecommended: false,
    isTopRated: false,
    isBestSeller: false,
    ratingValue: 4.8,
    reviewCount: 0,
    recentlyBoughtLabel: "",
    shippingLabel: "满 $35 免配送费",
    deliveryEstimate: "预计 3-5 日送达",
    visualTone: "#f7f7f7",
    visualShadow: "soft",
    visualAccent: "#111111",
    visualPattern: "minimal",
    colors: ["Black"],
    materials: ["Cotton blend"],
    sizeChart: [],
    gallery: [],
    variants: []
  };
}

function parseAdminListInput(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseAdminSizeTemplate(value) {
  const sizes = new Set();
  String(value || "").split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => {
    if (item.includes("-")) {
      const [start, end] = item.split("-").map((part) => Number(part.trim()));
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
        for (let size = start; size <= end; size += 1) sizes.add(String(size));
      }
      return;
    }
    sizes.add(item);
  });
  return [...sizes];
}

function syncAdminDraftFromForm(form) {
  const draft = adminData.productDraft || createEmptyAdminProductDraft();
  const english = draft.localizedContent?.["en-US"] || {};
  draft.id = form.querySelector("[data-admin-product-id]").value.trim();
  draft.title = form.querySelector("[data-admin-product-title]").value.trim();
  draft.categoryKey = form.querySelector("[data-admin-product-category]").value;
  draft.category = draft.categoryKey;
  draft.categoryLabel = form.querySelector("[data-admin-product-category-label]").value.trim();
  draft.price = Number(form.querySelector("[data-admin-product-price]").value);
  draft.originalPrice = Number(form.querySelector("[data-admin-product-original-price]").value);
  draft.description = form.querySelector("[data-admin-product-description]").value.trim();
  draft.colors = parseAdminListInput(form.querySelector("[data-admin-product-colors]").value);
  draft.materials = parseAdminListInput(form.querySelector("[data-admin-product-materials]").value);
  draft.localizedContent = {
    ...draft.localizedContent,
    "en-US": {
      ...english,
      title: form.querySelector("[data-admin-product-title-en]").value.trim(),
      categoryLabel: form.querySelector("[data-admin-product-category-label-en]").value.trim(),
      description: form.querySelector("[data-admin-product-description-en]").value.trim()
    }
  };
  adminData.productDraft = draft;
  return draft;
}
```

- [ ] **Step 4: 增加 SKU 模板和批量操作 helper**

```js
function generateAdminSkuRowsFromTemplate(form) {
  const draft = syncAdminDraftFromForm(form);
  const template = form.querySelector("[data-admin-sku-template-input]").value;
  const stockQuantity = Number(form.querySelector("[data-admin-sku-template-stock]").value || 10);
  const lowStockThreshold = Number(form.querySelector("[data-admin-sku-template-threshold]").value || 5);
  const color = draft.colors[0] || "";
  const material = draft.materials[0] || "";
  const existingBySize = new Map((draft.variants || []).map((variant) => [variant.size, variant]));
  const generated = parseAdminSizeTemplate(template).map((size) => ({
    ...(existingBySize.get(size) || {}),
    skuId: existingBySize.get(size)?.skuId || `${draft.id}-${size}`,
    productId: draft.id,
    size,
    color: existingBySize.get(size)?.color || color,
    material: existingBySize.get(size)?.material || material,
    stockQuantity: existingBySize.get(size)?.stockQuantity ?? stockQuantity,
    lowStockThreshold: existingBySize.get(size)?.lowStockThreshold ?? lowStockThreshold,
    isAvailable: existingBySize.get(size)?.isAvailable ?? true
  }));
  draft.variants = generated;
  draft.sizeChart = generated.map((variant) => ({
    size: variant.size,
    footLength: "",
    usMen: "",
    usWomen: ""
  }));
}

function applyAdminSkuBulkEdit(form) {
  const draft = syncAdminDraftFromForm(form);
  const selected = new Set([...form.querySelectorAll("[data-admin-sku-select]:checked")].map((input) => input.value));
  const stockValue = form.querySelector("[data-admin-sku-bulk-stock]").value;
  const thresholdValue = form.querySelector("[data-admin-sku-bulk-threshold]").value;
  draft.variants = draft.variants.map((variant) => selected.has(variant.skuId) ? {
    ...variant,
    stockQuantity: stockValue === "" ? variant.stockQuantity : Number(stockValue),
    lowStockThreshold: thresholdValue === "" ? variant.lowStockThreshold : Number(thresholdValue)
  } : variant);
}
```

- [ ] **Step 5: 增加商品表单 markup 函数**

在 `renderAdminProducts` 前加入：

```js
function createAdminProductFormMarkup() {
  const draft = adminData.productDraft;
  if (!draft) return "";
  const english = draft.localizedContent?.["en-US"] || {};
  return `
    <form class="admin-product-form" data-admin-product-form>
      <div class="admin-form-error" data-admin-product-error></div>
      <label>商品 ID <input data-admin-product-id value="${escapeHtml(draft.id)}" ${adminData.productMode === "edit" ? "readonly" : ""}></label>
      <label>中文标题 <input data-admin-product-title value="${escapeHtml(draft.title)}"></label>
      <label>英文标题 <input data-admin-product-title-en value="${escapeHtml(english.title || "")}"></label>
      <label>分类
        <select data-admin-product-category>
          ${["sport", "daily", "crew", "no-show"].map((key) => `<option value="${key}" ${draft.categoryKey === key ? "selected" : ""}>${key}</option>`).join("")}
        </select>
      </label>
      <label>中文分类 <input data-admin-product-category-label value="${escapeHtml(draft.categoryLabel || "")}"></label>
      <label>英文分类 <input data-admin-product-category-label-en value="${escapeHtml(english.categoryLabel || "")}"></label>
      <label>价格 <input type="number" min="0" data-admin-product-price value="${escapeHtml(draft.price)}"></label>
      <label>原价 <input type="number" min="0" data-admin-product-original-price value="${escapeHtml(draft.originalPrice)}"></label>
      <label>中文描述 <textarea data-admin-product-description>${escapeHtml(draft.description || "")}</textarea></label>
      <label>英文描述 <textarea data-admin-product-description-en>${escapeHtml(english.description || "")}</textarea></label>
      <label>颜色，逗号分隔 <input data-admin-product-colors value="${escapeHtml((draft.colors || []).join(", "))}"></label>
      <label>材质，逗号分隔 <input data-admin-product-materials value="${escapeHtml((draft.materials || []).join(", "))}"></label>
      <div class="admin-gallery">
        <input type="file" accept="image/*" data-admin-product-image-upload>
        ${(draft.gallery || []).map((image) => `<figure data-admin-product-gallery-item><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || "")}"><figcaption>${escapeHtml(image.alt || "")}</figcaption></figure>`).join("")}
      </div>
      <div data-admin-sku-bulk-toolbar>
        <input placeholder="39-45" data-admin-sku-template-input>
        <input type="number" value="10" data-admin-sku-template-stock>
        <input type="number" value="5" data-admin-sku-template-threshold>
        <button type="button" data-admin-sku-generate>生成 SKU</button>
        <input type="number" placeholder="批量库存" data-admin-sku-bulk-stock>
        <input type="number" placeholder="批量阈值" data-admin-sku-bulk-threshold>
        <button type="button" data-admin-sku-bulk-apply>批量应用</button>
      </div>
      <div class="admin-table">
        ${(draft.variants || []).map((variant) => `
          <article class="admin-row" data-admin-sku-row data-sku-id="${escapeHtml(variant.skuId)}">
            <input type="checkbox" value="${escapeHtml(variant.skuId)}" data-admin-sku-select>
            <strong>${escapeHtml(variant.size)}</strong>
            <span>${escapeHtml(variant.skuId)}</span>
            <span>${escapeHtml(variant.color)}</span>
            <span>${escapeHtml(variant.material)}</span>
            <span>${escapeHtml(variant.stockQuantity)}</span>
            <span>${escapeHtml(variant.lowStockThreshold)}</span>
          </article>
        `).join("")}
      </div>
      <button class="order-button" type="submit" data-admin-product-save>保存商品</button>
      <button class="order-button order-button--secondary" type="button" data-admin-product-cancel>取消</button>
    </form>
  `;
}
```

- [ ] **Step 6: 改造 `renderAdminProducts`**

替换现有 `renderAdminProducts` 为：

```js
async function renderAdminProducts() {
  const payload = await fetchAdminJson("/api/admin/products");
  adminData.products = payload.products;
  adminPanel.innerHTML = `
    <div class="admin-toolbar">
      <button class="order-button" type="button" data-admin-product-new>新增商品</button>
    </div>
    <div class="admin-table">${payload.products.map((product) => `
      <article class="admin-row" data-admin-product-row data-product-id="${escapeHtml(product.id)}">
        <span>${escapeHtml(product.id)}</span>
        <strong>${escapeHtml(product.title)}</strong>
        <span>${escapeHtml(product.category)}</span>
        <span>${formatCurrency(product.price)}</span>
        <span>${product.variantCount} SKU</span>
        <span>${product.totalStock}</span>
        <button class="order-button order-button--secondary" type="button" data-admin-product-edit>编辑</button>
      </article>
    `).join("")}</div>
    ${createAdminProductFormMarkup()}
  `;
}
```

- [ ] **Step 7: 在全局点击/提交监听里接入后台商品行为**

在已有 `document.addEventListener("click", ...)` 中加入分支：

```js
if (event.target.matches("[data-admin-product-new]")) {
  adminData.productDraft = createEmptyAdminProductDraft();
  adminData.productMode = "create";
  await renderAdminProducts();
  return;
}

if (event.target.matches("[data-admin-product-edit]")) {
  const row = event.target.closest("[data-admin-product-row]");
  adminData.productDraft = await fetchAdminProduct(row.dataset.productId);
  adminData.productMode = "edit";
  await renderAdminProducts();
  return;
}

if (event.target.matches("[data-admin-sku-generate]")) {
  generateAdminSkuRowsFromTemplate(event.target.closest("[data-admin-product-form]"));
  await renderAdminProducts();
  return;
}

if (event.target.matches("[data-admin-sku-bulk-apply]")) {
  applyAdminSkuBulkEdit(event.target.closest("[data-admin-product-form]"));
  await renderAdminProducts();
  return;
}

if (event.target.matches("[data-admin-product-cancel]")) {
  adminData.productDraft = null;
  adminData.productMode = "list";
  await renderAdminProducts();
  return;
}
```

在已有 `submit` 监听里加入：

```js
if (event.target.matches("[data-admin-product-form]")) {
  event.preventDefault();
  const form = event.target;
  const error = form.querySelector("[data-admin-product-error]");
  try {
    const draft = syncAdminDraftFromForm(form);
    const payload = await saveAdminProduct(draft, adminData.productMode);
    adminData.productDraft = null;
    adminData.productMode = "list";
    adminData.products = null;
    adminData.inventory = null;
    await renderAdminProducts();
  } catch (saveError) {
    error.textContent = saveError.message;
  }
}
```

在已有 `change` 监听或新增监听中加入图片上传：

```js
if (event.target.matches("[data-admin-product-image-upload]")) {
  const file = event.target.files?.[0];
  if (!file) return;
  const form = event.target.closest("[data-admin-product-form]");
  const draft = syncAdminDraftFromForm(form);
  const payload = await uploadAdminProductImage(draft.id, file);
  draft.gallery = [...(draft.gallery || []), payload.image];
  await renderAdminProducts();
}
```

- [ ] **Step 8: 运行后台商品 UI 测试**

Run:

```powershell
npm run test:ui -- --grep "admin product workbench"
```

Expected: PASS，新增、编辑、SKU 批量操作 UI 流程通过。

- [ ] **Step 9: 提交后台商品 UI**

```powershell
git add public/js/storefront-app.js tests/socks-product-list.spec.js
git commit -m "feat: add admin product workbench UI"
```

---

### Task 7: 全量回归与最终提交检查

**Files:**
- Verify: `tests/api.spec.js`
- Verify: `tests/socks-product-list.spec.js`
- Verify: `server.js`
- Verify: `public/js/storefront-app.js`

- [ ] **Step 1: 跑 API 全量单 worker**

Run:

```powershell
npm run test:api
```

Expected: PASS，`tests/api.spec.js` 全部通过。

- [ ] **Step 2: 跑商城列表 UI 全量单 worker**

Run:

```powershell
npm run test:ui
```

Expected: PASS，`tests/socks-product-list.spec.js` 全部通过。

- [ ] **Step 3: 跑 diff 检查**

Run:

```powershell
git diff --check
```

Expected: 无输出，退出码 0。

- [ ] **Step 4: 检查工作区状态**

Run:

```powershell
git status --short
```

Expected: 只包含本阶段明确修改过且已准备提交的文件；没有未知的大文件或上传测试残留。

- [ ] **Step 5: 如测试上传生成了图片文件，清理非必要产物**

Run:

```powershell
Get-ChildItem 'public\uploads\products' -ErrorAction SilentlyContinue
```

Expected: 若出现测试生成的 `sock-01-*` 图片且不需要纳入仓库，用 `Remove-Item -LiteralPath <具体文件路径>` 删除单个文件；不要递归删除目录。

- [ ] **Step 6: 最终提交遗漏文件**

如果前面任务已有提交且当前还有本阶段遗漏文件：

```powershell
git add <具体遗漏文件>
git commit -m "test: cover admin product workbench"
```

如果没有遗漏文件，不创建空提交。

---

## Self-Review Notes

- Spec coverage: 商品新增、商品编辑、本地图片上传、SKU 模板生成、SKU 批量编辑、后台权限、前台数据一致性、测试策略均有对应任务。
- Placeholder scan: 未发现占位文本、延期实现语句或 Unicode 转义写法。
- Type consistency: 后端使用 `skuId/productId/stockQuantity/lowStockThreshold/isAvailable`，SQLite 写入映射为 `sku_id/product_id/stock_quantity/low_stock_threshold/is_available`；前端 data attributes 与设计文档保持一致。

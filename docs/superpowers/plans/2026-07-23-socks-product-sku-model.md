# Socks Product SKU Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the socks storefront so every sellable size is represented by a SKU variant with independent inventory, gallery data, color/material metadata, size chart data, and SKU-aware cart/order behavior.

**Architecture:** Keep the current Node HTTP server and JSON-file persistence. Add product `variants` as the stock source of truth while preserving legacy `sizes` for compatibility. Backend cart/order APIs continue accepting `productId + size`, resolve the matching SKU internally, and return/store `skuId`; frontend listing/detail views render SKU-aware stock, gallery, colors, materials, and size chart.

**Tech Stack:** Node.js HTTP server, JSON file persistence, vanilla HTML/CSS/JS, Playwright API/UI tests.

---

## File Structure

- Modify: `data/products.json` to add `variants`, `gallery`, `colors`, `materials`, and `sizeChart` to every product.
- Modify: `tests/fixtures/test-data/products.json` with the same product schema as production fixtures.
- Modify: `server.js` to add SKU variant helpers, SKU-aware validation, cart persistence, merge behavior, and order item output.
- Modify: `tests/api.spec.js` to cover product schema, SKU stock validation, cart item `skuId`, merge caps, and order item `skuId`.
- Modify: `socks-product-list.html` to render gallery, color/material metadata, size chart, SKU stock state, and disabled sold-out sizes.
- Modify: `tests/socks-product-list.spec.js` to cover frontend SKU states, gallery, metadata, size chart, and checkout/order regressions.

## Shared Model Conventions

Use this variant shape everywhere:

```js
{
  skuId: "sock-01-39",
  size: "39",
  color: "Black",
  material: "Cotton blend",
  stockQuantity: 8,
  lowStockThreshold: 5,
  isAvailable: true
}
```

Use this cart item shape after successful new mutations:

```js
{
  productId: "sock-01",
  skuId: "sock-01-39",
  size: "39",
  quantity: 1
}
```

Keep accepting older cart items without `skuId`; resolve them from `productId + size` during read/update/order creation.

---

### Task 1: Add SKU Product Schema Tests And Product Data

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `data/products.json`
- Modify: `tests/fixtures/test-data/products.json`

- [ ] **Step 1: Write the failing product schema API test**

Add this test near the existing product payload tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Run product schema tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SKU variants|unique SKU ids"
```

Expected: FAIL because products do not yet expose `variants`, `gallery`, `colors`, `materials`, and `sizeChart`.

- [ ] **Step 3: Add SKU data to product fixtures**

Update each product in `data/products.json` and `tests/fixtures/test-data/products.json`.

For `sock-01`, use this concrete shape as the pattern:

```json
{
  "sizes": ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
  "variants": [
    { "skuId": "sock-01-35", "size": "35", "color": "Black", "material": "Cotton blend", "stockQuantity": 12, "lowStockThreshold": 4, "isAvailable": true },
    { "skuId": "sock-01-36", "size": "36", "color": "Black", "material": "Cotton blend", "stockQuantity": 11, "lowStockThreshold": 4, "isAvailable": true },
    { "skuId": "sock-01-37", "size": "37", "color": "White", "material": "Cotton blend", "stockQuantity": 9, "lowStockThreshold": 4, "isAvailable": true },
    { "skuId": "sock-01-38", "size": "38", "color": "White", "material": "Cotton blend", "stockQuantity": 7, "lowStockThreshold": 4, "isAvailable": true },
    { "skuId": "sock-01-39", "size": "39", "color": "Gray", "material": "Cotton blend", "stockQuantity": 8, "lowStockThreshold": 5, "isAvailable": true },
    { "skuId": "sock-01-40", "size": "40", "color": "Gray", "material": "Cotton blend", "stockQuantity": 6, "lowStockThreshold": 5, "isAvailable": true },
    { "skuId": "sock-01-41", "size": "41", "color": "Black", "material": "Cotton blend", "stockQuantity": 5, "lowStockThreshold": 5, "isAvailable": true },
    { "skuId": "sock-01-42", "size": "42", "color": "Black", "material": "Cotton blend", "stockQuantity": 4, "lowStockThreshold": 5, "isAvailable": true },
    { "skuId": "sock-01-43", "size": "43", "color": "White", "material": "Cotton blend", "stockQuantity": 3, "lowStockThreshold": 5, "isAvailable": true },
    { "skuId": "sock-01-44", "size": "44", "color": "Gray", "material": "Cotton blend", "stockQuantity": 2, "lowStockThreshold": 5, "isAvailable": true },
    { "skuId": "sock-01-45", "size": "45", "color": "Gray", "material": "Cotton blend", "stockQuantity": 0, "lowStockThreshold": 5, "isAvailable": false }
  ],
  "gallery": [
    { "id": "main", "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Crect width='160' height='90' fill='%23f7f7f7'/%3E%3Cpath d='M34 48c18-16 45-16 63 0 7 6 18 10 31 10h8v15H77c-25 0-43-8-54-23z' fill='%23262626'/%3E%3C/svg%3E", "alt": "Minimal crew socks main product image" },
    { "id": "folded", "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Crect width='160' height='90' fill='%23eeeeee'/%3E%3Crect x='36' y='28' width='88' height='34' rx='17' fill='%23ffffff' stroke='%23999999'/%3E%3C/svg%3E", "alt": "Folded minimal crew socks" }
  ],
  "colors": ["Black", "White", "Gray"],
  "materials": ["Cotton blend", "Spandex"],
  "sizeChart": [
    { "size": "35", "footLengthCm": "22.0-22.5", "usMen": "4", "usWomen": "5.5" },
    { "size": "36", "footLengthCm": "22.5-23.0", "usMen": "4.5", "usWomen": "6" },
    { "size": "37", "footLengthCm": "23.0-23.5", "usMen": "5", "usWomen": "6.5" },
    { "size": "38", "footLengthCm": "23.5-24.0", "usMen": "6", "usWomen": "7.5" },
    { "size": "39", "footLengthCm": "24.5-25.0", "usMen": "6.5-7", "usWomen": "8-8.5" },
    { "size": "40", "footLengthCm": "25.0-25.5", "usMen": "7.5", "usWomen": "9" },
    { "size": "41", "footLengthCm": "25.5-26.0", "usMen": "8", "usWomen": "9.5" },
    { "size": "42", "footLengthCm": "26.0-26.5", "usMen": "8.5", "usWomen": "10" },
    { "size": "43", "footLengthCm": "26.5-27.0", "usMen": "9.5", "usWomen": "11" },
    { "size": "44", "footLengthCm": "27.0-27.5", "usMen": "10", "usWomen": "11.5" },
    { "size": "45", "footLengthCm": "27.5-28.0", "usMen": "11", "usWomen": "12.5" }
  ]
}
```

For the remaining products, generate `variants` from each existing `sizes` array using `skuId: <productId>-<size>`, colors from `["Black", "White", "Gray"]`, material from the product family, `lowStockThreshold: 5`, and at least one sold-out variant across the catalog for frontend tests. Keep existing `stockQuantity` fields temporarily if present.

- [ ] **Step 4: Run product schema tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SKU variants|unique SKU ids"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add data/products.json tests/fixtures/test-data/products.json tests/api.spec.js
git commit -m "feat: add product sku variant data"
```

---

### Task 2: Add Backend SKU Variant Helpers

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing API tests for SKU helper behavior through cart**

Add these tests near existing cart stock tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Run SKU cart tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SKU-backed size|sold-out SKU"
```

Expected: FAIL because cart items do not yet include `skuId`, and sold-out variants are not checked.

- [ ] **Step 3: Add variant helpers in `server.js`**

Add these helpers near existing cart helper functions:

```js
function getProductVariants(product) {
  return Array.isArray(product.variants) ? product.variants : [];
}

function findProductVariant(product, size) {
  return getProductVariants(product).find((variant) => variant.size === size) || null;
}

function isVariantSellable(variant) {
  return Boolean(variant)
    && variant.isAvailable !== false
    && Number.isInteger(variant.stockQuantity)
    && variant.stockQuantity > 0;
}

function getVariantStockLimit(variant) {
  if (!variant || !Number.isInteger(variant.stockQuantity) || variant.stockQuantity < 0) {
    return null;
  }
  return variant.stockQuantity;
}

function normalizeCartItemWithVariant(item, product) {
  const variant = item.skuId
    ? getProductVariants(product).find((entry) => entry.skuId === item.skuId)
    : findProductVariant(product, item.size);

  return variant
    ? { ...item, skuId: variant.skuId, size: variant.size }
    : item;
}

function getCartSkuQuantity(cart, skuId, excludedSkuId) {
  return cart.items.reduce((sum, item) => {
    if (item.skuId !== skuId || item.skuId === excludedSkuId) {
      return sum;
    }
    return sum + item.quantity;
  }, 0);
}
```

- [ ] **Step 4: Update `validateCartItemInput` to resolve variants**

Replace the size validation portion with:

```js
const variant = findProductVariant(product, body.size);
if (!variant) {
  return {
    statusCode: 400,
    code: "INVALID_SIZE",
    message: "Size is not available for this product."
  };
}

if (!isVariantSellable(variant)) {
  return {
    statusCode: 409,
    code: "OUT_OF_STOCK",
    message: "Selected size is out of stock."
  };
}
```

Return the variant:

```js
return { product, variant, quantity };
```

- [ ] **Step 5: Run SKU cart tests and verify the remaining failure**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SKU-backed size|sold-out SKU"
```

Expected: Sold-out test PASS; valid add still FAIL until cart write stores `skuId`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: add sku variant validation helpers"
```

---

### Task 3: Make Cart Stock Validation Per SKU

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing per-size stock tests**

Add these tests near cart stock tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Run per-SKU stock tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "independently for each SKU|SKU-backed cart item"
```

Expected: FAIL because stock validation still uses product-level quantity and cart items lack `skuId`.

- [ ] **Step 3: Replace stock validation helper**

Replace existing stock quantity logic with SKU-aware validation:

```js
function validateSkuStockQuantity(cart, variant, requestedQuantity, excludedSkuId) {
  const stockLimit = getVariantStockLimit(variant);
  if (stockLimit === null) {
    return null;
  }

  const currentQuantity = getCartSkuQuantity(cart, variant.skuId, excludedSkuId);
  const nextQuantity = currentQuantity + requestedQuantity;
  if (nextQuantity <= stockLimit) {
    return null;
  }

  return {
    statusCode: 409,
    code: "INSUFFICIENT_STOCK",
    message: "Selected size stock is not enough for the requested quantity."
  };
}
```

Keep the old function only if existing tests still reference product-level behavior indirectly; route code should call `validateSkuStockQuantity`.

- [ ] **Step 4: Store `skuId` in POST cart route**

In `POST /api/cart/items`, after validation succeeds, use:

```js
const variant = validation.variant;
const stockValidation = validateSkuStockQuantity(cart, variant, validation.quantity);
if (stockValidation) {
  sendError(response, stockValidation.statusCode, stockValidation.code, stockValidation.message);
  return;
}

const existingItem = cart.items.find((item) => {
  return item.skuId === variant.skuId
    || (item.productId === body.productId && item.size === body.size);
});

if (existingItem) {
  existingItem.skuId = variant.skuId;
  existingItem.size = variant.size;
  existingItem.quantity += validation.quantity;
} else {
  cart.items.push({
    productId: body.productId,
    skuId: variant.skuId,
    size: variant.size,
    quantity: validation.quantity
  });
}
```

- [ ] **Step 5: Store and validate `skuId` in PATCH route**

In `PATCH /api/cart/items`, use:

```js
const variant = validation.variant;
const itemIndex = cart.items.findIndex((item) => {
  return item.skuId === variant.skuId
    || (item.productId === body.productId && item.size === body.size);
});
```

Then validate:

```js
const stockValidation = validateSkuStockQuantity(
  cart,
  variant,
  validation.quantity,
  variant.skuId
);
```

Before responding, normalize the item:

```js
cart.items[itemIndex] = {
  ...cart.items[itemIndex],
  productId: body.productId,
  skuId: variant.skuId,
  size: variant.size,
  quantity: validation.quantity
};
```

- [ ] **Step 6: Update DELETE route to find by SKU when possible**

In `DELETE /api/cart/items`, load products and resolve the variant if possible:

```js
const products = await readJsonFile(productsFile);
const product = products.find((item) => item.id === body.productId);
const variant = product ? findProductVariant(product, body.size) : null;
const itemIndex = cart.items.findIndex((item) => {
  return variant
    ? item.skuId === variant.skuId || (item.productId === body.productId && item.size === body.size)
    : item.productId === body.productId && item.size === body.size;
});
```

- [ ] **Step 7: Run per-SKU stock tests and cart regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "independently for each SKU|SKU-backed cart item|SKU-backed size|sold-out SKU|cart"
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: enforce sku stock in cart"
```

---

### Task 4: Make Cart Merge And Orders SKU-Aware

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing merge and order tests**

Add these tests to `tests/api.spec.js` near user cart and order tests:

```js
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
```

- [ ] **Step 2: Run merge/order SKU tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "merge quantities by SKU|skuId on order items"
```

Expected: FAIL until merge and order item builders preserve `skuId`.

- [ ] **Step 3: Update merge logic to aggregate by SKU**

In `mergeCartItems`, resolve variants before matching:

```js
const product = products.find((entry) => entry.id === incomingItem.productId);
const variant = product ? findProductVariant(product, incomingItem.size) : null;
if (!product || !variant || !isVariantSellable(variant)) {
  return;
}

const existingItem = mergedItems.find((item) => {
  return item.skuId === variant.skuId
    || (item.productId === incomingItem.productId && item.size === variant.size);
});
```

Use SKU stock:

```js
const stockLimit = getVariantStockLimit(variant);
const nextQuantity = stockLimit === null ? requestedQuantity : Math.min(requestedQuantity, stockLimit);
```

When pushing or updating:

```js
if (existingItem) {
  existingItem.productId = product.id;
  existingItem.skuId = variant.skuId;
  existingItem.size = variant.size;
  existingItem.quantity = nextQuantity;
} else {
  mergedItems.push({
    productId: incomingItem.productId,
    skuId: variant.skuId,
    size: variant.size,
    quantity: nextQuantity
  });
}
```

- [ ] **Step 4: Update `buildOrderItems` to include `skuId`**

In `buildOrderItems`, resolve the variant:

```js
const variant = findProductVariant(product, item.size);
```

Return:

```js
return {
  productId: product.id,
  skuId: item.skuId || variant?.skuId || `${product.id}-${item.size}`,
  title: localizedProduct.title,
  size: item.size,
  quantity: item.quantity,
  price: product.price,
  originalPrice: product.originalPrice
};
```

- [ ] **Step 5: Update order creation stock loop**

In `POST /api/orders`, replace product-level size/stock checks with:

```js
const variant = findProductVariant(product, cartItem.size);
if (!variant) {
  sendError(response, 400, "INVALID_SIZE", "Size is not available for this product.");
  return;
}
if (!isVariantSellable(variant)) {
  sendError(response, 409, "OUT_OF_STOCK", "Selected size is out of stock.");
  return;
}
const stockValidation = validateSkuStockQuantity(
  cart,
  variant,
  cartItem.quantity,
  variant.skuId
);
if (stockValidation) {
  sendError(response, stockValidation.statusCode, stockValidation.code, stockValidation.message);
  return;
}
cartItem.skuId = variant.skuId;
```

- [ ] **Step 6: Run merge/order tests and order regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "merge quantities by SKU|skuId on order items|order"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: persist sku ids through orders"
```

---

### Task 5: Render SKU Stock States On Listing Cards

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing frontend listing tests**

Add these tests near existing stock card tests in `tests/socks-product-list.spec.js`:

```js
test("renders SKU-level low-stock and sold-out size states on product cards", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const card = page.locator('[data-product-card][data-product-id="sock-01"]');
  await expect(card.locator('[data-size="43"]')).toHaveAttribute("data-low-stock", "true");
  await expect(card.locator('[data-size="45"]')).toBeDisabled();
  await expect(card.locator("[data-sku-stock-summary]")).toContainText(/43|仅剩|Only/);
});

test("does not add sold-out SKU sizes from product cards", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const card = page.locator('[data-product-card][data-product-id="sock-01"]');
  await expect(card.locator('[data-size="45"]')).toBeDisabled();
  await card.locator('[data-size="45"]').click({ force: true });
  await card.locator("[data-cart-button]").click();

  await expect(page.locator("[data-cart-count]")).toHaveText("0");
});
```

- [ ] **Step 2: Run listing SKU tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "SKU-level low-stock|sold-out SKU sizes"
```

Expected: FAIL because card size buttons do not yet expose SKU stock attributes or disabled state.

- [ ] **Step 3: Add frontend SKU helpers**

Add these helpers near existing product helper functions in `socks-product-list.html`:

```js
function getProductVariants(product) {
  return Array.isArray(product.variants) ? product.variants : [];
}

function findVariantForSize(product, size) {
  return getProductVariants(product).find((variant) => variant.size === size) || null;
}

function isVariantAvailable(variant) {
  return Boolean(variant)
    && variant.isAvailable !== false
    && Number.isInteger(variant.stockQuantity)
    && variant.stockQuantity > 0;
}

function isVariantLowStock(variant) {
  return isVariantAvailable(variant)
    && Number.isInteger(variant.lowStockThreshold)
    && variant.stockQuantity <= variant.lowStockThreshold;
}

function getVariantStockText(variant) {
  if (!variant || !isVariantAvailable(variant)) {
    return activeLocale === LOCALE_KEY.EN_US ? "Sold out" : "售罄";
  }
  if (isVariantLowStock(variant)) {
    return activeLocale === LOCALE_KEY.EN_US
      ? `Only ${variant.stockQuantity} left`
      : `${variant.size} 码仅剩 ${variant.stockQuantity} 件`;
  }
  return activeLocale === LOCALE_KEY.EN_US ? "In stock" : "现货充足";
}
```

- [ ] **Step 4: Render size buttons from variants**

Update size button markup generation to use each variant:

```js
function createSizeButtonsMarkup(product, options = {}) {
  const variants = getProductVariants(product);
  const selectedSize = options.selectedSize || variants.find(isVariantAvailable)?.size || product.sizes[0];

  return variants.map((variant) => {
    const isSelected = variant.size === selectedSize;
    const isAvailable = isVariantAvailable(variant);
    return `
      <button
        class="product-card__size"
        type="button"
        data-size="${variant.size}"
        data-sku-id="${variant.skuId}"
        data-low-stock="${isVariantLowStock(variant) ? "true" : "false"}"
        data-sold-out="${isAvailable ? "false" : "true"}"
        aria-pressed="${isSelected ? "true" : "false"}"
        ${isAvailable ? "" : "disabled"}
      >${variant.size}</button>
    `;
  }).join("");
}
```

If the current function name differs, replace the body of the existing size markup function rather than adding a duplicate.

- [ ] **Step 5: Add card stock summary markup**

In product card markup, add:

```html
<p class="product-card__stock" data-sku-stock-summary>${getVariantStockText(getProductVariants(product).find(isVariantLowStock) || getProductVariants(product)[0])}</p>
```

Keep existing `data-stock-label` until legacy tests are updated.

- [ ] **Step 6: Update size selection binding to skip disabled sizes**

In `bindSizeSelection`, ignore disabled buttons:

```js
if (button.disabled) {
  return;
}
```

- [ ] **Step 7: Run listing SKU tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "SKU-level low-stock|sold-out SKU sizes|stock signals|add-to-cart"
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: render sku stock on product cards"
```

---

### Task 6: Upgrade Detail Page Gallery, Metadata, And Size Chart

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing detail page tests**

Add these tests near existing detail page tests in `tests/socks-product-list.spec.js`:

```js
test("renders gallery color material and size chart on the detail page", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-01");

  await expect(page.locator("[data-product-gallery]")).toBeVisible();
  await expect(page.locator("[data-product-gallery-image]")).toHaveAttribute("alt", /socks/i);
  await expect(page.locator("[data-product-gallery-thumb]")).toHaveCount(2);
  await expect(page.locator("[data-product-colors]")).toContainText(/Black|White|Gray/);
  await expect(page.locator("[data-product-materials]")).toContainText(/Cotton|Spandex/);
  await expect(page.locator("[data-size-chart-row]")).toHaveCount(11);
});

test("shows selected SKU stock state on detail size selection", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-01");

  await page.locator('[data-size="43"]').click();
  await expect(page.locator("[data-selected-sku-stock]")).toContainText(/43|仅剩|Only/);
  await expect(page.locator('[data-size="45"]')).toBeDisabled();
});
```

- [ ] **Step 2: Run detail tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "gallery color material|selected SKU stock"
```

Expected: FAIL because detail page does not yet render these sections.

- [ ] **Step 3: Add detail gallery markup helper**

Add:

```js
function createGalleryMarkup(product) {
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];
  if (!gallery.length) {
    return "";
  }

  const primaryImage = gallery[0];
  return `
    <section class="detail-gallery" data-product-gallery>
      <img class="detail-gallery__image" src="${primaryImage.src}" alt="${primaryImage.alt}" data-product-gallery-image>
      <div class="detail-gallery__thumbs">
        ${gallery.map((image) => `
          <button class="detail-gallery__thumb" type="button" data-product-gallery-thumb data-gallery-src="${image.src}" data-gallery-alt="${image.alt}">
            <img src="${image.src}" alt="${image.alt}">
          </button>
        `).join("")}
      </div>
    </section>
  `;
}
```

- [ ] **Step 4: Add metadata and size chart helpers**

Add:

```js
function createProductMetadataMarkup(product) {
  return `
    <div class="detail-metadata">
      <p data-product-colors>Colors: ${(product.colors || []).join(", ")}</p>
      <p data-product-materials>Materials: ${(product.materials || []).join(", ")}</p>
    </div>
  `;
}

function createSizeChartMarkup(product) {
  const rows = Array.isArray(product.sizeChart) ? product.sizeChart : [];
  if (!rows.length) {
    return "";
  }

  return `
    <section class="size-chart" data-size-chart>
      <h3>Size chart</h3>
      <div class="size-chart__grid">
        ${rows.map((row) => `
          <div class="size-chart__row" data-size-chart-row>
            <span>${row.size}</span>
            <span>${row.footLengthCm}</span>
            <span>${row.usMen}</span>
            <span>${row.usWomen}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}
```

- [ ] **Step 5: Insert helpers into detail page markup**

In detail markup, include:

```js
${createGalleryMarkup(product)}
${createProductMetadataMarkup(product)}
<p class="detail-content__stock" data-selected-sku-stock>${getVariantStockText(findVariantForSize(product, selectedSize))}</p>
${createSizeChartMarkup(product)}
```

Place gallery near the media area and metadata/size chart near the product details.

- [ ] **Step 6: Add gallery thumbnail click listener**

In `bindDetailInteractions(product)`, add:

```js
detailPagePanel.querySelectorAll("[data-product-gallery-thumb]").forEach((button) => {
  button.addEventListener("click", () => {
    const image = detailPagePanel.querySelector("[data-product-gallery-image]");
    image.src = button.dataset.gallerySrc;
    image.alt = button.dataset.galleryAlt;
  });
});
```

- [ ] **Step 7: Update selected SKU stock when detail size changes**

After detail size selection changes, update:

```js
const selectedSize = detailPagePanel.querySelector('[data-size][aria-pressed="true"]')?.textContent.trim();
const selectedVariant = findVariantForSize(product, selectedSize);
const stockNode = detailPagePanel.querySelector("[data-selected-sku-stock]");
if (stockNode) {
  stockNode.textContent = getVariantStockText(selectedVariant);
}
```

- [ ] **Step 8: Run detail SKU tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "gallery color material|selected SKU stock|detail"
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add sku merchandising detail view"
```

---

### Task 7: Final Targeted Verification

**Files:**
- Verify: `server.js`
- Verify: `socks-product-list.html`
- Verify: `tests/api.spec.js`
- Verify: `tests/socks-product-list.spec.js`
- Verify: `data/products.json`
- Verify: `tests/fixtures/test-data/products.json`

- [ ] **Step 1: Run SKU API tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "SKU|skuId|sold-out|INSUFFICIENT_STOCK|OUT_OF_STOCK"
```

Expected: PASS.

- [ ] **Step 2: Run SKU frontend tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "SKU|sku|gallery|material|size chart|sold-out|stock"
```

Expected: PASS.

- [ ] **Step 3: Run cart, checkout, auth, and order regressions**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "cart|checkout|order|auth|address"
```

Expected: PASS, with only previously skipped legacy confirmation tests remaining skipped.

- [ ] **Step 4: Manual smoke check**

Start one local service:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; node server.js
```

Open:

```text
http://127.0.0.1:4173/socks-product-list.html
```

Manual flow:

```text
打开首页 -> 查看商品卡尺码库存 -> 打开 sock-01 详情页 -> 切换相册缩略图 -> 查看颜色/材质/尺码表 -> 选择 43 码加购到库存上限 -> 再次加购看到无货提示 -> 选择可售尺码结算 -> 查看订单详情包含正常商品信息 -> 登录后查看订单历史
```

Expected:

```text
售罄尺码不可选，低库存尺码有提示，购物车和订单流程仍可完成，订单详情与历史页不崩溃。
```

- [ ] **Step 5: Commit verification fixes if needed**

If no code changes are needed after verification, skip this commit. If selector/copy fixes are required, run:

```powershell
git add server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js data/products.json tests/fixtures/test-data/products.json
git commit -m "test: verify sku product model flow"
```

---

## Self-Review

- Spec coverage: product `variants`, gallery, colors, materials, size chart, SKU stock validation, cart `skuId`, order `skuId`, merge caps, listing SKU state, detail gallery/metadata/size chart, compatibility with old `sizes`, and targeted regressions are mapped to Tasks 1-7.
- Placeholder scan: plan contains no unresolved markers. Each task has concrete tests, implementation targets, commands, and expected outcomes.
- Type consistency: the plan uses `skuId`, `variants`, `stockQuantity`, `lowStockThreshold`, `isAvailable`, `gallery`, `colors`, `materials`, and `sizeChart` consistently across data, API, cart, order, and frontend tasks.
- Risk control: plan uses single-session targeted tests and frequent commits. It does not require multiple agents, stress tests, supplier probing, or high-frequency retries.

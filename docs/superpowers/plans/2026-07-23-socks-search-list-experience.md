# Socks Search And List Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realistic product-list search refinement with pagination/load-more, price, size, stock, rating filters, and no-result recommendations.

**Architecture:** Extend the existing `/api/products` API so SQLite remains the single product source. Keep current `filter`, `sort`, `locale`, and `q` behavior stable, then layer normalized refinement parameters and pagination into `getProductsPayload`. Update the single-file storefront to read/write list state through URL query parameters and append results for load-more without resetting cart state.

**Tech Stack:** Node.js HTTP server, SQLite-backed product repository, vanilla HTML/CSS/JavaScript storefront, Playwright API and UI tests.

---

## File Structure

- Modify: `server.js`
  - Extend product query normalization.
  - Add price, size, stock, rating, pagination, and recommendation logic in small helper functions near `getProductsPayload`.
  - Keep `/api/products` as the only product list endpoint.
- Modify: `socks-product-list.html`
  - Add filter rail/panel markup and styles inside the existing storefront shell.
  - Track advanced list state in URL and JavaScript variables.
  - Add load-more and no-result recommendation rendering.
- Modify: `tests/api.spec.js`
  - Add API tests for new query parameters, pagination metadata, combined filters, and recommendations.
- Modify: `tests/socks-product-list.spec.js`
  - Add UI tests for filter controls, load more, no-result recovery, and detail context preservation.
- Read-only reference: `docs/superpowers/specs/2026-07-23-socks-search-list-experience-design.md`

## Important Constraints

- Do not use provider/model stress tests, background agents, or repeated network retries.
- Preserve existing API response fields: `items`, `meta.filter`, `meta.sort`, and `meta.count`.
- Keep invalid product-list query parameters forgiving; normalize them instead of returning `400`.
- Do not reintroduce live state reads from `cart.json`, `orders.json`, `users.json`, `sessions.json`, or `user-carts.json`.
- Keep direct Chinese text as UTF-8. Do not write `\uXXXX` escapes.
- Use TDD for every behavior change.

---

### Task 1: Extend Product API Pagination Metadata

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API pagination test**

Add this test near the current `/api/products` tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Run pagination test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "paginates products"
```

Expected: FAIL because `meta.totalCount`, `meta.page`, `meta.pageSize`, `meta.totalPages`, and `meta.hasMore` do not exist yet.

- [ ] **Step 3: Add pagination helpers in `server.js`**

Add these helpers near `normalizeSearchQuery`:

```js
function normalizePositiveInteger(value, fallback, options = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return options.max ? Math.min(parsed, options.max) : parsed;
}

function paginateItems(items, page, pageSize) {
  const totalCount = items.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    hasMore: safePage < totalPages,
    items: items.slice(startIndex, startIndex + pageSize)
  };
}
```

- [ ] **Step 4: Wire pagination into `getProductsPayload`**

Change the function signature:

```js
function getProductsPayload(products, filterValue, sortValue, localeValue, queryValue, options = {}) {
```

Add pagination before the final return:

```js
  const page = normalizePositiveInteger(options.page, 1);
  const pageSize = normalizePositiveInteger(options.pageSize, 8, { max: 24 });
  const paginated = paginateItems(matchedItems, page, pageSize);
```

Return paginated items and expanded meta:

```js
  return {
    items: paginated.items,
    recommendations: [],
    meta: {
      ...payloadMeta,
      count: paginated.items.length,
      totalCount: paginated.totalCount,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalPages: paginated.totalPages,
      hasMore: paginated.hasMore
    }
  };
```

Update the `/api/products` route call:

```js
      const payload = getProductsPayload(
        products,
        requestUrl.searchParams.get("filter"),
        requestUrl.searchParams.get("sort"),
        requestUrl.searchParams.get("locale"),
        requestUrl.searchParams.get("q"),
        {
          page: requestUrl.searchParams.get("page"),
          pageSize: requestUrl.searchParams.get("pageSize")
        }
      );
```

- [ ] **Step 5: Run pagination test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "paginates products"
```

Expected: PASS.

- [ ] **Step 6: Run existing product API regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "products|localized|filters|searches|SKU variants"
```

Expected: PASS. Existing tests that expect `meta.count: 12` should continue passing because default page size is `8` only after updating those exact assertions to use `meta.totalCount` when they mean all matches. If one exact meta assertion fails, change it to:

```js
expect(payload.meta).toMatchObject({
  filter: "all",
  sort: "recommended",
  totalCount: 12
});
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: paginate product list api"
```

---

### Task 2: Add Price, Size, Stock, And Rating API Filters

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing API filter tests**

Add these tests near product API tests in `tests/api.spec.js`:

```js
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
```

- [ ] **Step 2: Run API filter tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "filters products by price|filters products by SKU size|filters products by stock state|filters products by minimum rating"
```

Expected: FAIL because filters are not applied and `meta.filters` does not exist.

- [ ] **Step 3: Add filter normalization helpers in `server.js`**

Add near product query helpers:

```js
const validStockFilters = new Set(["all", "in-stock", "low-stock", "out-of-stock"]);

function normalizeOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProductRefinements(options = {}) {
  const minPrice = normalizeOptionalNumber(options.minPrice);
  const maxPrice = normalizeOptionalNumber(options.maxPrice);
  const ratingMin = normalizeOptionalNumber(options.ratingMin);
  const stock = validStockFilters.has(options.stock) ? options.stock : "all";
  const size = String(options.size || "").trim();

  return {
    minPrice,
    maxPrice,
    size,
    stock,
    ratingMin
  };
}

function hasSellableVariant(product, size = "") {
  return getProductVariants(product).some((variant) => {
    const sizeMatches = !size || variant.size === size;
    return sizeMatches && variant.isAvailable && variant.stockQuantity > 0;
  });
}

function hasLowStockVariant(product, size = "") {
  return getProductVariants(product).some((variant) => {
    const sizeMatches = !size || variant.size === size;
    return sizeMatches
      && variant.isAvailable
      && variant.stockQuantity > 0
      && variant.stockQuantity <= variant.lowStockThreshold;
  });
}

function matchesSizeFilter(product, size) {
  return !size || getProductVariants(product).some((variant) => variant.size === size);
}

function matchesStockFilter(product, stock, size) {
  if (stock === "in-stock") {
    return hasSellableVariant(product, size);
  }

  if (stock === "low-stock") {
    return hasLowStockVariant(product, size);
  }

  if (stock === "out-of-stock") {
    return !hasSellableVariant(product, size);
  }

  return true;
}

function matchesProductRefinements(product, refinements) {
  if (refinements.minPrice !== null && product.price < refinements.minPrice) {
    return false;
  }

  if (refinements.maxPrice !== null && product.price > refinements.maxPrice) {
    return false;
  }

  if (refinements.ratingMin !== null && product.ratingValue < refinements.ratingMin) {
    return false;
  }

  if (!matchesSizeFilter(product, refinements.size)) {
    return false;
  }

  return matchesStockFilter(product, refinements.stock, refinements.size);
}
```

- [ ] **Step 4: Apply refinements in `getProductsPayload`**

Inside `getProductsPayload`, after localized search and before sorting, add:

```js
  const refinements = normalizeProductRefinements(options);
  const refinedItems = matchedItems.filter((product) => matchesProductRefinements(product, refinements));
```

Change sorting to operate on `refinedItems` instead of `matchedItems`:

```js
  if (sort === "recommended") {
    refinedItems.sort(sortRecommended);
  } else if (sort === "price-asc") {
    refinedItems.sort((left, right) => left.price - right.price);
  } else if (sort === "price-desc") {
    refinedItems.sort((left, right) => right.price - left.price);
  } else if (sort === "newest") {
    refinedItems.sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }
```

Paginate `refinedItems`:

```js
  const paginated = paginateItems(refinedItems, page, pageSize);
```

Add filters to meta:

```js
      filters: refinements
```

Pass the new request params from the route:

```js
          minPrice: requestUrl.searchParams.get("minPrice"),
          maxPrice: requestUrl.searchParams.get("maxPrice"),
          size: requestUrl.searchParams.get("size"),
          stock: requestUrl.searchParams.get("stock"),
          ratingMin: requestUrl.searchParams.get("ratingMin")
```

- [ ] **Step 5: Run API filter tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "filters products by price|filters products by SKU size|filters products by stock state|filters products by minimum rating"
```

Expected: PASS.

- [ ] **Step 6: Run combined product regression**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "products|localized|filters|searches|SKU variants|rating|stock"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: filter products by price size stock and rating"
```

---

### Task 3: Add No-Result Recommendations To Product API

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing recommendation test**

Add this test near product search tests:

```js
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
```

- [ ] **Step 2: Run recommendation test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "recommendations when product search has no results"
```

Expected: FAIL because `recommendations` is empty.

- [ ] **Step 3: Add recommendation helper in `server.js`**

Add near product helpers:

```js
function getNoResultRecommendations(products, locale, limit = 4) {
  return products
    .map((product) => localizeProduct(product, locale))
    .filter((product) => hasSellableVariant(product))
    .sort((left, right) => {
      if (left.isBestSeller !== right.isBestSeller) {
        return Number(right.isBestSeller) - Number(left.isBestSeller);
      }

      if (left.isRecommended !== right.isRecommended) {
        return Number(right.isRecommended) - Number(left.isRecommended);
      }

      if (left.ratingValue !== right.ratingValue) {
        return right.ratingValue - left.ratingValue;
      }

      return right.reviewCount - left.reviewCount;
    })
    .slice(0, limit);
}
```

- [ ] **Step 4: Return recommendations only for no-result responses**

In `getProductsPayload`, calculate:

```js
  const recommendations = paginated.totalCount === 0
    ? getNoResultRecommendations(products, locale)
    : [];
```

Return:

```js
    recommendations,
```

- [ ] **Step 5: Run recommendation test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "recommendations when product search has no results"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: recommend products for empty searches"
```

---

### Task 4: Add Storefront Filter State And URL Wiring

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [x] **Step 1: Write failing UI test for URL-driven filters**

Add this test near existing list interaction tests:

```js
test("applies price size stock and rating filters from the storefront url", async ({ page }) => {
  await page.goto("/socks-product-list.html?minPrice=40&maxPrice=50&size=43&stock=in-stock&ratingMin=4.5");

  await expect(page.locator("[data-active-filter-chip]")).toContainText([
    "¥40 - ¥50",
    "43",
    "现货",
    "4.5+"
  ]);
  await expect(page.locator("[data-product-card]")).not.toHaveCount(0);
  await expect(page.locator("[data-product-card]").first().locator("[data-size='43']")).toBeVisible();
});
```

- [x] **Step 2: Run URL-driven filter UI test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "applies price size stock and rating filters"
```

Expected: FAIL because the filter UI and query state do not exist yet.

- [x] **Step 3: Add JavaScript state constants and URL readers**

In `socks-product-list.html`, near current filter/sort/query constants, add:

```js
    const STOCK_FILTER_KEY = {
      ALL: "all",
      IN_STOCK: "in-stock",
      LOW_STOCK: "low-stock",
      OUT_OF_STOCK: "out-of-stock"
    };
    const validStockFilters = new Set(Object.values(STOCK_FILTER_KEY));
    const DEFAULT_PAGE_SIZE = 8;
    let activeMinPrice = "";
    let activeMaxPrice = "";
    let activeSize = "";
    let activeStock = STOCK_FILTER_KEY.ALL;
    let activeRatingMin = "";
    let activePage = 1;
    let activeHasMore = false;
```

Add these helpers near existing `getRequestedQuery()` helpers:

```js
    function getRequestedNumberParam(name) {
      const value = getSearchParams().get(name);
      if (value == null || value === "") {
        return "";
      }

      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? String(parsed) : "";
    }

    function getRequestedSize() {
      return String(getSearchParams().get("size") || "").trim();
    }

    function getRequestedStock() {
      const value = getSearchParams().get("stock");
      return validStockFilters.has(value) ? value : STOCK_FILTER_KEY.ALL;
    }

    function syncAdvancedListStateFromUrl() {
      activeMinPrice = getRequestedNumberParam("minPrice");
      activeMaxPrice = getRequestedNumberParam("maxPrice");
      activeSize = getRequestedSize();
      activeStock = getRequestedStock();
      activeRatingMin = getRequestedNumberParam("ratingMin");
      activePage = 1;
      activeHasMore = false;
    }
```

Call `syncAdvancedListStateFromUrl()` inside the existing list state initialization after `activeQuery` is set.

- [x] **Step 4: Send advanced filters in `fetchProducts`**

Add this helper:

```js
    function appendAdvancedFilterParams(params) {
      params.set("page", String(activePage));
      params.set("pageSize", String(DEFAULT_PAGE_SIZE));

      if (activeMinPrice) params.set("minPrice", activeMinPrice);
      if (activeMaxPrice) params.set("maxPrice", activeMaxPrice);
      if (activeSize) params.set("size", activeSize);
      if (activeStock !== STOCK_FILTER_KEY.ALL) params.set("stock", activeStock);
      if (activeRatingMin) params.set("ratingMin", activeRatingMin);

      return params;
    }
```

Inside `fetchProducts()`, call:

```js
      appendAdvancedFilterParams(params);
```

After parsing payload:

```js
      activeHasMore = Boolean(payload.meta.hasMore);
```

- [x] **Step 5: Add filter rail markup container and active chips**

In the storefront page shell near the current toolbar, add:

```html
        <aside class="advanced-filters" data-advanced-filters>
          <h2 class="advanced-filters__title">筛选</h2>
          <div class="advanced-filters__group">
            <label class="advanced-filters__label" for="filter-min-price">价格区间</label>
            <div class="advanced-filters__price-row">
              <input id="filter-min-price" class="advanced-filters__input" type="number" min="0" inputmode="numeric" data-price-min>
              <input class="advanced-filters__input" type="number" min="0" inputmode="numeric" aria-label="最高价格" data-price-max>
              <button class="advanced-filters__apply" type="button" data-price-apply>应用</button>
            </div>
          </div>
          <div class="advanced-filters__group" data-size-filter-group></div>
          <div class="advanced-filters__group" data-stock-filter-group></div>
          <div class="advanced-filters__group" data-rating-filter-group></div>
        </aside>
        <div class="active-filter-chips" data-active-filter-chips></div>
```

If the exact toolbar markup differs, place the `aside` before the product grid and the chips near the result count.

- [x] **Step 6: Add chip rendering function**

Add:

```js
    function renderActiveFilterChips() {
      const chipRoot = document.querySelector("[data-active-filter-chips]");
      if (!chipRoot) return;

      const chips = [];
      if (activeMinPrice || activeMaxPrice) {
        chips.push({ key: "price", label: `¥${activeMinPrice || "0"} - ¥${activeMaxPrice || "不限"}` });
      }
      if (activeSize) chips.push({ key: "size", label: activeSize });
      if (activeStock !== STOCK_FILTER_KEY.ALL) {
        const stockLabel = activeStock === STOCK_FILTER_KEY.IN_STOCK
          ? "现货"
          : activeStock === STOCK_FILTER_KEY.LOW_STOCK
            ? "低库存"
            : "缺货";
        chips.push({ key: "stock", label: stockLabel });
      }
      if (activeRatingMin) chips.push({ key: "rating", label: `${activeRatingMin}+` });

      chipRoot.innerHTML = chips.map((chip) => {
        return `<button class="active-filter-chip" type="button" data-active-filter-chip data-chip-key="${chip.key}">${chip.label}<span aria-hidden="true"> ×</span></button>`;
      }).join("");
    }
```

Call `renderActiveFilterChips()` after product rendering and after URL state initialization.

- [x] **Step 7: Add minimal CSS for filter rail and chips**

Add CSS near existing toolbar/list styles:

```css
    .advanced-filters {
      border: 1px solid var(--line);
      background: var(--surface);
      padding: 16px;
      border-radius: 18px;
    }

    .advanced-filters__title {
      margin: 0 0 12px;
      font-size: 15px;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .advanced-filters__group {
      display: grid;
      gap: 10px;
      padding: 12px 0;
      border-top: 1px solid var(--line);
    }

    .advanced-filters__price-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 8px;
    }

    .advanced-filters__input,
    .advanced-filters__apply,
    .active-filter-chip {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      padding: 0 12px;
    }

    .active-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
```

- [x] **Step 8: Run URL-driven filter UI test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "applies price size stock and rating filters"
```

Expected: PASS.

- [x] **Step 9: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: wire storefront advanced filter state"
```

---

### Task 5: Add Interactive Filter Controls And Load More

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [x] **Step 1: Write failing UI interaction tests**

Add:

```js
test("changes price and size filters from the storefront controls", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await page.locator("[data-price-min]").fill("40");
  await page.locator("[data-price-max]").fill("50");
  await page.locator("[data-price-apply]").click();
  await expect(page).toHaveURL(/minPrice=40/);
  await expect(page).toHaveURL(/maxPrice=50/);

  await page.locator('[data-size-filter="43"]').click();
  await expect(page).toHaveURL(/size=43/);
  await expect(page.locator("[data-active-filter-chip]")).toContainText(["¥40 - ¥50", "43"]);
});

test("loads more products without replacing the first page", async ({ page }) => {
  await page.goto("/socks-product-list.html?pageSize=5");
  await expect(page.locator("[data-product-card]")).toHaveCount(5);

  const firstProductId = await page.locator("[data-product-card]").first().getAttribute("data-product-id");
  await page.locator("[data-load-more-products]").click();

  await expect(page.locator("[data-product-card]")).toHaveCount(10);
  await expect(page.locator("[data-product-card]").first()).toHaveAttribute("data-product-id", firstProductId);
});
```

- [x] **Step 2: Run interaction tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "changes price and size filters|loads more products"
```

Expected: FAIL because controls and load-more behavior are not interactive yet.

- [x] **Step 3: Render size, stock, and rating controls**

Add:

```js
    function getAvailableSizesFromProducts(items = allProducts) {
      return Array.from(new Set(items.flatMap((product) => getProductVariants(product).map((variant) => variant.size))))
        .sort((left, right) => Number(left) - Number(right));
    }

    function renderAdvancedFilterControls() {
      const sizeRoot = document.querySelector("[data-size-filter-group]");
      const stockRoot = document.querySelector("[data-stock-filter-group]");
      const ratingRoot = document.querySelector("[data-rating-filter-group]");
      const minInput = document.querySelector("[data-price-min]");
      const maxInput = document.querySelector("[data-price-max]");

      if (minInput) minInput.value = activeMinPrice;
      if (maxInput) maxInput.value = activeMaxPrice;

      if (sizeRoot) {
        sizeRoot.innerHTML = `<p class="advanced-filters__label">尺码</p><div class="advanced-filters__chips">${getAvailableSizesFromProducts().map((size) => `<button class="advanced-filters__chip${activeSize === size ? " is-active" : ""}" type="button" data-size-filter="${size}" aria-pressed="${activeSize === size ? "true" : "false"}">${size}</button>`).join("")}</div>`;
      }

      if (stockRoot) {
        stockRoot.innerHTML = `
          <p class="advanced-filters__label">库存</p>
          <div class="advanced-filters__chips">
            <button type="button" data-stock-filter="all">全部</button>
            <button type="button" data-stock-filter="in-stock">现货</button>
            <button type="button" data-stock-filter="low-stock">低库存</button>
            <button type="button" data-stock-filter="out-of-stock">缺货</button>
          </div>
        `;
      }

      if (ratingRoot) {
        ratingRoot.innerHTML = `
          <p class="advanced-filters__label">评分</p>
          <div class="advanced-filters__chips">
            <button type="button" data-rating-filter="4">4.0+</button>
            <button type="button" data-rating-filter="4.5">4.5+</button>
            <button type="button" data-rating-filter="4.7">4.7+</button>
          </div>
        `;
      }
    }
```

- [x] **Step 4: Add URL update helper for advanced filters**

Add:

```js
    function getStorefrontHrefWithAdvancedFilters(overrides = {}) {
      const params = new URLSearchParams({
        filter: activeFilter,
        sort: activeSort,
        locale: activeLocale
      });

      const nextState = {
        q: activeQuery,
        minPrice: activeMinPrice,
        maxPrice: activeMaxPrice,
        size: activeSize,
        stock: activeStock,
        ratingMin: activeRatingMin,
        ...overrides
      };

      if (nextState.q) params.set("q", nextState.q);
      if (nextState.minPrice) params.set("minPrice", nextState.minPrice);
      if (nextState.maxPrice) params.set("maxPrice", nextState.maxPrice);
      if (nextState.size) params.set("size", nextState.size);
      if (nextState.stock && nextState.stock !== STOCK_FILTER_KEY.ALL) params.set("stock", nextState.stock);
      if (nextState.ratingMin) params.set("ratingMin", nextState.ratingMin);

      return `${STOREFRONT_PATH}?${params.toString()}`;
    }

    function navigateToAdvancedFilterState(overrides = {}) {
      window.history.pushState(null, "", getStorefrontHrefWithAdvancedFilters(overrides));
      refreshProductsFromUrl();
    }
```

- [x] **Step 5: Add click handlers for controls**

Inside the main document click handler or near filter listeners, add:

```js
      const priceApply = event.target.closest("[data-price-apply]");
      if (priceApply) {
        navigateToAdvancedFilterState({
          minPrice: document.querySelector("[data-price-min]")?.value.trim() || "",
          maxPrice: document.querySelector("[data-price-max]")?.value.trim() || ""
        });
        return;
      }

      const sizeFilter = event.target.closest("[data-size-filter]");
      if (sizeFilter) {
        navigateToAdvancedFilterState({
          size: activeSize === sizeFilter.dataset.sizeFilter ? "" : sizeFilter.dataset.sizeFilter
        });
        return;
      }

      const stockFilter = event.target.closest("[data-stock-filter]");
      if (stockFilter) {
        navigateToAdvancedFilterState({ stock: stockFilter.dataset.stockFilter });
        return;
      }

      const ratingFilter = event.target.closest("[data-rating-filter]");
      if (ratingFilter) {
        navigateToAdvancedFilterState({
          ratingMin: activeRatingMin === ratingFilter.dataset.ratingFilter ? "" : ratingFilter.dataset.ratingFilter
        });
        return;
      }
```

- [x] **Step 6: Add load-more button and append behavior**

Add markup near the product grid:

```html
        <div class="load-more-row">
          <button class="load-more-row__button" type="button" data-load-more-products>加载更多</button>
        </div>
```

Add:

```js
    async function loadMoreProducts() {
      if (!activeHasMore) return;

      activePage += 1;
      const nextProducts = await fetchProducts();
      visibleProducts = [...visibleProducts, ...nextProducts];
      renderProducts(visibleProducts);
    }
```

Add click handling:

```js
      const loadMoreButton = event.target.closest("[data-load-more-products]");
      if (loadMoreButton) {
        loadMoreButton.disabled = true;
        await loadMoreProducts();
        loadMoreButton.disabled = !activeHasMore;
        return;
      }
```

- [x] **Step 7: Run interaction tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "changes price and size filters|loads more products"
```

Expected: PASS.

- [x] **Step 8: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add storefront filters and load more"
```

---

### Task 6: Add No-Result UI And Recovery Actions

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing no-result UI test**

Add:

```js
test("shows no-result recommendations and recovery actions", async ({ page }) => {
  await page.goto("/socks-product-list.html?q=not-a-real-sock-query&maxPrice=1");

  await expect(page.locator("[data-no-results]")).toBeVisible();
  await expect(page.locator("[data-no-results-title]")).toContainText(/没有|No/);
  await expect(page.locator("[data-recommendation-card]")).not.toHaveCount(0);

  await page.locator("[data-clear-all-filters]").click();
  await expect(page).not.toHaveURL(/maxPrice=1/);
  await expect(page.locator("[data-product-card]")).not.toHaveCount(0);
});
```

- [ ] **Step 2: Run no-result UI test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "no-result recommendations"
```

Expected: FAIL because no-result markup and recovery actions do not exist.

- [ ] **Step 3: Capture API recommendations in fetch flow**

Add state:

```js
    let recommendationProducts = [];
```

Inside `fetchProducts()` after parsing payload:

```js
      recommendationProducts = Array.isArray(payload.recommendations) ? payload.recommendations : [];
```

- [ ] **Step 4: Render no-result state**

Add:

```js
    function renderNoResults() {
      if (!productGrid) return;

      productGrid.innerHTML = `
        <section class="no-results" data-no-results>
          <h2 data-no-results-title>${activeLocale === LOCALE_KEY.EN_US ? "No exact matches" : "没有找到完全匹配"}</h2>
          <p>${activeLocale === LOCALE_KEY.EN_US ? "Try clearing filters or browsing recommended socks." : "可以清除筛选，或者先看看推荐袜子。"}</p>
          <div class="no-results__actions">
            <button type="button" data-clear-all-filters>${activeLocale === LOCALE_KEY.EN_US ? "View all socks" : "查看全部袜子"}</button>
            <button type="button" data-clear-refinement-filters>${activeLocale === LOCALE_KEY.EN_US ? "Keep search, clear filters" : "保留搜索，清除筛选"}</button>
          </div>
          <div class="no-results__recommendations">
            ${recommendationProducts.map((product) => `<article class="recommendation-card" data-recommendation-card data-product-id="${product.id}"><h3>${product.title}</h3><p>¥${product.price}</p></article>`).join("")}
          </div>
        </section>
      `;
    }
```

In the main product render path, call `renderNoResults()` when `visibleProducts.length === 0`.

- [ ] **Step 5: Add recovery action handlers**

Add click handling:

```js
      const clearAllFilters = event.target.closest("[data-clear-all-filters]");
      if (clearAllFilters) {
        activeQuery = "";
        navigateToAdvancedFilterState({
          q: "",
          minPrice: "",
          maxPrice: "",
          size: "",
          stock: STOCK_FILTER_KEY.ALL,
          ratingMin: ""
        });
        return;
      }

      const clearRefinementFilters = event.target.closest("[data-clear-refinement-filters]");
      if (clearRefinementFilters) {
        navigateToAdvancedFilterState({
          minPrice: "",
          maxPrice: "",
          size: "",
          stock: STOCK_FILTER_KEY.ALL,
          ratingMin: ""
        });
        return;
      }
```

- [ ] **Step 6: Run no-result UI test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "no-result recommendations"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add empty search recommendations"
```

---

### Task 7: Preserve Detail Context And Run Final Verification

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing detail context test**

Add:

```js
test("preserves advanced filters when opening product detail and returning", async ({ page }) => {
  await page.goto("/socks-product-list.html?minPrice=40&maxPrice=60&size=43&stock=in-stock&ratingMin=4.5");

  await page.locator("[data-product-card]").first().locator("[data-product-detail-link]").click();
  await expect(page).toHaveURL(/view=detail/);
  await expect(page).toHaveURL(/minPrice=40/);
  await expect(page).toHaveURL(/size=43/);

  await page.locator("[data-detail-back-link]").click();
  await expect(page).toHaveURL(/minPrice=40/);
  await expect(page).toHaveURL(/size=43/);
  await expect(page.locator("[data-active-filter-chip]")).toContainText(["¥40 - ¥60", "43"]);
});
```

- [ ] **Step 2: Run detail context test and verify it fails if advanced params are not preserved**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "preserves advanced filters"
```

Expected: FAIL until detail links and back links include advanced params.

- [ ] **Step 3: Extend storefront href helpers to include advanced params**

Update `getContextualDetailHref()` and `getStorefrontHref()` call sites so advanced params are preserved:

```js
    function appendAdvancedContextParams(params) {
      if (activeMinPrice) params.set("minPrice", activeMinPrice);
      if (activeMaxPrice) params.set("maxPrice", activeMaxPrice);
      if (activeSize) params.set("size", activeSize);
      if (activeStock !== STOCK_FILTER_KEY.ALL) params.set("stock", activeStock);
      if (activeRatingMin) params.set("ratingMin", activeRatingMin);
      return params;
    }
```

Call `appendAdvancedContextParams(params)` before returning detail and storefront hrefs.

- [ ] **Step 4: Run detail context test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "preserves advanced filters"
```

Expected: PASS.

- [ ] **Step 5: Run final API verification**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "products|searches|filters|paginates|recommendations|SKU|rating|stock"
```

Expected: PASS.

- [ ] **Step 6: Run final UI verification**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/socks-product-list.spec.js --grep "advanced filters|loads more products|no-result recommendations|preserves advanced filters|list interactions|backend response|category"
```

Expected: PASS. If unrelated older tests fail because they seed `cart.json`, do not change this feature to restore JSON state reads. Update those tests in a separate task to seed cart through `/api/cart/items`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: preserve advanced list context"
```

---

## Self-Review

- Spec coverage: pagination/load-more, price range, size filter, stock filter, rating filter, search no-result recommendations, URL state, accessibility, and tests are all covered by tasks.
- Placeholder scan: no unresolved placeholder markers or vague implementation-only steps remain.
- Type consistency: API params use `page`, `pageSize`, `minPrice`, `maxPrice`, `size`, `stock`, and `ratingMin`; front-end state uses the same names.
- Risk control: no provider/model requests, no high-concurrency loops, and the only concurrent checkout test from prior work remains exactly two requests.

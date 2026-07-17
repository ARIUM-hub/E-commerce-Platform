# Socks Product Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rating, review count, and `Top rated` signals to the socks product cards while preserving the current black/white/gray storefront and existing cart behavior.

**Architecture:** This feature stays inside the existing static-data-plus-HTML flow. Product rating metadata will be added directly to the JSON product sources that already back `GET /api/products`, and the list page will render a new one-line rating band between price and description. Verification will extend the current API and Playwright suites rather than introducing a new test stack.

**Tech Stack:** JSON fixtures, Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `data/products.json`
  Purpose: add `ratingValue`, `reviewCount`, and `isTopRated` to the app data source.
- Modify: `tests/fixtures/test-data/products.json`
  Purpose: keep test fixtures identical to app product data so API and UI tests see the same shape.
- Modify: `tests/api.spec.js`
  Purpose: verify the product API now returns rating metadata with expected value types.
- Modify: `socks-product-list.html`
  Purpose: add rating markup, styles, and lightweight formatting helpers to the product cards.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify desktop rendering, `Top rated` visibility, and mobile layout stability.

### Shared Data Contract

- Each product returned by `GET /api/products` must include:
  - `ratingValue` as a number
  - `reviewCount` as an integer
  - `isTopRated` as a boolean
- The first recommended card should visibly render:
  - star symbols
  - numeric rating text
  - formatted review count text
  - `Top rated` tag when `isTopRated` is `true`

### Test Server Convention

- Run package scripts with `cmd /c npm ...` in this workspace to avoid PowerShell execution-policy issues.
- Before Playwright runs, free local port `4173` if a stale server is still listening.

### Task 1: Add rating metadata to product data and lock the API contract

**Files:**
- Modify: `data/products.json`
- Modify: `tests/fixtures/test-data/products.json`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write the failing API test for rating metadata**

Append this test to `tests/api.spec.js`:

```js
test("returns rating metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const firstProduct = payload.items[0];

  expect(firstProduct).toMatchObject({
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
```

- [ ] **Step 2: Run the API test to verify it fails**

Run:

```powershell
$line = (cmd /c netstat -ano ^| findstr /R /C:"127.0.0.1:4173 .*LISTENING" | Select-Object -First 1)
if ($line) {
  $targetPid = ($line -split '\s+')[-1]
  Stop-Process -Id $targetPid -Force
}
cmd /c npx playwright test tests/api.spec.js --grep "returns rating metadata for every product card"
```

Expected:

```text
FAIL because ratingValue/reviewCount/isTopRated are missing from the product payload
```

- [ ] **Step 3: Add the minimal rating fields to both product datasets**

Update `data/products.json` and `tests/fixtures/test-data/products.json` so each item includes rating metadata. Use this exact field pattern:

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
    "ratingValue": 4.7,
    "reviewCount": 1284,
    "isTopRated": true,
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
    "ratingValue": 4.8,
    "reviewCount": 2316,
    "isTopRated": true,
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
    "ratingValue": 4.5,
    "reviewCount": 864,
    "isTopRated": false,
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
    "ratingValue": 4.4,
    "reviewCount": 642,
    "isTopRated": false,
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
    "ratingValue": 4.6,
    "reviewCount": 973,
    "isTopRated": true,
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
    "ratingValue": 4.3,
    "reviewCount": 518,
    "isTopRated": false,
    "releaseDate": "2026-07-11",
    "visualTone": "#fbfbfb",
    "visualShadow": "#d7d7d7",
    "visualAccent": "#b0b0b0",
    "visualPattern": "light"
  }
]
```

- [ ] **Step 4: Run the API test to verify it passes**

Run:

```powershell
$line = (cmd /c netstat -ano ^| findstr /R /C:"127.0.0.1:4173 .*LISTENING" | Select-Object -First 1)
if ($line) {
  $targetPid = ($line -split '\s+')[-1]
  Stop-Process -Id $targetPid -Force
}
cmd /c npx playwright test tests/api.spec.js --grep "returns rating metadata for every product card"
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Commit**

```powershell
git add data/products.json tests/fixtures/test-data/products.json tests/api.spec.js
git commit -m "feat: add product rating metadata"
```

### Task 2: Render the rating band in product cards and verify desktop behavior

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing list-page tests for rating content**

Add these tests to `tests/socks-product-list.spec.js`:

```js
test("renders rating, review count, and top rated tag inside the first product card", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  await expect(firstCard.locator("[data-rating-band]")).toBeVisible();
  await expect(firstCard.locator("[data-rating-stars]")).toHaveText("★★★★★");
  await expect(firstCard.locator("[data-rating-value]")).toHaveText("4.7");
  await expect(firstCard.locator("[data-review-count]")).toHaveText("1,284 reviews");
  await expect(firstCard.locator("[data-top-rated]")).toHaveText("Top rated");
});

test("does not show the top rated tag for products that are not top rated", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const thirdCard = page.locator("[data-product-card]").nth(2);
  await expect(thirdCard.locator("[data-rating-band]")).toBeVisible();
  await expect(thirdCard.locator("[data-rating-value]")).toHaveText("4.5");
  await expect(thirdCard.locator("[data-review-count]")).toHaveText("864 reviews");
  await expect(thirdCard.locator("[data-top-rated]")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the page tests to verify they fail**

Run:

```powershell
$line = (cmd /c netstat -ano ^| findstr /R /C:"127.0.0.1:4173 .*LISTENING" | Select-Object -First 1)
if ($line) {
  $targetPid = ($line -split '\s+')[-1]
  Stop-Process -Id $targetPid -Force
}
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "renders rating, review count, and top rated tag inside the first product card|does not show the top rated tag for products that are not top rated"
```

Expected:

```text
FAIL because the card has no rating-band markup yet
```

- [ ] **Step 3: Add the minimal rating helpers, markup, and styles**

In `socks-product-list.html`, add these CSS rules near the existing card content styles:

```css
.product-card__rating {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  min-width: 0;
}

.product-card__stars {
  color: #4a4a4a;
  font-size: 13px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.product-card__rating-value {
  color: #111111;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.product-card__reviews {
  color: #666666;
  font-size: 13px;
  white-space: nowrap;
}

.product-card__top-rated {
  display: inline-flex;
  align-items: center;
  border: 1px solid #dddddd;
  border-radius: 999px;
  padding: 4px 8px;
  background: #f3f3f3;
  color: #444444;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
```

Add these helpers inside the `<script>` block before `createCardMarkup(product)`:

```js
function formatRatingValue(ratingValue) {
  return Number(ratingValue).toFixed(1);
}

function formatReviewCount(reviewCount) {
  return `${reviewCount.toLocaleString("en-US")} reviews`;
}

function createRatingMarkup(product) {
  const topRatedMarkup = product.isTopRated
    ? '<span class="product-card__top-rated" data-top-rated>Top rated</span>'
    : "";

  return `
    <div class="product-card__rating" data-rating-band>
      <span class="product-card__stars" data-rating-stars aria-hidden="true">★★★★★</span>
      <span class="product-card__rating-value" data-rating-value>${formatRatingValue(product.ratingValue)}</span>
      <span class="product-card__reviews" data-review-count>${formatReviewCount(product.reviewCount)}</span>
      ${topRatedMarkup}
    </div>
  `;
}
```

Insert the rating band in `createCardMarkup(product)` between the price block and the description:

```js
            <div class="product-card__price">
              <span class="product-card__price-current">¥${product.price}</span>
              <span class="product-card__price-original">¥${product.originalPrice}</span>
            </div>
            ${createRatingMarkup(product)}
            <p class="product-card__description">${product.description}</p>
```

- [ ] **Step 4: Run the page tests to verify they pass**

Run:

```powershell
$line = (cmd /c netstat -ano ^| findstr /R /C:"127.0.0.1:4173 .*LISTENING" | Select-Object -First 1)
if ($line) {
  $targetPid = ($line -split '\s+')[-1]
  Stop-Process -Id $targetPid -Force
}
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "renders rating, review count, and top rated tag inside the first product card|does not show the top rated tag for products that are not top rated"
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Commit**

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: render product rating band"
```

### Task 3: Stabilize mobile layout and run full regression

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write the failing responsive and integration coverage**

Append these tests:

In `tests/api.spec.js`:

```js
test("keeps rating metadata in filtered product responses", async ({ request }) => {
  const response = await request.get("/api/products?filter=daily&sort=recommended");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.items[0]).toMatchObject({
    title: "通勤罗口袜",
    ratingValue: 4.6,
    reviewCount: 973,
    isTopRated: true
  });
});
```

In `tests/socks-product-list.spec.js`:

```js
test("keeps the rating band readable on a mobile viewport", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("/socks-product-list.html");

  const firstCard = page.locator("[data-product-card]").first();
  const ratingBand = firstCard.locator("[data-rating-band]");
  await expect(ratingBand).toBeVisible();

  const bandBox = await ratingBand.boundingBox();
  const cardBox = await firstCard.boundingBox();
  expect(bandBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(Math.round(bandBox.height)).toBeLessThanOrEqual(32);
  expect(bandBox.x + bandBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 20);

  await page.close();
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail if layout overflows**

Run:

```powershell
$line = (cmd /c netstat -ano ^| findstr /R /C:"127.0.0.1:4173 .*LISTENING" | Select-Object -First 1)
if ($line) {
  $targetPid = ($line -split '\s+')[-1]
  Stop-Process -Id $targetPid -Force
}
cmd /c npx playwright test tests/api.spec.js tests/socks-product-list.spec.js --grep "keeps rating metadata in filtered product responses|keeps the rating band readable on a mobile viewport"
```

Expected:

```text
API test may already pass after Task 1; mobile layout test should fail until rating spacing is tuned for small screens
```

- [ ] **Step 3: Add the minimal mobile tuning**

If the mobile test fails, add this responsive adjustment inside the existing `@media (max-width: 640px)` block in `socks-product-list.html`:

```css
      .product-card__rating {
        gap: 8px;
      }

      .product-card__stars {
        font-size: 12px;
        letter-spacing: 0.05em;
      }

      .product-card__rating-value,
      .product-card__reviews {
        font-size: 12px;
      }

      .product-card__top-rated {
        padding: 3px 7px;
        font-size: 10px;
      }
```

Do not add a second line or hide rating content unless the test proves the single-line layout cannot hold.

- [ ] **Step 4: Run the targeted tests and then the full suite**

Run:

```powershell
$line = (cmd /c netstat -ano ^| findstr /R /C:"127.0.0.1:4173 .*LISTENING" | Select-Object -First 1)
if ($line) {
  $targetPid = ($line -split '\s+')[-1]
  Stop-Process -Id $targetPid -Force
}
cmd /c npx playwright test tests/api.spec.js tests/socks-product-list.spec.js --grep "keeps rating metadata in filtered product responses|keeps the rating band readable on a mobile viewport"
cmd /c npm test
```

Expected:

```text
Targeted tests pass
All Playwright tests pass
```

- [ ] **Step 5: Commit**

```powershell
git add socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "test: verify product rating enhancement"
```

## Self-Review

- Spec coverage:
  - 数据字段扩展: Task 1
  - 商品卡评分区布局与视觉规则: Task 2
  - `Top rated` 条件显示: Task 2
  - 移动端可读性与单行控制: Task 3
  - 接口与前端测试补充: Tasks 1-3
- Placeholder scan:
  - No `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency:
  - Shared keys stay consistent across data, API tests, and UI rendering: `ratingValue`, `reviewCount`, `isTopRated`.

# Socks Breadcrumb Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realistic breadcrumb and source-copy UI to the socks storefront so detail and order views better explain where the user came from and where they can go back.

**Architecture:** Keep the feature inside `socks-product-list.html` and reuse the existing navigation context (`filter`, `sort`, `storefrontHref`) rather than adding new routes or backend APIs. Build the feature in two UI slices: detail-page source/breadcrumb rendering and order-page source summary rendering, both covered by Playwright regressions.

**Tech Stack:** Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: render breadcrumb/source copy in detail and order views, add copy-formatting helpers, and wire source actions to existing navigation context.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify detail breadcrumb/source states and order-page source summary states.

## Shared Rules

- Do not add new HTML entry files or backend endpoints.
- Breadcrumb stays lightweight: `首页 / 袜子专区 / 分类可选 / 商品名`.
- Detail view only shows the strong `Back to results for ...` source bar when valid source context exists.
- Order view always shows a source summary block, but falls back to default storefront copy when no source context exists.
- Current product node in breadcrumb remains plain text.

## Tasks

### Task 1: Add Failing Source-Copy Tests

**Files:**
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing detail-with-context test**

Add this test near the existing detail navigation coverage:

```js
test("shows source copy and breadcrumb on the detail page when storefront context exists", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  await expect(page.locator("[data-detail-source-link]")).toContainText("Back to results for 运动袜");
  await expect(page.locator("[data-detail-source-link]")).toHaveAttribute("href", "/socks-product-list.html?filter=sport&sort=price-desc");
  await expect(page.locator("[data-detail-sort-copy]")).toHaveText("当前排序：价格从高到低");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("首页");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("袜子专区");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("运动袜");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("轻压运动袜");
});
```

- [ ] **Step 2: Write the failing detail-without-context test**

Add this test after the previous one:

```js
test("falls back to a simplified breadcrumb on the detail page when no storefront context exists", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-05");

  await expect(page.locator("[data-detail-source-link]")).toHaveCount(0);
  await expect(page.locator("[data-detail-sort-copy]")).toHaveCount(0);
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("首页");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("袜子专区");
  await expect(page.locator("[data-detail-breadcrumb]")).toContainText("通勤罗口袜");
});
```

- [ ] **Step 3: Write the failing order source-summary tests**

Add two order-view tests near the existing order page coverage:

```js
test("shows last-results source copy on the order page when storefront context exists", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43-45", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await page.getByRole("button", { name: "Proceed to checkout" }).click();
  await page.getByRole("button", { name: "View order page" }).click();

  await expect(page.locator("[data-order-source-title]")).toHaveText("Go back to your last results");
  await expect(page.locator("[data-order-source-copy]")).toContainText("袜子专区");
  await expect(page.locator("[data-order-source-copy]")).toContainText("运动袜");
  await expect(page.locator("[data-order-source-copy]")).toContainText("价格从高到低");
});

test("shows default storefront source copy on the order page when storefront context is missing", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=order");

  await expect(page.locator("[data-order-source-title]")).toHaveText("Continue shopping in storefront");
  await expect(page.locator("[data-order-source-copy]")).toHaveText("袜子专区 / 全部商品");
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "shows source copy and breadcrumb on the detail page when storefront context exists|falls back to a simplified breadcrumb on the detail page when no storefront context exists|shows last-results source copy on the order page when storefront context exists|shows default storefront source copy on the order page when storefront context is missing"
```

Expected: FAIL because the new source-copy selectors and text do not exist yet.

- [ ] **Step 5: Commit the red test state**

```bash
git add tests/socks-product-list.spec.js
git commit -m "test: cover breadcrumb source copy"
```

### Task 2: Implement Detail Breadcrumb and Source Copy

**Files:**
- Modify: `socks-product-list.html`

- [ ] **Step 1: Add label-formatting helpers**

Place these helpers near the existing navigation-context helpers:

```js
function getFilterLabel(filterValue) {
  return {
    all: "全部商品",
    sport: "运动袜",
    daily: "日常袜",
    crew: "中筒袜",
    "no-show": "船袜"
  }[filterValue] || "全部商品";
}

function getSortLabel(sortValue) {
  return {
    recommended: "推荐",
    "price-asc": "价格从低到高",
    "price-desc": "价格从高到低",
    newest: "最新上架"
  }[sortValue] || "推荐";
}

function hasStorefrontSourceContext() {
  return navigationContext.filter !== FILTER_KEY.ALL || navigationContext.sort !== SORT_KEY.RECOMMENDED;
}
```

- [ ] **Step 2: Add breadcrumb/source markup helpers**

Add focused render helpers before `createDetailPagePanelMarkup`:

```js
function createDetailBreadcrumbMarkup(product, filterValue) {
  const segments = ["首页", "袜子专区"];

  if (filterValue && filterValue !== FILTER_KEY.ALL) {
    segments.push(getFilterLabel(filterValue));
  }

  segments.push(product.title);

  return `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb" data-detail-breadcrumb>
      ${segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return `<span class="detail-breadcrumb__segment${isLast ? " is-current" : ""}">${segment}</span>`;
      }).join('<span class="detail-breadcrumb__divider">/</span>')}
    </nav>
  `;
}

function createDetailSourceMarkup(product) {
  const filterValue = getRequestedFilter();
  const sortValue = getRequestedSort();
  const hasExplicitContext = hasExplicitStorefrontContextInUrl();
  const breadcrumbMarkup = createDetailBreadcrumbMarkup(product, hasExplicitContext ? filterValue : FILTER_KEY.ALL);

  if (!hasExplicitContext) {
    return `
      <div class="detail-source detail-source--compact">
        ${breadcrumbMarkup}
      </div>
    `;
  }

  return `
    <div class="detail-source">
      <a class="detail-source__link" href="${getStorefrontHref(filterValue, sortValue)}" data-detail-source-link>
        Back to results for ${getFilterLabel(filterValue)}
      </a>
      <p class="detail-source__sort" data-detail-sort-copy>当前排序：${getSortLabel(sortValue)}</p>
      ${breadcrumbMarkup}
    </div>
  `;
}
```

- [ ] **Step 3: Add the detail source block to the detail layout**

Update `createDetailPagePanelMarkup(product, options = {})` so the source block renders before the main two-column layout:

```js
const detailSourceMarkup = options.detailSourceMarkup || "";

return `
  <div class="detail-stack">
    ${detailSourceMarkup}
    <div class="detail-layout" data-detail-product-root data-product-id="${product.id}">
      ...
    </div>
    <div class="detail-sections">
      ...
    </div>
  </div>
`;
```

In `renderDetailPage()`, pass the new source markup:

```js
detailPagePanel.innerHTML = createDetailPagePanelMarkup(product, {
  previousProduct,
  nextProduct,
  detailSourceMarkup: createDetailSourceMarkup(product),
  recommendationsMarkup: createDetailRecommendationsMarkup(recommendedProducts)
});
```

- [ ] **Step 4: Add minimal CSS for source and breadcrumb**

Add styles near the existing detail-view CSS:

```css
.detail-stack {
  display: grid;
  gap: 18px;
}

.detail-source {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid #e7e7e7;
  border-radius: 18px;
  background: #fafafa;
}

.detail-source__link {
  color: #222222;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.detail-source__sort {
  margin: 0;
  color: #6b6b6b;
  font-size: 12px;
}

.detail-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #6b6b6b;
  font-size: 12px;
}

.detail-breadcrumb__segment.is-current {
  color: #111111;
  font-weight: 700;
}
```

- [ ] **Step 5: Run the detail source tests to verify they pass**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "shows source copy and breadcrumb on the detail page when storefront context exists|falls back to a simplified breadcrumb on the detail page when no storefront context exists"
```

Expected: PASS.

- [ ] **Step 6: Commit the detail source layer**

```bash
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add detail breadcrumb source copy"
```

### Task 3: Implement Order Source Summary and Final Verification

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Add order source-summary helper**

Add a focused helper near the order-page helpers:

```js
function createOrderSourceSummaryMarkup() {
  const hasSource = hasStorefrontSourceContext();
  const title = hasSource ? "Go back to your last results" : "Continue shopping in storefront";
  const parts = ["袜子专区"];

  if (hasSource && navigationContext.filter !== FILTER_KEY.ALL) {
    parts.push(getFilterLabel(navigationContext.filter));
  } else if (!hasSource) {
    parts.push("全部商品");
  }

  if (hasSource && navigationContext.sort !== SORT_KEY.RECOMMENDED) {
    parts.push(getSortLabel(navigationContext.sort));
  }

  return `
    <div class="order-source" data-order-source>
      <p class="order-source__title" data-order-source-title>${title}</p>
      <p class="order-source__copy" data-order-source-copy>${parts.join(" / ")}</p>
    </div>
  `;
}
```

- [ ] **Step 2: Wire the source summary into order summary and empty state**

Update `createOrderPageSummaryMarkup()`:

```js
const continueShoppingHref = getContinueShoppingHref();
const orderSourceMarkup = createOrderSourceSummaryMarkup();

return `
  <div class="order-stack">
    ...
    <div class="order-actions">
      ${orderSourceMarkup}
      <a class="order-button order-button--secondary" href="${continueShoppingHref}" data-order-continue-shopping>Continue shopping</a>
      <a class="order-button order-button--primary" href="${continueShoppingHref}">Back to storefront</a>
    </div>
  </div>
`;
```

Update `createOrderPageEmptyStateMarkup()` the same way:

```js
const continueShoppingHref = getContinueShoppingHref();

return `
  <div class="order-empty-state">
    ...
    ${createOrderSourceSummaryMarkup()}
    <div class="order-actions">
      <a class="order-button order-button--primary" href="${continueShoppingHref}" data-order-continue-shopping>Continue shopping</a>
    </div>
  </div>
`;
```

- [ ] **Step 3: Add minimal order source CSS**

Add styles near the existing order-view styles:

```css
.order-source {
  display: grid;
  gap: 4px;
  min-width: 220px;
  padding: 12px 14px;
  border: 1px solid #e8e8e8;
  border-radius: 16px;
  background: #fafafa;
}

.order-source__title {
  margin: 0;
  color: #111111;
  font-size: 13px;
  font-weight: 700;
}

.order-source__copy {
  margin: 0;
  color: #6b6b6b;
  font-size: 12px;
  line-height: 1.5;
}
```

- [ ] **Step 4: Run source-copy and navigation regressions**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "shows source copy and breadcrumb on the detail page when storefront context exists|falls back to a simplified breadcrumb on the detail page when no storefront context exists|shows last-results source copy on the order page when storefront context exists|shows default storefront source copy on the order page when storefront context is missing|returns from the order page to the latest storefront context|continue shopping falls back to the default storefront"
```

Expected: PASS.

- [ ] **Step 5: Run the full regression suite**

Run:

```bash
cmd /c npm test
```

Expected: PASS with 0 failures.

- [ ] **Step 6: Commit the completed breadcrumb/source enhancement**

```bash
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add breadcrumb source copy"
```

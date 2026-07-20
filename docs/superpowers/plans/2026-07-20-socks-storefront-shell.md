# Socks Storefront Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `socks-product-list.html` into a more complete storefront shell with a shared three-tier header, shared footer, storefront entry modules, and real product search that works across storefront, detail, and order views.

**Architecture:** Keep the single-entry multi-view architecture centered on `socks-product-list.html`. Extend `/api/products` with a locale-aware `q` search parameter, move storefront shell UI into shared rendering blocks, and preserve `filter` / `sort` / `q` across storefront, detail, cart, and order flows through URL helpers rather than introducing new pages.

**Tech Stack:** Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `server.js`
  Purpose: add `q` support to `/api/products` and search localized product fields.
- Modify: `data/products.json`
  Purpose: continue serving the localized product content structure used by the API.
- Modify: `tests/fixtures/test-data/products.json`
  Purpose: keep test fixture product data aligned with the app dataset.
- Modify: `socks-product-list.html`
  Purpose: add the shared storefront shell, shared footer, search state, URL helpers, and shell interactions across all views.
- Modify: `tests/api.spec.js`
  Purpose: verify locale-aware search behavior at the API layer.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify shared shell visibility, search behavior, storefront navigation, and no regressions across storefront, detail, and order views.

## Shared Rules

- Do not add new HTML entry files.
- Keep `socks-product-list.html` as the single routed storefront/detail/order page.
- Preserve current cart, detail, order, locale, breadcrumb, and source-copy flows.
- Search is limited to current socks product `title`, `description`, and `categoryLabel`.
- Search must work against localized API content, so Chinese UI searches Chinese strings and English UI searches English strings.
- Keep using UTF-8 and do not replace Chinese strings with `\uXXXX` escapes.

## Tasks

### Task 1: Add Failing Regression Tests For The Storefront Shell

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [x] **Step 1: Write the failing API search test**

Add a new API test near the existing product-response coverage:

```js
test("searches localized product fields with q and locale", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US&q=train");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 1,
    locale: "en-US",
    q: "train"
  });
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({
    id: "sock-04",
    title: "Quick-Dry Training Socks"
  });
});
```

- [x] **Step 2: Write the failing shared-shell visibility test**

Add a storefront shell test near the top-level page-shell coverage:

```js
test("renders the shared storefront shell on storefront, detail, and order views", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await expect(page.locator("[data-site-header]")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();
  await expect(page.locator("[data-site-search-form]")).toBeVisible();

  await page.goto("/socks-product-list.html?view=detail&id=sock-02");
  await expect(page.locator("[data-site-header]")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();

  await page.goto("/socks-product-list.html?view=order");
  await expect(page.locator("[data-site-header]")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();
});
```

- [x] **Step 3: Write the failing storefront search test**

Add a storefront search-flow test after the existing filter/sort tests:

```js
test("submits q through the shared header search and filters the storefront results", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  const searchResponsePromise = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === "/api/products"
      && requestUrl.searchParams.get("q") === "运动"
      && requestUrl.searchParams.get("filter") === "all"
      && requestUrl.searchParams.get("sort") === "recommended";
  });

  await page.locator("[data-site-search-input]").fill("运动");
  await page.locator("[data-site-search-submit]").click();
  expect((await searchResponsePromise).ok()).toBe(true);

  await expect(page).toHaveURL(/q=%E8%BF%90%E5%8A%A8/);
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
});
```

- [x] **Step 4: Write the failing cross-view search-return tests**

Add one detail-view search test and one order-view search test:

```js
test("submits shared header search from detail view back into storefront results", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  await page.locator("[data-site-search-input]").fill("crew");
  await page.locator("[data-site-search-submit]").click();

  await expect(page).toHaveURL(/\/socks-product-list\.html\?q=crew/);
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(page.locator("[data-product-card]").first()).toContainText("极简中筒袜");
});

test("submits shared header search from order view back into storefront results", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=order");

  await page.locator("[data-site-search-input]").fill("ship");
  await page.locator("[data-site-search-submit]").click();

  await expect(page).toHaveURL(/\/socks-product-list\.html\?q=ship/);
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
});
```

- [x] **Step 5: Run the new tests to verify they fail**

Run:

```bash
cmd /c npx playwright test tests/api.spec.js tests/socks-product-list.spec.js --grep "searches localized product fields with q and locale|renders the shared storefront shell|submits q through the shared header search|submits shared header search from detail view|submits shared header search from order view"
```

Expected: FAIL because `/api/products` does not yet accept `q`, the shared header/footer do not exist, and cross-view search navigation is not wired.

### Task 2: Add Locale-Aware Product Search To The API

**Files:**
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [x] **Step 1: Add a query normalizer for search input**

Add a helper near the existing locale/filter/sort helpers:

```js
function normalizeQuery(queryValue) {
  return typeof queryValue === "string" ? queryValue.trim() : "";
}
```

- [x] **Step 2: Add localized field matching**

Extend product payload generation with a search matcher:

```js
function matchesProductQuery(product, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    product.title,
    product.description,
    product.categoryLabel
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}
```

- [x] **Step 3: Filter localized items before sorting response output**

Update `getProductsPayload(...)` so it accepts `queryValue`, localizes items first, then filters them:

```js
function getProductsPayload(products, filterValue, sortValue, localeValue, queryValue) {
  const filter = validFilters.has(filterValue) ? filterValue : "all";
  const sort = validSorts.has(sortValue) ? sortValue : "recommended";
  const locale = normalizeLocale(localeValue);
  const q = normalizeQuery(queryValue);
  const filteredByCategory = filter === "all"
    ? [...products]
    : products.filter((product) => product.categoryKey === filter);
  const localizedItems = filteredByCategory.map((product) => localizeProduct(product, locale));
  const items = localizedItems.filter((product) => matchesProductQuery(product, q));
  ...
}
```

- [x] **Step 4: Return `q` in response metadata only when present**

Update the meta block:

```js
const payloadMeta = {
  filter,
  sort,
  count: items.length
};

if (localeValue) {
  payloadMeta.locale = locale;
}

if (q) {
  payloadMeta.q = q;
}
```

- [x] **Step 5: Pass `q` through the `/api/products` route**

Update the route invocation:

```js
const payload = getProductsPayload(
  products,
  requestUrl.searchParams.get("filter"),
  requestUrl.searchParams.get("sort"),
  requestUrl.searchParams.get("locale"),
  requestUrl.searchParams.get("q")
);
```

- [x] **Step 6: Run the API tests to verify they pass**

Run:

```bash
cmd /c npx playwright test tests/api.spec.js
```

Expected: PASS, including the new localized search test.

### Task 3: Add Shared Query-State Helpers To The Unified Frontend Page

**Files:**
- Modify: `socks-product-list.html`

- [x] **Step 1: Add a shared query state**

Near the existing filter/sort state:

```js
let activeQuery = "";
```

- [x] **Step 2: Add URL helpers for `q`**

Add helpers near the existing URL/query helpers:

```js
function getRequestedQuery() {
  const rawValue = getSearchParams().get("q");
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function appendStorefrontQueryParams(params, options = {}) {
  if (options.filter && options.filter !== FILTER_KEY.ALL) {
    params.set("filter", options.filter);
  }

  if (options.sort && options.sort !== SORT_KEY.RECOMMENDED) {
    params.set("sort", options.sort);
  }

  if (options.q) {
    params.set("q", options.q);
  }

  return params;
}
```

- [x] **Step 3: Update storefront/detail href builders to preserve `q`**

Refactor storefront/detail URL generation:

```js
function getStorefrontHref(filterValue = FILTER_KEY.ALL, sortValue = SORT_KEY.RECOMMENDED, queryValue = "") {
  const params = appendStorefrontQueryParams(new URLSearchParams(), {
    filter: filterValue,
    sort: sortValue,
    q: queryValue
  });

  return params.toString() ? `${STOREFRONT_PATH}?${params.toString()}` : STOREFRONT_PATH;
}
```

Also update `getContextualDetailHref`, `getActiveDetailHref`, and any order/source-return helper to carry `q`.

- [x] **Step 4: Sync `activeQuery` from the URL**

Update the active-state sync function:

```js
function syncActiveStateFromUrl() {
  activeFilter = getRequestedFilter();
  activeSort = getRequestedSort();
  activeQuery = getRequestedQuery();
}
```

- [x] **Step 5: Pass `q` through all product fetches**

Update both shared fetch helpers:

```js
const params = new URLSearchParams({
  filter: filterValue,
  sort: sortValue,
  locale: activeLocale
});

if (activeQuery) {
  params.set("q", activeQuery);
}
```

For `fetchProductsForState`, accept an optional query override instead of always using global state.

- [x] **Step 6: Re-run the failing search tests**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "submits q through the shared header search|submits shared header search from detail view|submits shared header search from order view"
```

Expected: still FAIL because the shared shell UI and search form do not exist yet, but request/state helpers are now in place.

### Task 4: Add The Shared Three-Tier Header And Shared Footer

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [x] **Step 1: Add shared shell markup around the existing page views**

Add top-level shell containers:

```html
<header class="site-header" data-site-header>
  <div class="site-header__utility" data-site-utility-bar></div>
  <div class="site-header__main" data-site-main-header></div>
  <nav class="site-header__nav" data-site-channel-nav></nav>
</header>

<main class="page-shell">
  <div class="page">
    ...
  </div>
</main>

<footer class="site-footer" data-site-footer></footer>
```

- [x] **Step 2: Add the shared search form markup**

Inside the main header add:

```html
<form class="site-search" data-site-search-form>
  <label class="sr-only" for="site-search-input">Search socks</label>
  <input id="site-search-input" class="site-search__input" data-site-search-input>
  <button type="submit" class="site-search__submit" data-site-search-submit>Search</button>
</form>
```

- [x] **Step 3: Add storefront-shell CSS blocks**

Add CSS for:

- `.site-header`
- `.site-header__utility`
- `.site-header__main`
- `.site-header__nav`
- `.site-search`
- `.site-footer`
- `.storefront-entry-grid`

Keep the palette black/white/gray and raise information density without copying Amazon colors.

- [x] **Step 4: Add static shell render helpers**

Add rendering helpers:

```js
function renderHeaderCopy() {
  ...
}

function renderFooterCopy() {
  ...
}
```

Use the existing i18n system for:

- utility-bar copy
- search placeholder
- account / orders / cart labels
- channel-nav labels
- footer help columns

- [x] **Step 5: Make shell rendering part of initial page render and locale rerender**

Call shell renderers inside:

```js
renderStaticCopy();
renderLocaleControls();
renderShellCopy();
```

and ensure the current locale refreshes shell copy on toggle.

- [x] **Step 6: Run the shared-shell visibility test**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "renders the shared storefront shell"
```

Expected: PASS.

### Task 5: Add Real Search Submission And Storefront Entry Modules

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [x] **Step 1: Add storefront-only entry modules above the hero**

Render a storefront-only block:

```html
<section class="storefront-entry-grid" data-storefront-entry-grid>
  ...
</section>
```

Populate it with:

- category cards wired to `filter`
- search prompts wired to `q`
- deal / best-seller shortcuts mapped to existing socks filters or query presets

- [x] **Step 2: Bind shared header search submission**

Add a search submit handler:

```js
siteSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextQuery = siteSearchInput.value.trim();
  const nextHref = getStorefrontHref(activeFilter, activeSort, nextQuery);
  window.location.href = nextHref;
});
```

- [x] **Step 3: Bind top navigation chips to existing filter state**

Each nav item should route to storefront with shared state:

```js
function getChannelHref(filterValue) {
  return getStorefrontHref(filterValue, activeSort, activeQuery);
}
```

Clicking from detail/order should return to storefront results instead of mutating the in-place detail/order view.

- [x] **Step 4: Keep the search input in sync with `activeQuery`**

In shell rendering:

```js
siteSearchInput.value = activeQuery;
siteSearchInput.placeholder = t("shell.searchPlaceholder");
```

- [x] **Step 5: Run the targeted storefront search and navigation tests**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "submits q through the shared header search|top navigation|renders the shared storefront shell"
```

Expected: PASS for storefront search and shared shell tests.

### Task 6: Preserve Search Context Through Detail, Order, And Existing Navigation Flows

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [x] **Step 1: Preserve `q` in detail and order return links**

Update:

- detail back links
- breadcrumb/source links
- order continue-shopping links
- cart item detail links

so they use the new `getStorefrontHref(..., queryValue)` helpers.

- [x] **Step 2: Make detail and order shell search submit back into storefront**

Do not special-case by view. The shared header search should always build a storefront URL and navigate there.

- [x] **Step 3: Update any recommendation and context fetches to use query-aware storefront state where appropriate**

For context-sensitive product lists, carry `q` only when the UX should preserve the current storefront slice. Keep recommendations independent if the current design intends them to be broad.

- [x] **Step 4: Run the targeted cross-view tests**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "submits shared header search from detail view|submits shared header search from order view|breadcrumb|returns from the order page"
```

Expected: PASS without breaking existing storefront-return logic.

### Task 7: Full Verification

**Files:**
- Modify: `server.js`
- Modify: `socks-product-list.html`
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [x] **Step 1: Run the focused API and storefront-shell suites**

Run:

```bash
cmd /c npx playwright test tests/api.spec.js tests/socks-product-list.spec.js tests/socks-order-confirmation.spec.js
```

Expected: PASS with 0 failures.

- [x] **Step 2: Run the full Playwright suite**

Run:

```bash
cmd /c npx playwright test
```

Expected: PASS with 0 failures.

- [x] **Step 3: Review dirty-worktree impact before any feature commit**

Run:

```bash
git status --short
```

Expected: only intended storefront-shell files are newly modified for this feature; unrelated user changes remain untouched.

- [ ] **Step 4: Commit the completed storefront-shell feature**

```bash
git add server.js data/products.json tests/fixtures/test-data/products.json socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: add storefront shell and search"
```

# Socks Navigation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen storefront navigation so detail recommendations, cart drawer items, and the order page all keep users moving through the same browsing flow.

**Architecture:** Keep all navigation inside `socks-product-list.html` and extend the existing query-param routing with a small front-end navigation-context snapshot. Use that shared context to generate detail links from recommendation cards and cart drawer items, and to send users from the order page back to the most recent storefront state.

**Tech Stack:** Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: add lightweight navigation-context helpers, cart drawer detail links, and order-page continue-shopping link generation.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: cover preserved detail recommendation context, cart-drawer product-detail jumps, and order-page continue-shopping behavior.

## Shared Rules

- Do not add new HTML entry files or new backend endpoints.
- Detail URLs stay on `/socks-product-list.html?view=detail&id=<productId>`.
- Storefront return URLs continue to use the existing `filter` / `sort` omission rules.
- Cart drawer detail jumps should use the current page context first, then stored storefront context, then a default detail URL.
- Order-page continue-shopping should prefer the stored storefront return URL and fall back to `/socks-product-list.html`.

## Tasks

### Task 1: Add Failing Navigation Regression Tests

**Files:**
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing recommendation-context test**

Add a test near the existing detail navigation coverage:

```js
test("keeps detail recommendation links inside the current filter and sort context", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=detail&id=sock-02&filter=sport&sort=price-desc");

  const recommendationCard = page.locator("[data-detail-recommendation-card]").first();
  await expect(recommendationCard).toHaveAttribute(
    "href",
    "/socks-product-list.html?view=detail&id=sock-01&filter=sport&sort=price-desc"
  );

  await recommendationCard.click();

  await expect(page).toHaveURL(
    /\/socks-product-list\.html\?view=detail&id=sock-01&filter=sport&sort=price-desc$/
  );
});
```

- [ ] **Step 2: Write the failing cart-drawer detail-link test**

Add a drawer navigation test after the existing drawer open-state coverage:

```js
test("opens a cart drawer item in the detail view while keeping storefront context", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=daily&sort=price-asc");
  await page.getByRole("button", { name: "打开购物车" }).click();

  const detailLink = page.locator("[data-cart-item-detail-link]").first();
  await expect(detailLink).toHaveAttribute(
    "href",
    "/socks-product-list.html?view=detail&id=sock-05&filter=daily&sort=price-asc"
  );

  await detailLink.click();

  await expect(page).toHaveURL(
    /\/socks-product-list\.html\?view=detail&id=sock-05&filter=daily&sort=price-asc$/
  );
  await expect(page.locator("[data-detail-page-title]")).toHaveText("通勤罗口袜");
});
```

- [ ] **Step 3: Write the failing order-page continue-shopping test**

Add an order-view navigation test after the existing order page and checkout coverage:

```js
test("returns from the order page to the latest storefront context", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-02", size: "43-45", quantity: 1 }]
  }, null, 2)}\n`, "utf8");

  await page.goto("/socks-product-list.html?filter=sport&sort=price-desc");
  await page.getByRole("button", { name: "打开购物车" }).click();
  await page.getByRole("button", { name: "Proceed to checkout" }).click();
  await page.getByRole("button", { name: "View order page" }).click();

  const continueShoppingLink = page.locator("[data-order-continue-shopping]");
  await expect(continueShoppingLink).toHaveAttribute("href", "/socks-product-list.html?filter=sport&sort=price-desc");

  await continueShoppingLink.click();

  await expect(page).toHaveURL(/\/socks-product-list\.html\?filter=sport&sort=price-desc$/);
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "recommendation links inside the current filter and sort context|cart drawer item in the detail view|returns from the order page to the latest storefront context"
```

Expected: FAIL because the current UI does not expose `data-cart-item-detail-link` or `data-order-continue-shopping`, and recommendation links still use only active globals.

- [ ] **Step 5: Commit the red test state**

```bash
git add tests/socks-product-list.spec.js
git commit -m "test: cover storefront navigation flow"
```

### Task 2: Add Shared Navigation Context Helpers

**Files:**
- Modify: `socks-product-list.html`

- [ ] **Step 1: Add a small navigation-context state shape**

Near the existing order confirmation state, add a dedicated front-end navigation snapshot:

```js
const NAVIGATION_CONTEXT_STORAGE_KEY = "demoNavigationContext";
let navigationContext = {
  storefrontHref: STOREFRONT_PATH,
  filter: FILTER_KEY.ALL,
  sort: SORT_KEY.RECOMMENDED
};
```

- [ ] **Step 2: Add context read/write helpers**

Place these helpers near the existing order-confirmation storage helpers:

```js
function readStoredNavigationContext() {
  const rawValue = window.sessionStorage.getItem(NAVIGATION_CONTEXT_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      storefrontHref: typeof parsed.storefrontHref === "string" ? parsed.storefrontHref : STOREFRONT_PATH,
      filter: isValidFilter(parsed.filter) ? parsed.filter : FILTER_KEY.ALL,
      sort: isValidSort(parsed.sort) ? parsed.sort : SORT_KEY.RECOMMENDED
    };
  } catch (error) {
    return null;
  }
}

function saveNavigationContext(snapshot) {
  window.sessionStorage.setItem(
    NAVIGATION_CONTEXT_STORAGE_KEY,
    JSON.stringify(snapshot)
  );
}
```

- [ ] **Step 3: Add context synchronisation and href helpers**

Add explicit helpers for storefront and detail navigation:

```js
function syncNavigationContext(filterValue = activeFilter, sortValue = activeSort) {
  navigationContext = {
    storefrontHref: getStorefrontHref(filterValue, sortValue),
    filter: filterValue,
    sort: sortValue
  };

  saveNavigationContext(navigationContext);
}

function getContextualDetailHref(productId, options = {}) {
  const filterValue = options.filter ?? navigationContext.filter ?? FILTER_KEY.ALL;
  const sortValue = options.sort ?? navigationContext.sort ?? SORT_KEY.RECOMMENDED;
  const params = new URLSearchParams({
    view: DETAIL_VIEW_KEY,
    id: productId
  });

  if (filterValue !== FILTER_KEY.ALL) {
    params.set("filter", filterValue);
  }

  if (sortValue !== SORT_KEY.RECOMMENDED) {
    params.set("sort", sortValue);
  }

  return `${STOREFRONT_PATH}?${params.toString()}`;
}

function getContinueShoppingHref() {
  return navigationContext.storefrontHref || STOREFRONT_PATH;
}
```

- [ ] **Step 4: Initialize and refresh the context in route entry points**

Update the existing route setup so the latest storefront state is remembered:

```js
function syncActiveStateFromUrl() {
  activeFilter = getRequestedFilter();
  activeSort = getRequestedSort();
}

function initializeNavigationContext() {
  navigationContext = readStoredNavigationContext() || {
    storefrontHref: getStorefrontHref(),
    filter: FILTER_KEY.ALL,
    sort: SORT_KEY.RECOMMENDED
  };
}
```

Then call:

```js
initializeNavigationContext();
```

before initial rendering, and:

```js
syncNavigationContext(activeFilter, activeSort);
```

inside storefront rendering and before routing into the order view after checkout.

- [ ] **Step 5: Run the targeted tests to verify partial progress**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "recommendation links inside the current filter and sort context|cart drawer item in the detail view|returns from the order page to the latest storefront context"
```

Expected: still FAIL because the UI markup has not been updated yet, but href helpers should now be ready.

- [ ] **Step 6: Commit the helper layer**

```bash
git add socks-product-list.html
git commit -m "feat: add storefront navigation context"
```

### Task 3: Wire Recommendation, Drawer, and Order Links to the Shared Context

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Update detail recommendation links to use the contextual helper**

Replace the current recommendation-card href generation:

```js
<a
  class="detail-recommendation-card"
  href="${getContextualDetailHref(product.id, {
    filter: getRequestedFilter(),
    sort: getRequestedSort()
  })}"
  data-detail-recommendation-card
>
```

- [ ] **Step 2: Add cart drawer detail links**

Extend `createCartItemMarkup(item)` so valid products expose a detail jump:

```js
const detailHref = product ? getContextualDetailHref(product.id) : "";
const detailLinkMarkup = product
  ? `<a class="cart-drawer__item-link" href="${detailHref}" data-cart-item-detail-link>查看商品</a>`
  : "";
```

Render it inside the item actions:

```js
<div class="cart-drawer__item-actions">
  <div class="cart-drawer__qty-controls">
    ...
  </div>
  <div class="cart-drawer__item-secondary-actions">
    ${detailLinkMarkup}
    <button class="cart-drawer__remove" type="button" ...>移除</button>
  </div>
</div>
```

- [ ] **Step 3: Add order-page continue-shopping links**

Update both order page states to use the stored storefront return URL:

```js
function createOrderPageSummaryMarkup(order, recommendationsMarkup) {
  const continueShoppingHref = getContinueShoppingHref();

  return `
    ...
    <div class="order-actions">
      <a
        class="order-button order-button--secondary"
        href="${continueShoppingHref}"
        data-order-continue-shopping
      >
        Continue shopping
      </a>
      <a class="order-button order-button--primary" href="${STOREFRONT_PATH}">Back to storefront</a>
    </div>
  `;
}
```

Use the same `continueShoppingHref` in the empty-state action if you want a single consistent recovery path.

- [ ] **Step 4: Make sure checkout preserves the latest storefront origin**

Before rendering the order confirmation state after checkout, persist the current storefront context:

```js
function rememberStorefrontOriginForCheckout() {
  syncNavigationContext(activeFilter, activeSort);
}
```

Call it immediately before switching to `?view=order` or rendering the drawer confirmation that links there.

- [ ] **Step 5: Run the targeted tests to verify they pass**

Run:

```bash
cmd /c npx playwright test tests/socks-product-list.spec.js --grep "recommendation links inside the current filter and sort context|cart drawer item in the detail view|returns from the order page to the latest storefront context"
```

Expected: PASS for all 3 tests.

- [ ] **Step 6: Run the full regression suite**

First clear any stale listener on port `4173`, then run:

```bash
cmd /c npm test
```

Expected: PASS with 0 failures.

- [ ] **Step 7: Commit the completed navigation-flow enhancement**

```bash
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: improve storefront navigation flow"
```

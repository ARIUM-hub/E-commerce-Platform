# Socks Product List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `socks-product-list.html` page that turns the existing single socks card style into a complete socks-category listing page with a title area, category filters, sorting controls, result count, responsive product grid, and per-card interactions.

**Architecture:** Keep the new list page self-contained in one HTML file so it can be opened directly in a browser without a build step. Add a dedicated Playwright test file for the list page instead of overloading the existing single-card test, so the single-card demo and the new list page stay independently verifiable.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js, npm, Playwright

---

## File Structure

- Create: `socks-product-list.html`
  Purpose: the complete socks-category listing page, including layout, static product data, filtering, sorting, card rendering, and per-card interactions.
- Create: `tests/socks-product-list.spec.js`
  Purpose: verify the new list page shell, product rendering, category filters, sorting behavior, result count updates, and per-card interaction independence.
- Keep unchanged: `socks-product-card.html`
  Purpose: preserve the existing single-card demo as-is.
- Keep unchanged: `tests/socks-product-card.spec.js`
  Purpose: preserve the existing single-card regression suite.

### Task 1: Create the list page shell and base page test

**Files:**
- Create: `socks-product-list.html`
- Create: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing test**

Create `tests/socks-product-list.spec.js`:

```js
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const previewPath = path.resolve(__dirname, "..", "socks-product-list.html");
const previewUrl = pathToFileURL(previewPath).href;

test("renders the socks category page shell", async ({ page }) => {
  await page.goto(previewUrl);

  await expect(page.getByRole("heading", { name: "袜子专区" })).toBeVisible();
  await expect(page.locator("[data-toolbar]")).toBeVisible();
  await expect(page.locator("[data-filter='全部']")).toBeVisible();
  await expect(page.locator("[data-sort='推荐']")).toBeVisible();
  await expect(page.locator("[data-result-count]")).toBeVisible();
  await expect(page.locator("[data-product-grid]")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- --grep "socks category page shell"
```

Expected:

```text
FAIL tests/socks-product-list.spec.js
Error: page.goto: net::ERR_FILE_NOT_FOUND
```

- [ ] **Step 3: Write minimal implementation**

Create `socks-product-list.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>袜子专区</title>
  <style>
    :root {
      --bg-start: #f6f6f6;
      --bg-end: #ececec;
      --surface: #ffffff;
      --text-main: #111111;
      --text-subtle: #666666;
      --line: #dddddd;
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
      --radius-panel: 28px;
      --radius-pill: 999px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      padding: 32px 20px 48px;
      background: linear-gradient(180deg, var(--bg-start) 0%, var(--bg-end) 100%);
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text-main);
    }

    .page {
      width: min(1180px, 100%);
      margin: 0 auto;
    }

    .hero {
      margin-bottom: 20px;
      padding: 28px;
      border: 1px solid #ebebeb;
      border-radius: var(--radius-panel);
      background: rgba(255, 255, 255, 0.86);
      box-shadow: var(--shadow);
    }

    .hero__eyebrow {
      margin: 0 0 10px;
      color: #7a7a7a;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .hero__title {
      margin: 0 0 10px;
      font-size: clamp(34px, 5vw, 52px);
      line-height: 1.05;
    }

    .hero__description {
      margin: 0;
      max-width: 620px;
      color: var(--text-subtle);
      line-height: 1.7;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      padding: 18px 20px;
      border: 1px solid #ebebeb;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.05);
    }

    .toolbar__group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .toolbar__label {
      color: #7a7a7a;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .toolbar__chip {
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      padding: 10px 14px;
      background: #ffffff;
      color: #333333;
      font: inherit;
    }

    .toolbar__chip.is-active {
      border-color: #111111;
      background: #111111;
      color: #ffffff;
    }

    .toolbar__result {
      color: #666666;
      font-size: 14px;
    }

    .product-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    @media (max-width: 960px) {
      .product-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      body {
        padding-inline: 14px;
      }

      .toolbar {
        align-items: flex-start;
      }

      .product-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <p class="hero__eyebrow">Cotton Daily</p>
      <h1 class="hero__title">袜子专区</h1>
      <p class="hero__description">精选黑白灰日常袜、运动袜与轻量通勤款，延续简约电商风格，专注舒适穿着与基础百搭感。</p>
    </section>

    <section class="toolbar" data-toolbar>
      <div class="toolbar__group">
        <span class="toolbar__label">分类</span>
        <button class="toolbar__chip is-active" type="button" data-filter="全部">全部</button>
      </div>
      <div class="toolbar__group">
        <span class="toolbar__label">排序</span>
        <button class="toolbar__chip is-active" type="button" data-sort="推荐">推荐</button>
      </div>
      <p class="toolbar__result" data-result-count>共 0 件商品</p>
    </section>

    <section class="product-grid" data-product-grid></section>
  </main>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- --grep "socks category page shell"
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add socks product list page shell"
```

Expected:

```text
[main ...] feat: add socks product list page shell
```

### Task 2: Render the responsive product grid with static socks data

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/socks-product-list.spec.js`:

```js
test("renders multiple socks cards in a three-column desktop grid", async ({ page }) => {
  await page.goto(previewUrl);

  const productCards = page.locator("[data-product-card]");
  await expect(productCards).toHaveCount(6);
  await expect(productCards.first().getByText("极简中筒袜")).toBeVisible();
  await expect(productCards.nth(1).getByText("轻压运动袜")).toBeVisible();

  const gridColumns = await page.locator("[data-product-grid]").evaluate((node) => {
    return window.getComputedStyle(node).gridTemplateColumns.split(" ").length;
  });

  expect(gridColumns).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- --grep "three-column desktop grid"
```

Expected:

```text
FAIL tests/socks-product-list.spec.js
Expected: 6
Received: 0
```

- [ ] **Step 3: Write minimal implementation**

Add these styles inside the existing `<style>` block in `socks-product-list.html`:

```html
    .product-card {
      overflow: hidden;
      background: var(--surface);
      border: 1px solid #ededed;
      border-radius: 28px;
      box-shadow: var(--shadow);
    }

    .product-card__media {
      position: relative;
      min-height: 252px;
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, #f5f5f5 0%, #e7e7e7 100%);
    }

    .product-card__badge {
      position: absolute;
      top: 18px;
      left: 18px;
      margin: 0;
      padding: 8px 12px;
      border-radius: 999px;
      background: #111111;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    .product-card__sock {
      width: 168px;
      height: 168px;
      border-radius: 32px;
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, #d9d9d9 52%, #b8b8b8 100%);
      display: grid;
      place-items: center;
      font-weight: 700;
      letter-spacing: 0.12em;
    }

    .product-card__content {
      padding: 22px;
    }

    .product-card__eyebrow {
      margin: 0 0 8px;
      color: #7a7a7a;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .product-card__title {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.15;
    }

    .product-card__description {
      margin: 0 0 18px;
      color: var(--text-subtle);
      font-size: 14px;
      line-height: 1.7;
    }

    .product-card__price {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 18px;
    }

    .product-card__price-current {
      font-size: 30px;
      font-weight: 800;
    }

    .product-card__price-original {
      color: #8a8a8a;
      font-size: 15px;
      text-decoration: line-through;
    }

    .product-card__sizes {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 18px;
    }

    .product-card__size,
    .product-card__button {
      font: inherit;
    }

    .product-card__size {
      border: 1px solid #cfcfcf;
      border-radius: 999px;
      padding: 10px 14px;
      background: #fff;
    }

    .product-card__size.is-selected {
      background: #111111;
      border-color: #111111;
      color: #ffffff;
    }

    .product-card__button {
      width: 100%;
      border: 0;
      border-radius: 16px;
      padding: 15px 16px;
      background: #111111;
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
    }
```

Replace the empty grid section and add a script before `</body>` in `socks-product-list.html`:

```html
    <section class="product-grid" data-product-grid></section>
  </main>

  <script>
    const products = [
      {
        id: "sock-01",
        eyebrow: "Cotton Daily",
        name: "极简中筒袜",
        category: "中筒袜",
        price: 39,
        originalPrice: 59,
        badge: "32% OFF",
        description: "柔软透气面料，适合日常通勤与居家穿着。",
        sizes: ["35-38", "39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-15",
      },
      {
        id: "sock-02",
        eyebrow: "Active Base",
        name: "轻压运动袜",
        category: "运动袜",
        price: 49,
        originalPrice: 69,
        badge: "29% OFF",
        description: "包裹感更强，适合慢跑和日常训练。",
        sizes: ["39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-14",
      },
      {
        id: "sock-03",
        eyebrow: "Daily Soft",
        name: "柔棉短袜",
        category: "日常袜",
        price: 25,
        originalPrice: 39,
        badge: "36% OFF",
        description: "低调百搭，适合夏季与日常轻松穿着。",
        sizes: ["35-38", "39-42"],
        isRecommended: false,
        createdAt: "2026-07-10",
      },
      {
        id: "sock-04",
        eyebrow: "Motion Fit",
        name: "速干训练袜",
        category: "运动袜",
        price: 45,
        originalPrice: 58,
        badge: "22% OFF",
        description: "快干面料帮助维持长时间训练舒适度。",
        sizes: ["39-42", "43-45"],
        isRecommended: false,
        createdAt: "2026-07-13",
      },
      {
        id: "sock-05",
        eyebrow: "City Basic",
        name: "通勤罗口袜",
        category: "日常袜",
        price: 35,
        originalPrice: 49,
        badge: "29% OFF",
        description: "更适合正装与通勤鞋型的基础搭配。",
        sizes: ["35-38", "39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-12",
      },
      {
        id: "sock-06",
        eyebrow: "Lite Step",
        name: "云感船袜",
        category: "船袜",
        price: 29,
        originalPrice: 42,
        badge: "31% OFF",
        description: "轻薄贴脚，适合浅口鞋与夏日轻装搭配。",
        sizes: ["35-38", "39-42"],
        isRecommended: false,
        createdAt: "2026-07-11",
      },
    ];

    const productGrid = document.querySelector("[data-product-grid]");

    function createCardMarkup(product) {
      const sizeButtons = product.sizes.map((size, index) => {
        return '<button class="product-card__size' + (index === 0 ? ' is-selected' : '') + '" type="button" aria-pressed="' + (index === 0 ? 'true' : 'false') + '" data-size>' + size + "</button>";
      }).join("");

      return `
        <article class="product-card" data-product-card data-product-id="${product.id}">
          <div class="product-card__media">
            <p class="product-card__badge">${product.badge}</p>
            <div class="product-card__sock" aria-hidden="true">SOCKS</div>
          </div>
          <div class="product-card__content">
            <p class="product-card__eyebrow">${product.eyebrow}</p>
            <h2 class="product-card__title">${product.name}</h2>
            <p class="product-card__description">${product.description}</p>
            <div class="product-card__price">
              <span class="product-card__price-current">¥${product.price}</span>
              <span class="product-card__price-original">¥${product.originalPrice}</span>
            </div>
            <div class="product-card__sizes">
              ${sizeButtons}
            </div>
            <button class="product-card__button" type="button" data-cart-button>加入购物车</button>
          </div>
        </article>
      `;
    }

    productGrid.innerHTML = products.map(createCardMarkup).join("");
  </script>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- --grep "three-column desktop grid"
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: render socks product grid"
```

Expected:

```text
[main ...] feat: render socks product grid
```

### Task 3: Add category filters, sorting, and live result count

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/socks-product-list.spec.js`:

```js
test("filters the list by category and updates the result count", async ({ page }) => {
  await page.goto(previewUrl);

  await page.getByRole("button", { name: "运动袜" }).click();

  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await expect(page.locator("[data-result-count]")).toHaveText("共 2 件商品");
  await expect(page.getByText("轻压运动袜")).toBeVisible();
  await expect(page.getByText("速干训练袜")).toBeVisible();
});

test("sorts the visible products by price from low to high", async ({ page }) => {
  await page.goto(previewUrl);

  await page.getByRole("button", { name: "价格从低到高" }).click();

  await expect(page.locator("[data-product-card]").first().getByText("柔棉短袜")).toBeVisible();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm test -- --grep "filters the list by category|sorts the visible products by price from low to high"
```

Expected:

```text
FAIL tests/socks-product-list.spec.js
Error: locator.click: strict mode violation or no element found
```

- [ ] **Step 3: Write minimal implementation**

Replace the toolbar section in `socks-product-list.html` with:

```html
    <section class="toolbar" data-toolbar>
      <div class="toolbar__group">
        <span class="toolbar__label">分类</span>
        <button class="toolbar__chip is-active" type="button" data-filter="全部">全部</button>
        <button class="toolbar__chip" type="button" data-filter="运动袜">运动袜</button>
        <button class="toolbar__chip" type="button" data-filter="日常袜">日常袜</button>
        <button class="toolbar__chip" type="button" data-filter="中筒袜">中筒袜</button>
        <button class="toolbar__chip" type="button" data-filter="船袜">船袜</button>
      </div>
      <div class="toolbar__group">
        <span class="toolbar__label">排序</span>
        <button class="toolbar__chip is-active" type="button" data-sort="推荐">推荐</button>
        <button class="toolbar__chip" type="button" data-sort="价格从低到高">价格从低到高</button>
        <button class="toolbar__chip" type="button" data-sort="价格从高到低">价格从高到低</button>
        <button class="toolbar__chip" type="button" data-sort="最新上架">最新上架</button>
      </div>
      <p class="toolbar__result" data-result-count>共 0 件商品</p>
    </section>
```

Replace the `<script>` block in `socks-product-list.html` with:

```html
  <script>
    const products = [
      {
        id: "sock-01",
        eyebrow: "Cotton Daily",
        name: "极简中筒袜",
        category: "中筒袜",
        price: 39,
        originalPrice: 59,
        badge: "32% OFF",
        description: "柔软透气面料，适合日常通勤与居家穿着。",
        sizes: ["35-38", "39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-15",
      },
      {
        id: "sock-02",
        eyebrow: "Active Base",
        name: "轻压运动袜",
        category: "运动袜",
        price: 49,
        originalPrice: 69,
        badge: "29% OFF",
        description: "包裹感更强，适合慢跑和日常训练。",
        sizes: ["39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-14",
      },
      {
        id: "sock-03",
        eyebrow: "Daily Soft",
        name: "柔棉短袜",
        category: "日常袜",
        price: 25,
        originalPrice: 39,
        badge: "36% OFF",
        description: "低调百搭，适合夏季与日常轻松穿着。",
        sizes: ["35-38", "39-42"],
        isRecommended: false,
        createdAt: "2026-07-10",
      },
      {
        id: "sock-04",
        eyebrow: "Motion Fit",
        name: "速干训练袜",
        category: "运动袜",
        price: 45,
        originalPrice: 58,
        badge: "22% OFF",
        description: "快干面料帮助维持长时间训练舒适度。",
        sizes: ["39-42", "43-45"],
        isRecommended: false,
        createdAt: "2026-07-13",
      },
      {
        id: "sock-05",
        eyebrow: "City Basic",
        name: "通勤罗口袜",
        category: "日常袜",
        price: 35,
        originalPrice: 49,
        badge: "29% OFF",
        description: "更适合正装与通勤鞋型的基础搭配。",
        sizes: ["35-38", "39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-12",
      },
      {
        id: "sock-06",
        eyebrow: "Lite Step",
        name: "云感船袜",
        category: "船袜",
        price: 29,
        originalPrice: 42,
        badge: "31% OFF",
        description: "轻薄贴脚，适合浅口鞋与夏日轻装搭配。",
        sizes: ["35-38", "39-42"],
        isRecommended: false,
        createdAt: "2026-07-11",
      },
    ];

    const productGrid = document.querySelector("[data-product-grid]");
    const resultCount = document.querySelector("[data-result-count]");
    const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
    const sortButtons = Array.from(document.querySelectorAll("[data-sort]"));
    let activeFilter = "全部";
    let activeSort = "推荐";

    function createCardMarkup(product) {
      const sizeButtons = product.sizes.map((size, index) => {
        return '<button class="product-card__size' + (index === 0 ? ' is-selected' : '') + '" type="button" aria-pressed="' + (index === 0 ? 'true' : 'false') + '" data-size>' + size + "</button>";
      }).join("");

      return `
        <article class="product-card" data-product-card data-product-id="${product.id}" data-product-price="${product.price}">
          <div class="product-card__media">
            <p class="product-card__badge">${product.badge}</p>
            <div class="product-card__sock" aria-hidden="true">SOCKS</div>
          </div>
          <div class="product-card__content">
            <p class="product-card__eyebrow">${product.eyebrow}</p>
            <h2 class="product-card__title">${product.name}</h2>
            <p class="product-card__description">${product.description}</p>
            <div class="product-card__price">
              <span class="product-card__price-current">¥${product.price}</span>
              <span class="product-card__price-original">¥${product.originalPrice}</span>
            </div>
            <div class="product-card__sizes">
              ${sizeButtons}
            </div>
            <button class="product-card__button" type="button" data-cart-button>加入购物车</button>
          </div>
        </article>
      `;
    }

    function getVisibleProducts() {
      const filtered = activeFilter === "全部"
        ? [...products]
        : products.filter((product) => product.category === activeFilter);

      if (activeSort === "价格从低到高") {
        return filtered.sort((a, b) => a.price - b.price);
      }

      if (activeSort === "价格从高到低") {
        return filtered.sort((a, b) => b.price - a.price);
      }

      if (activeSort === "最新上架") {
        return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return filtered.sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended));
    }

    function updateToolbarState(buttons, value, attributeName) {
      buttons.forEach((button) => {
        const isActive = button.dataset[attributeName] === value;
        button.classList.toggle("is-active", isActive);
      });
    }

    function renderProducts() {
      const visibleProducts = getVisibleProducts();
      productGrid.innerHTML = visibleProducts.map(createCardMarkup).join("");
      resultCount.textContent = `共 ${visibleProducts.length} 件商品`;
    }

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        updateToolbarState(filterButtons, activeFilter, "filter");
        renderProducts();
      });
    });

    sortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeSort = button.dataset.sort;
        updateToolbarState(sortButtons, activeSort, "sort");
        renderProducts();
      });
    });

    renderProducts();
  </script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
npm test -- --grep "filters the list by category|sorts the visible products by price from low to high"
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add list filters and sorting"
```

Expected:

```text
[main ...] feat: add list filters and sorting
```

### Task 4: Add per-card interactions and empty-state handling

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/socks-product-list.spec.js`:

```js
test("keeps size selection scoped to the clicked product card", async ({ page }) => {
  await page.goto(previewUrl);

  const firstCard = page.locator("[data-product-card]").first();
  const secondCard = page.locator("[data-product-card]").nth(1);

  await secondCard.getByRole("button", { name: "43-45" }).click();

  await expect(secondCard.getByRole("button", { name: "43-45" })).toHaveAttribute("aria-pressed", "true");
  await expect(secondCard.locator('.product-card__size[aria-pressed="true"]')).toHaveCount(1);
  await expect(firstCard.getByRole("button", { name: "35-38" })).toHaveAttribute("aria-pressed", "true");
});

test("shows cart feedback per card and restores it after the timer", async ({ page }) => {
  await page.clock.install();
  await page.goto(previewUrl);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));

  const firstButton = page.locator("[data-product-card]").first().locator("[data-cart-button]");
  const secondButton = page.locator("[data-product-card]").nth(1).locator("[data-cart-button]");

  await secondButton.click();

  await expect(secondButton).toHaveText("已加入购物车");
  await expect(firstButton).toHaveText("加入购物车");

  await page.clock.runFor(1500);
  await expect(secondButton).toHaveText("加入购物车");
});

test("shows an empty state when a filter has no products", async ({ page }) => {
  await page.goto(previewUrl);

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar__chip";
    button.dataset.filter = "商务袜";
    button.textContent = "商务袜";
    document.querySelector(".toolbar__group").appendChild(button);
    button.addEventListener("click", () => {
      window.__setFilterForTest("商务袜");
    });
  });

  await page.getByRole("button", { name: "商务袜" }).click();

  await expect(page.locator("[data-product-card]")).toHaveCount(0);
  await expect(page.locator("[data-empty-state]")).toHaveText("当前分类暂无商品");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm test -- --grep "keeps size selection scoped|shows cart feedback per card|shows an empty state"
```

Expected:

```text
FAIL tests/socks-product-list.spec.js
Expected string: "true"
Received string: "false"
```

- [ ] **Step 3: Write minimal implementation**

Add these styles inside the existing `<style>` block in `socks-product-list.html`:

```html
    .product-card {
      transition: transform 220ms ease, box-shadow 220ms ease;
    }

    .product-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.12);
    }

    .product-card__sock {
      transition: transform 220ms ease;
    }

    .product-card:hover .product-card__sock {
      transform: scale(1.05);
    }

    .product-card__size {
      cursor: pointer;
      transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
    }

    .product-card__size:hover {
      border-color: #111111;
    }

    .product-card__button {
      cursor: pointer;
      transition: transform 160ms ease, background-color 160ms ease;
    }

    .product-card__button:hover {
      background: #222222;
    }

    .product-card__button:active {
      transform: translateY(1px) scale(0.99);
    }

    .empty-state {
      padding: 44px 24px;
      border: 1px dashed #d7d7d7;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.78);
      text-align: center;
      color: #666666;
    }
```

Replace the `<script>` block in `socks-product-list.html` with:

```html
  <script>
    const products = [
      {
        id: "sock-01",
        eyebrow: "Cotton Daily",
        name: "极简中筒袜",
        category: "中筒袜",
        price: 39,
        originalPrice: 59,
        badge: "32% OFF",
        description: "柔软透气面料，适合日常通勤与居家穿着。",
        sizes: ["35-38", "39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-15",
      },
      {
        id: "sock-02",
        eyebrow: "Active Base",
        name: "轻压运动袜",
        category: "运动袜",
        price: 49,
        originalPrice: 69,
        badge: "29% OFF",
        description: "包裹感更强，适合慢跑和日常训练。",
        sizes: ["39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-14",
      },
      {
        id: "sock-03",
        eyebrow: "Daily Soft",
        name: "柔棉短袜",
        category: "日常袜",
        price: 25,
        originalPrice: 39,
        badge: "36% OFF",
        description: "低调百搭，适合夏季与日常轻松穿着。",
        sizes: ["35-38", "39-42"],
        isRecommended: false,
        createdAt: "2026-07-10",
      },
      {
        id: "sock-04",
        eyebrow: "Motion Fit",
        name: "速干训练袜",
        category: "运动袜",
        price: 45,
        originalPrice: 58,
        badge: "22% OFF",
        description: "快干面料帮助维持长时间训练舒适度。",
        sizes: ["39-42", "43-45"],
        isRecommended: false,
        createdAt: "2026-07-13",
      },
      {
        id: "sock-05",
        eyebrow: "City Basic",
        name: "通勤罗口袜",
        category: "日常袜",
        price: 35,
        originalPrice: 49,
        badge: "29% OFF",
        description: "更适合正装与通勤鞋型的基础搭配。",
        sizes: ["35-38", "39-42", "43-45"],
        isRecommended: true,
        createdAt: "2026-07-12",
      },
      {
        id: "sock-06",
        eyebrow: "Lite Step",
        name: "云感船袜",
        category: "船袜",
        price: 29,
        originalPrice: 42,
        badge: "31% OFF",
        description: "轻薄贴脚，适合浅口鞋与夏日轻装搭配。",
        sizes: ["35-38", "39-42"],
        isRecommended: false,
        createdAt: "2026-07-11",
      },
    ];

    const productGrid = document.querySelector("[data-product-grid]");
    const resultCount = document.querySelector("[data-result-count]");
    const filterButtons = () => Array.from(document.querySelectorAll("[data-filter]"));
    const sortButtons = Array.from(document.querySelectorAll("[data-sort]"));
    const cartTimers = new Map();
    let activeFilter = "全部";
    let activeSort = "推荐";

    function createCardMarkup(product) {
      const sizeButtons = product.sizes.map((size, index) => {
        return '<button class="product-card__size' + (index === 0 ? ' is-selected' : '') + '" type="button" aria-pressed="' + (index === 0 ? 'true' : 'false') + '" data-size>' + size + "</button>";
      }).join("");

      return `
        <article class="product-card" data-product-card data-product-id="${product.id}" data-product-price="${product.price}">
          <div class="product-card__media">
            <p class="product-card__badge">${product.badge}</p>
            <div class="product-card__sock" aria-hidden="true">SOCKS</div>
          </div>
          <div class="product-card__content">
            <p class="product-card__eyebrow">${product.eyebrow}</p>
            <h2 class="product-card__title">${product.name}</h2>
            <p class="product-card__description">${product.description}</p>
            <div class="product-card__price">
              <span class="product-card__price-current">¥${product.price}</span>
              <span class="product-card__price-original">¥${product.originalPrice}</span>
            </div>
            <div class="product-card__sizes">
              ${sizeButtons}
            </div>
            <button class="product-card__button" type="button" data-cart-button>加入购物车</button>
          </div>
        </article>
      `;
    }

    function getVisibleProducts() {
      const filtered = activeFilter === "全部"
        ? [...products]
        : products.filter((product) => product.category === activeFilter);

      if (activeSort === "价格从低到高") {
        return filtered.sort((a, b) => a.price - b.price);
      }

      if (activeSort === "价格从高到低") {
        return filtered.sort((a, b) => b.price - a.price);
      }

      if (activeSort === "最新上架") {
        return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      return filtered.sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended));
    }

    function updateToolbarState(buttons, value, attributeName) {
      buttons.forEach((button) => {
        const isActive = button.dataset[attributeName] === value;
        button.classList.toggle("is-active", isActive);
      });
    }

    function bindCardInteractions() {
      const cards = Array.from(document.querySelectorAll("[data-product-card]"));

      cards.forEach((card) => {
        const sizeButtons = Array.from(card.querySelectorAll("[data-size]"));
        const cartButton = card.querySelector("[data-cart-button]");
        const productId = card.dataset.productId;

        sizeButtons.forEach((button) => {
          button.addEventListener("click", () => {
            sizeButtons.forEach((item) => {
              item.classList.remove("is-selected");
              item.setAttribute("aria-pressed", "false");
            });

            button.classList.add("is-selected");
            button.setAttribute("aria-pressed", "true");
          });
        });

        cartButton.addEventListener("click", () => {
          cartButton.textContent = "已加入购物车";

          if (cartTimers.has(productId)) {
            clearTimeout(cartTimers.get(productId));
          }

          const timerId = window.setTimeout(() => {
            cartButton.textContent = "加入购物车";
            cartTimers.delete(productId);
          }, 1500);

          cartTimers.set(productId, timerId);
        });
      });
    }

    function renderProducts() {
      const visibleProducts = getVisibleProducts();
      resultCount.textContent = `共 ${visibleProducts.length} 件商品`;

      if (visibleProducts.length === 0) {
        productGrid.innerHTML = '<div class="empty-state" data-empty-state>当前分类暂无商品</div>';
        return;
      }

      productGrid.innerHTML = visibleProducts.map(createCardMarkup).join("");
      bindCardInteractions();
    }

    function setFilter(filterValue) {
      activeFilter = filterValue;
      updateToolbarState(filterButtons(), activeFilter, "filter");
      renderProducts();
    }

    filterButtons().forEach((button) => {
      button.addEventListener("click", () => {
        setFilter(button.dataset.filter);
      });
    });

    sortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeSort = button.dataset.sort;
        updateToolbarState(sortButtons, activeSort, "sort");
        renderProducts();
      });
    });

    window.__setFilterForTest = setFilter;
    renderProducts();
  </script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
npm test -- --grep "keeps size selection scoped|shows cart feedback per card|shows an empty state"
```

Expected:

```text
3 passed
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add list card interactions"
```

Expected:

```text
[main ...] feat: add list card interactions
```

## Self-Review

- Spec coverage:
  - Top title area: Task 1
  - Category filters: Task 3
  - Sort controls: Task 3
  - Result count: Task 3
  - Responsive socks grid: Task 2
  - Reuse of existing card language: Tasks 2 and 4
  - Card hover, size, and cart interactions: Task 4
  - Empty state for no matching category: Task 4
  - New standalone file instead of replacing `socks-product-card.html`: Tasks 1-4
- Placeholder scan:
  - No placeholder markers remain in the task steps.
- Type consistency:
  - Shared selectors and APIs stay consistent across tasks: `[data-product-grid]`, `[data-product-card]`, `[data-result-count]`, `[data-filter]`, `[data-sort]`, `[data-size]`, `[data-cart-button]`, and `window.__setFilterForTest`.

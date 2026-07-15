# Socks Product Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file HTML socks product card with an image-first layout, black/white/gray styling, sale pricing, size selection, and add-to-cart feedback that works by opening the file directly in a browser.

**Architecture:** Keep the UI in one standalone `socks-product-card.html` file so the preview stays dependency-free. Add a tiny Node-based test harness with Playwright to verify structure, interactions, and hover behavior without introducing a frontend framework or build step.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js, npm, Playwright

---

## File Structure

- Create: `package.json`
  Purpose: define the lightweight test command and Playwright dependency.
- Create: `playwright.config.js`
  Purpose: make Playwright run local tests in Chromium with stable defaults.
- Create: `tests/socks-product-card.spec.js`
  Purpose: verify static content, visual hierarchy hooks, size selection, and cart-button feedback.
- Create: `socks-product-card.html`
  Purpose: hold the complete previewable component, including structure, styles, and interactions.

**Repository note:** the current workspace is not a Git repository. If version control is needed during implementation, run `git init` once before the first commit step and then use the commit commands listed below.

### Task 1: Bootstrap the test harness and semantic HTML shell

**Files:**
- Create: `package.json`
- Create: `playwright.config.js`
- Create: `tests/socks-product-card.spec.js`
- Create: `socks-product-card.html`

- [ ] **Step 1: Write the failing test**

`package.json`
```json
{
  "name": "socks-product-card",
  "private": true,
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.1"
  }
}
```

`playwright.config.js`
```js
// Keep the runner minimal for a single local HTML file.
module.exports = {
  testDir: "./tests",
  use: {
    browserName: "chromium",
    headless: true
  }
};
```

`tests/socks-product-card.spec.js`
```js
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const previewUrl = "file://" + path.join(process.cwd(), "socks-product-card.html");

test("renders the base product card shell with a default size", async ({ page }) => {
  await page.goto(previewUrl);

  await expect(page.locator(".product-card")).toBeVisible();
  await expect(page.getByText("极简中筒袜")).toBeVisible();
  await expect(page.getByRole("button", { name: "35-38" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "加入购物车" })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
npm test
```

Expected:
```text
FAIL tests/socks-product-card.spec.js
Error: page.goto: net::ERR_FILE_NOT_FOUND
```

- [ ] **Step 3: Write minimal implementation**

`socks-product-card.html`
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>袜子商品卡片</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f2f2f2;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    .product-card {
      width: min(100%, 360px);
      background: #fff;
      border-radius: 24px;
      padding: 24px;
      box-sizing: border-box;
    }

    .product-card__sizes {
      display: flex;
      gap: 10px;
      margin: 16px 0;
    }

    .product-card__size {
      border: 1px solid #cfcfcf;
      border-radius: 999px;
      padding: 10px 14px;
      background: #fff;
    }

    .product-card__size.is-selected {
      background: #111;
      color: #fff;
      border-color: #111;
    }

    .product-card__button {
      width: 100%;
      border: 0;
      border-radius: 16px;
      padding: 14px 16px;
      background: #111;
      color: #fff;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <article class="product-card">
    <p>Cotton Daily</p>
    <h1>极简中筒袜</h1>
    <div class="product-card__sizes">
      <button class="product-card__size is-selected" type="button" aria-pressed="true">35-38</button>
      <button class="product-card__size" type="button" aria-pressed="false">39-42</button>
      <button class="product-card__size" type="button" aria-pressed="false">43-45</button>
    </div>
    <button class="product-card__button" type="button">加入购物车</button>
  </article>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
npm test -- --grep "base product card shell"
```

Expected:
```text
1 passed
```

- [ ] **Step 5: Commit**

Run:
```powershell
git init
git add package.json playwright.config.js tests/socks-product-card.spec.js socks-product-card.html
git commit -m "test: bootstrap socks product card shell"
```

Expected:
```text
[main (root-commit) ...] test: bootstrap socks product card shell
```

### Task 2: Add the image-first layout, sale badge, and price hierarchy

**Files:**
- Modify: `tests/socks-product-card.spec.js`
- Modify: `socks-product-card.html`

- [ ] **Step 1: Write the failing test**

Append this test to `tests/socks-product-card.spec.js`:
```js
test("shows an image-first layout with sale and pricing details", async ({ page }) => {
  await page.goto(previewUrl);

  await expect(page.locator(".product-card__media")).toBeVisible();
  await expect(page.locator(".product-card__badge")).toHaveText("32% OFF");
  await expect(page.locator(".product-card__price-current")).toHaveText("¥39");
  await expect(page.locator(".product-card__price-original")).toHaveText("¥59");
  await expect(page.locator(".product-card__description")).toContainText("柔软透气面料");

  const mediaHeight = await page.locator(".product-card__media").evaluate((node) => node.getBoundingClientRect().height);
  expect(mediaHeight).toBeGreaterThan(220);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
npm test -- --grep "image-first layout"
```

Expected:
```text
FAIL tests/socks-product-card.spec.js
Error: expect(locator(".product-card__media")).toBeVisible() failed
```

- [ ] **Step 3: Write minimal implementation**

Replace `socks-product-card.html` with:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>袜子商品卡片</title>
  <style>
    :root {
      --bg-start: #f6f6f6;
      --bg-end: #ececec;
      --surface: #ffffff;
      --text-main: #111111;
      --text-subtle: #666666;
      --line: #d9d9d9;
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
      --radius-card: 28px;
      --radius-pill: 999px;
      --radius-button: 16px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: linear-gradient(180deg, var(--bg-start) 0%, var(--bg-end) 100%);
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text-main);
    }

    .product-card {
      width: min(100%, 360px);
      overflow: hidden;
      background: var(--surface);
      border: 1px solid #ededed;
      border-radius: var(--radius-card);
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
      border-radius: var(--radius-pill);
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
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }

    .product-card__size,
    .product-card__button {
      font: inherit;
    }

    .product-card__size {
      border: 1px solid #cfcfcf;
      border-radius: var(--radius-pill);
      padding: 10px 14px;
      background: #fff;
    }

    .product-card__size.is-selected {
      background: #111;
      color: #fff;
      border-color: #111;
    }

    .product-card__button {
      width: 100%;
      border: 0;
      border-radius: var(--radius-button);
      padding: 15px 16px;
      background: #111;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <article class="product-card">
    <div class="product-card__media">
      <p class="product-card__badge">32% OFF</p>
      <div class="product-card__sock" aria-hidden="true">SOCKS</div>
    </div>

    <div class="product-card__content">
      <p class="product-card__eyebrow">Cotton Daily</p>
      <h1 class="product-card__title">极简中筒袜</h1>
      <p class="product-card__description">柔软透气面料，适合日常通勤与居家穿着，黑白灰三色基础百搭。</p>

      <div class="product-card__price">
        <span class="product-card__price-current">¥39</span>
        <span class="product-card__price-original">¥59</span>
      </div>

      <div class="product-card__sizes">
        <button class="product-card__size is-selected" type="button" aria-pressed="true">35-38</button>
        <button class="product-card__size" type="button" aria-pressed="false">39-42</button>
        <button class="product-card__size" type="button" aria-pressed="false">43-45</button>
      </div>

      <button class="product-card__button" type="button">加入购物车</button>
    </div>
  </article>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
npm test -- --grep "image-first layout"
```

Expected:
```text
1 passed
```

- [ ] **Step 5: Commit**

Run:
```powershell
git add tests/socks-product-card.spec.js socks-product-card.html
git commit -m "feat: add image-first sale card layout"
```

Expected:
```text
[main ...] feat: add image-first sale card layout
```

### Task 3: Add size-selection behavior with single-select state

**Files:**
- Modify: `tests/socks-product-card.spec.js`
- Modify: `socks-product-card.html`

- [ ] **Step 1: Write the failing test**

Append this test to `tests/socks-product-card.spec.js`:
```js
test("switches the selected size with single-select behavior", async ({ page }) => {
  await page.goto(previewUrl);

  const sizeOne = page.getByRole("button", { name: "35-38" });
  const sizeTwo = page.getByRole("button", { name: "39-42" });

  await sizeTwo.click();

  await expect(sizeOne).toHaveAttribute("aria-pressed", "false");
  await expect(sizeTwo).toHaveAttribute("aria-pressed", "true");
  await expect(sizeTwo).toHaveClass(/is-selected/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
npm test -- --grep "single-select behavior"
```

Expected:
```text
FAIL tests/socks-product-card.spec.js
Error: expect(locator("button")).toHaveAttribute(expected) failed
Expected string: "false"
Received string: "true"
```

- [ ] **Step 3: Write minimal implementation**

Update the size buttons and add a script block in `socks-product-card.html`:
```html
<div class="product-card__sizes">
  <button class="product-card__size is-selected" type="button" aria-pressed="true" data-size>35-38</button>
  <button class="product-card__size" type="button" aria-pressed="false" data-size>39-42</button>
  <button class="product-card__size" type="button" aria-pressed="false" data-size>43-45</button>
</div>

<script>
  const sizeButtons = Array.from(document.querySelectorAll("[data-size]"));

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
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
npm test -- --grep "single-select behavior"
```

Expected:
```text
1 passed
```

- [ ] **Step 5: Commit**

Run:
```powershell
git add tests/socks-product-card.spec.js socks-product-card.html
git commit -m "feat: add size selection interaction"
```

Expected:
```text
[main ...] feat: add size selection interaction
```

### Task 4: Add hover motion, button feedback, and final interaction polish

**Files:**
- Modify: `tests/socks-product-card.spec.js`
- Modify: `socks-product-card.html`

- [ ] **Step 1: Write the failing tests**

Append these tests to `tests/socks-product-card.spec.js`:
```js
test("changes the cart button text after click and restores it", async ({ page }) => {
  await page.goto(previewUrl);

  const cartButton = page.getByRole("button", { name: "加入购物车" });
  await cartButton.click();

  await expect(cartButton).toHaveText("已加入购物车");
  await page.waitForTimeout(1700);
  await expect(page.locator(".product-card__button")).toHaveText("加入购物车");
});

test("applies hover motion to the card and product image", async ({ page }) => {
  await page.goto(previewUrl);

  const card = page.locator(".product-card");
  const sock = page.locator(".product-card__sock");

  const beforeCardTransform = await card.evaluate((node) => getComputedStyle(node).transform);
  const beforeSockTransform = await sock.evaluate((node) => getComputedStyle(node).transform);

  await card.hover();

  const afterCardTransform = await card.evaluate((node) => getComputedStyle(node).transform);
  const afterSockTransform = await sock.evaluate((node) => getComputedStyle(node).transform);

  expect(afterCardTransform).not.toBe(beforeCardTransform);
  expect(afterSockTransform).not.toBe(beforeSockTransform);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```powershell
npm test -- --grep "cart button text|hover motion"
```

Expected:
```text
FAIL tests/socks-product-card.spec.js
Expected string: "已加入购物车"
```

- [ ] **Step 3: Write minimal implementation**

Update the button, size styles, hover styles, and script in `socks-product-card.html`:
```html
<style>
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
    transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
    cursor: pointer;
  }

  .product-card__size:hover {
    border-color: #111111;
  }

  .product-card__button {
    transition: transform 160ms ease, background-color 160ms ease, opacity 160ms ease;
    cursor: pointer;
  }

  .product-card__button:hover {
    background: #222222;
  }

  .product-card__button:active {
    transform: translateY(1px) scale(0.99);
  }
<\/style>

<button class="product-card__button" type="button" data-cart-button>加入购物车</button>

<script>
  const sizeButtons = Array.from(document.querySelectorAll("[data-size]"));
  const cartButton = document.querySelector("[data-cart-button]");
  let cartTimerId = null;

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

    if (cartTimerId !== null) {
      clearTimeout(cartTimerId);
    }

    cartTimerId = window.setTimeout(() => {
      cartButton.textContent = "加入购物车";
      cartTimerId = null;
    }, 1500);
  });
<\/script>
```

- [ ] **Step 4: Run the full test suite to verify it passes**

Run:
```powershell
npm test
```

Expected:
```text
4 passed
```

- [ ] **Step 5: Commit**

Run:
```powershell
git add tests/socks-product-card.spec.js socks-product-card.html
git commit -m "feat: polish cart feedback and hover motion"
```

Expected:
```text
[main ...] feat: polish cart feedback and hover motion
```

## Self-Review

- Spec coverage:
  - Image-first layout: Task 2
  - Black/white/gray styling: Task 2
  - Sale badge and original-price strikethrough: Task 2
  - Size selection with default selected state: Tasks 1 and 3
  - Add-to-cart text feedback: Task 4
  - Hover motion for card and image: Task 4
  - Single-file previewable output: Tasks 1 and 2 keep everything in `socks-product-card.html`
- Placeholder scan:
  - No placeholder markers or deferred implementation notes remain in the task steps.
- Type consistency:
  - Shared selectors stay consistent across tasks: `.product-card`, `.product-card__media`, `.product-card__sock`, `.product-card__size`, `.product-card__button`.

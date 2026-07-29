# Socks Product Page Commerce Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add saved products, product Q&A, and review sorting/filtering to the socks product detail experience.

**Architecture:** Extend the existing SQLite database initializer with two focused tables and seed Q&A data. Keep product-related APIs in `lib/routes/product-routes.js` and add small repositories for saved products and product questions; frontend consumes the APIs from `public/js/storefront-app.js`.

**Tech Stack:** Node.js HTTP server, SQLite, vanilla HTML/CSS/JS, Playwright.

---

### Task 1: API Coverage

**Files:**
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing API tests**

Add tests for `GET/POST/DELETE /api/saved-products`, `GET/POST /api/products/:id/questions`, and review query parameters.

- [ ] **Step 2: Run tests to verify red**

Run: `npx playwright test tests/api.spec.js -g "saved products|product questions|filters product reviews" --workers=1`

Expected: routes are missing or return unfiltered data.

### Task 2: Backend Data And Routes

**Files:**
- Modify: `lib/database.js`
- Create: `lib/repositories/saved-products.js`
- Create: `lib/repositories/product-questions.js`
- Modify: `lib/repositories/product-reviews.js`
- Modify: `lib/routes/product-routes.js`
- Modify: `server.js`

- [ ] **Step 1: Add schema and seeds**

Add `saved_products` and `product_questions` tables plus deterministic seeded Q&A rows.

- [ ] **Step 2: Add repositories**

Implement saved product toggle/list/delete and product question list/create helpers.

- [ ] **Step 3: Wire routes**

Register saved-products routes and product questions routes; extend reviews route to read `sort` and `rating`.

- [ ] **Step 4: Run API tests green**

Run: `npx playwright test tests/api.spec.js -g "saved products|product questions|filters product reviews" --workers=1`

Expected: PASS.

### Task 3: Frontend UI

**Files:**
- Modify: `socks-product-list.html`
- Modify: `public/js/storefront-app.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing UI tests**

Add tests for detail saved button, Q&A form, and review filtering controls.

- [ ] **Step 2: Implement UI markup and state**

Render saved buttons, Q&A section, and review controls using API responses.

- [ ] **Step 3: Run UI tests green**

Run: `npx playwright test tests/socks-product-list.spec.js -g "saved product|product questions|review filter" --workers=1`

Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- All changed files

- [ ] **Step 1: Run focused regression**

Run: `npx playwright test tests/api.spec.js tests/socks-product-list.spec.js -g "saved products|product questions|filters product reviews|saved product|review filter|submits and displays product reviews" --workers=1`

- [ ] **Step 2: Clean fixture noise**

Run: `git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json`

- [ ] **Step 3: Check and commit**

Run: `git diff --check && git status --short`

Commit: `git commit -m "feat: deepen product detail commerce"`

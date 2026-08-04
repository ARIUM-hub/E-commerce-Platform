# Socks Review Trust Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add buyer-photo, verified-purchase, helpful-vote, and negative-reason trust signals to product reviews.

**Architecture:** Extend the existing product review schema and repository, then expose a focused helpful-vote route under product reviews. The detail page continues to re-render the review section from API payloads.

**Tech Stack:** Node.js HTTP server, SQLite, vanilla HTML/CSS/JS, Playwright.

---

### Task 1: API Behavior

**Files:**
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing tests**

Add tests that assert seeded reviews include `verifiedPurchase`, `helpfulCount`, `mediaUrls`, and `reasonTags`, and that `POST /api/products/sock-02/reviews/:reviewId/helpful` increments once per session.

- [ ] **Step 2: Verify red**

Run: `npx playwright test tests/api.spec.js -g "review trust|helpful review" --workers=1`

Expected: FAIL because enhanced fields and helpful route do not exist yet.

### Task 2: Backend Implementation

**Files:**
- Modify: `lib/database.js`
- Modify: `lib/repositories/product-reviews.js`
- Modify: `lib/routes/product-routes.js`
- Modify: `server.js`

- [ ] **Step 1: Add schema migration**

Add review trust columns and `product_review_helpful_votes`.

- [ ] **Step 2: Extend repository**

Parse/serialize trust fields and add `markReviewHelpful`.

- [ ] **Step 3: Wire helpful route**

Use existing session/user ownership so anonymous helpful votes get a session cookie and duplicate votes are ignored.

- [ ] **Step 4: Verify API green**

Run: `npx playwright test tests/api.spec.js -g "review trust|helpful review|product reviews|filters product reviews" --workers=1`

Expected: PASS.

### Task 3: UI Behavior

**Files:**
- Modify: `public/js/storefront-app.js`
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing UI test**

Add a detail page test that checks Verified Purchase, buyer photos, reason tags, and helpful button count.

- [ ] **Step 2: Implement markup and binding**

Render enhanced review metadata and handle helpful button clicks by refreshing reviews.

- [ ] **Step 3: Verify UI green**

Run: `npx playwright test tests/socks-product-list.spec.js -g "review trust signals" --workers=1`

Expected: PASS.

### Task 4: Final Verification

**Files:**
- All changed files

- [ ] **Step 1: Focused regression**

Run: `npx playwright test tests/api.spec.js tests/socks-product-list.spec.js -g "review trust|helpful review|product reviews|filters product reviews|submits and displays product reviews|review trust signals" --workers=1`

- [ ] **Step 2: Clean fixture noise**

Run: `git checkout-index -f -u -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json`

- [ ] **Step 3: Commit**

Commit: `git commit -m "feat: add product review trust signals"`

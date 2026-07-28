# Socks Seeded Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为袜子商品详情页增加数据库驱动的默认示例评论。

**Architecture:** 在 `lib/database.js` 初始化流程中增加幂等的评论种子逻辑。API 与详情页继续读取 `/api/products/:id/reviews`，无需新增前端假数据。

**Tech Stack:** Node.js、SQLite、Playwright。

---

### Task 1: Seeded Product Reviews

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`
- Modify: `lib/database.js`

- [x] **Step 1: Write the failing test**

在 `tests/api.spec.js` 中新增 `lists seeded product reviews for product detail pages`，验证初始化后 `sock-02` 已有 3 条示例评论。

- [x] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/api.spec.js -g "lists seeded product reviews" --workers=1`

Observed: FAIL because the current database initializer returned `reviews: []` and `count: 0`.

- [x] **Step 3: Write minimal implementation**

在 `lib/database.js` 中增加 `seedProductReviews(db)`，对 `sock-01` 到 `sock-05` 插入固定评论；使用 `INSERT OR IGNORE` 防止重启重复插入。

- [x] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/api.spec.js tests/socks-product-list.spec.js -g "lists seeded product reviews|creates and lists product reviews|concise product reviews|invalid product reviews|submits and displays product reviews" --workers=1`

Observed: PASS, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-28-socks-seeded-reviews-design.md docs/superpowers/plans/2026-07-28-socks-seeded-reviews.md lib/database.js tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: seed product detail reviews"
```

# Socks Customer Trust System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo-real customer trust center for the socks storefront with policies, FAQ, footer/header routing, and SQLite-backed support tickets.

**Architecture:** Add a `support` view to the existing single-page storefront and keep the global header/footer shell. Backend owns trust center content through `GET /api/trust-center`; contact submissions go through `POST /api/support/contact` and persist in SQLite. Frontend fetches support content, renders section navigation, FAQ accordion, and a validated contact form without introducing separate HTML pages.

**Tech Stack:** Node HTTP server, `node:sqlite`/`better-sqlite3` compatibility layer, vanilla HTML/CSS/JavaScript, Playwright tests, existing i18n dictionary and single-file storefront shell.

---

## File Structure

- Modify: `lib/database.js`
  Adds `support_tickets` table and indexes during schema initialization.
- Create: `lib/repositories/support.js`
  Owns trust center seed content, locale normalization, contact topic validation, ticket number creation, and support ticket persistence.
- Modify: `server.js`
  Wires `GET /api/trust-center` and `POST /api/support/contact` into the existing route chain.
- Modify: `socks-product-list.html`
  Adds support view markup, CSS, i18n copy, fetch/render helpers, header/footer links, FAQ accordion, and contact form behavior.
- Modify: `tests/api.spec.js`
  Adds API/database coverage for trust center content and support ticket creation/validation.
- Modify: `tests/socks-product-list.spec.js`
  Adds focused UI coverage for support view navigation, FAQ, footer links, and contact form success/error behavior.

Keep the feature inside the existing storefront shell. Do not create separate support HTML pages and do not reintroduce JSON as source of truth for support tickets.

## Task 1: API Contract Tests

**Files:**
- Modify: `tests/api.spec.js`

- [ ] **Step 1: Write failing database schema test**

Add this assertion near the existing SQLite initialization tests:

```js
test("initializes SQLite support ticket table", async () => {
  const db = createDatabase(":memory:");
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const ticketTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'support_tickets'").get();
    expect(ticketTable).toEqual({ name: "support_tickets" });
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Write failing trust center content API tests**

Add these tests near the marketing/recommendation API tests:

```js
test("returns localized trust center content", async ({ request }) => {
  const response = await request.get("/api/trust-center?locale=zh-CN");
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  expect(payload.sections.map((section) => section.id)).toEqual([
    "returns",
    "delivery",
    "privacy",
    "terms",
    "faq",
    "contact"
  ]);
  expect(payload.sections.find((section) => section.id === "returns")).toMatchObject({
    title: "退换政策"
  });
  expect(payload.faqs.length).toBeGreaterThanOrEqual(5);
  expect(payload.contactTopics.map((topic) => topic.id)).toContain("orders");
});

test("returns English trust center content", async ({ request }) => {
  const response = await request.get("/api/trust-center?locale=en-US");
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  expect(payload.sections.find((section) => section.id === "privacy")).toMatchObject({
    title: "Privacy Policy"
  });
  expect(payload.faqs[0].question).toContain("size");
});
```

- [ ] **Step 3: Write failing contact API success test**

Add:

```js
test("creates a support contact ticket", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    data: {
      name: "Demo Buyer",
      contact: "buyer@example.com",
      topic: "returns",
      orderId: "SOCK-20260724-0001",
      message: "I want to understand the return window for unworn socks.",
      locale: "en-US"
    }
  });
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  expect(payload.ticket).toMatchObject({
    topic: "returns",
    status: "open"
  });
  expect(payload.ticket.ticketNumber).toMatch(/^SUP-\\d{8}-\\d{4}$/);

  const db = createDatabase(testDbFile);
  try {
    const row = db.prepare("SELECT ticket_number, topic, status FROM support_tickets WHERE ticket_number = ?").get(payload.ticket.ticketNumber);
    expect(row).toMatchObject({
      ticket_number: payload.ticket.ticketNumber,
      topic: "returns",
      status: "open"
    });
  } finally {
    db.close();
  }
});
```

- [ ] **Step 4: Write failing contact API validation tests**

Add:

```js
test("rejects support contact requests with missing required fields", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    data: {
      name: "",
      contact: "buyer@example.com",
      topic: "orders",
      message: "Please help with my order."
    }
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "SUPPORT_NAME_REQUIRED"
    }
  });
});

test("rejects support contact requests with invalid topics", async ({ request }) => {
  const response = await request.post("/api/support/contact", {
    data: {
      name: "Demo Buyer",
      contact: "buyer@example.com",
      topic: "billing-provider",
      message: "Please help with my order."
    }
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "SUPPORT_TOPIC_INVALID"
    }
  });
});
```

- [ ] **Step 5: Run API tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; $env:NODE_ENV='test'; npx playwright test tests/api.spec.js -g "support|trust center|SQLite support ticket" --reporter=list
```

Expected: tests fail because `/api/trust-center`, `/api/support/contact`, and `support_tickets` do not exist.

## Task 2: Support Repository And Database Schema

**Files:**
- Modify: `lib/database.js`
- Create: `lib/repositories/support.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: Add `support_tickets` table**

In `lib/database.js`, inside `runSchema(db)`, add after `recent_views`:

```js
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      session_id TEXT,
      user_id TEXT,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      topic TEXT NOT NULL,
      order_id TEXT,
      message TEXT NOT NULL,
      locale TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );
```

Add indexes near the existing index block:

```js
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_session ON support_tickets(session_id, created_at);
```

- [ ] **Step 2: Create support repository**

Create `lib/repositories/support.js` with this structure:

```js
const validLocales = new Set(["zh-CN", "en-US"]);
const validContactTopics = new Set(["orders", "returns", "delivery", "account", "product", "other"]);

const trustCenterContent = {
  "zh-CN": {
    updatedAt: "2026-07-24T00:00:00.000Z",
    sections: [
      {
        id: "returns",
        title: "退换政策",
        eyebrow: "Returns",
        summary: "未穿着、未清洗且吊牌包装完整的袜子可在演示周期内申请退换。",
        bullets: ["保持商品卫生状态", "保留订单号或演示订单截图", "退款通常在审核后 3 个工作日内完成"]
      },
      {
        id: "delivery",
        title: "配送说明",
        eyebrow: "Delivery",
        summary: "标准配送与加急配送沿用结算页的预计送达逻辑。",
        bullets: ["标准配送默认包邮", "加急配送会在结算汇总中展示费用", "异常配送可通过联系入口提交工单"]
      },
      {
        id: "privacy",
        title: "隐私政策",
        eyebrow: "Privacy",
        summary: "本演示商城只保存完成购物流程所需的会话、购物车、地址和订单数据。",
        bullets: ["不会接入真实广告追踪", "不会向第三方发送联系表单", "清理测试数据库会移除演示数据"]
      },
      {
        id: "terms",
        title: "服务条款",
        eyebrow: "Terms",
        summary: "当前页面用于商城流程演示，价格、库存、优惠和订单状态均为演示数据。",
        bullets: ["下单不会产生真实支付", "库存扣减仅作用于本地演示数据库", "政策文案用于界面体验验证"]
      },
      {
        id: "faq",
        title: "FAQ",
        eyebrow: "Help",
        summary: "快速查看尺码、库存、优惠券、订单和账户相关问题。",
        bullets: ["默认展开第一个问题", "支持键盘切换", "需要人工说明时可提交联系工单"]
      },
      {
        id: "contact",
        title: "联系我们",
        eyebrow: "Contact",
        summary: "提交演示工单后，系统会返回一个可追踪的客服编号。",
        bullets: ["支持匿名用户提交", "登录用户会关联当前账户", "预计 1 个工作日内响应"]
      }
    ],
    faqs: [
      { id: "size-help", question: "如何选择袜子尺码？", answer: "建议先按详情页尺码按钮选择常穿鞋码，例如 39、40、41，再加入购物车。" },
      { id: "stock-limit", question: "为什么加购数量会受限制？", answer: "每个尺码都有独立库存，达到对应库存上限后系统会提示无货。" },
      { id: "coupon-use", question: "优惠券怎么使用？", answer: "在购物车抽屉输入有效券码，系统会由后端重新计算优惠与总价。" },
      { id: "order-history", question: "订单记录在哪里看？", answer: "登录后可以从顶部订单入口查看当前账户的演示订单历史。" },
      { id: "returns-window", question: "袜子可以退换吗？", answer: "演示规则要求商品未穿着、未清洗且包装完整，提交工单后进入退换流程。" }
    ],
    contactTopics: [
      { id: "orders", label: "订单问题" },
      { id: "returns", label: "退换问题" },
      { id: "delivery", label: "配送问题" },
      { id: "account", label: "账户问题" },
      { id: "product", label: "商品咨询" },
      { id: "other", label: "其他" }
    ]
  },
  "en-US": {
    updatedAt: "2026-07-24T00:00:00.000Z",
    sections: [
      { id: "returns", title: "Returns Policy", eyebrow: "Returns", summary: "Unworn, unwashed socks with intact packaging can be submitted for a demo return review.", bullets: ["Keep the item hygienic", "Keep the order number", "Refunds are simulated within 3 business days after review"] },
      { id: "delivery", title: "Delivery Notes", eyebrow: "Delivery", summary: "Standard and express delivery use the same estimated delivery logic as checkout.", bullets: ["Standard delivery is free in the demo", "Express delivery appears in checkout totals", "Delivery issues can be sent through the contact form"] },
      { id: "privacy", title: "Privacy Policy", eyebrow: "Privacy", summary: "This demo stores only the session, cart, address, and order data needed for the shopping flow.", bullets: ["No real ad tracking is connected", "Contact forms are not sent to third parties", "Resetting the test database removes demo data"] },
      { id: "terms", title: "Terms of Service", eyebrow: "Terms", summary: "This storefront is a demo; prices, stock, promotions, and order states are simulated.", bullets: ["No real payment is collected", "Stock changes only affect the local demo database", "Policy copy supports UI validation"] },
      { id: "faq", title: "FAQ", eyebrow: "Help", summary: "Find quick answers about sizing, stock, coupons, orders, and accounts.", bullets: ["The first question opens by default", "Keyboard toggling is supported", "Submit a ticket when more help is needed"] },
      { id: "contact", title: "Contact Us", eyebrow: "Contact", summary: "Submit a demo support request and receive a trackable ticket number.", bullets: ["Guest shoppers can submit", "Signed-in users are linked to their account", "Expected response is 1 business day"] }
    ],
    faqs: [
      { id: "size-help", question: "How do I choose a sock size?", answer: "Choose your usual shoe size on the detail page, such as 39, 40, or 41, before adding to cart." },
      { id: "stock-limit", question: "Why is add-to-cart quantity limited?", answer: "Each size has independent stock. When that stock is reached, the storefront shows an out-of-stock message." },
      { id: "coupon-use", question: "How do coupons work?", answer: "Enter a valid coupon in the cart drawer and backend pricing recalculates the savings and total." },
      { id: "order-history", question: "Where can I find order history?", answer: "After signing in, use the Orders link in the header to review demo order history." },
      { id: "returns-window", question: "Can socks be returned?", answer: "Demo rules require the item to be unworn, unwashed, and in intact packaging before return review." }
    ],
    contactTopics: [
      { id: "orders", label: "Order issue" },
      { id: "returns", label: "Return issue" },
      { id: "delivery", label: "Delivery issue" },
      { id: "account", label: "Account issue" },
      { id: "product", label: "Product question" },
      { id: "other", label: "Other" }
    ]
  }
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function getTrustCenterContent(locale = "zh-CN") {
  return trustCenterContent[normalizeLocale(locale)];
}

function validateSupportTicketPayload(body) {
  const name = String(body.name || "").trim();
  const contact = String(body.contact || "").trim();
  const topic = String(body.topic || "").trim();
  const message = String(body.message || "").trim();

  if (!name) return { code: "SUPPORT_NAME_REQUIRED", message: "Name is required." };
  if (!contact) return { code: "SUPPORT_CONTACT_REQUIRED", message: "Contact is required." };
  if (!topic) return { code: "SUPPORT_TOPIC_REQUIRED", message: "Topic is required." };
  if (!validContactTopics.has(topic)) return { code: "SUPPORT_TOPIC_INVALID", message: "Support topic is invalid." };
  if (!message) return { code: "SUPPORT_MESSAGE_REQUIRED", message: "Message is required." };
  if (message.length > 1000) return { code: "SUPPORT_MESSAGE_TOO_LONG", message: "Message must be 1000 characters or fewer." };

  return null;
}

function buildSupportTicketNumber(db, now = new Date()) {
  const dateStamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE ticket_number LIKE ?").get(`SUP-${dateStamp}-%`);
  return `SUP-${dateStamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function createSupportTicket(db, body, context = {}) {
  const validationError = validateSupportTicketPayload(body);
  if (validationError) {
    return { validationError };
  }

  const now = new Date().toISOString();
  const ticketNumber = buildSupportTicketNumber(db);
  const ticket = {
    id: `ticket-${crypto.randomUUID()}`,
    ticketNumber,
    sessionId: context.sessionId || null,
    userId: context.userId || null,
    name: String(body.name).trim(),
    contact: String(body.contact).trim(),
    topic: String(body.topic).trim(),
    orderId: String(body.orderId || "").trim(),
    message: String(body.message).trim(),
    locale: normalizeLocale(body.locale),
    status: "open",
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO support_tickets (
      id, ticket_number, session_id, user_id, name, contact, topic, order_id, message, locale, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.id,
    ticket.ticketNumber,
    ticket.sessionId,
    ticket.userId,
    ticket.name,
    ticket.contact,
    ticket.topic,
    ticket.orderId,
    ticket.message,
    ticket.locale,
    ticket.status,
    ticket.createdAt,
    ticket.updatedAt
  );

  return { ticket };
}

module.exports = {
  createSupportTicket,
  getTrustCenterContent,
  validateSupportTicketPayload
};
```

At the top of this file, include:

```js
const crypto = require("node:crypto");
```

- [ ] **Step 3: Run schema/repository tests**

Run:

```powershell
chcp 65001 > $null; $env:NODE_ENV='test'; npx playwright test tests/api.spec.js -g "SQLite support ticket" --reporter=list
```

Expected: schema test passes. Route tests still fail.

- [ ] **Step 4: Commit**

```powershell
chcp 65001 > $null; git add -- lib/database.js lib/repositories/support.js tests/api.spec.js; git commit -m "feat: add support ticket repository"
```

## Task 3: Backend Trust And Contact Routes

**Files:**
- Modify: `server.js`
- Test: `tests/api.spec.js`

- [ ] **Step 1: Import support repository**

In `server.js`, add after repository imports:

```js
const {
  createSupportTicket,
  getTrustCenterContent
} = require("./lib/repositories/support");
```

- [ ] **Step 2: Add `GET /api/trust-center` route**

Add before auth/cart routes:

```js
  if (request.method === "GET" && requestUrl.pathname === "/api/trust-center") {
    const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
    sendJson(response, 200, getTrustCenterContent(locale));
    return;
  }
```

- [ ] **Step 3: Add `POST /api/support/contact` route**

Add after `GET /api/trust-center`:

```js
  if (request.method === "POST" && requestUrl.pathname === "/api/support/contact") {
    try {
      const body = await readRequestBody(request);
      const { session, user } = await getSessionContext(request);
      const result = withDatabase((db) => createSupportTicket(db, body, {
        sessionId: session?.id || null,
        userId: user?.id || null
      }));

      if (result.validationError) {
        sendError(response, 400, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 201, { ticket: result.ticket });
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
        return;
      }

      console.error(error);
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    }
    return;
  }
```

- [ ] **Step 4: Run API support tests**

Run:

```powershell
chcp 65001 > $null; $env:NODE_ENV='test'; npx playwright test tests/api.spec.js -g "support|trust center|SQLite support ticket" --reporter=list
```

Expected: focused API tests pass.

- [ ] **Step 5: Commit**

```powershell
chcp 65001 > $null; git add -- server.js tests/api.spec.js; git commit -m "feat: add customer trust api"
```

## Task 4: UI Structure And Routing Tests

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Implementation target after tests fail: `socks-product-list.html`

- [ ] **Step 1: Write failing header and footer routing tests**

Add focused tests:

```js
test("opens the trust center from the header help link", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.locator("[data-site-help-link]").click();

  await expect(page).toHaveURL(/view=support&section=faq/);
  await expect(page.locator("[data-support-view]")).toBeVisible();
  await expect(page.locator("[data-support-title]")).toHaveText("帮助中心");
});

test("opens returns policy from the header returns link", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.locator("[data-site-returns-link]").click();

  await expect(page).toHaveURL(/view=support&section=returns/);
  await expect(page.locator("[data-support-section='returns']")).toHaveClass(/is-active/);
  await expect(page.locator("[data-support-current-title]")).toHaveText("退换政策");
});

test("footer policy links route to trust center sections", async ({ page }) => {
  await page.goto("/socks-product-list.html");
  await page.locator("[data-footer-support-link='privacy']").click();

  await expect(page).toHaveURL(/view=support&section=privacy/);
  await expect(page.locator("[data-support-current-title]")).toHaveText("隐私政策");
});
```

- [ ] **Step 2: Run UI routing tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; npx playwright test tests/socks-product-list.spec.js -g "trust center|returns policy|footer policy" --reporter=list
```

Expected: tests fail because support view markup and routing are not implemented.

## Task 5: Frontend Support View Markup, CSS, And Routing

**Files:**
- Modify: `socks-product-list.html`
- Test: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Add support view markup**

Insert after `orders-view` and before `order-view`:

```html
    <div class="support-view" data-support-view hidden>
      <section class="support-hero">
        <nav class="support-breadcrumb" aria-label="breadcrumb">
          <a href="/socks-product-list.html" data-support-home-link>首页</a>
          <span aria-hidden="true">/</span>
          <span data-support-breadcrumb-current>帮助中心</span>
        </nav>
        <p class="support-hero__eyebrow" data-support-eyebrow>Customer care</p>
        <h1 class="support-hero__title" data-support-title>帮助中心</h1>
        <p class="support-hero__copy" data-support-copy>查看退换、配送、隐私、条款和常见问题，也可以提交演示客服工单。</p>
      </section>

      <section class="support-layout">
        <nav class="support-nav" data-support-nav aria-label="帮助中心栏目"></nav>
        <article class="support-panel" data-support-panel>
          <p class="support-panel__eyebrow" data-support-current-eyebrow></p>
          <h2 class="support-panel__title" data-support-current-title></h2>
          <p class="support-panel__summary" data-support-current-summary></p>
          <ul class="support-panel__bullets" data-support-current-bullets></ul>
          <div class="support-faq" data-support-faq hidden></div>
          <form class="support-contact" data-support-contact-form hidden novalidate>
            <label class="support-field">
              <span data-support-contact-name-label>姓名</span>
              <input name="name" data-support-contact-field="name" autocomplete="name">
              <small data-support-contact-error="name"></small>
            </label>
            <label class="support-field">
              <span data-support-contact-contact-label>联系方式</span>
              <input name="contact" data-support-contact-field="contact" autocomplete="email">
              <small data-support-contact-error="contact"></small>
            </label>
            <label class="support-field">
              <span data-support-contact-topic-label>问题类型</span>
              <select name="topic" data-support-contact-field="topic"></select>
              <small data-support-contact-error="topic"></small>
            </label>
            <label class="support-field">
              <span data-support-contact-order-label>订单号</span>
              <input name="orderId" data-support-contact-field="orderId" autocomplete="off">
              <small data-support-contact-error="orderId"></small>
            </label>
            <label class="support-field support-field--wide">
              <span data-support-contact-message-label>问题描述</span>
              <textarea name="message" rows="5" data-support-contact-field="message"></textarea>
              <small data-support-contact-error="message"></small>
            </label>
            <div class="support-contact__error" data-support-contact-error role="alert"></div>
            <button class="support-contact__submit" type="submit" data-support-contact-submit>提交工单</button>
          </form>
          <div class="support-ticket" data-support-ticket hidden></div>
        </article>
      </section>
    </div>
```

- [ ] **Step 2: Add CSS**

Add near other page/view styles:

```css
    .support-view {
      display: grid;
      gap: 24px;
    }

    .support-hero,
    .support-layout,
    .support-panel {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      box-shadow: var(--shadow-card);
    }

    .support-hero {
      padding: 24px;
    }

    .support-breadcrumb {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
      color: var(--color-muted);
      font-size: 13px;
    }

    .support-breadcrumb a {
      color: var(--color-ink);
      font-weight: 700;
      text-decoration: none;
    }

    .support-layout {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: 0;
    }

    .support-nav {
      display: grid;
      align-content: start;
      border-right: 1px solid var(--color-border);
      padding: 16px;
      gap: 8px;
    }

    .support-nav__button,
    .support-faq__question,
    .support-contact__submit {
      min-height: 44px;
      cursor: pointer;
    }

    .support-nav__button {
      border: 1px solid var(--color-border);
      background: var(--color-page);
      color: var(--color-ink);
      font-weight: 800;
      text-align: left;
      padding: 12px 14px;
    }

    .support-nav__button.is-active {
      background: var(--color-ink);
      color: var(--color-surface);
    }

    .support-panel {
      border: 0;
      box-shadow: none;
      padding: 24px;
    }

    .support-panel__title {
      margin: 0 0 10px;
      font-size: clamp(26px, 4vw, 42px);
      letter-spacing: -0.04em;
    }

    .support-panel__summary {
      color: var(--color-muted);
      line-height: 1.7;
    }

    .support-panel__bullets {
      display: grid;
      gap: 10px;
      padding-left: 18px;
      line-height: 1.6;
    }

    .support-faq {
      display: grid;
      gap: 10px;
      margin-top: 20px;
    }

    .support-faq__item {
      border: 1px solid var(--color-border);
      background: var(--color-page);
    }

    .support-faq__question {
      width: 100%;
      border: 0;
      background: transparent;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      color: var(--color-ink);
      font-weight: 900;
      text-align: left;
    }

    .support-faq__answer {
      margin: 0;
      padding: 0 16px 16px;
      color: var(--color-muted);
      line-height: 1.65;
    }

    .support-contact {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 20px;
    }

    .support-field {
      display: grid;
      gap: 7px;
      font-weight: 800;
    }

    .support-field--wide,
    .support-contact__error,
    .support-contact__submit,
    .support-ticket {
      grid-column: 1 / -1;
    }

    .support-field input,
    .support-field select,
    .support-field textarea {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-ink);
      padding: 12px;
      font: inherit;
    }

    .support-field small,
    .support-contact__error {
      min-height: 18px;
      color: var(--color-danger);
      font-size: 12px;
      font-weight: 700;
    }

    .support-contact__submit {
      border: 0;
      background: var(--color-ink);
      color: var(--color-surface);
      font-weight: 900;
    }

    .support-ticket {
      margin-top: 20px;
      border: 1px solid var(--color-ink);
      background: var(--color-page);
      padding: 16px;
    }

    @media (max-width: 760px) {
      .support-layout,
      .support-contact {
        grid-template-columns: 1fr;
      }

      .support-nav {
        border-right: 0;
        border-bottom: 1px solid var(--color-border);
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        overflow-x: auto;
      }
    }
```

If `--color-danger` does not exist, add it to the root color variables as a dark red with enough contrast:

```css
      --color-danger: #8a1f11;
```

- [ ] **Step 3: Add view constants and DOM references**

Add:

```js
    const SUPPORT_VIEW_KEY = "support";
    const SUPPORT_DEFAULT_SECTION = "faq";
    const SUPPORT_SECTION_IDS = ["returns", "delivery", "privacy", "terms", "faq", "contact"];
```

Add DOM refs:

```js
    const supportView = document.querySelector("[data-support-view]");
    const supportTitle = document.querySelector("[data-support-title]");
    const supportCopy = document.querySelector("[data-support-copy]");
    const supportNav = document.querySelector("[data-support-nav]");
    const supportCurrentEyebrow = document.querySelector("[data-support-current-eyebrow]");
    const supportCurrentTitle = document.querySelector("[data-support-current-title]");
    const supportCurrentSummary = document.querySelector("[data-support-current-summary]");
    const supportCurrentBullets = document.querySelector("[data-support-current-bullets]");
    const supportFaq = document.querySelector("[data-support-faq]");
    const supportContactForm = document.querySelector("[data-support-contact-form]");
    const supportTicket = document.querySelector("[data-support-ticket]");
```

- [ ] **Step 4: Add routing helpers**

Update `getCurrentView()`:

```js
      if (view === SUPPORT_VIEW_KEY) {
        return SUPPORT_VIEW_KEY;
      }
```

Add:

```js
    function getRequestedSupportSection() {
      const section = getSearchParams().get("section");
      return SUPPORT_SECTION_IDS.includes(section) ? section : SUPPORT_DEFAULT_SECTION;
    }

    function createSupportPath(sectionId) {
      return `${STOREFRONT_PATH}?view=${SUPPORT_VIEW_KEY}&section=${encodeURIComponent(sectionId)}`;
    }
```

- [ ] **Step 5: Update `syncPageView()`**

Add:

```js
      const isSupportView = currentView === SUPPORT_VIEW_KEY;
```

Then set:

```js
      supportView.hidden = !isSupportView;
```

Keep cart drawer available on support view by leaving:

```js
      const allowDrawer = !isOrderView;
```

- [ ] **Step 6: Add support link sync**

In static shell sync logic, set:

```js
      siteHelpLink.href = createSupportPath("faq");
      siteReturnsLink.href = createSupportPath("returns");
```

Replace footer plain spans with anchor links in markup:

```html
          <a href="/socks-product-list.html?view=support&section=faq" data-footer-help-link="faq">尺码建议</a>
          <a href="/socks-product-list.html?view=support&section=faq" data-footer-help-link="product">面料说明</a>
          <a href="/socks-product-list.html?view=support&section=contact" data-footer-help-link="contact">联系支持</a>
```

For delivery/support columns use:

```html
          <a href="/socks-product-list.html?view=support&section=delivery" data-footer-delivery-link="delivery">配送说明</a>
          <a href="/socks-product-list.html?view=support&section=returns" data-footer-support-link="returns">退换说明</a>
          <a href="/socks-product-list.html?view=support&section=privacy" data-footer-support-link="privacy">隐私政策</a>
          <a href="/socks-product-list.html?view=support&section=terms" data-footer-support-link="terms">服务条款</a>
```

- [ ] **Step 7: Implement fetch and render helpers**

Add state:

```js
    let trustCenterState = {
      sections: [],
      faqs: [],
      contactTopics: [],
      updatedAt: ""
    };
```

Add helpers:

```js
    async function fetchTrustCenter() {
      const response = await fetch(`/api/trust-center?locale=${encodeURIComponent(activeLocale)}`);
      if (!response.ok) {
        throw new Error("Trust center content failed to load");
      }
      trustCenterState = await response.json();
      renderSupportView();
    }

    function renderSupportView() {
      if (getCurrentView() !== SUPPORT_VIEW_KEY) {
        return;
      }

      const activeSectionId = getRequestedSupportSection();
      const activeSection = trustCenterState.sections.find((section) => section.id === activeSectionId)
        || trustCenterState.sections.find((section) => section.id === SUPPORT_DEFAULT_SECTION);

      supportTitle.textContent = t("support.title");
      supportCopy.textContent = t("support.copy");
      supportNav.innerHTML = trustCenterState.sections.map((section) => `
        <a class="support-nav__button${section.id === activeSection.id ? " is-active" : ""}"
          href="${createSupportPath(section.id)}"
          data-support-section="${section.id}"
          ${section.id === activeSection.id ? "aria-current=\"page\"" : ""}>
          ${section.title}
        </a>
      `).join("");
      supportCurrentEyebrow.textContent = activeSection.eyebrow;
      supportCurrentTitle.textContent = activeSection.title;
      supportCurrentSummary.textContent = activeSection.summary;
      supportCurrentBullets.innerHTML = activeSection.bullets.map((bullet) => `<li>${bullet}</li>`).join("");

      renderSupportFaq(activeSection.id === "faq");
      renderSupportContact(activeSection.id === "contact");
    }
```

- [ ] **Step 8: Run UI routing tests**

Run:

```powershell
chcp 65001 > $null; npx playwright test tests/socks-product-list.spec.js -g "trust center|returns policy|footer policy" --reporter=list
```

Expected: routing tests pass after render helpers are invoked during page initialization and locale changes.

- [ ] **Step 9: Commit**

```powershell
chcp 65001 > $null; git add -- socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: add trust center storefront view"
```

## Task 6: FAQ Accordion And Contact Form UI

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing FAQ interaction test**

Add:

```js
test("expands and collapses trust center FAQ items", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=faq");

  const firstQuestion = page.locator("[data-support-faq-question]").first();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
  await firstQuestion.click();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  await firstQuestion.press("Enter");
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
});
```

- [ ] **Step 2: Write failing contact form tests**

Add:

```js
test("validates trust center contact form", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=contact");
  await page.locator("[data-support-contact-submit]").click();

  await expect(page.locator("[data-support-contact-error='name']")).toHaveText("请填写姓名");
});

test("submits trust center contact form and shows ticket number", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=contact");
  await page.locator("[data-support-contact-field='name']").fill("演示买家");
  await page.locator("[data-support-contact-field='contact']").fill("buyer@example.com");
  await page.locator("[data-support-contact-field='topic']").selectOption("returns");
  await page.locator("[data-support-contact-field='message']").fill("想了解未穿着袜子的退换流程。");
  await page.locator("[data-support-contact-submit]").click();

  await expect(page.locator("[data-support-ticket]")).toBeVisible();
  await expect(page.locator("[data-support-ticket]")).toContainText(/SUP-\\d{8}-\\d{4}/);
});
```

- [ ] **Step 3: Implement FAQ rendering**

Add:

```js
    let openFaqId = "";

    function renderSupportFaq(isVisible) {
      supportFaq.hidden = !isVisible;
      if (!isVisible) {
        supportFaq.innerHTML = "";
        return;
      }

      if (!openFaqId && trustCenterState.faqs.length > 0) {
        openFaqId = trustCenterState.faqs[0].id;
      }

      supportFaq.innerHTML = trustCenterState.faqs.map((faq) => {
        const isOpen = faq.id === openFaqId;
        return `
          <section class="support-faq__item">
            <button class="support-faq__question" type="button" data-support-faq-question="${faq.id}" aria-expanded="${isOpen}">
              <span>${faq.question}</span>
              <span aria-hidden="true">${isOpen ? "-" : "+"}</span>
            </button>
            <p class="support-faq__answer" ${isOpen ? "" : "hidden"}>${faq.answer}</p>
          </section>
        `;
      }).join("");
    }
```

Add delegated event handler:

```js
    supportFaq.addEventListener("click", (event) => {
      const button = event.target.closest("[data-support-faq-question]");
      if (!button) return;

      const faqId = button.dataset.supportFaqQuestion;
      openFaqId = openFaqId === faqId ? "" : faqId;
      renderSupportFaq(true);
    });
```

- [ ] **Step 4: Implement contact rendering**

Add:

```js
    function renderSupportContact(isVisible) {
      supportContactForm.hidden = !isVisible;
      if (!isVisible) {
        supportTicket.hidden = true;
        return;
      }

      const topicSelect = supportContactForm.querySelector("[data-support-contact-field='topic']");
      topicSelect.innerHTML = trustCenterState.contactTopics.map((topic) => `
        <option value="${topic.id}">${topic.label}</option>
      `).join("");
    }
```

Add i18n keys under `support`:

```js
          title: "帮助中心",
          copy: "查看退换、配送、隐私、条款和常见问题，也可以提交演示客服工单。",
          submit: "提交工单",
          submitting: "提交中...",
          successTitle: "工单已创建",
          responseTime: "预计 1 个工作日内响应",
          errors: {
            SUPPORT_NAME_REQUIRED: "请填写姓名",
            SUPPORT_CONTACT_REQUIRED: "请填写联系方式",
            SUPPORT_TOPIC_REQUIRED: "请选择问题类型",
            SUPPORT_TOPIC_INVALID: "请选择有效的问题类型",
            SUPPORT_MESSAGE_REQUIRED: "请填写问题描述",
            SUPPORT_MESSAGE_TOO_LONG: "问题描述不能超过 1000 个字符"
          }
```

Also add English equivalents.

- [ ] **Step 5: Implement submit handler**

Add:

```js
    function clearSupportContactErrors() {
      supportContactForm.querySelectorAll("[data-support-contact-error]").forEach((node) => {
        node.textContent = "";
      });
      const formError = supportContactForm.querySelector("[data-support-contact-error][role='alert']");
      if (formError) formError.textContent = "";
    }

    function showSupportContactError(code) {
      const errorText = t(`support.errors.${code}`) || t("support.errors.SUPPORT_MESSAGE_REQUIRED");
      const fieldMap = {
        SUPPORT_NAME_REQUIRED: "name",
        SUPPORT_CONTACT_REQUIRED: "contact",
        SUPPORT_TOPIC_REQUIRED: "topic",
        SUPPORT_TOPIC_INVALID: "topic",
        SUPPORT_MESSAGE_REQUIRED: "message",
        SUPPORT_MESSAGE_TOO_LONG: "message"
      };
      const fieldName = fieldMap[code];
      const fieldError = fieldName ? supportContactForm.querySelector(`[data-support-contact-error='${fieldName}']`) : null;
      if (fieldError) {
        fieldError.textContent = errorText;
      }
    }

    supportContactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearSupportContactErrors();
      const submitButton = supportContactForm.querySelector("[data-support-contact-submit]");
      const formData = new FormData(supportContactForm);
      submitButton.disabled = true;
      submitButton.textContent = t("support.submitting");

      try {
        const response = await fetch("/api/support/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.get("name"),
            contact: formData.get("contact"),
            topic: formData.get("topic"),
            orderId: formData.get("orderId"),
            message: formData.get("message"),
            locale: activeLocale
          })
        });
        const payload = await response.json();

        if (!response.ok) {
          showSupportContactError(payload.error?.code || "SUPPORT_MESSAGE_REQUIRED");
          return;
        }

        supportTicket.hidden = false;
        supportTicket.innerHTML = `
          <strong>${t("support.successTitle")}</strong>
          <p>${payload.ticket.ticketNumber}</p>
          <p>${t("support.responseTime")}</p>
        `;
        supportContactForm.reset();
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = t("support.submit");
      }
    });
```

- [ ] **Step 6: Run FAQ/contact UI tests**

Run:

```powershell
chcp 65001 > $null; npx playwright test tests/socks-product-list.spec.js -g "FAQ|contact form" --reporter=list
```

Expected: focused FAQ and contact tests pass.

- [ ] **Step 7: Commit**

```powershell
chcp 65001 > $null; git add -- socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: add trust center contact flow"
```

## Task 7: Locale, Detail/Checkout/Order Integration, And Mobile Coverage

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Write failing locale and cross-view tests**

Add:

```js
test("renders trust center in English", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=support&section=privacy&locale=en-US");

  await expect(page.locator("[data-support-title]")).toHaveText("Help Center");
  await expect(page.locator("[data-support-current-title]")).toHaveText("Privacy Policy");
});

test("keeps global shell on detail checkout order and support views", async ({ page }) => {
  for (const path of [
    "/socks-product-list.html?view=detail&id=sock-01",
    "/socks-product-list.html?view=checkout",
    "/socks-product-list.html?view=order",
    "/socks-product-list.html?view=support&section=faq"
  ]) {
    await page.goto(path);
    await expect(page.locator("[data-site-header]")).toBeVisible();
    await expect(page.locator("[data-site-footer]")).toBeVisible();
  }
});

test("trust center has no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/socks-product-list.html?view=support&section=contact");

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});
```

- [ ] **Step 2: Ensure locale changes refetch trust content**

Where locale changes are handled, call:

```js
      if (getCurrentView() === SUPPORT_VIEW_KEY) {
        fetchTrustCenter().catch(() => {
          supportCurrentTitle.textContent = t("support.loadFailure");
        });
      }
```

Add translation:

```js
          loadFailure: "帮助内容加载失败，请稍后重试。"
```

English:

```js
          loadFailure: "Help content failed to load. Please try again."
```

- [ ] **Step 3: Ensure app initialization loads trust center when needed**

In the main startup sequence, add:

```js
      if (getCurrentView() === SUPPORT_VIEW_KEY) {
        fetchTrustCenter().catch(() => {
          supportCurrentTitle.textContent = t("support.loadFailure");
        });
      }
```

Also call `renderSupportView()` after `syncPageView()` when `trustCenterState.sections.length > 0`.

- [ ] **Step 4: Run locale/mobile tests**

Run:

```powershell
chcp 65001 > $null; npx playwright test tests/socks-product-list.spec.js -g "English|global shell|horizontal overflow" --reporter=list
```

Expected: focused UI tests pass.

- [ ] **Step 5: Commit**

```powershell
chcp 65001 > $null; git add -- socks-product-list.html tests/socks-product-list.spec.js; git commit -m "feat: localize trust center shell"
```

## Task 8: Final Verification

**Files:**
- Verify only unless focused failures require edits.

- [ ] **Step 1: Run full API tests**

Run:

```powershell
chcp 65001 > $null; $env:NODE_ENV='test'; npx playwright test tests/api.spec.js --reporter=list
```

Expected: all API tests pass.

- [ ] **Step 2: Run focused UI support tests**

Run:

```powershell
chcp 65001 > $null; npx playwright test tests/socks-product-list.spec.js -g "trust center|returns policy|footer policy|FAQ|contact form|English|global shell|horizontal overflow" --reporter=list
```

Expected: all support-related UI tests pass.

- [ ] **Step 3: Run smoke check for core storefront**

Run:

```powershell
chcp 65001 > $null; npx playwright test tests/socks-product-list.spec.js -g "renders product cards|navigates from a product card|submits checkout" --reporter=list
```

Expected: core listing/detail/checkout smoke tests still pass.

- [ ] **Step 4: Check git state**

Run:

```powershell
chcp 65001 > $null; git status --short
```

Expected: no uncommitted changes. If there are verification-only report files, inspect them before deciding whether to ignore or commit.

## Scope Guardrails

- Do not add real email sending, external chat, third-party tracking, or a support admin panel in this phase.
- Do not create multiple HTML pages for policies.
- Do not perform high-concurrency test runs or repeated health checks; use the focused commands above.
- Keep all new Chinese text as normal UTF-8 characters, not escaped Unicode.
- Use SQLite as the persisted source for support tickets.

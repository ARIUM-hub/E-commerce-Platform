# Socks User Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add demo-real user registration, login sessions, user carts, address management, and user order history to the socks storefront.

**Architecture:** Keep the current Node HTTP server and JSON-file persistence. Add `users.json`, `sessions.json`, and `user-carts.json`; resolve the active cart from the HTTP-only session cookie; bind checkout orders to the logged-in user and expose account, address, auth, and order-history views through the existing single HTML page routing model.

**Tech Stack:** Node.js HTTP server, Node built-in `crypto`, JSON file persistence, HTTP-only cookies, vanilla HTML/CSS/JS, Playwright tests.

---

## File Structure

- Create: `data/users.json` for demo user records and embedded addresses.
- Create: `data/sessions.json` for cookie-backed session records.
- Create: `data/user-carts.json` for per-user cart records.
- Create: `tests/fixtures/test-data/users.json` for isolated test users.
- Create: `tests/fixtures/test-data/sessions.json` for isolated test sessions.
- Create: `tests/fixtures/test-data/user-carts.json` for isolated test user carts.
- Modify: `server.js` to add auth helpers, cookie parsing, session-aware cart resolution, address APIs, order ownership, and user order history.
- Modify: `tests/api.spec.js` to add API coverage for auth, sessions, cart merge, addresses, order ownership, and order history.
- Modify: `socks-product-list.html` to add auth/account/address/order-history views and connect checkout to user addresses.
- Modify: `tests/socks-product-list.spec.js` to cover account UI, anonymous cart transfer, address management, checkout with saved address, and order history.

---

### Task 1: Add User Session Data Files

**Files:**
- Create: `data/users.json`
- Create: `data/sessions.json`
- Create: `data/user-carts.json`
- Create: `tests/fixtures/test-data/users.json`
- Create: `tests/fixtures/test-data/sessions.json`
- Create: `tests/fixtures/test-data/user-carts.json`
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing data fixture test**

Add these constants near the top of `tests/api.spec.js`:

```js
const usersFile = path.join(__dirname, "fixtures", "test-data", "users.json");
const sessionsFile = path.join(__dirname, "fixtures", "test-data", "sessions.json");
const userCartsFile = path.join(__dirname, "fixtures", "test-data", "user-carts.json");
```

Update `test.beforeEach` in `tests/api.spec.js`:

```js
test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(ordersFile, `${JSON.stringify({ orders: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(usersFile, `${JSON.stringify({ users: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(sessionsFile, `${JSON.stringify({ sessions: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(userCartsFile, `${JSON.stringify({ carts: [] }, null, 2)}\n`, "utf8");
});
```

Add this test near the existing fixture test:

```js
test("returns empty user session fixtures by default", async () => {
  const users = JSON.parse(await fs.readFile(usersFile, "utf8"));
  const sessions = JSON.parse(await fs.readFile(sessionsFile, "utf8"));
  const userCarts = JSON.parse(await fs.readFile(userCartsFile, "utf8"));

  expect(users).toEqual({ users: [] });
  expect(sessions).toEqual({ sessions: [] });
  expect(userCarts).toEqual({ carts: [] });
});
```

- [ ] **Step 2: Run the fixture test and verify it fails**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "empty user session fixtures"
```

Expected: FAIL because `tests/fixtures/test-data/users.json`, `sessions.json`, and `user-carts.json` do not exist.

- [ ] **Step 3: Add user session JSON files**

Create `data/users.json`:

```json
{
  "users": []
}
```

Create `data/sessions.json`:

```json
{
  "sessions": []
}
```

Create `data/user-carts.json`:

```json
{
  "carts": []
}
```

Create `tests/fixtures/test-data/users.json`:

```json
{
  "users": []
}
```

Create `tests/fixtures/test-data/sessions.json`:

```json
{
  "sessions": []
}
```

Create `tests/fixtures/test-data/user-carts.json`:

```json
{
  "carts": []
}
```

- [ ] **Step 4: Wire server data file validation**

Modify the top of `server.js`:

```js
const usersFile = path.join(dataDir, "users.json");
const sessionsFile = path.join(dataDir, "sessions.json");
const userCartsFile = path.join(dataDir, "user-carts.json");
const requiredDataFiles = [
  "products.json",
  "cart.json",
  "orders.json",
  "users.json",
  "sessions.json",
  "user-carts.json"
];
```

- [ ] **Step 5: Run the fixture test and verify it passes**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "empty user session fixtures"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add data/users.json data/sessions.json data/user-carts.json tests/fixtures/test-data/users.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/api.spec.js server.js
git commit -m "feat: add user session fixtures"
```

---

### Task 2: Add Registration, Login, Logout, And Session APIs

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing auth API tests**

Add this helper to `tests/api.spec.js` after `checkoutPayload`:

```js
const registerPayload = {
  name: "Alex Chen",
  email: "alex@example.com",
  password: "demo1234"
};

function getSessionCookie(response) {
  const setCookie = response.headers()["set-cookie"] || "";
  const match = /socks_session=([^;]+)/.exec(setCookie);
  return match ? `socks_session=${match[1]}` : "";
}
```

Add these tests:

```js
test("registers a user and creates an http-only session", async ({ request }) => {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  expect(response.headers()["set-cookie"]).toContain("SameSite=Lax");

  const payload = await response.json();
  expect(payload.user).toMatchObject({
    name: "Alex Chen",
    email: "alex@example.com",
    addresses: []
  });
  expect(payload.user.id).toMatch(/^user-\d{4}$/);
  expect(payload.user.passwordHash).toBeUndefined();
  expect(payload.cart).toEqual({ items: [], meta: { itemCount: 0 } });

  const users = JSON.parse(await fs.readFile(usersFile, "utf8"));
  expect(users.users).toHaveLength(1);
  expect(users.users[0].passwordHash).toMatch(/^sha256:/);
  expect(users.users[0].passwordSalt.length).toBeGreaterThan(8);

  const sessions = JSON.parse(await fs.readFile(sessionsFile, "utf8"));
  expect(sessions.sessions).toHaveLength(1);
});

test("rejects duplicate user registration emails", async ({ request }) => {
  await request.post("/api/auth/register", { data: registerPayload });

  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("EMAIL_ALREADY_REGISTERED");
});

test("logs in a registered user and returns the active session user", async ({ request }) => {
  await request.post("/api/auth/register", { data: registerPayload });

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  expect(loginResponse.ok()).toBe(true);

  const sessionCookie = getSessionCookie(loginResponse);
  expect(sessionCookie).toContain("socks_session=");

  const sessionResponse = await request.get("/api/session", {
    headers: { cookie: sessionCookie }
  });
  expect(sessionResponse.ok()).toBe(true);
  const sessionPayload = await sessionResponse.json();
  expect(sessionPayload.authenticated).toBe(true);
  expect(sessionPayload.user.email).toBe(registerPayload.email);
});

test("rejects login with an incorrect password", async ({ request }) => {
  await request.post("/api/auth/register", { data: registerPayload });

  const response = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: "wrong-password" }
  });
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_CREDENTIALS");
});

test("logs out and clears the active session", async ({ request }) => {
  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const sessionCookie = getSessionCookie(registerResponse);

  const logoutResponse = await request.post("/api/auth/logout", {
    headers: { cookie: sessionCookie }
  });
  expect(logoutResponse.ok()).toBe(true);
  expect(logoutResponse.headers()["set-cookie"]).toContain("Max-Age=0");

  const sessionResponse = await request.get("/api/session", {
    headers: { cookie: sessionCookie }
  });
  expect(sessionResponse.ok()).toBe(true);
  await expect(sessionResponse.json()).resolves.toMatchObject({
    authenticated: false,
    user: null
  });
});
```

- [ ] **Step 2: Run auth tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "registers a user|duplicate user|logs in|incorrect password|logs out"
```

Expected: FAIL with `405` or route not found for auth endpoints.

- [ ] **Step 3: Add auth constants and helpers**

Modify the import line at the top of `server.js`:

```js
const crypto = require("node:crypto");
```

Add these constants after `orderStatusLabels`:

```js
const sessionCookieName = "socks_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;
```

Add these helper functions before `const server = http.createServer`:

```js
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    addresses: Array.isArray(user.addresses) ? user.addresses : []
  };
}

function buildUserId(users) {
  return `user-${String(users.length + 1).padStart(4, "0")}`;
}

function createPasswordSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  const hash = crypto.createHash("sha256");
  hash.update(`${salt}:${password}`);
  return `sha256:${hash.digest("hex")}`;
}

function verifyPassword(password, user) {
  return hashPassword(password, user.passwordSalt) === user.passwordHash;
}

function createSessionId() {
  return crypto.randomBytes(24).toString("hex");
}

function getCookieValue(request, cookieName) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .map((entry) => entry.split("="))
    .find(([name]) => name === cookieName)?.[1] || "";
}

function createSessionCookie(sessionId) {
  return `${sessionCookieName}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}`;
}

function createExpiredSessionCookie() {
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

async function getSessionContext(request) {
  const sessionId = getCookieValue(request, sessionCookieName);
  if (!sessionId) {
    return { session: null, user: null };
  }

  const [sessionsPayload, usersPayload] = await Promise.all([
    readJsonFile(sessionsFile),
    readJsonFile(usersFile)
  ]);
  const now = Date.now();
  const session = (Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [])
    .find((entry) => entry.id === sessionId && new Date(entry.expiresAt).getTime() > now);
  const user = session
    ? (Array.isArray(usersPayload.users) ? usersPayload.users : []).find((entry) => entry.id === session.userId)
    : null;

  return { session, user };
}

async function createUserSession(userId) {
  const sessionsPayload = await readJsonFile(sessionsFile);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionMaxAgeSeconds * 1000);
  const session = {
    id: createSessionId(),
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  sessionsPayload.sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [];
  sessionsPayload.sessions.push(session);
  await writeJsonFile(sessionsFile, sessionsPayload);
  return session;
}

async function removeSession(sessionId) {
  const sessionsPayload = await readJsonFile(sessionsFile);
  sessionsPayload.sessions = (Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [])
    .filter((session) => session.id !== sessionId);
  await writeJsonFile(sessionsFile, sessionsPayload);
}

function validateAuthPayload(body, mode) {
  const missingFields = [];
  if (mode === "register" && !String(body.name || "").trim()) missingFields.push("name");
  if (!normalizeEmail(body.email)) missingFields.push("email");
  if (!String(body.password || "").trim()) missingFields.push("password");
  return missingFields;
}
```

- [ ] **Step 4: Add auth routes**

Add these routes before the cart routes in `server.js`:

```js
if (request.method === "GET" && requestUrl.pathname === "/api/session") {
  try {
    const { user } = await getSessionContext(request);
    sendJson(response, 200, {
      authenticated: Boolean(user),
      user: createPublicUser(user)
    });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

if (request.method === "POST" && requestUrl.pathname === "/api/auth/register") {
  try {
    const body = await readRequestBody(request);
    const missingFields = validateAuthPayload(body, "register");
    if (missingFields.length) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "AUTH_VALIDATION_FAILED",
          message: "Registration information is incomplete.",
          fields: missingFields
        }
      });
      return;
    }

    const usersPayload = await readJsonFile(usersFile);
    usersPayload.users = Array.isArray(usersPayload.users) ? usersPayload.users : [];
    const email = normalizeEmail(body.email);
    if (usersPayload.users.some((user) => user.email === email)) {
      sendError(response, 409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
      return;
    }

    const passwordSalt = createPasswordSalt();
    const user = {
      id: buildUserId(usersPayload.users),
      name: String(body.name).trim(),
      email,
      passwordHash: hashPassword(String(body.password), passwordSalt),
      passwordSalt,
      createdAt: new Date().toISOString(),
      addresses: []
    };
    usersPayload.users.push(user);
    await writeJsonFile(usersFile, usersPayload);

    const session = await createUserSession(user.id);
    sendJsonWithHeaders(response, 201, {
      ok: true,
      user: createPublicUser(user),
      cart: getCartPayload({ items: [] })
    }, {
      "Set-Cookie": createSessionCookie(session.id)
    });
    return;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

if (request.method === "POST" && requestUrl.pathname === "/api/auth/login") {
  try {
    const body = await readRequestBody(request);
    const missingFields = validateAuthPayload(body, "login");
    if (missingFields.length) {
      sendError(response, 400, "AUTH_VALIDATION_FAILED", "Login information is incomplete.");
      return;
    }

    const usersPayload = await readJsonFile(usersFile);
    const email = normalizeEmail(body.email);
    const user = (Array.isArray(usersPayload.users) ? usersPayload.users : [])
      .find((entry) => entry.email === email);
    if (!user || !verifyPassword(String(body.password), user)) {
      sendError(response, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      return;
    }

    const session = await createUserSession(user.id);
    sendJsonWithHeaders(response, 200, {
      ok: true,
      user: createPublicUser(user),
      cart: getCartPayload({ items: [] })
    }, {
      "Set-Cookie": createSessionCookie(session.id)
    });
    return;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
  try {
    const sessionId = getCookieValue(request, sessionCookieName);
    if (sessionId) {
      await removeSession(sessionId);
    }
    sendJsonWithHeaders(response, 200, { ok: true }, {
      "Set-Cookie": createExpiredSessionCookie()
    });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 5: Run auth tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "registers a user|duplicate user|logs in|incorrect password|logs out"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: add user authentication sessions"
```

---

### Task 3: Make Cart APIs Session-Aware And Merge Anonymous Cart

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing user cart tests**

Add these tests to `tests/api.spec.js`:

```js
test("merges anonymous cart into the user cart after login", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 2 }
  });
  await request.post("/api/auth/register", { data: registerPayload });

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  const sessionCookie = getSessionCookie(loginResponse);
  const payload = await loginResponse.json();

  expect(payload.cart.items).toEqual([
    { productId: "sock-01", size: "39", quantity: 2 }
  ]);

  const userCartResponse = await request.get("/api/cart", {
    headers: { cookie: sessionCookie }
  });
  await expect(userCartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-01", size: "39", quantity: 2 }],
    meta: { itemCount: 1 }
  });

  const anonymousCart = JSON.parse(await fs.readFile(cartFile, "utf8"));
  expect(anonymousCart).toEqual({ items: [] });
});

test("keeps anonymous and logged-in carts isolated", async ({ request }) => {
  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const sessionCookie = getSessionCookie(registerResponse);

  await request.post("/api/cart/items", {
    headers: { cookie: sessionCookie },
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  await request.post("/api/auth/logout", {
    headers: { cookie: sessionCookie }
  });
  await request.post("/api/cart/items", {
    data: { productId: "sock-05", size: "39", quantity: 1 }
  });

  const anonymousCartResponse = await request.get("/api/cart");
  await expect(anonymousCartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-05", size: "39", quantity: 1 }],
    meta: { itemCount: 1 }
  });

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: registerPayload.email, password: registerPayload.password }
  });
  const nextSessionCookie = getSessionCookie(loginResponse);
  const userCartResponse = await request.get("/api/cart", {
    headers: { cookie: nextSessionCookie }
  });
  await expect(userCartResponse.json()).resolves.toEqual({
    items: [
      { productId: "sock-02", size: "43", quantity: 1 },
      { productId: "sock-05", size: "39", quantity: 1 }
    ],
    meta: { itemCount: 2 }
  });
});
```

- [ ] **Step 2: Run user cart tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "merges anonymous cart|logged-in carts isolated"
```

Expected: FAIL because `/api/cart` still always reads anonymous `cart.json`, and login does not merge carts.

- [ ] **Step 3: Add user cart helpers**

Add these functions before `const server = http.createServer` in `server.js`:

```js
function normalizeCartPayload(cart) {
  return {
    items: Array.isArray(cart.items) ? cart.items : []
  };
}

function findUserCartIndex(userCartsPayload, userId) {
  userCartsPayload.carts = Array.isArray(userCartsPayload.carts) ? userCartsPayload.carts : [];
  return userCartsPayload.carts.findIndex((cart) => cart.userId === userId);
}

async function readActiveCart(request) {
  const { user } = await getSessionContext(request);
  if (!user) {
    return {
      user: null,
      cart: normalizeCartPayload(await readJsonFile(cartFile))
    };
  }

  const userCartsPayload = await readJsonFile(userCartsFile);
  const cartIndex = findUserCartIndex(userCartsPayload, user.id);
  const cart = cartIndex === -1
    ? { userId: user.id, items: [] }
    : userCartsPayload.carts[cartIndex];

  return {
    user,
    cart: normalizeCartPayload(cart)
  };
}

async function writeActiveCart(user, cart) {
  const normalizedCart = normalizeCartPayload(cart);
  if (!user) {
    await writeJsonFile(cartFile, normalizedCart);
    return normalizedCart;
  }

  const userCartsPayload = await readJsonFile(userCartsFile);
  const cartIndex = findUserCartIndex(userCartsPayload, user.id);
  const userCart = {
    userId: user.id,
    items: normalizedCart.items
  };

  if (cartIndex === -1) {
    userCartsPayload.carts.push(userCart);
  } else {
    userCartsPayload.carts[cartIndex] = userCart;
  }

  await writeJsonFile(userCartsFile, userCartsPayload);
  return normalizedCart;
}

function mergeCartItems(baseItems, incomingItems, products) {
  const mergedItems = [...baseItems.map((item) => ({ ...item }))];
  const warnings = [];

  incomingItems.forEach((incomingItem) => {
    const product = products.find((entry) => entry.id === incomingItem.productId);
    if (!product || !product.sizes.includes(incomingItem.size)) {
      return;
    }

    const existingItem = mergedItems.find((item) => {
      return item.productId === incomingItem.productId && item.size === incomingItem.size;
    });
    const existingQuantity = existingItem ? existingItem.quantity : 0;
    const requestedQuantity = existingQuantity + incomingItem.quantity;
    const stockLimit = getProductStockLimit(product);
    const nextQuantity = stockLimit === null ? requestedQuantity : Math.min(requestedQuantity, stockLimit);

    if (stockLimit !== null && requestedQuantity > stockLimit) {
      warnings.push({
        code: "CART_MERGE_STOCK_ADJUSTED",
        productId: product.id,
        size: incomingItem.size,
        quantity: nextQuantity
      });
    }

    if (existingItem) {
      existingItem.quantity = nextQuantity;
    } else {
      mergedItems.push({
        productId: incomingItem.productId,
        size: incomingItem.size,
        quantity: nextQuantity
      });
    }
  });

  return { items: mergedItems, warnings };
}

async function mergeAnonymousCartIntoUserCart(user) {
  const [products, anonymousCart, userCartsPayload] = await Promise.all([
    readJsonFile(productsFile),
    readJsonFile(cartFile),
    readJsonFile(userCartsFile)
  ]);
  const cartIndex = findUserCartIndex(userCartsPayload, user.id);
  const currentUserCart = cartIndex === -1
    ? { userId: user.id, items: [] }
    : userCartsPayload.carts[cartIndex];
  const mergeResult = mergeCartItems(
    Array.isArray(currentUserCart.items) ? currentUserCart.items : [],
    Array.isArray(anonymousCart.items) ? anonymousCart.items : [],
    products
  );
  const nextUserCart = {
    userId: user.id,
    items: mergeResult.items
  };

  if (cartIndex === -1) {
    userCartsPayload.carts.push(nextUserCart);
  } else {
    userCartsPayload.carts[cartIndex] = nextUserCart;
  }

  await writeJsonFile(userCartsFile, userCartsPayload);
  await writeJsonFile(cartFile, { items: [] });

  return {
    cart: normalizeCartPayload(nextUserCart),
    warnings: mergeResult.warnings
  };
}
```

- [ ] **Step 4: Return merged cart from register and login**

In the register route, replace:

```js
const session = await createUserSession(user.id);
sendJsonWithHeaders(response, 201, {
  ok: true,
  user: createPublicUser(user),
  cart: getCartPayload({ items: [] })
}, {
  "Set-Cookie": createSessionCookie(session.id)
});
```

With:

```js
const session = await createUserSession(user.id);
const mergeResult = await mergeAnonymousCartIntoUserCart(user);
sendJsonWithHeaders(response, 201, {
  ok: true,
  user: createPublicUser(user),
  cart: getCartPayload(mergeResult.cart),
  cartMergeWarnings: mergeResult.warnings
}, {
  "Set-Cookie": createSessionCookie(session.id)
});
```

In the login route, replace:

```js
const session = await createUserSession(user.id);
sendJsonWithHeaders(response, 200, {
  ok: true,
  user: createPublicUser(user),
  cart: getCartPayload({ items: [] })
}, {
  "Set-Cookie": createSessionCookie(session.id)
});
```

With:

```js
const session = await createUserSession(user.id);
const mergeResult = await mergeAnonymousCartIntoUserCart(user);
sendJsonWithHeaders(response, 200, {
  ok: true,
  user: createPublicUser(user),
  cart: getCartPayload(mergeResult.cart),
  cartMergeWarnings: mergeResult.warnings
}, {
  "Set-Cookie": createSessionCookie(session.id)
});
```

- [ ] **Step 5: Update cart routes to use active cart**

In `GET /api/cart`, replace anonymous cart reading with:

```js
const { cart } = await readActiveCart(request);
sendJson(response, 200, getCartPayload(cart));
```

In `POST /api/cart/items`, replace:

```js
const cart = await readJsonFile(cartFile);
```

With:

```js
const activeCart = await readActiveCart(request);
const cart = activeCart.cart;
```

Replace:

```js
await writeJsonFile(cartFile, cart);
```

With:

```js
await writeActiveCart(activeCart.user, cart);
```

Apply the same active-cart replacement in `PATCH /api/cart/items`, `DELETE /api/cart/items`, and `POST /api/cart/clear`.

In `POST /api/cart/clear`, use:

```js
const activeCart = await readActiveCart(request);
const emptyCart = { items: [] };
await writeActiveCart(activeCart.user, emptyCart);
sendJson(response, 200, {
  ok: true,
  items: [],
  meta: { itemCount: 0 }
});
return;
```

- [ ] **Step 6: Run user cart tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "merges anonymous cart|logged-in carts isolated"
```

Expected: PASS.

- [ ] **Step 7: Run cart regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "cart"
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: make carts session aware"
```

---

### Task 4: Add Address Management APIs

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing address API tests**

Add this payload to `tests/api.spec.js`:

```js
const addressPayload = {
  name: "Alex Chen",
  contact: "alex@example.com",
  address: "100 Demo Street",
  city: "Seattle",
  region: "WA",
  postalCode: "98101",
  note: "Leave at the door"
};
```

Add this helper:

```js
async function registerAndGetCookie(request) {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  return getSessionCookie(response);
}
```

Add these tests:

```js
test("requires authentication for address management", async ({ request }) => {
  const response = await request.get("/api/me/addresses");
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("AUTH_REQUIRED");
});

test("creates lists updates defaults and deletes user addresses", async ({ request }) => {
  const sessionCookie = await registerAndGetCookie(request);

  const createResponse = await request.post("/api/me/addresses", {
    headers: { cookie: sessionCookie },
    data: addressPayload
  });
  expect(createResponse.status()).toBe(201);
  const createPayload = await createResponse.json();
  expect(createPayload.address).toMatchObject({
    ...addressPayload,
    isDefault: true
  });
  expect(createPayload.address.id).toMatch(/^addr-\d{4}$/);

  const secondResponse = await request.post("/api/me/addresses", {
    headers: { cookie: sessionCookie },
    data: {
      ...addressPayload,
      address: "200 Work Avenue",
      postalCode: "98102"
    }
  });
  expect(secondResponse.status()).toBe(201);
  const secondAddress = (await secondResponse.json()).address;
  expect(secondAddress.isDefault).toBe(false);

  const defaultResponse = await request.post(`/api/me/addresses/${secondAddress.id}/default`, {
    headers: { cookie: sessionCookie }
  });
  expect(defaultResponse.ok()).toBe(true);
  const defaultPayload = await defaultResponse.json();
  expect(defaultPayload.addresses.find((address) => address.id === secondAddress.id).isDefault).toBe(true);

  const patchResponse = await request.patch(`/api/me/addresses/${secondAddress.id}`, {
    headers: { cookie: sessionCookie },
    data: { note: "Front desk" }
  });
  expect(patchResponse.ok()).toBe(true);
  expect((await patchResponse.json()).address.note).toBe("Front desk");

  const deleteResponse = await request.delete(`/api/me/addresses/${secondAddress.id}`, {
    headers: { cookie: sessionCookie }
  });
  expect(deleteResponse.ok()).toBe(true);
  const deletePayload = await deleteResponse.json();
  expect(deletePayload.addresses).toHaveLength(1);
  expect(deletePayload.addresses[0].isDefault).toBe(true);
});
```

- [ ] **Step 2: Run address tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "address management|user addresses"
```

Expected: FAIL because address routes are missing.

- [ ] **Step 3: Add address helpers**

Add these helpers before `const server = http.createServer`:

```js
function getRequiredAddressFields(body) {
  const missingFields = [];
  if (!String(body.name || "").trim()) missingFields.push("name");
  if (!String(body.contact || "").trim()) missingFields.push("contact");
  if (!String(body.address || "").trim()) missingFields.push("address");
  if (!String(body.city || "").trim()) missingFields.push("city");
  if (!String(body.region || "").trim()) missingFields.push("region");
  if (!String(body.postalCode || "").trim()) missingFields.push("postalCode");
  return missingFields;
}

function buildAddressId(addresses) {
  return `addr-${String(addresses.length + 1).padStart(4, "0")}`;
}

function normalizeAddressPayload(body, existingAddress = {}) {
  return {
    ...existingAddress,
    name: String(body.name ?? existingAddress.name ?? "").trim(),
    contact: String(body.contact ?? existingAddress.contact ?? "").trim(),
    address: String(body.address ?? existingAddress.address ?? "").trim(),
    city: String(body.city ?? existingAddress.city ?? "").trim(),
    region: String(body.region ?? existingAddress.region ?? "").trim(),
    postalCode: String(body.postalCode ?? existingAddress.postalCode ?? "").trim(),
    note: String(body.note ?? existingAddress.note ?? "").trim()
  };
}

async function requireUser(request, response) {
  const { user } = await getSessionContext(request);
  if (!user) {
    sendError(response, 401, "AUTH_REQUIRED", "Authentication is required.");
    return null;
  }
  return user;
}

async function updateUser(userId, updater) {
  const usersPayload = await readJsonFile(usersFile);
  usersPayload.users = Array.isArray(usersPayload.users) ? usersPayload.users : [];
  const userIndex = usersPayload.users.findIndex((user) => user.id === userId);
  if (userIndex === -1) {
    return null;
  }

  const nextUser = updater(usersPayload.users[userIndex]);
  usersPayload.users[userIndex] = nextUser;
  await writeJsonFile(usersFile, usersPayload);
  return nextUser;
}

function parseAddressPath(pathname, suffix = "") {
  const escapedSuffix = suffix.replaceAll("/", "\\/");
  const match = pathname.match(new RegExp(`^\\/api\\/me\\/addresses\\/([^/]+)${escapedSuffix}$`));
  return match ? decodeURIComponent(match[1]) : null;
}
```

- [ ] **Step 4: Add address routes**

Add these routes before the order routes:

```js
if (request.method === "GET" && requestUrl.pathname === "/api/me/addresses") {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    sendJson(response, 200, { addresses: Array.isArray(user.addresses) ? user.addresses : [] });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

if (request.method === "POST" && requestUrl.pathname === "/api/me/addresses") {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    const body = await readRequestBody(request);
    const missingFields = getRequiredAddressFields(body);
    if (missingFields.length) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "ADDRESS_VALIDATION_FAILED",
          message: "Address information is incomplete.",
          fields: missingFields
        }
      });
      return;
    }

    const nextUser = await updateUser(user.id, (currentUser) => {
      const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
      const address = {
        id: buildAddressId(addresses),
        ...normalizeAddressPayload(body),
        isDefault: addresses.length === 0
      };
      return {
        ...currentUser,
        addresses: [...addresses, address]
      };
    });
    const address = nextUser.addresses[nextUser.addresses.length - 1];
    sendJson(response, 201, { ok: true, address, addresses: nextUser.addresses });
    return;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

const requestedAddressId = parseAddressPath(requestUrl.pathname);
if (request.method === "PATCH" && requestedAddressId) {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    const body = await readRequestBody(request);
    let updatedAddress = null;
    const nextUser = await updateUser(user.id, (currentUser) => {
      const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
      const addressIndex = addresses.findIndex((address) => address.id === requestedAddressId);
      if (addressIndex === -1) {
        return currentUser;
      }
      const nextAddresses = [...addresses];
      updatedAddress = normalizeAddressPayload(body, nextAddresses[addressIndex]);
      nextAddresses[addressIndex] = updatedAddress;
      return { ...currentUser, addresses: nextAddresses };
    });
    if (!updatedAddress) {
      sendError(response, 404, "ADDRESS_NOT_FOUND", "Address was not found.");
      return;
    }
    sendJson(response, 200, { ok: true, address: updatedAddress, addresses: nextUser.addresses });
    return;
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
      return;
    }
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

const defaultAddressId = parseAddressPath(requestUrl.pathname, "/default");
if (request.method === "POST" && defaultAddressId) {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    let foundAddress = false;
    const nextUser = await updateUser(user.id, (currentUser) => {
      const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
      foundAddress = addresses.some((address) => address.id === defaultAddressId);
      if (!foundAddress) {
        return currentUser;
      }
      return {
        ...currentUser,
        addresses: addresses.map((address) => ({
          ...address,
          isDefault: address.id === defaultAddressId
        }))
      };
    });
    if (!foundAddress) {
      sendError(response, 404, "ADDRESS_NOT_FOUND", "Address was not found.");
      return;
    }
    sendJson(response, 200, {
      ok: true,
      addresses: nextUser.addresses
    });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}

if (request.method === "DELETE" && requestedAddressId) {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    let foundAddress = false;
    const nextUser = await updateUser(user.id, (currentUser) => {
      const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
      foundAddress = addresses.some((address) => address.id === requestedAddressId);
      if (!foundAddress) {
        return currentUser;
      }
      const nextAddresses = addresses.filter((address) => address.id !== requestedAddressId);
      if (nextAddresses.length && !nextAddresses.some((address) => address.isDefault)) {
        nextAddresses[0] = { ...nextAddresses[0], isDefault: true };
      }
      return { ...currentUser, addresses: nextAddresses };
    });
    if (!foundAddress) {
      sendError(response, 404, "ADDRESS_NOT_FOUND", "Address was not found.");
      return;
    }
    sendJson(response, 200, {
      ok: true,
      addresses: nextUser.addresses
    });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 5: Run address tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "address management|user addresses"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: add user address management"
```

---

### Task 5: Bind Orders To Users And Add User Order History

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `server.js`

- [ ] **Step 1: Write failing user order tests**

Add these tests:

```js
async function createLoggedInOrder(request, userPayload = registerPayload) {
  const registerResponse = await request.post("/api/auth/register", { data: userPayload });
  const sessionCookie = getSessionCookie(registerResponse);
  await request.post("/api/cart/items", {
    headers: { cookie: sessionCookie },
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  const response = await request.post("/api/orders", {
    headers: { cookie: sessionCookie },
    data: checkoutPayload
  });
  expect(response.status()).toBe(201);
  return {
    sessionCookie,
    order: (await response.json()).order
  };
}

test("creates orders with the logged-in user id and lists user order history", async ({ request }) => {
  const { sessionCookie, order } = await createLoggedInOrder(request);
  expect(order.userId).toMatch(/^user-\d{4}$/);

  const historyResponse = await request.get("/api/me/orders", {
    headers: { cookie: sessionCookie }
  });
  expect(historyResponse.ok()).toBe(true);
  const historyPayload = await historyResponse.json();
  expect(historyPayload.orders).toHaveLength(1);
  expect(historyPayload.orders[0]).toMatchObject({
    id: order.id,
    status: "pending_payment",
    userId: order.userId
  });
});

test("does not expose another user's order detail", async ({ request }) => {
  const { order } = await createLoggedInOrder(request);
  const secondRegisterResponse = await request.post("/api/auth/register", {
    data: {
      name: "Mia Wong",
      email: "mia@example.com",
      password: "demo1234"
    }
  });
  const secondSessionCookie = getSessionCookie(secondRegisterResponse);

  const response = await request.get(`/api/orders/${order.id}`, {
    headers: { cookie: secondSessionCookie }
  });
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.error.code).toBe("ORDER_NOT_FOUND");
});

test("requires login for user order history", async ({ request }) => {
  const response = await request.get("/api/me/orders");
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("AUTH_REQUIRED");
});
```

- [ ] **Step 2: Run user order tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "logged-in user id|another user's order|user order history"
```

Expected: FAIL because orders are not yet bound to users and `/api/me/orders` is missing.

- [ ] **Step 3: Bind created orders to session user**

In `POST /api/orders`, after reading request body, add:

```js
const { user } = await getSessionContext(request);
```

In the `order` object, add:

```js
userId: user ? user.id : null,
```

The order object should include:

```js
const order = {
  id: buildOrderId(ordersPayload.orders),
  userId: user ? user.id : null,
  status: "pending_payment",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  customer: {
    name: String(body.customer.name).trim(),
    contact: String(body.customer.contact).trim()
  },
  shippingAddress: {
    address: String(body.shippingAddress.address).trim(),
    city: String(body.shippingAddress.city).trim(),
    region: String(body.shippingAddress.region).trim(),
    postalCode: String(body.shippingAddress.postalCode).trim(),
    note: String(body.shippingAddress.note || "").trim()
  },
  shippingMethod,
  items: orderItems,
  totals: calculateOrderTotals(orderItems, shippingMethod.fee),
  timeline: [createTimelineEntry("pending_payment", locale)]
};
```

- [ ] **Step 4: Create orders from active cart**

In `POST /api/orders`, replace:

```js
const cart = await readJsonFile(cartFile);
```

With:

```js
const activeCart = await readActiveCart(request);
const cart = activeCart.cart;
```

When clearing after order creation, replace:

```js
await writeJsonFile(cartFile, emptyCart);
```

With:

```js
await writeActiveCart(activeCart.user, emptyCart);
```

- [ ] **Step 5: Restrict order detail reads**

In `GET /api/orders/:id`, after finding `order`, add:

```js
const { user } = await getSessionContext(request);
if (order.userId && (!user || user.id !== order.userId)) {
  sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
  return;
}
```

In `PATCH /api/orders/:id/status`, after reading `order`, add:

```js
const { user } = await getSessionContext(request);
if (order.userId && (!user || user.id !== order.userId)) {
  sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
  return;
}
```

- [ ] **Step 6: Add `GET /api/me/orders` route**

Add this route before `GET /api/orders/:id`:

```js
if (request.method === "GET" && requestUrl.pathname === "/api/me/orders") {
  try {
    const user = await requireUser(request, response);
    if (!user) return;

    const ordersPayload = await readJsonFile(ordersFile);
    const orders = (Array.isArray(ordersPayload.orders) ? ordersPayload.orders : [])
      .filter((order) => order.userId === user.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    sendJson(response, 200, { orders });
    return;
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    return;
  }
}
```

- [ ] **Step 7: Run user order tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "logged-in user id|another user's order|user order history"
```

Expected: PASS.

- [ ] **Step 8: Run order lifecycle regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "order"
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add server.js tests/api.spec.js
git commit -m "feat: bind orders to user sessions"
```

---

### Task 6: Add Frontend Auth State And Auth Views

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing frontend auth tests**

Add these tests near existing shell tests in `tests/socks-product-list.spec.js`:

```js
test("shows login and register entry points when the visitor is anonymous", async ({ page }) => {
  await page.goto("/socks-product-list.html");

  await expect(page.locator("[data-auth-login-link]")).toBeVisible();
  await expect(page.locator("[data-auth-register-link]")).toBeVisible();
  await expect(page.locator("[data-auth-user-name]")).toHaveCount(0);
});

test("registers from the auth view and updates the storefront header", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=auth&mode=register");

  await page.locator('[data-auth-field="name"]').fill("Alex Chen");
  await page.locator('[data-auth-field="email"]').fill("alex@example.com");
  await page.locator('[data-auth-field="password"]').fill("demo1234");

  const registerResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/register") && response.request().method() === "POST";
  });
  await page.locator("[data-auth-submit]").click();
  expect((await registerResponse).status()).toBe(201);

  await expect(page.locator("[data-auth-user-name]")).toHaveText("Alex Chen");
  await expect(page.locator("[data-auth-logout]")).toBeVisible();
});

test("logs out from the storefront header", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=auth&mode=register");
  await page.locator('[data-auth-field="name"]').fill("Alex Chen");
  await page.locator('[data-auth-field="email"]').fill("alex@example.com");
  await page.locator('[data-auth-field="password"]').fill("demo1234");
  await page.locator("[data-auth-submit]").click();

  const logoutResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/logout") && response.request().method() === "POST";
  });
  await page.locator("[data-auth-logout]").click();
  expect((await logoutResponse).ok()).toBe(true);

  await expect(page.locator("[data-auth-login-link]")).toBeVisible();
  await expect(page.locator("[data-auth-register-link]")).toBeVisible();
});
```

- [ ] **Step 2: Run frontend auth tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "login and register|registers from the auth view|logs out"
```

Expected: FAIL because auth UI and auth view are missing.

- [ ] **Step 3: Add auth view HTML and shell hooks**

In `socks-product-list.html`, add a new auth view before the checkout view:

```html
<div class="auth-view" data-auth-view hidden>
  <section class="hero">
    <p class="hero__eyebrow" data-auth-eyebrow>Account</p>
    <h1 class="hero__title" data-auth-title>Sign in</h1>
    <p class="hero__description" data-auth-copy>Use a demo account to keep cart, addresses, and orders together.</p>
  </section>

  <section class="order-panel">
    <form class="checkout-form" data-auth-form novalidate>
      <label class="checkout-field" data-auth-name-row>
        Name
        <input name="name" data-auth-field="name">
      </label>
      <label class="checkout-field">
        Email
        <input name="email" data-auth-field="email">
      </label>
      <label class="checkout-field">
        Password
        <input name="password" type="password" data-auth-field="password">
      </label>
      <div class="checkout-form__error" data-auth-error role="alert"></div>
      <button class="cart-drawer__checkout-button" type="submit" data-auth-submit>Continue</button>
    </form>
  </section>
</div>
```

Add account controls in the site header account area:

```html
<div class="site-account" data-auth-shell>
  <a href="/socks-product-list.html?view=auth&mode=login" data-auth-login-link>Login</a>
  <a href="/socks-product-list.html?view=auth&mode=register" data-auth-register-link>Register</a>
  <span data-auth-user-name hidden></span>
  <a href="/socks-product-list.html?view=orders" data-auth-orders-link hidden>Orders</a>
  <a href="/socks-product-list.html?view=addresses" data-auth-addresses-link hidden>Addresses</a>
  <button type="button" data-auth-logout hidden>Logout</button>
</div>
```

If the existing header already has account markup, keep its layout classes and add the `data-*` nodes inside that area.

- [ ] **Step 4: Add auth state JavaScript**

Add these constants and DOM refs near existing view constants:

```js
const AUTH_VIEW_KEY = "auth";
let currentUser = null;

const authView = document.querySelector("[data-auth-view]");
const authForm = document.querySelector("[data-auth-form]");
const authTitle = document.querySelector("[data-auth-title]");
const authCopy = document.querySelector("[data-auth-copy]");
const authNameRow = document.querySelector("[data-auth-name-row]");
const authError = document.querySelector("[data-auth-error]");
const authSubmit = document.querySelector("[data-auth-submit]");
const authLoginLink = document.querySelector("[data-auth-login-link]");
const authRegisterLink = document.querySelector("[data-auth-register-link]");
const authUserName = document.querySelector("[data-auth-user-name]");
const authOrdersLink = document.querySelector("[data-auth-orders-link]");
const authAddressesLink = document.querySelector("[data-auth-addresses-link]");
const authLogoutButton = document.querySelector("[data-auth-logout]");
```

Update `getCurrentView()`:

```js
if (view === AUTH_VIEW_KEY) {
  return AUTH_VIEW_KEY;
}
```

Update `syncPageView()`:

```js
const isAuthView = currentView === AUTH_VIEW_KEY;
authView.hidden = !isAuthView;
```

Add these helpers:

```js
function getAuthMode() {
  return getSearchParams().get("mode") === "register" ? "register" : "login";
}

function renderAuthShell() {
  const isAuthenticated = Boolean(currentUser);
  authLoginLink.hidden = isAuthenticated;
  authRegisterLink.hidden = isAuthenticated;
  authUserName.hidden = !isAuthenticated;
  authOrdersLink.hidden = !isAuthenticated;
  authAddressesLink.hidden = !isAuthenticated;
  authLogoutButton.hidden = !isAuthenticated;
  authUserName.textContent = currentUser ? currentUser.name : "";
}

function renderAuthView() {
  const mode = getAuthMode();
  authTitle.textContent = mode === "register" ? "Create account" : "Sign in";
  authCopy.textContent = mode === "register"
    ? "Create a demo account to keep your socks cart and orders together."
    : "Sign in to restore your cart, addresses, and order history.";
  authNameRow.hidden = mode !== "register";
  authSubmit.textContent = mode === "register" ? "Create account" : "Sign in";
  authError.textContent = "";
}

async function fetchSession() {
  const response = await fetch("/api/session");
  if (!response.ok) {
    currentUser = null;
    renderAuthShell();
    return null;
  }

  const payload = await response.json();
  currentUser = payload.authenticated ? payload.user : null;
  renderAuthShell();
  return payload;
}

async function submitAuthForm(form) {
  const mode = getAuthMode();
  const formData = new FormData(form);
  const payload = {
    email: formData.get("email"),
    password: formData.get("password")
  };

  if (mode === "register") {
    payload.name = formData.get("name");
  }

  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await createCartRequestError(response, "Authentication failed");
  }

  return response.json();
}

async function logoutUser() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Logout failed");
  }
  currentUser = null;
  renderAuthShell();
}
```

Update `initializePage()` so it calls `await fetchSession()` before rendering the active view:

```js
await fetchSession();
```

Add auth form and logout listeners:

```js
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;

  try {
    const payload = await submitAuthForm(authForm);
    currentUser = payload.user;
    cartState = {
      items: Array.isArray(payload.cart?.items) ? payload.cart.items : []
    };
    renderAuthShell();
    renderCartState();
    window.history.replaceState({}, "", STOREFRONT_PATH);
    syncPageView();
    await renderProducts();
  } catch (error) {
    authError.textContent = error.code === "EMAIL_ALREADY_REGISTERED"
      ? "This email is already registered."
      : "Email or password is incorrect.";
  } finally {
    authSubmit.disabled = false;
  }
});

authLogoutButton.addEventListener("click", async () => {
  try {
    await logoutUser();
    await fetchCart();
  } catch (error) {
    renderAuthShell();
  }
});
```

- [ ] **Step 5: Run frontend auth tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "login and register|registers from the auth view|logs out"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add storefront auth views"
```

---

### Task 7: Add Frontend Address Management And Checkout Address Selection

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing frontend address and checkout tests**

Add this helper to `tests/socks-product-list.spec.js`:

```js
async function registerFromUi(page) {
  await page.goto("/socks-product-list.html?view=auth&mode=register");
  await page.locator('[data-auth-field="name"]').fill("Alex Chen");
  await page.locator('[data-auth-field="email"]').fill("alex@example.com");
  await page.locator('[data-auth-field="password"]').fill("demo1234");
  await page.locator("[data-auth-submit]").click();
  await expect(page.locator("[data-auth-user-name]")).toHaveText("Alex Chen");
}
```

Add these tests:

```js
test("manages saved addresses from the addresses view", async ({ page }) => {
  await registerFromUi(page);
  await page.goto("/socks-product-list.html?view=addresses");

  await page.locator('[data-address-field="name"]').fill("Alex Chen");
  await page.locator('[data-address-field="contact"]').fill("alex@example.com");
  await page.locator('[data-address-field="address"]').fill("100 Demo Street");
  await page.locator('[data-address-field="city"]').fill("Seattle");
  await page.locator('[data-address-field="region"]').fill("WA");
  await page.locator('[data-address-field="postalCode"]').fill("98101");

  const createAddressResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/me/addresses") && response.request().method() === "POST";
  });
  await page.locator("[data-address-submit]").click();
  expect((await createAddressResponse).status()).toBe(201);

  await expect(page.locator("[data-address-card]")).toHaveCount(1);
  await expect(page.locator("[data-address-card]")).toContainText("100 Demo Street");
  await expect(page.locator("[data-address-default-badge]")).toBeVisible();
});

test("uses a default saved address during checkout", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");
  await registerFromUi(page);
  await page.goto("/socks-product-list.html?view=addresses");
  await page.locator('[data-address-field="name"]').fill("Alex Chen");
  await page.locator('[data-address-field="contact"]').fill("alex@example.com");
  await page.locator('[data-address-field="address"]').fill("100 Demo Street");
  await page.locator('[data-address-field="city"]').fill("Seattle");
  await page.locator('[data-address-field="region"]').fill("WA");
  await page.locator('[data-address-field="postalCode"]').fill("98101");
  await page.locator("[data-address-submit]").click();

  await page.goto("/socks-product-list.html?view=checkout");
  await expect(page.locator("[data-checkout-address-option]")).toContainText("100 Demo Street");

  const orderResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/orders") && response.request().method() === "POST";
  });
  await page.locator("[data-checkout-submit]").click();
  expect((await orderResponse).status()).toBe(201);

  await expect(page).toHaveURL(/view=order&id=SOCK-/);
  await expect(page.locator("[data-order-address]")).toContainText("100 Demo Street");
});
```

- [ ] **Step 2: Run frontend address tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "saved addresses|default saved address"
```

Expected: FAIL because addresses view and checkout address selection are missing.

- [ ] **Step 3: Add addresses view HTML**

Add this view before the checkout view:

```html
<div class="addresses-view" data-addresses-view hidden>
  <section class="hero">
    <p class="hero__eyebrow">Address Book</p>
    <h1 class="hero__title">Saved addresses</h1>
    <p class="hero__description">Manage the delivery addresses used during checkout.</p>
  </section>
  <section class="order-panel">
    <form class="checkout-form" data-address-form novalidate>
      <label class="checkout-field">Name<input name="name" data-address-field="name"></label>
      <label class="checkout-field">Contact<input name="contact" data-address-field="contact"></label>
      <label class="checkout-field">Address<input name="address" data-address-field="address"></label>
      <label class="checkout-field">City<input name="city" data-address-field="city"></label>
      <label class="checkout-field">State / Region<input name="region" data-address-field="region"></label>
      <label class="checkout-field">Postal code<input name="postalCode" data-address-field="postalCode"></label>
      <label class="checkout-field">Note<textarea name="note" data-address-field="note"></textarea></label>
      <div class="checkout-form__error" data-address-error role="alert"></div>
      <button class="cart-drawer__checkout-button" type="submit" data-address-submit>Save address</button>
    </form>
    <div class="checkout-summary" data-address-list></div>
  </section>
</div>
```

- [ ] **Step 4: Add address JavaScript**

Add refs:

```js
const ADDRESSES_VIEW_KEY = "addresses";
let addressBook = [];

const addressesView = document.querySelector("[data-addresses-view]");
const addressForm = document.querySelector("[data-address-form]");
const addressList = document.querySelector("[data-address-list]");
const addressError = document.querySelector("[data-address-error]");
```

Update `getCurrentView()`:

```js
if (view === ADDRESSES_VIEW_KEY) {
  return ADDRESSES_VIEW_KEY;
}
```

Update `syncPageView()`:

```js
const isAddressesView = currentView === ADDRESSES_VIEW_KEY;
addressesView.hidden = !isAddressesView;
```

Add helpers:

```js
async function fetchAddresses() {
  const response = await fetch("/api/me/addresses");
  if (!response.ok) {
    addressBook = [];
    return [];
  }

  const payload = await response.json();
  addressBook = Array.isArray(payload.addresses) ? payload.addresses : [];
  return addressBook;
}

function getAddressFormPayload(form) {
  const formData = new FormData(form);
  return {
    name: formData.get("name"),
    contact: formData.get("contact"),
    address: formData.get("address"),
    city: formData.get("city"),
    region: formData.get("region"),
    postalCode: formData.get("postalCode"),
    note: formData.get("note")
  };
}

function renderAddressList() {
  if (!addressBook.length) {
    addressList.innerHTML = `<div class="empty-state" data-address-empty-state>No saved addresses yet.</div>`;
    return;
  }

  addressList.innerHTML = addressBook.map((address) => `
    <article class="checkout-summary__item" data-address-card data-address-id="${address.id}">
      <span>${address.name}</span>
      <span>${address.address} ${address.city} ${address.region} ${address.postalCode}</span>
      ${address.isDefault ? `<span data-address-default-badge>Default</span>` : `<button type="button" data-address-default="${address.id}">Set default</button>`}
      <button type="button" data-address-delete="${address.id}">Delete</button>
    </article>
  `).join("");
}

async function renderAddressesView() {
  if (!currentUser) {
    addressList.innerHTML = `<div class="empty-state" data-auth-required>Please sign in to manage addresses.</div>`;
    return;
  }

  await fetchAddresses();
  renderAddressList();
}

async function createAddress(payload) {
  const response = await fetch("/api/me/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to save address");
  }
  return response.json();
}
```

Add listeners:

```js
addressForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  addressError.textContent = "";

  try {
    const payload = await createAddress(getAddressFormPayload(addressForm));
    addressBook = payload.addresses;
    addressForm.reset();
    renderAddressList();
  } catch (error) {
    addressError.textContent = "Complete the address before saving.";
  }
});

addressList.addEventListener("click", async (event) => {
  const defaultButton = event.target.closest("[data-address-default]");
  if (defaultButton) {
    const response = await fetch(`/api/me/addresses/${encodeURIComponent(defaultButton.dataset.addressDefault)}/default`, {
      method: "POST"
    });
    const payload = await response.json();
    addressBook = payload.addresses;
    renderAddressList();
    return;
  }

  const deleteButton = event.target.closest("[data-address-delete]");
  if (deleteButton) {
    const response = await fetch(`/api/me/addresses/${encodeURIComponent(deleteButton.dataset.addressDelete)}`, {
      method: "DELETE"
    });
    const payload = await response.json();
    addressBook = payload.addresses;
    renderAddressList();
  }
});
```

Update `initializePage()`:

```js
if (getCurrentView() === ADDRESSES_VIEW_KEY) {
  await renderAddressesView();
  return;
}
```

- [ ] **Step 5: Use default address on checkout**

In `renderCheckoutPage()`, before rendering form markup, find default address:

```js
const defaultAddress = addressBook.find((address) => address.isDefault) || addressBook[0] || null;
```

Add address option markup above checkout fields:

```js
${defaultAddress ? `
  <div class="checkout-address-option" data-checkout-address-option data-address-id="${defaultAddress.id}">
    <strong>${defaultAddress.name}</strong>
    <span>${defaultAddress.address} ${defaultAddress.city} ${defaultAddress.region} ${defaultAddress.postalCode}</span>
  </div>
` : ""}
```

Use default values in fields:

```html
<input name="name" data-checkout-field="customer.name" value="${defaultAddress ? defaultAddress.name : ""}">
<input name="contact" data-checkout-field="customer.contact" value="${defaultAddress ? defaultAddress.contact : ""}">
<input name="address" data-checkout-field="shippingAddress.address" value="${defaultAddress ? defaultAddress.address : ""}">
<input name="city" data-checkout-field="shippingAddress.city" value="${defaultAddress ? defaultAddress.city : ""}">
<input name="region" data-checkout-field="shippingAddress.region" value="${defaultAddress ? defaultAddress.region : ""}">
<input name="postalCode" data-checkout-field="shippingAddress.postalCode" value="${defaultAddress ? defaultAddress.postalCode : ""}">
<textarea name="note" data-checkout-field="shippingAddress.note">${defaultAddress ? defaultAddress.note : ""}</textarea>
```

When initializing checkout, fetch addresses before `renderCheckoutPage()`:

```js
if (currentUser) {
  await fetchAddresses();
}
renderCheckoutPage();
```

- [ ] **Step 6: Run frontend address tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "saved addresses|default saved address"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add address book checkout flow"
```

---

### Task 8: Add Frontend User Order History

**Files:**
- Modify: `tests/socks-product-list.spec.js`
- Modify: `socks-product-list.html`

- [ ] **Step 1: Write failing frontend order history tests**

Add this test:

```js
test("shows the logged-in user's order history after checkout", async ({ page }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 1 }]
  }, null, 2)}\n`, "utf8");
  await registerFromUi(page);
  await page.goto("/socks-product-list.html?view=checkout");
  await page.locator('[data-checkout-field="customer.name"]').fill("Alex Chen");
  await page.locator('[data-checkout-field="customer.contact"]').fill("alex@example.com");
  await page.locator('[data-checkout-field="shippingAddress.address"]').fill("100 Demo Street");
  await page.locator('[data-checkout-field="shippingAddress.city"]').fill("Seattle");
  await page.locator('[data-checkout-field="shippingAddress.region"]').fill("WA");
  await page.locator('[data-checkout-field="shippingAddress.postalCode"]').fill("98101");
  await page.locator("[data-checkout-submit]").click();

  await page.goto("/socks-product-list.html?view=orders");
  await expect(page.locator("[data-order-history-card]")).toHaveCount(1);
  await expect(page.locator("[data-order-history-card]")).toContainText("SOCK-");
  await expect(page.locator("[data-order-history-card]")).toContainText("Minimal Crew Socks");
});

test("requires login before showing order history", async ({ page }) => {
  await page.goto("/socks-product-list.html?view=orders");

  await expect(page.locator("[data-auth-required]")).toContainText("sign in");
});
```

- [ ] **Step 2: Run order history tests and verify they fail**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "order history"
```

Expected: FAIL because `?view=orders` is missing.

- [ ] **Step 3: Add orders history view HTML**

Add this view before the single order view:

```html
<div class="orders-view" data-orders-view hidden>
  <section class="hero">
    <p class="hero__eyebrow">Order History</p>
    <h1 class="hero__title">Your orders</h1>
    <p class="hero__description">Review orders created by the current demo account.</p>
  </section>

  <section class="order-panel" data-order-history-panel></section>
</div>
```

- [ ] **Step 4: Add order history JavaScript**

Add refs:

```js
const ORDERS_VIEW_KEY = "orders";
const ordersView = document.querySelector("[data-orders-view]");
const orderHistoryPanel = document.querySelector("[data-order-history-panel]");
```

Update `getCurrentView()`:

```js
if (view === ORDERS_VIEW_KEY) {
  return ORDERS_VIEW_KEY;
}
```

Update `syncPageView()`:

```js
const isOrdersView = currentView === ORDERS_VIEW_KEY;
ordersView.hidden = !isOrdersView;
```

Add helpers:

```js
async function fetchUserOrders() {
  const response = await fetch("/api/me/orders");
  if (!response.ok) {
    throw await createCartRequestError(response, "Failed to load order history");
  }
  return response.json();
}

function renderOrderHistory(orders) {
  if (!currentUser) {
    orderHistoryPanel.innerHTML = `<div class="empty-state" data-auth-required>Please sign in to view order history.</div>`;
    return;
  }

  if (!orders.length) {
    orderHistoryPanel.innerHTML = `<div class="empty-state" data-order-history-empty>No orders yet.</div>`;
    return;
  }

  orderHistoryPanel.innerHTML = `
    <div class="checkout-summary">
      ${orders.map((order) => `
        <a class="checkout-summary__item" href="${STOREFRONT_PATH}?view=order&id=${encodeURIComponent(order.id)}" data-order-history-card>
          <span>${order.id}</span>
          <span>${order.items.map((item) => item.title).join(", ")}</span>
          <span>${order.timeline[order.timeline.length - 1].label}</span>
          <span>${formatCurrency(order.totals.total)}</span>
        </a>
      `).join("")}
    </div>
  `;
}

async function renderOrdersView() {
  if (!currentUser) {
    renderOrderHistory([]);
    return;
  }

  const payload = await fetchUserOrders();
  renderOrderHistory(Array.isArray(payload.orders) ? payload.orders : []);
}
```

Update `initializePage()`:

```js
if (getCurrentView() === ORDERS_VIEW_KEY) {
  await renderOrdersView();
  return;
}
```

- [ ] **Step 5: Run order history tests and verify they pass**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "order history"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add socks-product-list.html tests/socks-product-list.spec.js
git commit -m "feat: add user order history"
```

---

### Task 9: Final Targeted Verification

**Files:**
- Verify: `server.js`
- Verify: `socks-product-list.html`
- Verify: `tests/api.spec.js`
- Verify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: Run targeted auth and user API tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- tests/api.spec.js --grep "auth|session|address|user cart|user order|logged-in"
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend user flow tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "auth|address|order history|user cart|default saved address"
```

Expected: PASS.

- [ ] **Step 3: Run existing checkout and cart regression tests**

Run:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; npm test -- --grep "checkout|persisted order|order status|cart drawer|cart state|add-to-cart|removes selected size"
```

Expected: PASS with only already-known skipped tests for the removed legacy drawer confirmation flow.

- [ ] **Step 4: Manual smoke check**

Start one local service:

```powershell
chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; node server.js
```

Open:

```text
http://127.0.0.1:4173/socks-product-list.html
```

Manual flow:

```text
匿名加购袜子 -> 注册账号 -> 确认购物车数量保留 -> 地址管理新增默认地址 -> 去结算 -> 使用默认地址提交订单 -> 打开订单历史 -> 进入订单详情 -> 模拟付款 -> 登出 -> 订单历史提示登录
```

Expected:

```text
匿名购物车合并到用户购物车，订单绑定当前用户，订单历史只展示当前用户订单，登出后用户数据入口要求登录。
```

- [ ] **Step 5: Commit verification fixes if needed**

If verification required no code changes, skip this commit. If small copy or selector fixes were required, run:

```powershell
git add server.js socks-product-list.html tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "test: verify user session flow"
```

---

## Self-Review

- Spec coverage: registration, login, logout, current session, HTTP-only cookie, anonymous cart merge, user cart isolation, address CRUD, default address, checkout address use, order `userId`, order history, and order access control are mapped to Tasks 1-8.
- Placeholder scan: plan uses concrete file names, route names, commands, payloads, and expected statuses; no unresolved feature markers remain.
- Type consistency: user fields use `id`, `name`, `email`, `passwordHash`, `passwordSalt`, `addresses`; session fields use `id`, `userId`, `createdAt`, `expiresAt`; user carts use `userId` and `items`; order ownership uses `userId`.
- Scope control: no external auth provider, no database, no real payment, no email verification, no model/provider probing, and no high-frequency tests.

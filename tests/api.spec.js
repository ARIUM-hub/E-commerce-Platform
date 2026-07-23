const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect, request: playwrightRequest } = require("@playwright/test");

const cartFile = path.join(__dirname, "fixtures", "test-data", "cart.json");
const ordersFile = path.join(__dirname, "fixtures", "test-data", "orders.json");
const usersFile = path.join(__dirname, "fixtures", "test-data", "users.json");
const sessionsFile = path.join(__dirname, "fixtures", "test-data", "sessions.json");
const userCartsFile = path.join(__dirname, "fixtures", "test-data", "user-carts.json");
const testDbFile = path.join(__dirname, "fixtures", "test-data", "socks-store.test.db");
const {
  createDatabase,
  initializeDatabase,
  resetDatabase,
  getDatabasePath
} = require("../lib/database");

test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(ordersFile, `${JSON.stringify({ orders: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(usersFile, `${JSON.stringify({ users: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(sessionsFile, `${JSON.stringify({ sessions: [] }, null, 2)}\n`, "utf8");
  await fs.writeFile(userCartsFile, `${JSON.stringify({ carts: [] }, null, 2)}\n`, "utf8");
  await resetDatabase(testDbFile);
  const db = createDatabase(testDbFile);
  initializeDatabase(db, {
    productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
  });
  db.close();
});

test("returns an empty order collection fixture by default", async () => {
  const orders = JSON.parse(await fs.readFile(ordersFile, "utf8"));
  expect(orders).toEqual({ orders: [] });
});

test("returns empty user session fixtures by default", async () => {
  const users = JSON.parse(await fs.readFile(usersFile, "utf8"));
  const sessions = JSON.parse(await fs.readFile(sessionsFile, "utf8"));
  const userCarts = JSON.parse(await fs.readFile(userCartsFile, "utf8"));

  expect(users).toEqual({ users: [] });
  expect(sessions).toEqual({ sessions: [] });
  expect(userCarts).toEqual({ carts: [] });
});

test("initializes a SQLite database with product and SKU tables", async () => {
  await resetDatabase(testDbFile);
  const db = createDatabase(testDbFile);
  try {
    initializeDatabase(db, {
      productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json")
    });

    const product = db.prepare("SELECT id FROM products WHERE id = ?").get("sock-01");
    const sku = db.prepare("SELECT sku_id, stock_quantity FROM product_variants WHERE sku_id = ?").get("sock-01-43");

    expect(product).toEqual({ id: "sock-01" });
    expect(sku).toEqual({ sku_id: "sock-01-43", stock_quantity: 3 });
  } finally {
    db.close();
  }
});

test("uses the configured SQLite database path", () => {
  expect(getDatabasePath({ nodeEnv: "test" })).toContain("socks-store.test.db");
  expect(getDatabasePath({ nodeEnv: "production" })).toContain("socks-store.db");
});

const checkoutPayload = {
  locale: "en-US",
  customer: {
    name: "Alex Chen",
    contact: "alex@example.com"
  },
  shippingAddress: {
    address: "100 Demo Street",
    city: "Seattle",
    region: "WA",
    postalCode: "98101",
    note: "Leave at the door"
  },
  shippingMethodId: "standard"
};

const registerPayload = {
  name: "Alex Chen",
  email: "alex@example.com",
  password: "demo1234"
};

const addressPayload = {
  name: "Alex Chen",
  contact: "alex@example.com",
  address: "100 Demo Street",
  city: "Seattle",
  region: "WA",
  postalCode: "98101",
  note: "Leave at the door"
};

function getSessionCookie(response) {
  const setCookie = response.headers()["set-cookie"] || "";
  const match = /socks_session=([^;]+)/.exec(setCookie);
  return match ? `socks_session=${match[1]}` : "";
}

async function registerAndGetCookie(request) {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  return getSessionCookie(response);
}

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

  const db = createDatabase(testDbFile);
  try {
    const user = db.prepare(`
      SELECT email, password_hash AS passwordHash, password_salt AS passwordSalt
      FROM users
      WHERE email = ?
    `).get(registerPayload.email);
    const session = db.prepare("SELECT COUNT(*) AS count FROM sessions").get();

    expect(user.passwordHash).toMatch(/^sha256:/);
    expect(user.passwordSalt.length).toBeGreaterThan(8);
    expect(session.count).toBe(1);
  } finally {
    db.close();
  }
});

test("persists registered users and sessions in SQLite", async ({ request }) => {
  const response = await request.post("/api/auth/register", { data: registerPayload });
  expect(response.status()).toBe(201);
  const sessionCookie = getSessionCookie(response);
  expect(sessionCookie).toContain("socks_session=");

  const db = createDatabase(testDbFile);
  try {
    const user = db.prepare("SELECT email FROM users WHERE email = ?").get(registerPayload.email);
    const sessionId = sessionCookie.replace("socks_session=", "");
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
    expect(user).toEqual({ email: registerPayload.email });
    expect(session).toEqual({ id: sessionId });
  } finally {
    db.close();
  }
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
    { productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 2 }
  ]);

  const userCartResponse = await request.get("/api/cart", {
    headers: { cookie: sessionCookie }
  });
  await expect(userCartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 2 }],
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
    items: [{ productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }],
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
      { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 1 },
      { productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }
    ],
    meta: { itemCount: 2 }
  });
});

test("caps anonymous cart merge quantities by SKU stock", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  const registerResponse = await request.post("/api/auth/register", { data: registerPayload });
  const sessionCookie = getSessionCookie(registerResponse);

  const response = await request.post("/api/cart/items", {
    headers: { cookie: sessionCookie },
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("INSUFFICIENT_STOCK");
});

test("requires authentication for address management", async ({ request }) => {
  const response = await request.get("/api/me/addresses");
  expect(response.status()).toBe(401);

  const payload = await response.json();
  expect(payload.error.code).toBe("AUTH_REQUIRED");
});

test("returns standardized API error details for invalid cart quantity", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 0 }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload).toEqual({
    ok: false,
    error: {
      code: "INVALID_QUANTITY",
      message: expect.any(String),
      details: {}
    }
  });
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

  const listResponse = await request.get("/api/me/addresses", {
    headers: { cookie: sessionCookie }
  });
  await expect(listResponse.json()).resolves.toMatchObject({
    addresses: [createPayload.address]
  });

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

test("persists address changes in SQLite", async ({ request }) => {
  const sessionCookie = await registerAndGetCookie(request);

  const response = await request.post("/api/me/addresses", {
    headers: { cookie: sessionCookie },
    data: addressPayload
  });
  expect(response.status()).toBe(201);

  const db = createDatabase(testDbFile);
  try {
    const row = db.prepare("SELECT payload, is_default FROM addresses").get();
    expect(JSON.parse(row.payload)).toMatchObject({ address: "100 Demo Street" });
    expect(row.is_default).toBe(1);
  } finally {
    db.close();
  }
});

test("rejects order creation when cart is empty", async ({ request }) => {
  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("EMPTY_CART");
});

test("rejects order creation when required checkout fields are missing", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", {
    data: {
      locale: "en-US",
      customer: { name: "", contact: "" },
      shippingAddress: { address: "", city: "", region: "", postalCode: "" },
      shippingMethodId: "standard"
    }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("CHECKOUT_VALIDATION_FAILED");
  expect(payload.error.fields).toEqual([
    "customer.name",
    "customer.contact",
    "shippingAddress.address",
    "shippingAddress.city",
    "shippingAddress.region",
    "shippingAddress.postalCode"
  ]);
});

test("creates a persisted order from the current cart and clears the cart", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 2 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);

  const payload = await response.json();
  expect(payload.order).toMatchObject({
    status: "pending_payment",
    customer: checkoutPayload.customer,
    shippingAddress: checkoutPayload.shippingAddress,
    shippingMethod: {
      id: "standard",
      fee: 0
    },
    totals: {
      subtotal: 118,
      savings: 40,
      shipping: 0,
      total: 78
    }
  });
  expect(payload.order.id).toMatch(/^SOCK-\d{8}-\d{4}$/);
  expect(payload.order.items).toEqual([
    {
      productId: "sock-01",
      skuId: "sock-01-39",
      title: "Minimal Crew Socks",
      size: "39",
      quantity: 2,
      price: 39,
      originalPrice: 59
    }
  ]);
  expect(payload.order.timeline[0].status).toBe("pending_payment");
  expect(payload.cart).toEqual({ items: [], meta: { itemCount: 0 } });

  const db = createDatabase(testDbFile);
  try {
    const persistedOrder = db.prepare("SELECT id FROM orders WHERE id = ?").get(payload.order.id);
    const cartItemCount = db.prepare("SELECT COUNT(*) AS count FROM cart_items").get();
    expect(persistedOrder).toEqual({ id: payload.order.id });
    expect(cartItemCount.count).toBe(0);
  } finally {
    db.close();
  }
});

test("persists skuId on order items created from cart", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  const payload = await response.json();

  expect(payload.order.items[0]).toMatchObject({
    productId: "sock-01",
    skuId: "sock-01-39",
    size: "39",
    quantity: 1
  });
});

test("creates SQLite orders and decrements SKU stock in one checkout transaction", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 2 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.order.items[0]).toMatchObject({ skuId: "sock-01-43", quantity: 2 });

  const db = createDatabase(testDbFile);
  try {
    const stock = db.prepare("SELECT stock_quantity FROM product_variants WHERE sku_id = ?").get("sock-01-43");
    const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(payload.order.id);
    expect(stock.stock_quantity).toBe(1);
    expect(order).toEqual({ id: payload.order.id });
  } finally {
    db.close();
  }
});

test("rolls back checkout when SKU stock is insufficient", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });

  const db = createDatabase(testDbFile);
  db.prepare("UPDATE product_variants SET stock_quantity = ? WHERE sku_id = ?").run(2, "sock-01-43");
  db.close();

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("INSUFFICIENT_STOCK");

  const cartResponse = await request.get("/api/cart");
  expect((await cartResponse.json()).items).toEqual([
    expect.objectContaining({ skuId: "sock-01-43", quantity: 3 })
  ]);
});

test("allows only one checkout to claim the final SKU stock", async ({ request }) => {
  const secondContext = await playwrightRequest.newContext({
    baseURL: "http://127.0.0.1:4173"
  });

  try {
    const firstAdd = await request.post("/api/cart/items", {
      data: { productId: "sock-01", size: "44", quantity: 2 }
    });
    const firstCookie = getSessionCookie(firstAdd);

    const secondAdd = await secondContext.post("/api/cart/items", {
      data: { productId: "sock-01", size: "44", quantity: 2 }
    });
    const secondCookie = getSessionCookie(secondAdd);

    const [firstCheckout, secondCheckout] = await Promise.all([
      request.post("/api/orders", { headers: { cookie: firstCookie }, data: checkoutPayload }),
      secondContext.post("/api/orders", { headers: { cookie: secondCookie }, data: checkoutPayload })
    ]);

    const statuses = [firstCheckout.status(), secondCheckout.status()].sort();
    expect(statuses).toEqual([201, 409]);
  } finally {
    await secondContext.dispose();
  }
});

async function createOrderViaApi(request) {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });

  const response = await request.post("/api/orders", { data: checkoutPayload });
  expect(response.status()).toBe(201);
  return response.json();
}

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

test("returns a persisted order by id", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.get(`/api/orders/${order.id}`);
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.order.id).toBe(order.id);
  expect(payload.order.status).toBe("pending_payment");
  expect(payload.order.items[0].title).toBe("Minimal Crew Socks");
});

test("returns 404 for missing order id", async ({ request }) => {
  const response = await request.get("/api/orders/SOCK-20990101-9999");
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.error.code).toBe("ORDER_NOT_FOUND");
});

test("returns standardized API error details for missing order", async ({ request }) => {
  const response = await request.get("/api/orders/SOCK-20990101-9999");
  expect(response.status()).toBe(404);

  const payload = await response.json();
  expect(payload.ok).toBe(false);
  expect(payload.error).toMatchObject({
    code: "ORDER_NOT_FOUND",
    message: expect.any(String),
    details: {}
  });
});

test("advances order status through the allowed lifecycle", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const paidResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "paid", locale: "en-US" }
  });
  expect(paidResponse.ok()).toBe(true);
  expect((await paidResponse.json()).order.status).toBe("paid");

  const processingResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "processing", locale: "en-US" }
  });
  expect(processingResponse.ok()).toBe(true);
  expect((await processingResponse.json()).order.status).toBe("processing");

  const shippedResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped", locale: "en-US" }
  });
  expect(shippedResponse.ok()).toBe(true);
  expect((await shippedResponse.json()).order.status).toBe("shipped");

  const deliveredResponse = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "delivered", locale: "en-US" }
  });
  expect(deliveredResponse.ok()).toBe(true);
  const deliveredPayload = await deliveredResponse.json();
  expect(deliveredPayload.order.status).toBe("delivered");
  expect(deliveredPayload.order.timeline.map((entry) => entry.status)).toEqual([
    "pending_payment",
    "paid",
    "processing",
    "shipped",
    "delivered"
  ]);
});

test("rejects invalid order status transitions", async ({ request }) => {
  const { order } = await createOrderViaApi(request);

  const response = await request.patch(`/api/orders/${order.id}/status`, {
    data: { status: "shipped", locale: "en-US" }
  });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_ORDER_TRANSITION");
});

test("returns products with default filter and recommended sort", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 12
  });
  expect(payload.items).toHaveLength(12);
  expect(payload.items[0].title).toBe("极简中筒袜");
  expect(payload.items[1].title).toBe("轻压运动袜");
  expect(payload.items[2].title).toBe("通勤罗口袜");
});

test("serves products from the SQLite seed database", async ({ request }) => {
  const db = createDatabase(testDbFile);
  db.prepare("UPDATE product_variants SET stock_quantity = ? WHERE sku_id = ?").run(2, "sock-01-43");
  db.close();

  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const product = payload.items.find((item) => item.id === "sock-01");

  expect(product.title).toBe("Minimal Crew Socks");
  expect(product.variants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ skuId: "sock-01-43", stockQuantity: 2 })
    ])
  );
});

test("returns English localized product content when locale=en-US is requested", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 12,
    locale: "en-US"
  });
  expect(payload.items[0]).toMatchObject({
    id: "sock-01",
    title: "Minimal Crew Socks",
    categoryLabel: "Crew Socks",
    description: "Soft, breathable fabric made for daily commuting and relaxed at-home wear."
  });
  expect(payload.items[1]).toMatchObject({
    id: "sock-02",
    title: "Compression Sport Socks",
    categoryLabel: "Sport Socks"
  });
});

test("searches localized product fields with q and locale", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US&q=quick-dry");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 1,
    locale: "en-US",
    q: "quick-dry"
  });
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({
    id: "sock-04",
    title: "Quick-Dry Training Socks"
  });
});

test("filters sport products and sorts by ascending price", async ({ request }) => {
  const response = await request.get("/api/products?filter=sport&sort=price-asc");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "sport",
    sort: "price-asc",
    count: 4
  });
  expect(payload.items.map((item) => item.title)).toEqual([
    "速干训练袜",
    "轻压运动袜",
    "夜跑反光运动袜",
    "厚底毛圈运动袜"
  ]);
});

test("falls back to default filter and recommended sort for invalid query values", async ({ request }) => {
  const response = await request.get("/api/products?filter=business&sort=featured");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 12
  });
  expect(payload.items.slice(0, 3).map((item) => item.title)).toEqual([
    "极简中筒袜",
    "轻压运动袜",
    "通勤罗口袜"
  ]);
});

test("returns an empty anonymous cart by default", async ({ request }) => {
  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload).toEqual({
    items: [],
    meta: { itemCount: 0 }
  });
});

test("does not read live cart state from JSON files after SQLite migration", async ({ request }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-01", size: "39", quantity: 99 }]
  }, null, 2)}\n`, "utf8");

  const response = await request.get("/api/cart");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    items: [],
    meta: { itemCount: 0 }
  });
});

test("adds an item to the cart and persists quantity merges", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  expect(firstAdd.ok()).toBe(true);

  const secondAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  expect(secondAdd.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);

  const cartPayload = await cartResponse.json();
  expect(cartPayload.items).toEqual([
    { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 2 }
  ]);
  expect(cartPayload.meta.itemCount).toBe(1);
});

test("persists anonymous cart items in SQLite by session cookie", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 2 }
  });
  expect(addResponse.ok()).toBe(true);

  const sessionCookie = getSessionCookie(addResponse);
  expect(sessionCookie).toContain("socks_session=");
  const sessionId = sessionCookie.replace("socks_session=", "");

  const db = createDatabase(testDbFile);
  try {
    const cart = db.prepare(`
      SELECT id, owner_type AS ownerType, session_id AS sessionId
      FROM carts
      WHERE session_id = ?
    `).get(sessionId);
    const item = db.prepare(`
      SELECT product_id AS productId, sku_id AS skuId, size, quantity
      FROM cart_items
      WHERE cart_id = ?
    `).get(cart.id);

    expect(cart).toMatchObject({
      ownerType: "anonymous",
      sessionId
    });
    expect(item).toEqual({
      productId: "sock-02",
      skuId: "sock-02-43",
      size: "43",
      quantity: 2
    });
  } finally {
    db.close();
  }

  const cartResponse = await request.get("/api/cart", {
    headers: { cookie: sessionCookie }
  });
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 2 }],
    meta: { itemCount: 1 }
  });
});

test("rejects invalid cart size values", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "35", quantity: 1 }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_SIZE");
});

test("clears the anonymous cart state", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "35", quantity: 1 }
  });
  expect(addResponse.ok()).toBe(true);

  const clearResponse = await request.post("/api/cart/clear");
  expect(clearResponse.ok()).toBe(true);

  const clearPayload = await clearResponse.json();
  expect(clearPayload).toEqual({
    ok: true,
    items: [],
    meta: { itemCount: 0 }
  });

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toEqual({
    items: [],
    meta: { itemCount: 0 }
  });
});

test("adds a valid SKU-backed size and stores skuId on the cart item", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.item).toMatchObject({
    productId: "sock-01",
    skuId: "sock-01-39",
    size: "39",
    quantity: 1
  });

  const cartResponse = await request.get("/api/cart");
  await expect(cartResponse.json()).resolves.toMatchObject({
    items: [
      { productId: "sock-01", skuId: "sock-01-39", size: "39", quantity: 1 }
    ]
  });
});

test("rejects sold-out SKU sizes", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "45", quantity: 1 }
  });
  expect(response.status()).toBe(409);

  const payload = await response.json();
  expect(payload.error.code).toBe("OUT_OF_STOCK");
});

test("enforces stock independently for each SKU size", async ({ request }) => {
  const firstResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  expect(firstResponse.ok()).toBe(true);

  const secondResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "44", quantity: 2 }
  });
  expect(secondResponse.ok()).toBe(true);

  const overLimitResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });
  expect(overLimitResponse.status()).toBe(409);
  expect((await overLimitResponse.json()).error.code).toBe("INSUFFICIENT_STOCK");
});

test("updates SKU-backed cart item quantities up to that SKU stock", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 1 }
  });

  const response = await request.patch("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 3 }
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).item).toMatchObject({
    skuId: "sock-01-43",
    quantity: 3
  });

  const overLimitResponse = await request.patch("/api/cart/items", {
    data: { productId: "sock-01", size: "43", quantity: 4 }
  });
  expect(overLimitResponse.status()).toBe(409);
  expect((await overLimitResponse.json()).error.code).toBe("INSUFFICIENT_STOCK");
});

test("ignores legacy JSON cart items when enforcing SQLite cart stock limits", async ({ request }) => {
  await fs.writeFile(cartFile, `${JSON.stringify({
    items: [{ productId: "sock-10", size: "35", quantity: 8 }]
  }, null, 2)}\n`, "utf8");

  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 1 }
  });

  expect(response.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  await expect(cartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-10", skuId: "sock-10-35", size: "35", quantity: 1 }],
    meta: { itemCount: 1 }
  });
});

test("updates an existing cart item quantity", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  expect(addResponse.ok()).toBe(true);

  const updateResponse = await request.fetch("/api/cart/items", {
    method: "PATCH",
    data: { productId: "sock-02", size: "43", quantity: 3 }
  });
  expect(updateResponse.ok()).toBe(true);

  const updatePayload = await updateResponse.json();
  expect(updatePayload.item).toEqual({
    productId: "sock-02",
    skuId: "sock-02-43",
    size: "43",
    quantity: 3
  });

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 3 }],
    meta: { itemCount: 1 }
  });
});

test("removes a single cart item without clearing the rest", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43", quantity: 1 }
  });
  await request.post("/api/cart/items", {
    data: { productId: "sock-05", size: "39", quantity: 1 }
  });

  const removeResponse = await request.fetch("/api/cart/items", {
    method: "DELETE",
    data: { productId: "sock-02", size: "43" }
  });
  expect(removeResponse.ok()).toBe(true);

  const removePayload = await removeResponse.json();
  expect(removePayload).toEqual({
    ok: true,
    removedItem: { productId: "sock-02", skuId: "sock-02-43", size: "43", quantity: 1 },
    items: [{ productId: "sock-05", skuId: "sock-05-39", size: "39", quantity: 1 }],
    meta: { itemCount: 1 }
  });
});

test("returns rating metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock01 = payload.items.find((product) => product.id === "sock-01");

  expect(sock01).toMatchObject({
    id: "sock-01",
    ratingValue: 4.7,
    reviewCount: 1284,
    isTopRated: true
  });

  payload.items.forEach((product) => {
    expect(typeof product.ratingValue).toBe("number");
    expect(Number.isInteger(product.reviewCount)).toBe(true);
    expect(typeof product.isTopRated).toBe("boolean");
  });
});

test("keeps rating metadata in filtered product responses", async ({ request }) => {
  const response = await request.get("/api/products?filter=daily&sort=recommended");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock05 = payload.items.find((product) => product.id === "sock-05");
  expect(sock05).toMatchObject({
    id: "sock-05",
    title: "通勤罗口袜",
    ratingValue: 4.6,
    reviewCount: 973,
    isTopRated: false
  });
});

test("returns fulfillment metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock01 = payload.items.find((product) => product.id === "sock-01");

  expect(sock01).toMatchObject({
    id: "sock-01",
    shippingLabel: "FREE delivery",
    deliveryEstimate: "Get it by Sunday, July 19",
    stockLabel: "In stock",
    isLowStock: false
  });

  payload.items.forEach((product) => {
    expect(typeof product.shippingLabel).toBe("string");
    expect(typeof product.deliveryEstimate).toBe("string");
    expect(typeof product.stockLabel).toBe("string");
    expect(typeof product.isLowStock).toBe("boolean");
  });
});

test("returns SKU variants and merchandising metadata for products", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const product = payload.items.find((item) => item.id === "sock-01");

  expect(product.variants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        skuId: "sock-01-39",
        size: "39",
        color: expect.any(String),
        material: expect.any(String),
        stockQuantity: expect.any(Number),
        lowStockThreshold: expect.any(Number),
        isAvailable: expect.any(Boolean)
      })
    ])
  );
  expect(product.gallery).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(String),
        src: expect.any(String),
        alt: expect.any(String)
      })
    ])
  );
  expect(product.colors).toEqual(expect.arrayContaining(["Black", "White", "Gray"]));
  expect(product.materials.length).toBeGreaterThan(0);
  expect(product.sizeChart).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        size: "39",
        footLengthCm: expect.any(String),
        usMen: expect.any(String),
        usWomen: expect.any(String)
      })
    ])
  );
});

test("returns unique SKU ids for every product variant", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);
  const payload = await response.json();

  payload.items.forEach((product) => {
    const skuIds = product.variants.map((variant) => variant.skuId);
    expect(new Set(skuIds).size).toBe(skuIds.length);
    product.variants.forEach((variant) => {
      expect(variant.skuId).toBe(`${product.id}-${variant.size}`);
      expect(product.sizes).toContain(variant.size);
    });
  });
});

test("keeps fulfillment metadata in filtered product responses", async ({ request }) => {
  const response = await request.get("/api/products?filter=sport&sort=price-asc");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock04 = payload.items.find((product) => product.id === "sock-04");

  expect(sock04).toMatchObject({
    id: "sock-04",
    shippingLabel: "FREE delivery",
    deliveryEstimate: "Get it by Monday, July 20",
    stockLabel: "Only 5 left in stock",
    isLowStock: true
  });
});

test("returns social proof metadata for every product card", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock02 = payload.items.find((product) => product.id === "sock-02");

  expect(sock02).toMatchObject({
    id: "sock-02",
    recentlyBoughtLabel: "2K+ bought in past month",
    isBestSeller: true
  });

  payload.items.forEach((product) => {
    expect(typeof product.recentlyBoughtLabel).toBe("string");
    expect(typeof product.isBestSeller).toBe("boolean");
  });
});

test("keeps social proof independent from recommended products", async ({ request }) => {
  const response = await request.get("/api/products?filter=daily&sort=recommended");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock05 = payload.items.find((product) => product.id === "sock-05");

  expect(sock05).toMatchObject({
    id: "sock-05",
    title: "通勤罗口袜",
    recentlyBoughtLabel: "1K+ bought in past month",
    isBestSeller: false,
    isRecommended: true
  });
});

test("returns structured stock quantity for low stock products", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  const sock04 = payload.items.find((product) => product.id === "sock-04");
  const sock10 = payload.items.find((product) => product.id === "sock-10");

  expect(sock04).toMatchObject({
    id: "sock-04",
    isLowStock: true,
    stockQuantity: 5
  });
  expect(sock10).toMatchObject({
    id: "sock-10",
    isLowStock: true,
    stockQuantity: 8
  });
});

test("rejects cart additions that exceed SKU stock quantity", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 8 }
  });
  expect(firstAdd.ok()).toBe(true);

  const overLimitAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 1 }
  });
  expect(overLimitAdd.status()).toBe(409);

  const payload = await overLimitAdd.json();
  expect(payload.error.code).toBe("INSUFFICIENT_STOCK");

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-10", skuId: "sock-10-35", size: "35", quantity: 8 }],
    meta: { itemCount: 1 }
  });
});

test("rejects cart quantity updates that exceed SKU stock quantity", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-10", size: "35", quantity: 7 }
  });

  const overLimitUpdate = await request.fetch("/api/cart/items", {
    method: "PATCH",
    data: { productId: "sock-10", size: "35", quantity: 9 }
  });
  expect(overLimitUpdate.status()).toBe(409);

  const payload = await overLimitUpdate.json();
  expect(payload.error.code).toBe("INSUFFICIENT_STOCK");

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toEqual({
    items: [
      { productId: "sock-10", skuId: "sock-10-35", size: "35", quantity: 7 }
    ],
    meta: { itemCount: 1 }
  });
});

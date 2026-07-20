const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const cartFile = path.join(__dirname, "fixtures", "test-data", "cart.json");

test.beforeEach(async () => {
  await fs.writeFile(cartFile, `${JSON.stringify({ items: [] }, null, 2)}\n`, "utf8");
});

test("returns products with default filter and recommended sort", async ({ request }) => {
  const response = await request.get("/api/products");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 6
  });
  expect(payload.items).toHaveLength(6);
  expect(payload.items[0].title).toBe("极简中筒袜");
  expect(payload.items[1].title).toBe("轻压运动袜");
  expect(payload.items[2].title).toBe("通勤罗口袜");
});

test("returns English localized product content when locale=en-US is requested", async ({ request }) => {
  const response = await request.get("/api/products?locale=en-US");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 6,
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
    count: 2
  });
  expect(payload.items.map((item) => item.title)).toEqual(["速干训练袜", "轻压运动袜"]);
});

test("falls back to default filter and recommended sort for invalid query values", async ({ request }) => {
  const response = await request.get("/api/products?filter=business&sort=featured");
  expect(response.ok()).toBe(true);

  const payload = await response.json();
  expect(payload.meta).toEqual({
    filter: "all",
    sort: "recommended",
    count: 6
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

test("adds an item to the cart and persists quantity merges", async ({ request }) => {
  const firstAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43-45", quantity: 1 }
  });
  expect(firstAdd.ok()).toBe(true);

  const secondAdd = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43-45", quantity: 1 }
  });
  expect(secondAdd.ok()).toBe(true);

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);

  const cartPayload = await cartResponse.json();
  expect(cartPayload.items).toEqual([
    { productId: "sock-02", size: "43-45", quantity: 2 }
  ]);
  expect(cartPayload.meta.itemCount).toBe(1);
});

test("rejects invalid cart size values", async ({ request }) => {
  const response = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "35-38", quantity: 1 }
  });
  expect(response.status()).toBe(400);

  const payload = await response.json();
  expect(payload.error.code).toBe("INVALID_SIZE");
});

test("clears the anonymous cart state", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "35-38", quantity: 1 }
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

test("updates an existing cart item quantity", async ({ request }) => {
  const addResponse = await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43-45", quantity: 1 }
  });
  expect(addResponse.ok()).toBe(true);

  const updateResponse = await request.fetch("/api/cart/items", {
    method: "PATCH",
    data: { productId: "sock-02", size: "43-45", quantity: 3 }
  });
  expect(updateResponse.ok()).toBe(true);

  const updatePayload = await updateResponse.json();
  expect(updatePayload.item).toEqual({
    productId: "sock-02",
    size: "43-45",
    quantity: 3
  });

  const cartResponse = await request.get("/api/cart");
  expect(cartResponse.ok()).toBe(true);
  await expect(cartResponse.json()).resolves.toEqual({
    items: [{ productId: "sock-02", size: "43-45", quantity: 3 }],
    meta: { itemCount: 1 }
  });
});

test("removes a single cart item without clearing the rest", async ({ request }) => {
  await request.post("/api/cart/items", {
    data: { productId: "sock-02", size: "43-45", quantity: 1 }
  });
  await request.post("/api/cart/items", {
    data: { productId: "sock-05", size: "39-42", quantity: 1 }
  });

  const removeResponse = await request.fetch("/api/cart/items", {
    method: "DELETE",
    data: { productId: "sock-02", size: "43-45" }
  });
  expect(removeResponse.ok()).toBe(true);

  const removePayload = await removeResponse.json();
  expect(removePayload).toEqual({
    ok: true,
    removedItem: { productId: "sock-02", size: "43-45", quantity: 1 },
    items: [{ productId: "sock-05", size: "39-42", quantity: 1 }],
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

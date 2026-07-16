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

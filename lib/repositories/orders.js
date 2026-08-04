function insertOrder(db, order) {
  db.prepare(`
    INSERT INTO orders (id, user_id, status, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    order.id,
    order.userId || null,
    order.status,
    JSON.stringify(order),
    order.createdAt,
    order.updatedAt
  );

  const insertItem = db.prepare("INSERT INTO order_items (order_id, sku_id, payload) VALUES (?, ?, ?)");
  order.items.forEach((item) => {
    insertItem.run(order.id, item.skuId, JSON.stringify(item));
  });

  const insertTimeline = db.prepare("INSERT INTO order_timeline (order_id, status, label, at) VALUES (?, ?, ?, ?)");
  order.timeline.forEach((entry) => {
    insertTimeline.run(order.id, entry.status, entry.label, entry.at);
  });
}

function createOrderTransaction(db, { cart, cartId, order, afterOrderCreated }) {
  const transaction = db.transaction(() => {
    cart.items.forEach((item) => {
      const result = db.prepare(`
        UPDATE product_variants
        SET stock_quantity = stock_quantity - ?
        WHERE sku_id = ?
          AND is_available = 1
          AND stock_quantity >= ?
      `).run(item.quantity, item.skuId, item.quantity);

      if (result.changes !== 1) {
        const error = new Error("Selected size stock is not enough for the requested quantity.");
        error.code = "INSUFFICIENT_STOCK";
        throw error;
      }
    });

    insertOrder(db, order);
    if (typeof afterOrderCreated === "function") {
      afterOrderCreated(db, order);
      db.prepare("UPDATE orders SET status = ?, payload = ?, updated_at = ? WHERE id = ?")
        .run(order.status, JSON.stringify(order), order.updatedAt, order.id);
    }

    if (cartId) {
      db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cartId);
    }

    return order;
  });

  return transaction();
}

function countOrders(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM orders").get().count;
}

function listOrders(db, userId) {
  const rows = userId
    ? db.prepare("SELECT payload FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(userId)
    : db.prepare("SELECT payload FROM orders ORDER BY created_at DESC").all();

  return rows.map((row) => JSON.parse(row.payload));
}

function findOrderById(db, orderId) {
  const row = db.prepare("SELECT payload FROM orders WHERE id = ?").get(orderId);
  return row ? JSON.parse(row.payload) : null;
}

function saveOrder(db, order) {
  db.prepare("UPDATE orders SET status = ?, payload = ?, updated_at = ? WHERE id = ?")
    .run(order.status, JSON.stringify(order), order.updatedAt, order.id);

  db.prepare("DELETE FROM order_timeline WHERE order_id = ?").run(order.id);
  const insertTimeline = db.prepare("INSERT INTO order_timeline (order_id, status, label, at) VALUES (?, ?, ?, ?)");
  order.timeline.forEach((entry) => {
    insertTimeline.run(order.id, entry.status, entry.label, entry.at);
  });

  return order;
}

function getSkuByProductAndSize(db, productId, size) {
  return db.prepare(`
    SELECT
      sku_id AS skuId,
      product_id AS productId,
      size,
      stock_quantity AS stockQuantity,
      is_available AS isAvailable
    FROM product_variants
    WHERE product_id = ? AND size = ?
  `).get(productId, size);
}

function reorderItemsFromOrder(db, { order, cart, products }) {
  const productIds = new Set(products.map((product) => product.id));
  const nextItems = [...cart.items];
  const addedItems = [];
  const skippedItems = [];

  order.items.forEach((item) => {
    if (!productIds.has(item.productId)) {
      skippedItems.push({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity,
        reason: "PRODUCT_NOT_FOUND"
      });
      return;
    }

    const variant = getSkuByProductAndSize(db, item.productId, item.size);
    if (!variant || !variant.isAvailable || variant.stockQuantity <= 0) {
      skippedItems.push({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity,
        reason: "OUT_OF_STOCK"
      });
      return;
    }

    const existingItem = nextItems.find((cartItem) => cartItem.skuId === variant.skuId);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const availableToAdd = Math.max(0, variant.stockQuantity - currentQuantity);
    const quantityToAdd = Math.min(item.quantity, availableToAdd);

    if (quantityToAdd <= 0) {
      skippedItems.push({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity,
        reason: "STOCK_LIMIT"
      });
      return;
    }

    if (existingItem) {
      existingItem.quantity += quantityToAdd;
    } else {
      nextItems.push({
        productId: item.productId,
        skuId: variant.skuId,
        size: variant.size,
        quantity: quantityToAdd
      });
    }

    addedItems.push({
      productId: item.productId,
      size: variant.size,
      quantity: quantityToAdd
    });

    if (quantityToAdd < item.quantity) {
      skippedItems.push({
        productId: item.productId,
        size: item.size,
        quantity: item.quantity - quantityToAdd,
        reason: "STOCK_LIMIT"
      });
    }
  });

  return {
    items: nextItems,
    addedItems,
    skippedItems
  };
}

module.exports = {
  createOrderTransaction,
  countOrders,
  listOrders,
  findOrderById,
  reorderItemsFromOrder,
  saveOrder
};

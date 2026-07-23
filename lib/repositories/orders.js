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

function createOrderTransaction(db, { cart, cartId, order }) {
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

module.exports = {
  createOrderTransaction,
  countOrders,
  listOrders,
  findOrderById,
  saveOrder
};

function nowIso() {
  return new Date().toISOString();
}

function mapCartRow(row, items = []) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerType: row.owner_type,
    userId: row.user_id,
    sessionId: row.session_id,
    items
  };
}

function getCartItems(db, cartId) {
  return db.prepare(`
    SELECT product_id AS productId, sku_id AS skuId, size, quantity
    FROM cart_items
    WHERE cart_id = ?
    ORDER BY created_at ASC
  `).all(cartId);
}

function findCartRow(db, { userId, sessionId }) {
  if (userId) {
    return db.prepare("SELECT * FROM carts WHERE owner_type = 'user' AND user_id = ?").get(userId);
  }

  if (sessionId) {
    return db.prepare("SELECT * FROM carts WHERE owner_type = 'anonymous' AND session_id = ?").get(sessionId);
  }

  return null;
}

function buildCartId({ userId, sessionId }) {
  const ownerKey = userId || sessionId || "cart";
  return `cart-${ownerKey}`;
}

function ensureCart(db, { userId, sessionId }) {
  const existing = findCartRow(db, { userId, sessionId });
  if (existing) {
    return mapCartRow(existing, getCartItems(db, existing.id));
  }

  const timestamp = nowIso();
  const ownerType = userId ? "user" : "anonymous";
  const cartId = buildCartId({ userId, sessionId });
  db.prepare(`
    INSERT INTO carts (id, owner_type, user_id, session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cartId, ownerType, userId || null, sessionId || null, timestamp, timestamp);

  return mapCartRow(findCartRow(db, { userId, sessionId }), []);
}

function getCart(db, { userId, sessionId }) {
  const row = findCartRow(db, { userId, sessionId });
  return row ? mapCartRow(row, getCartItems(db, row.id)) : { items: [] };
}

function upsertCartItem(db, cartId, item) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO cart_items (
      cart_id, product_id, sku_id, size, quantity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cart_id, sku_id) DO UPDATE SET
      product_id = excluded.product_id,
      size = excluded.size,
      quantity = excluded.quantity,
      updated_at = excluded.updated_at
  `).run(cartId, item.productId, item.skuId, item.size, item.quantity, timestamp, timestamp);
}

function removeCartItem(db, cartId, skuId) {
  return db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND sku_id = ?").run(cartId, skuId);
}

function clearCart(db, cartId) {
  db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cartId);
}

function replaceCartItems(db, cartId, items) {
  const transaction = db.transaction(() => {
    clearCart(db, cartId);
    items.forEach((item) => upsertCartItem(db, cartId, item));
    db.prepare("UPDATE carts SET updated_at = ? WHERE id = ?").run(nowIso(), cartId);
  });
  transaction();
}

function mergeCarts(db, { anonymousSessionId, userId, mergeItems }) {
  const transaction = db.transaction(() => {
    const userCart = ensureCart(db, { userId });
    const anonymousCart = anonymousSessionId
      ? getCart(db, { sessionId: anonymousSessionId })
      : { items: [] };
    const mergeResult = mergeItems(userCart.items, anonymousCart.items);

    clearCart(db, userCart.id);
    mergeResult.items.forEach((item) => upsertCartItem(db, userCart.id, item));
    db.prepare("UPDATE carts SET updated_at = ? WHERE id = ?").run(nowIso(), userCart.id);
    if (anonymousCart.id) {
      clearCart(db, anonymousCart.id);
    }

    return {
      cart: getCart(db, { userId }),
      warnings: mergeResult.warnings || []
    };
  });

  return transaction();
}

module.exports = {
  ensureCart,
  getCart,
  getCartItems,
  upsertCartItem,
  removeCartItem,
  clearCart,
  replaceCartItems,
  mergeCarts
};

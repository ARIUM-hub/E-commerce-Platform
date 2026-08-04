const crypto = require("node:crypto");

function getOwnerSelector(owner = {}) {
  if (owner.userId) {
    return {
      ownerType: "user",
      column: "user_id",
      value: owner.userId
    };
  }

  if (owner.sessionId) {
    return {
      ownerType: "anonymous",
      column: "session_id",
      value: owner.sessionId
    };
  }

  return null;
}

function getSavedProductIds(db, owner) {
  const selector = getOwnerSelector(owner);
  if (!selector) {
    return [];
  }

  return db.prepare(`
    SELECT product_id
    FROM saved_products
    WHERE owner_type = ? AND ${selector.column} = ?
    ORDER BY datetime(saved_at) DESC, rowid DESC
  `).all(selector.ownerType, selector.value).map((row) => row.product_id);
}

function listSavedProducts(db, owner, products = []) {
  const savedProductIds = getSavedProductIds(db, owner);
  const productsById = new Map(products.map((product) => [product.id, product]));
  return {
    savedProductIds,
    items: savedProductIds
      .map((productId) => productsById.get(productId))
      .filter(Boolean)
  };
}

function saveProduct(db, owner, productId, options = {}) {
  const selector = getOwnerSelector(owner);
  if (!selector) {
    return {
      validationError: {
        code: "SAVED_PRODUCT_OWNER_REQUIRED",
        message: "A user or session is required to save products."
      }
    };
  }

  const savedAt = options.now || new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO saved_products (id, owner_type, user_id, session_id, product_id, saved_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    options.id || `saved-${crypto.randomUUID()}`,
    selector.ownerType,
    selector.ownerType === "user" ? selector.value : null,
    selector.ownerType === "anonymous" ? selector.value : null,
    productId,
    savedAt
  );

  return { ok: true };
}

function removeSavedProduct(db, owner, productId) {
  const selector = getOwnerSelector(owner);
  if (!selector) {
    return { ok: true };
  }

  db.prepare(`
    DELETE FROM saved_products
    WHERE owner_type = ? AND ${selector.column} = ? AND product_id = ?
  `).run(selector.ownerType, selector.value, productId);

  return { ok: true };
}

module.exports = {
  listSavedProducts,
  removeSavedProduct,
  saveProduct
};

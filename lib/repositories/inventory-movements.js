const crypto = require("node:crypto");

function createValidationError(code, message, statusCode = 400) {
  return { validationError: { statusCode, code, message } };
}

function normalizeRestockItems(items) {
  return Array.isArray(items) ? items.map((item) => ({
    productId: String(item.productId || "").trim(),
    skuId: String(item.skuId || "").trim(),
    quantity: Number(item.quantity)
  })) : [];
}

function mapMovementRow(row) {
  return {
    id: row.id,
    skuId: row.sku_id,
    productId: row.product_id,
    quantityDelta: row.quantity_delta,
    reason: row.reason,
    sourceType: row.source_type,
    sourceId: row.source_id,
    operationId: row.operation_id,
    createdAt: row.created_at
  };
}

function listMovementsForOperation(db, operationId, reason) {
  return db.prepare(`
    SELECT * FROM inventory_movements
    WHERE operation_id = ? AND reason = ?
    ORDER BY rowid
  `).all(operationId, reason).map(mapMovementRow);
}

function validateRestockInput(input) {
  const operationId = String(input.operationId || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceType = String(input.sourceType || "").trim();
  const sourceId = String(input.sourceId || "").trim();
  const items = normalizeRestockItems(input.items);

  if (!operationId || !reason || !sourceType || !sourceId || items.length === 0) {
    return createValidationError(
      "ADMIN_INVENTORY_MOVEMENT_INVALID",
      "Inventory movement details are required."
    );
  }

  const invalidItem = items.find((item) => {
    return !item.productId || !item.skuId || !Number.isInteger(item.quantity) || item.quantity < 1;
  });
  if (invalidItem) {
    return createValidationError(
      "ADMIN_INVENTORY_MOVEMENT_INVALID",
      "Inventory movement item is invalid."
    );
  }

  return { operationId, reason, sourceType, sourceId, items };
}

function restockItems(db, input) {
  const validation = validateRestockInput(input || {});
  if (validation.validationError) return validation;

  const { operationId, reason, sourceType, sourceId, items } = validation;
  const existing = listMovementsForOperation(db, operationId, reason);
  if (existing.length) {
    return { movements: existing, replayed: true };
  }

  const transaction = db.transaction(() => {
    const createdAt = new Date().toISOString();
    const movements = [];

    items.forEach((item) => {
      const variant = db.prepare(`
        SELECT sku_id, product_id FROM product_variants WHERE sku_id = ?
      `).get(item.skuId);
      if (!variant || variant.product_id !== item.productId) {
        throw Object.assign(new Error("SKU was not found."), {
          statusCode: 404,
          code: "ADMIN_SKU_NOT_FOUND"
        });
      }

      const movement = {
        id: `inventory-movement-${crypto.randomUUID()}`,
        skuId: item.skuId,
        productId: item.productId,
        quantityDelta: item.quantity,
        reason,
        sourceType,
        sourceId,
        operationId,
        createdAt
      };

      db.prepare(`
        INSERT INTO inventory_movements (
          id, sku_id, product_id, quantity_delta, reason,
          source_type, source_id, operation_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        movement.id,
        movement.skuId,
        movement.productId,
        movement.quantityDelta,
        movement.reason,
        movement.sourceType,
        movement.sourceId,
        movement.operationId,
        movement.createdAt
      );
      db.prepare(`
        UPDATE product_variants
        SET stock_quantity = stock_quantity + ?
        WHERE sku_id = ?
      `).run(item.quantity, item.skuId);
      movements.push(movement);
    });

    return movements;
  });

  try {
    return { movements: transaction(), replayed: false };
  } catch (error) {
    if (error.code === "ADMIN_SKU_NOT_FOUND") {
      return createValidationError(error.code, error.message, error.statusCode);
    }
    throw error;
  }
}

module.exports = {
  listMovementsForOperation,
  restockItems
};

const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);
const refundStatusTransitions = {
  requested: new Set(["processing", "failed"]),
  processing: new Set(["succeeded", "failed"]),
  succeeded: new Set([]),
  failed: new Set([])
};

const refundStatusLabels = {
  requested: { "zh-CN": "退款已申请", "en-US": "Refund requested" },
  processing: { "zh-CN": "退款处理中", "en-US": "Refund processing" },
  succeeded: { "zh-CN": "退款成功", "en-US": "Refund succeeded" },
  failed: { "zh-CN": "退款失败", "en-US": "Refund failed" }
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function getRefundStatusLabel(status, locale = "zh-CN") {
  return refundStatusLabels[status]?.[normalizeLocale(locale)] || status;
}

function createRefundSummary(refund) {
  if (!refund) return null;
  return {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
    amountCents: Number(refund.amountCents) || toCents(refund.amount),
    reason: refund.reason,
    method: refund.method,
    updatedAt: refund.updatedAt
  };
}

function parseRefundRow(row) {
  return row ? JSON.parse(row.payload) : null;
}

function toCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function mapRefundItemRow(row) {
  return {
    id: row.id,
    refundId: row.refund_id,
    orderId: row.order_id,
    productId: row.product_id,
    skuId: row.sku_id,
    title: row.title,
    size: row.size,
    quantity: row.quantity,
    unitPaidAmount: row.unit_paid_amount,
    refundAmount: row.refund_amount,
    createdAt: row.created_at
  };
}

function listRefundItemsByRefundId(db, refundId) {
  return db.prepare(`
    SELECT * FROM refund_items
    WHERE refund_id = ?
    ORDER BY rowid
  `).all(refundId).map(mapRefundItemRow);
}

function listRefundItemsByOrderId(db, orderId) {
  return db.prepare(`
    SELECT item.*
    FROM refund_items item
    JOIN refunds refund ON refund.id = item.refund_id
    WHERE item.order_id = ? AND refund.status <> 'failed'
    ORDER BY item.rowid
  `).all(orderId).map(mapRefundItemRow);
}

function getMerchandisePaidAmountCents(order, itemSubtotalCents) {
  const taxableAmount = Number(order.totals?.taxableAmount);
  if (Number.isFinite(taxableAmount)) {
    return Math.max(0, toCents(taxableAmount) - toCents(order.totals?.paymentFee));
  }

  const explicitDiscount = Number(order.totals?.discount);
  const orderDiscount = Number.isFinite(explicitDiscount)
    ? explicitDiscount
    : (Number(order.totals?.orderDiscount) || 0) + (Number(order.totals?.couponDiscount) || 0);
  return Math.max(0, itemSubtotalCents - toCents(orderDiscount));
}

function allocateOrderItemPaidAmounts(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSubtotalCents = items.map((item) => toCents(item.price) * Number(item.quantity || 0));
  const subtotalCents = itemSubtotalCents.reduce((sum, value) => sum + value, 0);
  const merchandisePaidCents = getMerchandisePaidAmountCents(order, subtotalCents);
  let assignedCents = 0;

  return items.map((item, index) => {
    const paidAmountCents = index === items.length - 1
      ? merchandisePaidCents - assignedCents
      : Math.round(merchandisePaidCents * itemSubtotalCents[index] / Math.max(1, subtotalCents));
    assignedCents += paidAmountCents;
    return { ...item, paidAmountCents: Math.max(0, paidAmountCents) };
  });
}

function getRefundableOrderSummary(db, order) {
  const allocatedItems = allocateOrderItemPaidAmounts(order);
  const refundedItems = listRefundItemsByOrderId(db, order.id);
  const refundedBySku = new Map();

  refundedItems.forEach((item) => {
    const current = refundedBySku.get(item.skuId) || { quantity: 0, amountCents: 0 };
    current.quantity += Number(item.quantity);
    current.amountCents += Number(item.refundAmount);
    refundedBySku.set(item.skuId, current);
  });

  const items = allocatedItems.map((item) => {
    const used = refundedBySku.get(item.skuId) || { quantity: 0, amountCents: 0 };
    return {
      ...item,
      purchasedQuantity: Number(item.quantity) || 0,
      refundedQuantity: used.quantity,
      remainingQuantity: Math.max(0, (Number(item.quantity) || 0) - used.quantity),
      refundedAmountCents: used.amountCents,
      refundableAmountCents: Math.max(0, item.paidAmountCents - used.amountCents)
    };
  });

  return {
    items,
    refundedAmountCents: items.reduce((sum, item) => sum + item.refundedAmountCents, 0),
    remainingOrderAmountCents: items.reduce((sum, item) => sum + item.refundableAmountCents, 0)
  };
}

function listRefundEvents(db, refundId) {
  return db.prepare(`
    SELECT status, label, description, at
    FROM refund_events
    WHERE refund_id = ?
    ORDER BY at ASC, rowid ASC
  `).all(refundId);
}

function listRefundsByOrderId(db, orderId) {
  return db.prepare(`
    SELECT payload FROM refunds
    WHERE order_id = ?
    ORDER BY created_at DESC, rowid DESC
  `).all(orderId).map((row) => {
    const refund = parseRefundRow(row);
    return {
      ...refund,
      amountCents: Number(refund.amountCents) || toCents(refund.amount),
      items: listRefundItemsByRefundId(db, refund.id),
      events: listRefundEvents(db, refund.id)
    };
  });
}

function findRefundById(db, refundId) {
  const refund = parseRefundRow(db.prepare("SELECT payload FROM refunds WHERE id = ?").get(refundId));
  if (!refund) return null;
  return {
    ...refund,
    amountCents: Number(refund.amountCents) || toCents(refund.amount),
    items: listRefundItemsByRefundId(db, refund.id),
    events: listRefundEvents(db, refund.id)
  };
}

function insertRefundEvent(db, refund, status, locale = "zh-CN", options = {}) {
  const event = {
    status,
    label: getRefundStatusLabel(status, locale),
    description: options.description || getRefundStatusLabel(status, locale),
    at: options.at || new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO refund_events (id, refund_id, order_id, status, label, description, at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `refund-event-${crypto.randomUUID()}`,
    refund.id,
    refund.orderId,
    event.status,
    event.label,
    event.description,
    event.at
  );

  return event;
}

function createRefundForOrder(db, order, {
  reason = "changed_mind",
  locale = "zh-CN",
  operationId = "",
  refundType = "order",
  returnRequestId = null
} = {}) {
  const now = new Date().toISOString();
  const amount = Number(order.totals?.total) || 0;
  const refund = {
    id: `refund-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "requested",
    amount,
    amountCents: toCents(amount),
    reason: String(reason || "changed_mind").trim() || "changed_mind",
    method: order.payment?.method || "original_payment",
    operationId: String(operationId || "").trim(),
    refundType: String(refundType || "order").trim() || "order",
    returnRequestId: returnRequestId || null,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO refunds (
      id, order_id, user_id, status, amount, reason, method,
      return_request_id, operation_id, refund_type, amount_cents,
      created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    refund.id,
    refund.orderId,
    refund.userId,
    refund.status,
    refund.amount,
    refund.reason,
    refund.method,
    refund.returnRequestId,
    refund.operationId || null,
    refund.refundType,
    refund.amountCents,
    refund.createdAt,
    refund.updatedAt,
    JSON.stringify(refund)
  );

  insertRefundEvent(db, refund, "requested", locale);
  return findRefundById(db, refund.id);
}

function createRefundValidation(statusCode, code, message) {
  return { validationError: { statusCode, code, message } };
}

function normalizeRefundItems(items) {
  return Array.isArray(items) ? items.map((item) => ({
    skuId: String(item.skuId || "").trim(),
    quantity: Number(item.quantity),
    refundAmount: Number(item.refundAmount)
  })) : [];
}

function createItemizedRefund(db, order, input = {}) {
  if (!["paid", "processing", "shipped", "delivered"].includes(order.status)) {
    return createRefundValidation(
      409,
      "ADMIN_ORDER_TRANSITION_INVALID",
      "Order is not eligible for a partial refund."
    );
  }

  const reason = String(input.reason || "").trim();
  if (!reason) {
    return createRefundValidation(
      400,
      "ADMIN_REFUND_REASON_REQUIRED",
      "Refund reason is required."
    );
  }

  const requestedItems = normalizeRefundItems(input.items);
  if (requestedItems.length === 0) {
    return createRefundValidation(
      400,
      "ADMIN_REFUND_ITEMS_REQUIRED",
      "Refund items are required."
    );
  }
  if (new Set(requestedItems.map((item) => item.skuId)).size !== requestedItems.length) {
    return createRefundValidation(
      400,
      "ADMIN_REFUND_ITEMS_REQUIRED",
      "Refund SKU items must be unique."
    );
  }

  const summary = getRefundableOrderSummary(db, order);
  const summaryBySku = new Map(summary.items.map((item) => [item.skuId, item]));
  let amountCents = 0;
  const normalizedItems = [];

  for (const requestedItem of requestedItems) {
    const orderItem = summaryBySku.get(requestedItem.skuId);
    if (!orderItem) {
      return createRefundValidation(
        400,
        "ADMIN_REFUND_ITEMS_REQUIRED",
        "Refund item was not found on the order."
      );
    }
    if (!Number.isInteger(requestedItem.quantity) || requestedItem.quantity < 1) {
      return createRefundValidation(
        400,
        "ADMIN_REFUND_QUANTITY_INVALID",
        "Refund quantity is invalid."
      );
    }
    if (requestedItem.quantity > orderItem.remainingQuantity) {
      return createRefundValidation(
        409,
        "ADMIN_REFUND_QUANTITY_EXCEEDED",
        "Refund quantity exceeds the remaining quantity."
      );
    }
    if (!Number.isInteger(requestedItem.refundAmount) || requestedItem.refundAmount < 1) {
      return createRefundValidation(
        400,
        "ADMIN_REFUND_AMOUNT_INVALID",
        "Refund amount is invalid."
      );
    }

    const unitPaidAmount = Math.floor(orderItem.paidAmountCents / Math.max(1, orderItem.purchasedQuantity));
    const quantityAmountLimit = requestedItem.quantity === orderItem.remainingQuantity
      ? orderItem.refundableAmountCents
      : unitPaidAmount * requestedItem.quantity;
    const allowedAmount = Math.min(orderItem.refundableAmountCents, quantityAmountLimit);
    if (requestedItem.refundAmount > allowedAmount) {
      return createRefundValidation(
        409,
        "ADMIN_REFUND_AMOUNT_EXCEEDED",
        "Refund amount exceeds the remaining item amount."
      );
    }

    amountCents += requestedItem.refundAmount;
    normalizedItems.push({
      ...orderItem,
      quantity: requestedItem.quantity,
      unitPaidAmount,
      refundAmount: requestedItem.refundAmount
    });
  }

  if (amountCents > summary.remainingOrderAmountCents) {
    return createRefundValidation(
      409,
      "ADMIN_REFUND_AMOUNT_EXCEEDED",
      "Refund amount exceeds the remaining order amount."
    );
  }

  const now = new Date().toISOString();
  const refund = {
    id: `refund-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "requested",
    amount: amountCents / 100,
    amountCents,
    reason,
    method: order.payment?.method || "original_payment",
    operationId: String(input.operationId || "").trim(),
    refundType: String(input.refundType || "partial").trim() || "partial",
    returnRequestId: input.returnRequestId || null,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO refunds (
      id, order_id, user_id, status, amount, reason, method,
      return_request_id, operation_id, refund_type, amount_cents,
      created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    refund.id,
    refund.orderId,
    refund.userId,
    refund.status,
    refund.amount,
    refund.reason,
    refund.method,
    refund.returnRequestId,
    refund.operationId || null,
    refund.refundType,
    refund.amountCents,
    refund.createdAt,
    refund.updatedAt,
    JSON.stringify(refund)
  );

  const insertItem = db.prepare(`
    INSERT INTO refund_items (
      id, refund_id, order_id, product_id, sku_id, title, size,
      quantity, unit_paid_amount, refund_amount, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  normalizedItems.forEach((item) => {
    insertItem.run(
      `refund-item-${crypto.randomUUID()}`,
      refund.id,
      refund.orderId,
      item.productId,
      item.skuId,
      item.title,
      item.size,
      item.quantity,
      item.unitPaidAmount,
      item.refundAmount,
      now
    );
  });
  insertRefundEvent(db, refund, "requested", input.locale);
  return { refund: findRefundById(db, refund.id) };
}

function saveRefund(db, refund) {
  const { events, ...payload } = refund;
  db.prepare("UPDATE refunds SET status = ?, updated_at = ?, payload = ? WHERE id = ?")
    .run(payload.status, payload.updatedAt, JSON.stringify(payload), payload.id);
  return payload;
}

function updateRefundStatus(db, { refund, order, status, locale = "zh-CN", saveOrder, createTimelineEntry }) {
  const nextStatus = String(status || "").trim();
  if (!refundStatusTransitions[nextStatus]) {
    return {
      validationError: {
        statusCode: 400,
        code: "REFUND_STATUS_INVALID",
        message: "Refund status is invalid."
      }
    };
  }

  const allowedStatuses = refundStatusTransitions[refund.status] || new Set();
  if (!allowedStatuses.has(nextStatus)) {
    return {
      validationError: {
        statusCode: 409,
        code: "REFUND_TRANSITION_INVALID",
        message: "Refund status transition is not allowed."
      }
    };
  }

  const transaction = db.transaction(() => {
    const now = new Date().toISOString();
    refund.status = nextStatus;
    refund.updatedAt = now;
    saveRefund(db, refund);
    insertRefundEvent(db, refund, nextStatus, locale);

    order.refund = createRefundSummary(refund);
    if (nextStatus === "succeeded") {
      const succeededAmountCents = listRefundsByOrderId(db, order.id)
        .filter((item) => item.status === "succeeded")
        .reduce((sum, item) => sum + (Number(item.amountCents) || toCents(item.amount)), 0);
      const orderAmountCents = toCents(order.totals?.total);
      if (succeededAmountCents >= orderAmountCents) {
        order.status = "refunded";
        order.updatedAt = now;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.push(createTimelineEntry("refunded", locale));
      }
    }
    saveOrder(db, order);

    return {
      refund: findRefundById(db, refund.id),
      order
    };
  });

  return transaction();
}

module.exports = {
  allocateOrderItemPaidAmounts,
  createItemizedRefund,
  createRefundForOrder,
  createRefundSummary,
  findRefundById,
  getRefundableOrderSummary,
  listRefundItemsByOrderId,
  listRefundsByOrderId,
  updateRefundStatus
};

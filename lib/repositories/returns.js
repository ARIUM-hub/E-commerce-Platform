const crypto = require("node:crypto");
const { listRefundsByOrderId } = require("./refunds");

const validLocales = new Set(["zh-CN", "en-US"]);
const validReturnTypes = new Set(["return_refund", "exchange", "refund_only"]);
const validReturnReasons = new Set(["size_issue", "quality_issue", "wrong_item", "changed_mind", "other"]);
const returnableOrderStatuses = new Set(["paid", "processing", "shipped", "delivered"]);
const countedReturnStatuses = new Set(["submitted", "reviewing", "approved", "completed"]);
const customerCancelableStatuses = new Set(["submitted", "reviewing"]);
const returnStatusTransitions = {
  submitted: new Set(["reviewing", "cancelled"]),
  reviewing: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["completed"]),
  rejected: new Set([]),
  completed: new Set([]),
  cancelled: new Set([])
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function getReturnStatusLabel(status, locale = "zh-CN") {
  const labels = {
    submitted: { "zh-CN": "已提交", "en-US": "Submitted" },
    reviewing: { "zh-CN": "审核中", "en-US": "In review" },
    approved: { "zh-CN": "已通过", "en-US": "Approved" },
    rejected: { "zh-CN": "已拒绝", "en-US": "Rejected" },
    completed: { "zh-CN": "已完成", "en-US": "Completed" },
    cancelled: { "zh-CN": "已取消", "en-US": "Cancelled" }
  };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}

function createValidationError(statusCode, code, message) {
  return { statusCode, code, message };
}

function buildReturnNumber(db, now = new Date()) {
  const dateStamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM return_requests WHERE return_number LIKE ?").get(`RET-${dateStamp}-%`);
  return `RET-${dateStamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function parseRequestRow(row) {
  return {
    id: row.id,
    returnNumber: row.return_number,
    orderId: row.order_id,
    userId: row.user_id,
    type: row.type,
    reason: row.reason,
    note: row.note || "",
    contact: row.contact,
    status: row.status,
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeReturnRequest(db, requestRow) {
  if (!requestRow) {
    return null;
  }

  const request = parseRequestRow(requestRow);
  const items = db.prepare(`
    SELECT product_id, sku_id, title, size, quantity, price, original_price
    FROM return_request_items
    WHERE return_request_id = ?
    ORDER BY rowid ASC
  `).all(request.id).map((item) => ({
    productId: item.product_id,
    skuId: item.sku_id,
    title: item.title,
    size: item.size,
    quantity: item.quantity,
    price: item.price,
    originalPrice: item.original_price
  }));
  const timeline = db.prepare(`
    SELECT status, label, at
    FROM return_request_events
    WHERE return_request_id = ?
    ORDER BY at ASC, rowid ASC
  `).all(request.id);

  return {
    ...request,
    statusLabel: getReturnStatusLabel(request.status, request.locale),
    canCancel: customerCancelableStatuses.has(request.status),
    items,
    timeline
  };
}

function listReturnRequestsByUser(db, userId) {
  return db.prepare(`
    SELECT *
    FROM return_requests
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map((row) => serializeReturnRequest(db, row));
}

function findReturnRequestById(db, returnRequestId) {
  const row = db.prepare("SELECT * FROM return_requests WHERE id = ?").get(returnRequestId);
  return serializeReturnRequest(db, row);
}

function getReturnedQuantitiesBySku(db, orderId) {
  const statusList = [...countedReturnStatuses].map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT item.sku_id AS skuId, SUM(item.quantity) AS quantity
    FROM return_request_items item
    JOIN return_requests request ON request.id = item.return_request_id
    WHERE item.order_id = ?
      AND request.status IN (${statusList})
    GROUP BY item.sku_id
  `).all(orderId, ...countedReturnStatuses);

  return new Map(rows.map((row) => [row.skuId, row.quantity]));
}

function getReturnEligibility(db, order) {
  if (!order || !returnableOrderStatuses.has(order.status)) {
    return {
      eligible: false,
      items: [],
      reason: "RETURN_ORDER_NOT_ELIGIBLE"
    };
  }

  const returnedBySku = getReturnedQuantitiesBySku(db, order.id);
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const returnedQuantity = returnedBySku.get(item.skuId) || 0;
    const returnableQuantity = Math.max(0, item.quantity - returnedQuantity);
    return {
      ...item,
      returnedQuantity,
      returnableQuantity
    };
  });

  return {
    eligible: items.some((item) => item.returnableQuantity > 0),
    items
  };
}

function normalizeRequestedItems(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
      skuId: String(item.skuId || "").trim(),
      quantity: Number.parseInt(item.quantity, 10)
    }))
    : [];
}

function validateCreatePayload(db, order, body) {
  const type = String(body.type || "").trim();
  const reason = String(body.reason || "").trim();
  const contact = String(body.contact || "").trim();
  const requestedItems = normalizeRequestedItems(body.items);

  if (!returnableOrderStatuses.has(order.status)) {
    return createValidationError(409, "RETURN_ORDER_NOT_ELIGIBLE", "Order is not eligible for returns.");
  }
  if (!validReturnTypes.has(type)) {
    return createValidationError(400, "RETURN_TYPE_INVALID", "Return type is invalid.");
  }
  if (!reason) {
    return createValidationError(400, "RETURN_REASON_REQUIRED", "Return reason is required.");
  }
  if (!validReturnReasons.has(reason)) {
    return createValidationError(400, "RETURN_REASON_REQUIRED", "Return reason is invalid.");
  }
  if (!contact) {
    return createValidationError(400, "RETURN_CONTACT_REQUIRED", "Return contact is required.");
  }
  if (requestedItems.length === 0) {
    return createValidationError(400, "RETURN_ITEM_NOT_FOUND", "Select at least one return item.");
  }

  const eligibility = getReturnEligibility(db, order);
  const orderItemsBySku = new Map(eligibility.items.map((item) => [item.skuId, item]));
  for (const requestedItem of requestedItems) {
    const orderItem = orderItemsBySku.get(requestedItem.skuId);
    if (!orderItem) {
      return createValidationError(400, "RETURN_ITEM_NOT_FOUND", "Return item was not found on this order.");
    }
    if (!Number.isInteger(requestedItem.quantity) || requestedItem.quantity < 1) {
      return createValidationError(400, "RETURN_QUANTITY_INVALID", "Return quantity is invalid.");
    }
    if (requestedItem.quantity > orderItem.returnableQuantity) {
      return createValidationError(409, "RETURN_QUANTITY_EXCEEDED", "Return quantity exceeds the remaining returnable quantity.");
    }
  }

  if (!eligibility.eligible) {
    return createValidationError(409, "RETURN_ORDER_NOT_ELIGIBLE", "Order has no returnable items.");
  }

  return null;
}

function createReturnRequest(db, order, user, body) {
  const validationError = validateCreatePayload(db, order, body);
  if (validationError) {
    return { validationError };
  }

  const now = new Date().toISOString();
  const locale = normalizeLocale(body.locale);
  const requestedItems = normalizeRequestedItems(body.items);
  const orderItemsBySku = new Map(order.items.map((item) => [item.skuId, item]));
  const request = {
    id: `return-${crypto.randomUUID()}`,
    returnNumber: buildReturnNumber(db),
    orderId: order.id,
    userId: user.id,
    type: String(body.type).trim(),
    reason: String(body.reason).trim(),
    note: String(body.note || "").trim(),
    contact: String(body.contact).trim(),
    status: "submitted",
    locale,
    createdAt: now,
    updatedAt: now
  };

  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO return_requests (
        id, return_number, order_id, user_id, type, reason, note, contact, status, locale, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id,
      request.returnNumber,
      request.orderId,
      request.userId,
      request.type,
      request.reason,
      request.note,
      request.contact,
      request.status,
      request.locale,
      request.createdAt,
      request.updatedAt
    );

    const insertItem = db.prepare(`
      INSERT INTO return_request_items (
        id, return_request_id, order_id, product_id, sku_id, title, size, quantity, price, original_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    requestedItems.forEach((requestedItem) => {
      const orderItem = orderItemsBySku.get(requestedItem.skuId);
      insertItem.run(
        `return-item-${crypto.randomUUID()}`,
        request.id,
        order.id,
        orderItem.productId,
        orderItem.skuId,
        orderItem.title,
        orderItem.size,
        requestedItem.quantity,
        orderItem.price,
        orderItem.originalPrice ?? null
      );
    });

    db.prepare(`
      INSERT INTO return_request_events (id, return_request_id, status, label, at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `return-event-${crypto.randomUUID()}`,
      request.id,
      request.status,
      getReturnStatusLabel(request.status, locale),
      now
    );
  });

  create();
  return { returnRequest: findReturnRequestById(db, request.id) };
}

function updateReturnRequestStatus(db, returnRequest, status, locale = "zh-CN", options = {}) {
  const nextStatus = String(status || "").trim();
  if (!returnStatusTransitions[nextStatus]) {
    return {
      validationError: createValidationError(400, "RETURN_STATUS_INVALID", "Return status is invalid.")
    };
  }

  const allowedNextStatuses = returnStatusTransitions[returnRequest.status] || new Set();
  if (!allowedNextStatuses.has(nextStatus)) {
    return {
      validationError: createValidationError(409, "RETURN_TRANSITION_INVALID", "Return status transition is not allowed.")
    };
  }

  const now = new Date().toISOString();
  const normalizedLocale = normalizeLocale(locale);
  const applyUpdate = () => {
    db.prepare("UPDATE return_requests SET status = ?, updated_at = ? WHERE id = ?")
      .run(nextStatus, now, returnRequest.id);
    db.prepare(`
      INSERT INTO return_request_events (id, return_request_id, status, label, at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `return-event-${crypto.randomUUID()}`,
      returnRequest.id,
      nextStatus,
      getReturnStatusLabel(nextStatus, normalizedLocale),
      now
    );
  };

  if (options.withinTransaction) {
    applyUpdate();
  } else {
    db.transaction(applyUpdate)();
  }
  return { returnRequest: findReturnRequestById(db, returnRequest.id) };
}

function listAdminReturnRequests(db, filters = {}) {
  const status = String(filters.status || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();
  return db.prepare("SELECT * FROM return_requests ORDER BY created_at DESC").all()
    .map((row) => {
      const returnRequest = serializeReturnRequest(db, row);
      return {
        ...returnRequest,
        refunds: listRefundsByOrderId(db, returnRequest.orderId)
          .filter((refund) => refund.returnRequestId === returnRequest.id)
      };
    })
    .filter((item) => !status || item.status === status)
    .filter((item) => {
      return !query
        || item.returnNumber.toLowerCase().includes(query)
        || item.orderId.toLowerCase().includes(query)
        || item.contact.toLowerCase().includes(query);
    });
}

module.exports = {
  createReturnRequest,
  findReturnRequestById,
  getReturnEligibility,
  getReturnStatusLabel,
  listAdminReturnRequests,
  listReturnRequestsByUser,
  updateReturnRequestStatus
};

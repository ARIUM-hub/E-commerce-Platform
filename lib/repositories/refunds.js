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
    reason: refund.reason,
    method: refund.method,
    updatedAt: refund.updatedAt
  };
}

function parseRefundRow(row) {
  return row ? JSON.parse(row.payload) : null;
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
      events: listRefundEvents(db, refund.id)
    };
  });
}

function findRefundById(db, refundId) {
  const refund = parseRefundRow(db.prepare("SELECT payload FROM refunds WHERE id = ?").get(refundId));
  if (!refund) return null;
  return {
    ...refund,
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

function createRefundForOrder(db, order, { reason = "changed_mind", locale = "zh-CN" } = {}) {
  const now = new Date().toISOString();
  const refund = {
    id: `refund-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "requested",
    amount: Number(order.totals?.total) || 0,
    reason: String(reason || "changed_mind").trim() || "changed_mind",
    method: order.payment?.method || "original_payment",
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO refunds (id, order_id, user_id, status, amount, reason, method, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    refund.id,
    refund.orderId,
    refund.userId,
    refund.status,
    refund.amount,
    refund.reason,
    refund.method,
    refund.createdAt,
    refund.updatedAt,
    JSON.stringify(refund)
  );

  insertRefundEvent(db, refund, "requested", locale);
  return findRefundById(db, refund.id);
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
      order.status = "refunded";
      order.updatedAt = now;
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push(createTimelineEntry("refunded", locale));
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
  createRefundForOrder,
  createRefundSummary,
  findRefundById,
  listRefundsByOrderId,
  updateRefundStatus
};

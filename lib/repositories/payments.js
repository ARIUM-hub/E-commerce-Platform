const PAYMENT_METHODS = new Set(["card", "paypal", "gift_card"]);
const PAYMENT_OUTCOMES = new Set(["succeeded", "failed"]);

function buildPaymentAttemptId(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM payment_attempts").get().count;
  return `PAY-${String(count + 1).padStart(6, "0")}`;
}

function serializePayment(row) {
  return JSON.parse(row.payload);
}

function listPaymentAttemptsByOrder(db, orderId) {
  return db.prepare(`
    SELECT payload FROM payment_attempts
    WHERE order_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(orderId).map(serializePayment);
}

function createPaymentAttempt(db, { order, method, outcome, locale, createTimelineEntry, saveOrder }) {
  const normalizedMethod = String(method || "").trim();
  const normalizedOutcome = String(outcome || "").trim();

  if (!PAYMENT_METHODS.has(normalizedMethod)) {
    return {
      validationError: {
        statusCode: 400,
        code: "PAYMENT_METHOD_INVALID",
        message: "Payment method is invalid."
      }
    };
  }

  if (!PAYMENT_OUTCOMES.has(normalizedOutcome)) {
    return {
      validationError: {
        statusCode: 400,
        code: "PAYMENT_OUTCOME_INVALID",
        message: "Payment outcome is invalid."
      }
    };
  }

  if (order.status !== "pending_payment") {
    return {
      validationError: {
        statusCode: 409,
        code: "PAYMENT_ORDER_NOT_PAYABLE",
        message: "Order is not payable."
      }
    };
  }

  const now = new Date().toISOString();
  const status = normalizedOutcome === "succeeded" ? "succeeded" : "failed";
  const payment = {
    id: buildPaymentAttemptId(db),
    orderId: order.id,
    userId: order.userId || null,
    method: normalizedMethod,
    status,
    amount: order.totals.total,
    failureReason: status === "failed" ? "Demo payment was declined. Please try another method." : "",
    createdAt: now,
    updatedAt: now
  };

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO payment_attempts
        (id, order_id, user_id, method, status, amount, failure_reason, created_at, updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payment.id,
      payment.orderId,
      payment.userId,
      payment.method,
      payment.status,
      payment.amount,
      payment.failureReason || null,
      payment.createdAt,
      payment.updatedAt,
      JSON.stringify(payment)
    );

    order.updatedAt = now;
    order.payment = {
      status,
      method: normalizedMethod,
      latestAttemptId: payment.id
    };

    if (status === "succeeded") {
      order.status = "paid";
      order.payment.paidAt = now;
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push(createTimelineEntry("paid", locale));
    } else {
      order.payment.failureReason = payment.failureReason;
    }

    saveOrder(db, order);

    return { payment, order };
  });

  return transaction();
}

module.exports = {
  createPaymentAttempt,
  listPaymentAttemptsByOrder
};

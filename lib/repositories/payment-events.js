const crypto = require("node:crypto");

const validWebhookStatuses = new Set(["succeeded", "failed"]);
const finalOrderStatuses = new Set(["paid", "cancelled", "refund_pending", "refunded"]);

function parseEvent(row) {
  return row ? JSON.parse(row.payload) : null;
}

function findEventByIdempotencyKey(db, idempotencyKey) {
  return parseEvent(db.prepare("SELECT payload FROM payment_events WHERE idempotency_key = ?").get(idempotencyKey));
}

function insertPaymentEvent(db, event) {
  db.prepare(`
    INSERT INTO payment_events (
      id, payment_id, order_id, provider, status, event_status,
      idempotency_key, signature, processed_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.paymentId,
    event.orderId,
    event.provider,
    event.status,
    event.eventStatus,
    event.idempotencyKey,
    event.signature,
    event.processedAt,
    JSON.stringify(event)
  );
  return event;
}

function processPaymentWebhook(db, {
  body,
  findOrderById,
  saveOrder,
  findPaymentAttemptById,
  savePaymentAttempt,
  createTimelineEntry,
  createInvoiceForOrder
}) {
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  const duplicateEvent = idempotencyKey ? findEventByIdempotencyKey(db, idempotencyKey) : null;
  if (duplicateEvent) {
    const order = findOrderById(db, duplicateEvent.orderId);
    const payment = findPaymentAttemptById(db, duplicateEvent.paymentId);
    const invoice = order?.payment?.invoiceId ? createInvoiceForOrder(db, order, payment) : null;
    return { event: { ...duplicateEvent, eventStatus: "duplicate" }, payment, order, invoice };
  }

  if (!idempotencyKey || body.signature !== "demo-signature" || !validWebhookStatuses.has(body.status)) {
    return { validationError: { statusCode: 400, code: "PAYMENT_WEBHOOK_INVALID", message: "Payment webhook payload is invalid." } };
  }

  const payment = findPaymentAttemptById(db, body.paymentId);
  const order = findOrderById(db, body.orderId);
  if (!payment || !order || payment.orderId !== order.id) {
    return { validationError: { statusCode: 409, code: "PAYMENT_WEBHOOK_ORDER_MISMATCH", message: "Payment webhook does not match the order." } };
  }

  if (finalOrderStatuses.has(order.status)) {
    return { validationError: { statusCode: 409, code: "PAYMENT_WEBHOOK_FINAL_ORDER", message: "Order is no longer payable." } };
  }

  const transaction = db.transaction(() => {
    const now = new Date().toISOString();
    payment.status = body.status;
    payment.updatedAt = now;
    payment.failureReason = body.status === "failed"
      ? String(body.failureReason || "Demo payment was declined. Please try another method.")
      : "";
    payment.nextAction = null;
    savePaymentAttempt(db, payment);

    order.updatedAt = now;
    order.payment = {
      status: payment.status,
      method: payment.method,
      provider: payment.provider,
      latestAttemptId: payment.id,
      latestEventId: body.eventId || ""
    };

    let invoice = null;
    if (body.status === "succeeded") {
      order.status = "paid";
      order.payment.paidAt = now;
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      if (!order.timeline.some((entry) => entry.status === "paid")) {
        order.timeline.push(createTimelineEntry("paid", body.locale));
      }
      invoice = createInvoiceForOrder(db, order, payment);
      order.payment.invoiceId = invoice.id;
    } else {
      order.payment.failureReason = payment.failureReason;
    }

    saveOrder(db, order);
    const event = insertPaymentEvent(db, {
      id: body.eventId || `evt-${crypto.randomUUID()}`,
      paymentId: payment.id,
      orderId: order.id,
      provider: body.provider || "demo_gateway",
      status: body.status,
      eventStatus: "processed",
      idempotencyKey,
      signature: body.signature,
      processedAt: now,
      request: body
    });

    return { event, payment, order, invoice };
  });

  return transaction();
}

module.exports = {
  processPaymentWebhook
};

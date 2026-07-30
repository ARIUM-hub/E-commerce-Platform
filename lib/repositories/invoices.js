const crypto = require("node:crypto");

function buildInvoiceNumber(db, now = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE invoice_number LIKE ?").get(`INV-${stamp}-%`);
  return `INV-${stamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function parseInvoice(row) {
  return row ? JSON.parse(row.payload) : null;
}

function findInvoiceByOrderId(db, orderId) {
  return parseInvoice(db.prepare("SELECT payload FROM invoices WHERE order_id = ?").get(orderId));
}

function findInvoiceById(db, invoiceId) {
  return parseInvoice(db.prepare("SELECT payload FROM invoices WHERE id = ?").get(invoiceId));
}

function createInvoiceForOrder(db, order, payment, now = new Date()) {
  const existing = findInvoiceByOrderId(db, order.id);
  if (existing) return existing;

  const totals = order.totals || {};
  const issuedAt = now.toISOString();
  const invoice = {
    id: `invoice-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "issued",
    invoiceNumber: buildInvoiceNumber(db, now),
    issuedAt,
    currency: totals.currency || "CNY",
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    payment: {
      id: payment.id,
      method: payment.method,
      provider: payment.provider
    },
    items: order.items,
    subtotal: totals.subtotal || 0,
    discountTotal: totals.savings || 0,
    shipping: totals.shipping || 0,
    paymentFee: totals.paymentFee || 0,
    tax: totals.tax || 0,
    grandTotal: totals.grandTotal ?? totals.total ?? 0
  };

  db.prepare(`
    INSERT INTO invoices (
      id, order_id, user_id, status, invoice_number, issued_at, currency,
      subtotal, discount_total, shipping, payment_fee, tax, grand_total, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoice.id,
    invoice.orderId,
    invoice.userId,
    invoice.status,
    invoice.invoiceNumber,
    invoice.issuedAt,
    invoice.currency,
    invoice.subtotal,
    invoice.discountTotal,
    invoice.shipping,
    invoice.paymentFee,
    invoice.tax,
    invoice.grandTotal,
    JSON.stringify(invoice)
  );

  return invoice;
}

module.exports = {
  createInvoiceForOrder,
  findInvoiceById,
  findInvoiceByOrderId
};

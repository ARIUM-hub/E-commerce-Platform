const ACTIVE_FULFILLMENT_STATUSES = new Set(["paid", "processing", "shipped"]);
const PENDING_RETURN_STATUSES = new Set(["submitted", "reviewing"]);
const ORDER_TRANSITIONS = {
  pending_payment: new Set(["paid", "cancelled"]),
  paid: new Set(["processing"]),
  processing: new Set(["shipped"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([])
};

function parsePayload(row) {
  return row ? JSON.parse(row.payload) : null;
}

function listOrderPayloads(db) {
  return db.prepare("SELECT payload FROM orders ORDER BY created_at DESC").all().map(parsePayload);
}

function getOrderTotal(order) {
  return Number(order?.totals?.total) || 0;
}

function isToday(isoValue, now = new Date()) {
  if (!isoValue) return false;
  return new Date(isoValue).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

function mapRecentOrder(order) {
  return {
    id: order.id,
    userId: order.userId || "",
    customer: order.customer || {},
    status: order.status,
    paymentStatus: order.payment?.status || "requires_payment",
    fulfillmentStatus: order.fulfillment?.status || "not_started",
    trackingNumber: order.fulfillment?.trackingNumber || "",
    refundId: order.refund?.id || "",
    refundStatus: order.refund?.status || "none",
    total: getOrderTotal(order),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function listInventoryRows(db) {
  return db.prepare(`
    SELECT
      variant.sku_id,
      variant.product_id,
      variant.size,
      variant.color,
      variant.material,
      variant.stock_quantity,
      variant.low_stock_threshold,
      variant.is_available,
      product.payload AS product_payload
    FROM product_variants variant
    JOIN products product ON product.id = variant.product_id
    ORDER BY product.rowid ASC, variant.rowid ASC
  `).all();
}

function mapInventoryRow(row) {
  const product = parsePayload({ payload: row.product_payload });
  const stockQuantity = Number(row.stock_quantity);
  const lowStockThreshold = Number(row.low_stock_threshold);
  const isAvailable = Boolean(row.is_available);

  return {
    skuId: row.sku_id,
    productId: row.product_id,
    productTitle: product.title,
    category: product.category || product.categoryKey || product.categoryLabel || "",
    size: row.size,
    color: row.color,
    material: row.material,
    stockQuantity,
    lowStockThreshold,
    isAvailable,
    stockState: !isAvailable || stockQuantity <= 0
      ? "out-of-stock"
      : stockQuantity <= lowStockThreshold
        ? "low-stock"
        : "in-stock"
  };
}

function listInventory(db, filters = {}) {
  const query = String(filters.q || "").trim().toLowerCase();
  const stock = String(filters.stock || "all").trim();
  return listInventoryRows(db)
    .map(mapInventoryRow)
    .filter((item) => {
      const matchesQuery = !query
        || item.skuId.toLowerCase().includes(query)
        || item.productTitle.toLowerCase().includes(query)
        || item.category.toLowerCase().includes(query);
      const matchesStock = stock === "all" || item.stockState === stock;
      return matchesQuery && matchesStock;
    });
}

function listStockAlerts(db, limit = 8) {
  return listInventory(db)
    .filter((item) => item.stockState === "low-stock" || item.stockState === "out-of-stock")
    .slice(0, limit);
}

function countActiveMarketing(db) {
  const promotions = db.prepare("SELECT COUNT(*) AS count FROM promotions WHERE status = 'active'").get().count;
  const coupons = db.prepare("SELECT COUNT(*) AS count FROM coupons WHERE status = 'active'").get().count;
  const bundles = db.prepare("SELECT COUNT(*) AS count FROM bundles WHERE status = 'active'").get().count;
  return promotions + coupons + bundles;
}

function countPendingReturns(db) {
  const placeholders = [...PENDING_RETURN_STATUSES].map(() => "?").join(", ");
  return db.prepare(`SELECT COUNT(*) AS count FROM return_requests WHERE status IN (${placeholders})`)
    .get(...PENDING_RETURN_STATUSES).count;
}

function countReviewQueue(db) {
  return {
    pendingReviewCount: db.prepare("SELECT COUNT(*) AS count FROM product_reviews WHERE status = 'pending'").get().count,
    lowRatingReviewCount: db.prepare(`
      SELECT COUNT(*) AS count FROM product_reviews
      WHERE status = 'published' AND rating <= 2
    `).get().count
  };
}

function countSupportQueue(db, now = new Date()) {
  const overdueBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const activeClause = "status <> 'closed'";
  return {
    unassignedSupportCount: db.prepare(`
      SELECT COUNT(*) AS count FROM support_tickets
      WHERE ${activeClause} AND assigned_admin_user_id IS NULL
    `).get().count,
    urgentSupportCount: db.prepare(`
      SELECT COUNT(*) AS count FROM support_tickets
      WHERE ${activeClause} AND priority = 'urgent'
    `).get().count,
    waitingCustomerSupportCount: db.prepare(`
      SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'waiting_customer'
    `).get().count,
    overdueSupportCount: db.prepare(`
      SELECT COUNT(*) AS count FROM support_tickets
      WHERE ${activeClause} AND COALESCE(last_message_at, created_at) < ?
    `).get(overdueBefore).count
  };
}

function listWorkQueue(db, now = new Date()) {
  const openTicketCount = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'").get().count;
  const pendingReturnCount = countPendingReturns(db);
  const { pendingReviewCount, lowRatingReviewCount } = countReviewQueue(db);
  const support = countSupportQueue(db, now);
  return [
    { type: "returns", label: "Pending returns", count: pendingReturnCount },
    { type: "support", label: "Open support tickets", count: openTicketCount },
    { type: "support-unassigned", label: "Unassigned support tickets", count: support.unassignedSupportCount },
    { type: "support-urgent", label: "Urgent support tickets", count: support.urgentSupportCount },
    { type: "support-waiting", label: "Waiting for customer", count: support.waitingCustomerSupportCount },
    { type: "support-overdue", label: "Overdue support tickets", count: support.overdueSupportCount },
    { type: "reviews-pending", label: "Pending reviews", count: pendingReviewCount },
    { type: "reviews-low-rating", label: "Low-rating reviews", count: lowRatingReviewCount }
  ];
}

function getAdminSummary(db, now = new Date()) {
  const orders = listOrderPayloads(db);
  const inventory = listInventory(db);
  const lowStockSkuCount = inventory.filter((item) => item.stockState === "low-stock").length;
  const outOfStockSkuCount = inventory.filter((item) => item.stockState === "out-of-stock").length;
  const openTicketCount = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'").get().count;
  const { pendingReviewCount, lowRatingReviewCount } = countReviewQueue(db);
  const support = countSupportQueue(db, now);

  return {
    summary: {
      ordersTotal: orders.length,
      ordersToday: orders.filter((order) => isToday(order.createdAt, now)).length,
      pendingPayment: orders.filter((order) => order.status === "pending_payment").length,
      activeFulfillment: orders.filter((order) => ACTIVE_FULFILLMENT_STATUSES.has(order.status)).length,
      grossSales: orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + getOrderTotal(order), 0),
      lowStockSkuCount,
      outOfStockSkuCount,
      pendingReturnCount: countPendingReturns(db),
      openTicketCount,
      ...support,
      pendingReviewCount,
      lowRatingReviewCount,
      activeMarketingCount: countActiveMarketing(db)
    },
    recentOrders: orders.slice(0, 5).map(mapRecentOrder),
    stockAlerts: listStockAlerts(db, 8),
    workQueue: listWorkQueue(db, now)
  };
}

function getProductStockSummary(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    variantCount: variants.length,
    totalStock: variants.reduce((sum, variant) => sum + (Number(variant.stockQuantity) || 0), 0),
    lowStockCount: variants.filter((variant) => {
      return variant.isAvailable && variant.stockQuantity > 0 && variant.stockQuantity <= variant.lowStockThreshold;
    }).length,
    outOfStockCount: variants.filter((variant) => !variant.isAvailable || variant.stockQuantity <= 0).length
  };
}

function listAdminProducts(db) {
  const { listProducts } = require("./products");
  return listProducts(db).map((product) => ({
    id: product.id,
    title: product.title,
    category: product.category || product.categoryKey || product.categoryLabel || "",
    price: product.price,
    originalPrice: product.originalPrice,
    ratingValue: product.ratingValue,
    reviewCount: product.reviewCount,
    ...getProductStockSummary(product)
  }));
}

function validateInventoryPatch(body) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "stockQuantity")) {
    const stockQuantity = Number(body.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 9999) {
      return { validationError: { code: "ADMIN_STOCK_INVALID", message: "Stock quantity is invalid." } };
    }
    patch.stockQuantity = stockQuantity;
  }

  if (Object.prototype.hasOwnProperty.call(body, "lowStockThreshold")) {
    const lowStockThreshold = Number(body.lowStockThreshold);
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 999) {
      return { validationError: { code: "ADMIN_LOW_STOCK_THRESHOLD_INVALID", message: "Low stock threshold is invalid." } };
    }
    patch.lowStockThreshold = lowStockThreshold;
  }

  if (Object.prototype.hasOwnProperty.call(body, "isAvailable")) {
    patch.isAvailable = Boolean(body.isAvailable);
  }

  if (Object.keys(patch).length === 0) {
    return { validationError: { code: "ADMIN_INVENTORY_PATCH_EMPTY", message: "Inventory update is empty." } };
  }

  return { patch };
}

function updateInventoryItem(db, skuId, body) {
  const current = db.prepare("SELECT sku_id FROM product_variants WHERE sku_id = ?").get(skuId);
  if (!current) {
    return { validationError: { statusCode: 404, code: "ADMIN_SKU_NOT_FOUND", message: "SKU was not found." } };
  }

  const validation = validateInventoryPatch(body);
  if (validation.validationError) {
    return {
      validationError: {
        statusCode: 400,
        ...validation.validationError
      }
    };
  }

  const patch = validation.patch;
  const updates = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(patch, "stockQuantity")) {
    updates.push("stock_quantity = ?");
    params.push(patch.stockQuantity);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "lowStockThreshold")) {
    updates.push("low_stock_threshold = ?");
    params.push(patch.lowStockThreshold);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "isAvailable")) {
    updates.push("is_available = ?");
    params.push(patch.isAvailable ? 1 : 0);
  }

  db.prepare(`UPDATE product_variants SET ${updates.join(", ")} WHERE sku_id = ?`).run(...params, skuId);
  const item = listInventory(db).find((entry) => entry.skuId === skuId);
  return { item };
}

function listAdminOrders(db, filters = {}) {
  const status = String(filters.status || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();
  return listOrderPayloads(db)
    .filter((order) => !status || order.status === status)
    .filter((order) => {
      return !query
        || order.id.toLowerCase().includes(query)
        || String(order.customer?.contact || "").toLowerCase().includes(query)
        || String(order.customer?.name || "").toLowerCase().includes(query);
    })
    .map(mapRecentOrder);
}

function findAdminOrder(db, orderId) {
  return parsePayload(db.prepare("SELECT payload FROM orders WHERE id = ?").get(orderId));
}

function updateAdminOrderStatus(db, orderId, nextStatus, locale, createTimelineEntry, saveOrder) {
  const order = findAdminOrder(db, orderId);
  if (!order) {
    return { validationError: { statusCode: 404, code: "ADMIN_ORDER_NOT_FOUND", message: "Order was not found." } };
  }

  if (!ORDER_TRANSITIONS[nextStatus]) {
    return { validationError: { statusCode: 400, code: "ADMIN_ORDER_STATUS_INVALID", message: "Order status is invalid." } };
  }

  const allowed = ORDER_TRANSITIONS[order.status] || new Set();
  if (!allowed.has(nextStatus)) {
    return { validationError: { statusCode: 409, code: "ADMIN_ORDER_TRANSITION_INVALID", message: "Order status transition is not allowed." } };
  }

  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push(createTimelineEntry(nextStatus, locale));
  saveOrder(db, order);
  return { order };
}

function mapMarketingRow(row, idKey) {
  return {
    [idKey]: idKey === "code" ? row.code : row.id,
    type: row.type || undefined,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...parsePayload(row)
  };
}

function listAdminMarketing(db) {
  return {
    coupons: db.prepare("SELECT * FROM coupons ORDER BY rowid ASC").all().map((row) => mapMarketingRow(row, "code")),
    promotions: db.prepare("SELECT * FROM promotions ORDER BY rowid ASC").all().map((row) => mapMarketingRow(row, "id")),
    bundles: db.prepare("SELECT * FROM bundles ORDER BY rowid ASC").all().map((row) => mapMarketingRow(row, "id"))
  };
}

function listAdminPaymentMethods(db) {
  const { listPaymentMethods } = require("./payment-methods");
  return listPaymentMethods(db, { includeInactive: true });
}

function updateMarketingStatus(db, type, id, status) {
  const normalizedType = String(type || "").trim();
  const normalizedStatus = String(status || "").trim();
  if (!["coupon", "promotion", "bundle"].includes(normalizedType)) {
    return { validationError: { statusCode: 400, code: "ADMIN_MARKETING_TYPE_INVALID", message: "Marketing type is invalid." } };
  }
  if (!["active", "inactive"].includes(normalizedStatus)) {
    return { validationError: { statusCode: 400, code: "ADMIN_MARKETING_STATUS_INVALID", message: "Marketing status is invalid." } };
  }

  const config = {
    coupon: { table: "coupons", key: "code", idKey: "code" },
    promotion: { table: "promotions", key: "id", idKey: "id" },
    bundle: { table: "bundles", key: "id", idKey: "id" }
  }[normalizedType];

  const result = db.prepare(`UPDATE ${config.table} SET status = ? WHERE ${config.key} = ?`).run(normalizedStatus, id);
  if (result.changes !== 1) {
    return { validationError: { statusCode: 404, code: "ADMIN_MARKETING_RESOURCE_NOT_FOUND", message: "Marketing resource was not found." } };
  }

  const row = db.prepare(`SELECT * FROM ${config.table} WHERE ${config.key} = ?`).get(id);
  return { resource: mapMarketingRow(row, config.idKey) };
}

module.exports = {
  getAdminSummary,
  findAdminOrder,
  listAdminProducts,
  listAdminOrders,
  listAdminMarketing,
  listAdminPaymentMethods,
  listInventory,
  updateAdminOrderStatus,
  updateInventoryItem,
  updateMarketingStatus
};

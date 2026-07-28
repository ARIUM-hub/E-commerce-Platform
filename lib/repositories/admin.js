const ACTIVE_FULFILLMENT_STATUSES = new Set(["paid", "processing", "shipped"]);
const PENDING_RETURN_STATUSES = new Set(["submitted", "reviewing"]);

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
    category: product.category,
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

function listWorkQueue(db) {
  const openTicketCount = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'").get().count;
  const pendingReturnCount = countPendingReturns(db);
  return [
    { type: "returns", label: "Pending returns", count: pendingReturnCount },
    { type: "support", label: "Open support tickets", count: openTicketCount }
  ];
}

function getAdminSummary(db, now = new Date()) {
  const orders = listOrderPayloads(db);
  const inventory = listInventory(db);
  const lowStockSkuCount = inventory.filter((item) => item.stockState === "low-stock").length;
  const outOfStockSkuCount = inventory.filter((item) => item.stockState === "out-of-stock").length;
  const openTicketCount = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'").get().count;

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
      activeMarketingCount: countActiveMarketing(db)
    },
    recentOrders: orders.slice(0, 5).map(mapRecentOrder),
    stockAlerts: listStockAlerts(db, 8),
    workQueue: listWorkQueue(db)
  };
}

module.exports = {
  getAdminSummary,
  listInventory
};

const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);

const shippingMethodConfigs = {
  standard: {
    id: "standard",
    fee: 0,
    baseDays: 4,
    minimumDays: 3,
    carrier: "Socks Standard",
    labels: { "zh-CN": "标准配送", "en-US": "Standard delivery" }
  },
  express: {
    id: "express",
    fee: 12,
    baseDays: 2,
    minimumDays: 1,
    carrier: "Socks Express",
    labels: { "zh-CN": "加急配送", "en-US": "Express delivery" }
  },
  economy: {
    id: "economy",
    fee: 0,
    baseDays: 6,
    minimumDays: 5,
    carrier: "Socks Economy",
    labels: { "zh-CN": "经济配送", "en-US": "Economy delivery" }
  }
};

const fulfillmentStatusLabels = {
  not_started: { "zh-CN": "未开始履约", "en-US": "Not started" },
  preparing: { "zh-CN": "仓库处理中", "en-US": "Preparing" },
  label_created: { "zh-CN": "已生成发货单", "en-US": "Label created" },
  in_transit: { "zh-CN": "运输中", "en-US": "In transit" },
  out_for_delivery: { "zh-CN": "派送中", "en-US": "Out for delivery" },
  delivered: { "zh-CN": "已送达", "en-US": "Delivered" },
  cancelled: { "zh-CN": "履约已取消", "en-US": "Fulfillment cancelled" }
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDate(date, locale = "zh-CN") {
  return new Intl.DateTimeFormat(locale === "en-US" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function getAddressZone({ region = "", postalCode = "" } = {}) {
  const normalizedRegion = String(region || "").trim().toUpperCase();
  const normalizedPostalCode = String(postalCode || "").trim();

  if (["AK", "HI"].includes(normalizedRegion)) return "remote";
  if (["NY", "FL", "TX"].includes(normalizedRegion)) return "far";
  if (["WA", "CA", "OR"].includes(normalizedRegion)) return "west";
  if (!/^[0-9]{5}/.test(normalizedPostalCode)) return "remote";
  return "standard";
}

function getAddressZoneExtraDays(zone) {
  if (zone === "remote") return 2;
  if (zone === "far") return 1;
  return 0;
}

function getShippingMethodsForAddress(address = {}, locale = "zh-CN", now = new Date()) {
  const normalizedLocale = normalizeLocale(locale);
  const addressZone = getAddressZone(address);
  const extraDays = getAddressZoneExtraDays(addressZone);

  return Object.values(shippingMethodConfigs).map((method) => {
    const deliveryDays = Math.max(method.minimumDays, method.baseDays + extraDays);
    const estimatedDate = addDays(now, deliveryDays);
    const windowEnd = addDays(estimatedDate, 1);

    return {
      id: method.id,
      label: method.labels[normalizedLocale],
      fee: method.fee,
      carrier: method.carrier,
      deliveryDays,
      addressZone,
      estimatedDeliveryDate: estimatedDate.toISOString(),
      estimatedDelivery: formatDate(estimatedDate, normalizedLocale),
      estimatedDeliveryLabel: formatDate(estimatedDate, normalizedLocale),
      deliveryWindow: {
        start: estimatedDate.toISOString(),
        end: windowEnd.toISOString(),
        label: `${formatDate(estimatedDate, normalizedLocale)} - ${formatDate(windowEnd, normalizedLocale)}`
      }
    };
  });
}

function getShippingMethodForOrder(methodId, address = {}, locale = "zh-CN", now = new Date()) {
  return getShippingMethodsForAddress(address, locale, now).find((method) => method.id === methodId) || null;
}

function getFulfillmentStatusLabel(status, locale = "zh-CN") {
  return fulfillmentStatusLabels[status]?.[normalizeLocale(locale)] || status;
}

function createFulfillmentSummary(fulfillment) {
  return {
    id: fulfillment.id,
    status: fulfillment.status,
    shippingMethodId: fulfillment.shippingMethodId,
    shippingMethodLabel: fulfillment.shippingMethodLabel,
    carrier: fulfillment.carrier,
    trackingNumber: fulfillment.trackingNumber,
    estimatedDeliveryDate: fulfillment.estimatedDeliveryDate,
    estimatedDeliveryLabel: fulfillment.estimatedDeliveryLabel,
    deliveryWindow: fulfillment.deliveryWindow,
    addressZone: fulfillment.addressZone
  };
}

function parseFulfillmentRow(row) {
  if (!row) return null;
  return JSON.parse(row.payload);
}

function listFulfillmentEvents(db, orderId) {
  return db.prepare(`
    SELECT status, label, location, description, at
    FROM fulfillment_events
    WHERE order_id = ?
    ORDER BY at ASC, rowid ASC
  `).all(orderId);
}

function findFulfillmentByOrderId(db, orderId) {
  const fulfillment = parseFulfillmentRow(db.prepare("SELECT payload FROM fulfillments WHERE order_id = ?").get(orderId));
  if (!fulfillment) return null;
  return {
    ...fulfillment,
    events: listFulfillmentEvents(db, orderId)
  };
}

function insertFulfillmentEvent(db, fulfillment, status, locale = "zh-CN", options = {}) {
  const event = {
    status,
    label: getFulfillmentStatusLabel(status, locale),
    location: options.location || "Socks Depot Fulfillment Center",
    description: options.description || getFulfillmentStatusLabel(status, locale),
    at: options.at || new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO fulfillment_events (id, fulfillment_id, order_id, status, label, location, description, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `fulfillment-event-${crypto.randomUUID()}`,
    fulfillment.id,
    fulfillment.orderId,
    event.status,
    event.label,
    event.location,
    event.description,
    event.at
  );

  return event;
}

function createFulfillmentForOrder(db, order, shippingMethod, locale = "zh-CN") {
  const now = new Date().toISOString();
  const fulfillment = {
    id: `fulfillment-${crypto.randomUUID()}`,
    orderId: order.id,
    userId: order.userId || null,
    status: "not_started",
    shippingMethodId: shippingMethod.id,
    shippingMethodLabel: shippingMethod.label,
    carrier: shippingMethod.carrier,
    trackingNumber: "",
    estimatedDeliveryDate: shippingMethod.estimatedDeliveryDate,
    estimatedDeliveryLabel: shippingMethod.estimatedDeliveryLabel,
    deliveryWindow: shippingMethod.deliveryWindow,
    addressZone: shippingMethod.addressZone,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO fulfillments (
      id, order_id, user_id, status, shipping_method_id, carrier, tracking_number,
      estimated_delivery_date, delivery_window_start, delivery_window_end, address_zone,
      created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fulfillment.id,
    fulfillment.orderId,
    fulfillment.userId,
    fulfillment.status,
    fulfillment.shippingMethodId,
    fulfillment.carrier,
    null,
    fulfillment.estimatedDeliveryDate,
    fulfillment.deliveryWindow.start,
    fulfillment.deliveryWindow.end,
    fulfillment.addressZone,
    fulfillment.createdAt,
    fulfillment.updatedAt,
    JSON.stringify(fulfillment)
  );

  insertFulfillmentEvent(db, fulfillment, "not_started", locale);
  return findFulfillmentByOrderId(db, order.id);
}

module.exports = {
  createFulfillmentForOrder,
  createFulfillmentSummary,
  findFulfillmentByOrderId,
  getShippingMethodForOrder,
  getShippingMethodsForAddress
};

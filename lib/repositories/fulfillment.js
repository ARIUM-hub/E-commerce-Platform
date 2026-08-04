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

const fulfillmentStatusTransitions = {
  not_started: new Set(["preparing", "cancelled"]),
  preparing: new Set(["label_created", "cancelled"]),
  label_created: new Set(["in_transit", "cancelled"]),
  in_transit: new Set(["out_for_delivery"]),
  out_for_delivery: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([])
};

const orderFulfillmentTargets = {
  processing: "preparing",
  shipped: "label_created",
  delivered: "delivered",
  cancelled: "cancelled",
  refund_pending: "cancelled"
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

function buildTrackingNumber(db, now = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM fulfillments WHERE tracking_number LIKE ?").get(`TRK-${stamp}-%`);
  return `TRK-${stamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function saveFulfillment(db, fulfillment) {
  const { events, ...payload } = fulfillment;
  db.prepare(`
    UPDATE fulfillments
    SET status = ?, carrier = ?, tracking_number = ?, updated_at = ?, payload = ?
    WHERE id = ?
  `).run(
    payload.status,
    payload.carrier,
    payload.trackingNumber || null,
    payload.updatedAt,
    JSON.stringify(payload),
    payload.id
  );
  return payload;
}

function confirmShipment(db, {
  order,
  carrier,
  trackingNumber,
  locale = "zh-CN",
  saveOrder,
  createTimelineEntry
}) {
  const normalizedCarrier = String(carrier || "").trim().toLowerCase();
  const normalizedTracking = String(trackingNumber || "").trim();
  if (!["ups", "usps", "fedex", "dhl"].includes(normalizedCarrier)) {
    return {
      validationError: {
        statusCode: 400,
        code: "ADMIN_CARRIER_INVALID",
        message: "Carrier is invalid."
      }
    };
  }
  if (!normalizedTracking) {
    return {
      validationError: {
        statusCode: 400,
        code: "ADMIN_TRACKING_REQUIRED",
        message: "Tracking number is required."
      }
    };
  }
  if (db.prepare("SELECT id FROM fulfillments WHERE tracking_number = ?").get(normalizedTracking)) {
    return {
      validationError: {
        statusCode: 409,
        code: "ADMIN_TRACKING_DUPLICATE",
        message: "Tracking number is already in use."
      }
    };
  }
  if (order.status !== "processing") {
    return {
      validationError: {
        statusCode: 409,
        code: "ADMIN_ORDER_TRANSITION_INVALID",
        message: "Order cannot be shipped."
      }
    };
  }

  const fulfillment = findFulfillmentByOrderId(db, order.id);
  if (!fulfillment) {
    return {
      validationError: {
        statusCode: 404,
        code: "FULFILLMENT_NOT_FOUND",
        message: "Fulfillment was not found."
      }
    };
  }

  let activeFulfillment = fulfillment;
  if (activeFulfillment.status === "not_started") {
    const preparingResult = applyFulfillmentStatus(db, {
      order,
      fulfillment: activeFulfillment,
      status: "preparing",
      locale,
      createTimelineEntry
    });
    if (preparingResult.validationError) return preparingResult;
    activeFulfillment = preparingResult.fulfillment;
  }

  activeFulfillment.carrier = normalizedCarrier;
  activeFulfillment.trackingNumber = normalizedTracking;
  const result = applyFulfillmentStatus(db, {
    order,
    fulfillment: activeFulfillment,
    status: "label_created",
    locale,
    createTimelineEntry
  });
  if (result.validationError) return result;

  const now = new Date().toISOString();
  order.status = "shipped";
  order.updatedAt = now;
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push(createTimelineEntry("shipped", locale));
  order.fulfillment = createFulfillmentSummary(result.fulfillment);
  saveOrder(db, order);

  return {
    order,
    fulfillment: findFulfillmentByOrderId(db, order.id)
  };
}

function applyFulfillmentStatus(db, { order, fulfillment, status, locale = "zh-CN", createTimelineEntry }) {
  const nextStatus = String(status || "").trim();
  if (!fulfillmentStatusTransitions[nextStatus]) {
    return {
      validationError: {
        statusCode: 400,
        code: "FULFILLMENT_STATUS_INVALID",
        message: "Fulfillment status is invalid."
      }
    };
  }

  if (fulfillment.status === nextStatus) {
    order.fulfillment = createFulfillmentSummary(fulfillment);
    return { fulfillment, order };
  }

  const allowedStatuses = fulfillmentStatusTransitions[fulfillment.status] || new Set();
  if (!allowedStatuses.has(nextStatus)) {
    return {
      validationError: {
        statusCode: 409,
        code: "FULFILLMENT_TRANSITION_INVALID",
        message: "Fulfillment status transition is not allowed."
      }
    };
  }

  const now = new Date().toISOString();
  fulfillment.status = nextStatus;
  fulfillment.updatedAt = now;
  if (nextStatus === "label_created" && !fulfillment.trackingNumber) {
    fulfillment.trackingNumber = buildTrackingNumber(db);
  }

  saveFulfillment(db, fulfillment);
  insertFulfillmentEvent(db, fulfillment, nextStatus, locale);
  order.fulfillment = createFulfillmentSummary(fulfillment);

  if (nextStatus === "delivered" && order.status !== "delivered") {
    order.status = "delivered";
    order.updatedAt = now;
    order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
    order.timeline.push(createTimelineEntry("delivered", locale));
  }

  return {
    fulfillment: findFulfillmentByOrderId(db, order.id),
    order
  };
}

function syncFulfillmentForOrderStatus(db, { order, fulfillment, orderStatus, locale = "zh-CN", createTimelineEntry }) {
  const targetStatus = orderFulfillmentTargets[orderStatus];
  if (!targetStatus || !fulfillment) {
    return { fulfillment, order };
  }

  const path = targetStatus === "delivered"
    ? ["in_transit", "out_for_delivery", "delivered"]
    : [targetStatus];
  let currentFulfillment = fulfillment;
  let result = { fulfillment, order };

  for (const status of path) {
    if (currentFulfillment.status === status) {
      continue;
    }
    result = applyFulfillmentStatus(db, {
      order,
      fulfillment: currentFulfillment,
      status,
      locale,
      createTimelineEntry
    });
    if (result.validationError) {
      return result;
    }
    currentFulfillment = result.fulfillment;
  }

  return result;
}

function updateFulfillmentStatus(db, { order, fulfillment, status, locale = "zh-CN", saveOrder, createTimelineEntry }) {
  const transaction = db.transaction(() => {
    const result = applyFulfillmentStatus(db, {
      order,
      fulfillment,
      status,
      locale,
      createTimelineEntry
    });
    if (result.validationError) {
      return result;
    }
    order.updatedAt = new Date().toISOString();
    saveOrder(db, order);
    return {
      order,
      fulfillment: findFulfillmentByOrderId(db, order.id)
    };
  });

  return transaction();
}

module.exports = {
  confirmShipment,
  createFulfillmentForOrder,
  createFulfillmentSummary,
  findFulfillmentByOrderId,
  getShippingMethodForOrder,
  getShippingMethodsForAddress,
  syncFulfillmentForOrderStatus,
  updateFulfillmentStatus
};

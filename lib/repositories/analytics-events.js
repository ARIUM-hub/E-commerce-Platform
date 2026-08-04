const crypto = require("node:crypto");

const PUBLIC_EVENT_TYPES = new Set([
  "storefront_visit",
  "product_view",
  "cart_add",
  "checkout_start"
]);

function getShanghaiDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function buildDedupeKey(event, context, bucketDate) {
  const productScope = event.eventType === "product_view" ? `:${event.productId}` : "";
  return `${event.eventType}:${context.visitorId}:${bucketDate}${productScope}`;
}

function createValidationError(code, message) {
  return { validationError: { statusCode: 400, code, message } };
}

function recordAnalyticsEvent(db, input, context) {
  const eventType = String(input?.eventType || "").trim();
  const productId = String(input?.productId || "").trim();
  if (!PUBLIC_EVENT_TYPES.has(eventType)) {
    return createValidationError("ANALYTICS_EVENT_INVALID", "Analytics event is invalid.");
  }
  if (eventType === "product_view" && !productId) {
    return createValidationError("ANALYTICS_PRODUCT_INVALID", "Analytics product is invalid.");
  }
  if (productId && !db.prepare("SELECT id FROM products WHERE id = ?").get(productId)) {
    return createValidationError("ANALYTICS_PRODUCT_INVALID", "Analytics product is invalid.");
  }

  const occurredAt = context.now.toISOString();
  const bucketDate = getShanghaiDate(context.now);
  const dedupeKey = buildDedupeKey({ eventType, productId }, context, bucketDate);
  const result = db.prepare(`
    INSERT OR IGNORE INTO analytics_events (
      id, event_type, visitor_id, session_id, user_id, product_id, order_id,
      occurred_at, bucket_date, dedupe_key, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, '{}')
  `).run(
    `analytics-${crypto.randomUUID()}`,
    eventType,
    context.visitorId,
    context.sessionId,
    context.userId,
    productId || null,
    occurredAt,
    bucketDate,
    dedupeKey
  );

  return {
    recorded: Number(result.changes) === 1,
    event: { eventType, productId: productId || null, occurredAt, bucketDate }
  };
}

function createAnalyticsEventLimiter({ limit = 120, windowMs = 60000, now = Date.now } = {}) {
  const windows = new Map();

  return {
    consume(key) {
      const currentTime = now();
      const current = windows.get(key);
      if (!current || currentTime - current.windowStartedAt >= windowMs) {
        windows.set(key, { count: 1, windowStartedAt: currentTime });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterMs: Math.max(0, windowMs - (currentTime - current.windowStartedAt))
        };
      }
      current.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    }
  };
}

module.exports = {
  PUBLIC_EVENT_TYPES,
  getShanghaiDate,
  recordAnalyticsEvent,
  createAnalyticsEventLimiter
};

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 24 * 60 * 60 * 1000;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRate(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function formatShanghaiDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function createAnalyticsPeriod(range, now = new Date()) {
  if (!RANGE_DAYS[range]) {
    return {
      validationError: {
        statusCode: 400,
        code: "ANALYTICS_RANGE_INVALID",
        message: "Analytics range is invalid."
      }
    };
  }
  const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const end = new Date(`${shanghaiDate}T16:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - RANGE_DAYS[range]);
  const previousStart = new Date(start);
  previousStart.setUTCDate(previousStart.getUTCDate() - RANGE_DAYS[range]);
  return {
    range,
    start: start.toISOString(),
    end: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: start.toISOString(),
    timezone: "Asia/Shanghai",
    bucket: range === "90d" ? "week" : "day"
  };
}

function listPaidOrders(db, start, end) {
  return db.prepare(`
    WITH first_success AS (
      SELECT order_id, MIN(updated_at) AS paid_at
      FROM payment_attempts
      WHERE status = 'succeeded'
      GROUP BY order_id
    )
    SELECT first_success.order_id, first_success.paid_at,
      (SELECT payment.amount
       FROM payment_attempts payment
       WHERE payment.order_id = first_success.order_id AND payment.status = 'succeeded'
       ORDER BY payment.updated_at ASC, payment.id ASC
       LIMIT 1) AS amount
    FROM first_success
    WHERE first_success.paid_at >= ? AND first_success.paid_at < ?
  `).all(start, end);
}

function listSucceededRefunds(db, start, end) {
  return db.prepare(`
    WITH first_success AS (
      SELECT refund_id, MIN(at) AS succeeded_at
      FROM refund_events
      WHERE status = 'succeeded'
      GROUP BY refund_id
    )
    SELECT refund.id, refund.order_id, refund.amount, first_success.succeeded_at
    FROM refunds refund
    JOIN first_success ON first_success.refund_id = refund.id
    WHERE first_success.succeeded_at >= ? AND first_success.succeeded_at < ?
  `).all(start, end);
}

function countEventVisitors(db, eventType, start, end) {
  return Number(db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) AS count
    FROM analytics_events
    WHERE event_type = ? AND occurred_at >= ? AND occurred_at < ?
  `).get(eventType, start, end).count) || 0;
}

function sumAmounts(rows) {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

function relativeComparison(current, previous) {
  if (previous === 0) return null;
  return roundRate((current - previous) * 100 / Math.abs(previous));
}

function calculatePeriodMetrics(db, start, end) {
  const paidOrders = listPaidOrders(db, start, end);
  const refunds = listSucceededRefunds(db, start, end);
  const uniqueVisitors = countEventVisitors(db, "storefront_visit", start, end);
  const paidOrderCount = paidOrders.length;
  const refundedOrderCount = new Set(refunds.map((refund) => refund.order_id)).size;
  const netSales = roundMoney(sumAmounts(paidOrders) - sumAmounts(refunds));
  return {
    paidOrders,
    refunds,
    netSales,
    uniqueVisitors,
    paidOrderCount,
    conversionRate: uniqueVisitors ? roundRate(paidOrderCount * 100 / uniqueVisitors) : 0,
    refundedOrderCount,
    refundRate: paidOrderCount ? roundRate(refundedOrderCount * 100 / paidOrderCount) : 0,
    funnel: {
      uniqueVisitors,
      cartAddSessions: countEventVisitors(db, "cart_add", start, end),
      checkoutSessions: countEventVisitors(db, "checkout_start", start, end),
      paidOrderCount
    }
  };
}

function createTrend(period, paidOrders, refunds) {
  const dayCount = RANGE_DAYS[period.range];
  const daysPerBucket = period.bucket === "week" ? 7 : 1;
  const bucketCount = Math.ceil(dayCount / daysPerBucket);
  const startMs = new Date(period.start).getTime();
  const endMs = new Date(period.end).getTime();
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartMs = startMs + index * daysPerBucket * DAY_MS;
    const bucketEndMs = Math.min(endMs, bucketStartMs + daysPerBucket * DAY_MS);
    const startLabel = formatShanghaiDate(new Date(bucketStartMs));
    const endLabel = formatShanghaiDate(new Date(bucketEndMs - 1));
    return {
      label: startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`,
      start: new Date(bucketStartMs).toISOString(),
      end: new Date(bucketEndMs).toISOString(),
      netSales: 0,
      paidOrderCount: 0,
      refundedOrderCount: 0
    };
  });

  function getBucket(at) {
    const dayIndex = Math.floor((new Date(at).getTime() - startMs) / DAY_MS);
    return buckets[Math.floor(dayIndex / daysPerBucket)];
  }

  paidOrders.forEach((order) => {
    const bucket = getBucket(order.paid_at);
    if (!bucket) return;
    bucket.netSales += Number(order.amount) || 0;
    bucket.paidOrderCount += 1;
  });
  refunds.forEach((refund) => {
    const bucket = getBucket(refund.succeeded_at);
    if (!bucket) return;
    bucket.netSales -= Number(refund.amount) || 0;
    bucket.refundedOrderCount += 1;
  });
  buckets.forEach((bucket) => {
    bucket.netSales = roundMoney(bucket.netSales);
  });
  return buckets;
}

function getAdminAnalytics(db, { range = "30d", now = new Date() } = {}) {
  const period = createAnalyticsPeriod(range, now);
  if (period.validationError) return period;

  const current = calculatePeriodMetrics(db, period.start, period.end);
  const previous = calculatePeriodMetrics(db, period.previousStart, period.previousEnd);
  return {
    period,
    summary: {
      netSales: current.netSales,
      netSalesComparison: relativeComparison(current.netSales, previous.netSales),
      conversionRate: current.conversionRate,
      conversionRateDelta: roundRate(current.conversionRate - previous.conversionRate),
      uniqueVisitors: current.uniqueVisitors,
      paidOrderCount: current.paidOrderCount,
      refundRate: current.refundRate,
      refundRateDelta: roundRate(current.refundRate - previous.refundRate),
      refundedOrderCount: current.refundedOrderCount,
      lowStockSkuCount: 0,
      outOfStockSkuCount: 0
    },
    trend: createTrend(period, current.paidOrders, current.refunds),
    funnel: current.funnel,
    topProducts: [],
    inventoryAlerts: []
  };
}

module.exports = {
  createAnalyticsPeriod,
  getAdminAnalytics,
  listPaidOrders,
  listSucceededRefunds
};

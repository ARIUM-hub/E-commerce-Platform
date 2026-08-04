function parsePayload(row) {
  return row ? JSON.parse(row.payload) : null;
}

function isActiveWindow(row, now = new Date()) {
  if (!row || row.status !== "active") {
    return false;
  }

  const nowTime = now.getTime();
  const startsAt = row.starts_at ? new Date(row.starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : Number.POSITIVE_INFINITY;
  return startsAt <= nowTime && nowTime <= endsAt;
}

function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function mapPromotion(row) {
  const payload = parsePayload(row);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...payload
  };
}

function mapCoupon(row) {
  const payload = parsePayload(row);
  return {
    code: row.code,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ...payload
  };
}

function mapBundle(row) {
  const payload = parsePayload(row);
  return {
    id: row.id,
    status: row.status,
    ...payload
  };
}

function listActiveMarketingCampaigns(db, now = new Date()) {
  const promotionRows = db.prepare("SELECT * FROM promotions ORDER BY rowid ASC").all();
  const couponRows = db.prepare("SELECT * FROM coupons ORDER BY rowid ASC").all();
  const bundleRows = db.prepare("SELECT * FROM bundles ORDER BY rowid ASC").all();

  return {
    promotions: promotionRows.filter((row) => isActiveWindow(row, now)).map(mapPromotion),
    coupons: couponRows.filter((row) => isActiveWindow(row, now)).map(mapCoupon),
    bundles: bundleRows.filter((row) => row.status === "active").map(mapBundle)
  };
}

function findCouponByCode(db, code, now = new Date()) {
  const row = db.prepare("SELECT * FROM coupons WHERE code = ?").get(normalizeCouponCode(code));
  return isActiveWindow(row, now) ? mapCoupon(row) : null;
}

function findBundleById(db, bundleId) {
  const row = db.prepare("SELECT * FROM bundles WHERE id = ? AND status = 'active'").get(bundleId);
  return row ? mapBundle(row) : null;
}

function listActiveBundles(db) {
  return db.prepare("SELECT * FROM bundles WHERE status = 'active' ORDER BY rowid ASC")
    .all()
    .map(mapBundle);
}

function recordRecentView(db, { id, userId = null, sessionId = null, productId, viewedAt = new Date().toISOString() }) {
  db.prepare(`
    DELETE FROM recent_views
    WHERE product_id = ?
      AND COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(productId, userId, sessionId);

  db.prepare(`
    INSERT INTO recent_views (id, user_id, session_id, product_id, viewed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, sessionId, productId, viewedAt);

  db.prepare(`
    DELETE FROM recent_views
    WHERE id NOT IN (
      SELECT id FROM recent_views
      WHERE COALESCE(user_id, '') = COALESCE(?, '')
        AND COALESCE(session_id, '') = COALESCE(?, '')
      ORDER BY viewed_at DESC, rowid DESC
      LIMIT 8
    )
      AND COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(userId, sessionId, userId, sessionId);
}

function listRecentProductIds(db, { userId = null, sessionId = null, limit = 8 }) {
  return db.prepare(`
    SELECT product_id
    FROM recent_views
    WHERE COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
    ORDER BY viewed_at DESC, rowid DESC
    LIMIT ?
  `).all(userId, sessionId, limit).map((row) => row.product_id);
}

function normalizeRecentLimit(limit) {
  const parsedLimit = Number(limit);
  return Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50
    ? parsedLimit
    : 24;
}

function listRecentViews(db, { userId = null, sessionId = null, limit = 24 }) {
  const normalizedLimit = normalizeRecentLimit(limit);
  return db.prepare(`
    SELECT product_id AS productId, viewed_at AS viewedAt
    FROM recent_views
    WHERE COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
    ORDER BY viewed_at DESC, rowid DESC
    LIMIT ?
  `).all(userId, sessionId, normalizedLimit);
}

function removeRecentView(db, { userId = null, sessionId = null, productId }) {
  db.prepare(`
    DELETE FROM recent_views
    WHERE product_id = ?
      AND COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(productId, userId, sessionId);
}

function clearRecentViews(db, { userId = null, sessionId = null }) {
  db.prepare(`
    DELETE FROM recent_views
    WHERE COALESCE(user_id, '') = COALESCE(?, '')
      AND COALESCE(session_id, '') = COALESCE(?, '')
  `).run(userId, sessionId);
}

module.exports = {
  clearRecentViews,
  findBundleById,
  findCouponByCode,
  listRecentProductIds,
  listRecentViews,
  listActiveBundles,
  listActiveMarketingCampaigns,
  normalizeCouponCode,
  recordRecentView,
  removeRecentView
};

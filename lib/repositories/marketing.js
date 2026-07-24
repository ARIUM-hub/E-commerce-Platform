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

function listActiveBundles(db) {
  return db.prepare("SELECT * FROM bundles WHERE status = 'active' ORDER BY rowid ASC")
    .all()
    .map(mapBundle);
}

module.exports = {
  findCouponByCode,
  listActiveBundles,
  listActiveMarketingCampaigns,
  normalizeCouponCode
};

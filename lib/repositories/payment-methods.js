const validStatuses = new Set(["active", "inactive"]);
const validFeeTypes = new Set(["none", "fixed", "percent"]);
const validLocales = new Set(["zh-CN", "en-US"]);

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function parseMethod(row) {
  if (!row) return null;
  const payload = JSON.parse(row.payload);
  return {
    ...payload,
    status: row.status,
    sortOrder: row.sort_order,
    feeType: row.fee_type,
    feeAmount: row.fee_amount,
    minTotal: row.min_total,
    maxTotal: row.max_total
  };
}

function calculatePaymentMethodFee(method, orderTotal = 0) {
  if (method.feeType === "fixed") {
    return Number(method.feeAmount) || 0;
  }
  if (method.feeType === "percent") {
    return Math.round(orderTotal * (Number(method.feeAmount) || 0) * 100) / 100;
  }
  return 0;
}

function localizePaymentMethod(method, locale = "zh-CN", orderTotal = 0) {
  const normalizedLocale = normalizeLocale(locale);
  const total = Number(orderTotal) || 0;
  const isAmountAllowed = total >= method.minTotal && total <= method.maxTotal;
  return {
    id: method.id,
    label: method.labels?.[normalizedLocale] || method.labels?.["zh-CN"] || method.id,
    description: method.descriptions?.[normalizedLocale] || method.descriptions?.["zh-CN"] || "",
    status: method.status,
    sortOrder: method.sortOrder,
    feeType: method.feeType,
    feeAmount: method.feeAmount,
    fee: calculatePaymentMethodFee(method, total),
    minTotal: method.minTotal,
    maxTotal: method.maxTotal,
    isAvailable: method.status === "active" && isAmountAllowed
  };
}

function listPaymentMethods(db, { locale = "zh-CN", orderTotal = 0, includeInactive = false } = {}) {
  return db.prepare("SELECT * FROM payment_methods ORDER BY sort_order ASC").all()
    .map(parseMethod)
    .map((method) => localizePaymentMethod(method, locale, orderTotal))
    .filter((method) => includeInactive || method.isAvailable);
}

function findPaymentMethod(db, methodId, { locale = "zh-CN", orderTotal = 0, includeInactive = false } = {}) {
  const method = parseMethod(db.prepare("SELECT * FROM payment_methods WHERE id = ?").get(methodId));
  if (!method) return null;

  const localizedMethod = localizePaymentMethod(method, locale, orderTotal);
  if (!includeInactive && !localizedMethod.isAvailable) return null;
  return localizedMethod;
}

function updatePaymentMethod(db, methodId, patch = {}) {
  const method = parseMethod(db.prepare("SELECT * FROM payment_methods WHERE id = ?").get(methodId));
  if (!method) {
    return { validationError: { statusCode: 404, code: "PAYMENT_METHOD_NOT_FOUND", message: "Payment method was not found." } };
  }

  const nextStatus = patch.status == null ? method.status : String(patch.status).trim();
  const nextFeeType = patch.feeType == null ? method.feeType : String(patch.feeType).trim();
  if (!validStatuses.has(nextStatus)) {
    return { validationError: { statusCode: 400, code: "PAYMENT_METHOD_CONFIG_INVALID", message: "Payment method status is invalid." } };
  }
  if (!validFeeTypes.has(nextFeeType)) {
    return { validationError: { statusCode: 400, code: "PAYMENT_METHOD_CONFIG_INVALID", message: "Payment method fee type is invalid." } };
  }

  const nextMethod = {
    ...method,
    status: nextStatus,
    sortOrder: patch.sortOrder == null ? method.sortOrder : Number(patch.sortOrder),
    feeType: nextFeeType,
    feeAmount: patch.feeAmount == null ? method.feeAmount : Number(patch.feeAmount),
    minTotal: patch.minTotal == null ? method.minTotal : Number(patch.minTotal),
    maxTotal: patch.maxTotal == null ? method.maxTotal : Number(patch.maxTotal)
  };

  if (
    !Number.isFinite(nextMethod.sortOrder)
    || !Number.isFinite(nextMethod.feeAmount)
    || !Number.isFinite(nextMethod.minTotal)
    || !Number.isFinite(nextMethod.maxTotal)
    || nextMethod.minTotal < 0
    || nextMethod.maxTotal < nextMethod.minTotal
  ) {
    return { validationError: { statusCode: 400, code: "PAYMENT_METHOD_CONFIG_INVALID", message: "Payment method limits are invalid." } };
  }

  db.prepare(`
    UPDATE payment_methods
    SET status = ?, sort_order = ?, fee_type = ?, fee_amount = ?, min_total = ?, max_total = ?, payload = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextMethod.status,
    nextMethod.sortOrder,
    nextMethod.feeType,
    nextMethod.feeAmount,
    nextMethod.minTotal,
    nextMethod.maxTotal,
    JSON.stringify(nextMethod),
    new Date().toISOString(),
    methodId
  );

  return { method: findPaymentMethod(db, methodId, { includeInactive: true, locale: patch.locale }) };
}

module.exports = {
  calculatePaymentMethodFee,
  findPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod
};

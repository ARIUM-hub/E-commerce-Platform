const { createPricingSummary } = require("./pricing");

const taxRates = {
  WA: 0.088,
  CA: 0.0725,
  NY: 0.08875,
  TX: 0.0625,
  AK: 0,
  OR: 0
};

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeRegion(region) {
  return String(region || "").trim().toUpperCase();
}

function getTaxRateForAddress(address = {}) {
  const region = normalizeRegion(address.region);
  return Object.prototype.hasOwnProperty.call(taxRates, region) ? taxRates[region] : 0.05;
}

function calculatePaymentFee(paymentMethod = {}, totalBeforePaymentFee = 0) {
  const method = paymentMethod || {};
  if (method.feeType === "fixed") {
    return roundMoney(method.feeAmount);
  }
  if (method.feeType === "percent") {
    return roundMoney(totalBeforePaymentFee * (Number(method.feeAmount) || 0));
  }
  return 0;
}

function createCheckoutTotals({
  cart,
  products,
  marketing = {},
  shippingFee = 0,
  paymentMethod = null,
  shippingAddress = {},
  now = new Date()
}) {
  const pricing = createPricingSummary({ cart, products, marketing, shippingFee });
  const paymentFee = calculatePaymentFee(paymentMethod, pricing.total);
  const taxableAmount = roundMoney(Math.max(0, pricing.itemTotal - pricing.orderDiscount - pricing.couponDiscount + paymentFee));
  const tax = roundMoney(taxableAmount * getTaxRateForAddress(shippingAddress));
  const grandTotal = roundMoney(pricing.total + paymentFee + tax);
  const taxRegion = normalizeRegion(shippingAddress.region) || "DEFAULT";

  return {
    ...pricing,
    paymentFee,
    taxableAmount,
    tax,
    grandTotal,
    currency: "CNY",
    taxRegion,
    calculatedAt: now.toISOString()
  };
}

module.exports = {
  createCheckoutTotals,
  getTaxRateForAddress
};

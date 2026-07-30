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

module.exports = {
  getShippingMethodForOrder,
  getShippingMethodsForAddress
};

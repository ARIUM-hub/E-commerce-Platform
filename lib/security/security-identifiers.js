const crypto = require("node:crypto");

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function hashSecurityIdentifier(value, secret, namespace = "default") {
  return crypto.createHmac("sha256", String(secret || ""))
    .update(`${normalizeIdentifier(namespace)}:${normalizeIdentifier(value)}`)
    .digest("hex");
}

function normalizeIpValue(value) {
  const normalized = String(value || "").trim();
  return normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
}

function normalizeClientIp(request, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwardedFor = String(request?.headers?.["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    if (forwardedFor) {
      return normalizeIpValue(forwardedFor);
    }
  }
  return normalizeIpValue(request?.socket?.remoteAddress || "unknown");
}

module.exports = {
  hashSecurityIdentifier,
  normalizeClientIp,
  normalizeIdentifier
};

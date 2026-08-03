const { getCookieValue } = require("../http/cookies");
const {
  hashSecurityIdentifier,
  normalizeClientIp
} = require("./security-identifiers");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function createRequestSecurity({
  allowedOrigins,
  csrfService,
  generalRateLimiter,
  securityHashSecret,
  trustProxy = false,
  isTest = false
}) {
  const originAllowlist = new Set((allowedOrigins || []).map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      return String(origin || "").replace(/\/$/, "");
    }
  }));

  function check(request, requestUrl) {
    if (!requestUrl.pathname.startsWith("/api/")) {
      return { allowed: true };
    }
    const clientIp = normalizeClientIp(request, { trustProxy });
    const ipHash = hashSecurityIdentifier(clientIp, securityHashSecret, "general-api-ip");
    const rateLimit = generalRateLimiter.consume(ipHash);
    if (!rateLimit.allowed) {
      return {
        allowed: false,
        statusCode: 429,
        code: "RATE_LIMITED",
        retryAfterSeconds: rateLimit.retryAfterSeconds
      };
    }

    const method = String(request.method || "GET").toUpperCase();
    const csrfExempt = SAFE_METHODS.has(method)
      || requestUrl.pathname === "/api/payments/webhook"
      || (isTest && requestUrl.pathname === "/api/test/reset");
    if (csrfExempt) {
      return { allowed: true };
    }

    const origin = String(request.headers.origin || "");
    const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
    const isBrowserRequest = Boolean(origin || fetchSite);
    if (!isBrowserRequest) {
      return { allowed: true };
    }
    if (!originAllowlist.has(origin) || fetchSite === "cross-site") {
      return { allowed: false, statusCode: 403, code: "CSRF_INVALID" };
    }
    const validToken = csrfService.verifyToken({
      cookieToken: getCookieValue(request, "socks_csrf"),
      headerToken: request.headers["x-csrf-token"]
    });
    return validToken
      ? { allowed: true }
      : { allowed: false, statusCode: 403, code: "CSRF_INVALID" };
  }

  return { check };
}

module.exports = {
  createRequestSecurity
};

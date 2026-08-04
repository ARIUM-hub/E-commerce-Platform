const { getCookieValue } = require("../http/cookies");
const { normalizeClientIp } = require("../security/security-identifiers");
const { readBodyOrRespond, sendRepositoryResult } = require("./route-helpers");

const LOGIN_RATE_LIMIT_POLICY = Object.freeze({
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
  limits: { account: 5, ip: 20 }
});
const REGISTER_RATE_LIMIT_POLICY = Object.freeze({
  windowMs: 60 * 60_000,
  blockMs: 60 * 60_000,
  limits: { ip: 10 }
});

function getIpIdentifier(request, trustProxy) {
  return [{ type: "ip", value: normalizeClientIp(request, { trustProxy }) }];
}

function getLoginIdentifiers(request, email, trustProxy) {
  return [
    { type: "account", value: String(email || "").trim().toLowerCase() },
    { type: "ip", value: normalizeClientIp(request, { trustProxy }) }
  ];
}

function sendRateLimited(response, services, result) {
  services.sendJsonWithHeaders(response, 429, {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests.",
      details: { retryAfterSeconds: result.retryAfterSeconds }
    }
  }, {
    "Retry-After": String(result.retryAfterSeconds)
  });
}

function registerAuthRoutes(router, services) {
  router.get("/api/session", async ({ request, response, sendJson }) => {
    const { user } = await services.sessionService.getSessionContext(request);
    sendJson(response, 200, {
      authenticated: Boolean(user),
      user: services.createPublicUser(user)
    });
  });

  router.post("/api/auth/register", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const rateLimitIdentifiers = getIpIdentifier(request, services.trustProxy);
    const rateLimit = services.persistentRateLimiter.check(
      "register",
      rateLimitIdentifiers,
      REGISTER_RATE_LIMIT_POLICY
    );
    if (!rateLimit.allowed) {
      sendRateLimited(response, services, rateLimit);
      return;
    }
    services.persistentRateLimiter.recordFailure(
      "register",
      rateLimitIdentifiers,
      REGISTER_RATE_LIMIT_POLICY
    );
    const result = services.withDatabase((db) => services.authService.registerUser(db, parsed.body));
    if (result.validationError) {
      sendRepositoryResult(response, sendJson, sendError, result);
      return;
    }
    const verification = services.accountSecurityService.requestEmailVerification({
      user: result.user
    });
    const previousSessionId = getCookieValue(request, services.sessionCookieName);
    const session = await services.sessionService.createUserSession(result.user.id);
    const mergeResult = await services.mergeAnonymousCartIntoUserCart(result.user, previousSessionId);
    services.sendJsonWithHeaders(response, 201, {
      ok: true,
      user: services.createPublicUser(result.user),
      cart: services.getCartPayload(mergeResult.cart),
      cartMergeWarnings: mergeResult.warnings,
      mailDelivery: verification.mailDelivery
    }, {
      "Set-Cookie": services.sessionService.createSessionCookie(session.id)
    });
  });

  router.post("/api/auth/login", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const rateLimitIdentifiers = getLoginIdentifiers(
      request,
      parsed.body.email,
      services.trustProxy
    );
    const rateLimit = services.persistentRateLimiter.check(
      "login",
      rateLimitIdentifiers,
      LOGIN_RATE_LIMIT_POLICY
    );
    if (!rateLimit.allowed) {
      sendRateLimited(response, services, rateLimit);
      return;
    }
    const result = services.withDatabase((db) => services.authService.authenticateUser(db, parsed.body));
    if (result.validationError) {
      if (result.validationError.code === "INVALID_CREDENTIALS") {
        services.persistentRateLimiter.recordFailure(
          "login",
          rateLimitIdentifiers,
          LOGIN_RATE_LIMIT_POLICY
        );
      }
      sendRepositoryResult(response, sendJson, sendError, result);
      return;
    }
    services.persistentRateLimiter.recordSuccess("login", rateLimitIdentifiers.slice(0, 1));
    const previousSessionId = getCookieValue(request, services.sessionCookieName);
    const session = await services.sessionService.createUserSession(result.user.id);
    const mergeResult = await services.mergeAnonymousCartIntoUserCart(result.user, previousSessionId);
    services.sendJsonWithHeaders(response, 200, {
      ok: true,
      user: services.createPublicUser(result.user),
      cart: services.getCartPayload(mergeResult.cart),
      cartMergeWarnings: mergeResult.warnings
    }, {
      "Set-Cookie": services.sessionService.createSessionCookie(session.id)
    });
  });

  router.post("/api/auth/logout", async ({ request, response }) => {
    const sessionId = getCookieValue(request, services.sessionCookieName);
    if (sessionId) {
      await services.sessionService.removeSession(sessionId);
    }
    services.sendJsonWithHeaders(response, 200, { ok: true }, {
      "Set-Cookie": services.sessionService.createExpiredSessionCookie()
    });
  });
}

module.exports = {
  LOGIN_RATE_LIMIT_POLICY,
  REGISTER_RATE_LIMIT_POLICY,
  registerAuthRoutes
};

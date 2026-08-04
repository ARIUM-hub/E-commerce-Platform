const { normalizeClientIp } = require("../security/security-identifiers");
const { readBodyOrRespond } = require("./route-helpers");

const RESEND_POLICY = Object.freeze({
  windowMs: 60 * 60_000,
  blockMs: 60 * 60_000,
  limits: { account: 3, ip: 10 }
});
const CONFIRM_POLICY = Object.freeze({
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
  limits: { ip: 10 }
});
const PASSWORD_RESET_REQUEST_POLICY = Object.freeze({
  windowMs: 60 * 60_000,
  blockMs: 60 * 60_000,
  limits: { account: 3, ip: 10 }
});
const PASSWORD_RESET_CONFIRM_POLICY = Object.freeze({
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
  limits: { ip: 10 }
});

function getIp(request, trustProxy) {
  return normalizeClientIp(request, { trustProxy });
}

function sendRateLimited(response, services, result) {
  services.sendJsonWithHeaders(response, 429, {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests.",
      details: { retryAfterSeconds: result.retryAfterSeconds }
    }
  }, { "Retry-After": String(result.retryAfterSeconds) });
}

function registerAccountSecurityRoutes(router, services) {
  router.post("/api/auth/email-verification/resend", async ({ request, response, sendJson }) => {
    const user = await services.requireUser(request, response);
    if (!user) return;
    const identifiers = [
      { type: "account", value: user.email },
      { type: "ip", value: getIp(request, services.trustProxy) }
    ];
    const rateLimit = services.persistentRateLimiter.check(
      "email-verification-resend",
      identifiers,
      RESEND_POLICY
    );
    if (!rateLimit.allowed) {
      sendRateLimited(response, services, rateLimit);
      return;
    }
    services.persistentRateLimiter.recordFailure(
      "email-verification-resend",
      identifiers,
      RESEND_POLICY
    );
    const result = services.accountSecurityService.requestEmailVerification({ user });
    sendJson(response, 202, { ok: true, ...result });
  });

  router.post("/api/auth/email-verification/confirm", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const identifiers = [{ type: "ip", value: getIp(request, services.trustProxy) }];
    const rateLimit = services.persistentRateLimiter.check(
      "email-verification-confirm",
      identifiers,
      CONFIRM_POLICY
    );
    if (!rateLimit.allowed) {
      sendRateLimited(response, services, rateLimit);
      return;
    }
    const user = services.accountSecurityService.confirmEmailVerification({
      token: parsed.body.token
    });
    if (!user) {
      services.persistentRateLimiter.recordFailure(
        "email-verification-confirm",
        identifiers,
        CONFIRM_POLICY
      );
      sendError(
        response,
        400,
        "EMAIL_VERIFICATION_TOKEN_INVALID",
        "Email verification token is invalid or expired."
      );
      return;
    }
    services.persistentRateLimiter.recordSuccess("email-verification-confirm", identifiers);
    sendJson(response, 200, {
      ok: true,
      user: services.createPublicUser(user)
    });
  });

  router.post("/api/auth/password-reset/request", async ({ request, response, sendJson }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const email = String(parsed.body.email || "").trim().toLowerCase();
    const identifiers = [
      { type: "account", value: email },
      { type: "ip", value: getIp(request, services.trustProxy) }
    ];
    const rateLimit = services.persistentRateLimiter.check(
      "password-reset-request",
      identifiers,
      PASSWORD_RESET_REQUEST_POLICY
    );
    if (!rateLimit.allowed) {
      sendRateLimited(response, services, rateLimit);
      return;
    }
    services.persistentRateLimiter.recordFailure(
      "password-reset-request",
      identifiers,
      PASSWORD_RESET_REQUEST_POLICY
    );
    services.accountSecurityService.requestPasswordReset({ email });
    sendJson(response, 202, {
      ok: true,
      message: "If an account exists, password reset instructions have been queued."
    });
  });

  router.post("/api/auth/password-reset/confirm", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const password = String(parsed.body.password || "");
    if (password.length < 8 || password.length > 128) {
      sendError(
        response,
        400,
        "PASSWORD_POLICY_INVALID",
        "Password must be between 8 and 128 characters."
      );
      return;
    }
    const identifiers = [{ type: "ip", value: getIp(request, services.trustProxy) }];
    const rateLimit = services.persistentRateLimiter.check(
      "password-reset-confirm",
      identifiers,
      PASSWORD_RESET_CONFIRM_POLICY
    );
    if (!rateLimit.allowed) {
      sendRateLimited(response, services, rateLimit);
      return;
    }
    const user = services.accountSecurityService.confirmPasswordReset({
      token: parsed.body.token,
      password
    });
    if (!user) {
      services.persistentRateLimiter.recordFailure(
        "password-reset-confirm",
        identifiers,
        PASSWORD_RESET_CONFIRM_POLICY
      );
      sendError(
        response,
        400,
        "PASSWORD_RESET_TOKEN_INVALID",
        "Password reset token is invalid or expired."
      );
      return;
    }
    services.persistentRateLimiter.recordSuccess("password-reset-confirm", identifiers);
    sendJson(response, 200, { ok: true });
  });
}

module.exports = {
  registerAccountSecurityRoutes
};

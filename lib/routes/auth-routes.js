const { getCookieValue } = require("../http/cookies");
const { readBodyOrRespond, sendRepositoryResult } = require("./route-helpers");

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
    const result = services.withDatabase((db) => services.authService.registerUser(db, parsed.body));
    if (result.validationError) {
      sendRepositoryResult(response, sendJson, sendError, result);
      return;
    }
    const previousSessionId = getCookieValue(request, services.sessionCookieName);
    const session = await services.sessionService.createUserSession(result.user.id);
    const mergeResult = await services.mergeAnonymousCartIntoUserCart(result.user, previousSessionId);
    services.sendJsonWithHeaders(response, 201, {
      ok: true,
      user: services.createPublicUser(result.user),
      cart: services.getCartPayload(mergeResult.cart),
      cartMergeWarnings: mergeResult.warnings
    }, {
      "Set-Cookie": services.sessionService.createSessionCookie(session.id)
    });
  });

  router.post("/api/auth/login", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const result = services.withDatabase((db) => services.authService.authenticateUser(db, parsed.body));
    if (result.validationError) {
      sendRepositoryResult(response, sendJson, sendError, result);
      return;
    }
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
  registerAuthRoutes
};

async function readBodyOrRespond(request, response, services) {
  try {
    return { body: await services.readRequestBody(request) };
  } catch (error) {
    if (services.handleRequestBodyError(error, response)) return { handled: true };
    throw error;
  }
}

function registerAnalyticsRoutes(router, services) {
  const limiter = services.createAnalyticsEventLimiter();

  router.post("/api/analytics/events", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;

    const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
    if (activeCart.setCookieHeader) {
      response.setHeader("Set-Cookie", activeCart.setCookieHeader);
    }
    const visitorId = activeCart.visitorId;
    const limit = limiter.consume(visitorId);
    if (!limit.allowed) {
      sendError(response, 429, "ANALYTICS_RATE_LIMITED", "Too many analytics events.", {
        retryAfterSeconds: Math.ceil(limit.retryAfterMs / 1000)
      });
      return;
    }

    const result = services.withDatabase((db) => services.recordAnalyticsEvent(db, parsed.body, {
      visitorId,
      sessionId: visitorId,
      userId: activeCart.user?.id || null,
      now: new Date()
    }));
    if (result.validationError) {
      const error = result.validationError;
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }
    sendJson(response, result.recorded ? 201 : 200, { ok: true, ...result });
  });
}

module.exports = { registerAnalyticsRoutes };

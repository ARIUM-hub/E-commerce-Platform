const crypto = require("node:crypto");

function parseAccountTicketPath(pathname) {
  const match = pathname.match(/^\/api\/me\/support\/tickets\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAccountMessagePath(pathname) {
  const match = pathname.match(/^\/api\/me\/support\/tickets\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseGuestMessagePath(pathname) {
  const match = pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readBodyOrRespond(request, response, services) {
  try {
    return { body: await services.readRequestBody(request) };
  } catch (error) {
    if (services.handleRequestBodyError(error, response)) return { handled: true };
    throw error;
  }
}

function setSessionCookie(response, activeCart) {
  if (activeCart?.setCookieHeader) {
    response.setHeader("Set-Cookie", activeCart.setCookieHeader);
  }
}

function createLookupKey(request, activeCart) {
  const identity = activeCart.user?.id || activeCart.sessionId || "anonymous";
  const address = request.socket?.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(`${identity}\n${address}`).digest("hex");
}

function sendRepositoryResult(response, sendJson, sendError, result, statusCode = 200) {
  if (result.validationError) {
    sendError(
      response,
      result.validationError.statusCode || 400,
      result.validationError.code,
      result.validationError.message,
      result.validationError.currentVersion === undefined
        ? {}
        : { currentVersion: result.validationError.currentVersion }
    );
    return;
  }
  sendJson(response, statusCode, { ok: true, ...result });
}

function sendTicketNotFound(response, sendError) {
  sendError(response, 404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found.");
}

function registerSupportTicketRoutes(router, services) {
  router.post("/api/support/contact", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
    setSessionCookie(response, activeCart);
    const lookupKey = createLookupKey(request, activeCart);
    const result = services.withDatabase((db) => services.createSupportTicket(db, parsed.body, {
      sessionId: activeCart.user ? null : activeCart.sessionId,
      userId: activeCart.user?.id || null,
      authorizedParentTicketIds: services.supportLookupLimiter.getAuthorizedTicketIds(lookupKey)
    }));
    sendRepositoryResult(response, sendJson, sendError, result, 201);
  });

  router.post("/api/support/tickets/lookup", async ({ request, response, sendJson, sendError }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
    setSessionCookie(response, activeCart);
    const lookupKey = createLookupKey(request, activeCart);
    if (!services.supportLookupLimiter.canAttempt(lookupKey)) {
      const retryAfterSeconds = Math.ceil(services.supportLookupLimiter.retryAfterMs(lookupKey) / 1000);
      sendError(response, 429, "SUPPORT_LOOKUP_RATE_LIMITED", "Too many failed support ticket lookups.", {
        retryAfterSeconds
      });
      return;
    }
    const ticket = services.withDatabase((db) => services.findSupportTicketForGuest(
      db,
      parsed.body.ticketNumber,
      parsed.body.contact
    ));
    if (!ticket) {
      services.supportLookupLimiter.recordFailure(lookupKey);
      sendTicketNotFound(response, sendError);
      return;
    }
    services.supportLookupLimiter.recordSuccess(lookupKey);
    services.supportLookupLimiter.authorizeTicket(lookupKey, ticket.id);
    sendJson(response, 200, { ok: true, ticket });
  });

  router.add("POST", /^\/api\/support\/tickets\/[^/]+\/messages$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
    setSessionCookie(response, activeCart);
    const lookupKey = createLookupKey(request, activeCart);
    const ticketNumber = parseGuestMessagePath(requestUrl.pathname);
    const ticket = services.withDatabase((db) => services.findSupportTicketByNumber(db, ticketNumber, {
      audience: "admin"
    }));
    if (!ticket || !services.supportLookupLimiter.canAccessTicket(lookupKey, ticket.id)) {
      sendTicketNotFound(response, sendError);
      return;
    }
    const result = services.withDatabase((db) => services.addCustomerTicketMessage(
      db,
      ticket,
      { sessionId: activeCart.sessionId },
      parsed.body.message
    ));
    sendRepositoryResult(response, sendJson, sendError, result);
  });

  router.get("/api/me/support/tickets", async ({ request, response, sendJson }) => {
    const user = await services.requireUser(request, response, {
      code: "AUTH_REQUIRED",
      message: "Authentication is required."
    });
    if (!user) return;
    const tickets = services.withDatabase((db) => services.listSupportTicketsForUser(db, user.id));
    sendJson(response, 200, { ok: true, tickets });
  });

  router.add("GET", /^\/api\/me\/support\/tickets\/[^/]+$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const user = await services.requireUser(request, response);
    if (!user) return;
    const ticketId = parseAccountTicketPath(requestUrl.pathname);
    const ticket = services.withDatabase((db) => {
      const internal = services.findSupportTicketById(db, ticketId, { audience: "admin" });
      if (!internal || internal.userId !== user.id) return null;
      return services.findSupportTicketById(db, ticketId, { audience: "customer" });
    });
    if (!ticket) {
      sendTicketNotFound(response, sendError);
      return;
    }
    sendJson(response, 200, { ok: true, ticket });
  });

  router.add("POST", /^\/api\/me\/support\/tickets\/[^/]+\/messages$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const user = await services.requireUser(request, response);
    if (!user) return;
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const ticketId = parseAccountMessagePath(requestUrl.pathname);
    const ticket = services.withDatabase((db) => services.findSupportTicketById(db, ticketId, {
      audience: "admin"
    }));
    if (!ticket || ticket.userId !== user.id) {
      sendTicketNotFound(response, sendError);
      return;
    }
    const result = services.withDatabase((db) => services.addCustomerTicketMessage(
      db,
      ticket,
      { userId: user.id },
      parsed.body.message
    ));
    sendRepositoryResult(response, sendJson, sendError, result);
  });
}

module.exports = { registerSupportTicketRoutes };

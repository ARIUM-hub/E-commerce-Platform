const { PERMISSIONS } = require("../auth/permissions");

function parseAdminTicketPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/support\/tickets\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminTicketActionPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/support\/tickets\/([^/]+)\/actions\/(update|message)$/);
  return match ? { ticketId: decodeURIComponent(match[1]), action: match[2] } : null;
}

async function readBodyOrRespond(request, response, services) {
  try {
    return { body: await services.readRequestBody(request) };
  } catch (error) {
    if (services.handleRequestBodyError(error, response)) return { handled: true };
    throw error;
  }
}

function sendResult(response, sendJson, sendError, result) {
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
  sendJson(response, 200, { ok: true, ...result });
}

function registerAdminSupportRoutes(router, services) {
  router.get("/api/admin/support/tickets", async ({ request, requestUrl, response, sendJson }) => {
    const admin = await services.requirePermission(PERMISSIONS.SUPPORT_READ, request, response);
    if (!admin) return;
    const result = services.withDatabase((db) => services.listAdminSupportTickets(db, {
      status: requestUrl.searchParams.get("status") || "",
      priority: requestUrl.searchParams.get("priority") || "",
      assignee: requestUrl.searchParams.get("assignee") || "",
      topic: requestUrl.searchParams.get("topic") || "",
      q: requestUrl.searchParams.get("q") || ""
    }));
    sendJson(response, 200, { ok: true, ...result });
  });

  router.add("GET", /^\/api\/admin\/support\/tickets\/[^/]+$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const admin = await services.requirePermission(PERMISSIONS.SUPPORT_READ, request, response);
    if (!admin) return;
    const ticket = services.withDatabase((db) => services.findSupportTicketById(
      db,
      parseAdminTicketPath(requestUrl.pathname),
      { audience: "admin" }
    ));
    if (!ticket) {
      sendError(response, 404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found.");
      return;
    }
    sendJson(response, 200, { ok: true, ticket });
  });

  router.add("POST", /^\/api\/admin\/support\/tickets\/[^/]+\/actions\/(update|message)$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const pathValues = parseAdminTicketActionPath(requestUrl.pathname);
    const requiredPermission = pathValues.action === "update"
      ? PERMISSIONS.SUPPORT_ASSIGN
      : PERMISSIONS.SUPPORT_REPLY;
    const admin = await services.requirePermission(requiredPermission, request, response);
    if (!admin) return;
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const result = services.withDatabase((db) => pathValues.action === "update"
      ? services.updateSupportTicket(db, { admin, ticketId: pathValues.ticketId, body: parsed.body })
      : services.addAdminSupportMessage(db, { admin, ticketId: pathValues.ticketId, body: parsed.body }));
    sendResult(response, sendJson, sendError, result);
  });
}

module.exports = { registerAdminSupportRoutes };

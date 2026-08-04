const { PERMISSIONS } = require("../auth/permissions");
const { normalizeClientIp } = require("../security/security-identifiers");

function registerSecurityRoutes(router, services) {
  router.get("/api/security/csrf", ({ response }) => {
    const issued = services.csrfService.issueToken();
    services.sendJsonWithHeaders(response, 200, {
      ok: true,
      csrfToken: issued.token
    }, {
      "Set-Cookie": services.csrfService.createCsrfCookie(issued.token)
    });
  });

  router.get("/api/admin/security-audit", async ({ request, requestUrl, response, sendJson }) => {
    const user = await services.requirePermission(PERMISSIONS.AUDIT_READ, request, response);
    if (!user) return;
    const result = services.withDatabase((db) => services.listSecurityAuditEvents(db, {
      eventType: requestUrl.searchParams.get("eventType") || "",
      outcome: requestUrl.searchParams.get("outcome") || "",
      actorUserId: requestUrl.searchParams.get("actorUserId") || "",
      page: requestUrl.searchParams.get("page"),
      pageSize: requestUrl.searchParams.get("pageSize")
    }));
    sendJson(response, 200, { ok: true, ...result });
  });

  router.get("/api/admin/security-email-outbox", async ({ request, response, sendJson, sendError }) => {
    const clientIp = normalizeClientIp(request, { trustProxy: false });
    const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1";
    if (services.isProduction || !isLoopback) {
      sendError(response, 404, "NOT_FOUND", "Resource was not found.");
      return;
    }
    const user = await services.requirePermission(PERMISSIONS.AUDIT_READ, request, response);
    if (!user) return;
    const items = services.withDatabase((db) => services.listOutbox(db, { limit: 100 }));
    sendJson(response, 200, { ok: true, items });
  });
}

module.exports = {
  registerSecurityRoutes
};

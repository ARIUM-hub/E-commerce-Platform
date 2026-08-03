const { PERMISSIONS } = require("../auth/permissions");

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
}

module.exports = {
  registerSecurityRoutes
};

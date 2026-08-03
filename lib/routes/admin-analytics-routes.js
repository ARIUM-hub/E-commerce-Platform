function registerAdminAnalyticsRoutes(router, services) {
  router.get("/api/admin/analytics", async ({ request, requestUrl, response, sendJson, sendError }) => {
    const admin = await services.requireAdmin(request, response);
    if (!admin) return;

    const result = services.withDatabase((db) => services.getAdminAnalytics(db, {
      range: requestUrl.searchParams.get("range") || "30d",
      now: new Date()
    }));
    if (result.validationError) {
      const error = result.validationError;
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }
    sendJson(response, 200, { ok: true, ...result });
  });
}

module.exports = { registerAdminAnalyticsRoutes };

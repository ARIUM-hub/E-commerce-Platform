function registerHealthRoutes(router, services = {}) {
  router.get("/api/health", ({ response, sendJson }) => {
    sendJson(response, 200, { ok: true });
  });

  router.get("/api/ready", async ({ response, sendJson, sendError }) => {
    try {
      await services.checkReadiness();
      sendJson(response, 200, { ok: true, status: "ready" });
    } catch {
      sendError(response, 503, "SERVICE_NOT_READY", "Service is not ready.");
    }
  });
}

module.exports = {
  registerHealthRoutes
};

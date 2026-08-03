function registerTestRoutes(router, services) {
  router.post("/api/test/reset", async ({ response, sendJson, sendError }) => {
    if (!services.isTest) {
      sendError(response, 404, "NOT_FOUND", "Resource was not found.");
      return;
    }
    await services.resetTestDatabase();
    sendJson(response, 200, { ok: true });
  });
}

module.exports = {
  registerTestRoutes
};

function registerTestRoutes(router, services) {
  router.post("/api/test/reset", async ({ response, sendJson, sendError }) => {
    if (!services.isTest) {
      sendError(response, 404, "NOT_FOUND", "Resource was not found.");
      return;
    }
    await services.resetTestDatabase();
    sendJson(response, 200, { ok: true });
  });

  router.post("/api/test/verify-email", async ({ request, response, sendJson, sendError }) => {
    if (!services.isTest) {
      sendError(response, 404, "NOT_FOUND", "Resource was not found.");
      return;
    }
    const user = await services.requireUser(request, response);
    if (!user) return;
    const verifiedUser = services.withDatabase((db) => services.markUserEmailVerified(
      db,
      user.id,
      new Date()
    ));
    sendJson(response, 200, {
      ok: true,
      user: services.createPublicUser(verifiedUser)
    });
  });
}

module.exports = {
  registerTestRoutes
};

function registerHealthRoutes(router) {
  router.get("/api/health", ({ response, sendJson }) => {
    sendJson(response, 200, { ok: true });
  });
}

module.exports = {
  registerHealthRoutes
};

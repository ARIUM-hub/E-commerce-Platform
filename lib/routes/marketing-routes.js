function registerMarketingRoutes(router, services) {
  router.get("/api/marketing", ({ response, sendJson }) => {
    sendJson(response, 200, services.getMarketingPayload());
  });
}

module.exports = {
  registerMarketingRoutes
};

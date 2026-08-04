function registerTrustRoutes(router, services) {
  router.get("/api/trust-center", ({ requestUrl, response, sendJson }) => {
    const locale = services.normalizeLocale(requestUrl.searchParams.get("locale"));
    sendJson(response, 200, services.getTrustCenterContent(locale));
  });
}

module.exports = {
  registerTrustRoutes
};

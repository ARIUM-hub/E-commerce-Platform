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
}

module.exports = {
  registerSecurityRoutes
};

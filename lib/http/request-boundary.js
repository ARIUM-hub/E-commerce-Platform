function getRequestPathname(request) {
  try {
    return new URL(request.url, "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function createSafeRequestHandler({
  handleRequest,
  sendError,
  logger,
  errorReporter
}) {
  return async function safeRequestHandler(request, response) {
    try {
      await handleRequest(request, response);
    } catch (error) {
      const context = {
        requestId: String(response.getHeader?.("X-Request-Id") || ""),
        route: getRequestPathname(request)
      };
      errorReporter.captureException(error, context);
      logger.error("http.request.unhandled", {
        ...context,
        name: error.name || "Error"
      });
      if (!response.headersSent) {
        sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      } else {
        response.destroy();
      }
    }
  };
}

module.exports = {
  createSafeRequestHandler
};

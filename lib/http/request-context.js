const { randomUUID: createRandomUUID } = require("node:crypto");

const requestIdPattern = /^[A-Za-z0-9._-]{8,128}$/;

function createRequestContext(request, response, options = {}) {
  const now = options.now || Date.now;
  const randomUUID = options.randomUUID || createRandomUUID;
  const startedAt = now();
  const suppliedRequestId = String(request.headers?.["x-request-id"] || "").trim();
  const requestId = requestIdPattern.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();

  response.setHeader("X-Request-Id", requestId);
  return {
    requestId,
    complete(completedAt = now()) {
      return {
        durationMs: Math.max(0, completedAt - startedAt)
      };
    }
  };
}

function attachRequestCompletionLog({
  request,
  response,
  requestUrl,
  requestContext,
  logger
}) {
  let logged = false;
  const logCompletion = () => {
    if (logged) return;
    logged = true;
    const { durationMs } = requestContext.complete();
    logger.info("http.request.completed", {
      requestId: requestContext.requestId,
      method: request.method,
      route: requestUrl.pathname,
      statusCode: response.statusCode,
      durationMs
    });
  };

  response.once("finish", logCompletion);
  response.once("close", logCompletion);
}

module.exports = {
  createRequestContext,
  attachRequestCompletionLog
};

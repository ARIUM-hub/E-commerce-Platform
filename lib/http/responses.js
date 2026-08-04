const { createApiError } = require("../api-errors");
const { getSecurityHeaders, mergeHeaders } = require("../security");

function sendJson(response, statusCode, payload, options = {}) {
  response.writeHead(statusCode, mergeHeaders(
    getSecurityHeaders(options.securityHeadersEnabled),
    { "Content-Type": "application/json; charset=utf-8" },
    options.headers
  ));
  response.end(JSON.stringify(payload));
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}, options = {}) {
  sendJson(response, statusCode, payload, {
    ...options,
    headers
  });
}

function sendError(response, statusCode, code, message, details = {}, options = {}) {
  const apiError = createApiError(code, { statusCode, message, details });
  sendJson(response, apiError.statusCode, apiError.payload, options);
}

module.exports = {
  sendJson,
  sendJsonWithHeaders,
  sendError
};

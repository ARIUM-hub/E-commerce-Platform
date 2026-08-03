async function readBodyOrRespond(request, response, services) {
  try {
    return { body: await services.readRequestBody(request) };
  } catch (error) {
    if (services.handleRequestBodyError(error, response)) {
      return { handled: true };
    }
    throw error;
  }
}

function sendRepositoryResult(response, sendJson, sendError, result, statusCode = 200) {
  if (result.validationError) {
    const error = result.validationError;
    sendError(response, error.statusCode || 400, error.code, error.message, error.details || {});
    return;
  }
  sendJson(response, statusCode, { ok: true, ...result });
}

module.exports = {
  readBodyOrRespond,
  sendRepositoryResult
};

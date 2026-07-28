class JsonBodyError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = "JsonBodyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function readJsonBody(request, { limitBytes = 1048576 } = {}) {
  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > limitBytes) {
      throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", "Request body is too large.", 413);
    }
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new JsonBodyError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

module.exports = {
  JsonBodyError,
  readJsonBody
};

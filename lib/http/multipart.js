class MultipartError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "MultipartError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function readMultipartFile(request, { fieldName = "image", limitBytes = 3145728 } = {}) {
  const contentType = request.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > limitBytes) {
      throw new MultipartError("ADMIN_IMAGE_TOO_LARGE", "Image is too large.", 413);
    }
    chunks.push(chunk);
  }

  const boundary = `--${boundaryMatch[1]}`;
  const rawBody = Buffer.concat(chunks).toString("binary");
  const part = rawBody.split(boundary).find((entry) => entry.includes(`name="${fieldName}"`));
  if (!part) {
    throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");
  }

  const separator = "\r\n\r\n";
  const separatorIndex = part.indexOf(separator);
  if (separatorIndex === -1) {
    throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");
  }

  const rawHeaders = part.slice(0, separatorIndex);
  const filenameMatch = rawHeaders.match(/filename="([^"]*)"/i);
  const typeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
  const filename = filenameMatch ? filenameMatch[1] : "";
  const uploadedContentType = typeMatch ? typeMatch[1].trim().toLowerCase() : "";
  const binary = part.slice(separatorIndex + separator.length).replace(/\r\n$/, "");
  const buffer = Buffer.from(binary, "binary");

  if (!filename || buffer.length === 0) {
    throw new MultipartError("ADMIN_IMAGE_REQUIRED", "Image is required.");
  }

  return { filename, contentType: uploadedContentType, buffer };
}

module.exports = {
  MultipartError,
  readMultipartFile
};

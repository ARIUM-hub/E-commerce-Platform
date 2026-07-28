const fs = require("node:fs");
const path = require("node:path");
const { getSecurityHeaders, mergeHeaders } = require("../security");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStaticFile(pathname, { rootDir, staticRoutes }) {
  if (staticRoutes.has(pathname)) {
    return staticRoutes.get(pathname);
  }

  if (pathname.startsWith("/public/")) {
    const publicRoot = path.join(rootDir, "public");
    const requestedFile = path.resolve(rootDir, pathname.slice(1));
    return isPathInside(publicRoot, requestedFile) ? requestedFile : null;
  }

  return null;
}

function sendStaticFile(request, response, filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  response.writeHead(200, mergeHeaders(
    getSecurityHeaders(options.securityHeadersEnabled),
    { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" }
  ));

  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  fs.createReadStream(filePath).pipe(response);
  return true;
}

module.exports = {
  resolveStaticFile,
  sendStaticFile
};

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const rootDir = __dirname;
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const requiredDataFiles = ["products.json", "cart.json"];
const staticRoutes = new Map([
  ["/", path.join(rootDir, "socks-product-list.html")],
  ["/socks-product-list.html", path.join(rootDir, "socks-product-list.html")],
  ["/socks-product-card.html", path.join(rootDir, "socks-product-card.html")]
]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function validateDataDir() {
  const missingFiles = requiredDataFiles.filter((fileName) => {
    return !fs.existsSync(path.join(dataDir, fileName));
  });

  if (missingFiles.length > 0) {
    console.error(
      `DATA_DIR "${dataDir}" is missing required files: ${missingFiles.join(", ")}`
    );
    process.exit(1);
  }
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

function getStaticFilePath(urlPathname) {
  return staticRoutes.get(urlPathname) || null;
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method Not Allowed" });
    return;
  }

  const filePath = getStaticFilePath(requestUrl.pathname);
  if (!filePath) {
    sendJson(response, 404, { error: "Not Found" });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(response, 404, { error: "Not Found" });
      return;
    }

    if (request.method === "HEAD") {
      const extension = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[extension] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType });
      response.end();
      return;
    }

    sendFile(response, filePath);
  });
});

validateDataDir();

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});

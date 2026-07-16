const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const rootDir = __dirname;
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const productsFile = path.join(dataDir, "products.json");
const requiredDataFiles = ["products.json", "cart.json"];
const staticRoutes = new Map([
  ["/", path.join(rootDir, "socks-product-list.html")],
  ["/socks-product-list.html", path.join(rootDir, "socks-product-list.html")],
  ["/socks-product-card.html", path.join(rootDir, "socks-product-card.html")]
]);
const validFilters = new Set(["all", "sport", "daily", "crew", "no-show"]);
const validSorts = new Set(["recommended", "price-asc", "price-desc", "newest"]);

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

async function readJsonFile(filePath) {
  const content = await fsp.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function sortRecommended(left, right) {
  if (left.isRecommended !== right.isRecommended) {
    return Number(right.isRecommended) - Number(left.isRecommended);
  }

  return right.releaseDate.localeCompare(left.releaseDate);
}

function getProductsPayload(products, filterValue, sortValue) {
  const filter = validFilters.has(filterValue) ? filterValue : "all";
  const sort = validSorts.has(sortValue) ? sortValue : "recommended";
  const items = filter === "all"
    ? [...products]
    : products.filter((product) => product.categoryKey === filter);

  if (sort === "recommended") {
    items.sort(sortRecommended);
  } else if (sort === "price-asc") {
    items.sort((left, right) => left.price - right.price);
  } else if (sort === "price-desc") {
    items.sort((left, right) => right.price - left.price);
  } else if (sort === "newest") {
    items.sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  return {
    items,
    meta: {
      filter,
      sort,
      count: items.length
    }
  };
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/products") {
    try {
      const products = await readJsonFile(productsFile);
      const payload = getProductsPayload(
        products,
        requestUrl.searchParams.get("filter"),
        requestUrl.searchParams.get("sort")
      );
      sendJson(response, 200, payload);
      return;
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error."
        }
      });
      return;
    }
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

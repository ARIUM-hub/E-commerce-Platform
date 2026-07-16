const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const rootDir = __dirname;
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const productsFile = path.join(dataDir, "products.json");
const cartFile = path.join(dataDir, "cart.json");
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

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    ok: false,
    error: { code, message }
  });
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

async function writeJsonFile(filePath, payload) {
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

function getCartPayload(cart) {
  return {
    items: cart.items,
    meta: {
      itemCount: cart.items.length
    }
  };
}

function validateCartItemInput(products, body) {
  const product = products.find((item) => item.id === body.productId);
  if (!product) {
    return {
      statusCode: 404,
      code: "PRODUCT_NOT_FOUND",
      message: "Product was not found."
    };
  }

  if (!product.sizes.includes(body.size)) {
    return {
      statusCode: 400,
      code: "INVALID_SIZE",
      message: "Size is not available for this product."
    };
  }

  const quantity = body.quantity == null ? 1 : body.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      statusCode: 400,
      code: "INVALID_QUANTITY",
      message: "Quantity must be a positive integer."
    };
  }

  return { quantity };
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
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/cart") {
    try {
      const cart = await readJsonFile(cartFile);
      sendJson(response, 200, getCartPayload(cart));
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/cart/items") {
    try {
      const products = await readJsonFile(productsFile);
      const cart = await readJsonFile(cartFile);
      const body = await readRequestBody(request);
      const validation = validateCartItemInput(products, body);

      if (validation.statusCode) {
        sendError(response, validation.statusCode, validation.code, validation.message);
        return;
      }

      const existingItem = cart.items.find((item) => {
        return item.productId === body.productId && item.size === body.size;
      });

      if (existingItem) {
        existingItem.quantity += validation.quantity;
      } else {
        cart.items.push({
          productId: body.productId,
          size: body.size,
          quantity: validation.quantity
        });
      }

      await writeJsonFile(cartFile, cart);

      const item = cart.items.find((entry) => {
        return entry.productId === body.productId && entry.size === body.size;
      });

      sendJson(response, 200, {
        ok: true,
        item,
        meta: getCartPayload(cart).meta
      });
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
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

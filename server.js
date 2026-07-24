const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createApiError } = require("./lib/api-errors");
const { createDatabase, initializeDatabase, getDatabasePath } = require("./lib/database");
const { listProducts } = require("./lib/repositories/products");
const {
  findUserByEmail,
  findUserById,
  countUsers,
  createUser,
  createSession,
  findSession,
  deleteSession,
  replaceAddresses
} = require("./lib/repositories/users");
const {
  ensureCart,
  getCart,
  replaceCartItems,
  mergeCarts,
  setCartCouponCode
} = require("./lib/repositories/carts");
const {
  findBundleById,
  findCouponByCode,
  listRecentProductIds,
  recordRecentView,
  listActiveMarketingCampaigns
} = require("./lib/repositories/marketing");
const {
  createOrderTransaction,
  countOrders,
  listOrders,
  findOrderById,
  saveOrder
} = require("./lib/repositories/orders");
const { createPricingSummary } = require("./lib/pricing");

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const rootDir = __dirname;
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const productsFile = path.join(dataDir, "products.json");
const requiredDataFiles = [
  "products.json"
];
const staticRoutes = new Map([
  ["/", path.join(rootDir, "socks-product-list.html")],
  ["/socks-product-list.html", path.join(rootDir, "socks-product-list.html")],
  ["/socks-product-card.html", path.join(rootDir, "socks-product-card.html")],
  ["/socks-order-confirmation.html", path.join(rootDir, "socks-order-confirmation.html")]
]);
const validFilters = new Set(["all", "sport", "daily", "crew", "no-show"]);
const validSorts = new Set(["recommended", "price-asc", "price-desc", "newest"]);
const validLocales = new Set(["zh-CN", "en-US"]);
const validStockFilters = new Set(["all", "in-stock", "low-stock", "out-of-stock"]);
const shippingMethods = {
  standard: {
    id: "standard",
    label: { "zh-CN": "标准配送", "en-US": "Standard delivery" },
    fee: 0,
    deliveryDays: 4
  },
  express: {
    id: "express",
    label: { "zh-CN": "加急配送", "en-US": "Express delivery" },
    fee: 12,
    deliveryDays: 2
  }
};
const orderStatusLabels = {
  pending_payment: { "zh-CN": "待支付", "en-US": "Pending payment" },
  paid: { "zh-CN": "已支付", "en-US": "Paid" },
  processing: { "zh-CN": "处理中", "en-US": "Processing" },
  shipped: { "zh-CN": "已发货", "en-US": "Shipped" },
  delivered: { "zh-CN": "已送达", "en-US": "Delivered" },
  cancelled: { "zh-CN": "已取消", "en-US": "Cancelled" }
};
const sessionCookieName = "socks_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;

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

function sendJsonWithHeaders(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendCartJson(response, statusCode, payload, activeCart) {
  if (activeCart?.setCookieHeader) {
    sendJsonWithHeaders(response, statusCode, payload, {
      "Set-Cookie": activeCart.setCookieHeader
    });
    return;
  }

  sendJson(response, statusCode, payload);
}

function sendError(response, statusCode, code, message, details = {}) {
  const apiError = createApiError(code, { statusCode, message, details });
  sendJson(response, apiError.statusCode, apiError.payload);
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

function withDatabase(callback) {
  const db = initializeDatabase(createDatabase(getDatabasePath({ dataDir })), {
    productsSeedFile: productsFile
  });

  try {
    return callback(db);
  } finally {
    db.close();
  }
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

function normalizeLocale(localeValue) {
  return validLocales.has(localeValue) ? localeValue : "zh-CN";
}

function localizeProduct(product, locale) {
  const fallbackCopy = product.localizedContent?.["zh-CN"] || {};
  const localizedCopy = product.localizedContent?.[locale] || fallbackCopy;
  const { localizedContent, ...rest } = product;

  return {
    ...rest,
    title: localizedCopy.title || fallbackCopy.title || product.title,
    categoryLabel: localizedCopy.categoryLabel || fallbackCopy.categoryLabel || product.categoryLabel,
    description: localizedCopy.description || fallbackCopy.description || product.description
  };
}

function normalizeSearchQuery(queryValue) {
  return typeof queryValue === "string" ? queryValue.trim() : "";
}

function normalizeOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProductRefinements(options = {}) {
  const minPrice = normalizeOptionalNumber(options.minPrice);
  const maxPrice = normalizeOptionalNumber(options.maxPrice);
  const ratingMin = normalizeOptionalNumber(options.ratingMin);
  const stock = validStockFilters.has(options.stock) ? options.stock : "all";
  const size = String(options.size || "").trim();

  return {
    minPrice,
    maxPrice,
    size,
    stock,
    ratingMin
  };
}

function normalizePositiveInteger(value, fallback, options = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return options.max ? Math.min(parsed, options.max) : parsed;
}

function paginateItems(items, page, pageSize) {
  const totalCount = items.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    hasMore: safePage < totalPages,
    items: items.slice(startIndex, startIndex + pageSize)
  };
}

function matchesLocalizedProductQuery(product, query) {
  const normalizedQuery = query.toLocaleLowerCase();

  return [product.title, product.description, product.categoryLabel].some((fieldValue) => {
    return typeof fieldValue === "string" && fieldValue.toLocaleLowerCase().includes(normalizedQuery);
  });
}

function hasSellableVariant(product, size = "") {
  return getProductVariants(product).some((variant) => {
    const sizeMatches = !size || variant.size === size;
    return sizeMatches && variant.isAvailable && variant.stockQuantity > 0;
  });
}

function hasLowStockVariant(product, size = "") {
  return getProductVariants(product).some((variant) => {
    const sizeMatches = !size || variant.size === size;
    return sizeMatches
      && variant.isAvailable
      && variant.stockQuantity > 0
      && variant.stockQuantity <= variant.lowStockThreshold;
  });
}

function matchesSizeFilter(product, size) {
  return !size || getProductVariants(product).some((variant) => variant.size === size);
}

function matchesStockFilter(product, stock, size) {
  if (stock === "in-stock") {
    return hasSellableVariant(product, size);
  }

  if (stock === "low-stock") {
    return hasLowStockVariant(product, size);
  }

  if (stock === "out-of-stock") {
    return !hasSellableVariant(product, size);
  }

  return true;
}

function matchesProductRefinements(product, refinements) {
  if (refinements.minPrice !== null && product.price < refinements.minPrice) {
    return false;
  }

  if (refinements.maxPrice !== null && product.price > refinements.maxPrice) {
    return false;
  }

  if (refinements.ratingMin !== null && product.ratingValue < refinements.ratingMin) {
    return false;
  }

  if (!matchesSizeFilter(product, refinements.size)) {
    return false;
  }

  return matchesStockFilter(product, refinements.stock, refinements.size);
}

function getNoResultRecommendations(products, locale, limit = 4) {
  return products
    .map((product) => localizeProduct(product, locale))
    .filter((product) => hasSellableVariant(product))
    .sort((left, right) => {
      if (left.isBestSeller !== right.isBestSeller) {
        return Number(right.isBestSeller) - Number(left.isBestSeller);
      }

      if (left.isRecommended !== right.isRecommended) {
        return Number(right.isRecommended) - Number(left.isRecommended);
      }

      if (left.ratingValue !== right.ratingValue) {
        return right.ratingValue - left.ratingValue;
      }

      return right.reviewCount - left.reviewCount;
    })
    .slice(0, limit);
}

function getRecommendationItems(products, scenario, options = {}) {
  const excludedIds = new Set();
  if (options.productId) {
    excludedIds.add(options.productId);
  }
  if (Array.isArray(options.excludeProductIds)) {
    options.excludeProductIds.forEach((id) => excludedIds.add(id));
  }

  return products
    .filter((product) => !excludedIds.has(product.id))
    .filter((product) => hasSellableVariant(product))
    .sort((left, right) => {
      if (scenario === "cart" && left.isBestSeller !== right.isBestSeller) {
        return Number(right.isBestSeller) - Number(left.isBestSeller);
      }

      if (left.isRecommended !== right.isRecommended) {
        return Number(right.isRecommended) - Number(left.isRecommended);
      }

      if (left.ratingValue !== right.ratingValue) {
        return right.ratingValue - left.ratingValue;
      }

      return right.reviewCount - left.reviewCount;
    })
    .slice(0, scenario === "cart" ? 4 : 3);
}

function getProductsPayload(products, filterValue, sortValue, localeValue, queryValue, options = {}) {
  const filter = validFilters.has(filterValue) ? filterValue : "all";
  const sort = validSorts.has(sortValue) ? sortValue : "recommended";
  const locale = normalizeLocale(localeValue);
  const q = normalizeSearchQuery(queryValue);
  const refinements = normalizeProductRefinements(options);
  const items = filter === "all"
    ? [...products]
    : products.filter((product) => product.categoryKey === filter);

  const localizedItems = items.map((product) => localizeProduct(product, locale));
  const matchedItems = q
    ? localizedItems.filter((product) => matchesLocalizedProductQuery(product, q))
    : localizedItems;
  const refinedItems = matchedItems.filter((product) => matchesProductRefinements(product, refinements));

  if (sort === "recommended") {
    refinedItems.sort(sortRecommended);
  } else if (sort === "price-asc") {
    refinedItems.sort((left, right) => left.price - right.price);
  } else if (sort === "price-desc") {
    refinedItems.sort((left, right) => right.price - left.price);
  } else if (sort === "newest") {
    refinedItems.sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  const payloadMeta = {
    filter,
    sort,
    count: refinedItems.length
  };

  if (localeValue) {
    payloadMeta.locale = locale;
  }

  if (q) {
    payloadMeta.q = q;
  }

  const page = normalizePositiveInteger(options.page, 1);
  const pageSize = normalizePositiveInteger(options.pageSize, 8, { max: 24 });
  const paginated = paginateItems(refinedItems, page, pageSize);
  const recommendations = paginated.totalCount === 0
    ? getNoResultRecommendations(products, locale)
    : [];

  return {
    items: paginated.items,
    recommendations,
    meta: {
      ...payloadMeta,
      count: paginated.items.length,
      totalCount: paginated.totalCount,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalPages: paginated.totalPages,
      hasMore: paginated.hasMore,
      filters: refinements
    }
  };
}

function getMarketingPayload() {
  return withDatabase((db) => listActiveMarketingCampaigns(db));
}

function getCartPayload(cart, options = {}) {
  const products = options.products || withDatabase((db) => listProducts(db));
  const marketing = options.marketing || getMarketingPayload();
  const pricing = createPricingSummary({
    cart,
    products,
    marketing,
    shippingFee: options.shippingFee || 0
  });

  return {
    items: cart.items,
    couponCode: cart.couponCode || "",
    pricing,
    meta: {
      itemCount: cart.items.length
    }
  };
}

function getProductVariants(product) {
  return Array.isArray(product.variants) ? product.variants : [];
}

function findProductVariant(product, size) {
  return getProductVariants(product).find((variant) => variant.size === size) || null;
}

function isVariantSellable(variant) {
  return Boolean(variant)
    && variant.isAvailable !== false
    && Number.isInteger(variant.stockQuantity)
    && variant.stockQuantity > 0;
}

function getVariantStockLimit(variant) {
  if (!variant || !Number.isInteger(variant.stockQuantity) || variant.stockQuantity < 0) {
    return null;
  }
  return variant.stockQuantity;
}

function normalizeCartItemWithVariant(item, product) {
  const variant = item.skuId
    ? getProductVariants(product).find((entry) => entry.skuId === item.skuId)
    : findProductVariant(product, item.size);

  return variant
    ? { ...item, skuId: variant.skuId, size: variant.size }
    : item;
}

function isCartItemForVariant(item, variant) {
  return item.skuId === variant.skuId
    || (!item.skuId && variant.skuId === `${item.productId}-${item.size}`);
}

function getCartSkuQuantity(cart, variant, excludedSkuId) {
  return cart.items.reduce((sum, item) => {
    if (!isCartItemForVariant(item, variant) || excludedSkuId === variant.skuId) {
      return sum;
    }
    return sum + item.quantity;
  }, 0);
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

  const variant = findProductVariant(product, body.size);
  if (!variant) {
    return {
      statusCode: 400,
      code: "INVALID_SIZE",
      message: "Size is not available for this product."
    };
  }

  if (!isVariantSellable(variant)) {
    return {
      statusCode: 409,
      code: "OUT_OF_STOCK",
      message: "Selected size is out of stock."
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

  return { product, variant, quantity };
}

function validateCouponForCart(coupon, cart, products) {
  if (!coupon) {
    return { ok: false, code: "COUPON_NOT_FOUND", message: "Coupon was not found." };
  }

  const itemTotal = cart.items.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);

  if (itemTotal < coupon.minimumSubtotal) {
    return {
      ok: false,
      code: "COUPON_MINIMUM_NOT_MET",
      message: `Coupon requires at least ¥${coupon.minimumSubtotal}.`
    };
  }

  return { ok: true };
}

function findCartItemIndex(cart, productId, size) {
  return cart.items.findIndex((item) => {
    return item.productId === productId && item.size === size;
  });
}

function getProductStockLimit(product) {
  return Number.isInteger(product.stockQuantity) && product.stockQuantity > 0
    ? product.stockQuantity
    : null;
}

function getCartProductQuantity(cart, productId, excludedSize) {
  return cart.items.reduce((total, item) => {
    if (item.productId !== productId || item.size === excludedSize) {
      return total;
    }

    return total + item.quantity;
  }, 0);
}

function validateStockQuantity(cart, product, requestedQuantity, excludedSize) {
  const stockLimit = getProductStockLimit(product);
  if (stockLimit === null) {
    return null;
  }

  const nextProductQuantity = getCartProductQuantity(cart, product.id, excludedSize) + requestedQuantity;
  if (nextProductQuantity <= stockLimit) {
    return null;
  }

  return {
    statusCode: 409,
    code: "OUT_OF_STOCK",
    message: "Product stock is not enough for the requested quantity."
  };
}

function validateSkuStockQuantity(cart, variant, requestedQuantity, excludedSkuId) {
  const stockLimit = getVariantStockLimit(variant);
  if (stockLimit === null) {
    return null;
  }

  const currentQuantity = getCartSkuQuantity(cart, variant, excludedSkuId);
  const nextQuantity = currentQuantity + requestedQuantity;
  if (nextQuantity <= stockLimit) {
    return null;
  }

  return {
    statusCode: 409,
    code: "INSUFFICIENT_STOCK",
    message: "Selected size stock is not enough for the requested quantity."
  };
}

function getRequiredCheckoutFields(body) {
  const missingFields = [];
  const customer = body.customer || {};
  const shippingAddress = body.shippingAddress || {};

  if (!String(customer.name || "").trim()) missingFields.push("customer.name");
  if (!String(customer.contact || "").trim()) missingFields.push("customer.contact");
  if (!String(shippingAddress.address || "").trim()) missingFields.push("shippingAddress.address");
  if (!String(shippingAddress.city || "").trim()) missingFields.push("shippingAddress.city");
  if (!String(shippingAddress.region || "").trim()) missingFields.push("shippingAddress.region");
  if (!String(shippingAddress.postalCode || "").trim()) missingFields.push("shippingAddress.postalCode");

  return missingFields;
}

function formatDeliveryDate(daysFromNow, locale = "zh-CN") {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function getShippingMethod(methodId, locale = "zh-CN") {
  const method = shippingMethods[methodId];
  if (!method) {
    return null;
  }

  return {
    id: method.id,
    label: method.label[locale] || method.label["zh-CN"],
    fee: method.fee,
    estimatedDelivery: formatDeliveryDate(method.deliveryDays, locale)
  };
}

function buildOrderId(existingOrders) {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("-", "");
  const sequence = String(existingOrders.length + 1).padStart(4, "0");
  return `SOCK-${stamp}-${sequence}`;
}

function buildOrderItems(cart, products, locale = "zh-CN") {
  return cart.items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const variant = product ? findProductVariant(product, item.size) : null;
    const localizedProduct = localizeProduct(product, locale);

    return {
      productId: item.productId,
      skuId: item.skuId || variant?.skuId || `${product.id}-${item.size}`,
      title: localizedProduct.title,
      size: item.size,
      quantity: item.quantity,
      price: product.price,
      originalPrice: product.originalPrice
    };
  });
}

function calculateOrderTotals(items, shippingFee) {
  const subtotal = items.reduce((total, item) => total + item.originalPrice * item.quantity, 0);
  const itemTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const savings = subtotal - itemTotal;

  return {
    subtotal,
    savings,
    shipping: shippingFee,
    total: itemTotal + shippingFee
  };
}

function createTimelineEntry(status, locale = "zh-CN") {
  return {
    status,
    label: orderStatusLabels[status][locale] || orderStatusLabels[status]["zh-CN"],
    at: new Date().toISOString()
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    addresses: Array.isArray(user.addresses) ? user.addresses : []
  };
}

function buildUserId(users) {
  return `user-${String(users.length + 1).padStart(4, "0")}`;
}

function createPasswordSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  const hash = crypto.createHash("sha256");
  hash.update(`${salt}:${password}`);
  return `sha256:${hash.digest("hex")}`;
}

function verifyPassword(password, user) {
  return hashPassword(password, user.passwordSalt) === user.passwordHash;
}

function createSessionId() {
  return crypto.randomBytes(24).toString("hex");
}

function getCookieValue(request, cookieName) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .map((entry) => entry.split("="))
    .find(([name]) => name === cookieName)?.[1] || "";
}

function createSessionCookie(sessionId) {
  return `${sessionCookieName}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}`;
}

function createExpiredSessionCookie() {
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

async function getSessionContext(request) {
  const sessionId = getCookieValue(request, sessionCookieName);
  if (!sessionId) {
    return { session: null, user: null };
  }

  const { session, user } = withDatabase((db) => {
    const foundSession = findSession(db, sessionId);
    const now = Date.now();
    const isActiveSession = foundSession && (!foundSession.expiresAt || new Date(foundSession.expiresAt).getTime() > now);
    return {
      session: isActiveSession ? foundSession : null,
      user: isActiveSession && foundSession.userId ? findUserById(db, foundSession.userId) : null
    };
  });

  return { session, user };
}

async function createUserSession(userId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionMaxAgeSeconds * 1000);
  const session = {
    id: createSessionId(),
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  withDatabase((db) => createSession(db, session));
  return session;
}

async function removeSession(sessionId) {
  withDatabase((db) => deleteSession(db, sessionId));
}

function validateAuthPayload(body, mode) {
  const missingFields = [];
  if (mode === "register" && !String(body.name || "").trim()) missingFields.push("name");
  if (!normalizeEmail(body.email)) missingFields.push("email");
  if (!String(body.password || "").trim()) missingFields.push("password");
  return missingFields;
}

function normalizeCartPayload(cart) {
  return {
    couponCode: cart.couponCode || "",
    items: Array.isArray(cart.items) ? cart.items : []
  };
}

async function readActiveCart(request, options = {}) {
  const { user } = await getSessionContext(request);
  if (!user) {
    let sessionId = getCookieValue(request, sessionCookieName);
    let setCookieHeader = null;

    if (options.createAnonymousSession && !sessionId) {
      sessionId = createSessionId();
      const now = new Date();
      const session = {
        id: sessionId,
        userId: null,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + sessionMaxAgeSeconds * 1000).toISOString()
      };
      withDatabase((db) => createSession(db, session));
      setCookieHeader = createSessionCookie(sessionId);
    } else if (options.createAnonymousSession && sessionId) {
      withDatabase((db) => {
        if (!findSession(db, sessionId)) {
          const now = new Date();
          createSession(db, {
            id: sessionId,
            userId: null,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + sessionMaxAgeSeconds * 1000).toISOString()
          });
        }
      });
    }

    return {
      user: null,
      sessionId,
      setCookieHeader,
      ...withDatabase((db) => {
        const databaseCart = sessionId ? getCart(db, { sessionId }) : { items: [] };
        return {
          cartId: databaseCart.id || null,
          cart: normalizeCartPayload(databaseCart)
        };
      })
    };
  }

  const userDatabaseCart = withDatabase((db) => getCart(db, { userId: user.id }));
  return {
    user,
    sessionId: null,
    setCookieHeader: null,
    cartId: userDatabaseCart.id || null,
    cart: normalizeCartPayload(userDatabaseCart)
  };
}

async function writeActiveCart(activeCart, cart) {
  const normalizedCart = normalizeCartPayload(cart);
  const userId = activeCart.user?.id || null;
  const sessionId = userId ? null : activeCart.sessionId;
  if (!userId && !sessionId) {
    return normalizedCart;
  }

  withDatabase((db) => {
    const databaseCart = ensureCart(db, { userId, sessionId });
    replaceCartItems(db, databaseCart.id, normalizedCart.items);
  });
  return normalizedCart;
}

function mergeCartItems(baseItems, incomingItems, products) {
  const mergedItems = baseItems.map((item) => ({ ...item }));
  const warnings = [];

  incomingItems.forEach((incomingItem) => {
    const product = products.find((entry) => entry.id === incomingItem.productId);
    const variant = product ? findProductVariant(product, incomingItem.size) : null;
    if (!product || !variant || !isVariantSellable(variant)) {
      return;
    }

    const existingItem = mergedItems.find((item) => {
      return item.skuId === variant.skuId
        || (item.productId === incomingItem.productId && item.size === variant.size);
    });
    const existingQuantity = existingItem ? existingItem.quantity : 0;
    const requestedQuantity = existingQuantity + incomingItem.quantity;
    const stockLimit = getVariantStockLimit(variant);
    const nextQuantity = stockLimit === null ? requestedQuantity : Math.min(requestedQuantity, stockLimit);

    if (stockLimit !== null && requestedQuantity > stockLimit) {
      warnings.push({
        code: "CART_MERGE_STOCK_ADJUSTED",
        productId: product.id,
        skuId: variant.skuId,
        size: variant.size,
        quantity: nextQuantity
      });
    }

    if (existingItem) {
      existingItem.productId = product.id;
      existingItem.skuId = variant.skuId;
      existingItem.size = variant.size;
      existingItem.quantity = nextQuantity;
    } else {
      mergedItems.push({
        productId: incomingItem.productId,
        skuId: variant.skuId,
        size: variant.size,
        quantity: nextQuantity
      });
    }
  });

  return { items: mergedItems, warnings };
}

async function mergeAnonymousCartIntoUserCart(user, anonymousSessionId) {
  const products = withDatabase((db) => listProducts(db));
  return withDatabase((db) => {
    const mergeResult = mergeCarts(db, {
      anonymousSessionId,
      userId: user.id,
      mergeItems: (baseItems, incomingItems) => mergeCartItems(baseItems, incomingItems, products)
    });

    return {
      cart: normalizeCartPayload(mergeResult.cart),
      warnings: mergeResult.warnings
    };
  });
}

function getRequiredAddressFields(body) {
  const missingFields = [];
  if (!String(body.name || "").trim()) missingFields.push("name");
  if (!String(body.contact || "").trim()) missingFields.push("contact");
  if (!String(body.address || "").trim()) missingFields.push("address");
  if (!String(body.city || "").trim()) missingFields.push("city");
  if (!String(body.region || "").trim()) missingFields.push("region");
  if (!String(body.postalCode || "").trim()) missingFields.push("postalCode");
  return missingFields;
}

function buildAddressId(addresses) {
  return `addr-${String(addresses.length + 1).padStart(4, "0")}`;
}

function normalizeAddressPayload(body, existingAddress = {}) {
  return {
    ...existingAddress,
    name: String(body.name ?? existingAddress.name ?? "").trim(),
    contact: String(body.contact ?? existingAddress.contact ?? "").trim(),
    address: String(body.address ?? existingAddress.address ?? "").trim(),
    city: String(body.city ?? existingAddress.city ?? "").trim(),
    region: String(body.region ?? existingAddress.region ?? "").trim(),
    postalCode: String(body.postalCode ?? existingAddress.postalCode ?? "").trim(),
    note: String(body.note ?? existingAddress.note ?? "").trim()
  };
}

async function requireUser(request, response) {
  const { user } = await getSessionContext(request);
  if (!user) {
    sendError(response, 401, "AUTH_REQUIRED", "Authentication is required.");
    return null;
  }
  return user;
}

async function updateUser(userId, updater) {
  return withDatabase((db) => {
    const currentUser = findUserById(db, userId);
    if (!currentUser) {
      return null;
    }

    const nextUser = updater(currentUser);
    return replaceAddresses(db, userId, Array.isArray(nextUser.addresses) ? nextUser.addresses : []);
  });
}

function parseAddressPath(pathname, suffix = "") {
  const escapedSuffix = suffix.replaceAll("/", "\\/");
  const match = pathname.match(new RegExp(`^\\/api\\/me\\/addresses\\/([^/]+)${escapedSuffix}$`));
  return match ? decodeURIComponent(match[1]) : null;
}

const allowedOrderTransitions = {
  pending_payment: new Set(["paid", "cancelled"]),
  paid: new Set(["processing"]),
  processing: new Set(["shipped"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([])
};

function parseOrderIdFromPath(pathname) {
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  return orderMatch ? decodeURIComponent(orderMatch[1]) : null;
}

function parseOrderStatusPath(pathname) {
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  return orderMatch ? decodeURIComponent(orderMatch[1]) : null;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/products") {
    try {
      const products = withDatabase((db) => listProducts(db));
      const payload = getProductsPayload(
        products,
        requestUrl.searchParams.get("filter"),
        requestUrl.searchParams.get("sort"),
        requestUrl.searchParams.get("locale"),
        requestUrl.searchParams.get("q"),
        {
          page: requestUrl.searchParams.get("page"),
          pageSize: requestUrl.searchParams.get("pageSize"),
          minPrice: requestUrl.searchParams.get("minPrice"),
          maxPrice: requestUrl.searchParams.get("maxPrice"),
          size: requestUrl.searchParams.get("size"),
          stock: requestUrl.searchParams.get("stock"),
          ratingMin: requestUrl.searchParams.get("ratingMin")
        }
      );
      sendJson(response, 200, payload);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/session") {
    try {
      const { user } = await getSessionContext(request);
      sendJson(response, 200, {
        authenticated: Boolean(user),
        user: createPublicUser(user)
      });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/marketing") {
    try {
      sendJson(response, 200, getMarketingPayload());
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/register") {
    try {
      const body = await readRequestBody(request);
      const missingFields = validateAuthPayload(body, "register");
      if (missingFields.length) {
        sendJson(response, 400, {
          ok: false,
          error: {
            code: "AUTH_VALIDATION_FAILED",
            message: "Registration information is incomplete.",
            fields: missingFields,
            details: { fields: missingFields }
          }
        });
        return;
      }

      const email = normalizeEmail(body.email);
      if (withDatabase((db) => findUserByEmail(db, email))) {
        sendError(response, 409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
        return;
      }

      const passwordSalt = createPasswordSalt();
      const user = withDatabase((db) => createUser(db, {
        id: buildUserId({ length: countUsers(db) }),
        name: String(body.name).trim(),
        email,
        passwordHash: hashPassword(String(body.password), passwordSalt),
        passwordSalt,
        createdAt: new Date().toISOString(),
        addresses: []
      }));

      const previousSessionId = getCookieValue(request, sessionCookieName);
      const session = await createUserSession(user.id);
      const mergeResult = await mergeAnonymousCartIntoUserCart(user, previousSessionId);
      sendJsonWithHeaders(response, 201, {
        ok: true,
        user: createPublicUser(user),
        cart: getCartPayload(mergeResult.cart),
        cartMergeWarnings: mergeResult.warnings
      }, {
        "Set-Cookie": createSessionCookie(session.id)
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

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login") {
    try {
      const body = await readRequestBody(request);
      const missingFields = validateAuthPayload(body, "login");
      if (missingFields.length) {
        sendError(response, 400, "AUTH_VALIDATION_FAILED", "Login information is incomplete.");
        return;
      }

      const email = normalizeEmail(body.email);
      const user = withDatabase((db) => findUserByEmail(db, email));
      if (!user || !verifyPassword(String(body.password), user)) {
        sendError(response, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
        return;
      }

      const previousSessionId = getCookieValue(request, sessionCookieName);
      const session = await createUserSession(user.id);
      const mergeResult = await mergeAnonymousCartIntoUserCart(user, previousSessionId);
      sendJsonWithHeaders(response, 200, {
        ok: true,
        user: createPublicUser(user),
        cart: getCartPayload(mergeResult.cart),
        cartMergeWarnings: mergeResult.warnings
      }, {
        "Set-Cookie": createSessionCookie(session.id)
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

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    try {
      const sessionId = getCookieValue(request, sessionCookieName);
      if (sessionId) {
        await removeSession(sessionId);
      }
      sendJsonWithHeaders(response, 200, { ok: true }, {
        "Set-Cookie": createExpiredSessionCookie()
      });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/cart") {
    try {
      const { cart } = await readActiveCart(request);
      sendJson(response, 200, getCartPayload(cart));
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/cart/coupon") {
    try {
      const body = await readRequestBody(request);
      const products = withDatabase((db) => listProducts(db));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const coupon = withDatabase((db) => findCouponByCode(db, body.code));
      const validation = validateCouponForCart(coupon, activeCart.cart, products);

      if (!validation.ok) {
        sendError(response, 400, validation.code, validation.message);
        return;
      }

      const cartId = activeCart.cartId || withDatabase((db) => {
        return ensureCart(db, {
          userId: activeCart.user?.id || null,
          sessionId: activeCart.sessionId
        }).id;
      });
      withDatabase((db) => setCartCouponCode(db, cartId, coupon.code));

      const updatedCart = {
        ...activeCart.cart,
        couponCode: coupon.code
      };

      sendCartJson(response, 200, {
        ok: true,
        cart: getCartPayload(updatedCart, { products })
      }, activeCart);
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

  if (request.method === "DELETE" && requestUrl.pathname === "/api/cart/coupon") {
    try {
      const products = withDatabase((db) => listProducts(db));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const cartId = activeCart.cartId || withDatabase((db) => {
        return ensureCart(db, {
          userId: activeCart.user?.id || null,
          sessionId: activeCart.sessionId
        }).id;
      });
      withDatabase((db) => setCartCouponCode(db, cartId, ""));

      const updatedCart = {
        ...activeCart.cart,
        couponCode: ""
      };

      sendCartJson(response, 200, {
        ok: true,
        cart: getCartPayload(updatedCart, { products })
      }, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const bundleMatch = requestUrl.pathname.match(/^\/api\/cart\/bundles\/([^/]+)$/);
  if (request.method === "POST" && bundleMatch) {
    try {
      const bundleId = decodeURIComponent(bundleMatch[1]);
      const products = withDatabase((db) => listProducts(db));
      const bundle = withDatabase((db) => findBundleById(db, bundleId));
      if (!bundle) {
        sendError(response, 404, "BUNDLE_NOT_FOUND", "Bundle was not found.");
        return;
      }

      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      for (const productId of bundle.productIds) {
        const size = bundle.defaultSizes?.[productId];
        const validation = validateCartItemInput(products, { productId, size, quantity: 1 });
        if (validation.statusCode) {
          sendError(response, 409, "BUNDLE_OUT_OF_STOCK", "Bundle item is not available.");
          return;
        }

        const variant = validation.variant;
        const stockValidation = validateSkuStockQuantity(activeCart.cart, variant, 1);
        if (stockValidation) {
          sendError(response, 409, "BUNDLE_OUT_OF_STOCK", "Bundle item is out of stock.");
          return;
        }

        const existingItem = activeCart.cart.items.find((item) => item.skuId === variant.skuId);
        if (existingItem) {
          existingItem.quantity += 1;
        } else {
          activeCart.cart.items.push({
            productId,
            skuId: variant.skuId,
            size: variant.size,
            quantity: 1
          });
        }
      }

      await writeActiveCart(activeCart, activeCart.cart);
      const cartPayload = getCartPayload(activeCart.cart, { products });
      cartPayload.pricing.appliedPromotions.push({
        id: bundle.id,
        type: "bundle",
        title: bundle.titleZh || bundle.title,
        discount: bundle.discountAmount
      });
      cartPayload.pricing.total = Math.max(0, cartPayload.pricing.total - bundle.discountAmount);

      sendCartJson(response, 200, { ok: true, cart: cartPayload, bundle }, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/recent-views") {
    try {
      const body = await readRequestBody(request);
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const products = withDatabase((db) => listProducts(db));
      const product = products.find((item) => item.id === body.productId);
      if (!product) {
        sendError(response, 404, "PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }

      withDatabase((db) => recordRecentView(db, {
        id: `rv-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId,
        productId: product.id
      }));

      sendCartJson(response, 200, { ok: true }, activeCart);
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

  if (request.method === "GET" && requestUrl.pathname === "/api/recommendations") {
    try {
      const scenario = requestUrl.searchParams.get("scenario") || "detail";
      const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
      const products = withDatabase((db) => listProducts(db));

      if (scenario === "recently-viewed") {
        const activeCart = await readActiveCart(request);
        const productIds = withDatabase((db) => listRecentProductIds(db, {
          userId: activeCart.user ? activeCart.user.id : null,
          sessionId: activeCart.sessionId
        }));
        const items = productIds
          .map((productId) => products.find((product) => product.id === productId))
          .filter(Boolean)
          .map((product) => localizeProduct(product, locale));
        sendJson(response, 200, { scenario, items });
        return;
      }

      const items = getRecommendationItems(products, scenario, {
        productId: requestUrl.searchParams.get("productId"),
        excludeProductIds: requestUrl.searchParams.getAll("excludeProductId")
      }).map((product) => localizeProduct(product, locale));
      sendJson(response, 200, { scenario, items });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/cart/items") {
    try {
      const products = withDatabase((db) => listProducts(db));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const cart = activeCart.cart;
      const body = await readRequestBody(request);
      const validation = validateCartItemInput(products, body);

      if (validation.statusCode) {
        sendError(response, validation.statusCode, validation.code, validation.message);
        return;
      }

      const variant = validation.variant;
      const stockValidation = validateSkuStockQuantity(cart, variant, validation.quantity);
      if (stockValidation) {
        sendError(response, stockValidation.statusCode, stockValidation.code, stockValidation.message);
        return;
      }

      const existingItem = cart.items.find((item) => {
        return item.skuId === variant.skuId
          || (item.productId === body.productId && item.size === body.size);
      });

      if (existingItem) {
        existingItem.skuId = variant.skuId;
        existingItem.size = variant.size;
        existingItem.quantity += validation.quantity;
      } else {
        cart.items.push({
          productId: body.productId,
          skuId: variant.skuId,
          size: variant.size,
          quantity: validation.quantity
        });
      }

      await writeActiveCart(activeCart, cart);

      const item = cart.items.find((entry) => {
        return entry.skuId === variant.skuId
          || (entry.productId === body.productId && entry.size === body.size);
      });

      sendCartJson(response, 200, {
        ok: true,
        item,
        meta: getCartPayload(cart).meta
      }, activeCart);
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

  if (request.method === "POST" && requestUrl.pathname === "/api/cart/clear") {
    try {
      const emptyCart = { items: [] };
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      await writeActiveCart(activeCart, emptyCart);
      sendCartJson(response, 200, {
        ok: true,
        items: [],
        meta: { itemCount: 0 }
      }, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/me/addresses") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { addresses: Array.isArray(user.addresses) ? user.addresses : [] });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/me/addresses") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;
      const body = await readRequestBody(request);
      const missingFields = getRequiredAddressFields(body);
      if (missingFields.length) {
        sendJson(response, 400, {
          ok: false,
          error: {
            code: "ADDRESS_VALIDATION_FAILED",
            message: "Address information is incomplete.",
            fields: missingFields,
            details: { fields: missingFields }
          }
        });
        return;
      }

      const nextUser = await updateUser(user.id, (currentUser) => {
        const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
        const address = {
          id: buildAddressId(addresses),
          ...normalizeAddressPayload(body),
          isDefault: addresses.length === 0
        };
        return {
          ...currentUser,
          addresses: [...addresses, address]
        };
      });
      const address = nextUser.addresses[nextUser.addresses.length - 1];
      sendJson(response, 201, { ok: true, address, addresses: nextUser.addresses });
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

  const requestedAddressId = parseAddressPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedAddressId) {
    try {
      const user = await requireUser(request, response);
      if (!user) return;
      const body = await readRequestBody(request);
      let updatedAddress = null;
      const nextUser = await updateUser(user.id, (currentUser) => {
        const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
        const addressIndex = addresses.findIndex((address) => address.id === requestedAddressId);
        if (addressIndex === -1) {
          return currentUser;
        }
        const nextAddresses = [...addresses];
        updatedAddress = normalizeAddressPayload(body, nextAddresses[addressIndex]);
        nextAddresses[addressIndex] = updatedAddress;
        return { ...currentUser, addresses: nextAddresses };
      });
      if (!updatedAddress) {
        sendError(response, 404, "ADDRESS_NOT_FOUND", "Address was not found.");
        return;
      }
      sendJson(response, 200, { ok: true, address: updatedAddress, addresses: nextUser.addresses });
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

  const defaultAddressId = parseAddressPath(requestUrl.pathname, "/default");
  if (request.method === "POST" && defaultAddressId) {
    try {
      const user = await requireUser(request, response);
      if (!user) return;
      let foundAddress = false;
      const nextUser = await updateUser(user.id, (currentUser) => {
        const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
        foundAddress = addresses.some((address) => address.id === defaultAddressId);
        if (!foundAddress) {
          return currentUser;
        }
        return {
          ...currentUser,
          addresses: addresses.map((address) => ({
            ...address,
            isDefault: address.id === defaultAddressId
          }))
        };
      });
      if (!foundAddress) {
        sendError(response, 404, "ADDRESS_NOT_FOUND", "Address was not found.");
        return;
      }
      sendJson(response, 200, {
        ok: true,
        addresses: nextUser.addresses
      });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "DELETE" && requestedAddressId) {
    try {
      const user = await requireUser(request, response);
      if (!user) return;
      let foundAddress = false;
      const nextUser = await updateUser(user.id, (currentUser) => {
        const addresses = Array.isArray(currentUser.addresses) ? currentUser.addresses : [];
        foundAddress = addresses.some((address) => address.id === requestedAddressId);
        if (!foundAddress) {
          return currentUser;
        }
        const nextAddresses = addresses.filter((address) => address.id !== requestedAddressId);
        if (nextAddresses.length && !nextAddresses.some((address) => address.isDefault)) {
          nextAddresses[0] = { ...nextAddresses[0], isDefault: true };
        }
        return { ...currentUser, addresses: nextAddresses };
      });
      if (!foundAddress) {
        sendError(response, 404, "ADDRESS_NOT_FOUND", "Address was not found.");
        return;
      }
      sendJson(response, 200, {
        ok: true,
        addresses: nextUser.addresses
      });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/orders") {
    try {
      const products = withDatabase((db) => listProducts(db));
      const activeCart = await readActiveCart(request);
      const cart = activeCart.cart;
      const body = await readRequestBody(request);
      const locale = normalizeLocale(body.locale);

      if (!Array.isArray(cart.items) || cart.items.length === 0) {
        sendError(response, 400, "EMPTY_CART", "Cart is empty.");
        return;
      }

      const missingFields = getRequiredCheckoutFields(body);
      if (missingFields.length) {
        sendJson(response, 400, {
          ok: false,
          error: {
            code: "CHECKOUT_VALIDATION_FAILED",
            message: "Checkout information is incomplete.",
            fields: missingFields,
            details: { fields: missingFields }
          }
        });
        return;
      }

      const shippingMethod = getShippingMethod(body.shippingMethodId, locale);
      if (!shippingMethod) {
        sendError(response, 400, "INVALID_SHIPPING_METHOD", "Shipping method is invalid.");
        return;
      }

      for (const cartItem of cart.items) {
        const product = products.find((entry) => entry.id === cartItem.productId);
        if (!product) {
          sendError(response, 404, "PRODUCT_NOT_FOUND", "Product was not found.");
          return;
        }
        const variant = findProductVariant(product, cartItem.size);
        if (!variant) {
          sendError(response, 400, "INVALID_SIZE", "Size is not available for this product.");
          return;
        }
        if (!isVariantSellable(variant)) {
          sendError(response, 409, "OUT_OF_STOCK", "Selected size is out of stock.");
          return;
        }
        cartItem.skuId = variant.skuId;
        cartItem.size = variant.size;
      }

      const orderItems = buildOrderItems(cart, products, locale);
      const marketing = getMarketingPayload();
      const pricing = createPricingSummary({
        cart,
        products,
        marketing,
        shippingFee: shippingMethod.fee
      });
      const order = {
        id: buildOrderId({ length: withDatabase((db) => countOrders(db)) }),
        userId: activeCart.user ? activeCart.user.id : null,
        status: "pending_payment",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customer: {
          name: String(body.customer.name).trim(),
          contact: String(body.customer.contact).trim()
        },
        shippingAddress: {
          address: String(body.shippingAddress.address).trim(),
          city: String(body.shippingAddress.city).trim(),
          region: String(body.shippingAddress.region).trim(),
          postalCode: String(body.shippingAddress.postalCode).trim(),
          note: String(body.shippingAddress.note || "").trim()
        },
        shippingMethod,
        items: orderItems,
        totals: {
          subtotal: pricing.subtotal,
          savings: pricing.productDiscount + pricing.orderDiscount + pricing.couponDiscount,
          productDiscount: pricing.productDiscount,
          orderDiscount: pricing.orderDiscount,
          couponDiscount: pricing.couponDiscount,
          shipping: pricing.shipping,
          total: pricing.total
        },
        marketing: {
          coupon: pricing.coupon,
          couponDiscount: pricing.couponDiscount,
          appliedPromotions: pricing.appliedPromotions,
          thresholdProgress: pricing.thresholdProgress
        },
        timeline: [createTimelineEntry("pending_payment", locale)]
      };

      const emptyCart = { items: [] };
      const savedOrder = withDatabase((db) => createOrderTransaction(db, {
        cart,
        cartId: activeCart.cartId,
        order
      }));

      sendJson(response, 201, {
        ok: true,
        order: savedOrder,
        cart: getCartPayload(emptyCart)
      });
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
        return;
      }

      if (error.code === "INSUFFICIENT_STOCK") {
        sendError(response, 409, "INSUFFICIENT_STOCK", error.message);
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/me/orders") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;

      const orders = withDatabase((db) => listOrders(db, user.id));

      sendJson(response, 200, { orders });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedOrderId = parseOrderIdFromPath(requestUrl.pathname);
  if (request.method === "GET" && requestedOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedOrderId));

      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      sendJson(response, 200, { order });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedStatusOrderId = parseOrderStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedStatusOrderId) {
    try {
      const body = await readRequestBody(request);
      const locale = normalizeLocale(body.locale);
      const nextStatus = String(body.status || "").trim();

      if (!allowedOrderTransitions[nextStatus]) {
        sendError(response, 400, "INVALID_ORDER_STATUS", "Order status is invalid.");
        return;
      }

      const order = withDatabase((db) => findOrderById(db, requestedStatusOrderId));
      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const allowedNextStatuses = allowedOrderTransitions[order.status] || new Set();
      if (!allowedNextStatuses.has(nextStatus)) {
        sendError(response, 409, "INVALID_ORDER_TRANSITION", "Order status transition is not allowed.");
        return;
      }

      order.status = nextStatus;
      order.updatedAt = new Date().toISOString();
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push(createTimelineEntry(nextStatus, locale));

      withDatabase((db) => saveOrder(db, order));
      sendJson(response, 200, { ok: true, order });
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

  if (request.method === "PATCH" && requestUrl.pathname === "/api/cart/items") {
    try {
      const products = withDatabase((db) => listProducts(db));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const cart = activeCart.cart;
      const body = await readRequestBody(request);
      const validation = validateCartItemInput(products, body);

      if (validation.statusCode) {
        sendError(response, validation.statusCode, validation.code, validation.message);
        return;
      }

      const variant = validation.variant;
      const itemIndex = cart.items.findIndex((item) => {
        return item.skuId === variant.skuId
          || (item.productId === body.productId && item.size === body.size);
      });
      if (itemIndex === -1) {
        sendError(response, 404, "CART_ITEM_NOT_FOUND", "Cart item was not found.");
        return;
      }

      const stockValidation = validateSkuStockQuantity(
        cart,
        variant,
        validation.quantity,
        variant.skuId
      );
      if (stockValidation) {
        sendError(response, stockValidation.statusCode, stockValidation.code, stockValidation.message);
        return;
      }

      cart.items[itemIndex] = {
        ...cart.items[itemIndex],
        productId: body.productId,
        skuId: variant.skuId,
        size: variant.size,
        quantity: validation.quantity
      };
      await writeActiveCart(activeCart, cart);

      sendCartJson(response, 200, {
        ok: true,
        item: cart.items[itemIndex],
        items: cart.items,
        meta: getCartPayload(cart).meta
      }, activeCart);
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

  if (request.method === "DELETE" && requestUrl.pathname === "/api/cart/items") {
    try {
      const products = withDatabase((db) => listProducts(db));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const cart = activeCart.cart;
      const body = await readRequestBody(request);
      const product = products.find((item) => item.id === body.productId);
      const variant = product ? findProductVariant(product, body.size) : null;
      const itemIndex = cart.items.findIndex((item) => {
        return variant
          ? item.skuId === variant.skuId || (item.productId === body.productId && item.size === body.size)
          : item.productId === body.productId && item.size === body.size;
      });

      if (itemIndex === -1) {
        sendError(response, 404, "CART_ITEM_NOT_FOUND", "Cart item was not found.");
        return;
      }

      const [removedItem] = cart.items.splice(itemIndex, 1);
      await writeActiveCart(activeCart, cart);

      sendCartJson(response, 200, {
        ok: true,
        removedItem,
        items: cart.items,
        meta: getCartPayload(cart).meta
      }, activeCart);
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

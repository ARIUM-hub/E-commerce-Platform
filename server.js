const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createConfig } = require("./lib/config");
const { createDatabase, initializeDatabase, resetDatabase, getDatabasePath } = require("./lib/database");
const { createLogger } = require("./lib/logger");
const {
  createRequestContext,
  attachRequestCompletionLog
} = require("./lib/http/request-context");
const { createCsrfService } = require("./lib/security/csrf");
const {
  createMemoryRateLimiter,
  createPersistentRateLimiter
} = require("./lib/security/rate-limit-service");
const { createRequestSecurity } = require("./lib/security/request-security");
const { hashSecurityIdentifier } = require("./lib/security/security-identifiers");
const { verifyWebhookSignature } = require("./lib/security/webhook-signature");
const { createApiError } = require("./lib/api-errors");
const {
  sendError: sendHttpError,
  sendJson: sendHttpJson,
  sendJsonWithHeaders: sendHttpJsonWithHeaders
} = require("./lib/http/responses");
const { JsonBodyError, readJsonBody, readRawBody } = require("./lib/http/request-body");
const {
  getCookieValue
} = require("./lib/http/cookies");
const { PERMISSIONS } = require("./lib/auth/permissions");
const { createAuthorization } = require("./lib/auth/authorization");
const { createSessionService } = require("./lib/services/session-service");
const { createAuthService, createPublicUser } = require("./lib/services/auth-service");
const { createMailerService } = require("./lib/services/mailer-service");
const { createAccountSecurityService } = require("./lib/services/account-security-service");
const {
  resolveStaticFile,
  sendStaticFile
} = require("./lib/http/static-files");
const {
  MultipartError,
  readMultipartFile
} = require("./lib/http/multipart");
const { createRouter } = require("./lib/http/router");
const { registerHealthRoutes } = require("./lib/routes/health-routes");
const { registerProductRoutes } = require("./lib/routes/product-routes");
const { registerMarketingRoutes } = require("./lib/routes/marketing-routes");
const { registerAnalyticsRoutes } = require("./lib/routes/analytics-routes");
const { registerAdminAnalyticsRoutes } = require("./lib/routes/admin-analytics-routes");
const { registerAdminReviewRoutes } = require("./lib/routes/admin-review-routes");
const { registerSupportTicketRoutes } = require("./lib/routes/support-ticket-routes");
const { registerAdminSupportRoutes } = require("./lib/routes/admin-support-routes");
const { registerAdminUserRoutes } = require("./lib/routes/admin-user-routes");
const { registerAuthRoutes } = require("./lib/routes/auth-routes");
const { registerTrustRoutes } = require("./lib/routes/trust-routes");
const { registerTestRoutes } = require("./lib/routes/test-routes");
const { registerSecurityRoutes } = require("./lib/routes/security-routes");
const { registerAccountSecurityRoutes } = require("./lib/routes/account-security-routes");
const { listProducts, findProductById } = require("./lib/repositories/products");
const {
  createAnalyticsEventLimiter,
  recordAnalyticsEvent
} = require("./lib/repositories/analytics-events");
const { getAdminAnalytics } = require("./lib/repositories/admin-analytics");
const {
  createProductReview,
  findAdminReviewById,
  listAdminProductReviews,
  listProductReviews,
  markProductReviewHelpful,
  summarizeReviews
} = require("./lib/repositories/product-reviews");
const {
  moderateReviewBatch,
  upsertMerchantReply,
  withdrawMerchantReply
} = require("./lib/repositories/admin-review-actions");
const {
  createProductQuestion,
  listProductQuestions,
  summarizeQuestions
} = require("./lib/repositories/product-questions");
const {
  listSavedProducts,
  removeSavedProduct,
  saveProduct
} = require("./lib/repositories/saved-products");
const {
  findUserById,
  listAdminUsers,
  createSession,
  findSession,
  deleteSession,
  markUserEmailVerified,
  replaceAddresses
} = require("./lib/repositories/users");
const {
  assignUserRole,
  listRoleAssignmentEvents
} = require("./lib/repositories/roles");
const {
  ensureCart,
  getCart,
  replaceCartItems,
  mergeCarts,
  setCartCouponCode
} = require("./lib/repositories/carts");
const {
  clearRecentViews,
  findBundleById,
  findCouponByCode,
  listRecentProductIds,
  listRecentViews,
  recordRecentView,
  listActiveMarketingCampaigns,
  removeRecentView
} = require("./lib/repositories/marketing");
const {
  addCustomerTicketMessage,
  createSupportTicket,
  findSupportTicketById,
  findSupportTicketByNumber,
  findSupportTicketForGuest,
  getTrustCenterContent,
  listAdminSupportTickets,
  listSupportTicketsForUser
} = require("./lib/repositories/support");
const {
  addAdminSupportMessage,
  updateSupportTicket
} = require("./lib/repositories/admin-support-actions");
const { createSupportLookupLimiter } = require("./lib/support-lookup-limiter");
const {
  findAdminOrder,
  getAdminSummary,
  listAdminMarketing,
  listAdminOrders,
  listAdminPaymentMethods,
  listAdminProducts,
  listInventory,
  updateAdminOrderStatus,
  updateInventoryItem,
  updateMarketingStatus
} = require("./lib/repositories/admin");
const {
  createAdminProduct,
  findAdminProductById,
  updateAdminProduct
} = require("./lib/repositories/admin-products");
const {
  cancelAdminOrder,
  createAdminPartialRefund,
  listAdminActionsForResource,
  reviewAdminReturnRequest,
  shipAdminOrder
} = require("./lib/repositories/admin-order-actions");
const {
  createOrderTransaction,
  countOrders,
  listOrders,
  findOrderById,
  reorderItemsFromOrder,
  saveOrder
} = require("./lib/repositories/orders");
const {
  createReturnRequest,
  findReturnRequestById,
  listAdminReturnRequests,
  listReturnRequestsByUser,
  updateReturnRequestStatus
} = require("./lib/repositories/returns");
const {
  createPaymentAttempt,
  findPaymentAttemptById,
  savePaymentAttempt,
  listPaymentAttemptsByOrder
} = require("./lib/repositories/payments");
const {
  listPaymentMethods,
  updatePaymentMethod
} = require("./lib/repositories/payment-methods");
const { processPaymentWebhook } = require("./lib/repositories/payment-events");
const { listSecurityAuditEvents } = require("./lib/repositories/security-audit");
const { listOutbox } = require("./lib/repositories/email-outbox");
const {
  createInvoiceForOrder,
  findInvoiceById,
  findInvoiceByOrderId
} = require("./lib/repositories/invoices");
const {
  confirmShipment,
  createFulfillmentForOrder,
  createFulfillmentSummary,
  findFulfillmentByOrderId,
  getShippingMethodForOrder,
  getShippingMethodsForAddress,
  syncFulfillmentForOrderStatus,
  updateFulfillmentStatus
} = require("./lib/repositories/fulfillment");
const {
  createRefundForOrder,
  createRefundSummary,
  findRefundById,
  getRefundableOrderSummary,
  listRefundsByOrderId,
  updateRefundStatus
} = require("./lib/repositories/refunds");
const { createPricingSummary } = require("./lib/pricing");
const { createCheckoutTotals } = require("./lib/checkout-totals");

const config = createConfig(process.env);
const logger = createLogger({
  level: config.logLevel,
  format: config.logFormat,
  baseContext: {
    environment: config.nodeEnv,
    serviceVersion: config.serviceVersion
  }
});
const csrfService = createCsrfService({
  secret: config.csrfSecret,
  isProduction: config.nodeEnv === "production"
});
const generalRateLimiter = createMemoryRateLimiter({
  limit: config.generalRateLimit,
  windowMs: 60_000
});
const requestSecurity = createRequestSecurity({
  allowedOrigins: config.allowedOrigins,
  csrfService,
  generalRateLimiter,
  securityHashSecret: config.securityHashSecret,
  trustProxy: config.trustProxy,
  isTest: config.isTest
});
const host = config.host;
const port = config.port;
const rootDir = config.rootDir;
const dataDir = config.dataDir;
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
const adminImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"]
]);
const validStockFilters = new Set(["all", "in-stock", "low-stock", "out-of-stock"]);
const DEMO_ADMIN_EMAILS = new Set(["admin@socks.test"]);
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
  cancelled: { "zh-CN": "已取消", "en-US": "Cancelled" },
  refund_pending: { "zh-CN": "退款处理中", "en-US": "Refund pending" },
  refunded: { "zh-CN": "已退款", "en-US": "Refunded" }
};
const sessionCookieName = "socks_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;

function sendJson(response, statusCode, payload) {
  sendHttpJson(response, statusCode, payload, config);
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}) {
  sendHttpJsonWithHeaders(response, statusCode, payload, headers, config);
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
  sendHttpError(response, statusCode, code, message, details, config);
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

function getStaticFilePath(urlPathname) {
  return resolveStaticFile(urlPathname, { rootDir, staticRoutes });
}

function withDatabase(callback) {
  const db = initializeDatabase(createDatabase(getDatabasePath({ dataDir })), {
    productsSeedFile: productsFile
  });

  try {
    authService.bootstrapAdmin(db);
    return callback(db);
  } finally {
    db.close();
  }
}

const persistentRateLimiter = createPersistentRateLimiter({
  withDatabase,
  hashIdentifier: (value, type) => hashSecurityIdentifier(
    value,
    config.securityHashSecret,
    `persistent-rate-limit-${type}`
  )
});
const mailerService = createMailerService({ config, withDatabase });
const accountSecurityService = createAccountSecurityService({
  withDatabase,
  mailerService,
  auditRetentionDays: config.auditRetentionDays,
  hashIdentifier: (value, type) => hashSecurityIdentifier(
    value,
    config.securityHashSecret,
    type
  )
});
const authService = createAuthService(config);
const sessionService = createSessionService({
  withDatabase,
  sessionCookieName,
  sessionMaxAgeSeconds
});
const {
  getSessionContext,
  createSessionId,
  createSessionCookie
} = sessionService;
const authorization = createAuthorization({ getSessionContext, sendError });
const { requireUser } = authorization;

async function readRequestBody(request) {
  return readJsonBody(request, { limitBytes: config.requestBodyLimitBytes });
}

function handleRequestBodyError(error, response) {
  if (error instanceof JsonBodyError) {
    sendError(response, error.statusCode, error.code, error.message);
    return true;
  }

  if (error instanceof SyntaxError) {
    sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return true;
  }

  return false;
}

function handleMultipartError(error, response) {
  if (!(error instanceof MultipartError)) {
    return false;
  }

  sendError(response, error.statusCode, error.code, error.message);
  return true;
}

function createAdminImageName(productId, contentType) {
  const extension = adminImageTypes.get(contentType);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${productId}-${stamp}-${suffix}.${extension}`;
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

function getRecentViewsPayload(db, owner, products, locale, limit) {
  const views = listRecentViews(db, {
    userId: owner.userId,
    sessionId: owner.sessionId,
    limit
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const items = views
    .map((view) => {
      const product = productsById.get(view.productId);
      return product ? { ...localizeProduct(product, locale), viewedAt: view.viewedAt } : null;
    })
    .filter(Boolean);

  return {
    ok: true,
    productIds: views.map((view) => view.productId),
    items
  };
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

function normalizeCartPayload(cart) {
  return {
    couponCode: cart.couponCode || "",
    items: Array.isArray(cart.items) ? cart.items : []
  };
}

async function readActiveCart(request, options = {}) {
  const { session, user } = await getSessionContext(request);
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
      visitorId: sessionId,
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
    visitorId: session?.id || null,
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

async function requireAdmin(request, response) {
  return authorization.requirePermission(PERMISSIONS.ANALYTICS_READ, request, response);
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
  cancelled: new Set([]),
  refund_pending: new Set(["refunded"]),
  refunded: new Set([])
};

function parseOrderIdFromPath(pathname) {
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  return orderMatch ? decodeURIComponent(orderMatch[1]) : null;
}

function parseOrderReorderPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/reorder$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderStatusPath(pathname) {
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  return orderMatch ? decodeURIComponent(orderMatch[1]) : null;
}

function parseOrderPaymentsPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderInvoicePath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/invoice$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseInvoiceIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/invoices\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderFulfillmentPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/fulfillment$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderFulfillmentStatusPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/fulfillment\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderCancelPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseOrderRefundsPath(pathname) {
  const match = pathname.match(/^\/api\/orders\/([^/]+)\/refunds$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseRefundStatusPath(pathname) {
  const match = pathname.match(/^\/api\/refunds\/([^/]+)\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseReturnIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/returns\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseReturnStatusPath(pathname) {
  const match = pathname.match(/^\/api\/returns\/([^/]+)\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminInventoryPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/inventory\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminProductPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminProductImagePath(pathname) {
  const match = pathname.match(/^\/api\/admin\/products\/([^/]+)\/images$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminOrderPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminOrderStatusPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminOrderActionPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/actions\/(ship|cancel|refund)$/);
  return match ? { orderId: decodeURIComponent(match[1]), action: match[2] } : null;
}

function parseAdminReturnActionPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/returns\/([^/]+)\/actions\/review$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminMarketingStatusPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/marketing\/([^/]+)\/([^/]+)\/status$/);
  return match ? { type: decodeURIComponent(match[1]), id: decodeURIComponent(match[2]) } : null;
}

function parseAdminPaymentMethodPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/payment-methods\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

const router = createRouter();
const supportLookupLimiter = createSupportLookupLimiter();
registerHealthRoutes(router);
registerSecurityRoutes(router, {
  csrfService,
  isProduction: config.nodeEnv === "production",
  listOutbox,
  listSecurityAuditEvents,
  requirePermission: authorization.requirePermission,
  sendJsonWithHeaders,
  withDatabase
});
registerProductRoutes(router, {
  createProductQuestion,
  createProductReview,
  findProductById,
  getProductsPayload,
  listProductQuestions,
  listProductReviews,
  listProducts,
  listSavedProducts,
  markProductReviewHelpful,
  readRequestBody,
  readActiveCart,
  removeSavedProduct,
  saveProduct,
  summarizeQuestions,
  summarizeReviews,
  withDatabase
});
registerMarketingRoutes(router, {
  getMarketingPayload
});
registerAnalyticsRoutes(router, {
  createAnalyticsEventLimiter,
  handleRequestBodyError,
  readActiveCart,
  readRequestBody,
  recordAnalyticsEvent,
  withDatabase
});
registerAdminAnalyticsRoutes(router, {
  getAdminAnalytics,
  requirePermission: authorization.requirePermission,
  withDatabase
});
registerAdminReviewRoutes(router, {
  findAdminReviewById,
  handleRequestBodyError,
  listAdminProductReviews,
  moderateReviewBatch,
  readRequestBody,
  requirePermission: authorization.requirePermission,
  upsertMerchantReply,
  withdrawMerchantReply,
  withDatabase
});
registerSupportTicketRoutes(router, {
  addCustomerTicketMessage,
  createSupportTicket,
  findSupportTicketById,
  findSupportTicketByNumber,
  findSupportTicketForGuest,
  handleRequestBodyError,
  listSupportTicketsForUser,
  readActiveCart,
  readRequestBody,
  requireUser,
  supportLookupLimiter,
  withDatabase
});
registerAdminSupportRoutes(router, {
  addAdminSupportMessage,
  findSupportTicketById,
  handleRequestBodyError,
  listAdminSupportTickets,
  readRequestBody,
  requirePermission: authorization.requirePermission,
  updateSupportTicket,
  withDatabase
});
registerAdminUserRoutes(router, {
  assignUserRole,
  createPublicUser,
  findUserById,
  handleRequestBodyError,
  listAdminUsers,
  listRoleAssignmentEvents,
  readRequestBody,
  requirePermission: authorization.requirePermission,
  withDatabase
});
registerAuthRoutes(router, {
  accountSecurityService,
  authService,
  createPublicUser,
  getCartPayload,
  handleRequestBodyError,
  mergeAnonymousCartIntoUserCart,
  persistentRateLimiter,
  readRequestBody,
  sendJsonWithHeaders,
  sessionCookieName,
  sessionService,
  trustProxy: config.trustProxy,
  withDatabase
});
registerAccountSecurityRoutes(router, {
  accountSecurityService,
  createPublicUser,
  handleRequestBodyError,
  persistentRateLimiter,
  readRequestBody,
  requireUser,
  sendJsonWithHeaders,
  trustProxy: config.trustProxy
});
registerTrustRoutes(router, {
  getTrustCenterContent,
  normalizeLocale
});
registerTestRoutes(router, {
  createPublicUser,
  isTest: config.isTest,
  markUserEmailVerified,
  requireUser,
  withDatabase,
  async resetTestDatabase() {
    await resetDatabase(getDatabasePath({ dataDir, nodeEnv: "test" }));
    withDatabase(() => null);
    generalRateLimiter.reset();
  }
});

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  const requestContext = createRequestContext(request, response);
  attachRequestCompletionLog({
    request,
    response,
    requestUrl,
    requestContext,
    logger
  });
  const securityResult = requestSecurity.check(request, requestUrl);
  if (!securityResult.allowed) {
    const isRateLimited = securityResult.code === "RATE_LIMITED";
    const apiError = createApiError(securityResult.code, {
      statusCode: securityResult.statusCode,
      message: isRateLimited ? "Too many requests." : "Request security validation failed.",
      details: isRateLimited
        ? { retryAfterSeconds: securityResult.retryAfterSeconds }
        : {}
    });
    sendJsonWithHeaders(response, securityResult.statusCode, apiError.payload, isRateLimited ? {
      "Retry-After": String(securityResult.retryAfterSeconds)
    } : {});
    return;
  }
  const wasHandledByRouter = await router.dispatch({
    request,
    response,
    requestUrl,
    requestContext,
    sendError,
    sendJson
  });

  if (wasHandledByRouter) {
    return;
  }

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/shipping-methods") {
    const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
    const methods = getShippingMethodsForAddress({
      region: requestUrl.searchParams.get("region") || "",
      postalCode: requestUrl.searchParams.get("postalCode") || ""
    }, locale);
    sendJson(response, 200, { ok: true, methods });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/payment-methods") {
    const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
    const orderId = requestUrl.searchParams.get("orderId") || "";
    const order = orderId ? withDatabase((db) => findOrderById(db, orderId)) : null;
    const orderTotal = Number(order?.totals?.grandTotal ?? order?.totals?.total ?? 0);
    const methods = withDatabase((db) => listPaymentMethods(db, { locale, orderTotal }));
    sendJson(response, 200, { ok: true, methods });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/payments/webhook") {
    try {
      const rawBody = await readRawBody(request, { limitBytes: config.requestBodyLimitBytes });
      const signature = request.headers["x-payment-signature"];
      if (!verifyWebhookSignature({
        rawBody,
        signature,
        secret: config.paymentWebhookSecret
      })) {
        sendError(
          response,
          401,
          "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
          "Payment webhook signature is invalid."
        );
        return;
      }
      let body;
      try {
        body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
      } catch {
        throw new JsonBodyError("INVALID_JSON", "Request body must be valid JSON.", 400);
      }
      body.signature = String(signature);
      const result = withDatabase((db) => processPaymentWebhook(db, {
        body,
        findOrderById,
        saveOrder,
        findPaymentAttemptById,
        savePaymentAttempt,
        createTimelineEntry,
        createInvoiceForOrder
      }));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }
      sendJson(response, 200, { ok: true, ...result });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/summary") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const payload = withDatabase((db) => getAdminSummary(db));
      sendJson(response, 200, { ok: true, ...payload });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/products") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const products = withDatabase((db) => listAdminProducts(db));
      sendJson(response, 200, { ok: true, products });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminProductImageId = parseAdminProductImagePath(requestUrl.pathname);
  if (request.method === "POST" && requestedAdminProductImageId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const product = withDatabase((db) => findAdminProductById(db, requestedAdminProductImageId));
      if (!product) {
        sendError(response, 404, "ADMIN_PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }

      const file = await readMultipartFile(request, { limitBytes: 3 * 1024 * 1024 });
      if (!adminImageTypes.has(file.contentType)) {
        sendError(response, 400, "ADMIN_IMAGE_TYPE_INVALID", "Image type is invalid.");
        return;
      }

      const safeFileName = createAdminImageName(requestedAdminProductImageId, file.contentType);
      const uploadDir = path.join(rootDir, "public", "uploads", "products");
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, safeFileName), file.buffer);
      const image = {
        id: safeFileName.replace(/\.[^.]+$/, ""),
        src: `/public/uploads/products/${safeFileName}`,
        alt: `${requestedAdminProductImageId} product image`
      };

      sendJson(response, 201, { ok: true, image });
      return;
    } catch (error) {
      if (handleMultipartError(error, response)) return;

      sendError(response, 500, "ADMIN_IMAGE_SAVE_FAILED", "Image could not be saved.");
      return;
    }
  }

  const requestedAdminProductId = parseAdminProductPath(requestUrl.pathname);
  if (request.method === "GET" && requestedAdminProductId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const product = withDatabase((db) => findAdminProductById(db, requestedAdminProductId));
      if (!product) {
        sendError(response, 404, "ADMIN_PRODUCT_NOT_FOUND", "Product was not found.");
        return;
      }

      sendJson(response, 200, { ok: true, product });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/products") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => createAdminProduct(db, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 201, { ok: true, product: result.product });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "PATCH" && requestedAdminProductId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateAdminProduct(db, requestedAdminProductId, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, product: result.product });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/inventory") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const items = withDatabase((db) => listInventory(db, {
        stock: requestUrl.searchParams.get("stock") || "all",
        q: requestUrl.searchParams.get("q") || ""
      }));
      sendJson(response, 200, { ok: true, items });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminSkuId = parseAdminInventoryPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedAdminSkuId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateInventoryItem(db, requestedAdminSkuId, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, item: result.item });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/orders") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const orders = withDatabase((db) => listAdminOrders(db, {
        status: requestUrl.searchParams.get("status") || "",
        q: requestUrl.searchParams.get("q") || ""
      }));
      sendJson(response, 200, { ok: true, orders });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminOrderAction = parseAdminOrderActionPath(requestUrl.pathname);
  if (request.method === "POST" && requestedAdminOrderAction) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => {
        const order = findAdminOrder(db, requestedAdminOrderAction.orderId);
        if (!order) {
          return {
            validationError: {
              statusCode: 404,
              code: "ADMIN_ORDER_NOT_FOUND",
              message: "Order was not found."
            }
          };
        }
        if (requestedAdminOrderAction.action === "ship") {
          return shipAdminOrder(db, {
            admin,
            order,
            body,
            confirmShipment,
            saveOrder,
            createTimelineEntry
          });
        }
        if (requestedAdminOrderAction.action === "refund") {
          return createAdminPartialRefund(db, { admin, order, body });
        }
        return cancelAdminOrder(db, {
          admin,
          order,
          body,
          saveOrder,
          createTimelineEntry
        });
      });
      if (result.validationError) {
        sendError(
          response,
          result.validationError.statusCode,
          result.validationError.code,
          result.validationError.message
        );
        return;
      }

      const statusCode = requestedAdminOrderAction.action === "refund" && !result.replayed ? 201 : 200;
      sendJson(response, statusCode, { ok: true, ...result });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      logger.error("admin.order_action.failed", {
        message: error.message,
        code: error.code || "",
        stack: error.stack || ""
      });
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminReturnId = parseAdminReturnActionPath(requestUrl.pathname);
  if (request.method === "POST" && requestedAdminReturnId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => {
        const returnRequest = findReturnRequestById(db, requestedAdminReturnId);
        if (!returnRequest) {
          return {
            validationError: {
              statusCode: 404,
              code: "RETURN_NOT_FOUND",
              message: "Return request was not found."
            }
          };
        }
        return reviewAdminReturnRequest(db, { admin, returnRequest, body });
      });
      if (result.validationError) {
        sendError(
          response,
          result.validationError.statusCode,
          result.validationError.code,
          result.validationError.message
        );
        return;
      }

      sendJson(response, 200, { ok: true, ...result });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) return;
      logger.error("admin.return_action.failed", {
        message: error.message,
        code: error.code || "",
        stack: error.stack || ""
      });
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/returns") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const returnRequests = withDatabase((db) => listAdminReturnRequests(db, {
        status: requestUrl.searchParams.get("status") || "",
        q: requestUrl.searchParams.get("q") || ""
      }));
      sendJson(response, 200, { ok: true, returnRequests });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminOrderId = parseAdminOrderPath(requestUrl.pathname);
  if (request.method === "GET" && requestedAdminOrderId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const detail = withDatabase((db) => {
        const order = findAdminOrder(db, requestedAdminOrderId);
        if (!order) return null;
        return {
          order,
          refunds: listRefundsByOrderId(db, requestedAdminOrderId),
          refundable: getRefundableOrderSummary(db, order),
          adminActions: listAdminActionsForResource(db, "order", requestedAdminOrderId)
        };
      });
      if (!detail) {
        sendError(response, 404, "ADMIN_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      sendJson(response, 200, { ok: true, ...detail });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedAdminStatusOrderId = parseAdminOrderStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedAdminStatusOrderId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateAdminOrderStatus(
        db,
        requestedAdminStatusOrderId,
        String(body.status || "").trim(),
        normalizeLocale(body.locale),
        createTimelineEntry,
        saveOrder
      ));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, order: result.order });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/marketing") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const marketing = withDatabase((db) => listAdminMarketing(db));
      sendJson(response, 200, { ok: true, ...marketing });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/payment-methods") {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const methods = withDatabase((db) => listAdminPaymentMethods(db));
      sendJson(response, 200, { ok: true, methods });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedPaymentMethodId = parseAdminPaymentMethodPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedPaymentMethodId) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => updatePaymentMethod(db, requestedPaymentMethodId, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, method: result.method });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedMarketingStatus = parseAdminMarketingStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedMarketingStatus) {
    try {
      const admin = await requireAdmin(request, response);
      if (!admin) return;

      const body = await readRequestBody(request);
      const result = withDatabase((db) => updateMarketingStatus(
        db,
        requestedMarketingStatus.type,
        requestedMarketingStatus.id,
        body.status
      ));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, resource: result.resource });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

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
      if (handleRequestBodyError(error, response)) {
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
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/recent-views") {
    try {
      const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const owner = {
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId
      };
      const products = withDatabase((db) => listProducts(db));
      const payload = withDatabase((db) => getRecentViewsPayload(
        db,
        owner,
        products,
        locale,
        requestUrl.searchParams.get("limit")
      ));
      sendCartJson(response, 200, payload, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const recentViewProductMatch = requestUrl.pathname.match(/^\/api\/recent-views\/([^/]+)$/);
  if (request.method === "DELETE" && recentViewProductMatch) {
    try {
      const locale = normalizeLocale(requestUrl.searchParams.get("locale"));
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const owner = {
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId
      };
      const productId = decodeURIComponent(recentViewProductMatch[1]);
      const products = withDatabase((db) => listProducts(db));
      const payload = withDatabase((db) => {
        removeRecentView(db, { ...owner, productId });
        return getRecentViewsPayload(db, owner, products, locale, 24);
      });
      sendCartJson(response, 200, payload, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/recent-views/clear") {
    try {
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const owner = {
        userId: activeCart.user ? activeCart.user.id : null,
        sessionId: activeCart.sessionId
      };
      withDatabase((db) => clearRecentViews(db, owner));
      sendCartJson(response, 200, { ok: true, productIds: [], items: [] }, activeCart);
      return;
    } catch (error) {
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
      const cartPayload = getCartPayload(cart, { products });

      const item = cart.items.find((entry) => {
        return entry.skuId === variant.skuId
          || (entry.productId === body.productId && entry.size === body.size);
      });

      sendCartJson(response, 200, {
        ok: true,
        item,
        cart: cartPayload,
        meta: cartPayload.meta
      }, activeCart);
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
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
        cart: getCartPayload(emptyCart),
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
      if (handleRequestBodyError(error, response)) {
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
      if (handleRequestBodyError(error, response)) {
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
      if (activeCart.user && !activeCart.user.emailVerifiedAt) {
        sendError(
          response,
          403,
          "EMAIL_VERIFICATION_REQUIRED",
          "Email verification is required before checkout."
        );
        return;
      }
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

      const shippingMethod = getShippingMethodForOrder(body.shippingMethodId, body.shippingAddress, locale);
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
      const pricing = createCheckoutTotals({
        cart,
        products,
        marketing,
        shippingFee: shippingMethod.fee,
        shippingAddress: body.shippingAddress
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
          paymentFee: pricing.paymentFee,
          taxableAmount: pricing.taxableAmount,
          tax: pricing.tax,
          total: pricing.total,
          grandTotal: pricing.grandTotal,
          currency: pricing.currency,
          taxRegion: pricing.taxRegion,
          calculatedAt: pricing.calculatedAt
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
        order,
        afterOrderCreated(database, pendingOrder) {
          const fulfillment = createFulfillmentForOrder(database, pendingOrder, shippingMethod, locale);
          pendingOrder.fulfillment = createFulfillmentSummary(fulfillment);
        }
      }));

      sendJson(response, 201, {
        ok: true,
        order: savedOrder,
        cart: getCartPayload(emptyCart)
      });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      if (error.code === "INSUFFICIENT_STOCK") {
        sendError(response, 409, "INSUFFICIENT_STOCK", error.message);
        return;
      }

      console.error(error);
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

  const requestedReorderId = parseOrderReorderPath(requestUrl.pathname);
  if (request.method === "POST" && requestedReorderId) {
    try {
      const activeCart = await readActiveCart(request, { createAnonymousSession: true });
      const order = withDatabase((db) => findOrderById(db, requestedReorderId));
      if (!order || (order.userId && (!activeCart.user || activeCart.user.id !== order.userId))) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const products = withDatabase((db) => listProducts(db));
      const result = withDatabase((db) => reorderItemsFromOrder(db, {
        order,
        cart: activeCart.cart,
        products
      }));

      if (!result.addedItems.length) {
        sendError(response, 409, "REORDER_EMPTY", "No order items are available to reorder.");
        return;
      }

      const nextCart = { ...activeCart.cart, items: result.items };
      await writeActiveCart(activeCart, nextCart);
      sendCartJson(response, 200, {
        ok: true,
        cart: getCartPayload(nextCart, { products }),
        addedItems: result.addedItems,
        skippedItems: result.skippedItems
      }, activeCart);
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedPaymentOrderId = parseOrderPaymentsPath(requestUrl.pathname);
  const requestedInvoiceOrderId = parseOrderInvoicePath(requestUrl.pathname);
  if (request.method === "GET" && requestedInvoiceOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedInvoiceOrderId));
      if (!order) {
        sendError(response, 404, "INVOICE_NOT_FOUND", "Invoice was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "INVOICE_NOT_FOUND", "Invoice was not found.");
        return;
      }

      const invoice = withDatabase((db) => findInvoiceByOrderId(db, requestedInvoiceOrderId));
      if (!invoice) {
        sendError(response, 409, "INVOICE_NOT_READY", "Invoice is not ready until payment succeeds.");
        return;
      }

      sendJson(response, 200, { ok: true, invoice });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedInvoiceId = parseInvoiceIdFromPath(requestUrl.pathname);
  if (request.method === "GET" && requestedInvoiceId) {
    try {
      const invoice = withDatabase((db) => findInvoiceById(db, requestedInvoiceId));
      if (!invoice) {
        sendError(response, 404, "INVOICE_NOT_FOUND", "Invoice was not found.");
        return;
      }

      const order = withDatabase((db) => findOrderById(db, invoice.orderId));
      const { user } = await getSessionContext(request);
      if (!order || (order.userId && (!user || user.id !== order.userId))) {
        sendError(response, 404, "INVOICE_NOT_FOUND", "Invoice was not found.");
        return;
      }

      sendJson(response, 200, { ok: true, invoice });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestedPaymentOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedPaymentOrderId));
      if (!order) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const payments = withDatabase((db) => listPaymentAttemptsByOrder(db, requestedPaymentOrderId));
      sendJson(response, 200, { payments });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestedPaymentOrderId) {
    try {
      const body = await readRequestBody(request);
      const locale = normalizeLocale(body.locale);
      const order = withDatabase((db) => findOrderById(db, requestedPaymentOrderId));

      if (!order) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "PAYMENT_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const result = withDatabase((db) => createPaymentAttempt(db, {
        order,
        method: body.method,
        locale,
        createTimelineEntry,
        saveOrder
      }));

      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      if (body.outcome) {
        const callback = withDatabase((db) => processPaymentWebhook(db, {
          body: {
            eventId: `evt-${result.payment.id}-${body.outcome}`,
            paymentId: result.payment.id,
            orderId: order.id,
            status: body.outcome,
            provider: "demo_gateway",
            idempotencyKey: `demo-${result.payment.id}-${body.outcome}`,
            signature: "demo-signature",
            failureReason: body.outcome === "failed" ? "Demo payment was declined. Please try another method." : "",
            locale
          },
          findOrderById,
          saveOrder,
          findPaymentAttemptById,
          savePaymentAttempt,
          createTimelineEntry,
          createInvoiceForOrder
        }));
        if (callback.validationError) {
          sendError(response, callback.validationError.statusCode, callback.validationError.code, callback.validationError.message);
          return;
        }
        sendJson(response, 201, { ok: true, payment: callback.payment, order: callback.order, invoice: callback.invoice });
        return;
      }

      sendJson(response, 201, {
        ok: true,
        payment: result.payment,
        order: result.order,
        nextAction: result.payment.nextAction
      });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedCancelOrderId = parseOrderCancelPath(requestUrl.pathname);
  if (request.method === "POST" && requestedCancelOrderId) {
    try {
      const body = await readRequestBody(request);
      const locale = normalizeLocale(body.locale);
      const order = withDatabase((db) => findOrderById(db, requestedCancelOrderId));
      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      if (["cancelled", "refund_pending", "refunded"].includes(order.status)) {
        sendError(response, 409, "ORDER_CANCEL_ALREADY_FINAL", "Order has already been cancelled or refunded.");
        return;
      }

      if (!["pending_payment", "paid", "processing"].includes(order.status)) {
        sendError(response, 409, "ORDER_CANCEL_NOT_ALLOWED", "Order can no longer be cancelled.");
        return;
      }

      const result = withDatabase((db) => {
        const transaction = db.transaction(() => {
          const now = new Date().toISOString();
          const fulfillment = findFulfillmentByOrderId(db, order.id);
          order.updatedAt = now;
          order.timeline = Array.isArray(order.timeline) ? order.timeline : [];

          if (order.status === "pending_payment") {
            order.status = "cancelled";
            order.timeline.push(createTimelineEntry("cancelled", locale));
            const fulfillmentResult = syncFulfillmentForOrderStatus(db, {
              order,
              fulfillment,
              orderStatus: "cancelled",
              locale,
              createTimelineEntry
            });
            if (fulfillmentResult.validationError) return fulfillmentResult;
            saveOrder(db, order);
            return { order, refund: null };
          }

          order.status = "refund_pending";
          order.timeline.push(createTimelineEntry("refund_pending", locale));
          const fulfillmentResult = syncFulfillmentForOrderStatus(db, {
            order,
            fulfillment,
            orderStatus: "refund_pending",
            locale,
            createTimelineEntry
          });
          if (fulfillmentResult.validationError) return fulfillmentResult;

          const refund = createRefundForOrder(db, order, {
            reason: body.reason,
            locale
          });
          order.refund = createRefundSummary(refund);
          saveOrder(db, order);
          return { order, refund };
        });

        return transaction();
      });

      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, order: result.order, refund: result.refund });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedRefundsOrderId = parseOrderRefundsPath(requestUrl.pathname);
  if (request.method === "GET" && requestedRefundsOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedRefundsOrderId));
      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const refunds = withDatabase((db) => listRefundsByOrderId(db, requestedRefundsOrderId));
      sendJson(response, 200, { ok: true, refunds });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedRefundStatusId = parseRefundStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedRefundStatusId) {
    try {
      const body = await readRequestBody(request);
      const { user } = await getSessionContext(request);
      const isDemoAdmin = request.headers["x-demo-admin"] === "true" || (user && DEMO_ADMIN_EMAILS.has(user.email));
      if (!isDemoAdmin) {
        sendError(response, 403, "REFUND_FORBIDDEN", "Only demo admins can update refunds.");
        return;
      }

      const refund = withDatabase((db) => findRefundById(db, requestedRefundStatusId));
      if (!refund) {
        sendError(response, 404, "REFUND_NOT_FOUND", "Refund was not found.");
        return;
      }
      const order = withDatabase((db) => findOrderById(db, refund.orderId));
      if (!order) {
        sendError(response, 404, "ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const result = withDatabase((db) => updateRefundStatus(db, {
        refund,
        order,
        status: body.status,
        locale: normalizeLocale(body.locale),
        saveOrder,
        createTimelineEntry
      }));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, refund: result.refund, order: result.order });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedFulfillmentStatusOrderId = parseOrderFulfillmentStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedFulfillmentStatusOrderId) {
    try {
      const body = await readRequestBody(request);
      const { user } = await getSessionContext(request);
      const isDemoAdmin = request.headers["x-demo-admin"] === "true" || (user && DEMO_ADMIN_EMAILS.has(user.email));
      if (!isDemoAdmin) {
        sendError(response, 403, "FULFILLMENT_FORBIDDEN", "Only demo admins can update fulfillment.");
        return;
      }

      const order = withDatabase((db) => findOrderById(db, requestedFulfillmentStatusOrderId));
      const fulfillment = withDatabase((db) => findFulfillmentByOrderId(db, requestedFulfillmentStatusOrderId));
      if (!order || !fulfillment) {
        sendError(response, 404, "FULFILLMENT_NOT_FOUND", "Fulfillment was not found.");
        return;
      }

      const result = withDatabase((db) => updateFulfillmentStatus(db, {
        order,
        fulfillment,
        status: body.status,
        locale: normalizeLocale(body.locale),
        saveOrder,
        createTimelineEntry
      }));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, order: result.order, fulfillment: result.fulfillment });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedFulfillmentOrderId = parseOrderFulfillmentPath(requestUrl.pathname);
  if (request.method === "GET" && requestedFulfillmentOrderId) {
    try {
      const order = withDatabase((db) => findOrderById(db, requestedFulfillmentOrderId));
      if (!order) {
        sendError(response, 404, "FULFILLMENT_NOT_FOUND", "Fulfillment was not found.");
        return;
      }

      const { user } = await getSessionContext(request);
      if (order.userId && (!user || user.id !== order.userId)) {
        sendError(response, 404, "FULFILLMENT_NOT_FOUND", "Fulfillment was not found.");
        return;
      }

      const fulfillment = withDatabase((db) => findFulfillmentByOrderId(db, requestedFulfillmentOrderId));
      if (!fulfillment) {
        sendError(response, 404, "FULFILLMENT_NOT_FOUND", "Fulfillment was not found.");
        return;
      }

      sendJson(response, 200, { ok: true, fulfillment });
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

      const result = withDatabase((db) => {
        const fulfillment = findFulfillmentByOrderId(db, order.id);
        const fulfillmentResult = syncFulfillmentForOrderStatus(db, {
          order,
          fulfillment,
          orderStatus: nextStatus,
          locale,
          createTimelineEntry
        });
        if (fulfillmentResult.validationError) {
          return fulfillmentResult;
        }

        saveOrder(db, order);
        return { order };
      });

      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, order: result.order });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/me/returns") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;

      const returnRequests = withDatabase((db) => listReturnRequestsByUser(db, user.id));
      sendJson(response, 200, { returnRequests });
      return;
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/returns") {
    try {
      const user = await requireUser(request, response);
      if (!user) return;

      const body = await readRequestBody(request);
      const order = withDatabase((db) => findOrderById(db, String(body.orderId || "")));
      if (!order || order.userId !== user.id) {
        sendError(response, 404, "RETURN_ORDER_NOT_FOUND", "Order was not found.");
        return;
      }

      const result = withDatabase((db) => createReturnRequest(db, order, user, body));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 201, { ok: true, returnRequest: result.returnRequest });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedReturnStatusId = parseReturnStatusPath(requestUrl.pathname);
  if (request.method === "PATCH" && requestedReturnStatusId) {
    try {
      const body = await readRequestBody(request);
      const { user } = await getSessionContext(request);
      const isDemoAdmin = request.headers["x-demo-admin"] === "true";
      if (!user && !isDemoAdmin) {
        sendError(response, 401, "AUTH_REQUIRED", "Authentication is required.");
        return;
      }

      const returnRequest = withDatabase((db) => findReturnRequestById(db, requestedReturnStatusId));
      if (!returnRequest) {
        sendError(response, 404, "RETURN_NOT_FOUND", "Return request was not found.");
        return;
      }
      if (!isDemoAdmin && returnRequest.userId !== user.id) {
        sendError(response, 404, "RETURN_NOT_FOUND", "Return request was not found.");
        return;
      }

      const nextStatus = String(body.status || "").trim();
      if (!isDemoAdmin && nextStatus !== "cancelled") {
        sendError(response, 403, "RETURN_FORBIDDEN", "Only demo admins can review return requests.");
        return;
      }

      const result = withDatabase((db) => updateReturnRequestStatus(db, returnRequest, nextStatus, body.locale));
      if (result.validationError) {
        sendError(response, result.validationError.statusCode, result.validationError.code, result.validationError.message);
        return;
      }

      sendJson(response, 200, { ok: true, returnRequest: result.returnRequest });
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  const requestedReturnId = parseReturnIdFromPath(requestUrl.pathname);
  if (request.method === "GET" && requestedReturnId) {
    try {
      const { user } = await getSessionContext(request);
      const isDemoAdmin = request.headers["x-demo-admin"] === "true";
      if (!user && !isDemoAdmin) {
        sendError(response, 401, "AUTH_REQUIRED", "Authentication is required.");
        return;
      }

      const returnRequest = withDatabase((db) => findReturnRequestById(db, requestedReturnId));
      if (!returnRequest) {
        sendError(response, 404, "RETURN_NOT_FOUND", "Return request was not found.");
        return;
      }
      if (!isDemoAdmin && returnRequest.userId !== user.id) {
        sendError(response, 404, "RETURN_NOT_FOUND", "Return request was not found.");
        return;
      }

      sendJson(response, 200, { returnRequest });
      return;
    } catch (error) {
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
      const cartPayload = getCartPayload(cart, { products });

      sendCartJson(response, 200, {
        ok: true,
        item: cart.items[itemIndex],
        items: cart.items,
        cart: cartPayload,
        meta: cartPayload.meta
      }, activeCart);
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
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
      const cartPayload = getCartPayload(cart, { products });

      sendCartJson(response, 200, {
        ok: true,
        removedItem,
        items: cart.items,
        cart: cartPayload,
        meta: cartPayload.meta
      }, activeCart);
      return;
    } catch (error) {
      if (handleRequestBodyError(error, response)) {
        return;
      }

      sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
      return;
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "METHOD_NOT_ALLOWED", "Method is not allowed.");
    return;
  }

  const filePath = getStaticFilePath(requestUrl.pathname);
  if (!sendStaticFile(request, response, filePath, config)) {
    sendError(response, 404, "NOT_FOUND", "Resource was not found.");
    return;
  }
});

validateDataDir();
withDatabase(() => null);

server.listen(port, host, () => {
  logger.info("server.listening", { url: `http://${host}:${port}` });
});

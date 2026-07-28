function parseProductReviewsPath(pathname) {
  const match = pathname.match(/^\/api\/products\/([^/]+)\/reviews$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProductReviewPayload(db, services, productId) {
  const product = services.findProductById(db, productId);
  if (!product) {
    return null;
  }

  const reviews = services.listProductReviews(db, productId);
  return {
    ok: true,
    productId,
    summary: services.summarizeReviews(reviews),
    reviews
  };
}

function sendProductNotFound(sendError, response) {
  sendError(response, 404, "PRODUCT_NOT_FOUND", "Product was not found.");
}

function registerProductRoutes(router, services) {
  router.get("/api/products", ({ requestUrl, response, sendJson }) => {
    const products = services.withDatabase((db) => services.listProducts(db));
    const payload = services.getProductsPayload(
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
  });

  router.add("GET", /^\/api\/products\/[^/]+\/reviews$/, ({ requestUrl, response, sendJson, sendError }) => {
    const productId = parseProductReviewsPath(requestUrl.pathname);
    const payload = services.withDatabase((db) => getProductReviewPayload(db, services, productId));

    if (!payload) {
      sendProductNotFound(sendError, response);
      return;
    }

    sendJson(response, 200, payload);
  });

  router.add("POST", /^\/api\/products\/[^/]+\/reviews$/, async ({ request, requestUrl, response, sendJson, sendError }) => {
    const productId = parseProductReviewsPath(requestUrl.pathname);
    let body;

    try {
      body = await services.readRequestBody(request);
    } catch (error) {
      sendError(response, error.statusCode || 400, error.code || "INVALID_JSON", error.message || "Request body must be valid JSON.");
      return;
    }

    const result = services.withDatabase((db) => {
      const product = services.findProductById(db, productId);
      if (!product) {
        return { productNotFound: true };
      }

      const created = services.createProductReview(db, productId, body);
      if (created.validationError) {
        return created;
      }

      const reviews = services.listProductReviews(db, productId);
      return {
        ok: true,
        review: created.review,
        summary: services.summarizeReviews(reviews),
        reviews
      };
    });

    if (result.productNotFound) {
      sendProductNotFound(sendError, response);
      return;
    }

    if (result.validationError) {
      sendError(response, 400, result.validationError.code, result.validationError.message, {
        fields: result.validationError.fields
      });
      return;
    }

    sendJson(response, 201, result);
  });
}

module.exports = {
  registerProductRoutes
};

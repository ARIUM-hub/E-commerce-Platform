function parseProductReviewsPath(pathname) {
  const match = pathname.match(/^\/api\/products\/([^/]+)\/reviews$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseProductQuestionsPath(pathname) {
  const match = pathname.match(/^\/api\/products\/([^/]+)\/questions$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseSavedProductPath(pathname) {
  const match = pathname.match(/^\/api\/saved-products\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getReviewQueryOptions(requestUrl) {
  return {
    sort: requestUrl.searchParams.get("sort"),
    rating: requestUrl.searchParams.get("rating")
  };
}

function getProductReviewPayload(db, services, productId, options = {}) {
  const product = services.findProductById(db, productId);
  if (!product) {
    return null;
  }

  const reviews = services.listProductReviews(db, productId, options);
  return {
    ok: true,
    productId,
    summary: services.summarizeReviews(reviews),
    reviews
  };
}

function getProductQuestionPayload(db, services, productId) {
  const product = services.findProductById(db, productId);
  if (!product) {
    return null;
  }

  const questions = services.listProductQuestions(db, productId);
  return {
    ok: true,
    productId,
    summary: services.summarizeQuestions(questions),
    questions
  };
}

function getSavedProductsPayload(db, services, owner) {
  const products = services.listProducts(db);
  const saved = services.listSavedProducts(db, owner, products);
  return {
    ok: true,
    ...saved
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
    const payload = services.withDatabase((db) => getProductReviewPayload(db, services, productId, getReviewQueryOptions(requestUrl)));

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

  router.add("GET", /^\/api\/products\/[^/]+\/questions$/, ({ requestUrl, response, sendJson, sendError }) => {
    const productId = parseProductQuestionsPath(requestUrl.pathname);
    const payload = services.withDatabase((db) => getProductQuestionPayload(db, services, productId));

    if (!payload) {
      sendProductNotFound(sendError, response);
      return;
    }

    sendJson(response, 200, payload);
  });

  router.add("POST", /^\/api\/products\/[^/]+\/questions$/, async ({ request, requestUrl, response, sendJson, sendError }) => {
    const productId = parseProductQuestionsPath(requestUrl.pathname);
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

      const created = services.createProductQuestion(db, productId, body);
      if (created.validationError) {
        return created;
      }

      const questions = services.listProductQuestions(db, productId);
      return {
        ok: true,
        question: created.question,
        summary: services.summarizeQuestions(questions),
        questions
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

  router.get("/api/saved-products", async ({ request, response, sendJson }) => {
    const activeCart = await services.readActiveCart(request);
    const owner = {
      userId: activeCart.user?.id || null,
      sessionId: activeCart.user ? null : activeCart.sessionId
    };
    const payload = services.withDatabase((db) => getSavedProductsPayload(db, services, owner));
    sendJson(response, 200, payload);
  });

  router.post("/api/saved-products", async ({ request, response, sendJson, sendError }) => {
    const activeCart = await services.readActiveCart(request, { createAnonymousSession: true });
    let body;

    try {
      body = await services.readRequestBody(request);
    } catch (error) {
      sendError(response, error.statusCode || 400, error.code || "INVALID_JSON", error.message || "Request body must be valid JSON.");
      return;
    }

    const productId = String(body.productId || "").trim();
    const owner = {
      userId: activeCart.user?.id || null,
      sessionId: activeCart.user ? null : activeCart.sessionId
    };
    const result = services.withDatabase((db) => {
      const product = services.findProductById(db, productId);
      if (!product) {
        return { productNotFound: true };
      }

      const saved = services.saveProduct(db, owner, productId);
      if (saved.validationError) {
        return saved;
      }

      return getSavedProductsPayload(db, services, owner);
    });

    if (result.productNotFound) {
      sendProductNotFound(sendError, response);
      return;
    }

    if (result.validationError) {
      sendError(response, 400, result.validationError.code, result.validationError.message);
      return;
    }

    if (activeCart.setCookieHeader) {
      response.setHeader("Set-Cookie", activeCart.setCookieHeader);
    }

    sendJson(response, 201, result);
  });

  router.add("DELETE", /^\/api\/saved-products\/[^/]+$/, async ({ request, requestUrl, response, sendJson }) => {
    const activeCart = await services.readActiveCart(request);
    const productId = parseSavedProductPath(requestUrl.pathname);
    const owner = {
      userId: activeCart.user?.id || null,
      sessionId: activeCart.user ? null : activeCart.sessionId
    };
    const payload = services.withDatabase((db) => {
      services.removeSavedProduct(db, owner, productId);
      return getSavedProductsPayload(db, services, owner);
    });

    sendJson(response, 200, payload);
  });
}

module.exports = {
  registerProductRoutes
};

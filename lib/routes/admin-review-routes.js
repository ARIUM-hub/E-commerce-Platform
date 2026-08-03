const { PERMISSIONS } = require("../auth/permissions");

function parseAdminReviewPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAdminReviewActionPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/reviews\/([^/]+)\/actions\/(reply|withdraw-reply)$/);
  return match
    ? { reviewId: decodeURIComponent(match[1]), action: match[2] }
    : null;
}

function sendRepositoryResult(response, sendJson, sendError, result, statusCode = 200) {
  if (result.validationError) {
    const { validationError } = result;
    sendError(
      response,
      validationError.statusCode || 400,
      validationError.code,
      validationError.message,
      validationError.fields ? { fields: validationError.fields } : {}
    );
    return;
  }
  sendJson(response, statusCode, { ok: true, ...result });
}

async function readBodyOrRespond(request, response, services) {
  try {
    return { body: await services.readRequestBody(request) };
  } catch (error) {
    if (services.handleRequestBodyError(error, response)) {
      return { handled: true };
    }
    throw error;
  }
}

function registerAdminReviewRoutes(router, services) {
  router.get("/api/admin/reviews", async ({ request, requestUrl, response, sendJson }) => {
    const admin = await services.requirePermission(PERMISSIONS.REVIEWS_READ, request, response);
    if (!admin) return;
    const result = services.withDatabase((db) => services.listAdminProductReviews(db, {
      status: requestUrl.searchParams.get("status") || "",
      rating: requestUrl.searchParams.get("rating") || "",
      productId: requestUrl.searchParams.get("productId") || "",
      replied: requestUrl.searchParams.get("replied") || "",
      q: requestUrl.searchParams.get("q") || ""
    }));
    sendJson(response, 200, { ok: true, ...result });
  });

  router.post("/api/admin/reviews/actions/moderate", async ({ request, response, sendJson, sendError }) => {
    const admin = await services.requirePermission(PERMISSIONS.REVIEWS_MODERATE, request, response);
    if (!admin) return;
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const result = services.withDatabase((db) => services.moderateReviewBatch(db, {
      admin,
      body: parsed.body
    }));
    sendRepositoryResult(response, sendJson, sendError, result);
  });

  router.add("GET", /^\/api\/admin\/reviews\/[^/]+$/, async ({ request, requestUrl, response, sendJson, sendError }) => {
    const admin = await services.requirePermission(PERMISSIONS.REVIEWS_READ, request, response);
    if (!admin) return;
    const reviewId = parseAdminReviewPath(requestUrl.pathname);
    const review = services.withDatabase((db) => services.findAdminReviewById(db, reviewId));
    if (!review) {
      sendError(response, 404, "ADMIN_REVIEW_NOT_FOUND", "Product review was not found.");
      return;
    }
    sendJson(response, 200, { ok: true, review });
  });

  router.add("POST", /^\/api\/admin\/reviews\/[^/]+\/actions\/(reply|withdraw-reply)$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const admin = await services.requirePermission(PERMISSIONS.REVIEWS_REPLY, request, response);
    if (!admin) return;
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const pathValues = parseAdminReviewActionPath(requestUrl.pathname);
    const result = services.withDatabase((db) => {
      const review = services.findAdminReviewById(db, pathValues.reviewId);
      if (pathValues.action === "reply") {
        return services.upsertMerchantReply(db, { admin, review, body: parsed.body });
      }
      return services.withdrawMerchantReply(db, { admin, review, body: parsed.body });
    });
    sendRepositoryResult(response, sendJson, sendError, result);
  });
}

module.exports = {
  registerAdminReviewRoutes
};

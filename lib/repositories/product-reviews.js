const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);

function safeParseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeReviewPayload(payload = {}) {
  const author = String(payload.author || "").trim();
  const body = String(payload.body || "").trim();
  const rating = Number(payload.rating);
  const locale = validLocales.has(payload.locale) ? payload.locale : "zh-CN";
  const fields = [];

  if (author.length < 1 || author.length > 60) {
    fields.push("author");
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fields.push("rating");
  }

  if (body.length < 1 || body.length > 500) {
    fields.push("body");
  }

  if (fields.length) {
    return {
      validationError: {
        code: "PRODUCT_REVIEW_VALIDATION_FAILED",
        message: "Product review information is invalid.",
        fields
      }
    };
  }

  return {
    review: {
      author,
      rating,
      body,
      locale
    }
  };
}

function parseReviewRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    author: row.author,
    rating: row.rating,
    body: row.body,
    locale: row.locale,
    verifiedPurchase: Boolean(row.verified_purchase),
    helpfulCount: row.helpful_count || 0,
    mediaUrls: safeParseArray(row.media_urls),
    reasonTags: safeParseArray(row.reason_tags),
    status: row.status || "published",
    riskFlags: safeParseArray(row.risk_flags),
    updatedAt: row.updated_at || row.created_at,
    createdAt: row.created_at
  };
}

function getReviewRiskFlags(db, productId, review, owner = {}, now = new Date()) {
  const flags = [];
  if (!owner.userId) flags.push("anonymous");
  if (/https?:\/\/|www\./i.test(review.body)) flags.push("external_link");
  const duplicate = db.prepare(`
    SELECT id FROM product_reviews
    WHERE product_id = ? AND lower(trim(body)) = lower(trim(?))
    LIMIT 1
  `).get(productId, review.body);
  if (duplicate) flags.push("duplicate_content");

  const since = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  let recentCount = 0;
  if (owner.userId) {
    recentCount = db.prepare(`
      SELECT COUNT(*) AS count FROM product_reviews
      WHERE user_id = ? AND created_at >= ?
    `).get(owner.userId, since).count;
  } else if (owner.sessionId) {
    recentCount = db.prepare(`
      SELECT COUNT(*) AS count FROM product_reviews
      WHERE session_id = ? AND created_at >= ?
    `).get(owner.sessionId, since).count;
  }
  if (recentCount >= 3) flags.push("high_frequency");
  return flags;
}

function getInitialReviewStatus(owner = {}, riskFlags = []) {
  return owner.userId && riskFlags.length === 0 ? "published" : "pending";
}

function getReviewOrderClause(sort) {
  if (sort === "rating-desc") {
    return "rating DESC, datetime(created_at) DESC, rowid DESC";
  }

  if (sort === "rating-asc") {
    return "rating ASC, datetime(created_at) DESC, rowid DESC";
  }

  return "datetime(created_at) DESC, rowid DESC";
}

function normalizeRatingFilter(rating) {
  const normalizedRating = Number(rating);
  return Number.isInteger(normalizedRating) && normalizedRating >= 1 && normalizedRating <= 5
    ? normalizedRating
    : null;
}

function listProductReviews(db, productId, options = {}) {
  const ratingFilter = normalizeRatingFilter(options.rating);
  const params = [productId];
  let whereClause = "WHERE product_id = ?";

  if (!options.includeAllStatuses) {
    whereClause += " AND status = 'published'";
  }

  if (ratingFilter) {
    whereClause += " AND rating = ?";
    params.push(ratingFilter);
  }

  return db.prepare(`
    SELECT id, product_id, author, rating, body, locale, verified_purchase, helpful_count,
      media_urls, reason_tags, status, risk_flags, updated_at, created_at
    FROM product_reviews
    ${whereClause}
    ORDER BY ${getReviewOrderClause(options.sort)}
  `).all(...params).map(parseReviewRow);
}

function findProductReviewById(db, productId, reviewId) {
  const row = db.prepare(`
    SELECT id, product_id, author, rating, body, locale, verified_purchase, helpful_count,
      media_urls, reason_tags, status, risk_flags, updated_at, created_at
    FROM product_reviews
    WHERE product_id = ? AND id = ? AND status = 'published'
  `).get(productId, reviewId);

  return row ? parseReviewRow(row) : null;
}

function summarizeReviews(reviews) {
  const count = reviews.length;
  const averageRating = count === 0
    ? 0
    : Number((reviews.reduce((sum, review) => sum + review.rating, 0) / count).toFixed(1));

  return {
    count,
    averageRating
  };
}

function createProductReview(db, productId, payload, options = {}) {
  const normalized = normalizeReviewPayload(payload);
  if (normalized.validationError) {
    return normalized;
  }

  const now = options.now instanceof Date
    ? options.now
    : options.now
      ? new Date(options.now)
      : new Date();
  const createdAt = now.toISOString();
  const owner = options.owner || {};
  const riskFlags = getReviewRiskFlags(db, productId, normalized.review, owner, now);
  const review = {
    id: options.id || `review-${crypto.randomUUID()}`,
    productId,
    ...normalized.review,
    userId: owner.userId || null,
    sessionId: owner.userId ? null : owner.sessionId || null,
    status: getInitialReviewStatus(owner, riskFlags),
    riskFlags,
    updatedAt: createdAt,
    createdAt
  };

  db.prepare(`
    INSERT INTO product_reviews (
      id, product_id, author, rating, body, locale, verified_purchase, helpful_count,
      media_urls, reason_tags, user_id, session_id, status, risk_flags, updated_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    review.id,
    review.productId,
    review.author,
    review.rating,
    review.body,
    review.locale,
    0,
    0,
    "[]",
    "[]",
    review.userId,
    review.sessionId,
    review.status,
    JSON.stringify(review.riskFlags),
    review.updatedAt,
    review.createdAt
  );

  return { review };
}

function getOwnerSelector(owner = {}) {
  if (owner.userId) {
    return {
      column: "user_id",
      value: owner.userId
    };
  }

  if (owner.sessionId) {
    return {
      column: "session_id",
      value: owner.sessionId
    };
  }

  return null;
}

function markProductReviewHelpful(db, productId, reviewId, owner = {}, options = {}) {
  const review = findProductReviewById(db, productId, reviewId);
  if (!review) {
    return { reviewNotFound: true };
  }

  const selector = getOwnerSelector(owner);
  if (!selector) {
    return {
      validationError: {
        code: "PRODUCT_REVIEW_HELPFUL_OWNER_REQUIRED",
        message: "A user or session is required to mark a review helpful."
      }
    };
  }

  const createdAt = options.now || new Date().toISOString();
  const voteId = options.id || `review-helpful-${crypto.randomUUID()}`;
  const existingVote = db.prepare(`
    SELECT id
    FROM product_review_helpful_votes
    WHERE review_id = ? AND ${selector.column} = ?
  `).get(reviewId, selector.value);

  const vote = db.transaction(() => {
    if (!existingVote) {
      db.prepare(`
        INSERT INTO product_review_helpful_votes (id, review_id, user_id, session_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        voteId,
        reviewId,
        selector.column === "user_id" ? selector.value : null,
        selector.column === "session_id" ? selector.value : null,
        createdAt
      );
      db.prepare("UPDATE product_reviews SET helpful_count = helpful_count + 1 WHERE id = ?").run(reviewId);
    }

    return findProductReviewById(db, productId, reviewId);
  });

  return {
    review: vote()
  };
}

module.exports = {
  createProductReview,
  findProductReviewById,
  getInitialReviewStatus,
  getReviewRiskFlags,
  listProductReviews,
  markProductReviewHelpful,
  summarizeReviews
};

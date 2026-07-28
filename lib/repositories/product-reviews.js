const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);

function normalizeReviewPayload(payload = {}) {
  const author = String(payload.author || "").trim();
  const body = String(payload.body || "").trim();
  const rating = Number(payload.rating);
  const locale = validLocales.has(payload.locale) ? payload.locale : "zh-CN";
  const fields = [];

  if (author.length < 2 || author.length > 60) {
    fields.push("author");
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fields.push("rating");
  }

  if (body.length < 6 || body.length > 500) {
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
    createdAt: row.created_at
  };
}

function listProductReviews(db, productId) {
  return db.prepare(`
    SELECT id, product_id, author, rating, body, locale, created_at
    FROM product_reviews
    WHERE product_id = ?
    ORDER BY datetime(created_at) DESC, rowid DESC
  `).all(productId).map(parseReviewRow);
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

  const createdAt = options.now || new Date().toISOString();
  const review = {
    id: options.id || `review-${crypto.randomUUID()}`,
    productId,
    ...normalized.review,
    createdAt
  };

  db.prepare(`
    INSERT INTO product_reviews (id, product_id, author, rating, body, locale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    review.id,
    review.productId,
    review.author,
    review.rating,
    review.body,
    review.locale,
    review.createdAt
  );

  return { review };
}

module.exports = {
  createProductReview,
  listProductReviews,
  summarizeReviews
};

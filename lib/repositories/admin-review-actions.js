const crypto = require("node:crypto");
const { executeIdempotentAction } = require("./admin-order-actions");
const { findAdminReviewById } = require("./product-reviews");

function validation(statusCode, code, message, extra = {}) {
  return { validationError: { statusCode, code, message, ...extra } };
}

const REVIEW_TRANSITIONS = {
  publish: { from: new Set(["pending", "hidden"]), to: "published" },
  reject: { from: new Set(["pending"]), to: "rejected" },
  hide: { from: new Set(["published"]), to: "hidden" },
  restore: { from: new Set(["hidden"]), to: "published" }
};

function normalizeReviewIds(reviewIds) {
  return [...new Set((Array.isArray(reviewIds) ? reviewIds : [])
    .map((reviewId) => String(reviewId || "").trim())
    .filter(Boolean))];
}

function createBatchResourceId(reviewIds) {
  return crypto.createHash("sha256").update([...reviewIds].sort().join("\n")).digest("hex");
}

function getBatchStatus(reviews) {
  const statuses = [...new Set(reviews.filter(Boolean).map((review) => review.status))].sort();
  return statuses.join(",") || "unknown";
}

function moderateReviewBatch(db, { admin, body = {} }) {
  const transition = REVIEW_TRANSITIONS[String(body.action || "").trim()];
  if (!transition) {
    return validation(400, "ADMIN_REVIEW_ACTION_INVALID", "Review moderation action is invalid.");
  }

  const reviewIds = normalizeReviewIds(body.reviewIds);
  if (reviewIds.length < 1 || reviewIds.length > 100) {
    return validation(400, "ADMIN_REVIEW_BATCH_INVALID", "Review batch must contain 1 to 100 unique IDs.");
  }

  const initialReviews = reviewIds.map((reviewId) => findAdminReviewById(db, reviewId));
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: `review_${body.action}`,
    resourceType: "product_review_batch",
    resourceId: createBatchResourceId(reviewIds),
    reason: String(body.reason || body.action).trim(),
    beforeStatus: getBatchStatus(initialReviews),
    requestPayload: { ...body, reviewIds },
    run() {
      const reviews = reviewIds.map((reviewId) => findAdminReviewById(db, reviewId));
      if (reviews.some((review) => !review)
        || reviews.some((review) => !transition.from.has(review.status))) {
        return validation(
          409,
          "ADMIN_REVIEW_BATCH_CONFLICT",
          "One or more reviews cannot perform this moderation action.",
          { reviewIds }
        );
      }

      const now = new Date().toISOString();
      const update = db.prepare(`
        UPDATE product_reviews
        SET status = ?, moderation_reason = ?, moderation_note = ?, moderated_by = ?,
          moderated_at = ?, updated_at = ?
        WHERE id = ?
      `);
      reviews.forEach((review) => {
        update.run(
          transition.to,
          String(body.reason || "").trim(),
          String(body.note || "").trim(),
          admin?.id || null,
          now,
          now,
          review.id
        );
      });
      return {
        reviews: reviewIds.map((reviewId) => findAdminReviewById(db, reviewId)),
        afterStatus: transition.to
      };
    }
  });
}

function upsertMerchantReply(db, { admin, review, body = {} }) {
  if (!review) {
    return validation(404, "ADMIN_REVIEW_NOT_FOUND", "Product review was not found.");
  }
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "review_reply_upsert",
    resourceType: "product_review",
    resourceId: review.id,
    reason: "merchant_reply",
    beforeStatus: review.status,
    requestPayload: body,
    run() {
      const currentReview = findAdminReviewById(db, review.id);
      const replyBody = String(body.replyBody || "").trim();
      if (!currentReview) {
        return validation(404, "ADMIN_REVIEW_NOT_FOUND", "Product review was not found.");
      }
      if (currentReview.status !== "published") {
        return validation(409, "ADMIN_REVIEW_REPLY_NOT_ALLOWED", "Only published reviews can be replied to.");
      }
      if (!replyBody || replyBody.length > 1000) {
        return validation(400, "ADMIN_REVIEW_REPLY_INVALID", "Reply must contain 1 to 1000 characters.");
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO product_review_replies (
          id, review_id, body, admin_user_id, created_at, updated_at, withdrawn_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(review_id) DO UPDATE SET
          body = excluded.body,
          admin_user_id = excluded.admin_user_id,
          updated_at = excluded.updated_at,
          withdrawn_at = NULL
      `).run(
        `review-reply-${crypto.randomUUID()}`,
        currentReview.id,
        replyBody,
        admin?.id || null,
        now,
        now
      );
      return { review: findAdminReviewById(db, currentReview.id) };
    }
  });
}

function withdrawMerchantReply(db, { admin, review, body = {} }) {
  if (!review) {
    return validation(404, "ADMIN_REVIEW_NOT_FOUND", "Product review was not found.");
  }
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "review_reply_withdraw",
    resourceType: "product_review",
    resourceId: review.id,
    reason: String(body.reason || "merchant_reply_withdrawn").trim(),
    beforeStatus: review.status,
    requestPayload: body,
    run() {
      const currentReview = findAdminReviewById(db, review.id);
      if (!currentReview) {
        return validation(404, "ADMIN_REVIEW_NOT_FOUND", "Product review was not found.");
      }
      const now = new Date().toISOString();
      const result = db.prepare(`
        UPDATE product_review_replies
        SET withdrawn_at = ?, updated_at = ?
        WHERE review_id = ? AND withdrawn_at IS NULL
      `).run(now, now, currentReview.id);
      if (result.changes !== 1) {
        return validation(409, "ADMIN_REVIEW_REPLY_NOT_FOUND", "An active merchant reply was not found.");
      }
      return { review: findAdminReviewById(db, currentReview.id) };
    }
  });
}

module.exports = {
  REVIEW_TRANSITIONS,
  moderateReviewBatch,
  upsertMerchantReply,
  withdrawMerchantReply
};

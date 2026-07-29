const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);

function normalizeQuestionPayload(payload = {}) {
  const author = String(payload.author || "").trim();
  const question = String(payload.question || "").trim();
  const locale = validLocales.has(payload.locale) ? payload.locale : "zh-CN";
  const fields = [];

  if (author.length < 1 || author.length > 60) {
    fields.push("author");
  }

  if (question.length < 1 || question.length > 280) {
    fields.push("question");
  }

  if (fields.length) {
    return {
      validationError: {
        code: "PRODUCT_QUESTION_VALIDATION_FAILED",
        message: "Product question information is invalid.",
        fields
      }
    };
  }

  return {
    question: {
      author,
      question,
      answer: String(payload.answer || "").trim(),
      locale
    }
  };
}

function parseQuestionRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    author: row.author,
    question: row.question,
    answer: row.answer,
    locale: row.locale,
    createdAt: row.created_at
  };
}

function listProductQuestions(db, productId) {
  return db.prepare(`
    SELECT id, product_id, author, question, answer, locale, created_at
    FROM product_questions
    WHERE product_id = ?
    ORDER BY datetime(created_at) DESC, rowid DESC
  `).all(productId).map(parseQuestionRow);
}

function summarizeQuestions(questions) {
  return {
    count: questions.length
  };
}

function createProductQuestion(db, productId, payload, options = {}) {
  const normalized = normalizeQuestionPayload(payload);
  if (normalized.validationError) {
    return normalized;
  }

  const createdAt = options.now || new Date().toISOString();
  const question = {
    id: options.id || `question-${crypto.randomUUID()}`,
    productId,
    ...normalized.question,
    createdAt
  };

  db.prepare(`
    INSERT INTO product_questions (id, product_id, author, question, answer, locale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    question.id,
    question.productId,
    question.author,
    question.question,
    question.answer,
    question.locale,
    question.createdAt
  );

  return { question };
}

module.exports = {
  createProductQuestion,
  listProductQuestions,
  summarizeQuestions
};

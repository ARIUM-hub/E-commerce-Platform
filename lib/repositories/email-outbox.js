const crypto = require("node:crypto");

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) {
    throw new Error("EMAIL_OUTBOX_DATE_INVALID");
  }
  return date;
}

function mapOutboxEmail(row) {
  if (!row) return null;
  return {
    id: row.id,
    recipient: row.recipient,
    templateId: row.template_id,
    payload: JSON.parse(row.payload || "{}"),
    status: row.status,
    attemptCount: Number(row.attempt_count),
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}

function findOutboxEmail(db, id) {
  return mapOutboxEmail(db.prepare("SELECT * FROM email_outbox WHERE id = ?").get(id));
}

function enqueueEmail(db, { recipient, templateId, payload = {}, now = new Date() }) {
  const createdAt = normalizeDate(now).toISOString();
  const email = {
    id: `email-${crypto.randomUUID()}`,
    recipient: String(recipient || "").trim().toLowerCase(),
    templateId: String(templateId || "").trim(),
    payload,
    status: "queued",
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt,
    sentAt: null
  };
  if (!email.recipient || !email.templateId) {
    throw new Error("EMAIL_OUTBOX_INPUT_INVALID");
  }
  db.prepare(`
    INSERT INTO email_outbox (
      id, recipient, template_id, payload, status, attempt_count,
      next_attempt_at, last_error, created_at, sent_at
    ) VALUES (?, ?, ?, ?, 'queued', 0, NULL, NULL, ?, NULL)
  `).run(
    email.id,
    email.recipient,
    email.templateId,
    JSON.stringify(email.payload),
    email.createdAt
  );
  return email;
}

function listOutbox(db, { status, limit = 100 } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(limit) || 100)));
  if (status) {
    return db.prepare(`
      SELECT * FROM email_outbox WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(String(status), pageSize).map(mapOutboxEmail);
  }
  return db.prepare(`
    SELECT * FROM email_outbox ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(pageSize).map(mapOutboxEmail);
}

function findNextQueuedEmail(db, { now = new Date() } = {}) {
  return mapOutboxEmail(db.prepare(`
    SELECT * FROM email_outbox
    WHERE status = 'queued'
       OR (status = 'deferred' AND next_attempt_at <= ?)
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).get(normalizeDate(now).toISOString()));
}

function markEmailSent(db, id, { now = new Date() } = {}) {
  db.prepare(`
    UPDATE email_outbox
    SET status = 'sent', attempt_count = attempt_count + 1,
        next_attempt_at = NULL, last_error = NULL, sent_at = ?
    WHERE id = ?
  `).run(normalizeDate(now).toISOString(), id);
  return findOutboxEmail(db, id);
}

function markEmailDeferred(db, id, { nextAttemptAt, lastError = "Email delivery failed." }) {
  db.prepare(`
    UPDATE email_outbox
    SET status = 'deferred', attempt_count = attempt_count + 1,
        next_attempt_at = ?, last_error = ?, sent_at = NULL
    WHERE id = ?
  `).run(normalizeDate(nextAttemptAt).toISOString(), String(lastError), id);
  return findOutboxEmail(db, id);
}

function markEmailFailed(db, id, { lastError = "Email delivery failed." } = {}) {
  db.prepare(`
    UPDATE email_outbox
    SET status = 'failed', attempt_count = attempt_count + 1,
        next_attempt_at = NULL, last_error = ?, sent_at = NULL
    WHERE id = ?
  `).run(String(lastError), id);
  return findOutboxEmail(db, id);
}

module.exports = {
  enqueueEmail,
  findNextQueuedEmail,
  listOutbox,
  markEmailDeferred,
  markEmailFailed,
  markEmailSent
};

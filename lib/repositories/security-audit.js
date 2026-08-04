const crypto = require("node:crypto");

const METADATA_STRING_LIMIT = 500;
const METADATA_KEYS = Object.freeze([
  "reasonCode",
  "route",
  "method",
  "roleId",
  "deliveryStatus"
]);

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) {
    throw new Error("SECURITY_AUDIT_DATE_INVALID");
  }
  return date;
}

function normalizeString(value, maxLength = METADATA_STRING_LIMIT) {
  return String(value ?? "").slice(0, maxLength);
}

function redactMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const redacted = {};
  for (const key of METADATA_KEYS) {
    if (metadata[key] !== undefined && metadata[key] !== null) {
      redacted[key] = normalizeString(metadata[key]);
    }
  }
  const retryAfterSeconds = Number(metadata.retryAfterSeconds);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    redacted.retryAfterSeconds = Math.floor(retryAfterSeconds);
  }
  return redacted;
}

function mapAuditEvent(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    outcome: row.outcome,
    actorUserId: row.actor_user_id,
    sessionId: row.session_id,
    ipHash: row.ip_hash,
    userAgentHash: row.user_agent_hash,
    targetHash: row.target_hash,
    metadata: JSON.parse(row.metadata || "{}"),
    occurredAt: row.occurred_at,
    expiresAt: row.expires_at
  };
}

function recordSecurityAudit(db, input) {
  const occurredAt = normalizeDate(input.occurredAt);
  const retentionDays = Number(input.retentionDays);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error("SECURITY_AUDIT_RETENTION_INVALID");
  }
  const event = {
    id: `security-audit-${crypto.randomUUID()}`,
    eventType: normalizeString(input.eventType, 120),
    outcome: normalizeString(input.outcome, 60),
    actorUserId: input.actorUserId || null,
    sessionId: input.sessionId || null,
    ipHash: normalizeString(input.ipHash, 128),
    userAgentHash: normalizeString(input.userAgentHash, 128),
    targetHash: input.targetHash ? normalizeString(input.targetHash, 128) : null,
    metadata: redactMetadata(input.metadata),
    occurredAt: occurredAt.toISOString(),
    expiresAt: new Date(occurredAt.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
  };
  db.prepare(`
    INSERT INTO security_audit_events (
      id, event_type, outcome, actor_user_id, session_id, ip_hash, user_agent_hash,
      target_hash, metadata, occurred_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.eventType,
    event.outcome,
    event.actorUserId,
    event.sessionId,
    event.ipHash,
    event.userAgentHash,
    event.targetHash,
    JSON.stringify(event.metadata),
    event.occurredAt,
    event.expiresAt
  );
  return event;
}

function listSecurityAuditEvents(db, filters = {}) {
  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(filters.pageSize) || 25)));
  const conditions = [];
  const parameters = [];
  for (const [column, value] of [
    ["event_type", filters.eventType],
    ["outcome", filters.outcome],
    ["actor_user_id", filters.actorUserId]
  ]) {
    if (value !== undefined && value !== null && value !== "") {
      conditions.push(`${column} = ?`);
      parameters.push(String(value));
    }
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM security_audit_events ${whereClause}
  `).get(...parameters).count);
  const rows = db.prepare(`
    SELECT * FROM security_audit_events
    ${whereClause}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...parameters, pageSize, (page - 1) * pageSize);
  return {
    items: rows.map(mapAuditEvent),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    }
  };
}

function cleanupExpiredSecurityAudit(db, { now = new Date(), limit = 100 } = {}) {
  const batchSize = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 100)));
  const result = db.prepare(`
    DELETE FROM security_audit_events
    WHERE id IN (
      SELECT id FROM security_audit_events
      WHERE expires_at <= ?
      ORDER BY expires_at ASC, id ASC
      LIMIT ?
    )
  `).run(normalizeDate(now).toISOString(), batchSize);
  return Number(result.changes);
}

module.exports = {
  cleanupExpiredSecurityAudit,
  listSecurityAuditEvents,
  recordSecurityAudit
};

const crypto = require("node:crypto");

const TOKEN_TABLES = Object.freeze({
  email_verification: "email_verification_tokens",
  password_reset: "password_reset_tokens"
});

function getTokenTable(type) {
  const table = TOKEN_TABLES[type];
  if (!table) {
    throw new Error("ACCOUNT_TOKEN_TYPE_INVALID");
  }
  return table;
}

function normalizeDate(value) {
  return value instanceof Date ? value : new Date(value || Date.now());
}

function createRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function invalidateUserTokens(db, { type, userId, consumedAt = new Date() }) {
  const table = getTokenTable(type);
  return db.prepare(`
    UPDATE ${table} SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL
  `).run(normalizeDate(consumedAt).toISOString(), userId).changes;
}

function issueAccountToken(db, input) {
  const table = getTokenTable(input.type);
  const now = normalizeDate(input.now);
  const ttlMs = Number(input.ttlMs);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("ACCOUNT_TOKEN_TTL_INVALID");
  }
  const rawToken = String(input.rawToken || createRawToken());
  const id = `${input.type.replaceAll("_", "-")}-${crypto.randomUUID()}`;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const issue = db.transaction(() => {
    invalidateUserTokens(db, {
      type: input.type,
      userId: input.userId,
      consumedAt: now
    });
    db.prepare(`
      INSERT INTO ${table} (
        id, user_id, token_hash, expires_at, consumed_at, requested_ip_hash, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?)
    `).run(
      id,
      input.userId,
      hashToken(rawToken),
      expiresAt.toISOString(),
      String(input.requestedIpHash || ""),
      now.toISOString()
    );
  });
  issue();
  return {
    id,
    userId: input.userId,
    rawToken,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString()
  };
}

function consumeAccountToken(db, { type, rawToken, now = new Date() }) {
  const table = getTokenTable(type);
  const consumedAt = normalizeDate(now);
  const consume = db.transaction(() => {
    const row = db.prepare(`
      SELECT id, user_id, expires_at, created_at
      FROM ${table}
      WHERE token_hash = ? AND consumed_at IS NULL
    `).get(hashToken(rawToken));
    if (!row || Date.parse(row.expires_at) <= consumedAt.getTime()) {
      return null;
    }
    const result = db.prepare(`
      UPDATE ${table} SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL
    `).run(consumedAt.toISOString(), row.id);
    if (Number(result.changes) !== 1) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      consumedAt: consumedAt.toISOString()
    };
  });
  return consume();
}

module.exports = {
  TOKEN_TABLES,
  createRawToken,
  hashToken,
  issueAccountToken,
  consumeAccountToken,
  invalidateUserTokens
};

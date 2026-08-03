const { ROLE_IDS, listUserRoles } = require("./roles");

function nowIso() {
  return new Date().toISOString();
}

function mapUser(db, row, addresses = []) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash || row.password,
    passwordSalt: row.password_salt,
    emailVerifiedAt: row.email_verified_at || null,
    passwordChangedAt: row.password_changed_at || null,
    createdAt: row.created_at,
    roles: listUserRoles(db, row.id),
    addresses
  };
}

function listAddresses(db, userId) {
  return db.prepare("SELECT id, payload, is_default FROM addresses WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId)
    .map((row) => ({
      id: row.id,
      ...JSON.parse(row.payload),
      isDefault: Boolean(row.is_default)
    }));
}

function findUserByEmail(db, email) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  return row ? mapUser(db, row, listAddresses(db, row.id)) : null;
}

function findUserById(db, userId) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return row ? mapUser(db, row, listAddresses(db, row.id)) : null;
}

function countUsers(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
}

function listAdminUsers(db, { q = "", role = "", page = 1, pageSize = 20 } = {}) {
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 20));
  const clauses = [];
  const params = [];
  const query = String(q || "").trim().toLowerCase();
  const roleId = String(role || "").trim();
  if (query) {
    clauses.push("(LOWER(users.name) LIKE ? OR LOWER(users.email) LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (roleId) {
    clauses.push("user_roles.role_id = ?");
    params.push(ROLE_IDS.includes(roleId) ? roleId : "__unknown_role__");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    LEFT JOIN user_roles ON user_roles.user_id = users.id
    ${where}
  `).get(...params).count;
  const rows = db.prepare(`
    SELECT users.id, users.name, users.email, users.created_at, users.updated_at, user_roles.role_id
    FROM users
    LEFT JOIN user_roles ON user_roles.user_id = users.id
    ${where}
    ORDER BY users.updated_at DESC, users.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize);

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      roles: row.role_id ? [row.role_id] : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      totalPages: Math.ceil(total / normalizedPageSize)
    }
  };
}

function createUser(db, user, {
  roleId = "customer",
  assignedByUserId = null,
  emailVerifiedAt = null
} = {}) {
  const timestamp = user.createdAt || nowIso();
  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (
        id, name, email, password, password_hash, password_salt,
        email_verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.name,
      user.email,
      user.passwordHash,
      user.passwordHash,
      user.passwordSalt,
      emailVerifiedAt,
      timestamp,
      timestamp
    );
    db.prepare(`
      INSERT INTO user_roles (user_id, role_id, assigned_by_user_id, assigned_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, roleId, assignedByUserId, timestamp);
  });
  create();
  return findUserById(db, user.id);
}

function markUserEmailVerified(db, userId, verifiedAt = new Date()) {
  const timestamp = (verifiedAt instanceof Date ? verifiedAt : new Date(verifiedAt)).toISOString();
  db.prepare(`
    UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?
  `).run(timestamp, timestamp, userId);
  return findUserById(db, userId);
}

function updateUserPassword(db, userId, { passwordHash, passwordSalt, changedAt = new Date() }) {
  const timestamp = (changedAt instanceof Date ? changedAt : new Date(changedAt)).toISOString();
  db.prepare(`
    UPDATE users
    SET password = ?, password_hash = ?, password_salt = ?,
        password_changed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(passwordHash, passwordHash, passwordSalt, timestamp, timestamp, userId);
  return findUserById(db, userId);
}

function deleteUserSessions(db, userId) {
  return Number(db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes);
}

function createSession(db, session) {
  const timestamp = session.createdAt || nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO sessions (id, user_id, created_at, updated_at, expires_at)
    VALUES (?, ?, COALESCE((SELECT created_at FROM sessions WHERE id = ?), ?), ?, ?)
  `).run(
    session.id,
    session.userId || null,
    session.id,
    timestamp,
    timestamp,
    session.expiresAt || null
  );
  return session;
}

function findSession(db, sessionId) {
  const row = db.prepare(`
    SELECT id, user_id AS userId, created_at AS createdAt, expires_at AS expiresAt
    FROM sessions
    WHERE id = ?
  `).get(sessionId);
  return row || null;
}

function deleteSession(db, sessionId) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function replaceAddresses(db, userId, addresses) {
  const timestamp = nowIso();
  const insert = db.prepare(`
    INSERT INTO addresses (id, user_id, payload, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM addresses WHERE user_id = ?").run(userId);
    addresses.forEach((address) => {
      insert.run(
        address.id,
        userId,
        JSON.stringify(address),
        address.isDefault ? 1 : 0,
        timestamp,
        timestamp
      );
    });
  });
  transaction();

  return findUserById(db, userId);
}

module.exports = {
  findUserByEmail,
  findUserById,
  countUsers,
  listAdminUsers,
  createUser,
  deleteUserSessions,
  markUserEmailVerified,
  updateUserPassword,
  createSession,
  findSession,
  deleteSession,
  replaceAddresses,
  listAddresses
};

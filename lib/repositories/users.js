const { listUserRoles } = require("./roles");

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

function createUser(db, user, { roleId = "customer", assignedByUserId = null } = {}) {
  const timestamp = user.createdAt || nowIso();
  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (
        id, name, email, password, password_hash, password_salt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.name,
      user.email,
      user.passwordHash,
      user.passwordHash,
      user.passwordSalt,
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
  createUser,
  createSession,
  findSession,
  deleteSession,
  replaceAddresses,
  listAddresses
};

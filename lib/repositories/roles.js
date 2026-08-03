const crypto = require("node:crypto");

const ROLE_IDS = Object.freeze([
  "super_admin",
  "operator",
  "customer_service",
  "warehouse",
  "customer"
]);

function validation(statusCode, code, message) {
  return { validationError: { statusCode, code, message } };
}

function listUserRoles(db, userId) {
  return db.prepare("SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id")
    .all(userId)
    .map((row) => row.role_id);
}

function countUsersWithRole(db, roleId) {
  return db.prepare("SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?")
    .get(roleId).count;
}

function assignUserRole(db, input = {}) {
  const assign = db.transaction(() => {
    const actorUserId = String(input.actorUserId || "").trim();
    const targetUserId = String(input.targetUserId || "").trim();
    const roleId = String(input.roleId || "").trim();
    const reason = String(input.reason || "").trim();
    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetUserId);
    const actor = actorUserId
      ? db.prepare("SELECT id FROM users WHERE id = ?").get(actorUserId)
      : null;

    if (!target || !actor) {
      return validation(404, "ADMIN_USER_NOT_FOUND", "Admin user was not found.");
    }
    if (!ROLE_IDS.includes(roleId)) {
      return validation(400, "ROLE_INVALID", "Role is invalid.");
    }
    if (!reason) {
      return validation(400, "ROLE_REASON_REQUIRED", "A role assignment reason is required.");
    }

    const current = db.prepare("SELECT role_id FROM user_roles WHERE user_id = ?").get(targetUserId);
    const previousRoleId = current?.role_id || null;
    const assignment = { targetUserId, previousRoleId, roleId };
    if (previousRoleId === roleId) {
      return { assignment, replayed: true };
    }
    if (previousRoleId === "super_admin"
      && roleId !== "super_admin"
      && countUsersWithRole(db, "super_admin") <= 1) {
      return validation(409, "LAST_SUPER_ADMIN_REQUIRED", "The last super administrator cannot be reassigned.");
    }

    const timestamp = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_roles (user_id, role_id, assigned_by_user_id, assigned_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        role_id = excluded.role_id,
        assigned_by_user_id = excluded.assigned_by_user_id,
        assigned_at = excluded.assigned_at
    `).run(targetUserId, roleId, actorUserId, timestamp);
    db.prepare(`
      INSERT INTO role_assignment_events (
        id, actor_user_id, target_user_id, previous_role_id, next_role_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `role-assignment-${crypto.randomUUID()}`,
      actorUserId,
      targetUserId,
      previousRoleId,
      roleId,
      reason,
      timestamp
    );
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId);
    return { assignment, replayed: false };
  });

  return assign();
}

function listRoleAssignmentEvents(db, { userId = "", page = 1, pageSize = 20 } = {}) {
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 20));
  const normalizedUserId = String(userId || "").trim();
  const where = normalizedUserId ? "WHERE events.target_user_id = ?" : "";
  const params = normalizedUserId ? [normalizedUserId] : [];
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM role_assignment_events events ${where}
  `).get(...params).count;
  const rows = db.prepare(`
    SELECT events.*, actor.name AS actor_name, actor.email AS actor_email,
      target.name AS target_name, target.email AS target_email
    FROM role_assignment_events events
    LEFT JOIN users actor ON actor.id = events.actor_user_id
    JOIN users target ON target.id = events.target_user_id
    ${where}
    ORDER BY events.created_at DESC, events.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize);

  return {
    items: rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name || "",
      actorEmail: row.actor_email || "",
      targetUserId: row.target_user_id,
      targetName: row.target_name,
      targetEmail: row.target_email,
      previousRoleId: row.previous_role_id,
      nextRoleId: row.next_role_id,
      reason: row.reason,
      createdAt: row.created_at
    })),
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      totalPages: Math.ceil(total / normalizedPageSize)
    }
  };
}

module.exports = {
  ROLE_IDS,
  listUserRoles,
  countUsersWithRole,
  assignUserRole,
  listRoleAssignmentEvents
};

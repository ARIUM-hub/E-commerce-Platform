const {
  createPasswordSalt,
  hashPassword,
  verifyPassword
} = require("../auth/passwords");
const { getPermissionsForRoles } = require("../auth/permissions");
const { countUsersWithRole } = require("../repositories/roles");
const {
  countUsers,
  createUser,
  findUserByEmail,
  findUserById
} = require("../repositories/users");

const DEVELOPMENT_ADMIN_EMAIL = "admin@socks.test";
const DEVELOPMENT_ADMIN_PASSWORD = "demo1234";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createPublicUser(user) {
  if (!user) {
    return null;
  }
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    roles,
    permissions: getPermissionsForRoles(roles)
  };
}

function buildUserId(db) {
  let sequence = countUsers(db) + 1;
  let userId = `user-${String(sequence).padStart(4, "0")}`;
  while (findUserById(db, userId)) {
    sequence += 1;
    userId = `user-${String(sequence).padStart(4, "0")}`;
  }
  return userId;
}

function validateAuthPayload(body = {}, mode) {
  const missingFields = [];
  if (mode === "register" && !String(body.name || "").trim()) missingFields.push("name");
  if (!normalizeEmail(body.email)) missingFields.push("email");
  if (!String(body.password || "").trim()) missingFields.push("password");
  return missingFields;
}

function validationError(statusCode, code, message, details = {}) {
  return { validationError: { statusCode, code, message, details } };
}

function createAuthService(config = {}) {
  function registerUser(db, body = {}) {
    const missingFields = validateAuthPayload(body, "register");
    if (missingFields.length) {
      return validationError(
        400,
        "AUTH_VALIDATION_FAILED",
        "Registration information is incomplete.",
        { fields: missingFields }
      );
    }

    const email = normalizeEmail(body.email);
    if (findUserByEmail(db, email)) {
      return validationError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
    }
    const passwordSalt = createPasswordSalt();
    return {
      user: createUser(db, {
        id: buildUserId(db),
        name: String(body.name).trim(),
        email,
        passwordHash: hashPassword(String(body.password), passwordSalt),
        passwordSalt,
        createdAt: new Date().toISOString(),
        addresses: []
      })
    };
  }

  function authenticateUser(db, body = {}) {
    const missingFields = validateAuthPayload(body, "login");
    if (missingFields.length) {
      return validationError(400, "AUTH_VALIDATION_FAILED", "Login information is incomplete.", {
        fields: missingFields
      });
    }
    const user = findUserByEmail(db, normalizeEmail(body.email));
    if (!user || !verifyPassword(String(body.password), user)) {
      return validationError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    return { user };
  }

  function bootstrapAdmin(db) {
    if (countUsersWithRole(db, "super_admin") > 0) {
      const existingRole = db.prepare(`
        SELECT user_id FROM user_roles WHERE role_id = 'super_admin' ORDER BY assigned_at ASC LIMIT 1
      `).get();
      return { user: findUserById(db, existingRole.user_id), replayed: true };
    }

    const isProduction = config.nodeEnv === "production";
    const email = isProduction
      ? normalizeEmail(config.bootstrapAdminEmail)
      : DEVELOPMENT_ADMIN_EMAIL;
    const password = isProduction
      ? String(config.bootstrapAdminPassword || "")
      : DEVELOPMENT_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required");
    }

    const occupied = findUserByEmail(db, email);
    if (occupied && isProduction) {
      throw new Error("BOOTSTRAP_ADMIN_EMAIL is already registered without the super_admin role");
    }

    const passwordSalt = createPasswordSalt();
    if (occupied) {
      const timestamp = new Date().toISOString();
      db.prepare(`
        UPDATE users SET password = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?
      `).run(
        hashPassword(password, passwordSalt),
        hashPassword(password, passwordSalt),
        passwordSalt,
        timestamp,
        occupied.id
      );
      db.prepare(`
        UPDATE user_roles SET role_id = 'super_admin', assigned_by_user_id = NULL, assigned_at = ?
        WHERE user_id = ?
      `).run(timestamp, occupied.id);
      return { user: findUserById(db, occupied.id), replayed: false };
    }

    return {
      user: createUser(db, {
        id: buildUserId(db),
        name: "Socks Store Admin",
        email,
        passwordHash: hashPassword(password, passwordSalt),
        passwordSalt,
        createdAt: new Date().toISOString(),
        addresses: []
      }, { roleId: "super_admin" }),
      replayed: false
    };
  }

  return {
    registerUser,
    authenticateUser,
    bootstrapAdmin
  };
}

module.exports = {
  createAuthService,
  createPublicUser,
  normalizeEmail,
  validateAuthPayload
};

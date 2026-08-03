const { hasPermission } = require("./permissions");

function createAuthorization({ getSessionContext, sendError }) {
  async function requireUser(request, response, errorOptions = {}) {
    const { user } = await getSessionContext(request);
    if (!user) {
      sendError(
        response,
        401,
        errorOptions.code || "AUTH_REQUIRED",
        errorOptions.message || "Authentication is required."
      );
      return null;
    }
    return user;
  }

  async function requirePermission(permission, request, response) {
    const user = await requireUser(request, response);
    if (!user) {
      return null;
    }
    if (!hasPermission(user.roles, permission)) {
      sendError(response, 403, "PERMISSION_DENIED", "Permission is required.", {
        requiredPermission: permission
      });
      return null;
    }
    return user;
  }

  return {
    requireUser,
    requirePermission
  };
}

module.exports = {
  createAuthorization
};

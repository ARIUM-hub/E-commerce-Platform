const { PERMISSIONS } = require("../auth/permissions");

function parseRoleAssignmentPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readBodyOrRespond(request, response, services) {
  try {
    return { body: await services.readRequestBody(request) };
  } catch (error) {
    if (services.handleRequestBodyError(error, response)) {
      return { handled: true };
    }
    throw error;
  }
}

function registerAdminUserRoutes(router, services) {
  router.get("/api/admin/users", async ({ request, requestUrl, response, sendJson }) => {
    const user = await services.requirePermission(PERMISSIONS.USERS_READ, request, response);
    if (!user) return;
    const result = services.withDatabase((db) => services.listAdminUsers(db, {
      q: requestUrl.searchParams.get("q") || "",
      role: requestUrl.searchParams.get("role") || "",
      page: requestUrl.searchParams.get("page") || 1,
      pageSize: requestUrl.searchParams.get("pageSize") || 20
    }));
    sendJson(response, 200, { ok: true, ...result });
  });

  router.add("PATCH", /^\/api\/admin\/users\/[^/]+\/role$/, async ({
    request,
    requestUrl,
    response,
    sendJson,
    sendError
  }) => {
    const actor = await services.requirePermission(PERMISSIONS.USERS_ROLES_MANAGE, request, response);
    if (!actor) return;
    const parsed = await readBodyOrRespond(request, response, services);
    if (parsed.handled) return;
    const targetUserId = parseRoleAssignmentPath(requestUrl.pathname);
    const result = services.withDatabase((db) => {
      const assignmentResult = services.assignUserRole(db, {
        actorUserId: actor.id,
        targetUserId,
        roleId: parsed.body.role,
        reason: parsed.body.reason
      });
      if (assignmentResult.validationError) return assignmentResult;
      return {
        ...assignmentResult,
        user: services.createPublicUser(services.findUserById(db, targetUserId))
      };
    });
    if (result.validationError) {
      const error = result.validationError;
      sendError(response, error.statusCode || 400, error.code, error.message);
      return;
    }
    sendJson(response, 200, { ok: true, ...result });
  });

  router.get("/api/admin/role-assignment-events", async ({
    request,
    requestUrl,
    response,
    sendJson
  }) => {
    const user = await services.requirePermission(PERMISSIONS.AUDIT_READ, request, response);
    if (!user) return;
    const result = services.withDatabase((db) => services.listRoleAssignmentEvents(db, {
      userId: requestUrl.searchParams.get("userId") || "",
      page: requestUrl.searchParams.get("page") || 1,
      pageSize: requestUrl.searchParams.get("pageSize") || 20
    }));
    sendJson(response, 200, { ok: true, ...result });
  });
}

module.exports = {
  registerAdminUserRoutes
};

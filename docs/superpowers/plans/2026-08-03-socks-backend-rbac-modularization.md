# 后端路由模块化与 RBAC 权限体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `server.js` 收缩为应用启动和依赖装配入口，并用数据库角色、细粒度权限、角色管理 API 和审计日志替代管理员邮箱与 `x-demo-admin` 绕过。

**Architecture:** 使用固定权限目录和数据库角色分配实现 RBAC，所有后台路由通过统一 `requirePermission()` 授权。把会话、认证、购物车和订单编排下沉到领域服务，再按认证、购物车、账户、交易和后台领域迁移路由，最终由 `lib/app.js` 统一注册并由精简后的 `server.js` 启动。

**Tech Stack:** Node.js 原生 HTTP、Node SQLite、原生浏览器 JavaScript、Playwright API/UI 测试。

---

## File Map

### Authorization and persistence

- Modify: `lib/database.js`：增加 `0013_rbac_authorization` migration、五个内置角色和已有用户回填。
- Create: `lib/auth/permissions.js`：权限目录、角色权限映射、默认拒绝判断。
- Create: `lib/auth/passwords.js`：现有加盐密码哈希逻辑的独立模块。
- Create: `lib/repositories/roles.js`：角色读取、分配、最后超级管理员保护和角色审计。
- Modify: `lib/repositories/users.js`：公开用户附带角色，创建用户时分配默认角色，支持后台账号分页。
- Modify: `lib/config.js`：解析生产 bootstrap 管理员配置。
- Modify: `.env.example`：记录 bootstrap 环境变量。

### Services and application boundary

- Create: `lib/services/session-service.js`：会话 Cookie、当前用户上下文、会话创建与失效。
- Create: `lib/services/auth-service.js`：注册、登录校验和环境 bootstrap 管理员。
- Create: `lib/services/catalog-service.js`：商品筛选、排序、分页、推荐和本地化 payload。
- Create: `lib/services/cart-service.js`：活动购物车读取/写入、合并、库存校验和购物车响应。
- Create: `lib/services/checkout-service.js`：订单输入、订单项、配送与结算编排 helper。
- Create: `lib/auth/authorization.js`：`requireUser()` 和 `requirePermission()`。
- Create: `lib/routes/route-helpers.js`：请求体解析和 Repository 结果响应。
- Create: `lib/app.js`：注册全部领域路由并处理静态资源、404、405 和未知异常。

### Route modules

- Create: `lib/routes/auth-routes.js`
- Create: `lib/routes/cart-routes.js`
- Create: `lib/routes/account-routes.js`
- Create: `lib/routes/checkout-routes.js`
- Create: `lib/routes/order-routes.js`
- Create: `lib/routes/payment-routes.js`
- Create: `lib/routes/fulfillment-routes.js`
- Create: `lib/routes/return-routes.js`
- Create: `lib/routes/admin-product-routes.js`
- Create: `lib/routes/admin-dashboard-routes.js`
- Create: `lib/routes/admin-inventory-routes.js`
- Create: `lib/routes/admin-order-routes.js`
- Create: `lib/routes/admin-return-routes.js`
- Create: `lib/routes/admin-marketing-routes.js`
- Create: `lib/routes/admin-payment-routes.js`
- Create: `lib/routes/admin-user-routes.js`
- Create: `lib/routes/trust-routes.js`
- Create: `lib/routes/test-routes.js`
- Modify: `lib/routes/admin-analytics-routes.js`
- Modify: `lib/routes/admin-review-routes.js`
- Modify: `lib/routes/admin-support-routes.js`
- Modify: `lib/http/router.js`：增加 `patch()` 和 `delete()` 注册助手。

### Entry point, frontend, tests

- Modify: `server.js`：删除业务路由、路径解析、邮箱白名单和请求头绕过，只保留启动装配。
- Modify: `public/js/storefront-app.js`：使用会话权限控制后台入口和操作，不再发送 `x-demo-admin`。
- Modify: `tests/api.spec.js`：migration、bootstrap、权限矩阵、角色管理和路由契约测试。
- Modify: `tests/socks-product-list.spec.js`：按角色登录和后台可见性测试。
- Modify: `playwright.config.js`：为测试服务器提供明确 bootstrap 配置。

## Execution Notes

- 当前分支已有未推送设计提交 `d509fb0`；不得重置、改写或丢弃已有分析看板与营销提交。
- 所有文本文件保持 UTF-8，中文直接写入，不使用 `\uXXXX`。
- 所有实现遵循 TDD：先写测试、确认按预期失败，再写最小实现。
- Playwright 固定 `--workers=1`，不启动后台智能体、压力测试或并行服务。
- 每次 UI/API 测试后恢复明确修改的 JSON fixture，只删除本轮测试明确生成的上传文件。
- 旧路由迁移到模块后必须在同一提交删除 `server.js` 中对应分支，禁止双实现长期并存。
- `x-demo-admin` 只能在删除绕过的红灯测试中作为恶意输入出现，生产代码和前端代码不得读取或发送它。

### Task 1: RBAC 数据库 migration

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写角色表、回填和幂等失败测试**

在 migration 测试区域增加：

```js
test("initializes RBAC roles assignments and audit storage idempotently", () => {
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  db.prepare(`INSERT INTO users
    (id, name, email, password, password_hash, password_salt, created_at, updated_at)
    VALUES ('legacy-user', 'Legacy', 'legacy@example.com', 'hash', 'hash', 'salt', ?, ?)`)
    .run("2026-08-03T00:00:00.000Z", "2026-08-03T00:00:00.000Z");
  db.prepare("DELETE FROM schema_migrations WHERE id = '0013_rbac_authorization'").run();
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });

  expect(db.prepare("SELECT id FROM roles ORDER BY id").all().map((row) => row.id)).toEqual([
    "customer", "customer_service", "operator", "super_admin", "warehouse"
  ]);
  expect(db.prepare("SELECT role_id FROM user_roles WHERE user_id = 'legacy-user'").get())
    .toEqual({ role_id: "customer" });
  expect(db.prepare("PRAGMA index_list(role_assignment_events)").all().map((row) => row.name))
    .toEqual(expect.arrayContaining(["idx_role_assignment_target_time", "idx_role_assignment_actor_time"]));
  expect(db.prepare("SELECT COUNT(*) AS count FROM roles").get().count).toBe(5);
  expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '0013_rbac_authorization'").get())
    .toEqual({ id: "0013_rbac_authorization" });
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "RBAC roles assignments" --workers=1`

Expected: FAIL，`roles` 表或 migration 不存在。

- [ ] **Step 3: 实现 migration**

在 `lib/database.js` 增加：

```js
const BUILT_IN_ROLES = [
  ["super_admin", "Super administrator"],
  ["operator", "Store operator"],
  ["customer_service", "Customer service"],
  ["warehouse", "Warehouse"],
  ["customer", "Customer"]
];

function ensureAuthorizationTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      assigned_by_user_id TEXT,
      assigned_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS role_assignment_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      target_user_id TEXT NOT NULL,
      previous_role_id TEXT,
      next_role_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_role_assignment_target_time
      ON role_assignment_events(target_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_role_assignment_actor_time
      ON role_assignment_events(actor_user_id, created_at DESC);
  `);

  const timestamp = new Date().toISOString();
  const insertRole = db.prepare("INSERT OR IGNORE INTO roles (id, name, created_at) VALUES (?, ?, ?)");
  BUILT_IN_ROLES.forEach(([id, name]) => insertRole.run(id, name, timestamp));
  db.prepare(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by_user_id, assigned_at)
    SELECT id, 'customer', NULL, ? FROM users
  `).run(timestamp);
}
```

在 migrations 末尾注册 `0013_rbac_authorization`，调用 `ensureAuthorizationTables(db)`。

- [ ] **Step 4: 运行 migration 回归**

Run: `npm run test:api -- --grep "RBAC roles assignments|schema migrations|idempotently" --workers=1`

Expected: 新 migration 与既有 migration 幂等测试全部 PASS。

- [ ] **Step 5: 提交 migration**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add RBAC authorization schema"
```

### Task 2: 固定权限目录和角色矩阵

**Files:**
- Create: `lib/auth/permissions.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写权限矩阵失败测试**

```js
test("maps fixed RBAC roles to least-privilege permissions", () => {
  const { PERMISSIONS, getPermissionsForRoles, hasPermission } = require("../lib/auth/permissions");
  const superPermissions = getPermissionsForRoles(["super_admin"]);
  expect(superPermissions).toEqual(expect.arrayContaining(Object.values(PERMISSIONS)));
  expect(hasPermission(["operator"], PERMISSIONS.ORDERS_REFUND)).toBe(true);
  expect(hasPermission(["operator"], PERMISSIONS.USERS_ROLES_MANAGE)).toBe(false);
  expect(hasPermission(["customer_service"], PERMISSIONS.SUPPORT_REPLY)).toBe(true);
  expect(hasPermission(["customer_service"], PERMISSIONS.INVENTORY_WRITE)).toBe(false);
  expect(hasPermission(["warehouse"], PERMISSIONS.ORDERS_SHIP)).toBe(true);
  expect(hasPermission(["warehouse"], PERMISSIONS.RETURNS_RECEIVE)).toBe(true);
  expect(hasPermission(["warehouse"], PERMISSIONS.RETURNS_REVIEW)).toBe(false);
  expect(getPermissionsForRoles(["customer"])).toEqual([]);
  expect(hasPermission(["unknown"], PERMISSIONS.ANALYTICS_READ)).toBe(false);
  expect(hasPermission(["super_admin"], "unknown.permission")).toBe(false);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "least-privilege permissions" --workers=1`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现权限目录**

创建 `lib/auth/permissions.js`，权限常量必须完整包含设计文档中的 27 个权限：

```js
const PERMISSIONS = Object.freeze({
  ANALYTICS_READ: "analytics.read",
  PRODUCTS_READ: "products.read",
  PRODUCTS_WRITE: "products.write",
  PRODUCTS_IMAGES_WRITE: "products.images.write",
  INVENTORY_READ: "inventory.read",
  INVENTORY_WRITE: "inventory.write",
  ORDERS_READ: "orders.read",
  ORDERS_STATUS_WRITE: "orders.status.write",
  ORDERS_SHIP: "orders.ship",
  ORDERS_CANCEL: "orders.cancel",
  ORDERS_REFUND: "orders.refund",
  RETURNS_READ: "returns.read",
  RETURNS_REVIEW: "returns.review",
  RETURNS_RECEIVE: "returns.receive",
  REVIEWS_READ: "reviews.read",
  REVIEWS_MODERATE: "reviews.moderate",
  REVIEWS_REPLY: "reviews.reply",
  SUPPORT_READ: "support.read",
  SUPPORT_ASSIGN: "support.assign",
  SUPPORT_REPLY: "support.reply",
  MARKETING_READ: "marketing.read",
  MARKETING_WRITE: "marketing.write",
  PAYMENTS_READ: "payments.read",
  PAYMENTS_CONFIGURE: "payments.configure",
  USERS_READ: "users.read",
  USERS_ROLES_MANAGE: "users.roles.manage",
  AUDIT_READ: "audit.read"
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));
const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ALL_PERMISSIONS,
  operator: Object.freeze([
    PERMISSIONS.ANALYTICS_READ, PERMISSIONS.PRODUCTS_READ, PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.PRODUCTS_IMAGES_WRITE, PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_STATUS_WRITE, PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_REFUND, PERMISSIONS.RETURNS_READ, PERMISSIONS.RETURNS_REVIEW,
    PERMISSIONS.MARKETING_READ, PERMISSIONS.MARKETING_WRITE, PERMISSIONS.PAYMENTS_READ
  ]),
  customer_service: Object.freeze([
    PERMISSIONS.ORDERS_READ, PERMISSIONS.RETURNS_READ, PERMISSIONS.REVIEWS_READ,
    PERMISSIONS.REVIEWS_MODERATE, PERMISSIONS.REVIEWS_REPLY, PERMISSIONS.SUPPORT_READ,
    PERMISSIONS.SUPPORT_ASSIGN, PERMISSIONS.SUPPORT_REPLY
  ]),
  warehouse: Object.freeze([
    PERMISSIONS.PRODUCTS_READ, PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_SHIP, PERMISSIONS.RETURNS_READ,
    PERMISSIONS.RETURNS_RECEIVE
  ]),
  customer: Object.freeze([])
});
```

实现 `getPermissionsForRoles(roles)`：只接受 `ALL_PERMISSIONS` 中的权限并去重排序；实现 `hasPermission(roles, permission)`：未知权限始终返回 false。

- [ ] **Step 4: 运行权限测试确认转绿**

Run: `npm run test:api -- --grep "least-privilege permissions" --workers=1`

Expected: PASS。

- [ ] **Step 5: 提交权限目录**

```powershell
git add lib/auth/permissions.js tests/api.spec.js
git commit -m "feat: define least-privilege RBAC permissions"
```

### Task 3: 角色 Repository、默认角色和角色审计

**Files:**
- Create: `lib/repositories/roles.js`
- Modify: `lib/repositories/users.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写角色分配事务失败测试**

```js
test("assigns roles atomically audits changes and protects the last super admin", () => {
  const { createSession, createUser, findUserById } = require("../lib/repositories/users");
  const { assignUserRole, listRoleAssignmentEvents } = require("../lib/repositories/roles");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const base = { passwordHash: "hash", passwordSalt: "salt", addresses: [] };
  const root = createUser(db, { ...base, id: "root", name: "Root", email: "root@example.com" }, { roleId: "super_admin" });
  const staff = createUser(db, { ...base, id: "staff", name: "Staff", email: "staff@example.com" });
  createSession(db, {
    id: "staff-session",
    userId: staff.id,
    createdAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2026-08-17T00:00:00.000Z"
  });

  const assigned = assignUserRole(db, {
    actorUserId: root.id,
    targetUserId: staff.id,
    roleId: "warehouse",
    reason: "负责仓库履约"
  });
  expect(assigned.assignment).toMatchObject({ targetUserId: staff.id, roleId: "warehouse" });
  expect(findUserById(db, staff.id).roles).toEqual(["warehouse"]);
  expect(listRoleAssignmentEvents(db, { userId: staff.id }).items).toHaveLength(1);
  expect(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(staff.id).count).toBe(0);

  const blocked = assignUserRole(db, {
    actorUserId: root.id,
    targetUserId: root.id,
    roleId: "customer",
    reason: "测试最后管理员保护"
  });
  expect(blocked.validationError.code).toBe("LAST_SUPER_ADMIN_REQUIRED");
  db.close();
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "assigns roles atomically" --workers=1`

Expected: FAIL，角色 Repository 不存在或 `createUser` 不接受角色选项。

- [ ] **Step 3: 实现角色 Repository**

`lib/repositories/roles.js` 导出：

```js
const crypto = require("node:crypto");
const ROLE_IDS = Object.freeze(["super_admin", "operator", "customer_service", "warehouse", "customer"]);

function listUserRoles(db, userId) {
  return db.prepare("SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id")
    .all(userId).map((row) => row.role_id);
}

function countUsersWithRole(db, roleId) {
  return db.prepare("SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?").get(roleId).count;
}
```

实现 `assignUserRole(db, input)`：直接查询目标用户是否存在，避免反向导入 `users.js` 形成循环依赖；在同一事务中校验合法角色和非空 reason、检查最后一个超级管理员、更新 `user_roles`、写入 `role_assignment_events` 并删除目标用户 `sessions`。返回 `{ assignment: { targetUserId, previousRoleId, roleId }, replayed }`。相同角色 `replayed: true`，不新增事件也不删除会话。验证错误使用：`ADMIN_USER_NOT_FOUND`、`ROLE_INVALID`、`ROLE_REASON_REQUIRED`、`LAST_SUPER_ADMIN_REQUIRED`。

实现 `listRoleAssignmentEvents(db, { userId = "", page = 1, pageSize = 20 })`，返回 `{ items, pagination }`。

- [ ] **Step 4: 让用户 Repository 持久化角色**

修改 `mapUser(db, row, addresses)`，通过 `listUserRoles(db, row.id)` 返回 `roles`。把 `createUser(db, user, { roleId = "customer", assignedByUserId = null } = {})` 改为事务，在写入用户后写入 `user_roles`；所有 `findUserByEmail/findUserById` 调整为传入 db 的新签名。

- [ ] **Step 5: 运行角色和用户回归**

Run: `npm run test:api -- --grep "assigns roles atomically|registers a user|persists registered users" --workers=1`

Expected: 新角色测试与既有注册持久化测试 PASS。

- [ ] **Step 6: 提交角色 Repository**

```powershell
git add lib/repositories/roles.js lib/repositories/users.js tests/api.spec.js
git commit -m "feat: persist and audit user role assignments"
```

### Task 4: 会话、密码与授权服务

**Files:**
- Create: `lib/auth/passwords.js`
- Create: `lib/services/session-service.js`
- Create: `lib/auth/authorization.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写授权服务失败测试**

```js
test("requires authenticated users and exact permissions", async () => {
  const responses = [];
  const { createAuthorization } = require("../lib/auth/authorization");
  const authorization = createAuthorization({
    getSessionContext: async (request) => request.context,
    sendError: (_response, statusCode, code, message, details) => responses.push({ statusCode, code, message, details })
  });
  expect(await authorization.requirePermission("orders.ship", { context: { user: null } }, {})).toBeNull();
  expect(responses.at(-1).code).toBe("AUTH_REQUIRED");
  expect(await authorization.requirePermission("orders.ship", {
    context: { user: { id: "customer", roles: ["customer"] } }
  }, {})).toBeNull();
  expect(responses.at(-1)).toMatchObject({
    statusCode: 403,
    code: "PERMISSION_DENIED",
    details: { requiredPermission: "orders.ship" }
  });
  await expect(authorization.requirePermission("orders.ship", {
    context: { user: { id: "warehouse", roles: ["warehouse"] } }
  }, {})).resolves.toMatchObject({ id: "warehouse" });
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "exact permissions" --workers=1`

Expected: FAIL，授权模块不存在。

- [ ] **Step 3: 提取密码 helper**

把 `server.js` 中 `createPasswordSalt/hashPassword/verifyPassword` 原样迁移到 `lib/auth/passwords.js` 并导出，保持 `sha256:<digest>` 格式兼容已有用户。

- [ ] **Step 4: 创建会话服务**

`createSessionService({ withDatabase, sessionCookieName, sessionMaxAgeSeconds })` 返回：

```js
{
  getSessionContext,
  createUserSession,
  removeSession,
  createSessionId,
  createSessionCookie,
  createExpiredSessionCookie
}
```

从 `server.js` 迁移同名逻辑；`getSessionContext()` 必须通过已包含 `roles` 的 `findUserById()` 读取当前用户。

- [ ] **Step 5: 创建授权服务**

`createAuthorization({ getSessionContext, sendError })` 返回 `requireUser` 和 `requirePermission`。`requirePermission` 先认证，再调用 `hasPermission(user.roles, permission)`；权限不足返回：

```js
sendError(response, 403, "PERMISSION_DENIED", "Permission is required.", {
  requiredPermission: permission
});
```

未知权限也必须拒绝。

- [ ] **Step 6: 临时接回 server.js 并转绿**

在路由全部迁移前，`server.js` 导入这些模块并用服务实例替代本地密码、会话、`requireUser` helper。暂时保留 `requireAdmin` 只作为兼容适配器，但其实现改为调用 `requirePermission("analytics.read", ...)`，后续 Task 7 删除。

Run: `npm run test:api -- --grep "exact permissions|registers a user|logs in|logs out" --workers=1`

Expected: 授权、注册、登录、退出测试 PASS。

- [ ] **Step 7: 提交认证基础服务**

```powershell
git add lib/auth/passwords.js lib/auth/authorization.js lib/services/session-service.js server.js tests/api.spec.js
git commit -m "feat: centralize session and permission guards"
```

### Task 5: 环境 bootstrap 超级管理员

**Files:**
- Modify: `lib/config.js`
- Create: `lib/services/auth-service.js`
- Modify: `.env.example`
- Modify: `server.js`
- Modify: `playwright.config.js`
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写配置和 bootstrap 失败测试**

```js
test("bootstraps administrators safely by environment", () => {
  const { createAuthService } = require("../lib/services/auth-service");
  const db = createDatabase(testDbFile);
  initializeDatabase(db, { productsSeedFile: path.join(__dirname, "fixtures", "test-data", "products.json") });
  const development = createAuthService({ nodeEnv: "development" });
  const created = development.bootstrapAdmin(db);
  expect(created.user).toMatchObject({ email: "admin@socks.test", roles: ["super_admin"] });
  expect(development.bootstrapAdmin(db).replayed).toBe(true);

  db.prepare("DELETE FROM users").run();
  const productionMissing = createAuthService({ nodeEnv: "production", bootstrapAdminEmail: "", bootstrapAdminPassword: "" });
  expect(() => productionMissing.bootstrapAdmin(db)).toThrow("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required");
  db.close();
});
```

再增加“生产 bootstrap 邮箱已被 customer 占用时抛错”和“已有 super_admin 时忽略环境变量”的测试。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "bootstraps administrators safely" --workers=1`

Expected: FAIL，auth service 不存在。

- [ ] **Step 3: 扩展配置**

`createConfig()` 增加：

```js
bootstrapAdminEmail: String(env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase(),
bootstrapAdminPassword: String(env.BOOTSTRAP_ADMIN_PASSWORD || "")
```

`.env.example` 增加注释，说明这两个值仅用于生产数据库首次创建超级管理员，不提供默认生产密码。

- [ ] **Step 4: 实现 auth service**

`createAuthService(config)` 使用 `passwords.js`、用户和角色 Repository，导出 `createPublicUser(user)` 并返回注册、登录与 `bootstrapAdmin(db)` 能力。`createPublicUser` 只返回 id、name、email、addresses、roles，以及通过 `getPermissionsForRoles(user.roles)` 计算的 permissions。把 `normalizeEmail/buildUserId/validateAuthPayload` 从 `server.js` 移入该服务。bootstrap 规则：

- `development/test` 使用 `admin@socks.test / demo1234`。
- 已有任意 `super_admin` 时返回 `{ replayed: true }`。
- 生产无超级管理员且变量缺失时抛配置错误。
- 生产 bootstrap 邮箱被非超级管理员占用时抛安全错误，不提升已有账号。
- 新用户直接以 `{ roleId: "super_admin" }` 创建。

- [ ] **Step 5: 让 reset 和启动都执行 bootstrap**

在数据库首次初始化后和 `/api/test/reset` 重建后调用 `authService.bootstrapAdmin(db)`。`playwright.config.js` 明确提供：

```js
BOOTSTRAP_ADMIN_EMAIL: "admin@socks.test",
BOOTSTRAP_ADMIN_PASSWORD: "demo1234"
```

把 `registerAdminFromUi()` 改为打开登录页并登录固定管理员；把 `registerApiUser(...admin@socks.test)` 调用迁移为 `loginApiAdmin()`：

```js
async function loginApiAdmin(request) {
  const response = await request.post("/api/auth/login", {
    data: { email: "admin@socks.test", password: "demo1234" }
  });
  expect(response.ok()).toBe(true);
  return response.headers()["set-cookie"];
}
```

- [ ] **Step 6: 运行 bootstrap 与管理员基线回归**

Run: `npm run test:api -- --grep "bootstraps administrators safely|admin summary|admin analytics" --workers=1`

Run: `npm run test:ui -- --grep "admin dashboard tabs" --workers=1`

Expected: bootstrap 和既有后台入口 PASS；管理员身份来自数据库角色。

- [ ] **Step 7: 提交 bootstrap**

```powershell
git add lib/config.js lib/services/auth-service.js .env.example server.js playwright.config.js tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "feat: bootstrap database-backed super administrators"
```

### Task 6: 后台账号、角色分配和审计 API

**Files:**
- Create: `lib/routes/admin-user-routes.js`
- Modify: `lib/repositories/users.js`
- Modify: `lib/repositories/roles.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写角色管理 API 失败测试**

```js
test("lets only super admins manage roles and invalidates target sessions", async ({ request }) => {
  const rootCookie = await loginApiAdmin(request);
  const staffCookie = await registerApiUser(request, { email: "staff@example.com" });
  const session = await request.get("/api/session", { headers: { cookie: staffCookie } });
  const staff = (await session.json()).user;

  const forbidden = await request.patch(`/api/admin/users/${staff.id}/role`, {
    headers: { cookie: staffCookie },
    data: { role: "warehouse", reason: "越权尝试" }
  });
  expect(forbidden.status()).toBe(403);
  expect((await forbidden.json()).error.code).toBe("PERMISSION_DENIED");

  const changed = await request.patch(`/api/admin/users/${staff.id}/role`, {
    headers: { cookie: rootCookie },
    data: { role: "warehouse", reason: "负责仓库履约" }
  });
  expect(changed.ok()).toBe(true);
  expect((await changed.json()).user.roles).toEqual(["warehouse"]);
  expect((await request.get("/api/session", { headers: { cookie: staffCookie } })).json())
    .resolves.toMatchObject({ authenticated: false });

  const audit = await request.get(`/api/admin/role-assignment-events?userId=${staff.id}`, {
    headers: { cookie: rootCookie }
  });
  expect((await audit.json()).items[0]).toMatchObject({
    targetUserId: staff.id,
    previousRoleId: "customer",
    nextRoleId: "warehouse",
    reason: "负责仓库履约"
  });
});
```

增加最后超级管理员降级返回 `409 LAST_SUPER_ADMIN_REQUIRED`、非法角色、空 reason、重复角色幂等和响应不含 `passwordHash/passwordSalt` 的测试。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "only super admins manage roles|last super admin" --workers=1`

Expected: FAIL，管理 API 404。

- [ ] **Step 3: 实现后台用户分页**

在用户 Repository 增加 `listAdminUsers(db, { q, role, page, pageSize })`，查询 `users` 与 `user_roles`，返回公开字段、roles 和 `{ page, pageSize, total, totalPages }`。

- [ ] **Step 4: 创建管理路由**

`registerAdminUserRoutes(router, services)` 注册：

```text
GET   /api/admin/users                         users.read
PATCH /api/admin/users/:userId/role            users.roles.manage
GET   /api/admin/role-assignment-events        audit.read
```

动态用户 ID 使用 `router.patch(/^\/api\/admin\/users\/[^/]+\/role$/, handler)`；调用 `assignUserRole()` 时 actor 使用授权返回的当前用户，成功后再通过 `findUserById()` 读取带角色的公开目标用户，避免角色 Repository 依赖用户 Repository。

- [ ] **Step 5: 注册路由并运行测试**

Run: `npm run test:api -- --grep "only super admins manage roles|last super admin|role assignment" --workers=1`

Expected: 角色管理、审计、会话失效和敏感字段隔离测试 PASS。

- [ ] **Step 6: 提交角色管理 API**

```powershell
git add lib/routes/admin-user-routes.js lib/repositories/users.js lib/repositories/roles.js server.js tests/api.spec.js
git commit -m "feat: add audited admin role management"
```

### Task 7: 既有后台模块迁移到具体权限

**Files:**
- Modify: `lib/routes/admin-analytics-routes.js`
- Modify: `lib/routes/admin-review-routes.js`
- Modify: `lib/routes/admin-support-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写既有模块权限矩阵失败测试**

创建测试 helper `assignRoleAndLogin(request, email, role)`：先注册 customer，再由超级管理员调用角色 API，最后重新登录。增加参数化测试：

```js
for (const scenario of [
  { role: "operator", path: "/api/admin/analytics?range=30d", status: 200 },
  { role: "customer_service", path: "/api/admin/analytics?range=30d", status: 403 },
  { role: "customer_service", path: "/api/admin/reviews", status: 200 },
  { role: "warehouse", path: "/api/admin/reviews", status: 403 },
  { role: "customer_service", path: "/api/admin/support/tickets", status: 200 }
]) {
  test(`${scenario.role} access to ${scenario.path}`, async ({ request }) => {
    const cookie = await assignRoleAndLogin(request, `${scenario.role}@example.com`, scenario.role);
    const response = await request.get(scenario.path, { headers: { cookie } });
    expect(response.status()).toBe(scenario.status);
  });
}
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "access to /api/admin/(analytics|reviews|support)" --workers=1`

Expected: 至少权限不足场景 FAIL，因为现有模块仍用单一 `requireAdmin`。

- [ ] **Step 3: 替换模块守卫**

权限对应：

```text
admin analytics GET                 analytics.read
admin reviews GET/detail            reviews.read
admin reviews moderate              reviews.moderate
admin reviews reply/withdraw        reviews.reply
admin support list/detail           support.read
admin support assignment/update     support.assign
admin support message               support.reply
```

把每个 `services.requireAdmin(request, response)` 改为 `services.requirePermission(PERMISSION, request, response)`，路由依赖中注入 `PERMISSIONS`。

- [ ] **Step 4: 运行既有后台模块回归**

Run: `npm run test:api -- --grep "admin analytics|admin reviews|admin support|access to /api/admin" --workers=1`

Expected: 新矩阵与既有分析、评论、客服 API 测试 PASS。

- [ ] **Step 5: 提交既有模块授权**

```powershell
git add lib/routes/admin-analytics-routes.js lib/routes/admin-review-routes.js lib/routes/admin-support-routes.js server.js tests/api.spec.js
git commit -m "feat: enforce permissions on admin modules"
```

### Task 8: 路由基础 helper 与认证路由拆分

**Files:**
- Modify: `lib/http/router.js`
- Create: `lib/routes/route-helpers.js`
- Create: `lib/routes/auth-routes.js`
- Create: `lib/routes/trust-routes.js`
- Create: `lib/routes/test-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写 router 和认证契约失败测试**

```js
test("registers PATCH and DELETE route helpers", async () => {
  const { createRouter } = require("../lib/http/router");
  const router = createRouter();
  const methods = [];
  router.patch("/resource", ({ request }) => methods.push(request.method));
  router.delete("/resource", ({ request }) => methods.push(request.method));
  await router.dispatch({ request: { method: "PATCH" }, requestUrl: new URL("http://test/resource") });
  await router.dispatch({ request: { method: "DELETE" }, requestUrl: new URL("http://test/resource") });
  expect(methods).toEqual(["PATCH", "DELETE"]);
});
```

扩展注册、登录、退出和 `/api/session` 既有测试，断言公开用户包含 `roles`、`permissions` 且不含密码字段。

- [ ] **Step 2: 运行测试确认 router 红灯**

Run: `npm run test:api -- --grep "PATCH and DELETE route helpers" --workers=1`

Expected: FAIL，`router.patch` 不存在。

- [ ] **Step 3: 实现 route helper**

`router.js` 增加 `patch(pathname, handler)` 和 `deleteRoute(pathname, handler)`，对外属性名为 `delete`。`route-helpers.js` 导出：

```js
async function readBodyOrRespond(request, response, services) { /* 复用 handleRequestBodyError */ }
function sendRepositoryResult(response, sendJson, sendError, result, statusCode = 200) { /* 标准 validationError */ }
```

- [ ] **Step 4: 创建 auth routes**

迁移以下路径及当前响应结构：

```text
GET  /api/session
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
```

`auth-routes.js` 依赖仅包含 auth service、session service、用户 Repository、活动购物车合并、`createPublicUser`、请求体和响应 helper。注册用户必须默认创建 `customer` 角色。

- [ ] **Step 5: 迁移低耦合 trust 和 test 路由**

`trust-routes.js` 注册 `GET /api/trust-center` 并保留 locale 归一化响应。`test-routes.js` 注册 `POST /api/test/reset`：非测试环境返回 404；测试环境重建数据库后立即执行 migration 和 `bootstrapAdmin()`，确保下一条测试可直接登录演示超级管理员。

- [ ] **Step 6: 删除 server.js 对应分支并回归**

Run: `npm run test:api -- --grep "registers a user|logs in|logs out|active session|PATCH and DELETE" --workers=1`

Expected: 所有认证契约 PASS，`server.js` 不再包含 `/api/auth/` 分支。

- [ ] **Step 7: 提交认证路由拆分**

```powershell
git add lib/http/router.js lib/routes/route-helpers.js lib/routes/auth-routes.js lib/routes/trust-routes.js lib/routes/test-routes.js server.js tests/api.spec.js
git commit -m "refactor: extract authentication routes"
```

### Task 9: 购物车、最近浏览和账户路由拆分

**Files:**
- Create: `lib/services/catalog-service.js`
- Create: `lib/services/cart-service.js`
- Create: `lib/routes/cart-routes.js`
- Create: `lib/routes/account-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 锁定购物车和账户契约**

在现有测试增加一条组合契约测试，覆盖匿名 Cookie、pricing、地址授权和再次购买：

```js
test("keeps cart account and recent-view contracts after route extraction", async ({ request }) => {
  const cart = await request.post("/api/cart/items", {
    data: { productId: "sock-01", size: "39", quantity: 1 }
  });
  expect(cart.status()).toBe(201);
  expect((await cart.json()).cart).toMatchObject({ items: [expect.objectContaining({ skuId: "sock-01-39" })] });
  expect(cart.headers()["set-cookie"]).toContain("socks_session=");
  const recent = await request.post("/api/recent-views", { data: { productId: "sock-01" } });
  expect(recent.ok()).toBe(true);
  expect((await request.get("/api/me/addresses")).status()).toBe(401);
});
```

- [ ] **Step 2: 运行契约测试确认当前基线为绿**

Run: `npm run test:api -- --grep "cart account and recent-view contracts" --workers=1`

Expected: PASS。该测试用于锁定机械迁移行为；若失败先修测试假设，不开始迁移。

- [ ] **Step 3: 提取 catalog service**

把 `normalizeLocale`、商品筛选/排序/分页、`getProductsPayload`、推荐和最近浏览商品 payload 从 `server.js` 迁移到 `lib/services/catalog-service.js`。现有 `product-routes.js` 改从该服务接收 `getProductsPayload`，`marketing-routes.js` 的公共营销 payload 也不得继续由 `server.js` 提供。

- [ ] **Step 4: 提取 cart service**

从 `server.js` 迁移活动购物车、payload、SKU 库存和合并 helper。`createCartService(dependencies)` 返回：

```js
{
  readActiveCart,
  writeActiveCart,
  mergeAnonymousCartIntoUserCart,
  getCartPayload,
  sendCartJson,
  validateCartItemInput,
  validateSkuStockQuantity,
  findProductVariant
}
```

不得改变 pricing、库存上限、匿名与登录购物车隔离行为。

- [ ] **Step 5: 创建 cart routes**

迁移：`/api/cart`、coupon、bundle、cart items POST/PATCH/DELETE、clear、recent views、recommendations。路径和状态码保持不变。

- [ ] **Step 6: 创建 account routes**

迁移：`/api/me/addresses` 全部操作、`/api/me/orders`、`/api/me/orders/:id/reorder`。所有账户接口继续使用 `requireUser`，资源归属不匹配继续使用 404 隐藏存在性。

- [ ] **Step 7: 删除旧分支并运行领域回归**

Run: `npm run test:api -- --grep "cart|coupon|bundle|recent views|address|reorder|cart account" --workers=1`

Expected: 购物车、营销快照、地址、最近浏览和再次购买测试 PASS。

- [ ] **Step 8: 提交购物车和账户路由**

```powershell
git add lib/services/catalog-service.js lib/services/cart-service.js lib/routes/cart-routes.js lib/routes/account-routes.js lib/routes/product-routes.js lib/routes/marketing-routes.js server.js tests/api.spec.js
git commit -m "refactor: extract cart and account routes"
```

### Task 10: 结算、支付、履约与用户退货路由拆分

**Files:**
- Create: `lib/services/checkout-service.js`
- Create: `lib/routes/checkout-routes.js`
- Create: `lib/routes/order-routes.js`
- Create: `lib/routes/payment-routes.js`
- Create: `lib/routes/fulfillment-routes.js`
- Create: `lib/routes/return-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 增加交易链路契约测试**

测试用现有 helper 创建购物车和订单，断言：订单创建 `201`、支付尝试 `201`、发票所有权、物流所有权、退货创建与取消仍使用原状态码和错误码。测试名固定为 `preserves checkout payment fulfillment and return route contracts`。

- [ ] **Step 2: 运行契约测试确认基线为绿**

Run: `npm run test:api -- --grep "preserves checkout payment fulfillment and return route contracts" --workers=1`

Expected: PASS。

- [ ] **Step 3: 提取 checkout service**

迁移 `getRequiredCheckoutFields/buildOrderId/buildOrderItems/createTimelineEntry/getShippingMethod` 和结算 orchestration。`createCheckoutService()` 返回这些纯 helper 和 `createOrderFromActiveCart()`，后者继续调用 `createOrderTransaction` 保证订单、库存和购物车清空事务一致。

- [ ] **Step 4: 创建四个交易路由模块**

精确迁移：

```text
checkout-routes:    GET /api/shipping-methods, POST /api/orders
order-routes:       GET /api/orders/:id, PATCH /api/orders/:id/status,
                    POST /api/orders/:id/cancel, GET /api/orders/:id/refunds
payment-routes:     GET /api/payment-methods, POST /api/payments/webhook,
                    GET/POST /api/orders/:id/payments, GET invoice 路径
fulfillment-routes: GET /api/orders/:id/fulfillment
return-routes:      GET /api/me/returns, POST /api/returns,
                    GET/PATCH /api/returns/:id
```

用户订单、发票、物流、退货资源继续执行 owner 检查。公共 webhook 保留现有业务校验，不赋予后台角色旁路。

- [ ] **Step 5: 删除旧分支并运行交易回归**

Run: `npm run test:api -- --grep "checkout|payment|invoice|fulfillment|return request|route contracts" --workers=1`

Expected: 结算、支付、发票、物流和用户退货测试 PASS。

- [ ] **Step 6: 提交交易路由拆分**

```powershell
git add lib/services/checkout-service.js lib/routes/checkout-routes.js lib/routes/order-routes.js lib/routes/payment-routes.js lib/routes/fulfillment-routes.js lib/routes/return-routes.js server.js tests/api.spec.js
git commit -m "refactor: extract commerce lifecycle routes"
```

### Task 11: 后台商品、库存、营销和支付路由拆分

**Files:**
- Create: `lib/routes/admin-dashboard-routes.js`
- Create: `lib/routes/admin-product-routes.js`
- Create: `lib/routes/admin-inventory-routes.js`
- Create: `lib/routes/admin-marketing-routes.js`
- Create: `lib/routes/admin-payment-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写四领域权限失败测试**

增加参数化场景：operator 可写商品/库存/营销但不能配置支付；warehouse 可写库存但不能写商品/营销；super_admin 可配置支付；customer_service 全部写操作 403。每个请求使用真实角色 Cookie，不发送特殊请求头。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "admin product inventory marketing payment permission" --workers=1`

Expected: FAIL，现有后台接口仍由单一 admin 判断。

- [ ] **Step 3: 创建四个后台路由模块**

权限映射：

```text
admin products list/detail           products.read
admin products create/update         products.write
admin product image upload           products.images.write
admin inventory list                 inventory.read
admin inventory patch                inventory.write
admin marketing list                 marketing.read
admin marketing status               marketing.write
admin payment methods list           payments.read
admin payment method patch           payments.configure
```

图片上传仍限制 3MB 和现有四种 MIME，文件名清理 helper 跟随 `admin-product-routes.js`。

同时创建 `admin-dashboard-routes.js`，把 `/api/admin/summary` 迁入并要求 `analytics.read`。该模块继续返回工作队列和最近订单，不与 `/api/admin/analytics` 的经营指标聚合重复。

- [ ] **Step 4: 删除旧分支并运行后台领域回归**

Run: `npm run test:api -- --grep "admin product|admin inventory|admin marketing|payment method|permission" --workers=1`

Expected: 权限矩阵和既有 CRUD 测试 PASS。

- [ ] **Step 5: 提交后台商品领域拆分**

```powershell
git add lib/routes/admin-dashboard-routes.js lib/routes/admin-product-routes.js lib/routes/admin-inventory-routes.js lib/routes/admin-marketing-routes.js lib/routes/admin-payment-routes.js server.js tests/api.spec.js
git commit -m "refactor: extract admin catalog and configuration routes"
```

### Task 12: 后台订单、退款、履约和退货路由拆分并删除绕过

**Files:**
- Create: `lib/routes/admin-order-routes.js`
- Create: `lib/routes/admin-return-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写高风险权限与绕过失败测试**

```js
test("rejects demo headers and enforces high-risk order permissions", async ({ request }) => {
  const customerCookie = await registerApiUser(request, { email: "attacker@example.com" });
  const forged = await request.patch("/api/orders/missing/fulfillment/status", {
    headers: { cookie: customerCookie, "x-demo-admin": "true" },
    data: { status: "delivered" }
  });
  expect(forged.status()).toBe(403);
  expect((await forged.json()).error.code).toBe("PERMISSION_DENIED");

  const warehouse = await assignRoleAndLogin(request, "warehouse@example.com", "warehouse");
  const operator = await assignRoleAndLogin(request, "operator@example.com", "operator");
  expect((await request.get("/api/admin/orders", { headers: { cookie: warehouse } })).ok()).toBe(true);
  expect((await request.get("/api/admin/orders", { headers: { cookie: operator } })).ok()).toBe(true);
});
```

使用真实订单补充：warehouse 发货成功但退款 403；operator 退款成功但发货 403；warehouse 只能把 approved 退货推进到 received，不能审核、拒绝或完成退款。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "rejects demo headers|high-risk order permissions" --workers=1`

Expected: forged header 场景或角色细分场景 FAIL。

- [ ] **Step 3: 创建 admin order routes**

迁移后台订单列表、详情、状态、ship/cancel/refund actions，并把旧的公共路径后台状态操作一起收敛到权限守卫：

```text
orders.read          列表与详情
orders.status.write  一般订单状态推进
orders.ship          发货与 fulfillment 状态推进
orders.cancel        后台取消
orders.refund        部分退款与 refund 状态推进
```

所有业务操作继续使用 `admin` actor 写 `admin_action_events`。

- [ ] **Step 4: 先用 TDD 增加退货 received 状态**

在 `tests/api.spec.js` 增加 Repository 测试：approved 退货可以推进到 received，received 可以推进到 completed；approved 不能直接 completed；推进 received 不创建退款、不回补库存。运行测试确认因 `received` 不存在而失败后，修改 `lib/repositories/returns.js`：

```js
const countedReturnStatuses = new Set(["submitted", "reviewing", "approved", "received", "completed"]);
const returnStatusTransitions = {
  submitted: new Set(["reviewing", "cancelled"]),
  reviewing: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["received"]),
  received: new Set(["completed"]),
  rejected: new Set([]),
  completed: new Set([]),
  cancelled: new Set([])
};
```

同步增加中英文 `received` 标签。修改 `reviewAdminReturnRequest()` 的 action 映射：`receive → received`，`complete → completed`；只有 complete 分支创建退款和执行库存回补。

- [ ] **Step 5: 创建 admin return routes**

迁移后台退货列表、详情和审核。`returns.review` 允许运营执行 start_review、approve、reject、complete；`returns.receive` 只允许仓库执行 receive。若 action 与权限不匹配，返回 `PERMISSION_DENIED`，不能只依赖前端按钮。一般订单状态接口不得用 `orders.status.write` 推进 shipped，发货必须走 `orders.ship` 守卫。

- [ ] **Step 6: 删除全部旧绕过**

从 `server.js` 删除 `DEMO_ADMIN_EMAILS`、四处 `x-demo-admin` 读取、`requireAdmin` 兼容适配器和相关路径解析函数。

Run: `rg -n "DEMO_ADMIN_EMAILS|x-demo-admin|admin@socks\.test" server.js lib`

Expected: 后端生产路径无 `DEMO_ADMIN_EMAILS` 或 `x-demo-admin`；固定演示邮箱只允许存在于 `auth-service.js` 的开发/测试 bootstrap 常量中。把既有三个使用 `x-demo-admin` 推进物流的 API 测试改为 warehouse 真实会话。

- [ ] **Step 7: 运行订单与售后回归**

Run: `npm run test:api -- --grep "admin order|ship|refund|cancel|return|demo headers|high-risk" --workers=1`

Expected: 高风险权限、订单状态、退款幂等、库存回补和退货审核全部 PASS。

- [ ] **Step 8: 提交高风险路由拆分**

```powershell
git add lib/repositories/returns.js lib/repositories/admin-order-actions.js lib/routes/admin-order-routes.js lib/routes/admin-return-routes.js server.js tests/api.spec.js
git commit -m "feat: secure admin order and return operations"
```

### Task 13: 应用工厂与 server.js 最终瘦身

**Files:**
- Create: `lib/app.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写应用边界与静态契约测试**

```js
test("keeps the server entrypoint focused on startup", async () => {
  const source = await fs.readFile("server.js", "utf8");
  expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(400);
  expect(source).not.toContain("request.method ===");
  expect(source).not.toContain("/api/admin/");
  expect(source).not.toContain("DEMO_ADMIN_EMAILS");
});
```

保持已有静态 HTML/JS、安全头、404 和 405 测试。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:api -- --grep "entrypoint focused on startup" --workers=1`

Expected: FAIL，`server.js` 超过 400 行。

- [ ] **Step 3: 创建 app 工厂**

`createApp({ config, logger, withDatabase, resetDatabase })`：

- 创建 router 和 support/analytics limiter。
- 创建 session、auth、cart、checkout 和 authorization service。
- 按领域构造最小依赖对象并注册全部 route modules。
- 请求先执行 router；未匹配 API 返回 404；非 GET/HEAD 静态请求返回 405；其余通过现有 static helper。
- 未知异常记录 `request.failed` 并返回标准 `INTERNAL_ERROR`。
- 暴露 `initializeRuntime()`，完成数据库初始化、bootstrap 和数据目录校验。

返回：

```js
{
  handleRequest,
  initializeRuntime
}
```

- [ ] **Step 4: 精简 server.js**

最终入口结构：

```js
const http = require("node:http");
const { createConfig } = require("./lib/config");
const { createLogger } = require("./lib/logger");
const { createApp } = require("./lib/app");

const config = createConfig(process.env);
const logger = createLogger({ level: config.logLevel });
const app = createApp({ config, logger });
app.initializeRuntime();

const server = http.createServer(app.handleRequest);
server.listen(config.port, config.host, () => {
  logger.info("server.listening", { url: `http://${config.host}:${config.port}` });
});
```

允许增加启动错误处理，但不得把领域 Repository 和 API handler 重新导入入口。

- [ ] **Step 5: 运行应用边界和关键 API 回归**

Run: `npm run test:api -- --grep "entrypoint focused|health|security headers|invalid JSON|products|cart|admin summary" --workers=1`

Expected: 架构测试和关键公共/后台 API PASS。

- [ ] **Step 6: 提交应用边界**

```powershell
git add lib/app.js server.js tests/api.spec.js
git commit -m "refactor: reduce server to application startup"
```

### Task 14: 前端按权限展示后台能力

**Files:**
- Modify: `public/js/storefront-app.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 写角色 UI 失败测试**

增加 API helper 通过超级管理员把 UI 测试用户设为角色，再重新登录：

```js
async function loginRoleFromUi(page, role) {
  const email = `${role}-${Date.now()}@example.com`;
  const registered = await page.request.post("/api/auth/register", {
    data: { name: role, email, password: "demo1234" }
  });
  const user = (await registered.json()).user;
  await page.request.post("/api/auth/login", {
    data: { email: "admin@socks.test", password: "demo1234" }
  });
  const changed = await page.request.patch(`/api/admin/users/${user.id}/role`, {
    data: { role, reason: `UI permission test for ${role}` }
  });
  expect(changed.ok()).toBe(true);
  const login = await page.request.post("/api/auth/login", {
    data: { email, password: "demo1234" }
  });
  expect(login.ok()).toBe(true);
}

async function seedProcessingOrderFromApi(page) {
  await page.request.post("/api/auth/login", {
    data: { email: "admin@socks.test", password: "demo1234" }
  });
  await seedCartFromApi(page, [{ productId: "sock-01", size: "39", quantity: 1 }]);
  const response = await page.request.post("/api/orders", {
    data: {
      locale: "zh-CN",
      customer: { name: "Warehouse Buyer", contact: "admin@socks.test" },
      shippingAddress: {
        address: "100 Demo Street", city: "Seattle", region: "WA", postalCode: "98101"
      },
      shippingMethodId: "standard"
    }
  });
  const order = (await response.json()).order;
  await page.request.patch(`/api/admin/orders/${order.id}/status`, {
    data: { status: "paid", locale: "zh-CN" }
  });
  await page.request.patch(`/api/admin/orders/${order.id}/status`, {
    data: { status: "processing", locale: "zh-CN" }
  });
  return order;
}
```

覆盖：

```js
test("shows only permitted admin modules and actions for warehouse users", async ({ page }) => {
  const order = await seedProcessingOrderFromApi(page);
  await loginRoleFromUi(page, "warehouse");
  await page.goto("/socks-product-list.html?view=admin");
  await expect(page.locator("[data-admin-tab='inventory']")).toBeVisible();
  await expect(page.locator("[data-admin-tab='orders']")).toBeVisible();
  await expect(page.locator("[data-admin-tab='marketing']")).toBeHidden();
  await expect(page.locator("[data-admin-tab='payments']")).toBeHidden();
  await page.locator("[data-admin-tab='orders']").click();
  await page.locator(`[data-admin-order-row][data-order-id="${order.id}"] [data-admin-order-open]`).click();
  await expect(page.locator("[data-admin-order-action-form='ship']")).toBeVisible();
  await expect(page.locator("[data-admin-order-action-form='refund']")).toHaveCount(0);
});
```

另测 customer_service 显示评论/客服但不显示库存；customer 直接打开后台显示 forbidden。

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:ui -- --grep "permitted admin modules|customer service admin modules" --workers=1`

Expected: FAIL，前端仍按邮箱显示全部后台。

- [ ] **Step 3: 实现权限 helper**

删除 `isCurrentUserAdmin()`，增加：

```js
function hasCurrentPermission(permission) {
  return Array.isArray(currentUser?.permissions) && currentUser.permissions.includes(permission);
}

function canAccessAdmin() {
  return Array.isArray(currentUser?.permissions)
    && currentUser.permissions.some((permission) => permission.startsWith("analytics.")
      || permission.startsWith("products.")
      || permission.startsWith("inventory.")
      || permission.startsWith("orders.")
      || permission.startsWith("returns.")
      || permission.startsWith("reviews.")
      || permission.startsWith("support.")
      || permission.startsWith("marketing.")
      || permission.startsWith("payments.")
      || permission.startsWith("users.")
      || permission.startsWith("audit."));
}
```

后台页签声明所需读取权限，render 时隐藏无权限页签；写按钮分别检查 write/action 权限。删除所有发送 `x-demo-admin` 的 header。

退货 UI 增加 `received / 已收货` 文案。approved 状态只向拥有 `returns.receive` 的用户显示“确认收货”，received 状态只向拥有 `returns.review` 的用户显示“完成退款”；warehouse 不渲染退款金额表单。

- [ ] **Step 4: 处理默认后台页签**

如果用户没有 `analytics.read`，后台默认打开其第一个可访问页签。URL 指向无权限 tab 时显示禁止状态，不发对应 API 请求。

- [ ] **Step 5: 运行角色 UI 和既有后台回归**

Run: `npm run test:ui -- --grep "permitted admin modules|admin dashboard|admin products|admin inventory|admin orders|admin review|admin support" --workers=1`

Expected: 角色 UI 与既有超级管理员后台测试 PASS。

- [ ] **Step 6: 提交前端权限适配**

```powershell
git add public/js/storefront-app.js tests/socks-product-list.spec.js
git commit -m "feat: adapt admin console to RBAC permissions"
```

### Task 15: 完整权限矩阵、全量验证和低频推送

**Files:**
- Modify: `tests/api.spec.js`
- Modify: `tests/socks-product-list.spec.js`

- [ ] **Step 1: 补全参数化权限矩阵**

建立每个后台 endpoint 的代表请求表，至少覆盖每个权限一次。每条场景包含 `role`、`method`、`path`、`expectedStatus`，并断言拒绝时错误为 `PERMISSION_DENIED`。增加静态扫描测试：

```js
test("contains no legacy admin bypasses", async () => {
  const files = ["server.js", ...(await fs.readdir("lib/routes")).map((name) => `lib/routes/${name}`), "public/js/storefront-app.js"];
  const source = (await Promise.all(files.map((file) => fs.readFile(file, "utf8")))).join("\n");
  expect(source).not.toContain("DEMO_ADMIN_EMAILS");
  expect(source).not.toContain("x-demo-admin");
  expect(source).not.toContain('email === "admin@socks.test"');
});
```

- [ ] **Step 2: 运行权限与关键交易定向回归**

```powershell
npm run test:api -- --grep "RBAC|role|permission|admin|cart|checkout|payment|refund|fulfillment|return" --workers=1
npm run test:ui -- --grep "admin|cart|checkout|order|return" --workers=1
```

Expected: 权限矩阵、交易主链路和后台 UI 全部 PASS。

- [ ] **Step 3: 运行完整测试套件**

```powershell
npm run test:api -- --workers=1
npm run test:ui -- --workers=1
```

Expected: 所有非跳过测试 PASS；只保留仓库原有明确跳过项。

- [ ] **Step 4: 检查架构、编码和旧绕过**

```powershell
git diff --check
rg -n "\\u[0-9a-fA-F]{4}" lib public/js server.js tests
rg -n "DEMO_ADMIN_EMAILS|x-demo-admin|email.*admin@socks\.test" server.js lib public/js
(Get-Content -LiteralPath server.js -Encoding UTF8 | Measure-Object -Line).Lines
```

Expected: 无空白错误、无 Unicode 转义、无旧管理员绕过；`server.js` 不超过 400 行。

- [ ] **Step 5: 清理测试产物**

恢复：

```powershell
git restore -- tests/fixtures/test-data/cart.json tests/fixtures/test-data/orders.json tests/fixtures/test-data/sessions.json tests/fixtures/test-data/user-carts.json tests/fixtures/test-data/users.json
```

只删除本轮测试明确创建的具体 `public/uploads/products/*` 文件。运行 `git status --short`，不得删除用户文件或其他未跟踪文件。

- [ ] **Step 6: 提交最终测试补充**

```powershell
git add tests/api.spec.js tests/socks-product-list.spec.js
git commit -m "test: cover complete RBAC permission matrix"
```

若 Step 1 没有产生新测试改动，则跳过空提交。

- [ ] **Step 7: 核对提交链和工作区**

```powershell
git log -18 --oneline
git status --short --branch
```

Expected: 工作区干净，设计提交 `d509fb0`、分析看板提交和本计划所有实现提交均保留。

- [ ] **Step 8: 一次低频推送**

```powershell
git push origin feature/socks-after-sales-payment-admin
```

Expected: 推送现有分支成功。若网络失败，只允许一次低频重试；再次失败立即停止并报告，不循环重试。

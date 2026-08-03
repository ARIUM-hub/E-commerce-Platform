# 后端路由模块化与 RBAC 权限体系设计

- 日期：2026-08-03
- 项目：袜子商城
- 分支：`feature/socks-after-sales-payment-admin`
- 推荐方案：固定权限目录、数据库角色分配、领域路由彻底拆分

## 1. 背景

当前商城已经把商品、营销、分析、评论和客服等部分路由迁移到 `lib/routes/`，但 `server.js` 仍约 3066 行。认证、购物车、地址、结算、订单、支付、履约、退货以及多数后台接口仍以大量请求方法和路径判断直接存在于入口文件中。

现有后台权限主要依赖 `admin@socks.test` 邮箱白名单，退款、物流和部分退货接口还接受客户端传入的 `x-demo-admin: true` 请求头。这种方式不能表达岗位职责，无法安全支持多个后台账号，并且存在客户端自行构造请求头绕过权限的风险。

本阶段需要同时解决两个相关问题：继续把后端路由按领域拆成独立模块，并用数据库角色与细粒度权限替代邮箱和请求头判断。

## 2. 目标

- 将 `server.js` 缩减为配置加载、数据库初始化、依赖装配、应用创建和 HTTP 服务启动。
- 把剩余 API 路由迁移到职责明确的领域模块。
- 建立五级 RBAC 角色体系：`super_admin`、`operator`、`customer_service`、`warehouse`、`customer`。
- 使用具体权限控制后台读取和变更操作，不在路由中散落角色名称判断。
- 提供仅超级管理员可用的后台账号查询与角色分配 API。
- 删除邮箱白名单鉴权和所有 `x-demo-admin` 绕过。
- 记录角色变更审计，并阻止系统失去最后一个超级管理员。
- 保持现有商城、订单生命周期和后台管理 API 的业务响应兼容。

## 3. 非目标

- 不支持用户自定义角色或在线编辑权限目录。
- 不引入 Express、Fastify、Koa 或新的 Web 框架。
- 不接入第三方身份提供商、OAuth、SSO 或多因素认证。
- 不在本阶段开发后台角色管理页面，只提供受保护的管理 API。
- 不重写 Repository 层业务规则，不改变现有订单、退款、履约和退货状态机。
- 不进行压力测试、并发模型探测或多后台智能体执行。

## 4. 方案选择

### 4.1 采用方案

采用“固定权限目录 + 数据库角色分配”：

- 权限键和角色到权限的映射固定在代码中，跟随代码审查和测试发布。
- 用户角色存入数据库，可由 `super_admin` 通过管理 API 调整。
- 路由只声明需要的权限，不直接判断邮箱或角色名称。

这种方式比路由内角色判断更集中、可审计，也比完全动态权限配置更不容易因误操作造成权限漂移或锁死。

### 4.2 不采用的方案

- 数据库动态权限：灵活但需要权限编辑 UI、缓存失效、配置版本和防锁死机制，超出当前范围。
- 路由内硬编码角色：改动较小，但会把现有邮箱判断问题替换成分散的角色判断，长期维护成本没有解决。

## 5. 总体架构

请求处理链路统一为：

```text
HTTP 请求
  → 路由匹配
  → 会话认证
  → 用户角色读取
  → 权限校验
  → 领域路由编排
  → Repository 事务与业务规则
  → 标准响应或标准错误
```

新增或调整的核心模块：

- `lib/app.js`：创建路由器、注册全部领域路由并返回请求处理器。
- `lib/auth/authorization.js`：权限目录、角色权限映射和授权判断。
- `lib/services/session-service.js`：会话读取、创建、失效与当前用户上下文。
- `lib/services/auth-service.js`：密码处理、注册、登录和 bootstrap 管理员初始化。
- `lib/routes/admin-user-routes.js`：后台账号查询、角色分配和角色审计读取。
- 其他领域路由模块：承接当前仍留在 `server.js` 的 API。

`server.js` 最终只保留约 200 至 400 行装配代码，不再包含具体 API 业务分支、路径解析函数或邮箱权限判断。

## 6. 数据模型

新增 migration `0013_rbac_authorization`，创建以下表。

### 6.1 roles

```sql
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```

固定写入五个内置角色，不提供运行时创建和删除能力。

### 6.2 user_roles

```sql
CREATE TABLE user_roles (
  user_id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  assigned_by_user_id TEXT,
  assigned_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

当前每个用户只有一个有效角色。使用独立关系表而不是给 `users` 直接增加角色字符串，可以保留角色元数据和分配审计边界；未来若确实需要多角色，可通过后续 migration 调整主键约束，而不必修改用户主表。

### 6.3 role_assignment_events

```sql
CREATE TABLE role_assignment_events (
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
```

索引覆盖目标用户和创建时间，方便后台审计查询。

### 6.4 迁移与回填

- migration 幂等写入五个角色。
- 所有没有角色的已有用户回填 `customer`。
- 不根据用户邮箱自动授予管理角色。
- 迁移本身不创建生产管理员；管理员 bootstrap 由启动服务负责。

## 7. 权限目录与角色矩阵

权限键使用 `<resource>.<action>` 命名，并由 `authorization.js` 统一导出。

```text
analytics.read
products.read
products.write
products.images.write
inventory.read
inventory.write
orders.read
orders.status.write
orders.ship
orders.cancel
orders.refund
returns.read
returns.review
returns.receive
reviews.read
reviews.moderate
reviews.reply
support.read
support.assign
support.reply
marketing.read
marketing.write
payments.read
payments.configure
users.read
users.roles.manage
audit.read
```

### 7.1 super_admin

拥有全部权限。只有该角色可以查询后台账号、分配角色、配置支付方式和读取角色审计。

### 7.2 operator

拥有经营看板、商品、商品图片、库存、订单、订单状态、取消、退款、退货审核和营销活动权限。不能管理用户角色或支付配置。

### 7.3 customer_service

拥有订单只读、退货只读、评论读取/审核/回复以及客服工单读取/分配/回复权限。不能修改库存、发货、退款、营销或支付配置。

### 7.4 warehouse

拥有商品只读、库存读写、订单只读、确认发货、物流状态和退货收货权限。不能审核退款决策、查看经营财务分析、执行退款、管理营销或用户角色。

### 7.5 customer

默认角色，不拥有 `/api/admin/*` 权限。现有用户只能操作自己的购物车、地址、订单、支付、退款进度、退货、收藏、最近浏览和客服记录。

## 8. 授权服务

`lib/auth/authorization.js` 提供：

- `PERMISSIONS`：所有合法权限键。
- `ROLE_PERMISSIONS`：角色到权限集合的不可变映射。
- `getPermissionsForRoles(roles)`：生成去重后的权限列表。
- `hasPermission(userContext, permission)`：未知权限默认拒绝。
- `requireUser(request, response)`：要求有效登录会话。
- `requirePermission(permission)`：返回路由守卫，统一认证和授权错误。

路由使用具体权限：

```js
const actor = await services.requirePermission("orders.refund", request, response);
if (!actor) return;
```

不允许在领域路由内新增邮箱白名单、`x-demo-admin`、`role === ...` 或其他平行权限判断。

## 9. 初始超级管理员

### 9.1 开发和测试环境

- 初始化固定演示用户 `admin@socks.test`。
- 使用现有演示密码 `demo1234`。
- 在数据库中明确分配 `super_admin`。
- 重复初始化不得重复创建用户、角色或审计事件。

### 9.2 生产环境

- 仅当数据库中不存在任何 `super_admin` 时执行 bootstrap。
- 必须同时提供 `BOOTSTRAP_ADMIN_EMAIL` 和 `BOOTSTRAP_ADMIN_PASSWORD`。
- 缺少变量时启动失败并输出明确配置错误，不静默创建默认账号。
- 若 bootstrap 邮箱已被一个非超级管理员账号占用，启动失败并要求显式处理，不静默提升已有账号。
- bootstrap 完成后，后续鉴权只读取数据库，不再依赖环境变量中的邮箱。
- 已存在超级管理员时忽略 bootstrap 变量，避免启动时覆盖现有账号或密码。

## 10. 角色管理 API

新增以下接口：

### 10.1 查询后台账号

```text
GET /api/admin/users?q=&role=&page=
Required: users.read
```

返回公开用户字段、当前角色和更新时间，不返回密码哈希、盐或会话 ID。

### 10.2 分配角色

```text
PATCH /api/admin/users/:userId/role
Required: users.roles.manage
Body: { role, reason }
```

约束：

- `role` 必须是五个内置角色之一。
- `reason` 必填并限制长度。
- 不能降级系统中最后一个有效 `super_admin`。
- 相同角色请求返回成功但不重复写入变更事件。
- 成功变更后删除目标用户的全部现有会话，目标用户需要重新登录。
- 角色变更和审计写入同一数据库事务。

### 10.3 读取角色审计

```text
GET /api/admin/role-assignment-events?userId=&page=
Required: audit.read
```

返回操作者、目标用户、前后角色、原因和时间。

## 11. 会话和前端数据

用户 Repository 返回角色，但继续隔离密码字段。`createPublicUser()` 增加：

```json
{
  "roles": ["operator"],
  "permissions": ["analytics.read", "products.read"]
}
```

`GET /api/session`、登录和注册响应保留原有字段并增加角色与权限，避免破坏现有前端调用。

前端调整：

- 删除 `isCurrentUserAdmin()` 邮箱判断。
- 根据 `permissions` 决定是否展示后台入口和各后台页签。
- 按具体权限禁用或隐藏写操作按钮。
- 不再发送 `x-demo-admin`。
- 前端显示控制仅用于体验，后端仍对每个接口独立授权。

## 12. 路由模块化

### 12.1 应用装配

新增 `lib/app.js`：

- 创建轻量路由器。
- 注册全部公共、用户和后台路由模块。
- 注入日志、数据库访问、会话服务和领域 Repository。
- 统一处理未匹配 API、静态资源和未知异常。

每个路由模块只接收本领域依赖，禁止传入包含全部 Repository 的超大 context。

### 12.2 新增领域路由

- `auth-routes.js`：注册、登录、退出、当前会话。
- `cart-routes.js`：购物车、优惠券、组合购买、最近浏览和推荐。
- `account-routes.js`：地址、用户订单历史和再次购买。
- `checkout-routes.js`：配送方式和订单创建。
- `payment-routes.js`：支付方式、支付尝试、回调和发票。
- `fulfillment-routes.js`：用户物流查询。
- `return-routes.js`：用户退货申请、查询和取消。
- `admin-product-routes.js`：商品、图片上传和 SKU。
- `admin-inventory-routes.js`：库存查询和调整。
- `admin-order-routes.js`：订单查询、状态、发货、取消和退款。
- `admin-return-routes.js`：后台退货审核。
- `admin-marketing-routes.js`：营销资源和活动状态。
- `admin-payment-routes.js`：支付配置。
- `admin-user-routes.js`：账号、角色和审计。

已有 `product-routes.js`、`analytics-routes.js`、`admin-analytics-routes.js`、`admin-review-routes.js`、`support-ticket-routes.js` 和 `admin-support-routes.js` 保留，并改接统一授权服务。

### 12.3 路径解析与错误处理

- 动态路径解析函数放在所属路由模块内。
- 请求体错误继续使用统一 `INVALID_JSON` 和 `REQUEST_BODY_TOO_LARGE`。
- 领域校验错误保留现有状态码和错误码。
- 未登录统一返回 `401 AUTH_REQUIRED`；后台未登录可以保留兼容错误码 `ADMIN_AUTH_REQUIRED`。
- 已登录但权限不足统一返回 `403 PERMISSION_DENIED`，错误详情包含所需权限键。
- 未知异常记录结构化日志并返回 `500 INTERNAL_ERROR`，不得暴露堆栈。

## 13. 安全规则

- 完全删除 `DEMO_ADMIN_EMAILS`。
- 完全删除服务端和前端的 `x-demo-admin` 处理。
- 测试不得使用请求头模拟管理员，必须通过真实账号和会话验证权限。
- 未知角色、未知权限、缺失角色均默认拒绝后台访问。
- 角色分配只能由拥有 `users.roles.manage` 的已登录用户执行。
- 最后一个超级管理员保护必须在事务中检查，避免检查与更新分离。
- 角色管理响应不得返回密码、盐、会话 ID 或其他认证秘密。

## 14. 测试策略

所有功能按 TDD 实施，并使用 Playwright `--workers=1`。

### 14.1 数据库和授权单元测试

- migration 创建角色、用户角色和审计表及索引。
- migration 重复执行不重复角色和回填。
- 已有用户回填 `customer`。
- 五种角色权限矩阵完整且不存在未知权限。
- 未知角色、权限和缺失角色默认拒绝。
- bootstrap 在开发、测试和生产环境下遵守各自规则。

### 14.2 API 权限矩阵

- 每种后台角色验证允许的代表读取和写入接口。
- 每种后台角色验证至少一个明确禁止的高风险接口。
- `customer` 和匿名用户不能访问后台接口。
- `x-demo-admin` 不能绕过退款、履约和退货权限。
- 使用管理员邮箱注册普通用户不会自动获得后台权限。

### 14.3 角色管理

- 只有 `super_admin` 可以查询账号和分配角色。
- 非法角色、缺少原因和不存在用户返回标准错误。
- 不能降级最后一个超级管理员。
- 相同角色请求幂等且不重复审计。
- 成功变更写入审计并使目标用户会话失效。

### 14.4 路由兼容与 UI

- 拆分前后的状态码、响应结构、Cookie 和领域错误码保持一致。
- 前端后台入口、页签和操作按钮按权限显示。
- 用户直接访问未授权后台视图时显示禁止状态。
- 即使前端按钮被人为显示，后端仍拒绝未授权请求。
- 最终运行完整 API 和 UI 套件，恢复测试 fixture 并清理明确生成的上传文件。

## 15. 实施顺序

建议按以下阶段和提交推进：

1. RBAC migration、角色 Repository 和权限映射。
2. 会话服务、bootstrap 管理员和公开用户权限数据。
3. `requirePermission()` 与既有后台路由迁移，删除邮箱和请求头绕过。
4. 后台账号、角色分配和审计 API。
5. 认证、购物车、账户、结算、支付、履约和退货路由拆分。
6. 后台商品、库存、订单、退货、营销和支付路由拆分。
7. `lib/app.js` 装配和 `server.js` 瘦身。
8. 前端权限适配、完整回归、编码检查和低频推送。

每个阶段保持 API 可运行并形成独立提交，不做长时间不可用的中间状态。

## 16. 验收标准

- `server.js` 约 200 至 400 行，且不包含具体 API 业务分支。
- 所有 API 由领域路由模块注册。
- 后台权限完全来自数据库角色和集中权限映射。
- 项目中不存在 `DEMO_ADMIN_EMAILS`、管理员邮箱判断或 `x-demo-admin`。
- 五种角色只能执行各自允许的后台操作。
- 生产环境没有默认管理员账号或默认管理员密码。
- 最后一个超级管理员不能被降级。
- 角色变更有可查询审计，且旧会话立即失效。
- 现有商城、结算、订单、支付、履约、退货、客服和后台业务行为不退化。
- 完整 API/UI 测试、UTF-8 检查和 Unicode 转义检查通过。

## 17. 风险与缓解

- 路由大规模迁移可能改变响应细节。缓解：先锁定现有契约测试，再逐领域迁移。
- 角色迁移可能造成开发环境无法进入后台。缓解：开发/测试环境幂等创建演示超级管理员。
- 权限遗漏可能导致后台功能不可用。缓解：权限目录静态校验和参数化角色矩阵测试。
- 权限过宽可能造成越权。缓解：默认拒绝，路由声明具体动作权限，不按大类一次放行。
- 角色变更与会话缓存可能不一致。缓解：本阶段直接删除目标用户全部会话，不引入权限缓存。
- 全量测试耗时较长。缓解：聚焦测试先行，最终仍保持单 worker 串行验证。

## 18. 自检

- 未决标记：设计不包含未确认项或占位符。
- 一致性：角色、权限、API、前端显示和测试矩阵使用同一权限目录。
- 范围：不包含动态权限编辑 UI、SSO 或框架迁移，可形成一个分阶段实施计划。
- 安全：删除所有客户端管理员绕过，生产 bootstrap 不使用默认凭据。
- 兼容：明确保留现有 API 业务契约，仅统一认证与授权错误边界。

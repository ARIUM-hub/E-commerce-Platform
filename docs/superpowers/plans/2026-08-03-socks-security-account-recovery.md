# 商城安全防护与账户恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为商城增加统一 CSRF、混合限流、安全审计、SMTP/outbox、邮箱验证和密码重置，并在未验证用户结算时安全拦截。

**Architecture:** 在现有 Router 与旧路由之前增加可迁移到 `lib/app.js` 的请求安全网关；普通接口使用内存窗口，认证接口使用 SQLite 持久化双维度限流。账户 Token、邮件、审计和账户安全编排分别封装为 Repository/Service，浏览器前端通过统一 API wrapper 自动携带 CSRF Token。

**Tech Stack:** Node.js 原生 HTTP、Node Crypto、SQLite、Nodemailer、原生浏览器 JavaScript、Playwright API/UI 测试。

---

## File Map

### Security persistence and configuration

- Modify: `lib/database.js`：增加 `0014_security_account_recovery` migration、验证状态、Token、限流、审计和 outbox 表。
- Modify: `lib/config.js`：解析 CSRF、Origin、可信代理、限流、SMTP、webhook 和审计保留配置。
- Modify: `.env.example`：记录生产安全变量。
- Modify: `playwright.config.js`：提供固定测试密钥和高通用限流阈值。
- Modify: `package.json` / `package-lock.json`：增加 Nodemailer。

### Focused modules

- Create: `lib/security/security-identifiers.js`：IP、账号和 User-Agent 的规范化与 HMAC 哈希。
- Create: `lib/security/csrf.js`：签名双提交 Token。
- Create: `lib/security/rate-limit-service.js`：内存和 SQLite 限流。
- Create: `lib/security/request-security.js`：Origin、Fetch Metadata、CSRF 与通用限流网关。
- Create: `lib/security/webhook-signature.js`：支付 webhook 原始请求体签名验证。
- Create: `lib/repositories/account-tokens.js`：验证/重置 Token 生命周期。
- Create: `lib/repositories/security-audit.js`：脱敏审计、分页和过期清理。
- Create: `lib/repositories/email-outbox.js`：邮件队列状态。
- Create: `lib/services/mailer-service.js`：本地 outbox 与串行 SMTP 投递。
- Create: `lib/services/account-security-service.js`：邮箱验证和密码重置编排。
- Create: `lib/routes/security-routes.js`：CSRF、开发 outbox 和安全审计读取。
- Create: `lib/routes/account-security-routes.js`：邮箱验证和密码重置 API。

### Existing integration points

- Modify: `lib/repositories/users.js`：映射验证状态、更新密码与验证时间。
- Modify: `lib/services/auth-service.js`：新注册用户未验证，bootstrap 管理员已验证。
- Modify: `lib/services/session-service.js`：密码重置后的用户会话失效沿用 Repository。
- Modify: `lib/routes/auth-routes.js`：注册后发送验证邮件，认证事件审计与持久化限流。
- Modify: `lib/http/request-body.js`：支付 webhook 可读取受大小限制的原始 Buffer。
- Modify: `server.js`：装配安全服务、在路由前执行安全网关、校验 webhook、结算验证。
- Modify: `public/js/storefront-app.js`：CSRF wrapper、验证提示、忘记/重置密码和冷却 UI。
- Modify: `tests/api.spec.js`：所有安全与账户生命周期 API 测试。
- Modify: `tests/socks-product-list.spec.js`：账户安全 UI 测试。

### Task 1: 安全数据库 migration

**Files:**
- Modify: `lib/database.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写 migration 红灯测试**

增加测试 `initializes account security storage and backfills existing users safely`：初始化数据库、插入 legacy 用户、删除 `0014_security_account_recovery` 记录并重跑 migration，断言两个用户字段、五张安全表和索引存在，legacy 用户 `email_verified_at` 非空，重复初始化不重复数据。

```js
expect(db.prepare("PRAGMA table_info(users)").all().map((row) => row.name))
  .toEqual(expect.arrayContaining(["email_verified_at", "password_changed_at"]));
expect(db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((row) => row.name))
  .toEqual(expect.arrayContaining([
    "email_verification_tokens", "password_reset_tokens",
    "security_rate_limit_buckets", "security_audit_events", "email_outbox"
  ]));
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "account security storage" --workers=1`

Expected: FAIL，`email_verified_at` 或安全表不存在。

- [ ] **Step 3: 实现 `0014_security_account_recovery`**

使用现有 `addColumnIfMissing()`，建表字段严格对应设计文档；增加 Token hash 唯一索引、用户/过期索引、限流 blocked 索引、审计时间/actor 索引和 outbox 状态索引。migration 只把执行时已经存在的用户回填为已验证，后续 `createUser()` 显式决定新用户状态。

- [ ] **Step 4: 运行 migration 回归**

Run: `npm run test:api -- --grep "account security storage|schema migrations|idempotently" --workers=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add lib/database.js tests/api.spec.js
git commit -m "feat: add account security persistence"
```

### Task 2: 安全配置和脱敏标识

**Files:**
- Modify: `lib/config.js`
- Modify: `.env.example`
- Modify: `playwright.config.js`
- Create: `lib/security/security-identifiers.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写配置和哈希红灯测试**

测试 production 缺少 `CSRF_SECRET`、`SECURITY_HASH_SECRET`、`PAYMENT_WEBHOOK_SECRET` 或 SMTP 必需字段时抛错；development/test 使用显式测试值。测试 `hashSecurityIdentifier()` 对规范化邮箱/IP 输出稳定 64 位 hex，结果不含原值。

```js
expect(() => createConfig({ NODE_ENV: "production" }))
  .toThrow("CSRF_SECRET is required in production");
expect(hashSecurityIdentifier(" Buyer@Example.com ", "secret", "account"))
  .toMatch(/^[a-f0-9]{64}$/);
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "security config|security identifiers" --workers=1`

Expected: FAIL，配置字段和模块不存在。

- [ ] **Step 3: 实现配置与标识 helper**

新增配置键：`csrfSecret`、`securityHashSecret`、`allowedOrigins`、`trustProxy`、`generalRateLimit`、`auditRetentionDays`、`paymentWebhookSecret` 和 `smtp`。development/test 允许显式测试默认值，production 必须完整。`normalizeClientIp()` 仅在 `trustProxy` 为 true 时读取第一个 `x-forwarded-for`。

- [ ] **Step 4: 更新环境示例与测试配置**

`.env.example` 不提供生产秘密默认值；Playwright 使用固定非生产密钥、`GENERAL_RATE_LIMIT=10000`，避免完整测试套件误触通用窗口。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:api -- --grep "engineering config|security config|security identifiers" --workers=1`

```powershell
git add lib/config.js lib/security/security-identifiers.js .env.example playwright.config.js tests/api.spec.js
git commit -m "feat: configure request security boundaries"
```

### Task 3: 账户 Token Repository

**Files:**
- Create: `lib/repositories/account-tokens.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写一次性 Token 红灯测试**

使用固定 `now` 和固定 raw token 测试：只持久化 hash；同用户新 Token 消费旧 Token；有效 Token 只能消费一次；过期、已使用和错误 Token 都返回 `null`。

```js
const issued = issueAccountToken(db, {
  type: "email_verification", userId: user.id, rawToken: "raw-secret",
  requestedIpHash: "ip-hash", now, ttlMs: 86400000
});
expect(db.prepare("SELECT token_hash FROM email_verification_tokens WHERE id=?").get(issued.id).token_hash)
  .not.toContain("raw-secret");
expect(consumeAccountToken(db, { type: "email_verification", rawToken: "raw-secret", now })).toMatchObject({ userId: user.id });
expect(consumeAccountToken(db, { type: "email_verification", rawToken: "raw-secret", now })).toBeNull();
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "account tokens are hashed" --workers=1`

Expected: FAIL，Repository 不存在。

- [ ] **Step 3: 实现 Token API**

导出 `createRawToken()`、`hashToken()`、`issueAccountToken()`、`consumeAccountToken()`、`invalidateUserTokens()`。类型只允许 `email_verification` 和 `password_reset`，表名通过固定映射选择，不拼接用户输入。

- [ ] **Step 4: 验证并提交**

Run: `npm run test:api -- --grep "account tokens are hashed" --workers=1`

```powershell
git add lib/repositories/account-tokens.js tests/api.spec.js
git commit -m "feat: add one-time account security tokens"
```

### Task 4: 安全审计 Repository

**Files:**
- Create: `lib/repositories/security-audit.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写脱敏和保留红灯测试**

调用 `recordSecurityAudit()` 时传入包含 `password/token/cookie/authorization/email/ip` 的 metadata，断言只保留白名单键；测试分页按时间倒序，`cleanupExpiredSecurityAudit(db, { now, limit: 100 })` 单次最多删除 100 条。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "security audit redacts" --workers=1`

Expected: FAIL，审计 Repository 不存在。

- [ ] **Step 3: 实现审计 API**

导出：

```js
recordSecurityAudit(db, { eventType, outcome, actorUserId, sessionId, ipHash, userAgentHash, targetHash, metadata, occurredAt, retentionDays })
listSecurityAuditEvents(db, { eventType, outcome, actorUserId, page, pageSize })
cleanupExpiredSecurityAudit(db, { now, limit })
```

metadata 白名单固定为 `reasonCode`、`route`、`method`、`roleId`、`deliveryStatus`、`retryAfterSeconds`。

- [ ] **Step 4: 验证并提交**

Run: `npm run test:api -- --grep "security audit redacts" --workers=1`

```powershell
git add lib/repositories/security-audit.js tests/api.spec.js
git commit -m "feat: record redacted security audit events"
```

### Task 5: Outbox 和 SMTP 适配器

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/repositories/email-outbox.js`
- Create: `lib/services/mailer-service.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 安装 Nodemailer（仅一次低频请求）**

Run: `npm install nodemailer --registry=https://registry.npmmirror.com`

Expected: `package.json` 和 lockfile 增加 Nodemailer。若失败只允许一次延迟重试，第二次失败立即停止。

- [ ] **Step 2: 写 outbox 红灯测试**

测试 development/test 入队后状态为 `queued` 且不调用 SMTP；production 注入 fake transporter，`dispatchNext()` 每次只处理一封；失败达到 3 次后为 `failed`，中间状态为 `deferred`。

- [ ] **Step 3: 运行红灯**

Run: `npm run test:api -- --grep "mail outbox dispatches" --workers=1`

Expected: FAIL，mailer 模块不存在。

- [ ] **Step 4: 实现 outbox 与 mailer**

Repository 导出 `enqueueEmail/listOutbox/findNextQueuedEmail/markEmailSent/markEmailDeferred/markEmailFailed`。`createMailerService({ config, withDatabase, transporter, now })` 返回 `enqueueVerificationEmail()`、`enqueuePasswordResetEmail()`、`dispatchNext()`；不实现批量 dispatch。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:api -- --grep "mail outbox dispatches" --workers=1`

```powershell
git add package.json package-lock.json lib/repositories/email-outbox.js lib/services/mailer-service.js tests/api.spec.js
git commit -m "feat: add bounded email outbox delivery"
```

### Task 6: CSRF 原语和安全路由

**Files:**
- Create: `lib/security/csrf.js`
- Create: `lib/routes/security-routes.js`
- Modify: `lib/http/cookies.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写签名 Token 红灯测试**

固定随机值与时间，断言创建 Token、Cookie/Header 双提交成功，修改 nonce/签名、过期或 Cookie/Header 不一致均失败。Token 不含服务器 secret。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "signed CSRF tokens" --workers=1`

Expected: FAIL，CSRF 模块不存在。

- [ ] **Step 3: 实现 CSRF API**

`createCsrfService({ secret, ttlMs, now, randomBytes })` 返回 `issueToken()`、`verifyToken()` 和 `createCsrfCookie()`。使用 `crypto.timingSafeEqual()`；Cookie 为 `SameSite=Strict`、`Path=/`，production 增加 `Secure`，不加 HttpOnly。

- [ ] **Step 4: 注册 `GET /api/security/csrf`**

响应：

```js
sendJsonWithHeaders(response, 200, { ok: true, csrfToken: issued.token }, {
  "Set-Cookie": csrfService.createCsrfCookie(issued.token)
});
```

- [ ] **Step 5: API 验证并提交**

Run: `npm run test:api -- --grep "signed CSRF tokens|security/csrf" --workers=1`

```powershell
git add lib/security/csrf.js lib/routes/security-routes.js lib/http/cookies.js server.js tests/api.spec.js
git commit -m "feat: issue signed CSRF tokens"
```

### Task 7: 请求安全网关和通用限流

**Files:**
- Create: `lib/security/rate-limit-service.js`
- Create: `lib/security/request-security.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写网关红灯测试**

覆盖：same-origin 浏览器 POST + 正确双提交通过；缺 Token、跨 Origin、`Sec-Fetch-Site: cross-site` 返回 `CSRF_INVALID`；没有 `Origin` 且没有 Fetch Metadata 的非浏览器测试请求不进入浏览器 CSRF 分支；第 121 个同 IP 请求返回 `RATE_LIMITED` 和 `Retry-After`。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "request security gateway" --workers=1`

Expected: FAIL，网关不存在。

- [ ] **Step 3: 实现内存窗口与网关**

`createMemoryRateLimiter({ limit, windowMs, now })` 提供 `consume(key)` 和 `reset()`。`createRequestSecurity()` 对 `/api/` 执行通用限流；只有存在 `Origin` 或 `Sec-Fetch-Site` 的写请求被判定为浏览器请求并强制 CSRF。豁免仅限 GET/HEAD/OPTIONS、测试环境 `/api/test/reset` 和已签名 webhook 路径。

- [ ] **Step 4: 在 server Router 前接入**

安全网关返回 `{ allowed, statusCode, code, retryAfterSeconds }`；拒绝时写 `Retry-After` 并结束响应，允许时继续 dispatch。测试 reset 同时调用 limiter `reset()`。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:api -- --grep "request security gateway|security headers|registers a user|cart" --workers=1`

```powershell
git add lib/security/rate-limit-service.js lib/security/request-security.js server.js tests/api.spec.js
git commit -m "feat: enforce browser request security"
```

### Task 8: 持久化认证限流

**Files:**
- Modify: `lib/security/rate-limit-service.js`
- Modify: `lib/routes/auth-routes.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写 SQLite 双维度红灯测试**

使用确定性时钟测试账号 5 次失败、IP 20 次失败、冷却后恢复、登录成功清除账号失败计数；重建 service 后数据库状态仍生效。注册、重置请求、验证重发使用各自阈值。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "persistent authentication rate limits" --workers=1`

Expected: FAIL，持久化 limiter API 不存在。

- [ ] **Step 3: 实现持久化 limiter**

增加 `createPersistentRateLimiter({ withDatabase, hashIdentifier, now })`，导出 `check(action, identifiers, policy)`、`recordFailure()`、`recordSuccess()`。事务内读取/更新 bucket，返回最严格的 `retryAfterSeconds`，不保存原始 identifier。

- [ ] **Step 4: 接入注册和登录**

注册在创建用户前消费 IP 窗口；登录先检查账号/IP，失败后记录，成功后清理账号失败 bucket。429 统一 `RATE_LIMITED` 并写标准 header。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:api -- --grep "persistent authentication rate limits|registers a user|logs in" --workers=1`

```powershell
git add lib/security/rate-limit-service.js lib/routes/auth-routes.js tests/api.spec.js
git commit -m "feat: persist authentication rate limits"
```

### Task 9: 邮箱验证服务和 API

**Files:**
- Modify: `lib/repositories/users.js`
- Modify: `lib/services/auth-service.js`
- Create: `lib/services/account-security-service.js`
- Create: `lib/routes/account-security-routes.js`
- Modify: `lib/routes/auth-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写邮箱验证红灯测试**

注册响应断言 `emailVerified: false` 且 outbox 有一封验证邮件；重发要求登录并限流；confirm 成功更新用户、重复/过期/错误 Token 均返回 `EMAIL_VERIFICATION_TOKEN_INVALID`。bootstrap 和 migration legacy 用户为已验证。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "email verification lifecycle" --workers=1`

Expected: FAIL，公开用户无 `emailVerified` 或路由 404。

- [ ] **Step 3: 扩展用户 Repository**

`mapUser()` 增加 `emailVerifiedAt/passwordChangedAt`；`createUser()` 接受 `{ emailVerifiedAt = null }`；增加 `markUserEmailVerified()`。`createPublicUser()` 输出 `emailVerified: Boolean(user.emailVerifiedAt)`，不输出时间戳细节。

- [ ] **Step 4: 实现账户安全服务**

`createAccountSecurityService()` 返回 `requestEmailVerification()`、`confirmEmailVerification()`。请求方法生成 Token、只把 raw token放进邮件 payload，不写日志；确认方法消费 Token、更新用户并审计。

- [ ] **Step 5: 注册验证路由并接入注册**

`POST /resend` 使用 `requireUser` 和持久化双维度限流；`POST /confirm` 使用通用 Token 失败限流。注册事务提交后入队验证邮件，邮件失败返回用户注册成功并附 `mailDelivery: "deferred"`，不回滚账号。

- [ ] **Step 6: 验证并提交**

Run: `npm run test:api -- --grep "email verification lifecycle|registers a user|bootstrap" --workers=1`

```powershell
git add lib/repositories/users.js lib/services/auth-service.js lib/services/account-security-service.js lib/routes/account-security-routes.js lib/routes/auth-routes.js server.js tests/api.spec.js
git commit -m "feat: add email verification lifecycle"
```

### Task 10: 密码重置和会话失效

**Files:**
- Modify: `lib/repositories/users.js`
- Modify: `lib/services/account-security-service.js`
- Modify: `lib/routes/account-security-routes.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写密码重置红灯测试**

存在和不存在邮箱的 request 都返回相同 `202` body；存在账号才入队。确认错误/过期 Token 返回统一错误；密码 7/129 字符被拒；成功更新 hash、消费 Token、删除该用户全部 sessions，其他用户会话保留，新密码可登录。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "password reset lifecycle" --workers=1`

Expected: FAIL，密码重置路由 404。

- [ ] **Step 3: 实现 Repository 和 service**

增加 `updateUserPassword(db, userId, { passwordHash, passwordSalt, changedAt })`。`requestPasswordReset()` 对不存在邮箱执行同样的 token hash 计算但不写 Token/outbox；`confirmPasswordReset()` 在事务中消费 Token、更新密码并删除用户 sessions。

- [ ] **Step 4: 注册 API 和限流**

`POST /request` 使用账号/IP 每小时 3/10；`POST /confirm` 使用 IP 15 分钟失败 10 次。成功响应不自动登录。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:api -- --grep "password reset lifecycle|logs in|logs out" --workers=1`

```powershell
git add lib/repositories/users.js lib/services/account-security-service.js lib/routes/account-security-routes.js tests/api.spec.js
git commit -m "feat: add secure password recovery"
```

### Task 11: 结算验证、webhook 签名和安全审计查询

**Files:**
- Create: `lib/security/webhook-signature.js`
- Modify: `lib/http/request-body.js`
- Modify: `lib/routes/security-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`

- [ ] **Step 1: 写高风险链路红灯测试**

未验证用户创建订单返回 `403 EMAIL_VERIFICATION_REQUIRED` 且购物车/库存不变；验证后成功。支付 webhook 无签名/错误签名返回 `401 PAYMENT_WEBHOOK_SIGNATURE_INVALID`，正确 HMAC 对原始 body 成功。customer 不能读审计，super_admin 可分页读取脱敏事件。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:api -- --grep "verified checkout|webhook signature|security audit API" --workers=1`

Expected: FAIL，未验证结算仍成功或 webhook 无签名也成功。

- [ ] **Step 3: 实现原始 body 与签名 helper**

`readRawBody()` 复用现有大小限制并返回 Buffer；`verifyWebhookSignature({ rawBody, signature, secret })` 使用 HMAC-SHA256 与 timing-safe compare。webhook 解析 JSON 必须发生在签名验证之后。

- [ ] **Step 4: 加入结算和审计权限**

订单创建在库存事务前检查当前用户 `emailVerifiedAt`。安全审计接口要求 `PERMISSIONS.AUDIT_READ`；开发 outbox 要求 `super_admin` 且请求远端地址为回环地址。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:api -- --grep "verified checkout|webhook signature|security audit API|checkout|payment webhook" --workers=1`

```powershell
git add lib/security/webhook-signature.js lib/http/request-body.js lib/routes/security-routes.js server.js tests/api.spec.js
git commit -m "feat: secure checkout and payment callbacks"
```

### Task 12: 前端账户安全流程和完整验证

**Files:**
- Modify: `public/js/storefront-app.js`
- Modify: `tests/socks-product-list.spec.js`
- Modify: `tests/api.spec.js`
- Modify: `README.md`

- [ ] **Step 1: 写 UI 红灯测试**

覆盖：所有浏览器写请求自动携带 CSRF；未验证提醒和重发；忘记密码统一成功；从 outbox Token 打开验证/重置页面；429 显示冷却时间且没有自动重试；未验证结算保留表单和购物车。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ui -- --grep "CSRF|email verification|password reset|security cooldown" --workers=1`

Expected: FAIL，UI 和 wrapper 尚不存在。

- [ ] **Step 3: 实现 CSRF fetch wrapper**

集中 `apiFetch()`：首次写请求前获取 `/api/security/csrf`，添加 `X-CSRF-Token`；遇 `CSRF_INVALID` 清空缓存、刷新并只重试一次。429 解析 `Retry-After` 并抛带 `retryAfterSeconds` 的错误，不重试。

- [ ] **Step 4: 实现账户安全界面**

在现有 auth view 增加 `forgot-password`、`reset-password`、`verify-email` mode；账户区增加验证提醒。中英文文案一起补齐，键盘焦点、错误 `aria-live`、移动端布局沿用现有设计系统。

- [ ] **Step 5: 更新部署文档**

README 记录 CSRF/SMTP/webhook/env、180 天审计、开发 outbox 限制和单封串行邮件投递；明确生产 secret 不得提交 Git。

- [ ] **Step 6: 定向 API/UI 回归**

```powershell
npm run test:api -- --grep "CSRF|rate limit|audit|email verification|password reset|verified checkout|webhook" --workers=1
npm run test:ui -- --grep "auth|checkout|CSRF|email verification|password reset|security cooldown" --workers=1
```

Expected: 全部 PASS。

- [ ] **Step 7: 完整单 worker 验证**

```powershell
npm run test:api -- --workers=1
npm run test:ui -- --workers=1
git diff --check
rg -n "password|rawToken|authorization|cookie" lib/repositories/security-audit.js
```

Expected: 所有非跳过测试 PASS；审计实现只出现禁止字段过滤规则，不写入敏感值。

- [ ] **Step 8: 清理测试产物并提交**

恢复测试夹具 JSON，只删除本轮明确创建的 outbox/上传测试产物，确认 `git status --short` 后提交：

```powershell
git add public/js/storefront-app.js tests/socks-product-list.spec.js tests/api.spec.js README.md
git commit -m "feat: complete storefront account security flows"
```

- [ ] **Step 9: 低频推送**

Run: `git push origin feature/socks-after-sales-payment-admin`

Expected: 成功推送。网络失败只允许一次延迟重试，再失败立即停止，不循环请求。

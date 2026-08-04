# 商城安全防护与账户恢复设计

## 1. 背景

商城已经具备数据库会话、角色权限、后台操作审计和少量局部限流，但安全能力仍然分散：浏览器写请求没有统一 CSRF 防护，认证接口没有持久化防刷，审计日志无法覆盖账户安全事件，也缺少邮箱验证和密码重置流程。

本阶段在保留现有 Node.js 原生 HTTP、SQLite 和原生前端架构的前提下，建立统一请求安全层与账户安全服务。实现过程必须保持单会话、低并发和单 worker 测试，不执行压力测试、循环健康检查或批量外部服务重试。

## 2. 目标

- 为所有浏览器写请求提供统一 CSRF、Origin 和 Fetch Metadata 校验。
- 建立普通接口内存限流与认证接口 SQLite 持久化限流的混合防刷体系。
- 统一记录账户、请求安全和邮件投递审计，敏感数据脱敏并保留 180 天。
- 支持开发/测试本地邮件 outbox 和生产 SMTP 投递。
- 支持邮箱验证、验证邮件重发、密码重置和会话失效。
- 未验证用户可以登录、浏览和加购，但结算和未来的邮箱修改必须先完成验证。
- 保持后续迁移到 `lib/app.js` 的清晰模块边界，不向仍然较大的 `server.js` 增加领域逻辑。

## 3. 非目标

- 不接入第三方身份平台、SSO、OAuth 或短信验证。
- 不引入 Redis、消息队列或分布式锁。
- 不实现 CAPTCHA；达到阈值后使用冷却和统一响应。
- 不保存原始密码、Token、完整 IP 或未脱敏的安全请求元数据。
- 不执行真实 SMTP 批量发送或压力测试。

## 4. 总体架构

采用“统一安全网关 + 账户安全服务”方案。

请求进入 API 后，先经过请求安全层，再进入 Router 或尚未拆出的旧路由：

1. 解析可信客户端 IP，仅在显式配置可信代理时读取转发头。
2. 对普通 API 执行内存滑动窗口限流。
3. 对浏览器写请求校验 `Origin`、`Sec-Fetch-Site` 和签名 CSRF Token。
4. 对认证及账户安全接口执行 SQLite 持久化双维度限流。
5. 拒绝或敏感结果写入统一安全审计。
6. 通过后再调用领域路由。

核心模块边界：

- `lib/security/request-security.js`：请求来源、Fetch Metadata、CSRF 和通用限流入口。
- `lib/security/csrf.js`：生成、签名和验证双提交 Token。
- `lib/security/rate-limit-service.js`：内存和 SQLite 限流策略。
- `lib/repositories/security-audit.js`：安全审计写入、分页读取和过期清理。
- `lib/repositories/account-tokens.js`：邮箱验证与密码重置 Token 的哈希持久化。
- `lib/services/mailer-service.js`：outbox 入队、开发投递和生产 SMTP 串行投递。
- `lib/services/account-security-service.js`：邮箱验证、重发、密码重置和会话失效编排。
- `lib/routes/security-routes.js`：CSRF Token 接口。
- `lib/routes/account-security-routes.js`：邮箱验证与密码重置接口。

这些模块由当前服务器装配，后续可不改接口地迁移到 `lib/app.js`。

## 5. 数据模型

新增一个幂等 migration。

### 5.1 用户验证状态

为 `users` 增加：

```text
email_verified_at TEXT
password_changed_at TEXT
```

迁移前已有用户和 bootstrap 超级管理员回填为已验证，避免锁死已有账户；迁移后新注册用户的 `email_verified_at` 为 `NULL`。

### 5.2 邮箱验证 Token

`email_verification_tokens` 包含：

```text
id, user_id, token_hash, expires_at, consumed_at,
requested_ip_hash, created_at
```

Token 有效期 24 小时，只保存 SHA-256 哈希。为同一用户创建新 Token 时使所有旧未使用 Token 失效；确认成功后 Token 一次性消费。

### 5.3 密码重置 Token

`password_reset_tokens` 包含：

```text
id, user_id, token_hash, expires_at, consumed_at,
requested_ip_hash, created_at
```

Token 有效期 30 分钟，只保存哈希。新请求使该用户旧 Token 失效；重置成功后消费全部 Token 并删除该用户全部会话。

### 5.4 持久化限流

`security_rate_limit_buckets` 包含：

```text
key_hash, action, window_started_at, attempt_count,
failure_count, blocked_until, updated_at
```

主键由动作和账号/IP 哈希构成。数据库不保存原始邮箱或 IP。

### 5.5 安全审计

`security_audit_events` 包含：

```text
id, event_type, outcome, actor_user_id, session_id,
ip_hash, user_agent_hash, target_hash, metadata,
occurred_at, expires_at
```

`metadata` 仅允许白名单字段，不得写入密码、原始 Token、完整邮箱、Cookie、Authorization 或原始 IP。审计默认保留 180 天。

### 5.6 邮件 outbox

`email_outbox` 包含：

```text
id, recipient, template_id, payload, status,
attempt_count, next_attempt_at, last_error,
created_at, sent_at
```

开发/测试保存在本地 outbox；生产由 SMTP 发送器串行处理。失败采用有限次数延迟重试，不并发批量重试。

## 6. CSRF 和请求来源防护

`GET /api/security/csrf` 返回签名 Token，并设置非 HttpOnly 的 `socks_csrf` Cookie。Token 结构为随机 nonce 与服务器 HMAC 签名；服务器密钥来自 `CSRF_SECRET`，生产缺失时启动失败。

所有 `POST`、`PUT`、`PATCH`、`DELETE` 浏览器请求必须满足：

- `X-CSRF-Token` 与 `socks_csrf` Cookie 完全一致。
- HMAC 签名有效且未超过有效期。
- `Origin` 属于配置的同源列表。
- `Sec-Fetch-Site` 不得为 `cross-site`。

登录和退出成功后轮换 Token。前端 Token 失效时只允许重新获取并重试一次，不循环重试。

例外：

- `GET`、`HEAD` 和 `OPTIONS` 不要求 CSRF Token。
- `/api/test/reset` 仅在测试环境豁免，并继续受测试环境开关保护。
- 支付 webhook 不使用浏览器 CSRF，但必须使用 `PAYMENT_WEBHOOK_SECRET` 对原始请求体执行 HMAC 签名验证；生产缺少密钥时启动失败。

拒绝统一返回 `403 CSRF_INVALID`，不暴露具体签名差异。

## 7. 限流与防刷

### 7.1 通用接口

按客户端 IP 使用内存滑动窗口，每分钟最多 120 次。响应返回 `429 RATE_LIMITED` 和标准 `Retry-After`。

### 7.2 认证和账户安全接口

使用 SQLite 持久化，并同时检查 IP 与账号标识哈希：

- 登录：每账号 5 次失败或每 IP 20 次失败后冷却 15 分钟。
- 注册：每 IP 每小时 5 次。
- 密码重置请求：每账号每小时 3 次、每 IP 每小时 10 次。
- 邮箱验证重发：每用户每小时 3 次、每 IP 每小时 10 次。
- Token 验证失败：每 IP 15 分钟最多 10 次。

登录成功清理对应账号失败计数。密码重置请求无论账号是否存在均返回相同 `202` 响应和相近处理路径，避免账号枚举。达到阈值后不自动重试。

## 8. 邮件投递

开发和测试使用数据库 outbox，不连接真实 SMTP。生产使用：

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

生产缺少任一必需配置时启动失败，不静默丢弃邮件。发送器单次处理一封邮件，限制重试次数并使用延迟重试；不得在一个请求中循环重试或并发发送大量邮件。

开发环境的 outbox 查看入口仅允许回环地址上的 `super_admin` 使用；测试直接通过 Repository 断言，不依赖真实邮件。

## 9. 邮箱验证流程

接口：

```text
POST /api/auth/email-verification/resend
POST /api/auth/email-verification/confirm
```

注册成功后用户保持登录，响应公开用户包含 `emailVerified: false`，系统创建 24 小时 Token 并入队验证邮件。重发要求登录并受双维度限流。

邮件链接打开商城验证结果页，页面通过 POST 提交 Token。成功后设置 `email_verified_at`、消费 Token、使其他 Token 失效并写审计。无效、已用和过期统一返回 `EMAIL_VERIFICATION_TOKEN_INVALID`。

未验证用户可以浏览、加购、管理普通购物车；创建订单和未来修改邮箱时返回 `403 EMAIL_VERIFICATION_REQUIRED`。前端显示验证提示和重发入口。

## 10. 密码重置流程

接口：

```text
POST /api/auth/password-reset/request
POST /api/auth/password-reset/confirm
```

请求接口始终返回 `202` 与统一文案。存在账号时创建 30 分钟 Token 并入队邮件；不存在账号时执行等价的哈希工作和审计，但不创建邮件。

确认接口接收 Token 和新密码。密码长度为 8 至 128 个字符，不强制大小写、数字或特殊字符组合。成功后：

1. 更新加盐密码哈希和 `password_changed_at`。
2. 消费该用户全部重置 Token。
3. 删除该用户全部会话。
4. 写入安全审计。
5. 要求使用新密码重新登录。

无效、已用和过期统一返回 `PASSWORD_RESET_TOKEN_INVALID`；密码不合规返回 `PASSWORD_POLICY_INVALID`。

## 11. 前端交互

- API 请求封装自动获取并附加 CSRF Token。
- CSRF 过期只刷新并重试一次。
- 429 响应显示 `Retry-After` 对应的冷却时间，不自动重试。
- 账户区域显示邮箱验证状态和重发按钮。
- 增加忘记密码页、重置密码页和邮箱验证结果页。
- 结算遇到 `EMAIL_VERIFICATION_REQUIRED` 时保留购物车和表单状态，展示验证操作，不创建订单。
- 生产界面不显示开发 outbox 入口。

## 12. 错误码

新增：

```text
CSRF_INVALID
RATE_LIMITED
EMAIL_VERIFICATION_REQUIRED
EMAIL_VERIFICATION_TOKEN_INVALID
PASSWORD_RESET_TOKEN_INVALID
PASSWORD_POLICY_INVALID
MAIL_DELIVERY_DEFERRED
PAYMENT_WEBHOOK_SIGNATURE_INVALID
```

安全错误不返回原始 Token、哈希、邮箱存在性、内部限流 key 或 SMTP 详情。

## 13. 审计范围与保留

记录以下事件及成功/失败结果：

- 注册、登录、退出。
- 邮箱验证发送、成功、失败。
- 密码重置请求、成功、失败。
- CSRF、Origin、Fetch Metadata 拒绝。
- 限流触发和解除。
- 密码变更与会话失效。
- SMTP 成功、延期和最终失败。

现有角色、订单、退款等后台审计保持原表和业务契约，通过统一查询层汇总。`audit.read` 可分页读取安全审计，但不能修改。过期清理每次只删除固定小批量，避免长时间锁库。

## 14. 测试策略

所有测试使用单 worker 和确定性时钟，不执行压力测试：

1. migration、Token 哈希、失效和幂等测试。
2. CSRF 正常、缺失、伪造、跨来源和 webhook 签名测试。
3. 内存与 SQLite 限流窗口、账号/IP 双维度和冷却测试。
4. 邮箱验证、重发、过期、重复使用和结算拦截测试。
5. 密码重置统一响应、Token 失效、密码策略和全部会话注销测试。
6. SMTP 使用测试适配器和本地 outbox，不向真实邮箱发送。
7. UI 覆盖验证提醒、忘记密码、重置结果、结算拦截和 429 提示。
8. 静态扫描确认日志与响应不包含密码、原始 Token 或旧安全绕过。

## 15. 实施顺序

1. 增加安全数据 migration、配置、Token Repository、outbox 和 SMTP 适配器。
2. 实现 CSRF、安全请求网关、通用/持久化限流和安全审计。
3. 实现邮箱验证、密码重置 API、会话失效和结算验证限制。
4. 实现前端流程、后台审计查询、完整回归和部署文档。

每个阶段严格执行 TDD，先观察目标失败，再写最小实现；每阶段单独提交。外部网络失败不循环重试，SMTP 和 Git 推送均采用低频、有限次数操作。

## 16. 验收标准

- 浏览器写请求缺少或伪造 CSRF Token 时被统一拒绝。
- 跨来源请求和无效 Fetch Metadata 被拒绝。
- 认证接口在服务重启后仍保留持久化限流状态。
- 安全审计不包含明文敏感数据，并按 180 天策略小批量清理。
- 开发/测试可从本地 outbox 完整验证邮件流程，生产可通过 SMTP 投递。
- 未验证用户不能结算，验证后无需重新注册即可继续。
- 密码重置响应不泄露账号存在性，成功后全部旧会话失效。
- 支付 webhook 必须通过签名验证。
- API 与 UI 定向回归通过，测试始终使用单 worker。

# 商城生产运维基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development when explicitly needed for independent tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为商城增加可验证的 CI、Ubuntu VPS Docker Compose 部署、SQLite 本地与 S3 双重备份、Sentry 错误监控和生产 JSON 日志。

**Architecture:** 应用继续使用 Node.js 和 SQLite，新增小型运维模块处理配置、日志、请求上下文、错误报告、备份和进程生命周期。GitHub Actions 串行验证并构建镜像，生产发布经过 Environment 审批后通过 SSH 部署到 Caddy 反向代理后的单机 Docker Compose，失败时只回滚镜像。

**Tech Stack:** Node.js 22、Node SQLite、Playwright、Docker Compose、Caddy、GitHub Actions、GitHub Container Registry、Sentry、AWS SDK v3 S3 client、systemd timer。

---

## File Map

### Runtime configuration and observability

- Modify: `package.json` / `package-lock.json`：增加 Sentry、S3 SDK 和运维测试/脚本命令。
- Modify: `lib/config.js`：生产日志、版本、域名、Sentry、备份和 S3 配置。
- Modify: `.env.example`：补充通用可选运维配置。
- Create: `.env.production.example`：完整生产变量模板，不包含密钥值。
- Modify: `lib/logger.js`：文本/JSON 输出、递归脱敏、基础上下文和错误报告 hook。
- Create: `lib/http/request-context.js`：请求 ID 校验、生成、响应传播和耗时。
- Create: `lib/monitoring/error-reporter.js`：Sentry 适配器和二次脱敏。
- Create: `lib/server-lifecycle.js`：信号、未捕获异常和受限优雅关闭。
- Modify: `lib/routes/health-routes.js`：存活与数据库就绪检查。
- Modify: `server.js`：接入上述模块和顶层请求错误边界。

### Backup and recovery

- Create: `lib/database-backup.js`：一致性快照、完整性检查、gzip、SHA-256、保留清理、S3 上传和恢复原语。
- Create: `scripts/backup-database.js`：单次备份 CLI。
- Create: `scripts/restore-database.js`：校验后恢复 CLI。
- Create: `scripts/migrate-database.js`：容器部署前 migration CLI。
- Create: `scripts/restore-production.sh`：主机侧停机验证和显式恢复编排。

### Container and deployment

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.production.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/systemd/socks-backup.service`
- Create: `deploy/systemd/socks-backup.timer`
- Create: `scripts/deploy-production.sh`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-production.yml`

### Tests and documentation

- Create: `tests/operations.spec.js`：配置、日志、监控、备份、恢复和基础设施静态契约。
- Modify: `tests/api.spec.js`：请求 ID、HTTP 日志、就绪检查和顶层错误边界。
- Modify: `README.md`：生产部署、备份、恢复、监控和故障处理手册。

## Task 1: 运维依赖、测试入口与严格配置

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/config.js`
- Modify: `.env.example`
- Create: `.env.production.example`
- Create: `tests/operations.spec.js`

- [ ] **Step 1: 单次安装生产依赖**

Run:

```powershell
npm install @sentry/node @aws-sdk/client-s3 --registry=https://registry.npmmirror.com
```

Expected: 一次请求成功更新 `package.json` 和 lockfile。若失败，等待后只允许再尝试一次；第二次失败立即停止，不循环请求。

- [ ] **Step 2: 写生产运维配置红灯测试**

在 `tests/operations.spec.js` 中直接导入 `createConfig()`，覆盖生产缺失公共域名、JSON 日志、版本、备份目录和 S3 必填值时抛错，以及测试环境使用安全默认值：

```js
const { test, expect } = require("@playwright/test");
const { createConfig } = require("../lib/config");

test("requires complete production operations config", () => {
  const base = {
    NODE_ENV: "production",
    CSRF_SECRET: "csrf-secret",
    SECURITY_HASH_SECRET: "hash-secret",
    PAYMENT_WEBHOOK_SECRET: "webhook-secret",
    ALLOWED_ORIGINS: "https://shop.example.com",
    SMTP_HOST: "smtp.example.com",
    SMTP_SECURE: "true",
    SMTP_USER: "mailer",
    SMTP_PASSWORD: "smtp-secret",
    SMTP_FROM: "shop@example.com",
    LOG_FORMAT: "json",
    SERVICE_VERSION: "3e45734",
    PUBLIC_BASE_URL: "https://shop.example.com",
    BACKUP_DIR: "/app/backups",
    S3_REGION: "auto",
    S3_BUCKET: "socks-backups",
    S3_ACCESS_KEY_ID: "access-key",
    S3_SECRET_ACCESS_KEY: "secret-key"
  };

  expect(() => createConfig({ ...base, PUBLIC_BASE_URL: "" }))
    .toThrow("PUBLIC_BASE_URL is required in production");
  expect(createConfig(base)).toMatchObject({
    logFormat: "json",
    serviceVersion: "3e45734",
    publicBaseUrl: "https://shop.example.com",
    backup: { localRetentionDays: 7 },
    sentry: { environment: "production" },
    s3: { bucket: "socks-backups" }
  });
});
```

- [ ] **Step 3: 运行红灯**

Run: `npx playwright test tests/operations.spec.js --grep "production operations config" --workers=1`

Expected: FAIL，当前 `createConfig()` 没有 `logFormat`、`backup`、`sentry` 和 `s3`。

- [ ] **Step 4: 实现配置解析**

在 `lib/config.js` 增加 URL、字符串枚举和生产必填解析，返回稳定结构：

```js
const allowedLogFormats = new Set(["text", "json"]);

function parseHttpsUrl(env, key, nodeEnv) {
  const value = requireProductionValue(env, key, nodeEnv);
  if (!value) return "";
  const url = new URL(value);
  if (nodeEnv === "production" && url.protocol !== "https:") {
    throw new Error(`${key} must use https in production`);
  }
  return url.origin;
}
```

`createConfig()` 增加：

```js
logFormat,
serviceVersion: String(env.SERVICE_VERSION || "development").trim(),
publicBaseUrl: parseHttpsUrl(env, "PUBLIC_BASE_URL", nodeEnv),
sentry: {
  dsn: String(env.SENTRY_DSN || "").trim(),
  environment: String(env.SENTRY_ENVIRONMENT || nodeEnv).trim()
},
backup: {
  dir: path.resolve(rootDir, String(env.BACKUP_DIR || "backups")),
  localRetentionDays: parseIntegerEnv(env, "BACKUP_LOCAL_RETENTION_DAYS", 7, { min: 1, max: 365 })
},
s3: {
  endpoint: String(env.S3_ENDPOINT || "").trim(),
  region: requireProductionValue(env, "S3_REGION", nodeEnv) || "auto",
  bucket: requireProductionValue(env, "S3_BUCKET", nodeEnv),
  accessKeyId: requireProductionValue(env, "S3_ACCESS_KEY_ID", nodeEnv),
  secretAccessKey: requireProductionValue(env, "S3_SECRET_ACCESS_KEY", nodeEnv),
  forcePathStyle: parseBooleanEnv(env, "S3_FORCE_PATH_STYLE", false)
}
```

生产环境还必须要求 `LOG_FORMAT=json` 和非空 `SERVICE_VERSION`；非生产 S3 字段允许为空。

- [ ] **Step 5: 更新环境模板和测试脚本**

`package.json` 增加：

```json
"test:ops": "playwright test tests/operations.spec.js --workers=1",
"db:backup": "node scripts/backup-database.js",
"db:restore": "node scripts/restore-database.js",
"db:migrate": "node scripts/migrate-database.js"
```

`.env.production.example` 写出全部生产变量但所有秘密值保持空白；`.env.example` 只补充非生产默认值和注释。

- [ ] **Step 6: 验证并提交**

Run: `npm run test:ops -- --grep "production operations config" --workers=1`

Expected: PASS。

```powershell
git add package.json package-lock.json lib/config.js .env.example .env.production.example tests/operations.spec.js
git commit -m "feat: configure production operations"
```

## Task 2: 生产 JSON 日志与递归脱敏

**Files:**
- Modify: `lib/logger.js`
- Modify: `tests/operations.spec.js`
- Modify: `server.js`

- [ ] **Step 1: 写日志红灯测试**

测试 JSON 输出、base context、级别过滤，以及任意深度的敏感键和值不会出现：

```js
test("writes redacted production JSON logs", () => {
  const lines = [];
  const logger = createLogger({
    level: "info",
    format: "json",
    baseContext: { environment: "production", serviceVersion: "abc123" },
    sink: (line) => lines.push(line),
    now: () => new Date("2026-08-04T00:00:00.000Z")
  });
  logger.info("request.completed", {
    requestId: "req-12345678",
    password: "secret",
    nested: { authorization: "Bearer secret", statusCode: 200 }
  });
  expect(JSON.parse(lines[0])).toEqual(expect.objectContaining({
    timestamp: "2026-08-04T00:00:00.000Z",
    level: "info",
    event: "request.completed",
    environment: "production",
    serviceVersion: "abc123",
    requestId: "req-12345678",
    nested: { authorization: "[REDACTED]", statusCode: 200 }
  }));
  expect(lines[0]).not.toContain("secret");
});
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "production JSON logs" --workers=1`

Expected: FAIL，当前 logger 只输出文本且不脱敏。

- [ ] **Step 3: 实现日志 API**

`lib/logger.js` 导出 `sanitizeLogContext()` 和兼容旧调用的 `createLogger()`：

```js
const sensitiveKey = /password|token|cookie|authorization|signature|smtp|secret|email|\bip\b/i;

function sanitizeLogContext(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeLogContext(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? "[REDACTED]" : sanitizeLogContext(item, seen)
  ]));
}
```

JSON 格式输出 `{ timestamp, level, event, ...baseContext, ...sanitizedContext }`；text 格式保持现有开发体验。`error` 级别可调用注入的 `reportError(event, sanitizedContext)`，报告失败必须被 logger 捕获并忽略，不能递归记录。

- [ ] **Step 4: 在服务器创建带生产上下文的 logger**

```js
const logger = createLogger({
  level: config.logLevel,
  format: config.logFormat,
  baseContext: {
    environment: config.nodeEnv,
    serviceVersion: config.serviceVersion
  }
});
```

- [ ] **Step 5: 验证现有与新增日志测试**

Run: `npm run test:api -- --grep "structured logger" --workers=1`

Run: `npm run test:ops -- --grep "production JSON logs" --workers=1`

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```powershell
git add lib/logger.js server.js tests/operations.spec.js tests/api.spec.js
git commit -m "feat: emit redacted production logs"
```

## Task 3: 请求 ID 与 HTTP 完成日志

**Files:**
- Create: `lib/http/request-context.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写请求上下文红灯测试**

```js
test("validates and propagates request ids", () => {
  const responseHeaders = {};
  const context = createRequestContext({
    headers: { "x-request-id": "edge-request-123" },
    method: "GET"
  }, {
    setHeader: (name, value) => { responseHeaders[name] = value; }
  }, {
    now: () => 1000,
    randomUUID: () => "generated-request-id"
  });
  expect(context.requestId).toBe("edge-request-123");
  expect(responseHeaders["X-Request-Id"]).toBe("edge-request-123");
  expect(context.complete(2000)).toEqual({ durationMs: 1000 });
});
```

同时测试过短、超过 128 字符或包含空格/控制字符的请求 ID 被替换。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "request ids" --workers=1`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现请求上下文**

`createRequestContext(request, response, options)` 使用 `/^[A-Za-z0-9._-]{8,128}$/` 校验上游 ID，否则调用 `crypto.randomUUID()`；立即设置 `X-Request-Id`。`attachRequestCompletionLog()` 监听一次 `finish` 和 `close`，只记录一次：

```js
logger.info("http.request.completed", {
  requestId,
  method: request.method,
  route: requestUrl.pathname,
  statusCode: response.statusCode,
  durationMs
});
```

route 只使用 pathname，不记录 query string。

- [ ] **Step 4: 接入服务器最外层**

在请求安全检查之前创建上下文并注册完成日志；把 `requestContext` 传给 Router context。响应头在安全拒绝、404 和异常响应中都必须存在。

- [ ] **Step 5: API 验证**

在 `tests/api.spec.js` 增加：

```js
test("returns a validated request id for API responses", async ({ request }) => {
  const response = await request.get("/api/health", {
    headers: { "x-request-id": "client-request-123" }
  });
  expect(response.headers()["x-request-id"]).toBe("client-request-123");
});
```

Run: `npm run test:api -- --grep "request id" --workers=1`

Expected: PASS。

- [ ] **Step 6: 提交**

```powershell
git add lib/http/request-context.js server.js tests/api.spec.js tests/operations.spec.js
git commit -m "feat: trace HTTP requests safely"
```

## Task 4: Sentry 错误报告适配器

**Files:**
- Create: `lib/monitoring/error-reporter.js`
- Modify: `lib/logger.js`
- Modify: `server.js`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写无 DSN 和脱敏红灯测试**

使用 fake Sentry SDK，禁止测试访问网络：

```js
test("reports sanitized errors and degrades without a DSN", async () => {
  const captured = [];
  const reporter = createErrorReporter({
    dsn: "https://public@example.invalid/1",
    environment: "production",
    release: "abc123",
    sdk: {
      init: () => {},
      captureException: (error, hint) => captured.push({ error, hint }),
      captureMessage: () => {},
      flush: async () => true
    }
  });
  reporter.captureException(new Error("boom"), {
    requestId: "req-12345678",
    cookie: "session-secret",
    route: "/api/orders"
  });
  expect(captured[0].hint.contexts.operation).toEqual({
    requestId: "req-12345678",
    cookie: "[REDACTED]",
    route: "/api/orders"
  });
  expect(createErrorReporter({ dsn: "" }).enabled).toBe(false);
});
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "sanitized errors" --workers=1`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现错误报告接口**

导出：

```js
createErrorReporter({ dsn, environment, release, sdk, logger }) => ({
  enabled,
  captureException(error, context),
  captureMessage(event, context),
  flush(timeoutMs)
})
```

初始化 Sentry 时设置 `tracesSampleRate: 0`、关闭默认 PII，并在 `beforeSend` 删除 `request.data`、cookies、敏感 headers、user email/ip 和敏感 extra/context。所有 SDK 调用都用 `try/catch` 降级，`flush` 最长 2000ms。

- [ ] **Step 4: 接入 logger 和服务器**

先创建 reporter，再将以下 hook 注入 logger：

```js
reportError: (event, context) => errorReporter.captureMessage(event, context)
```

明确异常路径使用 `captureException(error, { requestId, route })`，不传 request body 或完整 headers。

- [ ] **Step 5: 验证**

Run: `npm run test:ops -- --grep "sanitized errors|DSN" --workers=1`

Expected: fake SDK 测试 PASS，测试日志中不出现 DSN 或敏感值。

- [ ] **Step 6: 提交**

```powershell
git add lib/monitoring/error-reporter.js lib/logger.js server.js tests/operations.spec.js
git commit -m "feat: report sanitized production errors"
```

## Task 5: 顶层请求边界、就绪检查与优雅关闭

**Files:**
- Create: `lib/server-lifecycle.js`
- Modify: `lib/routes/health-routes.js`
- Modify: `server.js`
- Modify: `tests/api.spec.js`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写 lifecycle 和就绪红灯测试**

`tests/operations.spec.js` 使用 `EventEmitter` fake process/fake server，断言 SIGTERM 只触发一次 close、flush 有上限、未捕获异常设置非零退出码。`tests/api.spec.js` 断言 `/api/ready` 成功且不返回数据库路径。

```js
test("closes the server once on SIGTERM", async () => {
  const processRef = new EventEmitter();
  processRef.exitCode = 0;
  let closes = 0;
  const dispose = registerServerLifecycle({
    processRef,
    server: { close: (callback) => { closes += 1; callback(); }, closeIdleConnections: () => {} },
    logger: { info: () => {}, error: () => {} },
    errorReporter: { captureException: () => {}, flush: async () => true },
    shutdownTimeoutMs: 50
  });
  processRef.emit("SIGTERM");
  processRef.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(closes).toBe(1);
  dispose();
});
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "SIGTERM" --workers=1`

Expected: FAIL，lifecycle 模块不存在。

- [ ] **Step 3: 实现进程生命周期**

`registerServerLifecycle()` 监听 `SIGTERM`、`SIGINT`、`uncaughtException`、`unhandledRejection`。首次关闭时执行 `server.close()`、`server.closeIdleConnections?.()`、`errorReporter.flush(2000)`；超时后设置 `exitCode=1`。函数返回解除监听的 disposer，便于测试。

- [ ] **Step 4: 增加数据库就绪检查**

`registerHealthRoutes(router, { checkReadiness })`：

```js
router.get("/api/ready", async ({ response, sendJson, sendError }) => {
  try {
    await services.checkReadiness();
    sendJson(response, 200, { ok: true, status: "ready" });
  } catch {
    sendError(response, 503, "SERVICE_NOT_READY", "Service is not ready.");
  }
});
```

`server.js` 的 `checkReadiness()` 执行 `SELECT 1 AS ready`，不回传错误详情。

- [ ] **Step 5: 建立顶层请求错误边界**

把现有 async 请求体移动到 `handleHttpRequest(request, response)`，外层 server callback 统一捕获：

```js
const server = http.createServer((request, response) => {
  handleHttpRequest(request, response).catch((error) => {
    errorReporter.captureException(error, {
      requestId: response.getHeader("X-Request-Id") || "",
      route: new URL(request.url, "http://localhost").pathname
    });
    logger.error("http.request.unhandled", { message: error.message });
    if (!response.headersSent) sendError(response, 500, "INTERNAL_ERROR", "Unexpected server error.");
    else response.destroy();
  });
});
```

- [ ] **Step 6: 验证并提交**

Run: `npm run test:api -- --grep "ready|request id|health" --workers=1`

Run: `npm run test:ops -- --grep "SIGTERM|unhandled" --workers=1`

Expected: 全部 PASS。

```powershell
git add lib/server-lifecycle.js lib/routes/health-routes.js server.js tests/api.spec.js tests/operations.spec.js
git commit -m "feat: harden server lifecycle"
```

## Task 6: SQLite 一致性快照、校验和压缩

**Files:**
- Create: `lib/database-backup.js`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写备份红灯测试**

使用 `testInfo.outputPath()` 和临时 SQLite，不操作项目 `data/`：

```js
test("creates an integrity-checked compressed SQLite backup", async ({}, testInfo) => {
  const sourcePath = testInfo.outputPath("source.db");
  const backupDir = testInfo.outputPath("backups");
  const db = createDatabase(sourcePath);
  db.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('kept');");
  db.close();

  const result = await createDatabaseBackup({
    sourcePath,
    backupDir,
    serviceVersion: "abc1234",
    now: () => new Date("2026-08-04T03:30:00.000Z")
  });
  expect(result.archivePath).toMatch(/socks-store-20260804T033000Z-abc1234\.db\.gz$/);
  expect(await fs.readFile(result.checksumPath, "utf8")).toContain(result.sha256);
  expect(result.integrity).toBe("ok");
});
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "compressed SQLite backup" --workers=1`

Expected: FAIL，backup 模块不存在。

- [ ] **Step 3: 实现一致性快照**

`createDatabaseBackup()`：

1. `resolve()` 并创建 backupDir。
2. 创建同目录临时 `.db.partial`，若已存在则拒绝。
3. 打开源数据库并执行参数经过 SQL 单引号转义的 `VACUUM INTO '<temp>'`。
4. 单独打开临时数据库执行 `PRAGMA integrity_check`，结果不为 `ok` 时删除临时输出并抛错。
5. 使用 `pipeline(createReadStream(), createGzip(), createWriteStream())` 写 `.gz.partial`。
6. 计算压缩文件 SHA-256，原子重命名并写 `.sha256`。
7. 删除未压缩临时快照。

导出 `createDatabaseBackup()`、`verifyBackupArchive()`、`formatBackupTimestamp()`。所有清理只使用函数本轮创建的精确绝对路径。

- [ ] **Step 4: 增加失败清理测试**

传入损坏源数据库，断言抛错且 backupDir 不保留正式 `.gz`/`.sha256`。再测试文件名只包含 UTC 数字、短 SHA 和固定后缀。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:ops -- --grep "SQLite backup|backup archive" --workers=1`

Expected: PASS。

```powershell
git add lib/database-backup.js tests/operations.spec.js
git commit -m "feat: create consistent SQLite backups"
```

## Task 7: 本地保留与 S3 串行上传

**Files:**
- Modify: `lib/database-backup.js`
- Create: `scripts/backup-database.js`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写保留和上传红灯测试**

创建 8 天前、6 天前和无关文件，断言只删除匹配固定格式且过期的备份 bundle。使用 fake `client.send()` 前两次失败、第三次成功，断言调用严格串行且等待函数收到 `[1000, 2000]`：

```js
const result = await uploadBackupBundle({
  client,
  bucket: "backups",
  archivePath,
  checksumPath,
  maxAttempts: 3,
  delay: async (ms) => delays.push(ms)
});
expect(result.attempts).toBe(3);
expect(delays).toEqual([1000, 2000]);
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "backup retention|S3 backup" --workers=1`

Expected: FAIL，保留和上传函数不存在。

- [ ] **Step 3: 实现安全保留**

`cleanupExpiredLocalBackups({ backupDir, retentionDays, now })` 只接受正数保留期，并只匹配：

```js
/^socks-store-\d{8}T\d{6}Z-[a-f0-9]{7,40}\.db\.gz(?:\.sha256)?$/
```

按每个 bundle 的 archive mtime 判断过期，使用精确 `unlink()`，不递归删除目录。

- [ ] **Step 4: 实现 S3 client 与有限重试**

`createS3Client(config)` 使用显式 endpoint/region/credentials/forcePathStyle。`uploadBackupBundle()` 先上传 archive，再上传 checksum，单文件最多 3 次，等待 1 秒和 2 秒，不并行、不无限重试。对象 key 为 `sqlite/YYYY/MM/<filename>`。

- [ ] **Step 5: 实现单次备份 CLI**

`scripts/backup-database.js`：加载 config，调用 `createDatabaseBackup()`，成功后清理本地过期文件并上传 S3。输出一条不含凭据的 JSON 结果；失败时通过 logger 和 errorReporter 记录，设置 `process.exitCode = 1`。

- [ ] **Step 6: 验证并提交**

Run: `npm run test:ops -- --grep "backup retention|S3 backup|backup CLI" --workers=1`

Expected: PASS，fake client 外没有网络请求。

```powershell
git add lib/database-backup.js scripts/backup-database.js tests/operations.spec.js
git commit -m "feat: retain and upload database backups"
```

## Task 8: 显式安全恢复与 migration CLI

**Files:**
- Modify: `lib/database-backup.js`
- Create: `scripts/restore-database.js`
- Create: `scripts/migrate-database.js`
- Create: `scripts/restore-production.sh`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写恢复拒绝红灯测试**

覆盖：缺少 `--confirm RESTORE`、备份路径越过允许目录、checksum 不匹配、gzip 损坏、SQLite integrity 失败时均不修改目标数据库。

```js
await expect(restoreDatabaseBackup({
  archivePath,
  backupDir,
  targetPath,
  confirmation: "wrong"
})).rejects.toThrow("Explicit RESTORE confirmation is required");
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "database restore" --workers=1`

Expected: FAIL，恢复函数不存在。

- [ ] **Step 3: 实现恢复原语**

`restoreDatabaseBackup()` 必须：

1. 要求 confirmation 精确等于 `RESTORE`。
2. 使用 `path.relative()` 验证 archive 在 backupDir 内且文件名匹配固定格式。
3. 读取相邻 `.sha256` 并 timing-safe 比较计算值。
4. 解压到 target 同目录临时文件并运行 integrity check。
5. 先调用 `createDatabaseBackup()` 为当前 target 创建 `pre-restore` 备份。
6. 将 target、`-wal`、`-shm` 的精确路径移到带时间戳的 rollback 路径。
7. 原子移动验证后的临时数据库到 target。
8. 任一步骤失败时恢复原 target。

- [ ] **Step 4: 实现 CLI 与主机侧运行检查**

`scripts/restore-database.js` 只解析 `--file` 和 `--confirm`，不接受 target path 用户输入，target 固定来自 config。`scripts/restore-production.sh`：

```bash
if docker compose --env-file .env.production -f compose.production.yml ps --status running --services | grep -qx app; then
  echo "app must be stopped before restore" >&2
  exit 1
fi
docker compose --env-file .env.production -f compose.production.yml run --rm backup \
  node scripts/restore-database.js --file "$1" --confirm RESTORE
```

脚本要求操作者先执行 `docker compose stop app`，恢复后由操作者显式启动并检查 `/api/ready`。

- [ ] **Step 5: 实现 migration CLI**

`scripts/migrate-database.js` 使用 `createDatabase()`、`initializeDatabase()` 和 `finally db.close()`，成功输出版本与数据库 basename，不输出绝对路径。

- [ ] **Step 6: 验证并提交**

Run: `npm run test:ops -- --grep "database restore|migration CLI|restore production" --workers=1`

Expected: PASS。

```powershell
git add lib/database-backup.js scripts/restore-database.js scripts/migrate-database.js scripts/restore-production.sh tests/operations.spec.js
git commit -m "feat: restore database backups safely"
```

## Task 9: 非 root Docker、Caddy 与定时备份

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.production.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/systemd/socks-backup.service`
- Create: `deploy/systemd/socks-backup.timer`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 写基础设施契约红灯测试**

读取文件文本并断言：Dockerfile 使用 Node 22、`npm ci --omit=dev`、非 root `USER node` 和健康检查；Compose 不发布 app 端口、数据/上传/备份均持久化、Docker 日志 10m/5、Caddy 暴露 80/443；timer 为北京时间 03:30。

```js
test("defines a non-root production container stack", async () => {
  const dockerfile = await fs.readFile(path.join(rootDir, "Dockerfile"), "utf8");
  const compose = await fs.readFile(path.join(rootDir, "compose.production.yml"), "utf8");
  expect(dockerfile).toContain("FROM node:22-bookworm-slim");
  expect(dockerfile).toContain("USER node");
  expect(compose).not.toMatch(/app:[\s\S]*ports:/);
  expect(compose).toContain('max-size: "10m"');
});
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "production container stack" --workers=1`

Expected: FAIL，容器文件不存在。

- [ ] **Step 3: 创建 Dockerfile 与 ignore**

多阶段镜像只复制生产依赖、源码、静态资源和 migration/backup 脚本。创建 `/app/data`、`/app/uploads`、`/app/backups` 后转交 UID/GID 1000，再 `USER node`。健康检查使用：

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
```

`.dockerignore` 排除 Git、tests、test-results、data、backups、uploads、`.env*`，但显式保留 `.env.production.example` 只用于文档检查而不复制到镜像。

- [ ] **Step 4: 创建 Compose 与 Caddy**

`compose.production.yml` 顶层固定 `name: socks-store`，并定义 `app`、`caddy` 和 profile 为 `ops` 的 `backup`。`app` 使用 `${APP_IMAGE:?APP_IMAGE is required}`、`restart: unless-stopped`、`env_file: .env.production`、只 expose 4173。`backup` 复用同一镜像与数据卷，固定 `command: ["node", "scripts/backup-database.js"]`，不启动 HTTP 服务。Caddy 使用 `${STORE_DOMAIN}` 和固定内部 upstream `app:4173`，配置压缩、安全响应头和请求 ID 转发。

- [ ] **Step 5: 创建 systemd timer**

`socks-backup.service` 使用 `Type=oneshot`、固定 `WorkingDirectory=/opt/socks-store`，执行：

```text
/usr/bin/docker compose --env-file .env.production -f compose.production.yml --profile ops run --rm backup
```

`socks-backup.timer` 使用 `OnCalendar=*-*-* 03:30:00 Asia/Shanghai`、`Persistent=true`、`RandomizedDelaySec=5m`，避免重启后高频补跑。

- [ ] **Step 6: 本地构建验证**

Run: `docker build -t socks-store:operations-test .`

Run: `docker run --rm --entrypoint node socks-store:operations-test --version`

Expected: Node 22，容器构建成功。若 Docker 当前不可用，记录环境限制，但静态契约测试必须通过。

- [ ] **Step 7: 提交**

```powershell
git add Dockerfile .dockerignore compose.production.yml deploy/Caddyfile deploy/systemd tests/operations.spec.js
git commit -m "feat: containerize production storefront"
```

## Task 10: GitHub Actions 串行 CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `tests/operations.spec.js`
- Modify: `README.md`

- [ ] **Step 1: 写 CI 契约红灯测试**

断言 workflow 触发 PR/push，permissions 为只读，使用 Node 22，三个测试命令都显式 `--workers=1`，安装 Chromium，构建镜像并检查健康；不得出现生产 SSH/S3/Sentry secrets。

```js
test("keeps CI isolated and single-worker", async () => {
  const workflow = await fs.readFile(path.join(rootDir, ".github/workflows/ci.yml"), "utf8");
  expect(workflow).toContain("pull_request:");
  expect(workflow).toContain("npm run test:api -- --workers=1");
  expect(workflow).toContain("npm run test:ui -- --workers=1");
  expect(workflow).toContain("npm run test:ops -- --workers=1");
  expect(workflow).not.toContain("PRODUCTION_SSH_KEY");
});
```

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "CI isolated" --workers=1`

Expected: FAIL，CI workflow 不存在。

- [ ] **Step 3: 实现 CI workflow**

单个 job 串行执行 `npm ci`、`npx playwright install --with-deps chromium`、diff/UTF-8 检查、API、UI、ops、Docker build 和容器 readiness。concurrency：

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

仅授予 `contents: read`。容器健康检查注入明确的虚拟生产变量、临时数据目录和占位 HTTPS 域名，不读取 GitHub production secrets。健康检查循环最多 20 次、每次等待 3 秒，达到上限打印容器日志并失败。

- [ ] **Step 4: 文档化 CI**

README 说明 CI 全程单 worker、PR 不读取生产 secrets、不发布镜像，并记录本地等价命令。

- [ ] **Step 5: 验证并提交**

Run: `npm run test:ops -- --grep "CI isolated" --workers=1`

Expected: PASS。

```powershell
git add .github/workflows/ci.yml tests/operations.spec.js README.md
git commit -m "ci: verify production storefront"
```

## Task 11: 审批式生产部署与镜像回滚

**Files:**
- Create: `scripts/deploy-production.sh`
- Create: `.github/workflows/deploy-production.yml`
- Modify: `tests/operations.spec.js`
- Modify: `README.md`

- [ ] **Step 1: 写部署安全契约红灯测试**

断言手动 workflow 要求 40 位 SHA、`environment: production`、`cancel-in-progress: false`、GHCR SHA 标签、已通过 CI 检查、known_hosts secret、无 `ssh-keyscan`；部署脚本部署前备份、健康检查有界、失败恢复上一镜像且不恢复数据库。

- [ ] **Step 2: 运行红灯**

Run: `npm run test:ops -- --grep "production deployment" --workers=1`

Expected: FAIL，部署文件不存在。

- [ ] **Step 3: 实现主机部署脚本**

`scripts/deploy-production.sh` 使用 `set -Eeuo pipefail`，验证 `COMMIT_SHA` 和 `APP_IMAGE`。流程：

```bash
previous_image="$(docker inspect --format '{{.Config.Image}}' socks-store-app-1 2>/dev/null || true)"
docker compose --env-file .env.production -f compose.production.yml --profile ops run --rm backup
APP_IMAGE="$APP_IMAGE" docker compose --env-file .env.production -f compose.production.yml pull app
APP_IMAGE="$APP_IMAGE" docker compose --env-file .env.production -f compose.production.yml run --rm app node scripts/migrate-database.js
APP_IMAGE="$APP_IMAGE" docker compose --env-file .env.production -f compose.production.yml up -d app caddy
```

`wait_until_ready()` 最多 20 次、每次 3 秒访问 `http://127.0.0.1/api/ready`（由 Caddy 提供）。失败时若 previous_image 非空，以旧镜像重启 app 并再执行一次相同有界检查；绝不执行数据库降级。

- [ ] **Step 4: 实现 GitHub 部署 workflow**

workflow_dispatch 输入 `commit_sha`，首步用正则验证 40 位 hex，再用：

```bash
successful_runs="$(gh run list --workflow ci.yml --commit "$COMMIT_SHA" --status success --limit 1 --json databaseId --jq 'length')"
test "$successful_runs" = "1"
```

job 设置 `environment: production` 和：

```yaml
concurrency:
  group: production-deployment
  cancel-in-progress: false
```

使用官方 checkout/login/build-push actions 推送 `ghcr.io/<owner>/<repo>:<sha>`。SSH 使用 `PRODUCTION_SSH_KEY` 和 `PRODUCTION_SSH_KNOWN_HOSTS`，禁止运行 `ssh-keyscan`。工作流通过 `scp` 把 `compose.production.yml`、`deploy/Caddyfile` 和 `scripts/deploy-production.sh` 同步到 `/opt/socks-store` 的精确目标路径，再执行远端部署脚本；`.env.production`、数据、上传和备份目录永不被覆盖。VPS 预先以只读 token 登录 GHCR，workflow 不传递 registry token 到远端命令。

- [ ] **Step 5: 文档化首次部署与回滚**

README 列出 GitHub Environment secrets、VPS `/opt/socks-store` 权限、GHCR 只读登录、Caddy 域名 DNS、systemd timer 安装和手动回滚命令。

- [ ] **Step 6: 验证并提交**

Run: `npm run test:ops -- --grep "production deployment" --workers=1`

Run: `bash -n scripts/deploy-production.sh scripts/restore-production.sh`

Expected: 契约和 shell 语法 PASS。Windows 无 bash 时使用 Docker `bash:5` 镜像单次验证，不启动并发容器。

```powershell
git add scripts/deploy-production.sh .github/workflows/deploy-production.yml tests/operations.spec.js README.md
git commit -m "ci: deploy approved production releases"
```

## Task 12: 完整回归、恢复演练与运维验收

**Files:**
- Modify: `README.md`
- Modify: `tests/operations.spec.js`

- [ ] **Step 1: 补充端到端本地运维测试**

新增一个组合测试：创建源数据库、生成备份、上传到 fake S3、校验 archive、恢复到新路径，断言业务行完整且所有日志不含凭据。此测试完全使用临时目录和 fake client。

- [ ] **Step 2: 运行定向安全回归**

Run: `npm run test:api -- --grep "security|request id|ready|health" --workers=1`

Run: `npm run test:ops -- --grep "logs|Sentry|backup|restore|deployment|CI" --workers=1`

Expected: 全部 PASS。

- [ ] **Step 3: 运行完整单 worker 回归**

```powershell
npm run test:api -- --workers=1
npm run test:ui -- --workers=1
npm run test:ops -- --workers=1
git diff --check
```

Expected: 所有非跳过测试 PASS，无空白错误。

- [ ] **Step 4: 生产敏感值静态扫描**

Run:

```powershell
rg -n "BEGIN .*PRIVATE KEY|AKIA[0-9A-Z]{16}|sentry\.io/[0-9]+|SMTP_PASSWORD=.+|S3_SECRET_ACCESS_KEY=.+" . --glob '!package-lock.json' --glob '!docs/superpowers/**'
```

Expected: 无真实密钥命中；环境示例中的秘密变量值为空。

- [ ] **Step 5: Docker 单容器验收**

使用临时目录和非生产 secrets 启动 app 容器，断言：

```powershell
docker inspect --format '{{.Config.User}}' socks-store-operations-test
docker inspect --format '{{json .State.Health}}' socks-store-operations-test
```

Expected: 用户为 `node` 或 UID 1000，health 状态为 `healthy`。停止并删除本轮精确命名容器，不删除共享卷。

- [ ] **Step 6: 完成运维手册**

README 必须包含：首次部署、常规发布、备份状态检查、S3 对象检查、受控恢复、Sentry 验证、日志查询、健康检查、镜像回滚、生产 secrets 轮换和故障升级边界。所有示例使用占位域名和空密钥，不提供可误用的真实凭据。

- [ ] **Step 7: 清理测试产物并提交**

恢复测试 fixture JSON，只删除本轮明确创建的临时容器与上传/备份测试文件，确认 `git status --short` 后提交：

```powershell
git add README.md tests/operations.spec.js
git commit -m "docs: complete production operations runbook"
```

- [ ] **Step 8: 低频推送**

Run: `git push origin feature/socks-after-sales-payment-admin`

Expected: 成功推送。网络失败后等待并只允许一次重试；再次失败立即停止，不循环请求。

const { test, expect } = require("@playwright/test");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createConfig } = require("../lib/config");
const { createLogger } = require("../lib/logger");
const { createDatabase } = require("../lib/database");

function createProductionEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "4173",
    DATA_DIR: "data",
    CSRF_SECRET: "csrf-secret",
    SECURITY_HASH_SECRET: "hash-secret",
    PAYMENT_WEBHOOK_SECRET: "webhook-secret",
    ALLOWED_ORIGINS: "https://shop.example.com",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "mailer",
    SMTP_PASSWORD: "smtp-secret",
    SMTP_FROM: "shop@example.com",
    LOG_FORMAT: "json",
    SERVICE_VERSION: "3e45734",
    PUBLIC_BASE_URL: "https://shop.example.com",
    BACKUP_DIR: "backups",
    BACKUP_LOCAL_RETENTION_DAYS: "7",
    S3_REGION: "auto",
    S3_BUCKET: "socks-backups",
    S3_ACCESS_KEY_ID: "access-key",
    S3_SECRET_ACCESS_KEY: "secret-key",
    ...overrides
  };
}

test("requires complete production operations config", () => {
  expect(() => createConfig(createProductionEnv({ PUBLIC_BASE_URL: "" })))
    .toThrow("PUBLIC_BASE_URL is required in production");
  expect(() => createConfig(createProductionEnv({ LOG_FORMAT: "text" })))
    .toThrow("LOG_FORMAT must be json in production");
  expect(() => createConfig(createProductionEnv({ S3_BUCKET: "" })))
    .toThrow("S3_BUCKET is required in production");

  expect(createConfig(createProductionEnv())).toMatchObject({
    logFormat: "json",
    serviceVersion: "3e45734",
    publicBaseUrl: "https://shop.example.com",
    backup: {
      localRetentionDays: 7
    },
    sentry: {
      environment: "production"
    },
    s3: {
      bucket: "socks-backups",
      region: "auto",
      forcePathStyle: false
    }
  });
});

test("uses safe development operations defaults", () => {
  expect(createConfig({ NODE_ENV: "development" })).toMatchObject({
    logFormat: "text",
    serviceVersion: "development",
    publicBaseUrl: "",
    backup: {
      localRetentionDays: 7
    },
    sentry: {
      dsn: "",
      environment: "development"
    },
    s3: {
      endpoint: "",
      bucket: ""
    }
  });
});

test("writes redacted production JSON logs", () => {
  const lines = [];
  const circular = { statusCode: 200 };
  circular.self = circular;
  const logger = createLogger({
    level: "info",
    format: "json",
    baseContext: {
      environment: "production",
      serviceVersion: "abc123"
    },
    sink: (line) => lines.push(line),
    now: () => new Date("2026-08-04T00:00:00.000Z")
  });

  logger.debug("request.hidden", { statusCode: 100 });
  logger.info("request.completed", {
    requestId: "req-12345678",
    password: "password-secret",
    nested: {
      authorization: "Bearer authorization-secret",
      statusCode: 200
    },
    circular
  });

  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toEqual({
    timestamp: "2026-08-04T00:00:00.000Z",
    level: "info",
    event: "request.completed",
    environment: "production",
    serviceVersion: "abc123",
    requestId: "req-12345678",
    password: "[REDACTED]",
    nested: {
      authorization: "[REDACTED]",
      statusCode: 200
    },
    circular: {
      statusCode: 200,
      self: "[CIRCULAR]"
    }
  });
  expect(lines[0]).not.toContain("password-secret");
  expect(lines[0]).not.toContain("authorization-secret");
});

test("validates and propagates request ids", () => {
  const { createRequestContext } = require("../lib/http/request-context");
  const acceptedHeaders = {};
  const accepted = createRequestContext({
    headers: { "x-request-id": "edge-request-123" }
  }, {
    setHeader: (name, value) => { acceptedHeaders[name] = value; }
  }, {
    now: () => 1000,
    randomUUID: () => "generated-request-id"
  });

  expect(accepted.requestId).toBe("edge-request-123");
  expect(acceptedHeaders["X-Request-Id"]).toBe("edge-request-123");
  expect(accepted.complete(2000)).toEqual({ durationMs: 1000 });

  const generatedHeaders = {};
  const generated = createRequestContext({
    headers: { "x-request-id": "bad id" }
  }, {
    setHeader: (name, value) => { generatedHeaders[name] = value; }
  }, {
    now: () => 1000,
    randomUUID: () => "generated-request-id"
  });

  expect(generated.requestId).toBe("generated-request-id");
  expect(generatedHeaders["X-Request-Id"]).toBe("generated-request-id");
});

test("logs HTTP completion once without query parameters", () => {
  const {
    createRequestContext,
    attachRequestCompletionLog
  } = require("../lib/http/request-context");
  const response = new EventEmitter();
  response.statusCode = 201;
  response.setHeader = () => {};
  let currentTime = 1000;
  const requestContext = createRequestContext({ headers: {}, method: "POST" }, response, {
    now: () => currentTime,
    randomUUID: () => "generated-request-id"
  });
  const entries = [];

  attachRequestCompletionLog({
    request: { method: "POST" },
    response,
    requestUrl: new URL("https://shop.example.com/api/orders?token=hidden"),
    requestContext,
    logger: { info: (event, context) => entries.push({ event, context }) }
  });
  currentTime = 1045;
  response.emit("finish");
  response.emit("close");

  expect(entries).toEqual([{
    event: "http.request.completed",
    context: {
      requestId: "generated-request-id",
      method: "POST",
      route: "/api/orders",
      statusCode: 201,
      durationMs: 45
    }
  }]);
});

test("reports sanitized errors and degrades without a DSN", async () => {
  const { createErrorReporter } = require("../lib/monitoring/error-reporter");
  const captured = [];
  let initOptions;
  const sdk = {
    init: (options) => { initOptions = options; },
    captureException: (error, options) => captured.push({ error, options }),
    captureMessage: () => {},
    flush: async () => true
  };
  const reporter = createErrorReporter({
    dsn: "https://public@example.invalid/1",
    environment: "production",
    release: "abc123",
    sdk
  });

  reporter.captureException(new Error("boom"), {
    requestId: "req-12345678",
    cookie: "session-secret",
    route: "/api/orders"
  });
  expect(reporter.enabled).toBe(true);
  expect(initOptions).toEqual(expect.objectContaining({
    dsn: "https://public@example.invalid/1",
    environment: "production",
    release: "abc123",
    sendDefaultPii: false,
    tracesSampleRate: 0
  }));
  expect(captured[0].options.contexts.operation).toEqual({
    requestId: "req-12345678",
    cookie: "[REDACTED]",
    route: "/api/orders"
  });

  const filtered = initOptions.beforeSend({
    request: {
      data: { password: "request-secret" },
      headers: { authorization: "Bearer header-secret", accept: "application/json" }
    },
    user: { id: "user-1", email: "buyer@example.com", ip_address: "127.0.0.1" },
    extra: { token: "raw-token", statusCode: 500 }
  });
  expect(filtered.request.data).toBeUndefined();
  expect(filtered.request.headers.authorization).toBe("[REDACTED]");
  expect(filtered.user).toEqual({ id: "user-1" });
  expect(filtered.extra).toEqual({ token: "[REDACTED]", statusCode: 500 });

  const disabled = createErrorReporter({ dsn: "" });
  expect(disabled.enabled).toBe(false);
  expect(() => disabled.captureException(new Error("ignored"))).not.toThrow();
  await expect(disabled.flush(10)).resolves.toBe(true);
});

test("keeps local error logs when the reporter fails", () => {
  const lines = [];
  const reports = [];
  const logger = createLogger({
    format: "json",
    sink: (line) => lines.push(line),
    reportError: (event, context) => {
      reports.push({ event, context });
      throw new Error("monitor unavailable");
    }
  });

  expect(() => logger.error("checkout.failed", {
    requestId: "request-123",
    token: "raw-secret"
  })).not.toThrow();
  expect(lines).toHaveLength(1);
  expect(reports).toEqual([{
    event: "checkout.failed",
    context: {
      requestId: "request-123",
      token: "[REDACTED]"
    }
  }]);
});

test("closes the server once on repeated SIGTERM", async () => {
  const { registerServerLifecycle } = require("../lib/server-lifecycle");
  const processRef = new EventEmitter();
  processRef.exitCode = 0;
  let closes = 0;
  let flushes = 0;
  const dispose = registerServerLifecycle({
    processRef,
    server: {
      close: (callback) => {
        closes += 1;
        callback();
      },
      closeIdleConnections: () => {}
    },
    logger: { info: () => {}, error: () => {} },
    errorReporter: {
      captureException: () => {},
      flush: async () => {
        flushes += 1;
        return true;
      }
    },
    shutdownTimeoutMs: 50
  });

  processRef.emit("SIGTERM");
  processRef.emit("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));

  expect(closes).toBe(1);
  expect(flushes).toBe(1);
  expect(processRef.exitCode).toBe(0);
  dispose();
});

test("reports uncaught exceptions before bounded shutdown", async () => {
  const { registerServerLifecycle } = require("../lib/server-lifecycle");
  const processRef = new EventEmitter();
  processRef.exitCode = 0;
  const captured = [];
  let closes = 0;
  const dispose = registerServerLifecycle({
    processRef,
    server: {
      close: (callback) => {
        closes += 1;
        callback();
      },
      closeIdleConnections: () => {}
    },
    logger: { info: () => {}, error: () => {} },
    errorReporter: {
      captureException: (error, context) => captured.push({ error, context }),
      flush: async () => true
    },
    shutdownTimeoutMs: 50
  });
  const error = new Error("unexpected failure");

  processRef.emit("uncaughtException", error);
  await new Promise((resolve) => setImmediate(resolve));

  expect(processRef.exitCode).toBe(1);
  expect(closes).toBe(1);
  expect(captured).toEqual([{
    error,
    context: { source: "uncaughtException" }
  }]);
  dispose();
});

test("contains unhandled request errors at the HTTP boundary", async () => {
  const { createSafeRequestHandler } = require("../lib/http/request-boundary");
  const error = new Error("database unavailable");
  const captured = [];
  const logged = [];
  const responses = [];
  const response = {
    headersSent: false,
    getHeader: (name) => name === "X-Request-Id" ? "request-12345678" : undefined,
    destroy: () => { throw new Error("response should not be destroyed"); }
  };
  const safeHandler = createSafeRequestHandler({
    handleRequest: async () => { throw error; },
    sendError: (...args) => responses.push(args),
    logger: { error: (event, context) => logged.push({ event, context }) },
    errorReporter: {
      captureException: (reportedError, context) => captured.push({ reportedError, context })
    }
  });

  await safeHandler({ url: "/api/orders?token=hidden" }, response);

  expect(captured).toEqual([{
    reportedError: error,
    context: {
      requestId: "request-12345678",
      route: "/api/orders"
    }
  }]);
  expect(logged).toEqual([{
    event: "http.request.unhandled",
    context: {
      requestId: "request-12345678",
      route: "/api/orders",
      name: "Error"
    }
  }]);
  expect(responses).toEqual([[
    response,
    500,
    "INTERNAL_ERROR",
    "Unexpected server error."
  ]]);
});

test("creates an integrity-checked compressed SQLite backup", async ({}, testInfo) => {
  const {
    createDatabaseBackup,
    verifyBackupArchive
  } = require("../lib/database-backup");
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

  expect(path.basename(result.archivePath))
    .toBe("socks-store-20260804T033000Z-abc1234.db.gz");
  expect(await fs.readFile(result.checksumPath, "utf8"))
    .toBe(`${result.sha256}  ${path.basename(result.archivePath)}\n`);
  expect(result.integrity).toBe("ok");
  await expect(verifyBackupArchive({
    archivePath: result.archivePath,
    checksumPath: result.checksumPath,
    workingDir: backupDir
  })).resolves.toMatchObject({
    integrity: "ok",
    sha256: result.sha256
  });
  await expect(fs.access(`${backupDir}/socks-store-20260804T033000Z-abc1234.db.partial`))
    .rejects.toThrow();
});
